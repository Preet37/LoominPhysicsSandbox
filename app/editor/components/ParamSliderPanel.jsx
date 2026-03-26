"use client";

// Detects whether a param should snap to integers
// (all of min/max/default are whole numbers and name suggests a count/integer)
function isIntegerParam(param) {
  return (
    Number.isInteger(param.min) &&
    Number.isInteger(param.max) &&
    Number.isInteger(param.default)
  );
}

// Patch a single param value in the raw editor text
function patchParam(text, paramName, newValue) {
  const re = new RegExp(
    `^([ \\t]*${paramName}[ \\t]*=[ \\t]*)([\\d.+-]+)([ \\t]*.*)$`,
    "mi"
  );
  return text.replace(re, `$1${newValue}$3`);
}

function SingleSlider({ param, rawValue, onCommit }) {
  const isInt = isIntegerParam(param);
  const step = isInt ? 1 : (param.max - param.min) / 300;

  // Visual fill — clamped to [0,100]%, but label shows real value
  const pct = ((rawValue - param.min) / (param.max - param.min)) * 100;
  const fillPct = Math.min(100, Math.max(0, pct));
  const isOver = rawValue > param.max;

  // Format displayed value
  const displayVal = isInt
    ? Math.round(rawValue)
    : rawValue % 1 === 0
    ? rawValue
    : rawValue.toFixed(2);

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
          value={Math.min(param.max, Math.max(param.min, rawValue))}
          onChange={(e) => {
            const v = isInt ? Math.round(Number(e.target.value)) : Number(e.target.value);
            onCommit(param.name, v);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Value label */}
      <div className="flex-shrink-0 text-right w-20">
        <span className={`text-[11px] font-mono font-semibold ${isOver ? "text-red-300" : "text-cyan-300"}`}>
          {displayVal}
        </span>
        {param.unit && (
          <span className="text-[10px] text-white/30 ml-1">{param.unit}</span>
        )}
      </div>
    </div>
  );
}

export default function ParamSliderPanel({ simConfig, currentParams, editorValue, onEditorChange }) {
  const params = simConfig?.params ?? [];
  if (params.length === 0) return null;

  const handleCommit = (paramName, newVal) => {
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
