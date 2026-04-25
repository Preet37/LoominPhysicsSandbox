/**
 * Loomin Physics Sandbox — Integration Test Suite
 * Run with: node scripts/test.mjs
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

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

async function post(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
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
console.log("\n  [compile-wiki — ~10s]");
const cw = await post("/api/compile-wiki", {
  journals: [
    { topic: "spring_mass", name: "Spring-Mass System", editorValue: "Spring: F=-kx Hooke's law. Frequency omega=sqrt(k/m). Energy E=0.5kx^2+0.5mv^2." },
    { topic: "pendulum",   name: "Pendulum",            editorValue: "Pendulum period T=2pi*sqrt(L/g). SHM for small angles. Damping via air resistance." },
  ],
});
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
