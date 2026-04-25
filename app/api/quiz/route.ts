/**
 * /api/quiz
 * Generates multiple-choice physics quiz questions from notes.
 * Each question has 4 options with one correct answer and a clear explanation.
 */

import { NextResponse } from "next/server";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const QUIZ_SYSTEM = `You are a physics quiz generator. Create exactly the requested number of multiple-choice questions from the provided physics notes.

Each question must:
- Test genuine conceptual understanding, not just memorization
- Have exactly 4 options (A, B, C, D)
- Have exactly one correct answer
- Include a clear explanation of WHY the answer is correct

Output ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "What happens to the power output of a wind turbine if wind speed doubles?",
      "options": ["It doubles", "It quadruples", "It increases by 8x", "It stays the same"],
      "correctIndex": 2,
      "explanation": "Wind turbine power follows P = 0.5·ρ·A·v³·Cp. Since power scales with v³, doubling wind speed increases power by 2³ = 8x.",
      "difficulty": "medium",
      "concept": "Power scaling with wind speed"
    }
  ]
}

RULES:
- correctIndex is 0-based (0=A, 1=B, 2=C, 3=D)
- Vary difficulty: mix easy/medium/hard questions
- Make wrong answers plausible (not obviously wrong)
- Focus on the physics in the notes, not generic facts
- Output ONLY JSON — no markdown, no explanation outside JSON`;

export async function POST(req: Request) {
  try {
    const { notes, topic, count = 5, difficulty = "mixed" } = await req.json();

    if (!notes?.trim() && !topic) {
      return NextResponse.json({ error: "Notes or topic required" }, { status: 400 });
    }

    const prompt = `Generate exactly ${count} multiple-choice physics quiz questions.
${difficulty !== "mixed" ? `Difficulty level: ${difficulty}` : "Mix of easy, medium, and hard."}
Topic: ${topic || "the physics concepts in the notes"}

Notes to base questions on:
${(notes || "").slice(0, 2500)}

Generate ${count} questions now:`;

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: QUIZ_SYSTEM }, { role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed: { questions?: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { questions: [] };
    }

    return NextResponse.json({ questions: parsed.questions || [] });
  } catch (err) {
    console.error("[quiz]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
