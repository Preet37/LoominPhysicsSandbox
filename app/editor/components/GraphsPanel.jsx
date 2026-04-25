"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { BarChart2, ChevronLeft, ChevronRight, Sliders } from "lucide-react";
import { computeGraphData } from "@/lib/computeGraphData";

// ── Custom chart elements ─────────────────────────────────────────────────────

const CHART_STYLE = {
  background: "transparent",
  fontFamily: "ui-monospace, monospace",
};

function CustomTooltip({ active, payload, label, xLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1220] border border-white/15 rounded-xl px-3 py-2.5 text-[11px] shadow-2xl">
      <p className="text-white/50 mb-1.5 font-mono">{xLabel}: <span className="text-white/80">{typeof label === "number" ? label.toFixed(3) : label}</span></p>
      {payload.map((p, i) => (
        p.name ? (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span style={{ color: p.color }} className="font-semibold">{typeof p.value === "number" ? p.value.toFixed(4) : p.value}</span>
            <span className="text-white/40">{p.name}</span>
          </div>
        ) : null
      ))}
    </div>
  );
}

function ChartTitle({ title, annotation }) {
  return (
    <div className="px-1 mb-2">
      <h3 className="text-[13px] font-semibold text-white/85">{title}</h3>
      {annotation && <p className="text-[10px] text-white/35 mt-0.5 font-mono">{annotation}</p>}
    </div>
  );
}

// ── Interactive param slider under a chart ────────────────────────────────────

function InteractiveParamSlider({ chart, currentValue, onParamChange }) {
  if (!chart.paramKey || chart.paramMin == null || chart.paramMax == null) return null;

  const min = chart.paramMin;
  const max = chart.paramMax;
  const step = (max - min) / 200;
  const val = currentValue ?? chart.paramDefault ?? (min + max) / 2;

  return (
    <div className="mt-2 px-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40 font-mono">{chart.xLabel?.split(" (")[0] || chart.paramKey}</span>
        <span className="text-[10px] text-indigo-300 font-mono font-semibold">
          {Number(val).toFixed(Number.isInteger(step) ? 0 : 1)}
          {chart.paramUnit ? ` ${chart.paramUnit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onParamChange(chart.paramKey, Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, rgba(99,102,241,0.7) ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.12) ${((val - min) / (max - min)) * 100}%)`,
          accentColor: "rgba(99,102,241,0.8)",
        }}
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-white/20">{min}</span>
        <span className="text-[9px] text-white/20">{max}</span>
      </div>
    </div>
  );
}

// ── Chart renderers ───────────────────────────────────────────────────────────

const CHART_HEIGHT = 165;

