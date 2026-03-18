import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const NVIDIA_BASE    = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_FAST    = 'nvidia/llama-3.1-nemotron-nano-8b-v1';
const GROQ_FAST      = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  const { question, simConfig, currentParams, conversationHistory = [] } = await req.json();
  if (!question?.trim()) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  const simContext = simConfig
    ? `Current simulation: ${simConfig.displayName || simConfig.simType}
Current live parameters: ${Object.entries(currentParams || {}).map(([k, v]) => `${k} = ${v}`).join(', ')}
Parameter ranges: ${(simConfig.params || []).map((p: { name: string; min: number; max: number; unit: string }) => `${p.name} (${p.min}–${p.max} ${p.unit})`).join(', ')}
Constraints: ${(simConfig.constraints || []).map((c: { param: string; warningThreshold: number; criticalThreshold: number }) => `${c.param} warns at ${c.warningThreshold}, fails at ${c.criticalThreshold}`).join('; ')}`
    : 'No simulation loaded yet.';

  const systemPrompt = `You are Loomin's embedded physics expert — a concise, sharp AI tutor inside a live physics simulation sandbox.

${simContext}

Rules:
- Answer in 2-4 sentences max. Be specific: cite equations, SI units, real numbers.
- If relevant, suggest a parameter value the user should try to see interesting physics.
- Do not use markdown headers. Plain text or short bullet points only.
- If the user asks why something broke, explain the exact physics constraint that was violated.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: 'user', content: question },
  ];

  try {
    let answer: string;

    if (process.env.NVIDIA_API_KEY) {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({ model: NVIDIA_FAST, messages, temperature: 0.4, max_tokens: 350 }),
      });
      const data = await res.json();
      answer = data.choices?.[0]?.message?.content || 'No response.';
    } else {
      const completion = await groq.chat.completions.create({
        messages: messages as Parameters<typeof groq.chat.completions.create>[0]['messages'],
        model: GROQ_FAST,
        temperature: 0.4,
        max_tokens: 350,
      });
      answer = completion.choices[0]?.message?.content || 'No response.';
    }

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('physics-ask error:', err);
    return NextResponse.json({ error: 'Failed to get answer' }, { status: 500 });
  }
}
