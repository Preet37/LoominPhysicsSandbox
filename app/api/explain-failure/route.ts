import { NextResponse } from 'next/server';
import { NVIDIA_BASE, NVIDIA_FAST } from '@/lib/models';

/**
 * /api/explain-failure
 *
 * Turns a breached constraint into an actual lesson. The status card's
 * template can only say how far over the limit a slider is; a learner needs
 * what physically failed, the chain of cause and effect that got there with
 * their own numbers in it, the laws doing the work, and why those laws are
 * shaped the way they are. That needs the topic and the live parameters, so it
 * is written per situation rather than templated.
 */

export const maxDuration = 60;

const GROQ_MODEL = 'openai/gpt-oss-120b';

export interface FailureLesson {
  headline: string;
  whatBroke: string;
  causeChain: string[];
  laws: { name: string; equation: string; roleHere: string; whyItMakesSense: string }[];
  fix: string;
  realWorld: string;
}

// Same situation, same lesson: dragging back and forth across a threshold must
// not re-bill and re-wait for an identical explanation.
const cache = new Map<string, FailureLesson>();

interface Constraint {
  param: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  explanation?: string;
}

function buildPrompt(body: any) {
  const { topic, simConfig, params, param, value, severity, notesExcerpt } = body;
  const paramDefs = (simConfig?.params || [])
    .map((p: any) => `- ${p.name}: ${params?.[p.name] ?? p.default} ${p.unit || ''} (range ${p.min}–${p.max})`)
    .join('\n');
  const constraint: Constraint | undefined = (simConfig?.constraints || []).find(
    (c: Constraint) => c.param === param,
  );
  const unit = (simConfig?.params || []).find((p: any) => p.name === param)?.unit || '';

  return `Topic: ${topic}
Failing parameter: ${param} = ${value} ${unit}
Severity: ${severity === 'CRITICAL_FAILURE' ? 'CRITICAL — past the failure limit' : 'WARNING — approaching the failure limit'}
Warning threshold: ${constraint?.warningThreshold ?? 'n/a'} ${unit}
Critical threshold: ${constraint?.criticalThreshold ?? 'n/a'} ${unit}
Designer's note on this limit: ${constraint?.explanation || 'none'}

All live parameters:
${paramDefs || '(none listed)'}

Excerpt of the study notes for context:
${String(notesExcerpt || '').slice(0, 2500)}`;
}

const SYSTEM = `You are a physics tutor inside an interactive simulation. A student just pushed a parameter past a safe limit. Write the lesson that explains exactly what is happening to THIS object at THESE values.

Return ONLY a JSON object with these keys:
{
  "headline": "One sentence naming the physical failure and its cause, with the student's value. e.g. 'The neck bows permanently: 110 N of string tension bends it past the wood's yield point.'",
  "whatBroke": "2-3 sentences. Which specific part fails, in what way (bends, fractures, fatigues, overheats, stalls, resonates…), and what the student would see or hear on the real object.",
  "causeChain": ["3-5 short steps, cause → effect, from the parameter change to the failure. Put the student's actual numbers in the steps, and do the arithmetic where it helps (e.g. 'Six strings at 110 N pull the headstock with about 660 N combined'). Each step one sentence."],
  "laws": [
    {
      "name": "The law or principle by name (e.g. Hooke's law, Euler–Bernoulli beam bending, Bernoulli's principle)",
      "equation": "The equation in plain Unicode text, no LaTeX (e.g. σ = M·y / I)",
      "roleHere": "What this law says about THIS failure, with the student's numbers where possible",
      "whyItMakesSense": "The intuition: why nature behaves this way, explained so a curious high-schooler could rebuild the law themselves"
    }
  ],
  "fix": "1-2 sentences: what to change and why it works physically, referencing the threshold.",
  "realWorld": "1-2 sentences: a real incident, product, or engineering practice where this exact failure matters."
}

Rules:
- 1 to 3 laws, only ones that actually govern this failure. Never cite a law that does not apply.
- Get the mechanism right. Before writing, check that each causal step is how the physics actually works, not just plausible-sounding (e.g. strings pull along a guitar neck; the bend comes from their line of pull sitting above the neck's neutral axis).
- Only do arithmetic when every input has a clear physical meaning and plausible units. The parameter list is AI-generated and its units are sometimes mislabeled; if a value looks implausible, reason with proportions instead (e.g. "20% more tension means 20% more bending moment, and the stress rises with it").
- Be quantitatively honest. If you estimate a number, say it is approximate. Do not invent precise data you cannot derive from the inputs.
- Plain text inside strings: no markdown, no LaTeX, no $ signs.
- If the severity is WARNING, describe what is starting to happen and what will fail if it continues.`;

function parseLesson(raw: string): FailureLesson | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    if (!j.headline || !Array.isArray(j.causeChain) || !Array.isArray(j.laws)) return null;
    return {
      headline: String(j.headline),
      whatBroke: String(j.whatBroke || ''),
      causeChain: j.causeChain.map(String).slice(0, 6),
      laws: j.laws.slice(0, 3).map((l: any) => ({
        name: String(l.name || ''),
        equation: String(l.equation || ''),
        roleHere: String(l.roleHere || ''),
        whyItMakesSense: String(l.whyItMakesSense || ''),
      })),
      fix: String(j.fix || ''),
      realWorld: String(j.realWorld || ''),
    };
  } catch {
    return null;
  }
}

async function viaGroq(user: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      temperature: 0.3,
      // Medium: 'high' took ~20s for no better physics — the errors it made
      // came from the inputs, not from too little reasoning.
      max_tokens: 4000,
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function viaNvidia(user: string): Promise<string> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model: NVIDIA_FAST,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.param || !body?.topic) {
    return NextResponse.json({ error: 'topic and param are required' }, { status: 400 });
  }

  const key = [body.topic, body.param, body.severity, body.value].join('|').toLowerCase();
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ lesson: hit, cached: true });

  const user = buildPrompt(body);
  // Groq first: it answers in a few seconds, and NVIDIA has been timing out.
  const providers = [
    process.env.GROQ_API_KEY ? viaGroq : null,
    process.env.NVIDIA_API_KEY ? viaNvidia : null,
  ].filter(Boolean) as ((u: string) => Promise<string>)[];

  for (const call of providers) {
    try {
      const lesson = parseLesson(await call(user));
      if (lesson) {
        cache.set(key, lesson);
        return NextResponse.json({ lesson });
      }
    } catch (e) {
      console.warn('[explain-failure]', String(e).slice(0, 160));
    }
  }
  return NextResponse.json({ error: 'Could not generate an explanation' }, { status: 502 });
}
