"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, XCircle, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

// Splits "Param is X — exceeds..." header from the body explanation
function splitExplanation(text) {
  const dashIdx = text.indexOf("—");
  if (dashIdx === -1) return { header: "", body: text };
  const afterDash = text.indexOf(". ", dashIdx);
  if (afterDash === -1) return { header: text.slice(0, dashIdx).trim(), body: text.slice(dashIdx + 1).trim() };
  return {
    header: text.slice(0, afterDash).trim(),
    body: text.slice(afterDash + 2).trim(),
  };
}

export default function StatusCard({ physicsState, onAutoFix }) {
  const { state, explanation, technical } = physicsState;
  const [expanded, setExpanded] = useState(true);
  // Collapsed by default: the plain explanation is the lesson, the symbols are
  // reference material for whoever wants to check the reasoning.
  const [showPhysics, setShowPhysics] = useState(false);

  if (state === "OPTIMAL") {
    return (
      <motion.div
        key="optimal"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md"
      >
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider">OPTIMAL</span>
      </motion.div>
    );
  }

  const isCritical = state === "CRITICAL_FAILURE";
  const color = isCritical
    ? { bg: "bg-red-950/95", border: "border-red-500/60", shadow: "shadow-red-500/20", head: "bg-red-900/40 border-red-500/40", tag: "text-red-400", text: "text-red-200/85", body: "text-red-100/75" }
    : { bg: "bg-amber-950/92", border: "border-amber-500/50", shadow: "shadow-amber-500/10", head: "bg-amber-900/30 border-amber-500/30", tag: "text-amber-400", text: "text-amber-200/85", body: "text-amber-100/75" };

  const { header, body } = explanation ? splitExplanation(explanation) : { header: "", body: "" };

  return (
    <motion.div
      key={state}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`absolute top-4 left-4 z-50 w-[340px] rounded-2xl ${color.bg} border ${color.border} backdrop-blur-md overflow-hidden shadow-lg ${color.shadow}`}
    >
      {/* Header row */}
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${color.head}`}>
        {isCritical
          ? <XCircle className={`h-3.5 w-3.5 ${color.tag} flex-shrink-0`} />
          : <AlertTriangle className={`h-3.5 w-3.5 ${color.tag} flex-shrink-0`} />}
        <span className={`text-[11px] font-mono font-bold ${color.tag} tracking-widest flex-1`}>
          {isCritical ? "CRITICAL FAILURE" : "WARNING"}
        </span>
        <button
          onClick={() => setExpanded((x) => !x)}
          className={`${color.tag} opacity-60 hover:opacity-100 transition`}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && explanation && (
        <div className="px-3.5 pt-3 pb-2 max-h-[280px] overflow-y-auto loomin-scroll">
          {/* What triggered */}
          {header && (
            <div className={`text-[12px] font-semibold ${color.text} mb-2 leading-snug`}>
              {header}
            </div>
          )}

          {/* Plain-language explanation — broken into natural paragraphs */}
          {body && (
            <div className={`text-[11px] ${color.body} leading-relaxed space-y-2`}>
              {body.split(/(?<=\.)\s+(?=[A-Z])/).map((sentence, i) => (
                <p key={i}>{sentence}</p>
              ))}
            </div>
          )}

        </div>
      )}

      {/* Outside the scroll container: inside it the toggle sat below the fold
          and could not be clicked without scrolling to a boundary. */}
      {expanded && technical && (
        <div className="px-3.5 pb-1 pt-1.5 border-t border-white/10">
          <button
            onClick={() => setShowPhysics((x) => !x)}
            className={`text-[10px] font-mono uppercase tracking-wider ${color.tag} opacity-70 hover:opacity-100 transition`}
          >
            {showPhysics ? "Hide the physics" : "Show the physics"}
          </button>
          {showPhysics && (
            <div className={`mt-2 mb-1 max-h-[150px] overflow-y-auto loomin-scroll text-[10px] font-mono ${color.body} opacity-80 leading-relaxed space-y-1.5`}>
              {technical.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {isCritical && (
        <div className="px-3.5 pb-3.5 pt-2.5">
          <button
            onClick={onAutoFix}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 hover:border-red-400/60 transition text-xs font-semibold text-red-300 hover:text-red-200"
          >
            <Zap className="h-3.5 w-3.5" />
            AUTO-FIX CODE
          </button>
        </div>
      )}
    </motion.div>
  );
}
