"use client";

import { useMemo, useState, useCallback } from "react";
// useCallback kept for commitDraft
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { evaluate } from "mathjs";
import "katex/dist/katex.min.css";

const GREEK_MAP = {
  sigma: "\\sigma", rho: "\\rho", theta: "\\theta",
  lambda: "\\lambda", omega: "\\omega", alpha: "\\alpha",
  beta: "\\beta", gamma: "\\gamma", pi: "\\pi", delta: "\\delta",
};

function normalizeMathMarkdown(input = "") {
  return input
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, e) => `\n$$\n${e.trim()}\n$$\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, e) => `$${e.trim()}$`);
}

function normalizeInlineMathInput(input = "") {
  let out = input;
  for (const [k, v] of Object.entries(GREEK_MAP))
    out = out.replace(new RegExp(`\\b${k}\\b`, "gi"), v);
  out = out.replace(/([A-Za-z])\^(\d+)/g, "$1^{$2}");
  return out;
}

function extractEquations(markdown = "") {
  const eqs = [];
  const norm = normalizeMathMarkdown(markdown);
  let m;
  const reI = /\$([^$\n]+)\$/g;
  const reB = /\$\$([\s\S]*?)\$\$/g;
  while ((m = reI.exec(norm)) !== null) eqs.push(m[1].trim());
  while ((m = reB.exec(norm)) !== null) eqs.push(m[1].trim().replace(/\n/g, " "));
  return eqs;
}

function evalEquation(eq, scope) {
  if (!eq.includes("=")) return null;
  const [lhsRaw, rhsRaw] = eq.split(/=(.+)/);
  const lhs = lhsRaw?.trim(); const rhs = rhsRaw?.trim();
  if (!lhs || !rhs) return null;
  try {
    const value = evaluate(rhs, scope);
    if (typeof value === "number" && Number.isFinite(value))
      return { label: lhs, value: Number(value.toFixed(4)) };
  } catch { return null; }
  return null;
}

// The MD render config — shared across all blocks
const MD_COMPONENTS = {
  h2: (p) => <h2 className="text-xl font-semibold text-white/95 mb-2 mt-1" {...p} />,
  h3: (p) => <h3 className="text-base font-semibold text-indigo-200/90 mt-4 mb-1.5" {...p} />,
  h4: (p) => <h4 className="text-[13px] font-semibold text-white/80 mt-3 mb-1" {...p} />,
  p:  (p) => <p  className="text-[13px] leading-[1.75] text-white/80 mb-2" {...p} />,
  ul: (p) => <ul className="list-disc list-inside space-y-1 mb-2" {...p} />,
  ol: (p) => <ol className="list-decimal list-inside space-y-1 mb-2" {...p} />,
  li: (p) => <li className="text-[13px] leading-[1.75] text-white/80" {...p} />,
  strong: (p) => <strong className="text-white/95 font-semibold" {...p} />,
  code: ({ inline, children, ...p }) =>
    inline
      ? <code className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 text-[12px]" {...p}>{children}</code>
      : <code {...p}>{children}</code>,
  pre: (p) => <pre className="rounded-lg border border-white/10 bg-[#0b1220] p-2.5 overflow-x-auto text-[12px] text-white/85 mb-2" {...p} />,
  hr:  () => <hr className="border-white/10 my-3" />,
  blockquote: (p) => <blockquote className="border-l-2 border-indigo-400/50 pl-3 italic text-white/65 my-2" {...p} />,
};

export default function InteractiveNotesSurface({ value = "", onChange, currentParams = {}, checks = [] }) {
  const [editingIndex, setEditingIndex] = useState(-1);
  const [draft, setDraft] = useState("");

  const blocks = useMemo(() => value.split(/\n{2,}/g), [value]);
  const scope = useMemo(() => ({ ...currentParams }), [currentParams]);

  // Commit block edit — fires on every keystroke, not just blur
  const commitDraft = useCallback((text) => {
    if (editingIndex < 0) return;
    const next = [...blocks];
    next[editingIndex] = text;
    onChange?.(next.join("\n\n"));
  }, [editingIndex, blocks, onChange]);

  const finishEdit = () => {
    if (editingIndex < 0) return;
    const next = [...blocks];
    next[editingIndex] = normalizeInlineMathInput(draft);
    onChange?.(next.join("\n\n"));
    setEditingIndex(-1);
    setDraft("");
  };

  return (
    <div className="h-full overflow-y-auto loomin-scroll px-4 py-4">

      {/* ── Content Blocks ── */}
      <div className="space-y-2.5">
        {blocks.map((block, idx) => {
          if (editingIndex === idx) {
            return (
              <textarea
                key={`edit-${idx}`}
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  commitDraft(e.target.value); // live update on every keystroke
                }}
                onBlur={finishEdit}
                onKeyDown={(e) => {
                  if (e.key === "Escape") finishEdit();
                }}
                rows={Math.max(3, draft.split("\n").length + 1)}
                className="w-full rounded-xl border border-indigo-400/40 bg-[#0b1220] px-3 py-2.5 text-[13px] leading-6 text-white/90 outline-none resize-none font-mono"
              />
            );
          }

          const equations = extractEquations(block);
          const evaluated = equations.map((eq) => evalEquation(eq, scope)).filter(Boolean);

          return (
            <div
              key={`block-${idx}`}
              onClick={() => { setEditingIndex(idx); setDraft(blocks[idx] ?? ""); }}
              className="group rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 cursor-text hover:border-indigo-400/20 hover:bg-white/[0.04] transition"
            >
              {/* tiny edit hint on hover */}
              <div className="hidden group-hover:block text-[9px] text-white/25 mb-1 select-none">Click to edit</div>

              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={MD_COMPONENTS}
              >
                {normalizeMathMarkdown(block)}
              </ReactMarkdown>

              {/* Live equation evaluator */}
              {evaluated.length > 0 && (
                <div className="mt-2 pt-2 border-t border-cyan-400/10 flex flex-wrap gap-x-4 gap-y-1">
                  {evaluated.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className="text-white/40">{r.label} =</span>
                      <span className="text-cyan-300 font-semibold">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Factual Guard ── */}
      {checks.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Factual Guard</div>
          <div className="space-y-1.5">
            {checks.map((c, idx) => (
              <div key={idx} className={`flex items-start gap-2 text-[11px] ${c.pass ? "text-emerald-300" : "text-amber-300/80"}`}>
                <span className="flex-shrink-0">{c.pass ? "✓" : "○"}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
