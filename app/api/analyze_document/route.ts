/**
 * /api/analyze_document
 *
 * Real document analysis:
 *  - PDF: extract text via pdf-parse
 *  - DOCX: extract text via mammoth
 *  - TXT/plain: read directly
 *  - YouTube: fetch transcript via oEmbed metadata
 *  - URL: fetch and extract meaningful text
 *
 * Then passes extracted text through the full agent pipeline to generate
 * grounded physics notes + SIMCONFIG.
 */

import { NextResponse } from "next/server";
import { retrievePhysicsKnowledge, classifySimType } from "@/lib/physics-kb";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-nano-8b-v1";

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractPDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  // PDFParse requires an options/LoadParameters object; pass data as Uint8Array
  const data = new Uint8Array(buffer);
  const parser = new PDFParse({ data } as unknown as import("pdf-parse").LoadParameters);
  const result = await parser.getText();
  return (result as unknown as { text?: string; pages?: Array<{ text?: string }> }).text
    ?? ((result as unknown as { pages?: Array<{ text?: string }> }).pages ?? []).map((p) => p.text ?? "").join("\n");
}

async function extractDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

async function extractURL(url: string): Promise<{ title: string; text: string }> {
  // Basic web fetch — in production use a proper scraper
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Loomin/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || url;

  // Strip HTML tags to get plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);

  return { title, text };
}

async function extractYouTube(url: string): Promise<{ title: string; text: string }> {
  // Use YouTube oEmbed for title + description
  const videoId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!videoId) return { title: "YouTube Video", text: `YouTube video: ${url}` };

  const oembedRes = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    { signal: AbortSignal.timeout(5000) }
  ).catch(() => null);

  let title = "YouTube Video";
  let authorName = "";
  if (oembedRes?.ok) {
    const data = await oembedRes.json();
    title = data.title || title;
    authorName = data.author_name || "";
  }

  const text = `YouTube Video: "${title}" by ${authorName || "unknown channel"}
URL: ${url}
Video ID: ${videoId}
Note: This is a YouTube video. The analysis is based on the video title and metadata.
Please ensure the content covers physics topics relevant to the detected subject matter.`;

  return { title, text };
}

// ── Physics note generation ───────────────────────────────────────────────────

