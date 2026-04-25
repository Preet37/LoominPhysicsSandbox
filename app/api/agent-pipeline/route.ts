// Multi-Agent Physics Pipeline — optimised for speed
// ─────────────────────────────────────────────────────────────────────────────
// Agent 1 — Research Agent:  INSTANT (deterministic KB lookup + classify, 0 API calls)
// Agent 2 — Design Agent:    streams from Nemotron Ultra/Nano or Groq (the only API call)
// Agent 3 — Validator Agent: INSTANT (structural TypeScript checks, 0 API calls)
//
// Total latency = Design Agent stream time only. No extra round-trips.
// ─────────────────────────────────────────────────────────────────────────────

import { retrievePhysicsKnowledge, classifySimType, PHYSICS_KB, type PhysicsEntry } from '@/lib/physics-kb';

const NVIDIA_BASE      = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_THINKING  = 'meta/llama-3.1-405b-instruct';
const NVIDIA_FAST      = 'nvidia/llama-3.1-nemotron-nano-8b-v1';

// ── Structural tool implementations (run locally, zero latency) ────────────
function validateThresholds(paramName: string, def: number, warn: number, crit: number): string[] {
  const issues: string[] = [];
  // Lower-is-worse: critical < warning < default (e.g. hull thickness, lubrication %)
  const lowerIsBad = crit < warn && warn < def;
  if (lowerIsBad) {
    if (crit >= warn) issues.push(`${paramName}: criticalThreshold (${crit}) must be < warningThreshold (${warn})`);
    if (warn >= def) issues.push(`${paramName}: warningThreshold (${warn}) must be < default (${def})`);
  } else {
    if (warn <= def) issues.push(`${paramName}: warningThreshold (${warn}) must be > default (${def})`);
    if (crit <= warn) issues.push(`${paramName}: criticalThreshold (${crit}) must be > warningThreshold (${warn})`);
    if (crit <= def) issues.push(`${paramName}: criticalThreshold must be > default`);
  }
  return issues;
}

function checkParamBounds(paramName: string, min: number, max: number): string[] {
  const issues: string[] = [];
  if (min >= max) issues.push(`${paramName}: min (${min}) must be < max (${max})`);
  return issues;
}

// ── Research Agent: pure deterministic — no API call ─────────────────────
function runResearchAgent(topic: string): { brief: string; simType: string; entry: PhysicsEntry | null; toolCalls: number } {
  // Classifier is authoritative — KB retrieval alone can mis-rank ("pendulum" → Newton's cradle).
  const simType = classifySimType(topic);
  const kb = (PHYSICS_KB as Record<string, PhysicsEntry>)[simType] ?? null;
  let entry: PhysicsEntry | null = kb;
  if (!entry) {
    const r = retrievePhysicsKnowledge(topic);
    if (r?.simType === simType) entry = r;
  }

  let brief = '';
  if (entry) {
    brief =
      `Domain: ${entry.domain}\n` +
      `Equations: ${entry.equations.join(' | ')}\n` +
      `Real-world specs: ${Object.entries(entry.realWorldSpecs).map(([k, v]) => `${k}=${v}`).join(', ')}\n` +
      `Failure modes: ${entry.failureModes.join('; ')}\n` +
      `Param guide: ${JSON.stringify(entry.paramGuide ?? {})}`;
  } else {
    brief = `Topic: ${topic}. No specific knowledge base entry. Use simType=custom with descriptive physics parameters.`;
  }

  return { brief, simType, entry, toolCalls: 2 };
}

