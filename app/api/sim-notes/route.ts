import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'missing_groq_key' });

const NVIDIA_BASE    = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_THINKING = 'meta/llama-3.1-405b-instruct';
const NVIDIA_FAST     = 'nvidia/llama-3.1-nemotron-nano-8b-v1';
const GROQ_THINKING   = 'llama-3.3-70b-versatile';
const GROQ_FAST       = 'llama-3.1-8b-instant';

// ── THINKING MODEL prompt (large model, detailed) ──────────────────────────
const THINKING_PROMPT = `You are a physics simulation assistant for Loomin. Start your response immediately with the markdown — no preamble, no "Sure!", no commentary.

STRICT OUTPUT FORMAT (follow this exactly, in this order):

## [Topic Name]

### Introduction
2-3 sentences on what it is and why it matters.

### Key Physics Concepts
Bullet points with plain-text equations (no LaTeX). Example: F = ma, τ = Iα, P = Fv

### Real-World Applications & Failure Modes
Bullet points on real uses and what happens when limits are exceeded.

---
### Interactive Simulation
Adjust the parameters below to see real-time changes in the 3D simulation.
Try pushing them past their limits to see what breaks and why!

PARAM_NAME_1 = VALUE // unit - try values between MIN-MAX
PARAM_NAME_2 = VALUE // unit - try values between MIN-MAX
PARAM_NAME_3 = VALUE // unit - try values between MIN-MAX

---
💡 **Tip:** Push parameters beyond their limits — watch the physics break and read why!

<SIMCONFIG>
{"simType":"TYPE","displayName":"Name","params":[{"name":"PARAM_NAME_1","label":"Label","default":VALUE,"min":MIN,"max":MAX,"unit":"unit"}],"constraints":[{"param":"PARAM_NAME","warningThreshold":WARN,"criticalThreshold":CRIT,"explanation":"Physics explanation with equations and real numbers."}],"optimalParams":{"PARAM_NAME_1":VALUE}}
</SIMCONFIG>

CRITICAL RULES — read carefully:
1. PARAM_NAME_1, PARAM_NAME_2, etc. in the Interactive Simulation block must be IDENTICAL to the "name" fields in the SIMCONFIG params array. Use the same name everywhere.
2. Every warningThreshold and criticalThreshold must be STRICTLY GREATER than the default value. The default must produce an OPTIMAL state.
3. The <SIMCONFIG> block comes LAST, after all notes. Wrap it in <SIMCONFIG>...</SIMCONFIG> tags — never in triple backticks.
4. The SIMCONFIG JSON must be valid JSON with no JavaScript comments.
5. Do not output these rules in your response.

SIM TYPE REFERENCE (choose the best fit):
- wind_turbine → params: Wind_Speed (m/s, default 12, min 0, max 40), Blade_Count (blades, default 3, min 1, max 6), Blade_Pitch (deg, default 12, min 0, max 45), Rotor_Diameter (m, default 80, min 20, max 150)
- newton_cradle (use this for pendulum/Newton's cradle/colliding balls) → params: Ball_Count (balls, default 5, min 2, max 7), Balls_Up (balls to raise, default 1, min 1, max Ball_Count-1), String_Length (m, default 1.5, min 0.5, max 3), Damping (0-0.5, default 0.04)
- projectile → params: Launch_Angle (deg, default 45, min 0, max 90), Initial_Speed (m/s, default 30, min 1, max 150), Gravity (m/s2, default 9.81, min 1, max 25)
- spring_mass → params: Spring_Stiffness (N/m, default 100, min 10, max 1000), Mass (kg, default 2, min 0.1, max 20), Damping (N.s/m, default 0.5, min 0, max 10), Amplitude (m, default 0.8, min 0.1, max 3)
- orbit → params: Star_Mass (relative, default 20, min 1, max 100), Orbital_Radius (relative, default 4, min 1, max 8), Orbital_Speed (relative, default 1, min 0.1, max 5)
- robot_arm → MUST use these EXACT names: Arm_Shoulder_Pitch (deg, default 0, min -70, max 70), Arm_Elbow_Pitch (deg, default 0, min -120, max 120), Arm_Wrist_Pitch (deg, default 0, min -90, max 90), Gripper_Open (%, default 50, min 0, max 100), Finger_Curl (deg, default 18, min 0, max 75)
- bridge → params: Load (kN, default 100, min 0, max 500), Span (m, default 40, min 10, max 120), Material_Strength (MPa, default 350, min 100, max 800), Deck_Thickness (m, default 0.5, min 0.1, max 2)
- custom → use for any other topic; choose descriptive param names relevant to that physics`;

