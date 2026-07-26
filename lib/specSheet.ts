/**
 * Spec Sheet — grounded dimensional research for 3D/CAD generation.
 *
 * The problem this solves: when an LLM writes both the geometry logic AND the
 * numbers, the numbers are plausible but arbitrary. A "tennis racket" comes out
 * 40cm long with a circular head. The fix is to split those two jobs:
 *
 *   1. Research a real reference product and extract a DIMENSIONED spec sheet.
 *   2. Validate those dimensions deterministically (no LLM) — units, ranges,
 *      and cross-consistency (does the stated area match the stated w×h?).
 *   3. Inject the validated numbers into the generator as CONSTANTS, so the
 *      model writes geometry logic and never invents a measurement.
 *
 * Stage 2 is the part that catches hallucinations, and it is pure functions —
 * unit-testable with no network.
 */

// ── Model chain ──────────────────────────────────────────────────────────────
// Verified against the live ListModels endpoint. Notes:
//  - gemini-1.5-flash / gemini-2.5-flash return 404/"no longer available".
//  - Google Search grounding (tools:[{google_search:{}}]) returns HTTP 429 on
//    the free tier — it is a billed feature. Gated behind ENABLE_SEARCH_GROUNDING
//    so it can be switched on later without touching code.
//  - gemini-3.x are THINKING models: they spend output budget on internal
//    reasoning before emitting a token. At maxOutputTokens=1200 they return a
//    completely empty response. Measured ~970 thought tokens for a spec query,
//    hence the generous budget below.
export const GEMINI_CHAIN = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-2.0-flash"] as const;

/** Models that used to be in the chain and now return 404. Asserted against in tests. */
export const RETIRED_GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"] as const;
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_RESEARCH_MODEL = "meta/llama-3.1-405b-instruct";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_RESEARCH_MODEL = "llama-3.3-70b-versatile";

export const searchGroundingEnabled = () =>
  process.env.ENABLE_SEARCH_GROUNDING === "1" || process.env.ENABLE_SEARCH_GROUNDING === "true";

// ── Types ────────────────────────────────────────────────────────────────────

export type UnitClass = "length" | "area" | "mass" | "angle" | "count" | "ratio" | "unknown";

export interface SpecDimension {
  key: string;
  label: string;
  /** Value normalised to the canonical unit for its class (mm, mm2, g, deg). */
  value: number;
  /** Canonical unit: mm | mm2 | g | deg | count | ratio */
  unit: string;
  /** What the model originally said, preserved for display and auditing. */
  rawValue: number;
  rawUnit: string;
  unitClass: UnitClass;
  confidence: number;
}

export interface SpecSheet {
  topic: string;
  referenceProduct: string;
  category: string;
  dimensions: SpecDimension[];
  /** Non-numeric facts, e.g. stringPattern "16x19", material "graphite". */
  attributes: Record<string, string>;
  notes: string[];
  source: "gemini" | "nvidia" | "groq" | "none";
  model: string;
  generatedAt: string;
}

export interface SpecValidation {
  valid: boolean;
  /** Blocking problems — the spec should be re-queried. */
  errors: string[];
  /** Non-blocking oddities worth surfacing but safe to build with. */
  warnings: string[];
  /** Deterministic checks that ran, for UI display. */
  checks: { label: string; pass: boolean }[];
}

// ── Unit normalisation ───────────────────────────────────────────────────────

interface UnitDef { cls: UnitClass; canonical: string; factor: number }

