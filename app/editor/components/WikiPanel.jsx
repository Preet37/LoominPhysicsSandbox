"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpen, Loader2, Sparkles, Link, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import "katex/dist/katex.min.css";

const MD_COMPONENTS = {
  h1: (p) => <h1 className="text-xl font-bold text-white/95 mb-3 mt-2" {...p} />,
  h2: (p) => <h2 className="text-lg font-semibold text-white/90 mb-2 mt-5 pb-1.5 border-b border-white/8" {...p} />,
  h3: (p) => <h3 className="text-[14px] font-semibold text-indigo-200/80 mt-4 mb-1.5" {...p} />,
  p: (p) => <p className="text-[13px] leading-[1.8] text-white/75 mb-3" {...p} />,
  ul: (p) => <ul className="list-disc list-inside space-y-1.5 mb-3" {...p} />,
  ol: (p) => <ol className="list-decimal list-inside space-y-1.5 mb-3" {...p} />,
  li: (p) => <li className="text-[13px] leading-[1.7] text-white/75" {...p} />,
  strong: (p) => <strong className="text-white font-semibold" {...p} />,
  blockquote: (p) => <blockquote className="border-l-2 border-indigo-400/40 pl-4 italic text-white/55 my-3" {...p} />,
  code: ({ inline, children, ...p }) =>
    inline
      ? <code className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 text-[12px]" {...p}>{children}</code>
      : <code {...p}>{children}</code>,
  pre: (p) => <pre className="rounded-xl border border-white/10 bg-[#0b1220] p-3 overflow-x-auto text-[12px] mb-3" {...p} />,
  a: ({ href, children }) => (
    <span className="text-indigo-400 hover:text-indigo-300 cursor-pointer underline underline-offset-2 decoration-indigo-500/40">
      {children}
    </span>
  ),
};

function normalizeMath(text = "") {
  return text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, e) => `\n$$\n${e.trim()}\n$$\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, e) => `$${e.trim()}$`);
}

function RelatedTopics({ topics }) {
  if (!topics?.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-white/8">
      <div className="flex items-center gap-2 mb-2">
        <Link className="h-3.5 w-3.5 text-indigo-400/60" />
        <span className="text-[11px] uppercase tracking-wider text-white/35">Related Topics</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {topics.map((t, i) => (
          <span key={i} className="px-2.5 py-1 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20 text-[11px] text-indigo-300/80">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function KeyTerms({ terms }) {
  if (!terms?.length) return null;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Key Terms ({terms.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {terms.map((t, i) => (
            <div key={i} className="flex gap-2 text-[12px]">
              <span className="text-cyan-300 font-semibold flex-shrink-0">{t.term}:</span>
              <span className="text-white/60">{t.definition}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WikiPanel({ wikiArticle, journals, onCompile, compiling }) {
  const [showAllJournals, setShowAllJournals] = useState(false);

  const hasArticle = !!wikiArticle;

  const journalsWithContent = journals.filter(
    (j) => j.editorValue && j.editorValue.length > 100 && j.topic
  );

  return (
    <div className="h-full min-h-0 overflow-y-scroll loomin-scroll px-3 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          <span className="text-[13px] font-semibold text-white/80">Physics Wiki</span>
        </div>
        <button
          onClick={onCompile}
          disabled={compiling || journalsWithContent.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 text-[11px] font-semibold text-indigo-300 disabled:opacity-40 transition"
        >
          {compiling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {compiling ? "Compiling…" : "Compile Wiki"}
        </button>
      </div>

      {/* Empty state */}
      {!hasArticle && !compiling && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-10 w-10 text-white/10 mb-4" />
          <p className="text-sm text-white/30 mb-2">Your Physics Wiki</p>
          <p className="text-xs text-white/20 max-w-[260px] mb-6">
            Compile all your journals into a structured knowledge base with backlinks, key terms, and cross-topic connections.
          </p>

          {journalsWithContent.length > 0 ? (
            <div className="w-full space-y-2 mb-4">
              <p className="text-[11px] text-white/35 text-left">
                {journalsWithContent.length} journal{journalsWithContent.length !== 1 ? "s" : ""} ready to compile:
              </p>
              {journalsWithContent.slice(0, 3).map((j) => (
                <div key={j.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] ring-1 ring-white/8 text-[12px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  <span className="text-white/70">{j.topic || j.name}</span>
                </div>
              ))}
              {journalsWithContent.length > 3 && (
                <p className="text-[11px] text-white/30">+{journalsWithContent.length - 3} more</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-white/20">Generate at least one physics topic first</p>
          )}
        </div>
      )}

      {/* Compiling state */}
      {compiling && (
        <div className="flex flex-col items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-indigo-400/50 animate-spin mb-3" />
          <p className="text-sm text-white/50">Compiling physics knowledge base…</p>
          <p className="text-xs text-white/25 mt-1">Linking concepts, building backlinks, structuring articles</p>
        </div>
      )}

      {/* Wiki article */}
      {hasArticle && !compiling && (
        <div className="space-y-4">
          {/* Article metadata */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center">
                <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white/85">{wikiArticle.title || "Physics Article"}</p>
                <p className="text-[10px] text-white/30">
                  Compiled {wikiArticle.compiledAt ? new Date(wikiArticle.compiledAt).toLocaleDateString() : "recently"}
                </p>
              </div>
            </div>
            <button
              onClick={onCompile}
              disabled={compiling}
              title="Recompile"
              className="p-2 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/60 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Categories / tags */}
          {wikiArticle.categories?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {wikiArticle.categories.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-white/8 text-[10px] text-white/50">{c}</span>
              ))}
            </div>
          )}

          {/* Article content */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={MD_COMPONENTS}
            >
              {normalizeMath(wikiArticle.content || "")}
            </ReactMarkdown>
            <KeyTerms terms={wikiArticle.keyTerms} />
            <RelatedTopics topics={wikiArticle.relatedTopics} />
          </div>

          {/* Cross-topic connections */}
          {wikiArticle.connections?.length > 0 && (
            <div className="rounded-2xl border border-indigo-500/15 bg-indigo-950/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-indigo-300/50 mb-2">Knowledge Connections</p>
              <div className="space-y-2">
                {wikiArticle.connections.map((c, i) => (
                  <div key={i} className="flex gap-3 text-[12px]">
                    <span className="text-indigo-400 font-semibold flex-shrink-0">{c.from} →</span>
                    <span className="text-white/60">{c.relationship} <span className="text-indigo-300">{c.to}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LLM Wiki info box */}
      {!hasArticle && !compiling && (
        <div className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3">
          <p className="text-[10px] text-white/35 leading-relaxed">
            <strong className="text-white/50">Karpathy LLM Wiki Pattern:</strong> Your journals are raw data. Compile compresses them into structured wiki articles with backlinks — just like Karpathy's evolving markdown knowledge base. Each compile enriches the previous version.
          </p>
        </div>
      )}
    </div>
  );
}