// ── FAST MODEL prompt (small model — ultra-simple instructions) ────────────
const FAST_PROMPT = `You generate physics notes for a simulation app. Output only the content below. Do not explain yourself. Do not repeat instructions.

## Wind Turbine

### Introduction
Brief overview.

### Key Physics Concepts
- Key equation (plain text, no LaTeX)

### Real-World Applications & Failure Modes
- Application
- Failure mode

---
### Interactive Simulation
Adjust the parameters below to see real-time changes in the 3D simulation.
Try pushing them past their limits to see what breaks and why!

Wind_Speed = 12 // m/s - try values between 0-40
Blade_Count = 3 // blades - try values between 1-6

---
💡 **Tip:** Push parameters beyond their limits — watch the physics break and read why!

<SIMCONFIG>
{"simType":"wind_turbine","displayName":"Wind Turbine","params":[{"name":"Wind_Speed","label":"Wind Speed","default":12,"min":0,"max":40,"unit":"m/s"},{"name":"Blade_Count","label":"Blade Count","default":3,"min":1,"max":6,"unit":"blades"}],"constraints":[{"param":"Wind_Speed","warningThreshold":25,"criticalThreshold":35,"explanation":"At 35 m/s blade fatigue stress exceeds material yield strength."}],"optimalParams":{"Wind_Speed":12,"Blade_Count":3}}
</SIMCONFIG>

The above is an EXAMPLE for wind turbines. Here is a second EXAMPLE for a robotic arm (use these EXACT param names for robot_arm):

## Robotic Arm Physics

### Introduction
A robotic arm uses linked rigid segments driven by motors to move in 3D space.

### Key Physics Concepts
* Torque: τ = I × α (motor torque drives angular acceleration)
* Forward kinematics: end-effector pos = f(θ1, θ2, θ3)

### Real-World Applications & Failure Modes
* Applications: manufacturing, surgery, logistics
* Failure: over-torque stalls motors; singularity loses a degree of freedom

---
### Interactive Simulation
Adjust the parameters below to see real-time changes in the 3D simulation.
Try pushing them past their limits to see what breaks and why!

Arm_Shoulder_Pitch = 0 // deg - try values between -70 to 70
Arm_Elbow_Pitch = 0 // deg - try values between -120 to 120
Arm_Wrist_Pitch = 0 // deg - try values between -90 to 90
Gripper_Open = 50 // % - try values between 0-100
Finger_Curl = 18 // deg - try values between 0-75

---
💡 **Tip:** Push parameters beyond their limits — watch the physics break and read why!

<SIMCONFIG>
{"simType":"robot_arm","displayName":"Robotic Arm","params":[{"name":"Arm_Shoulder_Pitch","label":"Shoulder Pitch","default":0,"min":-70,"max":70,"unit":"deg"},{"name":"Arm_Elbow_Pitch","label":"Elbow Pitch","default":0,"min":-120,"max":120,"unit":"deg"},{"name":"Arm_Wrist_Pitch","label":"Wrist Pitch","default":0,"min":-90,"max":90,"unit":"deg"},{"name":"Gripper_Open","label":"Gripper Open","default":50,"min":0,"max":100,"unit":"%"},{"name":"Finger_Curl","label":"Finger Curl","default":18,"min":0,"max":75,"unit":"deg"}],"constraints":[{"param":"Arm_Shoulder_Pitch","warningThreshold":60,"criticalThreshold":70,"explanation":"At 70° the shoulder joint exceeds its mechanical stop, causing motor stall."},{"param":"Arm_Elbow_Pitch","warningThreshold":100,"criticalThreshold":120,"explanation":"At 120° the arm reaches a kinematic singularity — inverse kinematics fail."}],"optimalParams":{"Arm_Shoulder_Pitch":0,"Arm_Elbow_Pitch":0,"Arm_Wrist_Pitch":0,"Gripper_Open":50,"Finger_Curl":18}}
</SIMCONFIG>

The above are EXAMPLES. Now generate the same format for the user's actual topic. Rules:
- SIMCONFIG always in <SIMCONFIG>...</SIMCONFIG> tags, never in code blocks
- Param names in the parameter block must exactly match param names in the SIMCONFIG
- All warningThreshold and criticalThreshold values must be greater than the default
- Do not output any explanation of these rules

Sim type options: wind_turbine, newton_cradle (for pendulum/cradle/collisions), projectile, spring_mass, orbit, robot_arm (use Arm_Shoulder_Pitch/Arm_Elbow_Pitch/Arm_Wrist_Pitch/Gripper_Open/Finger_Curl), bridge, custom`;

// ── SSE stream parser for NVIDIA API ──────────────────────────────────────
async function* nvidiaStream(messages: object[], model: string, maxTokens: number): AsyncGenerator<string> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(90_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.45, max_tokens: maxTokens, stream: true }),
  });

  if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${await res.text()}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        const text = parsed.choices?.[0]?.delta?.content ?? '';
        if (text) yield text;
      } catch { /* skip */ }
    }
  }
}

export async function POST(req: Request) {
  const { topic, quality = 'thinking' } = await req.json();
  if (!topic?.trim()) return new Response('Topic required', { status: 400 });

  const useNvidia = !!process.env.NVIDIA_API_KEY;
  const isThinking = quality !== 'fast';
  const encoder = new TextEncoder();

  const systemPrompt = isThinking ? THINKING_PROMPT : FAST_PROMPT;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Generate physics simulation notes for: ${topic}` },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (useNvidia) {
          const model = isThinking ? NVIDIA_THINKING : NVIDIA_FAST;
          const maxTokens = isThinking ? 2800 : 1400;
          for await (const text of nvidiaStream(messages, model, maxTokens)) {
            controller.enqueue(encoder.encode(text));
          }
        } else {
          const model = isThinking ? GROQ_THINKING : GROQ_FAST;
          const completion = await groq.chat.completions.create({
            messages: messages as Parameters<typeof groq.chat.completions.create>[0]['messages'],
            model,
            temperature: 0.45,
            max_tokens: isThinking ? 2800 : 1400,
            stream: true,
          });
          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        console.error('sim-notes error:', err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
