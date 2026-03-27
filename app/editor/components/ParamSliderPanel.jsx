"use client";

import { useEffect, useState } from "react";

// Detects whether a param should snap to integers
// (all of min/max/default are whole numbers and name suggests a count/integer)
function isIntegerParam(param) {
  return (
    Number.isInteger(param.min) &&
    Number.isInteger(param.max) &&
    Number.isInteger(param.default)
  );
}

// Patch a single param value in the raw editor text.
// Matches the param name case-insensitively so Wind_Speed, WIND_SPEED,
// wind_speed etc. all resolve to the same line.
function patchParam(text, paramName, newValue) {
  // Build a pattern that matches any separator style (underscores → [\s_]*)
  // while still being case-insensitive.
  const escaped = paramName.replace(/_/g, "[_\\s]*");
  const re = new RegExp(
    `^([ \\t]*${escaped}[ \\t]*=[ \\t]*)([\\d.+-]+)([ \\t]*.*)$`,
    "mi"
  );
  return text.replace(re, `$1${newValue}$3`);
}

function fmt(val, isInt) {
  if (isInt) return Math.round(val);
  return val % 1 === 0 ? val : parseFloat(val.toFixed(2));
}

function SingleSlider({ param, rawValue, onCommit }) {
  const isInt = isIntegerParam(param);
  const step = isInt ? 1 : (param.max - param.min) / 300;

  // Local value updates immediately on any interaction so the display is
  // always in sync. It syncs from the prop only when the prop changes AND
  // we are not currently interacting (i.e. an external edit came in).
  const [localValue, setLocalValue] = useState(rawValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const interacting = editing;

  useEffect(() => {
    if (!interacting) {
      setLocalValue(rawValue);
    }
  }, [rawValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayVal = fmt(localValue, isInt);
  const pct = ((localValue - param.min) / (param.max - param.min)) * 100;
  const fillPct = Math.min(100, Math.max(0, pct));
  const isOver = localValue > param.max;

  const commit = (v) => {
    const clamped = isInt ? Math.round(v) : v;
    setLocalValue(clamped);
    onCommit(param.name, clamped);
  };

  return (
    <div className="flex items-center gap-3 group">
      <span className="text-[11px] text-white/50 w-24 truncate flex-shrink-0">
        {param.label || param.name}
      </span>

      {/* Track */}
      <div className="relative flex-1 h-6 flex items-center">
        <div className="pointer-events-none w-full h-[3px] rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${isOver ? "bg-red-400/70" : "bg-indigo-400/65"}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={step}
          value={Math.min(param.max, Math.max(param.min, localValue))}
          onChange={(e) => {
            const v = isInt ? Math.round(Number(e.target.value)) : Number(e.target.value);
            commit(v);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Value label — click to type directly */}
      <div className="flex-shrink-0 text-right w-20">
        {editing ? (
          <input
            type="number"
            step={isInt ? 1 : step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onBlur={() => {
              const num = Number(draft);
              if (Number.isFinite(num)) commit(num);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded-lg border border-white/15 bg-[#0b1220] px-2 py-1 text-[11px] font-mono text-white/90 outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setEditing(true); setDraft(String(displayVal)); }}
            className={`text-[11px] font-mono font-semibold ${isOver ? "text-red-300" : "text-cyan-300"} hover:opacity-90 transition`}
            title="Click to edit value"
          >
            {displayVal}
          </button>
        )}
        {param.unit && (
          <span className="text-[10px] text-white/30 ml-1">{param.unit}</span>
        )}
      </div>
    </div>
  );
}

export default function ParamSliderPanel({ simConfig, currentParams, editorValue, onEditorChange, onParamChange }) {
  const params = simConfig?.params ?? [];
  if (params.length === 0) return null;

  const handleCommit = (paramName, newVal) => {
    // Immediately update the isolated var so the 3-D scene and physics
    // checker react without waiting for a parse round-trip.
    onParamChange?.(paramName, newVal);
    // Also patch the raw editor text so the notes panel stays in sync.
    const patched = patchParam(editorValue, paramName, newVal);
    onEditorChange?.(patched);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 bg-[#050810]/90 border-t border-white/8 backdrop-blur-md">
      <div className="text-[9px] uppercase tracking-widest text-white/25 mb-2.5">
        Parameters — drag to adjust
      </div>
      <div className="space-y-2.5">
        {params.map((p) => (
          <SingleSlider
            key={p.name}
            param={p}
            rawValue={currentParams[p.name] ?? p.default}
            onCommit={handleCommit}
          />
        ))}
      </div>
    </div>
  );
}
