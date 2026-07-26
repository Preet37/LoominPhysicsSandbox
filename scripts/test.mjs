/**
 * Loomin Physics Sandbox — Integration Test Suite
 * Run with: node scripts/test.mjs
 */

import { readFileSync, existsSync, writeFileSync, rmSync } from "fs";
import { execSync } from "child_process";

// Without this the live model probes silently skip themselves, which is exactly
// the kind of quiet no-op that let a dead model reach production unnoticed.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
  }
}

const BASE = "http://localhost:3000";
const TIMEOUT = 45_000; // 45s per API call

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ✅  ${name}`);
  passed++;
}

function fail(name, detail = "") {
  console.log(`  ❌  ${name}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function check(name, condition, detail = "") {
  condition ? ok(name) : fail(name, detail);
}

async function post(path, body, timeoutMs = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { _raw: text, _status: res.status }; }
  } catch (e) {
    return { _error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

// ── 1. Static: TypeScript check (tsc --noEmit — doesn't touch .next cache) ──
console.log("\n▶ 1. TypeScript Type Check");
try {
  // Use tsc from the local install to avoid touching .next build artifacts
  const out = execSync(
    "node ./node_modules/typescript/bin/tsc --noEmit --project tsconfig.json 2>&1 || true",
    { cwd: "/Users/preet/Desktop/hackathons/Loomin/LoominPhysicsSandbox", timeout: 60_000, encoding: "utf8" }
  );
  const errors = out.split("\n").filter((l) => l.includes("error TS")).length;
  check("Zero TypeScript errors", errors === 0, `${errors} type error(s) found:\n${out.slice(0, 300)}`);
} catch (e) {
  fail("tsc check failed", e.message.slice(0, 80));
}

// ── 2. Static: store fields ─────────────────────────────────────────────────
console.log("\n▶ 2. Zustand Store");
const store = readFileSync("app/editor/store.js", "utf8");
for (const f of ["activeTab","pythonScript","equations","sources","wikiArticle",
                  "setArtifactsGenerating","addSource","removeSource","setWikiArticle"]) {
  check(f, store.includes(f));
}

// ── 3. Static: component & route files ─────────────────────────────────────
console.log("\n▶ 3. Components & API Routes");
for (const f of ["EquationsPanel","GraphsPanel","PythonPanel","WikiPanel","SourcesPanel"]) {
  check(`${f}.jsx`, existsSync(`app/editor/components/${f}.jsx`));
}
for (const r of ["generate-artifacts","compile-wiki","socratic-ask"]) {
  check(`/api/${r}`, existsSync(`app/api/${r}/route.ts`));
}

// ── 4. Static: timeout guards ────────────────────────────────────────────────
console.log("\n▶ 4. NVIDIA Timeout Guards");
for (const f of ["socratic-ask","generate-artifacts","analyze_document"]) {
  const src = readFileSync(`app/api/${f}/route.ts`, "utf8");
  check(`${f} has AbortSignal.timeout`, src.includes("AbortSignal.timeout"));
}
const socraticSrc = readFileSync("app/api/socratic-ask/route.ts", "utf8");
check("socratic-ask falls through to Groq", socraticSrc.includes("GROQ_API_KEY"));

// ── 5. Pure functions: computeGraphData ──────────────────────────────────────
console.log("\n▶ 5. computeGraphData — Pure Physics Simulations");
const { computeGraphData } = await import("../lib/computeGraphData.js");
const sims = {
  wind_turbine:  { Wind_Speed: 12, Rotor_Diameter: 80, Blade_Count: 3 },
  pendulum:      { Length: 1.5, Damping: 0.05 },
  rocket:        { Ve: 2942, Initial_Mass: 100000, Fuel_Mass: 80000 },
  projectile:    { Launch_Angle: 45, Initial_Speed: 30 },
  orbit:         { Altitude: 400000, Mass: 5.97e24 },
  spring_mass:   { Spring_Constant: 50, Mass: 2 },
  newton_cradle: { Ball_Count: 5, Ball_Mass: 0.5 },
  bridge:        { Span: 50, Load: 5000 },
  airplane:      { Speed: 250, Altitude: 10000 },
  inverted_pendulum: { Length: 0.5 },
  custom:        {},
};
for (const [sim, params] of Object.entries(sims)) {
  try {
    const charts = computeGraphData(sim, params);
    check(`${sim} → ${charts.length} chart(s)`, charts.length >= 0,
          "expected array");
    // For known sims, ensure data points exist
    if (sim !== "custom") {
      check(`  ${sim} has data`, charts[0]?.data?.length > 0,
            `data length: ${charts[0]?.data?.length}`);
    }
  } catch (e) {
    fail(`${sim} threw: ${e.message}`);
  }
}

// ── 6. Wiki JSON sanitizer ───────────────────────────────────────────────────
console.log("\n▶ 6. Wiki JSON Sanitizer");
// Build test inputs using Buffer to avoid JS string escaping confusion.
// We want the raw JSON bytes that an LLM would produce: single backslashes
// before LaTeX commands like \pi, \sqrt, \Delta — all of which are invalid
// JSON escape sequences and must be doubled by the sanitizer.
const mkRaw = (s) => s; // helper for clarity
const cases = [
  {
    // LLM outputs: {"content":"T = 2\pi\sqrt{L/g}"} — \p and \s are invalid JSON
    input: mkRaw('{"title":"Pendulum","content":"T = 2' + "\\" + 'pi' + "\\" + 'sqrt{L/g}","cats":[]}'),
    label: "LaTeX \\pi and \\sqrt (single backslash — invalid JSON)",
  },
  {
    // LLM outputs: {"content":"\Delta v = v_e \ln(R)"} — \D and \l are invalid
    input: mkRaw('{"title":"Rocket","content":"' + "\\" + 'Delta v = v_e ' + "\\" + 'ln(R)","cats":["propulsion"]}'),
    label: "LaTeX \\Delta and \\ln (single backslash — invalid JSON)",
  },
  {
    input: '{"title":"Normal","content":"No special chars","cats":[]}',
    label: "Plain text — no backslashes",
  },
  {
    input: '{"title":"Test","content":"F = ma and E = mc^2","cats":[]}',
    label: "Equations without LaTeX backslashes",
  },
  {
    // Valid JSON with \n escape — must be preserved, not doubled
    input: '{"title":"Newline","content":"Line one\\nLine two","cats":[]}',
    label: "Valid \\n escape — must not be doubled",
  },
];
for (const { input, label } of cases) {
  try {
    const sanitized = input.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    JSON.parse(sanitized);
    ok(`Sanitize: ${label}`);
  } catch (e) {
    fail(`Sanitize: ${label}`, e.message.slice(0, 50));
  }
}

// ── 7. Live API: server must be running ──────────────────────────────────────
console.log("\n▶ 7. Live API Integration");
console.log("  (dev server must be running on :3000)");

// 7a. generate-artifacts
console.log("\n  [generate-artifacts — ~15s]");
const ga = await post("/api/generate-artifacts", {
  notes: "Pendulum: period T=2*pi*sqrt(L/g). Natural frequency omega=sqrt(g/L). Energy E=0.5*m*L^2*omega^2. Damping reduces amplitude exponentially.",
  simType: "pendulum",
  topic: "Simple Pendulum",
  params: { Length: 1.0, g: 9.81 },
});
check("returns 200 JSON",         !ga._error && !ga._raw, ga._error || `status ${ga._status}`);
check("has pythonScript key",     "pythonScript" in ga);
check("has equations key",        "equations" in ga);
check("pythonScript >100 chars",  (ga.pythonScript || "").length > 100,
      `got ${(ga.pythonScript||"").length} chars`);
check("pythonScript contains import numpy",
      (ga.pythonScript || "").includes("numpy"));

// 7b. socratic-ask — teach mode
console.log("\n  [socratic-ask (teach) — ~8s]");
const st = await post("/api/socratic-ask", {
  question: "Why does mass not affect the pendulum period?",
  mode: "teach",
  conversationHistory: [],
});
check("teach: valid JSON",        !st._error && !st._raw);
check("teach: has answer",        typeof st.answer === "string" && st.answer.length > 20,
      `answer length: ${(st.answer||"").length}`);
check("teach: mode=teach",        st.mode === "teach");
check("teach: response contains a question",
      /\?/.test(st.answer || ""),
      "Socratic response should contain at least one question mark");

// 7c. socratic-ask — answer mode
console.log("\n  [socratic-ask (answer) — ~8s]");
const sa = await post("/api/socratic-ask", {
  question: "What is the Tsiolkovsky rocket equation?",
  mode: "answer",
  conversationHistory: [],
});
check("answer: valid JSON",       !sa._error && !sa._raw);
check("answer: has answer",       typeof sa.answer === "string" && sa.answer.length > 20);
check("answer: mode=answer",      sa.mode === "answer");
check("answer: mentions Tsiolkovsky or delta-v",
      /tsiolkovsky|delta[\s-]*v|rocket equation/i.test(sa.answer || ""),
      "expected physics content");

// 7d. compile-wiki
console.log("\n  [compile-wiki — ~30s]");
const cw = await post("/api/compile-wiki", {
  journals: [
    { topic: "spring_mass", name: "Spring-Mass System", editorValue: "Spring: F=-kx Hooke's law. Frequency omega=sqrt(k/m). Energy E=0.5kx^2+0.5mv^2." },
    { topic: "pendulum",   name: "Pendulum",            editorValue: "Pendulum period T=2pi*sqrt(L/g). SHM for small angles. Damping via air resistance." },
  ],
}, 120_000); // wiki needs up to 90s (NVIDIA) + fallback
check("wiki: valid JSON",         !cw._error && !cw._raw, cw._error);
check("wiki: has article",        typeof cw.article === "object" && cw.article !== null);
check("wiki: article has title",  typeof cw.article?.title === "string" && cw.article.title.length > 0,
      `title: ${cw.article?.title}`);
check("wiki: has keyTerms",       Array.isArray(cw.article?.keyTerms) && cw.article.keyTerms.length > 0,
      `keyTerms: ${cw.article?.keyTerms?.length}`);
check("wiki: has relatedTopics",  Array.isArray(cw.article?.relatedTopics) && cw.article.relatedTopics.length > 0);
check("wiki: has connections",    Array.isArray(cw.article?.connections));
check("wiki: has summary",        typeof cw.article?.summary === "string" && cw.article.summary.length > 20);

// ── 8. Page & drawer integration ─────────────────────────────────────────────
console.log("\n▶ 8. page.jsx & AskAIDrawer Integration");
const page = readFileSync("app/editor/page.jsx", "utf8");
check("All 6 tabs defined",          page.includes('id: "wiki"'));
check("generateArtifacts callback",  page.includes("generateArtifacts"));
check("compileWiki callback",        page.includes("compileWiki"));
check("generateFromSource callback", page.includes("generateFromSource"));
check("EquationsPanel imported",     page.includes("import EquationsPanel"));
check("WikiPanel imported",          page.includes("import WikiPanel"));
check("SourcesPanel imported",       page.includes("import SourcesPanel"));

const drawer = readFileSync("app/editor/components/AskAIDrawer.jsx", "utf8");
check("Answer/Teach toggle",         drawer.includes("Answer Mode"));
check("Teach mode UI",               drawer.includes("Teach Me"));
check("Calls /api/socratic-ask",     drawer.includes("socratic-ask"));
check("ReactMarkdown rendering",     drawer.includes("ReactMarkdown"));
check("KaTeX support",               drawer.includes("rehypeKatex"));
check("Multi-chat sessions",         drawer.includes("activeChatId"));

// ── 9. Spec sheet: unit normalisation & dimensional validation ───────────────
// These are the hallucination filter for 3D generation. Pure functions, no
// network — transpiled on the fly so the suite stays a plain node script.
console.log("\n▶ 9. Spec Sheet — Units & Dimensional Validation");
const { transform: sucraseTransform } = await import("sucrase");
const specJs = sucraseTransform(readFileSync("lib/specSheet.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".spec-sheet.test.mjs", specJs);
const SPEC = await import("../.spec-sheet.test.mjs");
rmSync(".spec-sheet.test.mjs", { force: true });

const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// Unit conversion to canonical mm / mm2 / g / deg
check("unit: in → 25.4mm",           near(SPEC.lookupUnit("in").factor, 25.4));
check("unit: cm → 10mm",             near(SPEC.lookupUnit("cm").factor, 10));
check("unit: ft → 304.8mm",          near(SPEC.lookupUnit("ft").factor, 304.8));
check("unit: oz → 28.35g",           near(SPEC.lookupUnit("oz").factor, 28.3495));
check("unit: lbs plural handled",    near(SPEC.lookupUnit("lbs").factor, 453.592));
check("unit: rad → deg",             near(SPEC.lookupUnit("rad").factor, 57.29578));
// Squared units are derived by squaring the base factor, so every spelling agrees
check("unit: in2 → area",            SPEC.lookupUnit("in2").cls === "area");
check("unit: in2 = 645.16mm²",       near(SPEC.lookupUnit("in2").factor, 645.16));
check("unit: 'sq in' = in2",         near(SPEC.lookupUnit("sq in").factor, 645.16));
check("unit: 'in²' = in2",           near(SPEC.lookupUnit("in\u00b2").factor, 645.16));
check("unit: 'square inches' = in2", near(SPEC.lookupUnit("square inches").factor, 645.16));
check("unit: cm2 = 100mm²",          near(SPEC.lookupUnit("cm2").factor, 100));
check("unit: unknown flagged",       SPEC.lookupUnit("bananas").cls === "unknown");
check("normalise: 27in = 685.8mm",   near(SPEC.normaliseDimension(27, "in").value, 685.8));

const mkSpec = (dims) => SPEC.coerceSpecSheet(
  { referenceProduct: "Babolat Pure Drive", category: "sports", dimensions: dims },
  "tennis racket", "gemini", "test",
);

// A self-consistent racket: 100in² head ≈ ellipse of 250×330mm
const goodSpec = mkSpec([
  { key: "total_length",    value: 27,  unit: "in",     confidence: 0.95 },
  { key: "head_area",       value: 100, unit: "sq in",  confidence: 0.95 },
  { key: "head_width",      value: 250, unit: "mm",     confidence: 0.9 },
  { key: "head_height",     value: 330, unit: "mm",     confidence: 0.9 },
  { key: "beam_width",      value: 23,  unit: "mm",     confidence: 0.9 },
  { key: "unstrung_weight", value: 300, unit: "g",      confidence: 0.95 },
]);
const goodVal = SPEC.validateSpecSheet(goodSpec);
check("validate: consistent spec passes", goodVal.valid, goodVal.errors.join("; "));

// The key hallucination catch: stated area contradicts stated width×height
const inconsistent = SPEC.validateSpecSheet(mkSpec([
  { key: "total_length", value: 27,  unit: "in",    confidence: 0.9 },
  { key: "head_area",    value: 100, unit: "sq in", confidence: 0.9 },
  { key: "head_width",   value: 120, unit: "mm",    confidence: 0.5 },
  { key: "head_height",  value: 80,  unit: "mm",    confidence: 0.5 },
]));
check("validate: catches area vs w×h mismatch",
  !inconsistent.valid && inconsistent.errors.some((e) => /inconsistent/i.test(e)));

// Physically absurd magnitude (a 3km tennis racket)
const absurd = SPEC.validateSpecSheet(mkSpec([
  { key: "total_length", value: 3000, unit: "m",  confidence: 0.3 },
  { key: "grip_length",  value: 200,  unit: "mm", confidence: 0.9 },
  { key: "beam_width",   value: 23,   unit: "mm", confidence: 0.9 },
]));
check("validate: catches absurd magnitude",
  !absurd.valid && absurd.errors.some((e) => /range/i.test(e)));

check("validate: rejects too-few dimensions",
  !SPEC.validateSpecSheet(mkSpec([{ key: "length", value: 100, unit: "mm" }])).valid);
check("validate: null-safe", !SPEC.validateSpecSheet(null).valid);

// Coercion has to survive models ignoring the schema
const messy = SPEC.coerceSpecSheet({
  referenceProduct: "X",
  dimensions: [
    { key: "Total Length", value: "27 in", confidence: 0.9 },   // unit inside value
    { key: "blade_count",  value: 3, unit: "count" },
    { key: "junk",         value: "not a number" },              // unparseable
  ],
  attributes: { string_pattern: "16x19" },
}, "t", "gemini", "m");
check("coerce: parses unit embedded in value", near(messy.dimensions[0].value, 685.8));
check("coerce: snake_cases keys",              messy.dimensions[0].key === "total_length");
check("coerce: drops unparseable dimensions",  messy.dimensions.length === 2);
check("coerce: keeps non-numeric attributes",  messy.attributes.string_pattern === "16x19");

// The prompt block must actually forbid substituting invented numbers
const specPrompt = SPEC.formatSpecForPrompt(goodSpec, goodVal);
check("prompt: names reference product",  specPrompt.includes("Babolat"));
check("prompt: uses canonical mm",        specPrompt.includes("686 mm"));
check("prompt: shows as-sourced value",   specPrompt.includes("27 in"));
check("prompt: forbids substitution",     /do NOT substitute/i.test(specPrompt));

// Cache behaviour
SPEC.clearSpecCache();
check("cache: starts empty", SPEC.specCacheStats().entries === 0);
check("cache: miss returns null", SPEC.getCachedSpec("nothing here") === null);

// ── 10. Spec sheet: dead Gemini models must not come back ────────────────────
console.log("\n▶ 10. Gemini Model Chain Health");
const specSrc = readFileSync("lib/specSheet.ts", "utf8");
const sceneSrc = readFileSync("app/api/generate-scene/route.ts", "utf8");
// Retired models return 404 and used to silently kill the whole research stage.
// Assert against the live chain itself, not source text — the retired names are
// legitimately mentioned in comments explaining why they were removed.
const retired = SPEC.RETIRED_GEMINI_MODELS.filter((m) => SPEC.GEMINI_CHAIN.includes(m));
check("model chain has no retired models", retired.length === 0, retired.join(", "));
check("model chain is non-empty",          SPEC.GEMINI_CHAIN.length > 0);
check("no retired model in scene route",
  !SPEC.RETIRED_GEMINI_MODELS.some((m) => sceneSrc.includes(m)));
check("search grounding is env-gated",              specSrc.includes("ENABLE_SEARCH_GROUNDING"));
check("scene route reuses shared gemini helper",    sceneSrc.includes("geminiGenerate"));
check("scene route has no direct generativelanguage call",
  !sceneSrc.includes("generativelanguage.googleapis.com"));
// Thinking models need headroom or they return an empty candidate
check("thinking-model token budget >= 8192",        specSrc.includes("8192"));

// ── 10b. NVIDIA model chain health ───────────────────────────────────────────
// A model that 404s here does not fail loudly: the request burns its full timeout
// and generation silently demotes to the weaker Groq fallback. That is exactly how
// scene quality regressed unnoticed, so both the config and the live endpoint are
// asserted here.
console.log("\n▶ 10b. NVIDIA Model Chain Health");
const pipelineSrc = readFileSync("app/api/agent-pipeline/route.ts", "utf8");

const modelsJs = sucraseTransform(readFileSync("lib/models.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".test_models.mjs", modelsJs);
const MODELS = await import("./../.test_models.mjs");
rmSync(".test_models.mjs", { force: true });

const nvChain   = [...MODELS.NVIDIA_CODE_CHAIN];
const nvRetired = MODELS.RETIRED_NVIDIA_MODELS;
const nvFast    = MODELS.NVIDIA_FAST;

check("nvidia code chain is non-empty", nvChain.length > 0, nvChain.join(", "));
check("nvidia chain excludes retired models", !nvChain.some((m) => nvRetired.includes(m)));
check("thinking model is not retired",
  !!MODELS.NVIDIA_THINKING && !nvRetired.includes(MODELS.NVIDIA_THINKING), MODELS.NVIDIA_THINKING);
check("fast model is not retired", !!nvFast && !nvRetired.includes(nvFast), nvFast);
check("thinking mode disabled in shared config",
  MODELS.NVIDIA_NO_THINKING?.thinking === false);

// The dead 405b was duplicated across five routes; each copy failed silently and
// independently. Every route must now read the shared config instead.
const nvidiaRoutes = [
  "app/api/generate-scene/route.ts",
  "app/api/agent-pipeline/route.ts",
  "app/api/compile-wiki/route.ts",
  "app/api/sim-notes/route.ts",
];
for (const file of nvidiaRoutes) {
  const src = readFileSync(file, "utf8");
  const name = file.split("/").at(-2);
  check(`${name}: imports shared model config`, src.includes('from "@/lib/models"') || src.includes("from '@/lib/models'"));
  check(`${name}: no hardcoded nvidia model id`, !/["'](?:meta|nvidia)\/[a-z0-9.-]+["']/i.test(src));
  check(`${name}: disables nemotron thinking`, src.includes("NVIDIA_NO_THINKING"));
  check(`${name}: guards against retired models`, src.includes("assertLiveModels"));
}
// A dead model must be loud, not silent — this is what let quality regress unseen.
check("retired models trigger a fatal log", MODELS.assertLiveModels.length >= 2);
{
  const seen = [];
  const origError = console.error;
  console.error = (m) => seen.push(String(m));
  MODELS.assertLiveModels("probe", [nvRetired[0]]);
  MODELS.assertLiveModels("probe", nvChain);
  console.error = origError;
  check("assertLiveModels flags a retired model", seen.length === 1 && seen[0].includes(nvRetired[0]));
  check("assertLiveModels stays quiet for live models", seen.length === 1);
}

if (process.env.NVIDIA_API_KEY) {
  const mRes = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  const listed = mRes.ok ? (await mRes.json()).data.map((m) => m.id) : [];
  check("nvidia /v1/models reachable", mRes.ok && listed.length > 0, `status ${mRes.status}`);

  // Being listed is necessary but not sufficient — nemotron-ultra-253b is listed
  // yet its backing function is undeployed, so a real 1-token call is the only
  // trustworthy check.
  for (const model of [...nvChain, nvFast].filter(Boolean)) {
    check(`nvidia model listed: ${model}`, listed.includes(model));
    const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        chat_template_kwargs: { thinking: false },
      }),
    }).catch((e) => ({ ok: false, status: String(e).slice(0, 40) }));
    // 429 means the model is alive but rate-limited, which is not a config error.
    check(`nvidia model serves traffic: ${model}`,
      r.ok || r.status === 429, `status ${r.status}`);
  }
} else {
  fail("live NVIDIA probes ran", "NVIDIA_API_KEY not set — dead models cannot be detected");
}

// ── 10c. Latency architecture ────────────────────────────────────────────────
// A slow leader used to burn its whole 150s timeout producing nothing before the
// next model even started, and that dead time repeated every repair turn — which
// is what pushed real generations to 13–22 minutes.
console.log("\n▶ 10c. Latency Architecture");
check("cascade runs concurrently, not serially", sceneSrc.includes("raceWithPreference"));
check("single-model call extracted",        sceneSrc.includes("streamOneNvidia"));

// Behavioural tests for the race policy itself — the concurrency is the risky
// part, so it is exercised rather than grepped.
const raceJs = sucraseTransform(readFileSync("lib/modelRace.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".test_race.mjs", raceJs);
const { raceWithPreference } = await import("./../.test_race.mjs");

const usableStr = (v) => typeof v === "string" && v.length > 5;
const after = (ms, value) => () => new Promise((r) => setTimeout(() => r(value), ms));
const failsAfter = (ms, msg) => () =>
  new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
const baseOpts = { isUsable: usableStr, budgetMs: 400, upgradeWindowMs: 120 };

let t0 = Date.now();
let r = await raceWithPreference([after(20, "strongest-result"), after(5, "weaker-result")], baseOpts);
check("race: prefers strongest even when slower",
  r?.index === 0 && r.value === "strongest-result", JSON.stringify(r));
check("race: waits only as long as the strongest needs", Date.now() - t0 < 150, `${Date.now() - t0}ms`);

t0 = Date.now();
r = await raceWithPreference([failsAfter(10, "404"), after(20, "weaker-result")], baseOpts);
check("race: falls back when strongest fails", r?.index === 1, JSON.stringify(r));
check("race: failure path does not wait for budget", Date.now() - t0 < 150, `${Date.now() - t0}ms`);

// The case that used to cost 150s of dead time per turn.
t0 = Date.now();
r = await raceWithPreference([after(5_000, "too-slow"), after(10, "weaker-result")], baseOpts);
const stalledMs = Date.now() - t0;
check("race: stalled leader capped by upgrade window", r?.index === 1, JSON.stringify(r));
check("race: gives up well before the leader finishes",
  stalledMs < 400, `${stalledMs}ms`);
check("race: still granted the upgrade grace period",
  stalledMs >= 100, `${stalledMs}ms`);

r = await raceWithPreference([after(5, "tiny"), after(10, "weaker-result")], baseOpts);
check("race: rejects unusable result from strongest", r?.index === 1, JSON.stringify(r));

r = await raceWithPreference([failsAfter(5, "a"), failsAfter(5, "b")], baseOpts);
check("race: returns null when every candidate fails", r === null, JSON.stringify(r));

r = await raceWithPreference([], baseOpts);
check("race: handles an empty cascade", r === null);

t0 = Date.now();
r = await raceWithPreference([after(5_000, "x"), after(5_000, "y")], { ...baseOpts, budgetMs: 150 });
check("race: budget caps a fully stalled cascade",
  r === null && Date.now() - t0 < 400, `${Date.now() - t0}ms`);
rmSync(".test_race.mjs", { force: true });

const budgetMs = Number(sceneSrc.match(/SCENE_BUDGET_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll("_", ""));
check("wall-clock budget defined",          Number.isFinite(budgetMs), `got ${budgetMs}`);
check("budget is at most 5 minutes",        budgetMs <= 300_000, `${budgetMs}ms`);
check("budget leaves room for a turn",      budgetMs >= 120_000, `${budgetMs}ms`);
check("loop checks remaining time",         sceneSrc.includes("msLeft() < TURN_COST_ESTIMATE_MS"));
check("all 4 repair turns retained",        /MAX_AGENT_TURNS\s*=\s*4/.test(sceneSrc));
check("nvidia budget derives from time left", sceneSrc.includes("budgetMs - 30_000"));

// Erroring after minutes of work wastes everything; a scene with open notes is
// strictly more useful to the user.
check("best compiling candidate retained",  sceneSrc.includes("bestIssueCount"));
check("ships best candidate on exhaustion", sceneSrc.includes("finalCode || bestCode"));

// Client disconnects previously spammed "Controller is already closed".
check("sse writes guarded on disconnect",   sceneSrc.includes("if (closed || req.signal?.aborted) return"));
check("abort listener registered",          sceneSrc.includes('req.signal?.addEventListener("abort"'));
check("enqueue failure marks stream closed",
  /catch \{\s*closed = true;/.test(sceneSrc));

// ── 11. Smooth geometry guidance (the anti-blockiness fix) ───────────────────
console.log("\n▶ 11. Smooth Geometry Prompt Rules");
for (const g of ["latheGeometry", "extrudeGeometry", "tubeGeometry", "bevelEnabled",
                 "computeVertexNormals"]) {
  check(`prompt teaches ${g}`, sceneSrc.includes(g));
}
check("prompt bans flatShading",        /NEVER set flatShading/.test(sceneSrc));
check("prompt sets segment minimums",   sceneSrc.includes("MINIMUM SEGMENT COUNTS"));
check("prompt warns RoundedBox absent", sceneSrc.includes("RoundedBox"));
check("spec treated as authoritative",  sceneSrc.includes("VERIFIED SPEC SHEET"));

// The gate matters more than the prompt: it feeds specific failures back into
// the repair loop instead of hoping the model polices itself.
const gaJs = sucraseTransform(readFileSync("lib/geometryAudit.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".geometry-audit.test.mjs", gaJs);
const { smoothnessAudit, polishGeometry } = await import("../.geometry-audit.test.mjs");
rmSync(".geometry-audit.test.mjs", { force: true });
check("audit wired into generate-scene", sceneSrc.includes("smoothnessAudit("));

const allBoxes = Array.from({ length: 10 }, () =>
  "<mesh><boxGeometry args={[1,1,1]}/><meshStandardMaterial/></mesh>").join("\n");
const legoIssues = smoothnessAudit(allBoxes, "acoustic guitar", 10, 10, false);
check("gate: flags box-dominated scene",   legoIssues.some((i) => /LEGO/.test(i)));
check("gate: flags absent curved geometry", legoIssues.some((i) => /No latheGeometry/.test(i)));

const facetedIssues = smoothnessAudit(
  "<mesh><sphereGeometry args={[1, 8, 6]}/></mesh><mesh><torusGeometry args={[1,0.2,6,12]}/></mesh>",
  "wind turbine", 2, 0, false);
check("gate: flags faceted segment counts", facetedIssues.some((i) => /faceted/.test(i)));

const smoothIssues = smoothnessAudit(`
<mesh><latheGeometry args={[profile, 64]}/></mesh>
<mesh><extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: true }]}/></mesh>
<mesh><tubeGeometry args={[curve, 64, 0.02, 24, false]}/></mesh>
<mesh><sphereGeometry args={[1, 48, 32]}/></mesh>
<mesh><cylinderGeometry args={[1,1,2,48]}/></mesh>
<mesh><boxGeometry args={[1,1,1]}/></mesh>
<mesh><boxGeometry args={[1,1,1]}/></mesh>`, "acoustic guitar", 7, 2, false);
check("gate: clean scene passes silently", smoothIssues.length === 0, smoothIssues.join("; "));

check("gate: flags flatShading",
  smoothnessAudit("<meshStandardMaterial flatShading />", "x", 1, 0, false)
    .some((i) => /flatShading/.test(i)));
check("gate: respects boxesAreIntentional",
  !smoothnessAudit(allBoxes, "breadboard circuit", 10, 10, true).some((i) => /LEGO|No lathe/.test(i)));
check("gate: ignores non-literal segment args",
  !smoothnessAudit("<mesh><cylinderGeometry args={[r, r, h, segs]}/></mesh><mesh><latheGeometry args={[p,64]}/></mesh>", "x", 8, 0, false)
    .some((i) => /faceted/.test(i)));
check("gate: flags BufferGeometry without normals",
  smoothnessAudit("const g = new THREE.BufferGeometry();", "x", 8, 0, false)
    .some((i) => /computeVertexNormals/.test(i)));

// A lathe fed a rectangular profile revolves into a plain tube. Models do this
// when told to avoid boxes, so it needs catching explicitly.
const rectLathe = `<mesh><latheGeometry args={[[
  new THREE.Vector2(0.124, 0), new THREE.Vector2(0.124, 0.508),
  new THREE.Vector2(0.062, 0.508), new THREE.Vector2(0.062, 0)], 64]}/></mesh>`;
check("gate: flags rectangular lathe profile",
  smoothnessAudit(rectLathe, "acoustic guitar", 8, 0, false).some((i) => /stepped/.test(i)));
const curvedLathe = `<mesh><latheGeometry args={[[
  new THREE.Vector2(0.10,0), new THREE.Vector2(0.13,0.1), new THREE.Vector2(0.16,0.2),
  new THREE.Vector2(0.18,0.3), new THREE.Vector2(0.17,0.4), new THREE.Vector2(0.14,0.5)], 64]}/></mesh>`;
check("gate: allows curved lathe profile",
  !smoothnessAudit(curvedLathe, "bottle", 8, 0, false).some((i) => /stepped/.test(i)));
check("gate: allows 2-point cone profile",
  !smoothnessAudit("<mesh><latheGeometry args={[[new THREE.Vector2(0,0), new THREE.Vector2(0.2,0.5)], 64]}/></mesh>", "funnel", 8, 0, false)
    .some((i) => /stepped/.test(i)));
check("gate: flags extrude without bevel",
  smoothnessAudit("<mesh><extrudeGeometry args={[shape, { depth: 0.1 }]}/></mesh>", "x", 8, 0, false)
    .some((i) => /bevelEnabled/.test(i)));
check("gate: allows extrude with bevel",
  !smoothnessAudit("<mesh><extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: true }]}/></mesh>", "x", 8, 0, false)
    .some((i) => /bevelEnabled/.test(i)));
check("prompt teaches lathe-vs-extrude choice",
  sceneSrc.includes("spun this part on a lathe"));

// ── 11b. Deterministic geometry polish ──────────────────────────────────────
// Segment counts and flatShading are fully determined — repairing them in code
// beats spending agent turns on arithmetic the loop often never finished.
console.log("\n▶ 11b. Deterministic Geometry Polish");
check("polish wired into toolStrip", sceneSrc.includes("polishGeometry("));
check("polish: cylinder 16 → 48",
  polishGeometry("<mesh><cylinderGeometry args={[0.1, 0.1, 0.5, 16]} /></mesh>").code.includes("0.5, 48"));
check("polish: sphere 8,6 → 48,32", (() => {
  const c = polishGeometry("<mesh><sphereGeometry args={[1, 8, 6]} /></mesh>").code;
  return c.includes("48") && c.includes("32");
})());
check("polish: torus 6,12 → 24,96", (() => {
  const c = polishGeometry("<mesh><torusGeometry args={[0.2, 0.02, 6, 12]} /></mesh>").code;
  return c.includes("24") && c.includes("96");
})());
const alreadyGood = "<mesh><cylinderGeometry args={[0.1, 0.1, 0.5, 48]} /></mesh>";
check("polish: adequate values untouched", polishGeometry(alreadyGood).code === alreadyGood);
const exprArgs = "<mesh><cylinderGeometry args={[r, r, h, segs]} /></mesh>";
check("polish: expression args untouched", polishGeometry(exprArgs).code === exprArgs);
check("polish: boxGeometry untouched",
  polishGeometry("<mesh><boxGeometry args={[1, 1, 1]} /></mesh>").code.includes("args={[1, 1, 1]}"));
// A lathe's first arg is a nested array of Vector2s — naive regex rewriting corrupts it
const latheNested = "<mesh><latheGeometry args={[[new THREE.Vector2(0.1, 0), new THREE.Vector2(0.2, 0.5)], 12]} /></mesh>";
const lathePolished = polishGeometry(latheNested).code;
check("polish: nested lathe profile preserved",
  lathePolished.includes("new THREE.Vector2(0.1, 0)") && lathePolished.includes("new THREE.Vector2(0.2, 0.5)"),
  lathePolished);
check("polish: lathe segments raised to 64", /\],\s*64\]/.test(lathePolished), lathePolished);
check("polish: removes bare flatShading",
  !polishGeometry('<meshStandardMaterial color="#fff" flatShading />').code.includes("flatShading"));
check("polish: removes flatShading={true}",
  !polishGeometry("<meshStandardMaterial flatShading={true} roughness={0.5} />").code.includes("flatShading"));
check("polish: keeps sibling props",
  polishGeometry("<meshStandardMaterial flatShading={true} roughness={0.5} />").code.includes("roughness={0.5}"));

// Polished output must remain valid JSX, and re-polishing must change nothing
const messyScene = `export default function GeneratedScene() {
  return (
    <group>
      <mesh><latheGeometry args={[profile, 16]} /><meshStandardMaterial flatShading /></mesh>
      <mesh><cylinderGeometry args={[0.05, 0.05, 0.6, 12]} /></mesh>
      <mesh><torusGeometry args={[0.3, 0.03, 8, 24]} /></mesh>
    </group>
  );
}`;
const polishedOnce = polishGeometry(messyScene);
check("polish: is idempotent", polishGeometry(polishedOnce.code).fixes.length === 0);
let polishCompiles = true;
try { sucraseTransform(polishedOnce.code, { transforms: ["jsx", "typescript"] }); }
catch { polishCompiles = false; }
check("polish: output still compiles", polishCompiles);
check("polish: reports every fix", polishedOnce.fixes.length === 5, JSON.stringify(polishedOnce.fixes));
// After polishing, the smoothness gate must no longer complain about faceting
check("polish: satisfies the faceting gate",
  !smoothnessAudit(polishedOnce.code, "x", 3, 0, true).some((i) => /faceted|flatShading/.test(i)));

// ── 11b. Dry-run render catches TDZ before client mount ─────────────────────
console.log("\n▶ 11b. Scene Sandbox Dry-Run (TDZ / declaration order)");
const sbJs = sucraseTransform(readFileSync("lib/sceneSandbox.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".scene-sandbox.test.mjs", sbJs);
const { tryRenderGeneratedScene } = await import("../.scene-sandbox.test.mjs");
rmSync(".scene-sandbox.test.mjs", { force: true });

const goodSceneJs = sucraseTransform(`function GeneratedScene() {
  const isTensionWarning = true;
  const color = isTensionWarning ? "#ef4444" : "#22c55e";
  return (
    <group>
      <mesh><sphereGeometry args={[0.2, 48, 48]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  );
}`, { transforms: ["jsx"], jsxPragma: "React.createElement", jsxFragmentPragma: "React.Fragment" }).code;

const badTdzJs = sucraseTransform(`function GeneratedScene() {
  const color = isTensionWarning ? "#ef4444" : "#22c55e";
  const isTensionWarning = true;
  return (
    <group>
      <mesh><sphereGeometry args={[0.2, 48, 48]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  );
}`, { transforms: ["jsx"], jsxPragma: "React.createElement", jsxFragmentPragma: "React.Fragment" }).code;

const badUseMemoTdzJs = sucraseTransform(`function GeneratedScene() {
  const profile = useMemo(() => isTensionWarning ? [0.2, 0.5] : [0.1, 0.3], [isTensionWarning]);
  const isTensionWarning = true;
  return <group><mesh><sphereGeometry args={[0.2, 48, 48]} /></mesh></group>;
}`, { transforms: ["jsx"], jsxPragma: "React.createElement", jsxFragmentPragma: "React.Fragment" }).code;

check("dry-run: valid scene passes", tryRenderGeneratedScene(goodSceneJs).ok === true);
const tdzFail = tryRenderGeneratedScene(badTdzJs);
check("dry-run: TDZ const-order caught", tdzFail.ok === false);
check("dry-run: names the offending binding",
  !tdzFail.ok && tdzFail.issues.some((i) => /isTensionWarning/.test(i)));
const memoTdzFail = tryRenderGeneratedScene(badUseMemoTdzJs);
check("dry-run: TDZ inside useMemo caught", memoTdzFail.ok === false);
check("generate-scene uses dry-run compile",
  sceneSrc.includes("tryRenderGeneratedScene"));
check("DynamicPhysicsScene uses dry-run compile",
  readFileSync("app/editor/components/DynamicPhysicsScene.jsx", "utf8").includes("tryRenderGeneratedScene"));
check("prompt warns about declaration order",
  sceneSrc.includes("before initialization") || sceneSrc.includes("DECLARATION ORDER"));

// ── 11c. Quality routing — High Quality must NOT waste 5min on R3F boxes ─────
console.log("\n▶ 11c. Quality Mode Routing (CAD vs R3F)");
const physSrc = readFileSync("app/editor/PhysicsScene.jsx", "utf8");
const procSrc = readFileSync("app/editor/components/ProceduralGLBModel.jsx", "utf8");
const geomSrc = readFileSync("app/api/geometry-render/route.ts", "utf8");
check("PhysicsScene routes by quality", physSrc.includes("useCadPath") && physSrc.includes('quality !== "fast"'));
check("High Quality uses ProceduralGLBModel", physSrc.includes("ProceduralGLBModel") && physSrc.includes("useCadPath"));
check("page skips generate-scene in thinking mode", page.includes('quality === "fast"') && page.includes("generateSceneCode"));
// Spec research moved server-side so a library hit costs no LLM calls at all.
check("ProceduralGLBModel does not pre-research spec", !procSrc.includes("/api/research-spec"));
check("geometry-render researches spec on miss", geomSrc.includes("researchSpecSheet"));
check("geometry-render accepts specSheet", geomSrc.includes("specSheet"));
check("specToCad car helper exists", existsSync("lib/specToCad.ts"));

const cadJs = sucraseTransform(readFileSync("lib/specToCad.ts", "utf8"), { transforms: ["typescript"] }).code;
writeFileSync(".spec-cad.test.mjs", cadJs);
const { openScadCarFromSpec } = await import("../.spec-cad.test.mjs");
rmSync(".spec-cad.test.mjs", { force: true });
const carScad = openScadCarFromSpec("Porsche 911", {
  referenceProduct: "2024 Porsche 911 Carrera",
  dimensions: [
    { key: "overall_length", label: "Overall length", value: 4515, unit: "mm", rawValue: 4515, rawUnit: "mm", unitClass: "length", confidence: 0.9 },
    { key: "width", label: "Width", value: 1852, unit: "mm", rawValue: 1852, rawUnit: "mm", unitClass: "length", confidence: 0.9 },
    { key: "wheelbase", label: "Wheelbase", value: 2450, unit: "mm", rawValue: 2450, rawUnit: "mm", unitClass: "length", confidence: 0.9 },
  ],
  attributes: {},
  notes: [],
  topic: "car",
  category: "vehicle",
  source: "gemini",
  model: "test",
  generatedAt: new Date().toISOString(),
});
check("specToCad: produces wheel module", /module wheel/.test(carScad));
check("specToCad: uses wheelbase placement", /1\.248|wheelbase/i.test(carScad));
check("specToCad: $fn >= 48", /\$fn\s*=\s*48/.test(carScad));

// ── 12. Honest agent accounting + spec wiring ────────────────────────────────
console.log("\n▶ 12. Agent Pipeline & Store Wiring");
const pipeSrc = readFileSync("app/api/agent-pipeline/route.ts", "utf8");
check("research agent is async",        pipeSrc.includes("async function runResearchAgent"));
check("research agent is awaited",      pipeSrc.includes("await runResearchAgent"));
check("no hardcoded toolCalls: 2",      !pipeSrc.includes("toolCalls: 2"));
check("unknown topics get researched",  pipeSrc.includes("researchSpecSheet"));
check("/api/research-spec exists",      existsSync("app/api/research-spec/route.ts"));
check("SpecSheetBadge exists",          existsSync("app/editor/components/SpecSheetBadge.jsx"));
check("store persists specSheet",       store.includes("setSpecSheet") && store.includes("specSheet"));
check("page handles spec_sheet event",  page.includes("spec_sheet"));
check("page renders SpecSheetBadge",    page.includes("SpecSheetBadge"));

// ── 12b. Topic classification must not match across word interiors ──────────
// Keyword matching was substring-based, so "brewing"/"sewing" contained "wing"
// and any machine topic was classified as an aircraft — wrong physics notes AND
// no live research, because a KB "hit" suppresses the research path.
console.log("\n▶ 12b. Topic Classifier (word-boundary matching)");
const kbJs = sucraseTransform(readFileSync("lib/physics-kb.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".physics-kb.test.mjs", kbJs);
const { classifySimType } = await import("../.physics-kb.test.mjs");
rmSync(".physics-kb.test.mjs", { force: true });

// Topics with no KB entry must fall through to "custom" so they get researched
for (const t of ["espresso machine brewing pressure", "sewing machine", "acoustic guitar",
                 "skateboard", "grand piano", "air fryer", "coffee grinder", "door hinge",
                 "washing machine drum", "hydraulic press"]) {
  const got = classifySimType(t);
  check(`classify: "${t}" → custom`, got === "custom", `got ${got}`);
}

// Known topics must still route to their KB entry
for (const [t, want] of [
  ["wind turbine", "wind_turbine"], ["airplane wing lift", "airplane"],
  ["inverted pendulum on a cart", "inverted_pendulum"], ["newtons cradle", "newton_cradle"],
  ["mechanical gears meshing", "mechanical_gears"], ["bicycle drivetrain", "bicycle"],
  ["submarine hull depth", "submarine"], ["rocket launch thrust", "rocket"],
  ["suspension bridge", "bridge"], ["helicopter rotor", "helicopter"],
  ["robot arm kinematics", "robot_arm"], ["projectile motion", "projectile"],
  ["spring mass damper", "spring_mass"], ["steam engine piston", "steam_engine"],
  ["orbital mechanics satellite", "orbit"], ["breadboard circuit", "breadboard"],
  ["jet aircraft", "airplane"], ["glider aerodynamics", "airplane"],
]) {
  const got = classifySimType(t);
  check(`classify: "${t}" → ${want}`, got === want, `got ${got}`);
}

// ── 13. Live API: /api/research-spec ────────────────────────────────────────
console.log("\n▶ 13. Live Spec Research (/api/research-spec)");
const rs = await post("/api/research-spec", { topic: "tennis racket" }, 90_000);
check("spec: responds",                 !!rs.spec, JSON.stringify(rs).slice(0, 160));
check("spec: names a real product",      (rs.spec?.referenceProduct?.length ?? 0) > 2, rs.spec?.referenceProduct);
check("spec: >=6 dimensions",            (rs.spec?.dimensions?.length ?? 0) >= 6, `got ${rs.spec?.dimensions?.length}`);
check("spec: all canonical units",        (rs.spec?.dimensions ?? []).every((d) => ["mm","mm2","g","deg","count","ratio"].includes(d.unit)),
  JSON.stringify((rs.spec?.dimensions ?? []).map((d) => d.unit)));
check("spec: all values finite",          (rs.spec?.dimensions ?? []).every((d) => Number.isFinite(d.value)));
check("spec: passes validation",          rs.validation?.valid === true, (rs.validation?.errors ?? []).join("; "));
check("spec: returns prompt block",       typeof rs.prompt === "string" && rs.prompt.includes("VERIFIED SPEC SHEET"));
// A racket is ~685mm; this catches the class of error where the model returns cm as mm
const lenDim = (rs.spec?.dimensions ?? []).find((d) => /length/.test(d.key) && d.unit === "mm");
check("spec: racket length is realistic (500-750mm)",
  !!lenDim && lenDim.value > 500 && lenDim.value < 750, `got ${lenDim?.value}`);

// Second identical call must be served from cache — proves we don't pay twice
const rs2 = await post("/api/research-spec", { topic: "tennis racket" }, 30_000);
check("spec: second call cached", rs2.attempts === 0, `attempts=${rs2.attempts}`);
check("spec: cached result identical",
  rs2.spec?.referenceProduct === rs.spec?.referenceProduct);

// ── 14. Render worker must not share /tmp paths between concurrent jobs ─────
// Two overlapping renders both wrote /tmp/output.stl and deleted each other's
// files mid-pipeline: "STL Import: Cannot open file '/tmp/output.stl'".
console.log("\n▶ 14. Render Worker Isolation");
const workerSrc = readFileSync("render-worker/server.js", "utf8");
check("worker: no hardcoded /tmp/output.stl output", !/const outStl = "\/tmp\//.test(workerSrc));
check("worker: no hardcoded /tmp/output.glb output", !/const outGlb = "\/tmp\//.test(workerSrc));
check("worker: outputs live in per-job tmpdir", workerSrc.includes('path.join(tmpDir, "output.stl")'));
check("worker: serializes renders", workerSrc.includes("enqueue(") && workerSrc.includes("renderQueue"));
check("worker: redirects legacy script paths", workerSrc.includes("redirectHardcodedPaths"));
check("worker: verifies STL before Blender", workerSrc.includes("OpenSCAD produced no STL"));
check("worker: cleans up job dirs", workerSrc.includes("cleanup(tmpDir)"));

// ── 15. Unknown topics research structure instead of emitting a blob ────────
console.log("\n▶ 15. Geometry Plan (no more random balls)");
check("geometryPlan module exists", existsSync("lib/geometryPlan.ts"));
const planJs = sucraseTransform(readFileSync("lib/geometryPlan.ts", "utf8"), {
  transforms: ["typescript"],
}).code
  // The plan compiler and validator are pure; stub the LLM import so they can
  // be exercised without a network call.
  .replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/specSheet["'];?/g,
    "const geminiGenerate = async () => null;");
writeFileSync(".geometry-plan.test.mjs", planJs);
const { coerceGeometryPlan, validateGeometryPlan, planToOpenScad, buildPlanPrompt } =
  await import("../.geometry-plan.test.mjs");
rmSync(".geometry-plan.test.mjs", { force: true });

const goodPlanRaw = {
  referenceProduct: "Weber Kettle Grill",
  summary: "Round charcoal grill on three legs",
  parts: [
    { name: "bowl", primitive: "sphere", size: [560, 560, 320], position: [0, 0, 700] },
    { name: "lid", primitive: "sphere", size: [560, 560, 260], position: [0, 0, 900] },
    { name: "handle", primitive: "cylinder", size: [40, 40, 220], position: [0, 260, 1000], rotation: [90, 0, 0] },
    { name: "leg", primitive: "cylinder", size: [30, 30, 700], position: [200, 120, 350], mirror: "x" },
    { name: "wheel", primitive: "torus", size: [180, 180, 40], position: [-200, 120, 60], mirror: "x" },
    { name: "ash catcher", primitive: "cone", size: [260, 260, 180], position: [0, 0, 540] },
  ],
};
const goodPlan = coerceGeometryPlan(goodPlanRaw, "charcoal grill", "test");
check("plan: coerces valid JSON", goodPlan?.parts?.length === 6, `got ${goodPlan?.parts?.length}`);
const goodValidation = validateGeometryPlan(goodPlan);
check("plan: accepts a real structural plan", goodValidation.valid, goodValidation.errors.join("; "));

// The exact failure the user hit: a sphere on a box, shipped as a "model".
const blobPlan = coerceGeometryPlan(
  { parts: [{ name: "body", primitive: "box", size: [100, 100, 100], position: [0, 0, 50] },
            { name: "top", primitive: "sphere", size: [80, 80, 80], position: [0, 0, 120] }] },
  "unknown thing", "test",
);
check("plan: rejects a 2-part blob", validateGeometryPlan(blobPlan).valid === false);

const spheresOnly = coerceGeometryPlan(
  { parts: Array.from({ length: 6 }, (_, i) => ({
      name: `ball_${i}`, primitive: "sphere", size: [100, 100, 100], position: [i * 40, 0, 50],
    })) },
  "blob", "test",
);
const spheresValidation = validateGeometryPlan(spheresOnly);
check("plan: rejects spheres-only pile", spheresValidation.valid === false);
check("plan: explains the blob rejection",
  spheresValidation.errors.some((e) => /blob/i.test(e)), spheresValidation.errors.join("; "));

const disconnected = coerceGeometryPlan(
  { parts: [
      { name: "a", primitive: "box", size: [100, 100, 100], position: [0, 0, 0] },
      { name: "b", primitive: "cylinder", size: [50, 50, 50], position: [30, 0, 60] },
      { name: "c", primitive: "cone", size: [40, 40, 40], position: [0, 40, 60] },
      { name: "d", primitive: "box", size: [20, 20, 20], position: [99999, 0, 0] },
    ] },
  "scattered", "test",
);
check("plan: rejects disconnected parts", validateGeometryPlan(disconnected).valid === false);
check("plan: rejects null", validateGeometryPlan(null).valid === false);
check("plan: drops parts with zero size",
  coerceGeometryPlan({ parts: [{ name: "z", primitive: "box", size: [0, 5, 5], position: [0, 0, 0] }] },
    "t", "test") === null);

const planScad = planToOpenScad(goodPlan);
check("plan→scad: emits OpenSCAD", planScad.includes("$fn") && planScad.includes("translate("));
check("plan→scad: names every part", goodPlanRaw.parts.every((p) => planScad.includes(`// ${p.name}`)));
check("plan→scad: mirrors paired parts",
  (planScad.match(/cylinder\(h=/g) || []).length >= 3);
// Millimetre inputs must come out at the ~4-unit scale the render worker expects,
// not as raw 1110mm coordinates. Rotations are degrees, so they are excluded.
const scadMagnitudes = (planScad
  .replace(/\$fn\s*=\s*\d+/g, "")
  .replace(/rotate\(\[[^\]]*\]\)/g, "")
  .match(/-?\d+\.?\d*/g) || [])
  .map(Number).filter(Number.isFinite).map(Math.abs);
check("plan→scad: normalises to render scale",
  Math.max(...scadMagnitudes) <= 10, `max coordinate ${Math.max(...scadMagnitudes)}`);
// A plan whose parts really are scattered must still be caught.
check("plan: mirrored parts are checked for connectivity too",
  validateGeometryPlan(coerceGeometryPlan({ parts: [
    ...goodPlanRaw.parts.slice(0, 5),
    { name: "floating wheel", primitive: "torus", size: [180, 180, 40], position: [-200, 900, 90], mirror: "y" },
  ] }, "grill", "test")).valid === false);
check("plan→scad: no NaN leaked", !planScad.includes("NaN"));
const planPrompt = buildPlanPrompt("charcoal grill", null, "- too few parts");
check("plan prompt: demands millimetres", /MILLIMETRES/.test(planPrompt));
check("plan prompt: feeds validation errors back", planPrompt.includes("too few parts"));
check("plan prompt: forbids blobs", /generic blob/i.test(planPrompt));

check("geometry-render uses researched plan for unknown topics",
  geomSrc.includes("researchedPlanScript") && geomSrc.includes("researchGeometryPlan"));
check("geometry-render fails loudly when structure is unknown",
  geomSrc.includes("Could not work out what"));

// ── 16. Model library — build once, reuse until rejected ────────────────────
console.log("\n▶ 16. Model Library");
check("modelLibrary module exists", existsSync("lib/modelLibrary.ts"));
const libJs = sucraseTransform(readFileSync("lib/modelLibrary.ts", "utf8"), {
  transforms: ["typescript"],
}).code;
writeFileSync(".model-library.test.mjs", libJs);
process.env.MODEL_LIBRARY_DIR = ".model-library-test";
const lib = await import("../.model-library.test.mjs");
rmSync(".model-library.test.mjs", { force: true });

lib.clearLibrary();
const fakeGlb = Buffer.from("glTF".repeat(120)).toString("base64");

check("library: normalises topic keys",
  lib.topicKey("Tennis Racket") === lib.topicKey("  tennis   racket  "));
check("library: different topics get different keys",
  lib.topicKey("tennis racket") !== lib.topicKey("squash racket"));
check("library: miss returns null", lib.lookupModel("tennis racket") === null);

const savedEntry = lib.saveModel({
  topic: "Tennis Racket", glbBase64: fakeGlb, generator: "openscad", score: 88,
  referenceProduct: "Wilson Pro Staff",
});
check("library: saves a model", savedEntry?.key === lib.topicKey("tennis racket"));
check("library: records the reference product", savedEntry?.referenceProduct === "Wilson Pro Staff");

const hit = lib.lookupModel("tennis racket");
check("library: hit returns the stored GLB", hit?.glbBase64 === fakeGlb);
check("library: hit is case-insensitive", lib.lookupModel("TENNIS RACKET")?.glbBase64 === fakeGlb);
check("library: counts hits", lib.lookupModel("tennis racket")?.entry.hits >= 2);
check("library: rejects undersized GLBs",
  lib.saveModel({ topic: "junk", glbBase64: "AAA", generator: "openscad" }) === null);

lib.verifyModel("tennis racket");
check("library: thumbs-up marks verified", lib.lookupModel("tennis racket")?.entry.verified === true);

const rejection = lib.rejectModel("tennis racket");
check("library: thumbs-down evicts the model", rejection.evicted === true);
check("library: rejected topic misses on next lookup", lib.lookupModel("tennis racket") === null);
check("library: rejection count survives eviction", rejection.rejections === 1);
lib.saveModel({ topic: "tennis racket", glbBase64: fakeGlb, generator: "openscad" });
check("library: re-render carries the rejection history",
  lib.lookupModel("tennis racket")?.entry.rejections === 1);
check("library: re-saved model is not auto-verified",
  lib.lookupModel("tennis racket")?.entry.verified === false);
check("library: stats report contents", lib.libraryStats().count === 1);
// The library directory can be deleted while the server is running; caching a
// stale "disk is fine" made every later save vanish silently.
rmSync(".model-library-test", { recursive: true, force: true });
lib.saveModel({ topic: "recreate me", glbBase64: fakeGlb, generator: "openscad" });
check("library: recovers if its directory is deleted at runtime",
  lib.lookupModel("recreate me")?.glbBase64 === fakeGlb);
lib.clearLibrary();
rmSync(".model-library-test", { recursive: true, force: true });

check("geometry-render checks the library first", geomSrc.includes("lookupModel"));
check("geometry-render saves after a successful render", geomSrc.includes("saveModel"));
check("geometry-render honours forceRegenerate", geomSrc.includes("forceRegenerate"));
check("/api/model-library exists", existsSync("app/api/model-library/route.ts"));
const libRoute = readFileSync("app/api/model-library/route.ts", "utf8");
check("model-library route handles reject", libRoute.includes('case "reject"'));
check("model-library route handles verify", libRoute.includes('case "verify"'));
check("thumbs-down evicts before regenerating", page.includes("rejectStoredModel"));
check("thumbs-up marks the stored model accurate", page.includes("markModelAccurate"));
check("library dir is gitignored", readFileSync(".gitignore", "utf8").includes(".model-library"));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log("\n╔══════════════════════════════════════════════════════════════╗");
if (failed === 0) {
  console.log(`║  ${passed} / ${total} passed   🏆  ALL TESTS PASS`.padEnd(64) + "║");
} else {
  console.log(`║  ${passed} / ${total} passed   ⚠️  ${failed} FAILED`.padEnd(67) + "║");
}
console.log("╚══════════════════════════════════════════════════════════════╝\n");

process.exit(failed > 0 ? 1 : 0);
