"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, XCircle, Zap } from "lucide-react";

export default function StatusCard({ physicsState, onAutoFix }) {
  const { state, explanation } = physicsState;

  if (state === "OPTIMAL") {
    return (
      <motion.div
        key="optimal"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md"
      >
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider">OPTIMAL</span>
      </motion.div>
    );
  }

  if (state === "WARNING") {
    return (
      <motion.div
        key="warning"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="absolute top-4 left-4 max-w-[280px] rounded-xl bg-amber-950/90 border border-amber-500/50 backdrop-blur-md overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/30">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-xs font-mono font-bold text-amber-400 tracking-wider">WARNING</span>
        </div>
        {explanation && (
          <p className="px-3 py-2 text-[11px] text-amber-200/80 leading-relaxed">
            {explanation.length > 120 ? explanation.slice(0, 120) + '…' : explanation}
          </p>
        )}
      </motion.div>
    );
  }

  if (state === "CRITICAL_FAILURE") {
    return (
      <motion.div
        key="critical"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="absolute top-4 left-4 max-w-[300px] rounded-xl bg-red-950/95 border border-red-500/60 backdrop-blur-md overflow-hidden shadow-lg shadow-red-500/20"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/40 bg-red-900/40">
          <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs font-mono font-bold text-red-400 tracking-wider">CRITICAL FAILURE</span>
        </div>
        {explanation && (
          <p className="px-3 pt-2 pb-1 text-[11px] text-red-200/80 leading-relaxed">
            {explanation.length > 200 ? explanation.slice(0, 200) + '…' : explanation}
          </p>
        )}
        <div className="px-3 pb-3 pt-2">
          <button
            onClick={onAutoFix}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 hover:border-red-400/60 transition text-xs font-semibold text-red-300 hover:text-red-200"
          >
            <Zap className="h-3.5 w-3.5" />
            AUTO-FIX CODE
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}