/** Multiplier to the canonical unit of each class. */
const UNITS: Record<string, UnitDef> = {
  // length → mm
  mm: { cls: "length", canonical: "mm", factor: 1 },
  millimeter: { cls: "length", canonical: "mm", factor: 1 },
  millimetre: { cls: "length", canonical: "mm", factor: 1 },
  cm: { cls: "length", canonical: "mm", factor: 10 },
  centimeter: { cls: "length", canonical: "mm", factor: 10 },
  centimetre: { cls: "length", canonical: "mm", factor: 10 },
  m: { cls: "length", canonical: "mm", factor: 1000 },
  meter: { cls: "length", canonical: "mm", factor: 1000 },
  metre: { cls: "length", canonical: "mm", factor: 1000 },
  km: { cls: "length", canonical: "mm", factor: 1_000_000 },
  in: { cls: "length", canonical: "mm", factor: 25.4 },
  inch: { cls: "length", canonical: "mm", factor: 25.4 },
  inches: { cls: "length", canonical: "mm", factor: 25.4 },
  ft: { cls: "length", canonical: "mm", factor: 304.8 },
  foot: { cls: "length", canonical: "mm", factor: 304.8 },
  feet: { cls: "length", canonical: "mm", factor: 304.8 },

  // Area units are NOT listed here — lookupUnit() derives them by squaring the
  // base length factor, so mm2 / in² / "sq in" all resolve without table rows.

  // mass → g
  g: { cls: "mass", canonical: "g", factor: 1 },
  gram: { cls: "mass", canonical: "g", factor: 1 },
  grams: { cls: "mass", canonical: "g", factor: 1 },
  kg: { cls: "mass", canonical: "g", factor: 1000 },
  kilogram: { cls: "mass", canonical: "g", factor: 1000 },
  oz: { cls: "mass", canonical: "g", factor: 28.349523 },
  ounce: { cls: "mass", canonical: "g", factor: 28.349523 },
  lb: { cls: "mass", canonical: "g", factor: 453.59237 },
  lbs: { cls: "mass", canonical: "g", factor: 453.59237 },
  pound: { cls: "mass", canonical: "g", factor: 453.59237 },

  // angle → deg
  deg: { cls: "angle", canonical: "deg", factor: 1 },
  degree: { cls: "angle", canonical: "deg", factor: 1 },
  degrees: { cls: "angle", canonical: "deg", factor: 1 },
  rad: { cls: "angle", canonical: "deg", factor: 57.29578 },
  radian: { cls: "angle", canonical: "deg", factor: 57.29578 },

  // dimensionless
  count: { cls: "count", canonical: "count", factor: 1 },
  unitless: { cls: "ratio", canonical: "ratio", factor: 1 },
  ratio: { cls: "ratio", canonical: "ratio", factor: 1 },
  "%": { cls: "ratio", canonical: "ratio", factor: 1 },
};

/**
 * Resolve the messy unit strings LLMs emit — "sq in", "in²", "square inches",
 * "mm^2", "inches", "lbs" — into a canonical unit definition.
 *
 * Squared units are derived rather than enumerated: we strip the square marker,
 * resolve the base length unit, then square its factor. That way "sq in" and
 * "in²" and "in^2" all land on 25.4² = 645.16 mm² without separate table rows.
 */
export function lookupUnit(raw: string): UnitDef {
  const original = String(raw || "").trim().toLowerCase();

  let body = original.replace(/²/g, "2").replace(/\^/g, "");

  // "sq in", "square inches", "sqmm"
  const squareWord = /\b(?:sq|square)\b\.?/.test(body) || /^sq(?=[a-z])/.test(body);
  body = body.replace(/\b(?:sq|square)\b\.?/g, " ").replace(/^sq(?=[a-z])/, " ");
  body = body.replace(/[\s.]+/g, "");

  // "mm2", "in2" — trailing 2 means squared (no base unit in our table ends in 2)
  const trailingTwo = /2$/.test(body);
  if (trailingTwo) body = body.slice(0, -1);

  const isSquare = squareWord || trailingTwo;

  let def = UNITS[body];
  if (!def && body.endsWith("s")) def = UNITS[body.slice(0, -1)];
  if (!def) return { cls: "unknown", canonical: original || "unknown", factor: 1 };

  if (isSquare) {
    if (def.cls === "length") {
      return { cls: "area", canonical: "mm2", factor: def.factor * def.factor };
    }
    if (def.cls === "area") return def;
  }
  return def;
}

