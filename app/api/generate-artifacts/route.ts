/**
 * /api/generate-artifacts
 *
 * Given physics notes + simType, generates:
 *  1. A standalone Python (NumPy + Matplotlib) simulation script
 *  2. A structured JSON list of key equations with descriptions
 *
 * Uses the fast model (Groq llama-3.3-70b or NVIDIA Nano) for speed.
 */

import { NextResponse } from "next/server";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_FAST = "nvidia/llama-3.1-nemotron-nano-8b-v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function callLLM(prompt: string, maxTokens = 2500): Promise<string> {
  const messages = [{ role: "user", content: prompt }];

  if (process.env.NVIDIA_API_KEY) {
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: NVIDIA_FAST, messages, temperature: 0.3, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(15000),
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.3, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }
  }

  throw new Error("No LLM provider available");
}

const PYTHON_SYSTEM = `You are a scientific Python coder. Generate a complete, runnable Python simulation script.

Requirements:
- Use ONLY: numpy, scipy, matplotlib (all available in Pyodide)
- Dark-themed plots: facecolor='#070a0f', axes background='#0b1220', white/light axis labels
- Print key numerical results with units
- plt.show() at the end of each figure
- Realistic physics constants and calculations based on the notes
- The script must be 60-150 lines
- Use the actual parameter values from the notes
- Include meaningful simulation results, not just plot reproductions
- Do NOT include install commands (pip install etc.)
- Output ONLY the Python code, no explanation, no markdown fence`;

const EQUATIONS_SYSTEM = `You are a physics equation extractor. Extract all key equations from the physics notes.

For each equation output a JSON object with these fields:
- name: short descriptive name (e.g. "Betz Power Limit", "Tsiolkovsky Equation")
- latex: the LaTeX representation of the equation
- description: one sentence explaining what the equation means in plain English
- variables: string listing each variable with unit (e.g. "P = power [W], ρ = density [kg/m³]")
- physicalMeaning: what physical principle or law this embodies
- verified: true (mark all as verified)

Output ONLY valid JSON array. No explanation, no markdown.`;

export async function POST(req: Request) {
  try {
    const { notes, simType, topic, params } = await req.json();

    if (!notes?.trim()) {
      return NextResponse.json({ error: "Notes required" }, { status: 400 });
    }

    const trimmedNotes = notes.slice(0, 3000); // Don't send more than needed

    // Generate both in parallel
    const [pythonResult, equationsResult] = await Promise.allSettled([
      callLLM(
        `${PYTHON_SYSTEM}\n\nPhysics topic: ${topic || simType}\nSim type: ${simType}\nCurrent parameters: ${JSON.stringify(params || {})}\n\nPhysics notes:\n${trimmedNotes}\n\nGenerate the Python simulation script:`,
        2200
      ),
      callLLM(
        `${EQUATIONS_SYSTEM}\n\nPhysics notes:\n${trimmedNotes}\n\nExtract all equations as JSON array:`,
        1200
      ),
    ]);

    let pythonScript = "";
    let equations: unknown[] = [];

    if (pythonResult.status === "fulfilled") {
      pythonScript = pythonResult.value
        .replace(/^```python\n?/i, "")
        .replace(/^```\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
    }

    if (equationsResult.status === "fulfilled") {
      const raw = equationsResult.value.trim();
      // Extract JSON array from response
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          equations = JSON.parse(arrMatch[0]);
        } catch {
          equations = [];
        }
      }
    }

    return NextResponse.json({ pythonScript, equations });
  } catch (err) {
    console.error("[generate-artifacts]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