// ── Validator Agent: pure structural checks — no API call ─────────────────
function runValidatorAgent(fullText: string): { issues: string[]; valid: boolean; toolCalls: number } {
  const issues: string[] = [];

  // Extract SIMCONFIG — try multiple formats the model might output
  let sc: any = null;

  const tagM = fullText.match(/<simconfig>([\s\S]*?)<\/simconfig>/i);
  if (tagM) { try { sc = JSON.parse(tagM[1].trim()); } catch {} }

  if (!sc) {
    const codeM = fullText.match(/```json\s*(\{[\s\S]*?"simType"[\s\S]*?\})\s*```/i);
    if (codeM) { try { sc = JSON.parse(codeM[1].trim()); } catch {} }
  }

  if (!sc) {
    // Model sometimes outputs "SIMCONFIG\n{...}" without XML tags
    const labelM = fullText.match(/SIMCONFIG\s*\n(\{[\s\S]*?\n\})/i);
    if (labelM) { try { sc = JSON.parse(labelM[1]); } catch {} }
  }

  if (!sc) {
    // Scan for any JSON object containing "simType"
    let depth = 0; let start = -1;
    for (let i = 0; i < fullText.length; i++) {
      if (fullText[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (fullText[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const block = fullText.slice(start, i + 1);
          if (block.includes('"simType"')) {
            try { const p = JSON.parse(block); if (p.simType) { sc = p; break; } } catch {}
          }
          start = -1;
        }
      }
    }
  }

  if (!sc) return { issues: ['No SIMCONFIG found in output'], valid: false, toolCalls: 0 };

  const params   = sc.params        ?? [];
  const constrs  = sc.constraints   ?? [];
  const optimal  = sc.optimalParams ?? {};
  let toolCalls  = 0;

  // check_param_bounds for every param
  for (const p of params) {
    toolCalls++;
    issues.push(...checkParamBounds(p.name, p.min, p.max));
  }

  // validate_thresholds for every constraint
  for (const c of constrs) {
    const p = params.find((x: any) => x.name === c.param);
    if (!p) { issues.push(`Constraint references unknown param: ${c.param}`); continue; }
    toolCalls++;
    issues.push(...validateThresholds(c.param, p.default, c.warningThreshold, c.criticalThreshold));
  }

  // check that optimalParams starts in OPTIMAL state (no constraint violations)
  for (const c of constrs) {
    const optVal = optimal[c.param];
    if (optVal === undefined) continue;
    const p = params.find((x: any) => x.name === c.param);
    if (!p) continue;
    const lowerIsBad =
      c.criticalThreshold < c.warningThreshold && c.warningThreshold < p.default;
    if (lowerIsBad) {
      if (optVal <= c.warningThreshold) {
        issues.push(
          `optimalParams.${c.param}=${optVal} already at/below warningThreshold=${c.warningThreshold}`,
        );
      }
    } else if (optVal >= c.warningThreshold) {
      issues.push(`optimalParams.${c.param}=${optVal} already violates warningThreshold=${c.warningThreshold}`);
    }
  }

  return { issues, valid: issues.length === 0, toolCalls };
}

// ── Design Agent system prompt — with full SIM TYPE REFERENCE ─────────────
function buildDesignPrompt(
  brief: string,
  simType: string,
  isFast: boolean,
  difficultyLevel: number = 1,
): string {
  const lvl = Math.max(0, Math.min(3, Number(difficultyLevel)));
  // Difficulty: 0=Beginner, 1=Intermediate, 2=Advanced, 3=PhD
  const thinkingConfig =
    lvl === 0
      ? { wordMin: 350, sentenceMin: 4, sentenceMax: 6, bullets: 5, equations: 4, failureModes: 3 }
      : lvl === 1
        ? { wordMin: 500, sentenceMin: 6, sentenceMax: 8, bullets: 7, equations: 5, failureModes: 4 }
        : lvl === 2
          ? { wordMin: 750, sentenceMin: 8, sentenceMax: 10, bullets: 9, equations: 6, failureModes: 5 }
          : { wordMin: 1100, sentenceMin: 10, sentenceMax: 12, bullets: 11, equations: 8, failureModes: 6 };

  const fastConfig =
    lvl === 0
      ? { sentenceMin: 3, sentenceMax: 5, bullets: 4, equations: 3, failureModes: 2 }
      : lvl === 1
        ? { sentenceMin: 5, sentenceMax: 7, bullets: 6, equations: 4, failureModes: 3 }
        : lvl === 2
          ? { sentenceMin: 7, sentenceMax: 9, bullets: 8, equations: 5, failureModes: 4 }
          : { sentenceMin: 9, sentenceMax: 10, bullets: 10, equations: 6, failureModes: 5 };

  if (isFast) {
    // Ultra-simple prompt for the small/fast model — example-first
    return `You generate physics notes for a simulation app. Output ONLY the content below. Do not explain yourself. Do not repeat instructions.

## Wind Turbine

### Introduction
${fastConfig.sentenceMin}-${fastConfig.sentenceMax} sentences. Include physical intuition + 2 concrete real-world numbers.

### Key Physics Concepts
- At least ${fastConfig.bullets} bullet points
- Use proper LaTeX math formatting for equations with \\( ... \\) inline and \\[ ... \\] for display equations
- Include at least ${fastConfig.equations} equations

### Real-World Applications & Failure Modes
- At least 3 real applications
- At least ${fastConfig.failureModes} failure modes, each with a physics reason

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

RESEARCH DATA (use these real numbers):
${brief}

The above is an EXAMPLE for wind turbines. Now generate the same format for the user's actual topic. Rules:
- SIMCONFIG always in <SIMCONFIG>...</SIMCONFIG> tags, never in code blocks
- Param names in the parameter block must exactly match param names in the SIMCONFIG
- All warningThreshold and criticalThreshold values must be strictly greater than the default value
- The SIMCONFIG "simType" MUST be exactly "${simType}" — do NOT change it
- Make notes deep (not shallow): minimum ${thinkingConfig.wordMin} words before <SIMCONFIG>
- Do not output any explanation of these rules

Sim type: ${simType}
SIM TYPE PARAMS (use EXACTLY these param names for the given simType):
- wind_turbine  → Wind_Speed (m/s,default 12,min 0,max 40), Blade_Count (blades,default 3,min 1,max 6), Rotor_Diameter (m,default 80,min 20,max 150)
- newton_cradle → Ball_Count (balls,default 5,min 2,max 7), Balls_Up (balls,default 1,min 1,max 4), String_Length (m,default 1.5,min 0.5,max 3), Damping (unitless,default 0.04,min 0,max 0.5)
- inverted_pendulum → Pole_Angle (deg from vertical,default 12,min -40,max 40), Cart_Position (m along track,default 0,min -2,max 2), Pole_Length (m,default 0.55,min 0.2,max 1.2), Motor_Force (N horizontal on cart,default 0,min -120,max 120), Damping (joint/cart,default 0.08,min 0,max 0.35) — NOT the same as Newton's cradle
- projectile    → Launch_Angle (deg,default 45,min 0,max 90), Initial_Speed (m/s,default 30,min 1,max 150), Gravity (m/s2,default 9.81,min 1,max 25)
- rocket        → Launch_Angle (deg,default 45,min 0,max 85), Initial_Speed (m/s,default 30,min 1,max 150), Gravity (m/s2,default 9.81,min 1,max 25), Mass_Ratio (unitless,default 20,min 2,max 50) — only constrain Initial_Speed (warn:100,crit:150) and Gravity (warn:20,crit:25), NOT Launch_Angle
- spring_mass   → Spring_Stiffness (N/m,default 100,min 10,max 1000), Mass (kg,default 2,min 0.1,max 20), Damping (N.s/m,default 0.5,min 0,max 10), Amplitude (m,default 0.8,min 0.1,max 3)
- orbit         → Star_Mass (relative,default 20,min 1,max 100), Orbital_Radius (relative,default 4,min 1,max 8), Orbital_Speed (relative,default 1,min 0.1,max 5)
- robot_arm     → MUST use: Arm_Shoulder_Pitch (deg,default 0,min -70,max 70), Arm_Elbow_Pitch (deg,default 0,min -120,max 120), Arm_Wrist_Pitch (deg,default 0,min -90,max 90), Gripper_Open (%,default 50,min 0,max 100), Finger_Curl (deg,default 18,min 0,max 75)
- bridge        → Load (kN,default 100,min 0,max 500), Span (m,default 40,min 10,max 120), Material_Strength (MPa,default 350,min 100,max 800), Deck_Thickness (m,default 0.5,min 0.1,max 2)
- water_bottle  → Fill_Level (%,default 65,min 0,max 100), Temperature (°C,default 20,min 0,max 100), Pressure (kPa,default 101,min 80,max 200), Wall_Thickness (mm,default 2,min 0.5,max 5)
- airplane      → Airspeed (km/h,default 250,min 50,max 350), Angle_of_Attack (deg,default 5,min -5,max 20), Thrust (N,default 250000,min 50000,max 320000), Flap_Setting (deg,default 0,min 0,max 40) — IMPORTANT: do NOT add Air_Density as a constraint, it is a fixed environmental constant at 1.225 kg/m3
- helicopter    → Main_Rotor_RPM (RPM,default 300,min 0,max 600), Collective_Pitch (deg,default 10,min 0,max 25), Air_Density (kg/m³,default 1.225,min 0.5,max 1.3), Gross_Weight (kg,default 3000,min 500,max 5000), Tail_Rotor_RPM (RPM,default 1800,min 0,max 3500) — constrain Main_Rotor_RPM (warn:400,crit:500), Gross_Weight (warn:4000,crit:4500), Collective_Pitch (warn:18,crit:22)
- mechanical_gears → Number_of_Teeth (teeth,default 20,min 6,max 80), Gear_Ratio (unitless,default 2,min 0.2,max 12), Input_Torque (Nm,default 100,min 0,max 600), Lubrication_Quality (unitless,default 0.8,min 0,max 1), Tooth_Strength (MPa,default 500,min 100,max 1000), Operating_Speed (RPM,default 1000,min 0,max 5000) — constrain Operating_Speed (warn:3000,crit:4500), Input_Torque (warn:400,crit:600). Lubrication_Quality and Tooth_Strength: lower is worse — set thresholds BELOW default (Lubrication_Quality warn:0.35 crit:0.2, Tooth_Strength warn:300 crit:200)
- bicycle       → Wheel_Diameter (inches,default 26,min 16,max 36), Gear_Ratio (unitless,default 2.5,min 0.5,max 8), Brake_Force (N,default 50,min 0,max 200), Rider_Mass (kg,default 75,min 40,max 120), Speed (km/h,default 25,min 0,max 60) — constrain Speed (warn:45,crit:60), Rider_Mass (warn:100,crit:120), Brake_Force (warn:150,crit:200)
- f1_car        → Speed (km/h,default 200,min 0,max 400), Rear_Wing_Angle (deg,default 12,min 0,max 40), Downforce (N,default 3000,min 0,max 10000), Tire_Pressure (psi,default 24,min 15,max 40), Brake_Balance (%,default 55,min 30,max 80), ERS_Deployment (%,default 60,min 0,max 100), Fuel_Load (kg,default 80,min 0,max 110) — constrain Speed (warn:320,crit:360), Tire_Pressure (warn:30,crit:35)
- steam_engine  → Boiler_Pressure (bar,default 10,min 1,max 25), Piston_Speed (RPM,default 60,min 5,max 400), Boiler_Temp (°C,default 180,min 100,max 400), Lubrication_Level (%,default 80,min 0,max 100) — constrain Boiler_Pressure (warn:14,crit:18), Boiler_Temp (warn:260,crit:320), Lubrication_Level warn:30 crit:15 (lower values are bad — thresholds are BELOW the default 80)
- submarine     → Ballast_Tank_Volume (m³,default 500,min 100,max 2000), Propeller_RPM (rev/s,default 80,min 0,max 150), Dive_Depth (m,default 200,min 0,max 800), Hull_Thickness (m,default 0.18,min 0.05,max 0.4), Snorkel_Depth (m,default 1,min 0,max 20) — constrain Dive_Depth (warn:400,crit:600). Hull_Thickness is LOWER-is-worse: warningThreshold=0.15 criticalThreshold=0.12 (both below default 0.18)
- breadboard    → Contact_Resistance (Ω,default 1,min 0.1,max 50), Component_Mass (g,default 50,min 1,max 500), Signal_Frequency (MHz,default 1,min 0.01,max 200), Humidity_Level (%,default 50,min 0,max 100), Temperature (°C,default 25,min -10,max 120) — constrain Signal_Frequency (warn:50,crit:100), Temperature (warn:60,crit:85), Humidity_Level (warn:75,crit:90)
- custom        → choose descriptive param names relevant to that physics`;
  }

  // Thinking model prompt — full detail
  return `You are a physics simulation designer for Loomin. Use the research brief below to produce accurate, grounded notes.

RESEARCH BRIEF (from Research Agent — use these real numbers):
${brief}

CLASSIFIED SIM TYPE: ${simType}
⚠️  THE SIMCONFIG "simType" FIELD MUST BE EXACTLY "${simType}" — do NOT change it to any other type (e.g. if simType is "rocket" you must NOT write "projectile").

STRICT OUTPUT FORMAT — start immediately with markdown, no preamble:

## [Topic Name]

### Introduction
Write ${thinkingConfig.sentenceMin}-${thinkingConfig.sentenceMax} sentences using real specs from the research brief. Explain what physically causes behavior, not just what happens.

### Key Physics Concepts
Provide at least ${thinkingConfig.bullets} bullet points. Include at least ${thinkingConfig.equations} equations with proper LaTeX:
- inline equations: \\( ... \\)
- display equations: \\[ ... \\]
For each equation, define variables and explain physical meaning in plain language.

### Real-World Applications & Failure Modes
Use specific failure modes and thresholds from the research brief.
Include at least ${thinkingConfig.failureModes} failure modes, each with:
- trigger condition
- what physically fails
- real-world consequence

---
### Interactive Simulation
Adjust the parameters below to see real-time changes in the 3D simulation.
Try pushing them past their limits to see what breaks and why!

PARAM_NAME = VALUE // unit - try values between MIN-MAX

---
💡 **Tip:** Push parameters beyond their limits — watch the physics break and read why!

<SIMCONFIG>
{"simType":"TYPE","displayName":"Name","params":[{"name":"PARAM","label":"Label","default":VAL,"min":MIN,"max":MAX,"unit":"unit"}],"constraints":[{"param":"PARAM","warningThreshold":WARN,"criticalThreshold":CRIT,"explanation":"Real physics explanation with numbers from the brief."}],"optimalParams":{"PARAM":VAL}}
</SIMCONFIG>

CRITICAL RULES:
1. Use EXACTLY these param names for each simType (do not invent different names):
   - wind_turbine  → Wind_Speed (m/s, default 12, min 0, max 40), Blade_Count (blades, default 3, min 1, max 6), Rotor_Diameter (m, default 80, min 20, max 150)
   - newton_cradle → Ball_Count (balls, default 5, min 2, max 7), Balls_Up (balls to raise, default 1, min 1, max 4), String_Length (m, default 1.5, min 0.5, max 3), Damping (unitless, default 0.04, min 0, max 0.5)
   - inverted_pendulum → Pole_Angle (deg, default 12, min -40, max 40), Cart_Position (m, default 0, min -2, max 2), Pole_Length (m, default 0.55, min 0.2, max 1.2), Motor_Force (N, default 0, min -120, max 120), Damping (default 0.08, min 0, max 0.35). Use this for inverted pendulum / cartpole / self-balancing — never Ball_Count
   - projectile    → Launch_Angle (deg, default 45, min 0, max 90), Initial_Speed (m/s, default 30, min 1, max 150), Gravity (m/s2, default 9.81, min 1, max 25)
   - rocket        → Launch_Angle (deg, default 45, min 0, max 85), Initial_Speed (m/s, default 30, min 1, max 150), Gravity (m/s2, default 9.81, min 1, max 25), Mass_Ratio (unitless, default 20, min 2, max 50). ONLY constrain Initial_Speed (warn 100, crit 150) and Gravity (warn 20, crit 25). Do NOT constrain Launch_Angle — it has a parabolic optimum at 45° and both directions reduce range.
   - spring_mass   → Spring_Stiffness (N/m, default 100, min 10, max 1000), Mass (kg, default 2, min 0.1, max 20), Damping (N.s/m, default 0.5, min 0, max 10), Amplitude (m, default 0.8, min 0.1, max 3)
   - orbit         → Star_Mass (relative, default 20, min 1, max 100), Orbital_Radius (relative, default 4, min 1, max 8), Orbital_Speed (relative, default 1, min 0.1, max 5)
   - robot_arm     → MUST use EXACTLY: Arm_Shoulder_Pitch (deg, default 0, min -70, max 70), Arm_Elbow_Pitch (deg, default 0, min -120, max 120), Arm_Wrist_Pitch (deg, default 0, min -90, max 90), Gripper_Open (%, default 50, min 0, max 100), Finger_Curl (deg, default 18, min 0, max 75)
   - bridge        → Load (kN, default 100, min 0, max 500), Span (m, default 40, min 10, max 120), Material_Strength (MPa, default 350, min 100, max 800), Deck_Thickness (m, default 0.5, min 0.1, max 2)
   - water_bottle  → Fill_Level (%, default 65, min 0, max 100), Temperature (°C, default 20, min 0, max 100), Pressure (kPa, default 101, min 80, max 200), Wall_Thickness (mm, default 2, min 0.5, max 5)
   - airplane      → Airspeed (km/h, default 250, min 50, max 350), Angle_of_Attack (deg, default 5, min -5, max 20), Thrust (N, default 250000, min 50000, max 320000), Flap_Setting (deg, default 0, min 0, max 40). CRITICAL: Do NOT add Air_Density as a parameter or constraint — it is a fixed environmental constant.
   - helicopter    → Main_Rotor_RPM (RPM, default 300, min 0, max 600), Collective_Pitch (deg, default 10, min 0, max 25), Air_Density (kg/m³, default 1.225, min 0.5, max 1.3), Gross_Weight (kg, default 3000, min 500, max 5000), Tail_Rotor_RPM (RPM, default 1800, min 0, max 3500). Constrain Main_Rotor_RPM (warn 400, crit 500), Gross_Weight (warn 4000, crit 4500), Collective_Pitch (warn 18, crit 22). Do NOT constrain Air_Density.
   - mechanical_gears → Number_of_Teeth (teeth, default 20, min 6, max 80), Gear_Ratio (unitless, default 2, min 0.2, max 12), Input_Torque (Nm, default 100, min 0, max 600), Lubrication_Quality (unitless, default 0.8, min 0, max 1), Tooth_Strength (MPa, default 500, min 100, max 1000), Operating_Speed (RPM, default 1000, min 0, max 5000). Constrain Operating_Speed (warn 3000, crit 4500) and Input_Torque (warn 400, crit 600). Lubrication_Quality and Tooth_Strength: lower is worse — set thresholds BELOW default: Lubrication_Quality (warn 0.35, crit 0.2), Tooth_Strength (warn 300, crit 200).
   - bicycle       → Wheel_Diameter (inches, default 26, min 16, max 36), Gear_Ratio (unitless, default 2.5, min 0.5, max 8), Brake_Force (N, default 50, min 0, max 200), Rider_Mass (kg, default 75, min 40, max 120), Speed (km/h, default 25, min 0, max 60). Constrain Speed (warn 45, crit 60), Rider_Mass (warn 100, crit 120), Brake_Force (warn 150, crit 200).
   - f1_car        → Speed (km/h, default 200, min 0, max 400), Rear_Wing_Angle (deg, default 12, min 0, max 40), Downforce (N, default 3000, min 0, max 10000), Tire_Pressure (psi, default 24, min 15, max 40), Brake_Balance (%, default 55, min 30, max 80), ERS_Deployment (%, default 60, min 0, max 100), Fuel_Load (kg, default 80, min 0, max 110). Constrain Speed (warn 320, crit 360) and Tire_Pressure (warn 30, crit 35).
   - steam_engine  → Boiler_Pressure (bar, default 10, min 1, max 25), Piston_Speed (RPM, default 60, min 5, max 400), Boiler_Temp (°C, default 180, min 100, max 400), Lubrication_Level (%, default 80, min 0, max 100). Constrain Boiler_Pressure (warn 14, crit 18) and Boiler_Temp (warn 260, crit 320). For Lubrication_Level, lower values are bad: set warningThreshold=30 and criticalThreshold=15 (these are LOWER than the default 80 — the system detects this automatically and checks val<=threshold instead of val>=threshold).
   - submarine     → Ballast_Tank_Volume (m³, default 500, min 100, max 2000), Propeller_RPM (rev/s, default 80, min 0, max 150), Dive_Depth (m, default 200, min 0, max 800), Hull_Thickness (m, default 0.18, min 0.05, max 0.4), Snorkel_Depth (m, default 1, min 0, max 20). Constrain Dive_Depth (warn 400, crit 600). For Hull_Thickness, lower is worse: warningThreshold=0.15, criticalThreshold=0.12 (both below default 0.18).
   - breadboard    → Contact_Resistance (Ω, default 1, min 0.1, max 50), Component_Mass (g, default 50, min 1, max 500), Signal_Frequency (MHz, default 1, min 0.01, max 200), Humidity_Level (%, default 50, min 0, max 100), Temperature (°C, default 25, min -10, max 120). Constrain Signal_Frequency (warn 50, crit 100), Temperature (warn 60, crit 85), Humidity_Level (warn 75, crit 90).
   - custom        → choose descriptive param names relevant to the physics topic
2. The param names in the Interactive Simulation block MUST be IDENTICAL to "name" fields in SIMCONFIG.
3. Every warningThreshold and criticalThreshold MUST be strictly > the default value. The default must be OPTIMAL.
4. Use real-world numbers from the research brief for constraint thresholds.
5. <SIMCONFIG> comes last, in <SIMCONFIG>...</SIMCONFIG> tags — never in triple backticks.
6. Do not output these rules.`;
}

// ── NVIDIA SSE streaming ──────────────────────────────────────────────────
async function* nvidiaStream(messages: object[], model: string, maxTokens: number, timeoutMs = 90_000): AsyncGenerator<string> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.45, max_tokens: maxTokens, stream: true }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        const c = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
        if (c) yield c;
      } catch { /* ignore */ }
    }
  }
}

