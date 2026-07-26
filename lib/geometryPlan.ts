/**
 * Geometry plans — what to build when there is no hand-written CAD template.
 *
 * The old fallback for an unrecognised topic was a cube stacked under a sphere.
 * That is worse than an error: it renders successfully, so every downstream
 * check passes and the user is handed a "model" that is a random ball.
 *
 * The fix is to make "I don't know this object" trigger research rather than a
 * guess. The LLM is asked for a STRUCTURAL breakdown — named parts, primitive
 * shapes, millimetre sizes and positions — which is then validated by pure
 * deterministic rules before a single polygon is generated. A plan that is
 * really just a blob (too few parts, spheres only, disconnected pieces) fails
 * validation, and the caller surfaces a real error instead of shipping it.
 */

import { geminiGenerate } from "./specSheet";
import type { SpecSheet } from "./specSheet";

export type PlanPrimitive = "box" | "cylinder" | "cone" | "sphere" | "torus";

const PRIMITIVES: readonly PlanPrimitive[] = ["box", "cylinder", "cone", "sphere", "torus"];

export interface PlanPart {
  name: string;
  primitive: PlanPrimitive;
  /** Full extents in mm: [x, y, z]. For cylinder/cone/torus, x and y are diameters. */
  size: [number, number, number];
  /** Centre position in mm, relative to the object origin. */
  position: [number, number, number];
  /** Euler rotation in degrees. */
  rotation: [number, number, number];
  /** Duplicate the part mirrored across this axis (wheels, wings, legs). */
  mirror?: "x" | "y" | "z";
}

export interface GeometryPlan {
  topic: string;
  /** One-line description of the real object this represents. */
  summary: string;
  referenceProduct: string;
  parts: PlanPart[];
  source: string;
}

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: { label: string; pass: boolean }[];
}

// ── Coercion ─────────────────────────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function triple(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length < 3) return fallback;
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
}

function coercePrimitive(v: unknown): PlanPrimitive {
  const s = String(v || "").toLowerCase().trim();
  if ((PRIMITIVES as readonly string[]).includes(s)) return s as PlanPrimitive;
  // Common synonyms the models reach for.
  if (/capsule|pill|rod|tube|pipe|shaft/.test(s)) return "cylinder";
  if (/disc|disk|wheel|ring/.test(s)) return "cylinder";
  if (/cone|nose|taper|funnel/.test(s)) return "cone";
  if (/ball|dome|bubble/.test(s)) return "sphere";
  if (/torus|donut|doughnut|loop/.test(s)) return "torus";
  return "box";
}

function coerceMirror(v: unknown): PlanPart["mirror"] {
  const s = String(v || "").toLowerCase().trim();
  if (s === "x" || s === "y" || s === "z") return s;
  return undefined;
}

/** Turn arbitrary LLM JSON into a GeometryPlan. Pure — no network, no throw. */
export function coerceGeometryPlan(
  raw: unknown,
  topic: string,
  source: string,
): GeometryPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const rawParts = Array.isArray(o.parts) ? o.parts : [];
  const parts: PlanPart[] = [];

  for (const rp of rawParts) {
    if (!rp || typeof rp !== "object") continue;
    const p = rp as Record<string, unknown>;
    const size = triple(p.size ?? p.dimensions ?? p.scale, [0, 0, 0]);
    if (size.some((s) => !(s > 0))) continue;

    parts.push({
      name: String(p.name ?? p.id ?? `part_${parts.length + 1}`).slice(0, 60),
      primitive: coercePrimitive(p.primitive ?? p.type ?? p.shape),
      size,
      position: triple(p.position ?? p.location ?? p.offset, [0, 0, 0]),
      rotation: triple(p.rotation ?? p.rotate, [0, 0, 0]),
      mirror: coerceMirror(p.mirror ?? p.mirrorAxis),
    });
  }

  if (parts.length === 0) return null;

  return {
    topic,
    summary: String(o.summary ?? o.description ?? "").slice(0, 400),
    referenceProduct: String(o.referenceProduct ?? o.reference ?? topic).slice(0, 120),
    parts,
    source,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

function partAabb(part: PlanPart): Aabb {
  // Rotation is ignored on purpose: an axis-aligned envelope is a conservative
  // proxy, and every check here is about gross structure, not exact bounds.
  const [sx, sy, sz] = part.size;
  const [px, py, pz] = part.position;
  return {
    min: [px - sx / 2, py - sy / 2, pz - sz / 2],
    max: [px + sx / 2, py + sy / 2, pz + sz / 2],
  };
}

function overlapsOrTouches(a: Aabb, b: Aabb, slackMm: number): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] - slackMm > b.max[i]) return false;
    if (b.min[i] - slackMm > a.max[i]) return false;
  }
  return true;
}