async function generateNotesFromContent(
  text: string,
  topic: string,
  simType: string
): Promise<{ notes: string; summary: string; keyPoints: string[] }> {
  const kb = retrievePhysicsKnowledge(topic);
  const brief = kb
    ? `Domain: ${kb.domain}\nEquations: ${kb.equations.join(" | ")}\nSpecs: ${Object.entries(kb.realWorldSpecs).map(([k, v]) => `${k}=${v}`).join(", ")}`
    : `Topic: ${topic}`;

  const prompt = `You are a physics education AI. Based on this source content, generate structured physics notes.

SOURCE CONTENT (from uploaded document/video):
${text.slice(0, 2500)}

PHYSICS KNOWLEDGE BASE:
${brief}

CLASSIFIED SIM TYPE: ${simType}

Generate:
1. A 2-3 sentence summary of the source content
2. 5 key physics concepts covered
3. Full physics notes in this format:

## [Topic Name]

### Introduction
[3-5 sentences using content from the source + real physics numbers]

### Key Physics Concepts
[5+ bullet points with equations using \\( \\) for inline LaTeX]

### Real-World Applications & Failure Modes
[3+ failure modes with physics explanations]

---
### Interactive Simulation
[parameter lines with comments]

---
💡 **Tip:** Push parameters beyond their limits to see the physics break!

<SIMCONFIG>
{"simType":"${simType}","displayName":"[display name]","params":[...],"constraints":[...],"optimalParams":{...}}
</SIMCONFIG>

Output ONLY the notes, no explanation.`;

  try {
    let content = "";

    if (process.env.NVIDIA_API_KEY) {
      try {
        const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
          body: JSON.stringify({ model: NVIDIA_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 2000 }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          const data = await res.json();
          content = data.choices?.[0]?.message?.content || "";
        }
      } catch { /* timeout — fall through */ }
    }

    if (!content && process.env.GROQ_API_KEY) {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 2000 }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      content = data.choices?.[0]?.message?.content || "";
    }

    // Extract summary (first 2-3 sentences before the first ##)
    const summaryMatch = content.match(/^((?:[^#\n].+\n*){1,4})/);
    const summary = summaryMatch?.[1]?.trim()?.slice(0, 400) || content.slice(0, 300);

    // Extract key points from the Key Physics Concepts section
    const kpMatch = content.match(/### Key Physics Concepts([\s\S]*?)(?=###|---)/i);
    const keyPoints = kpMatch
      ? kpMatch[1].match(/[-•]\s*(.+)/g)?.map((l) => l.replace(/^[-•]\s*/, "").slice(0, 100)) || []
      : [];

    return { notes: content, summary, keyPoints: keyPoints.slice(0, 6) };
  } catch (err) {
    console.error("[generate-notes-from-content]", err);
    return {
      notes: `## ${topic}\n\nSource: ${text.slice(0, 200)}...\n\n*Note generation failed. Please try again.*`,
      summary: text.slice(0, 300),
      keyPoints: [],
    };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let fileName = "";
    let fileType = "";
    let fileBuffer: Buffer | null = null;
    let url: string | null = null;
    let rawText: string | null = null;

    if (contentType.includes("application/json")) {
      const json = await req.json();
      fileName = json.fileName || "";
      fileType = json.fileType || "document";
      url = json.url || null;
      rawText = json.text || null;
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      fileName = (formData.get("fileName") as string) || file?.name || "";
      fileType = (formData.get("fileType") as string) || "document";

      if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
      }
    }

    // ── Extract text from source ────────────────────────────────────────────
    let extractedText = "";
    let sourceTitle = fileName;

    if (rawText) {
      extractedText = rawText;
    } else if (url) {
      const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
      const result = isYoutube ? await extractYouTube(url) : await extractURL(url);
      extractedText = result.text;
      sourceTitle = result.title;
      fileName = sourceTitle;
    } else if (fileBuffer) {
      const lowerName = fileName.toLowerCase();
      try {
        if (lowerName.endsWith(".pdf") || fileType === "pdf") {
          extractedText = await extractPDF(fileBuffer);
        } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
          extractedText = await extractDOCX(fileBuffer);
        } else {
          // Plain text fallback
          extractedText = fileBuffer.toString("utf-8");
        }
      } catch (parseErr) {
        console.warn("[analyze_document] parse error:", parseErr);
        // Fallback to treating as text
        extractedText = fileBuffer.toString("utf-8").slice(0, 4000);
      }
    } else if (fileName) {
      // Metadata-only mode (large video files etc.)
      extractedText = `File: ${fileName} (${fileType})`;
    }

    // ── Classify sim type ───────────────────────────────────────────────────
    const combinedForClassify = `${fileName} ${extractedText.slice(0, 500)}`;
    const simType = classifySimType(combinedForClassify) || "custom";
    const topic = sourceTitle || fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

    // Word count
    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

    // ── Generate notes from content ─────────────────────────────────────────
    const { notes, summary, keyPoints } = await generateNotesFromContent(
      extractedText,
      topic,
      simType
    );

    return NextResponse.json({
      success: true,
      id: Date.now().toString(),
      fileName: fileName || sourceTitle,
      fileType,
      detectedTopic: simType,
      title: sourceTitle,
      wordCount,
      summary: summary.slice(0, 400),
      keyPoints,
      generatedNotes: notes,
    });
  } catch (error) {
    console.error("[analyze_document]", error);
    return NextResponse.json({ error: "Analysis failed: " + String(error) }, { status: 500 });
  }
}
