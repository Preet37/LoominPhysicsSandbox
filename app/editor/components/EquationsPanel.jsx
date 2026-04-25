"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { evaluate } from "mathjs";
import { Sigma, CheckCircle, AlertCircle, RefreshCw, Copy, Check } from "lucide-react";
import "katex/dist/katex.min.css";

// ── Extraction helpers ────────────────────────────────────────────────────────

function normalizeMath(text = "") {
  return text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, e) => `\n$$\n${e.trim()}\n$$\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, e) => `$${e.trim()}$`);
}

function extractAllEquations(markdown = "") {
  const norm = normalizeMath(markdown);
  const eqs = [];
  // Display math $$...$$
  const reD = /\$\$([\s\S]*?)\$\$/g;
  let m;
  while ((m = reD.exec(norm)) !== null) {
    const raw = m[1].trim();
    if (raw.length > 0) eqs.push({ type: "display", raw, context: extractContext(norm, m.index) });
  }
  // Inline math $...$
  const reI = /\$([^$\n]{3,})\$/g;
  while ((m = reI.exec(norm)) !== null) {
    const raw = m[1].trim();
    if (raw.includes("=") || raw.includes("\\") || raw.includes("frac")) {
      eqs.push({ type: "inline", raw, context: extractContext(norm, m.index) });
    }
  }
  return eqs;
}

function extractContext(text, index) {
  // Get the sentence around the equation for description
  const start = Math.max(0, index - 150);
  const end = Math.min(text.length, index + 150);
  return text.slice(start, end).replace(/\$[^$]*\$/g, "").replace(/\$\$[\s\S]*?\$\$/g, "").trim().replace(/\n+/g, " ").slice(0, 100);
}

function tryEvaluate(latex, params) {
  // Try to extract a simple expression from LaTeX and evaluate it
  // Strip LaTeX commands to get something mathjs can evaluate
  try {
    let expr = latex
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
      .replace(/\\cdot/g, "*")
      .replace(/\\times/g, "*")
      .replace(/\^(\{[^}]+\}|\d)/g, (_, e) => `^(${e.replace(/[{}]/g, "")})`)
      .replace(/[{}]/g, "")
      .replace(/\\[a-zA-Z]+/g, "")
      .trim();

    if (!expr.includes("=")) return null;
    const [lhs, rhs] = expr.split(/=(.+)/);
    if (!rhs?.trim()) return null;

    const scope = { ...params, pi: Math.PI, e: Math.E, g: 9.81 };
    const val = evaluate(rhs.trim(), scope);
    if (typeof val === "number" && isFinite(val)) {
      return { lhs: lhs.trim(), value: Number(val.toFixed(4)) };
    }
  } catch { /* not evaluable */ }
  return null;
}

function detectDimension(latex) {
  const checks = [
    { pat: /F\s*=\s*m/, label: "F = ma", dim: "[kg·m/s²] = [N]", ok: true },
    { pat: /E\s*=\s*m\s*c/, label: "E = mc²", dim: "[kg·m²/s²] = [J]", ok: true },
    { pat: /P\s*=\s*\\frac\{1\}\{2\}.*v.*3/, label: "P = ½ρAv³", dim: "[W]", ok: true },
    { pat: /T\s*=\s*2.*pi.*sqrt.*L/, label: "T = 2π√(L/g)", dim: "[s]", ok: true },
    { pat: /\\sigma.*P.*r/, label: "σ = Pr/t", dim: "[Pa] = [N/m²]", ok: true },
    { pat: /\\Delta v.*v_e.*ln/, label: "Δv = vₑ·ln(R)", dim: "[m/s]", ok: true },
  ];
  for (const c of checks) {
    if (c.pat.test(latex)) return c;
  }
  return null;
}

// ── Structured equation card ─────────────────────────────────────────────────

function EquationCard({ eq, params, index }) {
  const [copied, setCopied] = useState(false);
  const evaluated = useMemo(() => tryEvaluate(eq.raw, params), [eq.raw, params]);
  const dim = useMemo(() => detectDimension(eq.raw), [eq.raw]);

  const copy = () => {
    navigator.clipboard.writeText(eq.raw).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isDisplay = eq.type === "display";
  const mathSrc = isDisplay ? `$$${eq.raw}$$` : `$${eq.raw}$`;

  return (
    <div className="group rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden hover:border-indigo-400/20 transition">
      {/* Equation number + type badge */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/30">Eq. {index + 1}</span>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${isDisplay ? "bg-indigo-500/20 text-indigo-300" : "bg-white/8 text-white/40"}`}>
            {isDisplay ? "display" : "inline"}
          </span>
          {dim && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-300/70">
              <CheckCircle className="h-2.5 w-2.5" /> {dim.dim}
            </span>
          )}
        </div>
        <button
          onClick={copy}
          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/10"
          title="Copy LaTeX"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-white/40" />}
        </button>
      </div>

      {/* Rendered equation */}
      <div className="px-4 py-3 overflow-x-auto">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{ p: ({ children }) => <span>{children}</span> }}
        >
          {normalizeMath(mathSrc)}
        </ReactMarkdown>
      </div>

      {/* Live evaluation + context */}
      {(evaluated || eq.context) && (
        <div className="px-3 pb-2 space-y-1">
          {evaluated && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-white/40">{evaluated.lhs} ≈</span>
              <span className="text-cyan-300 font-bold">{evaluated.value}</span>
              <span className="text-white/30">(with current params)</span>
            </div>
          )}
          {eq.context && (
            <p className="text-[10px] text-white/35 leading-relaxed line-clamp-2">{eq.context}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Structured equations from AI ─────────────────────────────────────────────

function AIEquationCard({ eq, params, index }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(eq.latex || eq.equation || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const latex = eq.latex || eq.equation || "";
  const mathSrc = `$$${latex}$$`;

  return (
    <div className="group rounded-2xl border border-indigo-500/15 bg-indigo-950/10 overflow-hidden hover:border-indigo-400/30 transition">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-indigo-500/10">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
            {eq.name || `Equation ${index + 1}`}
          </span>
          {eq.verified && <CheckCircle className="h-3 w-3 text-emerald-400" />}
        </div>
        <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/10">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-white/40" />}
        </button>
      </div>
      <div className="px-4 py-3 overflow-x-auto">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}
          components={{ p: ({ children }) => <span>{children}</span> }}>
          {normalizeMath(mathSrc)}
        </ReactMarkdown>
      </div>
      {(eq.description || eq.variables) && (
        <div className="px-3 pb-2 space-y-1">
          {eq.description && <p className="text-[11px] text-white/60">{eq.description}</p>}
          {eq.variables && (
            <p className="text-[10px] text-white/35 font-mono">{eq.variables}</p>
          )}
          {eq.physicalMeaning && (
            <p className="text-[10px] text-indigo-300/60 italic">{eq.physicalMeaning}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function EquationsPanel({ editorValue, params, aiEquations = [], artifactsGenerating }) {
  const [activeSection, setActiveSection] = useState("ai");

  const extractedEquations = useMemo(() => {
    if (!editorValue) return [];
    return extractAllEquations(editorValue);
  }, [editorValue]);

  const hasAI = aiEquations.length > 0;
  const hasExtracted = extractedEquations.length > 0;
  const isEmpty = !hasAI && !hasExtracted;

  return (
    <div className="h-full min-h-0 overflow-y-scroll loomin-scroll px-3 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sigma className="h-4 w-4 text-indigo-400" />
          <span className="text-[13px] font-semibold text-white/80">Equations</span>
        </div>
        {artifactsGenerating && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300/70">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Generating…
          </div>
        )}
      </div>

      {/* Section tabs */}
      {(hasAI || hasExtracted) && (
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 ring-1 ring-white/10 w-fit">
          {hasAI && (
            <button
              onClick={() => setActiveSection("ai")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
                activeSection === "ai" ? "bg-indigo-600/40 ring-1 ring-indigo-500/50 text-indigo-200" : "text-white/40 hover:text-white/60"
              }`}
            >
              AI-Structured ({aiEquations.length})
            </button>
          )}
          {hasExtracted && (
            <button
              onClick={() => setActiveSection("extracted")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
                activeSection === "extracted" ? "bg-white/15 ring-1 ring-white/20 text-white/80" : "text-white/40 hover:text-white/60"
              }`}
            >
              From Notes ({extractedEquations.length})
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !artifactsGenerating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sigma className="h-10 w-10 text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-1">No equations yet</p>
          <p className="text-xs text-white/20">Generate physics notes to extract and analyze equations</p>
        </div>
      )}

      {isEmpty && artifactsGenerating && (
        <div className="flex flex-col items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 text-indigo-400/50 animate-spin mb-3" />
          <p className="text-sm text-white/40">Extracting and structuring equations…</p>
        </div>
      )}

      {/* AI-structured equations */}
      {activeSection === "ai" && hasAI && (
        <div className="space-y-3">
          <p className="text-[11px] text-white/35 px-1">
            AI-curated equations with variable definitions and physical meaning
          </p>
          {aiEquations.map((eq, i) => (
            <AIEquationCard key={i} eq={eq} params={params} index={i} />
          ))}
        </div>
      )}

      {/* Extracted from notes */}
      {activeSection === "extracted" && hasExtracted && (
        <div className="space-y-3">
          <p className="text-[11px] text-white/35 px-1">
            Equations extracted from your notes — click to see live values with current parameters
          </p>
          {extractedEquations.map((eq, i) => (
            <EquationCard key={i} eq={eq} params={params} index={i} />
          ))}
        </div>
      )}

      {/* Auto-show extracted if AI not available */}
      {activeSection === "ai" && !hasAI && hasExtracted && (
        <div className="space-y-3">
          {extractedEquations.map((eq, i) => (
            <EquationCard key={i} eq={eq} params={params} index={i} />
          ))}
        </div>
      )}

      {/* Live parameter context */}
      {Object.keys(params).filter((k) => !k.startsWith("Scene")).length > 0 && (
        <div className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Live Parameter Context</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(params)
              .filter(([k]) => !k.startsWith("Scene"))
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-1 text-[11px] font-mono">
                  <span className="text-white/40">{k}</span>
                  <span className="text-cyan-300">{typeof v === "number" ? v.toFixed(2) : v}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