/** Convert a raw value+unit into its canonical form. Pure. */
export function normaliseDimension(rawValue: number, rawUnit: string) {
  const def = lookupUnit(rawUnit);
  return {
    value: rawValue * def.factor,
    unit: def.canonical,
    unitClass: def.cls,
  };
}

// ── Deterministic validation (no LLM, no network) ─────────────────────────────

/**
 * Physically sane envelopes in canonical units. Deliberately generous: this is
 * a net for nonsense (a 3 km tennis racket), not a per-topic assertion. The
 * upper bounds are sized for the largest machinery anyone reasonably simulates —
 * a Vestas V164's swept area is 21,124 m², i.e. 2.1e10 mm², which an earlier
 * 1e9 ceiling wrongly rejected.
 */
const RANGES: Partial<Record<UnitClass, { min: number; max: number }>> = {
  length: { min: 0.05, max: 1_000_000 },    // 0.05 mm .. 1 km
  area: { min: 0.01, max: 1e12 },           // .. 1 km²
  mass: { min: 0.001, max: 1e12 },          // 1 mg .. 1e6 tonnes
  angle: { min: -360, max: 360 },
  count: { min: 0, max: 100_000 },
  ratio: { min: -1e6, max: 1e6 },
};

/**
 * Validate a spec sheet with pure logic. This is the hallucination filter:
 * an LLM will happily report a 100 sq-in racket head that is 12mm wide, and
 * only a cross-consistency check catches it.
 */
export function validateSpecSheet(spec: SpecSheet | null | undefined): SpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: { label: string; pass: boolean }[] = [];

  const push = (label: string, pass: boolean) => checks.push({ label, pass });

  if (!spec) {
    return { valid: false, errors: ["No spec sheet provided"], warnings: [], checks };
  }

  const dims = Array.isArray(spec.dimensions) ? spec.dimensions : [];

  const hasDims = dims.length >= 3;
  push("At least 3 dimensions", hasDims);
  if (!hasDims) errors.push(`Only ${dims.length} dimension(s) — need at least 3 to model anything`);

  const named = !!spec.referenceProduct && spec.referenceProduct.length > 2;
  push("Named reference product", named);
  if (!named) warnings.push("No named reference product — dimensions may be generic averages");

  // Every value finite
  const nonFinite = dims.filter((d) => !Number.isFinite(d.value));
  push("All values numeric", nonFinite.length === 0);
  if (nonFinite.length) errors.push(`Non-numeric values: ${nonFinite.map((d) => d.key).join(", ")}`);

  // Units recognised
  const unknownUnits = dims.filter((d) => d.unitClass === "unknown");
  push("All units recognised", unknownUnits.length === 0);
  if (unknownUnits.length) {
    warnings.push(`Unrecognised units: ${unknownUnits.map((d) => `${d.key}(${d.rawUnit})`).join(", ")}`);
  }

  // Range sanity
  const outOfRange: string[] = [];
  for (const d of dims) {
    const r = RANGES[d.unitClass];
    if (!r || !Number.isFinite(d.value)) continue;
    if (d.value < r.min || d.value > r.max) {
      outOfRange.push(`${d.key}=${d.value}${d.unit} (expected ${r.min}..${r.max})`);
    }
  }
  push("Values physically plausible", outOfRange.length === 0);
  if (outOfRange.length) errors.push(`Out of plausible range: ${outOfRange.join("; ")}`);

  // Duplicate keys
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const d of dims) {
    const k = d.key.toLowerCase();
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  push("No duplicate dimension keys", dupes.size === 0);
  if (dupes.size) warnings.push(`Duplicate keys: ${[...dupes].join(", ")}`);

  // Cross-consistency: an *_area should agree with its matching *_width/*_height.
  // Checked against both rectangular (w*h) and elliptical (pi/4*w*h) models,
  // since "head area" on a racket is an ellipse but a plate is a rectangle.
  const byKey = new Map(dims.map((d) => [d.key.toLowerCase(), d]));
  let crossChecked = 0;
  let crossFailed = 0;
  for (const d of dims) {
    const k = d.key.toLowerCase();
    if (d.unitClass !== "area" || !k.endsWith("_area")) continue;
    const stem = k.slice(0, -"_area".length);
    const w = byKey.get(`${stem}_width`);
    const h = byKey.get(`${stem}_height`) ?? byKey.get(`${stem}_length`);
    if (!w || !h || w.unitClass !== "length" || h.unitClass !== "length") continue;

    crossChecked++;
    const rect = w.value * h.value;
    const ellipse = (Math.PI / 4) * w.value * h.value;
    const closest = Math.abs(d.value - rect) < Math.abs(d.value - ellipse) ? rect : ellipse;
    // 25% tolerance: shapes are not perfect rectangles or ellipses.
    const ratio = closest > 0 ? d.value / closest : Infinity;
    if (ratio < 0.75 || ratio > 1.25) {
      crossFailed++;
      errors.push(
        `${d.key}=${Math.round(d.value)}mm2 is inconsistent with ${w.key}×${h.key} ` +
        `(${Math.round(w.value)}×${Math.round(h.value)}mm ⇒ ${Math.round(closest)}mm2)`,
      );
    }
  }
  if (crossChecked > 0) push(`Area/dimension cross-check (${crossChecked})`, crossFailed === 0);

  // Confidence
  const lowConf = dims.filter((d) => Number.isFinite(d.confidence) && d.confidence < 0.4);
  push("No very-low-confidence values", lowConf.length === 0);
  if (lowConf.length) warnings.push(`Low confidence: ${lowConf.map((d) => d.key).join(", ")}`);

  return { valid: errors.length === 0, errors, warnings, checks };
}

