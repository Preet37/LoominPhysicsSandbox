/**
 * Speech-to-text for lecture recordings.
 *
 * Video and audio uploads previously fell through to `buffer.toString("utf-8")`,
 * which hands an LLM a few thousand characters of binary noise and produces
 * confident nonsense. This turns them into a real transcript first.
 *
 * Whisper is served through the Groq key the app already uses, so no new
 * credential is required. Groq accepts the container directly — an .mp4 with an
 * H.264 video track transcribes without any local demuxing, which matters
 * because the deployment target has no ffmpeg.
 */

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Turbo is ~2x faster than whisper-large-v3 at materially the same accuracy for
 * lecture speech, and transcription sits on the critical path of an upload the
 * user is watching.
 */
const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";

/**
 * Groq rejects uploads past 25 MB on the free tier. Catching it here produces a
 * sentence the user can act on instead of a 413 surfaced as "analysis failed".
 */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_EXTENSIONS = [
  ".mp4", ".m4a", ".mov", ".webm", ".mkv", ".avi",
  ".mp3", ".wav", ".flac", ".ogg", ".oga", ".mpga", ".mpeg",
];

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  durationSec: number;
}

export class MediaTooLargeError extends Error {}
export class TranscriptionUnavailableError extends Error {}

export function isMediaFile(fileName: string, mimeType = ""): boolean {
  const lower = fileName.toLowerCase();
  if (MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return mimeType.startsWith("video/") || mimeType.startsWith("audio/");
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Transcribes an audio or video buffer to text with segment timings. */
export async function transcribeMedia(
  buffer: Buffer,
  fileName: string,
  mimeType = "application/octet-stream",
): Promise<Transcript> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TranscriptionUnavailableError(
      "Transcription is not configured on this deployment (GROQ_API_KEY is unset).",
    );
  }

  if (buffer.length > MAX_MEDIA_BYTES) {
    const mb = (buffer.length / 1024 / 1024).toFixed(0);
    throw new MediaTooLargeError(
      `That file is ${mb} MB and the transcription limit is ${MAX_MEDIA_BYTES / 1024 / 1024} MB. ` +
        `Export the audio track on its own — an hour of speech is only a few MB as .m4a — and upload that instead.`,
    );
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  form.append("model", TRANSCRIBE_MODEL);
  // Segments carry timings, which is what lets generated notes cite the moment
  // in the lecture a concept was introduced.
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 413) {
      throw new MediaTooLargeError("The transcription service rejected the file as too large.");
    }
    throw new TranscriptionUnavailableError(
      `Transcription failed (${res.status}). ${detail.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    text?: string;
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  const segments: TranscriptSegment[] = (data.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: String(s.text || "").trim(),
  }));

  return {
    text: String(data.text || "").trim(),
    segments,
    durationSec: Number(data.duration) || segments.at(-1)?.end || 0,
  };
}

/**
 * Renders a transcript for the note generator, with a timestamp roughly every
 * `chunkSeconds`. Per-segment stamps are too dense to be useful and eat context;
 * a marker every half minute is enough to point a student back at the recording.
 */
export function formatTranscriptForNotes(transcript: Transcript, chunkSeconds = 30): string {
  if (!transcript.segments.length) return transcript.text;

  const lines: string[] = [];
  let bucketStart = transcript.segments[0].start;
  let bucket: string[] = [];

  const flush = () => {
    if (bucket.length) lines.push(`[${mmss(bucketStart)}] ${bucket.join(" ")}`);
    bucket = [];
  };

  for (const seg of transcript.segments) {
    if (seg.start - bucketStart >= chunkSeconds) {
      flush();
      bucketStart = seg.start;
    }
    bucket.push(seg.text);
  }
  flush();

  return lines.join("\n");
}
