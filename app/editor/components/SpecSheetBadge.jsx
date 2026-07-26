"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, TriangleAlert, ChevronDown, Ruler } from "lucide-react";

/** Group dimensions by unit so the table reads sensibly. */
const UNIT_LABEL = {
  mm: "mm",
  mm2: "mm²",
  g: "g",
  deg: "°",
  count: "",
  ratio: "",
};

function fmt(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 10000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return (Math.round(value * 100) / 100).toString();
}

/**
 * Shows which real product's measurements the 3D model was built from, plus the
 * deterministic checks that ran against them. Collapsed to a single chip until
 * clicked, so it never competes with the canvas for space.
 */
export default function SpecSheetBadge({ specSheet }) {
  const [open, setOpen] = useState(false);

  const spec = specSheet?.spec;
  const validation = specSheet?.validation;
  if (!spec?.dimensions?.length) return null;

  const valid = validation?.valid !== false;
  const errors = validation?.errors ?? [];
  const warnings = validation?.warnings ?? [];
  const checks = validation?.checks ?? [];

  return (
    <div className="relative flex-shrink-0 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={
          valid
            ? `Dimensions verified against ${spec.referenceProduct || "a real reference"}`
            : `Dimensions found but ${errors.length} check(s) failed`
        }
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition min-w-0 border ${
          valid
            ? "bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/25 text-sky-300"
            : "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/25 text-amber-300"
        }`}
      >
        {valid ? <BadgeCheck className="h-3 w-3 flex-shrink-0" /> : <TriangleAlert className="h-3 w-3 flex-shrink-0" />}
        <span className="hidden md:inline truncate max-w-[130px]">
          {spec.referenceProduct || "Researched specs"}
        </span>
        <span className="md:hidden">{spec.dimensions.length}</span>
        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full mt-2 z-50 w-[340px] max-h-[420px] overflow-y-auto rounded-2xl bg-[#0b1020]/97 ring-1 ring-white/15 backdrop-blur-xl shadow-2xl p-3"
          >
            <div className="flex items-start gap-2 mb-2">
              <Ruler className="h-3.5 w-3.5 text-sky-300 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white/90 leading-tight">
                  {spec.referenceProduct || "Researched reference"}
                </div>
                <div className="text-[9px] text-white/40 mt-0.5">
                  {spec.category ? `${spec.category} · ` : ""}
                  {spec.dimensions.length} dimensions · via {spec.model}
                </div>
              </div>
            </div>

            <p className="text-[9px] text-white/40 leading-relaxed mb-2">
              These measurements were researched from a real reference and checked
              for unit consistency and physical plausibility before the model was built.
            </p>

            <table className="w-full text-[10px]">
              <tbody>
                {spec.dimensions.map((d) => (
                  <tr key={d.key} className="border-t border-white/6">
                    <td className="py-1 pr-2 text-white/55 align-top">{d.label || d.key}</td>
                    <td className="py-1 text-right font-mono text-white/85 whitespace-nowrap">
                      {fmt(d.value)}
                      <span className="text-white/35 ml-0.5">{UNIT_LABEL[d.unit] ?? d.unit}</span>
                    </td>
                    {d.rawUnit && d.rawUnit !== d.unit && (
                      <td className="py-1 pl-2 text-right text-white/25 font-mono whitespace-nowrap">
                        {d.rawValue} {d.rawUnit}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {Object.keys(spec.attributes || {}).length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/8">
                {Object.entries(spec.attributes).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-[10px] py-0.5">
                    <span className="text-white/45">{k.replace(/_/g, " ")}</span>
                    <span className="text-white/75 font-mono text-right truncate max-w-[160px]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {checks.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/8">
                <div className="text-[9px] uppercase tracking-wide text-white/35 mb-1">Validation</div>
                {checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[10px] py-0.5">
                    <span className={c.pass ? "text-emerald-400" : "text-rose-400"}>{c.pass ? "✓" : "✗"}</span>
                    <span className={c.pass ? "text-white/50" : "text-rose-300"}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}

            {errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-rose-500/20">
                {errors.map((e, i) => (
                  <div key={i} className="text-[9px] text-rose-300/85 leading-snug py-0.5">{e}</div>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-500/20">
                {warnings.map((w, i) => (
                  <div key={i} className="text-[9px] text-amber-300/75 leading-snug py-0.5">{w}</div>
                ))}
              </div>
            )}

            {spec.notes?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/8">
                {spec.notes.map((n, i) => (
                  <div key={i} className="text-[9px] text-white/45 leading-snug py-0.5">· {n}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