// ── Prompt formatting ────────────────────────────────────────────────────────

/**
 * Render a validated spec as CONSTANTS for a code-generation prompt.
 * The generator is told to use these verbatim and never substitute its own.
 */
export function formatSpecForPrompt(spec: SpecSheet, validation?: SpecValidation): string {
  if (!spec || !spec.dimensions?.length) return "";

  const lines = spec.dimensions.map((d) => {
    const raw = d.rawUnit && d.rawUnit !== d.unit ? `  (as sourced: ${d.rawValue} ${d.rawUnit})` : "";
    return `  ${d.key} = ${round(d.value)} ${d.unit}${raw}`;
  });

  const attrs = Object.entries(spec.attributes || {}).map(([k, v]) => `  ${k} = ${v}`);

  const warn = validation?.warnings?.length
    ? `\nNOTE — unverified values, treat with care:\n${validation.warnings.map((w) => `  - ${w}`).join("\n")}`
    : "";

  return `══════ VERIFIED SPEC SHEET — "${spec.topic}" ══════
Reference product: ${spec.referenceProduct || "(generic)"}
Category: ${spec.category || "unknown"}

These measurements were researched and dimensionally validated.
USE THESE EXACT NUMBERS. Do NOT substitute your own estimates.
All lengths are millimetres, areas mm2, masses grams, angles degrees.

DIMENSIONS:
${lines.join("\n")}
${attrs.length ? `\nATTRIBUTES:\n${attrs.join("\n")}` : ""}
${spec.notes?.length ? `\nNOTES:\n${spec.notes.map((n) => `  - ${n}`).join("\n")}` : ""}${warn}

Derive all proportions from the numbers above: compute ratios relative to the
largest length so the model is correctly proportioned, then scale to fit view.
══════ END SPEC SHEET ══════`;
}

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
}

// ── Research prompt ──────────────────────────────────────────────────────────

