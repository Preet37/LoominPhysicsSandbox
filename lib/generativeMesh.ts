/**
 * Generative 3D via fal.ai — the "hero object" path.
 *
 * OpenSCAD/Blender build engineered geometry: exact, parametric, and reliably
 * ugly. That is the right tool for a gearbox and the wrong one for "F1 car",
 * where what matters is that it reads as the thing. This module covers the
 * second case using Hunyuan3D, whose weights are open and whose output is a
 * textured GLB the editor can already load.
 *
 * The generation is deliberately split in two:
 *
 *   topic ──► concept image (~3s, ~$0.005) ──► textured mesh (~130s, ~$0.40)
 *
 * The shape model is image-conditioned — there is no text input — so an image
 * step is mandatory rather than a convenience. That turns out to be the useful
 * property: a bad concept image always produces a bad mesh, so showing the
 * image first lets a human reject it for half a cent instead of finding out two
 * minutes and forty cents later. Every caller should surface the image before
 * committing to the mesh.
 *
 * Endpoint shapes below are taken from @fal-ai/client 1.10.1 source rather than
 * docs: submit to https://queue.fal.run/{appId}, poll
 * /requests/{id}/status, collect /requests/{id}, auth "Authorization: Key ...".
 */

import type { SpecSheet } from "./specSheet";

const FAL_QUEUE = "https://queue.fal.run";

/** Text→image. Schnell is the cheap/fast tier — this frame is a means, not the product. */
const IMAGE_MODEL = "fal-ai/flux/schnell";

/** Image→textured mesh. */
const MESH_MODEL = "fal-ai/hunyuan3d/v2/turbo";

/**
 * Matches the demo settings that produced usable geometry. Lower values are
 * visibly mushier on hard-surface objects, which is most of this app.
 */
export const MESH_DEFAULTS = {
  num_inference_steps: 100,
  octree_resolution: 512,
  guidance_scale: 5,
  textured_mesh: true,
} as const;

/**
 * The editor renders a live physics scene alongside the model, so a raw
 * half-million-face mesh is not affordable. Hunyuan3D decimates server-side in
 * about six seconds, and 10k matches what the existing Tripo path already
 * requested.
 */
export const TARGET_FACES = 10_000;

export interface ConceptImage {
  url: string;
  prompt: string;
}

export interface GeneratedMesh {
  glbBase64: string;
  /** Present when the provider reports it; used for cost/quality telemetry. */
  faces: number | null;
  seed: number;
}

export class GenerativeUnavailableError extends Error {}

export function isGenerativeConfigured(): boolean {
  return !!process.env.FAL_KEY;
}

function requireKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new GenerativeUnavailableError(
      "Generative 3D is not configured on this deployment.",
    );
  }
  return key;
}

/**
 * Same topic must yield the same model forever, or the library cache is
 * pointless and every cold start looks like a different product. A hash of the
 * topic gives a stable seed without storing one.
 */