function renderLineChart(chart) {
  const hasMultiY = chart.series.length > 1;
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={chart.data} style={CHART_STYLE} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={chart.xKey}
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false}
          label={{ value: chart.xLabel, position: "insideBottomRight", offset: -4, fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false}
          width={48}
          label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
        />
        <Tooltip content={<CustomTooltip xLabel={chart.xLabel} />} />
        {hasMultiY && <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }} />}
        {(chart.regions || []).map((r, i) => (
          <ReferenceArea key={i} x1={r.x1} x2={r.x2} fill={r.color} label={{ value: r.label, fill: "rgba(255,255,255,0.3)", fontSize: 9 }} />
        ))}
        {chart.currentX !== undefined && (
          <ReferenceLine
            x={chart.currentX}
            stroke="rgba(99,102,241,0.85)"
            strokeDasharray="4 4"
            strokeWidth={2}
            label={{ value: "▼ current", position: "top", fill: "rgba(99,102,241,0.9)", fontSize: 9 }}
          />
        )}
        {chart.series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.label} stroke={s.color}
            strokeWidth={s.dash ? 1.5 : 2} strokeDasharray={s.dash} dot={false} activeDot={{ r: 4, fill: s.color }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function renderAreaChart(chart) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart data={chart.data} style={CHART_STYLE} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={chart.xKey} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
        <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} width={48} />
        <Tooltip content={<CustomTooltip xLabel={chart.xLabel} />} />
        {(chart.regions || []).map((r, i) => (
          <ReferenceArea key={i} x1={r.x1} x2={r.x2} fill={r.color} />
        ))}
        {chart.currentX !== undefined && (
          <ReferenceLine x={chart.currentX} stroke="rgba(99,102,241,0.85)" strokeDasharray="4 4" strokeWidth={2} />
        )}
        {chart.series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name || s.label} stroke={s.color}
            fill={`${s.color}26`} strokeWidth={2} dot={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function renderScatterChart(chart) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ScatterChart style={CHART_STYLE} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={chart.xKey} type="number" name={chart.xLabel}
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false} domain={["auto", "auto"]} />
        <YAxis dataKey={chart.series[0]?.key} type="number" name={chart.yLabel}
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false} width={48} />
        <Tooltip content={<CustomTooltip xLabel={chart.xLabel} />} />
        {chart.series.map((s) => (
          <Scatter key={s.key} name={s.name || s.label} data={chart.data} fill={s.color}
            line={{ stroke: s.color, strokeWidth: 2 }} shape={<circle r={0} />} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ chart, params, onParamChange }) {
  const renderer = chart.type === "area" ? renderAreaChart : chart.type === "scatter" ? renderScatterChart : renderLineChart;
  const currentValue = chart.paramKey ? (params?.[chart.paramKey] ?? null) : null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 hover:border-white/15 transition">
      <ChartTitle title={chart.title} annotation={chart.annotation} />
      {renderer(chart)}
      {onParamChange && (
        <InteractiveParamSlider
          chart={chart}
          currentValue={currentValue}
          onParamChange={onParamChange}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function GraphsPanel({ simType, params, onParamChange }) {
  const [page, setPage] = useState(0);
  const [showSliders, setShowSliders] = useState(true);
  const CHARTS_PER_PAGE = 2;

  const charts = useMemo(() => computeGraphData(simType, params), [simType, params]);

  const totalPages = Math.ceil(charts.length / CHARTS_PER_PAGE);
  const visible = charts.slice(page * CHARTS_PER_PAGE, (page + 1) * CHARTS_PER_PAGE);

  useEffect(() => { setPage(0); }, [simType]);

  return (
    <div className="h-full min-h-0 overflow-y-scroll loomin-scroll px-3 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-indigo-400" />
          <span className="text-[13px] font-semibold text-white/80">Physics Graphs</span>
        </div>
        <div className="flex items-center gap-2">
          {charts.length > 0 && (
            <span className="text-[11px] text-white/35">{charts.length} chart{charts.length !== 1 ? "s" : ""}</span>
          )}
          {charts.some((c) => c.paramKey) && (
            <button
              onClick={() => setShowSliders((v) => !v)}
              title="Toggle interactive controls"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition ring-1 ${
                showSliders
                  ? "bg-indigo-500/20 ring-indigo-500/30 text-indigo-300"
                  : "bg-white/5 ring-white/10 text-white/40 hover:text-white/60"
              }`}
            >
              <Sliders className="h-3 w-3" />
              Live controls
            </button>
          )}
        </div>
      </div>

      {/* Real-time binding notice */}
      {charts.length > 0 && onParamChange && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-950/30 ring-1 ring-indigo-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          <p className="text-[10px] text-indigo-300/70">
            Sliders below each chart update the 3D simulation in real time.
            The <span className="text-indigo-300 font-semibold">▼ current</span> line moves as you drag.
          </p>
        </div>
      )}

      {/* Empty state */}
      {charts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-10 w-10 text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-1">No charts yet</p>
          <p className="text-xs text-white/20">Generate a physics simulation to see live parameter graphs</p>
        </div>
      )}

      {/* Charts */}
      {visible.map((chart) => (
        <ChartCard
          key={chart.id}
          chart={chart}
          params={params}
          onParamChange={showSliders && onParamChange ? onParamChange : null}
        />
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 text-[11px] text-white/60 disabled:opacity-30 hover:bg-white/10 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <span className="text-[11px] text-white/30">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 text-[11px] text-white/60 disabled:opacity-30 hover:bg-white/10 transition"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
