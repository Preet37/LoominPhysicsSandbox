/**
 * /api/compile-wiki
 *
 * Karpathy LLM Wiki Pattern: takes all journal notes and compiles them
 * into a structured, interconnected wiki article with:
 *  - Summary of the topic
 *  - Key concepts with definitions
 *  - Equations and physical principles
 *  - Related topics / backlinks
 *  - Knowledge connections across all journals
 */

import { NextResponse } from "next/server";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_THINKING = "meta/llama-3.1-405b-instruct";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function callLLM(system: string, user: string, maxTokens = 3000): Promise<string> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  if (process.env.NVIDIA_API_KEY) {
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(90_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: NVIDIA_THINKING, messages, temperature: 0.4, max_tokens: maxTokens }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch { /* timeout — fall through to Groq */ }
  }

  if (process.env.GROQ_API_KEY) {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, max_tokens: maxTokens }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }
  }

  throw new Error("No LLM provider available");
}

const WIKI_SYSTEM = `You are a physics knowledge base compiler. Your job is to compile physics notes into a structured wiki article.

Output a JSON object with EXACTLY this schema (all string values — no LaTeX backslash sequences like \\frac inside strings, use plain unicode math like T = 2π√(L/g) instead):
{
  "title": "Full topic title",
  "categories": ["category1", "category2"],
  "content": "Full markdown content — 400-800 words. Include introduction, key principles, physical intuition. Write equations in plain text like: T = 2*pi*sqrt(L/g) or E = mc^2",
  "keyTerms": [
    { "term": "Term name", "definition": "One-sentence definition" }
  ],
  "relatedTopics": ["topic1", "topic2"],
  "connections": [
    { "from": "this topic", "relationship": "uses the same equations as", "to": "related topic" }
  ],
  "summary": "2-3 sentence executive summary"
}

CRITICAL RULES:
- Output ONLY valid JSON — no markdown fences, no explanation, no LaTeX backslashes
- Write math as plain text (T = 2pi*sqrt(L/g), F = ma, E = hf) — NOT as LaTeX
- Include at least 4 key terms, 3 related topics, 2 connections
- The content must be a genuine encyclopedia article, not a copy of the notes`;

export async function POST(req: Request) {
  try {
    const { journals, focusTopic } = await req.json();

    if (!journals?.length) {
      return NextResponse.json({ error: "No journals provided" }, { status: 400 });
    }

    // Build a combined digest — primary journal gets full content, related ones get excerpts
    const cleanContent = (text: string, maxChars: number) =>
      (text || "")
        .replace(/SIMCONFIG[\s\S]*?(\{[\s\S]*?\})/g, "") // strip SIMCONFIG blocks
        .replace(/<simconfig>[\s\S]*?<\/simconfig>/gi, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim()
        .slice(0, maxChars);

    const [primaryJournal, ...relatedJournals] = journals;

    const primaryContent = cleanContent(primaryJournal?.editorValue || "", 2400);
    const relatedDigests = relatedJournals
      .filter((j: { topic?: string; editorValue?: string; name?: string }) => j.topic && j.editorValue)
      .slice(0, 4)
      .map((j: { topic?: string; name?: string; editorValue?: string }) =>
        `### ${j.topic || j.name}\n${cleanContent(j.editorValue || "", 300)}`
      );

    const primaryTopic = focusTopic || primaryJournal?.topic || primaryJournal?.name || "Physics";
    const relatedTopicsStr = relatedJournals.map((j: { topic?: string; name?: string }) => j.topic || j.name).filter(Boolean).join(", ");

    const userPrompt = `Compile a focused wiki article for: "${primaryTopic}"
${relatedTopicsStr ? `\nRelated topics in this knowledge base: ${relatedTopicsStr}` : ""}

PRIMARY NOTES (main content source):
${primaryContent || "No notes available — generate based on physics knowledge of this topic."}
${relatedDigests.length > 0 ? `\n\nRELATED TOPICS (for cross-connections only):\n${relatedDigests.join("\n\n")}` : ""}

Generate a wiki article focused entirely on "${primaryTopic}". Output JSON now:`;

    const raw = await callLLM(WIKI_SYSTEM, userPrompt, 2800);

    // Extract JSON from response — try multiple strategies
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM did not return valid JSON");
    }

    // Strategy 1: direct parse
    // Strategy 2: sanitize bare backslash sequences that are invalid in JSON
    // Strategy 3: aggressively strip all problematic content
    let article: Record<string, unknown>;
    const rawJson = jsonMatch[0];

    const tryParse = (s: string) => {
      // Only runs when direct JSON.parse already failed (i.e. the JSON has lone
      // backslashes like \pi, \frac, \Delta). Double them so JSON.parse can work.
      // Note: if JSON was already valid (had \\pi), the direct parse above would
      // have succeeded and this function would never be called.
      const sanitized = s.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(sanitized);
    };

    try {
      article = JSON.parse(rawJson);
    } catch {
      try {
        article = tryParse(rawJson);
      } catch {
        // Last resort: extract individual fields with regex
        const title = raw.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || "Physics Article";
        const summary = raw.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || "";
        const contentMatch = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const content = contentMatch?.[1]?.replace(/\\n/g, "\n") || raw.slice(0, 500);
        article = { title, summary, content, categories: [], keyTerms: [], relatedTopics: [], connections: [] };
      }
    }
    article.compiledAt = new Date().toISOString();

    return NextResponse.json({ article });
  } catch (err) {
    console.error("[compile-wiki]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