export function seedForTopic(topic: string): number {
  let h = 2166136261;
  for (let i = 0; i < topic.length; i++) {
    h ^= topic.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2_147_483_647;
}

/**
 * Proportions are the one thing the spec sheet can still contribute here. The
 * mesh gets normalised to a fixed display size downstream, so absolute
 * millimetres are discarded — but the *ratios* between parts survive, and a
 * 747 with a stubby wing is the failure mode that reads as wrong.
 */
function proportionHints(spec: SpecSheet | null | undefined): string {
  if (!spec?.dimensions?.length) return "";
  const byKey = (re: RegExp) =>
    spec.dimensions.find((d) => re.test(d.key) || re.test(d.label));

  const length = byKey(/overall.?length|total.?length|^length$/i);
  const width = byKey(/wingspan|overall.?width|^width$/i);
  const height = byKey(/overall.?height|^height$/i);
  if (!length?.value) return "";

  const parts: string[] = [];
  if (width?.value) parts.push(`width ${(width.value / length.value).toFixed(2)}x its length`);
  if (height?.value) parts.push(`height ${(height.value / length.value).toFixed(2)}x its length`);
  if (!parts.length) return "";
  return `Correct proportions: ${parts.join(", ")}.`;
}

/**
 * The mesh model reconstructs whatever the image shows, including the lighting
 * and the camera. A dramatic three-quarter hero render bakes perspective
 * distortion into the geometry, so the prompt asks for the flattest, most
 * neutral presentation available.
 */
export function buildImagePrompt(topic: string, spec?: SpecSheet | null): string {
  const reference = spec?.referenceProduct ? ` modelled on a ${spec.referenceProduct}` : "";
  const hints = proportionHints(spec);
  return [
    `A single complete ${topic}${reference}, centered, entire object visible.`,
    hints,
    "Three-quarter view, even studio lighting, plain white background,",
    "no shadow, no ground plane, no text, no watermark, no people,",
    "product photography, sharp focus, physically accurate.",
  ]
    .filter(Boolean)
    .join(" ");
}

interface QueueSubmit {
  request_id?: string;
  detail?: string;
}

async function falSubmit(model: string, input: unknown): Promise<string> {
  const res = await fetch(`${FAL_QUEUE}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as QueueSubmit;
  if (!res.ok || !body.request_id) {
    throw new Error(
      `fal submit failed (${res.status}) for ${model}: ${body.detail || "no request_id returned"}`,
    );
  }
  return body.request_id;
}

/** fal's status/result paths are keyed by owner/alias, dropping any sub-path of the model id. */
function baseAppId(model: string): string {
  const [owner, alias] = model.split("/");
  return `${owner}/${alias}`;
}

async function falPoll<T>(model: string, requestId: string, budgetMs: number): Promise<T> {
  const base = `${FAL_QUEUE}/${baseAppId(model)}/requests/${requestId}`;
  const key = requireKey();
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${base}/status`, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const status = (await res.json().catch(() => ({}))) as { status?: string };

    if (status.status === "COMPLETED") {
      const out = await fetch(base, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!out.ok) throw new Error(`fal result fetch failed (${out.status})`);
      return (await out.json()) as T;
    }
    if (status.status === "FAILED") {
      throw new Error(`fal job failed for ${model}`);
    }
    // IN_QUEUE / IN_PROGRESS — texture generation alone runs ~105s, so poll
    // slowly enough not to spend the budget on status checks.
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`fal job timed out after ${Math.round(budgetMs / 1000)}s`);
}

/** Cheap, previewable first half. Show this to the user before spending on a mesh. */
export async function generateConceptImage(
  topic: string,
  spec?: SpecSheet | null,
): Promise<ConceptImage> {
  const prompt = buildImagePrompt(topic, spec);
  const requestId = await falSubmit(IMAGE_MODEL, {
    prompt,
    image_size: "square_hd",
    num_images: 1,
    seed: seedForTopic(topic),
  });
  const out = await falPoll<{ images?: { url?: string }[] }>(IMAGE_MODEL, requestId, 90_000);
  const url = out.images?.[0]?.url;
  if (!url) throw new Error("fal returned no concept image");
  return { url, prompt };
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`GLB download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) throw new Error("GLB download was empty");
  return buf.toString("base64");
}

/** Expensive second half — only call once a human (or a scorer) has accepted the image. */
export async function generateMeshFromImage(
  imageUrl: string,
  opts: { topic: string; budgetMs?: number } ,
): Promise<GeneratedMesh> {
  const seed = seedForTopic(opts.topic);
  const requestId = await falSubmit(MESH_MODEL, {
    input_image_url: imageUrl,
    seed,
    target_face_num: TARGET_FACES,
    ...MESH_DEFAULTS,
  });
  const out = await falPoll<{
    model_mesh?: { url?: string; file_size?: number };
    mesh?: { url?: string };
  }>(MESH_MODEL, requestId, opts.budgetMs ?? 300_000);

  const url = out.model_mesh?.url || out.mesh?.url;
  if (!url) throw new Error("fal returned no mesh URL");
  return { glbBase64: await fetchAsBase64(url), faces: null, seed };
}
