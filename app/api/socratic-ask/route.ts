/**
 * /api/socratic-ask
 *
 * Teaching mode: AI asks guiding questions instead of answering directly.
 * Inspired by SocraticTutor's methodology — the AI probes reasoning,
 * surfaces misconceptions, and builds understanding through dialogue.
 *
 * Supports two modes:
 *   mode: "answer"  — direct physics expert answer (existing behavior)
 *   mode: "teach"   — Socratic dialogue: questions, hints, guided discovery
 */

import { NextResponse } from "next/server";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_FAST = "nvidia/llama-3.1-nemotron-nano-8b-v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_FAST = "llama-3.1-8b-instant";

export async function POST(req: Request) {
  const {
    question,
    simConfig,
    currentParams,
    conversationHistory = [],
    mode = "answer",
    notes = "",
  } = await req.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  const simContext = simConfig
    ? `Simulation: ${simConfig.displayName || simConfig.simType}
Parameters: ${Object.entries(currentParams || {}).map(([k, v]) => `${k}=${v}`).join(", ")}
Constraints: ${(simConfig.constraints || []).map((c: { param: string; warningThreshold: number; criticalThreshold: number }) => `${c.param} warns at ${c.warningThreshold}, fails at ${c.criticalThreshold}`).join("; ")}`
    : "No simulation loaded.";

  const notesContext = notes
    ? `\n\nReference notes (from student's own notebook):\n${notes.slice(0, 1500)}`
    : "";

  const systemPrompt =
    mode === "teach"
      ? `You are a Socratic physics tutor inside Loomin — a live physics simulation sandbox.

${simContext}${notesContext}

Your role is to TEACH through questioning, not lecturing:
1. Never give the full answer directly. Instead, ask a probing question that guides the student toward it.
2. Acknowledge what the student got right before challenging what they got wrong.
3. If they're stuck, give a small hint pointing to the relevant physics principle or equation.
4. Ask ONE focused question at a time — not three at once.
5. Use the simulation parameters to make questions concrete ("What do you think happens when Wind_Speed goes from 12 to 35 m/s?")
6. After 3-4 exchanges, offer to confirm their understanding with a "check" question.
7. Reference real-world physics: cite actual numbers, equations, historical examples.
8. Keep responses to 3-5 sentences max. End with a question.

If the student already understands a concept, deepen their thinking: ask about edge cases, failure modes, real-world applications.`
      : `You are Loomin's embedded physics expert — a concise, sharp tutor inside a live simulation sandbox.

${simContext}${notesContext}

Rules:
- Answer in 3-5 sentences max. Be specific: cite equations, SI units, real numbers.
- If relevant, suggest a parameter value to try to see interesting physics.
- If the user asks why something broke, explain the exact physics constraint violated.
- Use LaTeX notation for equations where helpful.
- Don't use markdown headers — plain text or short bullets only.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-8).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const maxTokens = mode === "teach" ? 400 : 350;

  try {
    let answer: string | null = null;

    if (process.env.NVIDIA_API_KEY) {
      try {
        const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
          body: JSON.stringify({ model: NVIDIA_FAST, messages, temperature: mode === "teach" ? 0.6 : 0.4, max_tokens: maxTokens }),
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const data = await res.json();
          answer = data.choices?.[0]?.message?.content || null;
        }
      } catch { /* timeout or error — fall through to Groq */ }
    }

    if (!answer && process.env.GROQ_API_KEY) {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: GROQ_FAST, messages, temperature: mode === "teach" ? 0.6 : 0.4, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      answer = data.choices?.[0]?.message?.content || null;
    }

    if (!answer) answer = "I couldn't get a response right now. Please try again.";

    return NextResponse.json({ answer, mode });
  } catch (err) {
    console.error("[socratic-ask]", err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