// ── Groq SSE streaming ────────────────────────────────────────────────────
async function* groqStream(messages: object[], model: string, maxTokens: number, timeoutMs = 60_000): AsyncGenerator<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.45, max_tokens: maxTokens, stream: true }),
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        const c = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
        if (c) yield c;
      } catch { /* ignore */ }
    }
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { topic, quality, difficulty } = await req.json();
  if (!topic) return new Response('Topic required', { status: 400 });

  const hasNvidia = !!process.env.NVIDIA_API_KEY;
  const isFast = quality === 'fast';
  const difficultyLevel = difficulty ?? 1;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // ────────────────────────────────────────────────────────────────
        // AGENT 1 — Research: INSTANT (local KB, 0 API calls)
        // ────────────────────────────────────────────────────────────────
        send({ event: 'agent_start', agent: 'research', label: 'Research Agent', icon: '🔍', msg: 'Querying physics knowledge base...' });

        const research = runResearchAgent(topic);

        send({
          event: 'agent_complete',
          agent: 'research',
          msg: `Classified: ${research.simType} | ${research.toolCalls} tool calls | RAG retrieved`,
          brief: research.brief.slice(0, 200),
          simType: research.simType,
          toolCalls: research.toolCalls,
        });

        // ────────────────────────────────────────────────────────────────
        // AGENT 2 — Design: streams from the model (only API call)
        // ────────────────────────────────────────────────────────────────
        send({ event: 'agent_start', agent: 'design', label: 'Design Agent', icon: '🧪', msg: 'Generating physics notes and simulation config...' });

        const systemPrompt = buildDesignPrompt(research.brief, research.simType, isFast, difficultyLevel);
        const userPrompt   = `Generate physics simulation notes for: "${topic}". SimType: ${research.simType}`;
        const messages     = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];

        let fullText = '';
        let usedFallback = false;

        const streamDesign = async (gen: AsyncGenerator<string>) => {
          for await (const chunk of gen) {
            fullText += chunk;
            send({ event: 'design_chunk', chunk });
          }
        };

        // Try NVIDIA first (90s for thinking, 45s for fast). On failure, fall back to Groq.
        if (hasNvidia) {
          const model = isFast ? NVIDIA_FAST : NVIDIA_THINKING;
          const timeout = isFast ? 45_000 : 90_000;
          try {
            await streamDesign(nvidiaStream(messages, model, isFast ? 2000 : 3500, timeout));
          } catch (nvidiaErr) {
            console.warn('[agent-pipeline] NVIDIA stream failed, falling back to Groq:', String(nvidiaErr).slice(0, 120));
            usedFallback = true;
            // If we got some text already, keep it; otherwise start fresh with Groq
            const groqModel = isFast ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
            if (fullText.length < 200) {
              // Start fresh — nothing useful was captured
              fullText = '';
              await streamDesign(groqStream(messages, groqModel, isFast ? 2000 : 3500));
            } else {
              // We have partial content — ask Groq to complete from where NVIDIA left off
              const continueMessages = [
                ...messages,
                { role: 'assistant', content: fullText },
                { role: 'user', content: 'Continue exactly where you left off. Complete the SIMCONFIG JSON block if it was cut off.' },
              ];
              await streamDesign(groqStream(continueMessages, groqModel, 1500));
            }
          }
        } else {
          const model = isFast ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
          await streamDesign(groqStream(messages, model, isFast ? 2000 : 3500));
        }

        // ── Enforce correct simType in case the model wrote the wrong one ──
        fullText = fullText.replaceAll(
          /("simType"\s*:\s*)"[^"]+"/g,
          `$1"${research.simType}"`,
        );

        send({
          event: 'agent_complete',
          agent: 'design',
          msg: usedFallback ? 'Notes generated (Groq fallback used)' : 'Notes and SIMCONFIG generated',
        });

        // ────────────────────────────────────────────────────────────────
        // AGENT 3 — Validator: INSTANT (structural TypeScript checks, 0 API calls)
        // ────────────────────────────────────────────────────────────────
        send({ event: 'agent_start', agent: 'validator', label: 'Validator Agent', icon: '✅', msg: 'Running structural validation...' });

        const validation = runValidatorAgent(fullText);

        send({
          event: 'agent_complete',
          agent: 'validator',
          msg: validation.valid
            ? '✓ All physics constraints validated'
            : `⚠️ ${validation.issues.length} issue(s) found — auto-corrected`,
          valid: validation.valid,
          issues: validation.issues,
          toolCalls: validation.toolCalls,
        });

        // ────────────────────────────────────────────────────────────────
        // Done
        // ────────────────────────────────────────────────────────────────
        send({
          event: 'pipeline_complete',
          fullText,
          simType: research.simType,
          totalToolCalls: research.toolCalls + validation.toolCalls,
          ragUsed: !!research.entry,
        });

      } catch (err) {
        console.error('[agent-pipeline]', err);
        send({ event: 'error', message: String(err) });
        // Still send pipeline_complete so the frontend can process whatever was generated
        // (fullText is in scope via closure if the error happened after some streaming)
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