/**
 * A mirrored part is a second real solid, so bounds, scaling and connectivity
 * all have to see it — otherwise a wheel that touches the mirrored leg looks
 * like it is floating in space.
 */
export function expandMirrors(parts: PlanPart[]): PlanPart[] {
  const out: PlanPart[] = [];
  for (const part of parts) {
    out.push(part);
    if (!part.mirror) continue;
    const axis = { x: 0, y: 1, z: 2 }[part.mirror];
    const position: [number, number, number] = [...part.position];
    position[axis] = -position[axis];
    out.push({ ...part, position, mirror: undefined });
  }
  return out;
}

export function planBounds(plan: GeometryPlan): Aabb {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of expandMirrors(plan.parts)) {
    const box = partAabb(part);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], box.min[i]);
      max[i] = Math.max(max[i], box.max[i]);
    }
  }
  return { min, max };
}

function partVolume(part: PlanPart): number {
  const [x, y, z] = part.size;
  switch (part.primitive) {
    case "sphere":
      return (Math.PI / 6) * x * y * z;
    case "cylinder":
      return (Math.PI / 4) * x * y * z;
    case "cone":
      return (Math.PI / 12) * x * y * z;
    case "torus":
      return (Math.PI * Math.PI / 4) * x * y * z * 0.25;
    case "box":
      return x * y * z;
    default: {
      const _exhaustive: never = part.primitive;
      return _exhaustive;
    }
  }
}

const MIN_PARTS = 4;
const MAX_ASPECT = 60;

/**
 * Deterministic structural checks. These exist to catch the specific failure
 * mode where the model shrugs and emits a ball, so they test for *structure*
 * (part count, shape variety, connectivity) rather than realism.
 */
export function validateGeometryPlan(plan: GeometryPlan | null | undefined): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: { label: string; pass: boolean }[] = [];

  const record = (label: string, pass: boolean, message?: string) => {
    checks.push({ label, pass });
    if (!pass && message) errors.push(message);
  };

  if (!plan || plan.parts.length === 0) {
    return {
      valid: false,
      errors: ["No geometry plan was produced"],
      warnings: [],
      checks: [{ label: "plan exists", pass: false }],
    };
  }

  const { parts } = plan;

  record(
    `has at least ${MIN_PARTS} parts`,
    parts.length >= MIN_PARTS,
    `Plan has only ${parts.length} part(s); a recognisable object needs at least ${MIN_PARTS}`,
  );

  const kinds = new Set(parts.map((p) => p.primitive));
  record(
    "uses more than one primitive type",
    kinds.size >= 2,
    `Every part is a ${[...kinds][0]} — that is a blob, not a model of "${plan.topic}"`,
  );

  const named = parts.filter((p) => !/^part_\d+$/.test(p.name)).length;
  record(
    "parts are named",
    named >= Math.ceil(parts.length / 2),
    "Most parts are unnamed, so the plan is not a real structural breakdown",
  );

  const finite = parts.every(
    (p) => p.size.every((s) => Number.isFinite(s) && s > 0) && p.position.every(Number.isFinite),
  );
  record("all sizes and positions are finite", finite, "Plan contains non-finite sizes or positions");

  const bounds = planBounds(plan);
  const extents = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const largest = Math.max(...extents);
  const smallest = Math.max(Math.min(...extents), 1e-6);
  record(
    "overall proportions are sane",
    largest / smallest <= MAX_ASPECT,
    `Overall shape is degenerate (aspect ratio ${(largest / smallest).toFixed(0)}:1)`,
  );

  // Connectivity: a part floating far from everything else means the plan is
  // scattered debris rather than one object.
  const slack = largest * 0.06;
  const boxes = expandMirrors(parts).map(partAabb);
  const orphans = boxes.filter(
    (box, i) => !boxes.some((other, j) => i !== j && overlapsOrTouches(box, other, slack)),
  ).length;
  record(
    "parts form a connected object",
    orphans === 0,
    `${orphans} part(s) float disconnected from the rest of the object`,
  );

  const volumes = parts.map(partVolume);
  const total = volumes.reduce((a, b) => a + b, 0);
  const dominant = total > 0 ? Math.max(...volumes) / total : 1;
  if (dominant > 0.92 && parts.length < 8) {
    warnings.push(
      `One part is ${(dominant * 100).toFixed(0)}% of the volume — detail parts may be too small to see`,
    );
  }

  if (!plan.summary) warnings.push("Plan has no summary describing the object");

  return { valid: errors.length === 0, errors, warnings, checks };
}