function buildSpecPrompt(topic: string): string {
  return `You are a mechanical engineering researcher compiling a dimensioned spec sheet.

TOPIC: "${topic}"

Identify a SPECIFIC, REAL, well-documented reference example of this object (an actual
product, model number, or standardised specification — not a generic average). Then
report its measured dimensions.

Output ONLY a JSON object, no markdown fences, no commentary:

{
  "referenceProduct": "<specific real product or standard, e.g. 'Babolat Pure Drive 2021' or 'ISO 4210 city bicycle'>",
  "category": "<short category, e.g. 'sports equipment' | 'rotating machinery' | 'structure'>",
  "dimensions": [
    {
      "key": "snake_case_name",
      "label": "Human Readable Name",
      "value": <number only, no units in this field>,
      "unit": "<mm|cm|m|in|ft|mm2|cm2|in2|g|kg|oz|lb|deg|count|ratio>",
      "confidence": <0.0-1.0>
    }
  ],
  "attributes": { "<non_numeric_fact>": "<value>" },
  "notes": ["<modelling-relevant observation>"]
}

RULES
- 6 to 14 dimensions. Cover overall envelope (length/width/height or diameter) plus
  the major sub-features someone would need to model it.
- Naming: if you give an area for a feature, ALSO give that feature's width and
  height using the SAME stem, so they can be cross-checked.
  Example: head_area + head_width + head_height.
- "value" must be a bare number. Units belong in "unit".
- Use real measured values for the reference product you named. If you are
  estimating rather than recalling, lower the confidence accordingly.
- Non-numeric facts (string patterns, materials, colours, gear ratios expressed
  as "3:1") go in "attributes", NOT in "dimensions".
- Report counts (number of blades, teeth, spokes) as dimensions with unit "count".`;
}

// ── Provider calls ───────────────────────────────────────────────────────────

function extractJson(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const m = candidate.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    // Trailing-comma and single-quote repair
    try {
      return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"'));
    } catch {
      return null;
    }
  }
}

/**
 * Single source of truth for calling Gemini. Walks the live-model chain and
 * returns the first usable response.
 *
 * Everything that talks to Gemini should go through here — the previous code
 * duplicated the chain in two routes, and both copies still pointed at
 * gemini-1.5-flash, which has been retired and returns 404.
 */
export async function geminiGenerate(
  prompt: string,
  opts: { timeoutMs?: number; json?: boolean; maxOutputTokens?: number } = {},
): Promise<{ text: string; model: string } | null> {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return null;

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const useGrounding = searchGroundingEnabled();

  for (const model of GEMINI_CHAIN) {
    try {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
        maxOutputTokens: opts.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS,
      };
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      };

      if (useGrounding) {
        // Billed feature — and it cannot be combined with a JSON mime type.
        body.tools = [{ google_search: {} }];
      } else if (opts.json) {
        // Free tier: JSON mode beats regex-extracting from prose.
        generationConfig.responseMimeType = "application/json";
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`[gemini] ${model} HTTP ${res.status}: ${detail.slice(0, 140)}`);
        continue;
      }

      const data = await res.json();
      const cand = data?.candidates?.[0];
      // Thinking models spend output budget on reasoning first; if the budget
      // runs out they return a candidate with no text at all.
      if (cand?.finishReason === "MAX_TOKENS") {
        console.warn(`[gemini] ${model} hit MAX_TOKENS before emitting output`);
        continue;
      }
      const text = (cand?.content?.parts || [])
        .map((p: { text?: string }) => p.text || "")
        .join("");
      if (text.trim()) return { text, model };
      console.warn(`[gemini] ${model} returned empty text`);
    } catch (e) {
      console.warn(`[gemini] ${model} error:`, String(e).slice(0, 140));
    }
  }
  return null;
}

async function callGemini(topic: string, timeoutMs: number): Promise<{ raw: unknown; model: string } | null> {
  const out = await geminiGenerate(buildSpecPrompt(topic), { timeoutMs, json: true });
  if (!out) return null;
  const parsed = extractJson(out.text);
  if (!parsed) {
    console.warn(`[specSheet] ${out.model} returned unparseable output (${out.text.length} chars)`);
    return null;
  }
  console.log(`[specSheet] spec via ${out.model}`);
  return { raw: parsed, model: out.model };
}

