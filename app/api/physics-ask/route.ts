import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Fast model — quick contextual Q&A in the Ask AI drawer
const FAST_MODEL = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  const { question, simConfig, currentParams, conversationHistory = [] } = await req.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question required' }, { status: 400 });
  }

  const simContext = simConfig
    ? `Current simulation: ${simConfig.displayName || simConfig.simType}
Current parameters: ${Object.entries(currentParams || {})
        .map(([k, v]) => `${k} = ${v}`)
        .join(', ')}
Parameter ranges: ${(simConfig.params || [])
        .map((p: { name: string; min: number; max: number; unit: string }) => `${p.name} (${p.min}-${p.max} ${p.unit})`)
        .join(', ')}`
    : 'No simulation loaded yet.';

  const systemPrompt = `You are Loomin's physics expert, a concise and precise AI tutor embedded in a physics simulation sandbox.

${simContext}

Answer questions about the physics concepts, explain why parameters behave the way they do, and suggest parameter values to explore interesting physics. Keep answers to 2-4 sentences. Be specific with equations and numbers when relevant. Do not use markdown headers — just plain text or short bullet points.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: 'user', content: question },
  ];

  try {
    const completion = await groq.chat.completions.create({
      messages,
      model: FAST_MODEL,
      temperature: 0.4,
      max_tokens: 400,
    });

    const answer = completion.choices[0]?.message?.content || 'I could not generate a response.';
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('physics-ask error:', err);
    return NextResponse.json({ error: 'Failed to get answer' }, { status: 500 });
  }
}