// ── Plan → OpenSCAD ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function partBody(part: PlanPart, scale: number): string {
  const [sx, sy, sz] = part.size.map((s) => s * scale) as [number, number, number];
  switch (part.primitive) {
    case "box":
      return `cube([${fmt(sx)}, ${fmt(sy)}, ${fmt(sz)}], center=true);`;
    case "cylinder":
      return `scale([1, ${fmt(sy / sx || 1)}, 1]) cylinder(h=${fmt(sz)}, r=${fmt(sx / 2)}, center=true, $fn=64);`;
    case "cone":
      return `scale([1, ${fmt(sy / sx || 1)}, 1]) cylinder(h=${fmt(sz)}, r1=${fmt(sx / 2)}, r2=${fmt(sx / 16)}, center=true, $fn=64);`;
    case "sphere":
      return `scale([1, ${fmt(sy / sx || 1)}, ${fmt(sz / sx || 1)}]) sphere(r=${fmt(sx / 2)}, $fn=48);`;
    case "torus":
      return `rotate_extrude($fn=64) translate([${fmt(Math.max(sx / 2 - sz / 2, sz / 2))}, 0, 0]) circle(r=${fmt(sz / 2)}, $fn=24);`;
    default: {
      const _exhaustive: never = part.primitive;
      return _exhaustive;
    }
  }
}

function emitPart(part: PlanPart, scale: number, position: [number, number, number]): string {
  const [px, py, pz] = position.map((p) => p * scale) as [number, number, number];
  const [rx, ry, rz] = part.rotation;
  const body = partBody(part, scale);
  const rotated = rx || ry || rz ? `rotate([${fmt(rx)}, ${fmt(ry)}, ${fmt(rz)}]) ${body}` : body;
  return `translate([${fmt(px)}, ${fmt(py)}, ${fmt(pz)}]) ${rotated}`;
}

/**
 * Compile a validated plan into OpenSCAD, normalised so the longest axis is
 * `targetUnits` — the render worker expects models at roughly that scale.
 */
export function planToOpenScad(plan: GeometryPlan, targetUnits = 4): string {
  const bounds = planBounds(plan);
  const extents = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const largest = Math.max(...extents, 1e-6);
  const scale = targetUnits / largest;

  const lines: string[] = [
    "$fn = 48;",
    `// ${plan.referenceProduct} — researched structural plan (${plan.parts.length} parts)`,
  ];
  if (plan.summary) lines.push(`// ${plan.summary.replace(/\n/g, " ")}`);

  for (const part of plan.parts) {
    lines.push(`// ${part.name}`);
    lines.push(emitPart(part, scale, part.position));
    if (part.mirror) {
      const axis = { x: 0, y: 1, z: 2 }[part.mirror];
      const mirrored: [number, number, number] = [...part.position];
      mirrored[axis] = -mirrored[axis];
      lines.push(emitPart(part, scale, mirrored));
    }
  }

  return lines.join("\n");
}

