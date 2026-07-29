"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw, Check, X, Loader2, TriangleAlert } from "lucide-react";

/**
 * Concept-first generative model flow.
 *
 * The mesh model reconstructs whatever the concept image shows, so a wrong
 * image is a wrong model every time — and finding that out costs ~$0.40 and two
 * minutes, against ~$0.005 and three seconds for the image alone. So the image
 * is always shown and always needs an explicit accept before the mesh runs.
 * Rerolling is deliberately the cheapest action on screen.
 */
export default function GenerativeModelPanel({ topic, specSheet, onMeshReady }) {
  const [available, setAvailable] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | concept | review | mesh | done | error
  const [concept, setConcept] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/generate-mesh")
      .then((r) => r.json())
      .then((d) => !cancelled && setAvailable(!!d.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset when the user moves to a different topic.
  useEffect(() => {
    setPhase("idle");
    setConcept(null);
    setError(null);
  }, [topic]);

  // The mesh stage is long enough that a bare spinner reads as a hang.
  useEffect(() => {
    if (phase !== "mesh") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const post = useCallback(
    async (body) => {
      const res = await fetch("/api/generate-mesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, specSheet, ...body }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      return data;
    },
    [topic, specSheet],
  );

  const runConcept = useCallback(async () => {
    setPhase("concept");
    setError(null);
    try {
      const data = await post({ stage: "concept" });
      setConcept(data);
      setPhase("review");
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }, [post]);

  const runMesh = useCallback(async () => {
    if (!concept?.imageUrl) return;
    setPhase("mesh");
    setError(null);
    try {
      const data = await post({ stage: "mesh", imageUrl: concept.imageUrl });
      setPhase("done");
      onMeshReady?.(data);
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }, [concept, post, onMeshReady]);

  // Nothing to offer when the deployment has no key — better than a button that 503s.
  if (available === false || !topic) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-300/80" />
        <span className="text-[11px] font-medium text-white/70">Photoreal model</span>
        {concept?.referenceProduct && (
          <span className="text-[10px] text-white/35 truncate">· {concept.referenceProduct}</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.button
            key="idle"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={runConcept}
            className="w-full py-1.5 rounded-lg bg-violet-500/15 border border-violet-400/25 text-[11px] text-violet-200 hover:bg-violet-500/25 transition"
          >
            Preview a concept
          </motion.button>
        )}

        {phase === "concept" && (
          <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300/70" />
            <span className="text-[10px] text-white/45">Sketching the concept…</span>
          </motion.div>
        )}

        {phase === "review" && concept && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={concept.imageUrl}
              alt={`Concept for ${topic}`}
              className="w-full rounded-lg border border-white/10 bg-white/5"
            />
            <p className="text-[10px] text-white/40 leading-snug">
              The 3D model is built from this image. Reroll if it is not the right object.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={runMesh}
                className="flex-1 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/25 text-[11px] text-emerald-200 hover:bg-emerald-500/25 transition flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> Build 3D
              </button>
              <button
                type="button"
                onClick={runConcept}
                title="Generate a different concept"
                className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 hover:bg-white/10 transition"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}

        {phase === "mesh" && (
          <motion.div key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5 py-1">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300/70" />
              <span className="text-[10px] text-white/45">
                Building geometry and textures… {elapsed}s
              </span>
            </div>
            <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
              {/* ~130s is the expected run, so this reads as progress rather than a stall. */}
              <div
                className="h-full bg-violet-400/50 transition-[width] duration-1000"
                style={{ width: `${Math.min(96, (elapsed / 130) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-white/30">Usually about two minutes. Saved for next time.</p>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-1">
            <Check className="w-3.5 h-3.5 text-emerald-300/80" />
            <span className="text-[10px] text-white/50">Model ready</span>
            <button
              type="button"
              onClick={runConcept}
              className="ml-auto text-[10px] text-white/35 hover:text-white/60 transition"
            >
              Regenerate
            </button>
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5">
            <div className="flex items-start gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5 text-amber-300/70 flex-shrink-0 mt-px" />
              <span className="text-[10px] text-white/45 leading-snug">{error}</span>
            </div>
            <button
              type="button"
              onClick={runConcept}
              className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 hover:bg-white/10 transition"
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