async function callOpenAICompatible(
  topic: string,
  base: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<unknown | null> {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 2500,
        messages: [{ role: "user", content: buildSpecPrompt(topic) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return extractJson(data?.choices?.[0]?.message?.content || "");
  } catch {
    return null;
  }
}

// ── Coercion: raw LLM JSON → validated SpecSheet ─────────────────────────────

/** Turn arbitrary LLM JSON into a normalised SpecSheet. Pure. */
export function coerceSpecSheet(
  raw: unknown,
  topic: string,
  source: SpecSheet["source"],
  model: string,
): SpecSheet | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const rawDims = Array.isArray(o.dimensions) ? o.dimensions : [];
  const dimensions: SpecDimension[] = [];

  for (const item of rawDims) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;

    const key = String(d.key ?? d.name ?? "").trim();
    if (!key) continue;

    // Models sometimes emit "27 in" in the value field despite instructions.
    let rawValue = Number(d.value);
    let rawUnit = String(d.unit ?? "").trim();
    if (!Number.isFinite(rawValue)) {
      const m = String(d.value ?? "").match(/(-?\d+\.?\d*)\s*(.*)/);
      if (!m) continue;
      rawValue = Number(m[1]);
      if (!rawUnit && m[2]) rawUnit = m[2].trim();
    }
    if (!Number.isFinite(rawValue)) continue;

    const { value, unit, unitClass } = normaliseDimension(rawValue, rawUnit);
    const conf = Number(d.confidence);

    dimensions.push({
      key: key.replace(/\s+/g, "_").toLowerCase(),
      label: String(d.label ?? key),
      value,
      unit,
      rawValue,
      rawUnit: rawUnit || unit,
      unitClass,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    });
  }

  const attributes: Record<string, string> = {};
  if (o.attributes && typeof o.attributes === "object") {
    for (const [k, v] of Object.entries(o.attributes as Record<string, unknown>)) {
      if (v == null) continue;
      attributes[k] = String(v);
    }
  }

  return {
    topic,
    referenceProduct: String(o.referenceProduct ?? o.reference ?? "").trim(),
    category: String(o.category ?? "").trim(),
    dimensions,
    attributes,
    notes: Array.isArray(o.notes) ? o.notes.map(String).slice(0, 10) : [],
    source,
    model,
    generatedAt: new Date().toISOString(),
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

export interface ResearchSpecResult {
  spec: SpecSheet | null;
  validation: SpecValidation;
  /** Provider round-trips actually made. 0 when served from cache. */
  attempts: number;
  cached: boolean;
}

// ── Server-side cache ────────────────────────────────────────────────────────
// Research costs 8–13s. The same topic is commonly requested twice in quick
// succession (the notes pipeline and the 3D pipeline both want specs), and the
// specs for a real product do not change. Caching here rather than in the client
// store means both routes benefit with no plumbing.

interface CacheEntry { result: ResearchSpecResult; expiresAt: number }

const SPEC_CACHE = new Map<string, CacheEntry>();
const IN_FLIGHT = new Map<string, Promise<ResearchSpecResult>>();
const VALID_TTL_MS = 24 * 60 * 60 * 1000;
/** Shorter, so a bad result is retried soon but a broken topic can't hammer the API. */
const INVALID_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;

const cacheKey = (topic: string) => topic.trim().toLowerCase().replace(/\s+/g, " ");

export function getCachedSpec(topic: string): ResearchSpecResult | null {
  const entry = SPEC_CACHE.get(cacheKey(topic));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    SPEC_CACHE.delete(cacheKey(topic));
    return null;
  }
  return entry.result;
}

export function clearSpecCache(): void {
  SPEC_CACHE.clear();
  IN_FLIGHT.clear();
}

export function specCacheStats() {
  return { entries: SPEC_CACHE.size, inFlight: IN_FLIGHT.size };
}

function cacheSpec(topic: string, result: ResearchSpecResult): void {
  if (!result.spec) return; // never cache a total failure
  if (SPEC_CACHE.size >= CACHE_MAX) {
    // Oldest-inserted eviction; Map preserves insertion order.
    const oldest = SPEC_CACHE.keys().next().value;
    if (oldest !== undefined) SPEC_CACHE.delete(oldest);
  }
  SPEC_CACHE.set(cacheKey(topic), {
    result,
    expiresAt: Date.now() + (result.validation.valid ? VALID_TTL_MS : INVALID_TTL_MS),
  });
}

/**
 * Research and validate a spec sheet for a topic.
 *
 * Retries once when validation produces blocking errors, because the most
 * common failure is a single inconsistent number rather than a broken response.
 *
 * Results are cached, and concurrent requests for the same topic share one
 * in-flight lookup rather than each paying the full latency.
 */
export async function researchSpecSheet(
  topic: string,
  opts: { timeoutMs?: number; retryOnInvalid?: boolean; noCache?: boolean } = {},
): Promise<ResearchSpecResult> {
  const key = cacheKey(topic);

  if (!opts.noCache) {
    const hit = getCachedSpec(topic);
    if (hit) {
      console.log(`[specSheet] cache hit for "${key}"`);
      return { ...hit, attempts: 0, cached: true };
    }
    const pending = IN_FLIGHT.get(key);
    if (pending) {
      console.log(`[specSheet] joining in-flight lookup for "${key}"`);
      const shared = await pending;
      return { ...shared, attempts: 0, cached: true };
    }
  }

  const work = researchSpecSheetUncached(topic, opts);
  if (!opts.noCache) IN_FLIGHT.set(key, work);

  try {
    const result = await work;
    if (!opts.noCache) cacheSpec(topic, result);
    return result;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

async function researchSpecSheetUncached(
  topic: string,
  opts: { timeoutMs?: number; retryOnInvalid?: boolean } = {},
): Promise<ResearchSpecResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const retryOnInvalid = opts.retryOnInvalid ?? true;
  let attempts = 0;

  const tryOnce = async (): Promise<SpecSheet | null> => {
    attempts++;

    const g = await callGemini(topic, timeoutMs);
    if (g) {
      const spec = coerceSpecSheet(g.raw, topic, "gemini", g.model);
      if (spec?.dimensions.length) return spec;
    }

    if (process.env.NVIDIA_API_KEY) {
      const raw = await callOpenAICompatible(
        topic, NVIDIA_BASE, process.env.NVIDIA_API_KEY, NVIDIA_RESEARCH_MODEL, timeoutMs,
      );
      const spec = coerceSpecSheet(raw, topic, "nvidia", NVIDIA_RESEARCH_MODEL);
      if (spec?.dimensions.length) return spec;
    }

    if (process.env.GROQ_API_KEY) {
      const raw = await callOpenAICompatible(
        topic, GROQ_BASE, process.env.GROQ_API_KEY, GROQ_RESEARCH_MODEL, timeoutMs,
      );
      const spec = coerceSpecSheet(raw, topic, "groq", GROQ_RESEARCH_MODEL);
      if (spec?.dimensions.length) return spec;
    }

    return null;
  };

  let spec = await tryOnce();
  let validation = validateSpecSheet(spec);

  if (!validation.valid && retryOnInvalid) {
    console.warn(`[specSheet] validation failed for "${topic}": ${validation.errors.join("; ")} — retrying`);
    const second = await tryOnce();
    const secondValidation = validateSpecSheet(second);
    // Keep whichever is better rather than blindly preferring the retry.
    if (secondValidation.valid || secondValidation.errors.length < validation.errors.length) {
      spec = second;
      validation = secondValidation;
    }
  }

  return { spec, validation, attempts, cached: false };
}