// ── Research ─────────────────────────────────────────────────────────────────

export function buildPlanPrompt(
  topic: string,
  spec: SpecSheet | null | undefined,
  feedback: string | null,
): string {
  const specBlock = spec?.dimensions?.length
    ? `\nVERIFIED REAL DIMENSIONS for ${spec.referenceProduct} — your plan MUST match these:\n` +
      spec.dimensions.map((d) => `- ${d.label}: ${d.value} ${d.unit}`).join("\n") +
      "\n"
    : "";

  const feedbackBlock = feedback
    ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix these problems:\n${feedback}\n`
    : "";

  return `You are a mechanical designer. Break the real object "${topic}" down into the
primitive solids a CAD model would be assembled from.
${specBlock}${feedbackBlock}
Return ONLY JSON in exactly this shape:
{
  "referenceProduct": "the specific real product you are modelling",
  "summary": "one sentence describing its shape",
  "parts": [
    {
      "name": "fuselage",
      "primitive": "box|cylinder|cone|sphere|torus",
      "size": [x, y, z],
      "position": [x, y, z],
      "rotation": [degX, degY, degZ],
      "mirror": "y"
    }
  ]
}

RULES:
1. All sizes and positions in MILLIMETRES, using the object's real-world size.
2. "size" is the full extent on each axis. For cylinder/cone, x and y are the
   diameters and z is the height before rotation.
3. "position" is the CENTRE of the part, relative to the object's own origin.
4. Use "mirror" for parts that exist as a symmetric pair (wheels, wings, legs,
   handles) and describe only the positive-axis one.
5. At least 6 parts. Name every part after the real component it represents.
6. Parts must touch or overlap so the result is ONE connected object.
7. Do NOT output a generic blob. If "${topic}" is a specific product, model that
   product's actual silhouette and proportions.

Return the JSON only — no markdown, no commentary.`;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to brace scan */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGroqForPlan(prompt: string, timeoutMs: number): Promise<unknown | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return extractJson(data?.choices?.[0]?.message?.content || "");
  } catch {
    return null;
  }
}

export interface PlanResult {
  plan: GeometryPlan | null;
  validation: PlanValidation;
  attempts: number;
}

/**
 * Research a structural plan for a topic, retrying with the validator's
 * complaints fed back in. Returns an invalid result rather than a blob so the
 * caller can fail loudly.
 */
export async function researchGeometryPlan(
  topic: string,
  spec: SpecSheet | null | undefined,
  opts: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<PlanResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxAttempts = opts.maxAttempts ?? 2;

  let feedback: string | null = null;
  let best: GeometryPlan | null = null;
  let bestValidation: PlanValidation = validateGeometryPlan(null);
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const prompt = buildPlanPrompt(topic, spec, feedback);

    let raw: unknown = null;
    let source = "";

    const gem = await geminiGenerate(prompt, { timeoutMs, json: true });
    if (gem) {
      raw = extractJson(gem.text);
      source = gem.model;
    }
    if (!raw) {
      raw = await callGroqForPlan(prompt, timeoutMs);
      source = "llama-3.3-70b-versatile";
    }

    const plan = coerceGeometryPlan(raw, topic, source);
    const validation = validateGeometryPlan(plan);

    if (validation.valid) {
      console.log(`[geometryPlan] "${topic}" → ${plan?.parts.length} parts via ${source}`);
      return { plan, validation, attempts };
    }

    if (plan && validation.errors.length < bestValidation.errors.length) {
      best = plan;
      bestValidation = validation;
    }
    feedback = validation.errors.map((e) => `- ${e}`).join("\n");
    console.warn(`[geometryPlan] "${topic}" attempt ${attempts} rejected: ${validation.errors.join("; ")}`);
  }

  return { plan: best, validation: bestValidation, attempts };
}
