"use client";

/**
 * DynamicPhysicsScene
 * Evaluates AI-generated R3F component code at runtime.
 * The server transforms JSX → React.createElement via sucrase, so code
 * arriving here is plain JS that new Function() can evaluate directly.
 */

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html, Environment, Line, Text } from "@react-three/drei";

/**
 * LLMs often emit useMemo(fn, undefined) — React requires an array.
 * This wrapper normalises the deps so the reconciler never crashes.
 */
function useMemoSafe(fn, deps) {
  if (typeof fn !== "function") {
    throw new TypeError("useMemo first argument must be a function");
  }
  if (deps === undefined || deps === null) return useMemo(fn, []);
  if (!Array.isArray(deps)) return useMemo(fn, [deps]);
  return useMemo(fn, deps);
}

/**
 * LLMs frequently write useFrame callbacks that call .forEach / .map on a
 * ref that is null/undefined on the first frame (refs populate after mount).
 * Since useFrame runs outside React's render tree, ErrorBoundary cannot catch
 * it — the error propagates to the root and crashes the whole page.
 *
 * This wrapper runs the callback inside try/catch. After the first error it
 * silences subsequent calls (prevents console spam) and logs once.
 */
function useFrameSafe(callback, priority) {
  const errored = useRef(false);
  useFrame((state, delta) => {
    if (errored.current) return;
    try {
      callback(state, delta);
    } catch (e) {
      errored.current = true;
      console.error(
        "[DynamicPhysicsScene] useFrame runtime error (animation stopped):",
        e?.message ?? String(e),
      );
    }
  }, priority);
}

/**
 * Pre-flight sanitizer: fix common LLM substitution mistakes before eval.
 * Runs BEFORE new Function() so bad names never hit the runtime.
 */
function sanitizeGeneratedCode(code) {
  return code
    // LLMs sometimes write useFrameR3F (wrong) instead of useFrame
    .replace(/\buseFrameR3F\b/g, "useFrame")
    // LLMs sometimes write useR3FThree / useR3F instead of useThree
    .replace(/\buseR3FThree\b/g, "useThree")
    .replace(/\buseR3F\b/g, "useThree")
    // LLMs sometimes write useThreeContext
    .replace(/\buseThreeContext\b/g, "useThree")
    // LLMs sometimes import useFrame from 'react' — the import is stripped, variable stays
    .replace(/\bReact\.useFrame\b/g, "useFrame")
    // Remove leftover import/require statements the strip tool might have missed
    .replace(/^const\s+\{[^}]+\}\s*=\s*require\(['"][^'"]+['"]\)\s*;?\s*$/gm, "")
    .replace(/^import\s+.+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, "");
}

// ── safe evaluator ────────────────────────────────────────────────────────────
function compileScene(code) {
  if (!code || !code.trim()) return { Component: null, error: "No code provided" };
  try {
    const sanitized = sanitizeGeneratedCode(code);

    // eslint-disable-next-line no-new-func
    const factory = new Function(
      "React",
      "useFrame",       // → useFrameSafe
      "useRef",
      "useState",
      "useEffect",
      "useMemo",        // → useMemoSafe
      "THREE",
      "useThree",       // @react-three/fiber — read camera, gl, scene
      "useFrameR3F",    // alias → useFrameSafe (LLM compat)
      "Html",           // @react-three/drei
      "Line",           // @react-three/drei
      "Text",           // @react-three/drei
      `${sanitized}
      if (typeof GeneratedScene !== 'undefined') return GeneratedScene;
      throw new Error('GeneratedScene function not found in generated code');`
    );
    const Component = factory(
      React,
      useFrameSafe,   // wraps in try/catch
      useRef,
      useState,
      useEffect,
      useMemoSafe,    // normalises bad deps arrays
      THREE,
      useThree,       // R3F context hook
      useFrameSafe,   // useFrameR3F alias
      Html,           // drei Html overlay
      Line,           // drei Line
      Text,           // drei Text
    );
    if (typeof Component !== "function") throw new Error("GeneratedScene is not a function");
    return { Component, error: null };
  } catch (e) {
    console.error("[DynamicPhysicsScene] compile error:", e?.message);
    return { Component: null, error: e?.message || String(e) };
  }
}

// ── Vision verifier — captures canvas screenshot after scene settles ──────────
function VisionVerifier({ topic, onScore }) {
  const { gl } = useThree();
  const fired = useRef(false);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current += 1;
    // Wait ~90 frames (~1.5s) before grabbing screenshot
    if (fired.current || frameCount.current < 90) return;
    fired.current = true;

    try {
      const dataUrl = gl.domElement.toDataURL("image/jpeg", 0.75);
      const base64 = dataUrl.split(",")[1];
      if (!base64) return;

      fetch("/api/verify-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: topic, imageBase64: base64 }),
      })
        .then((r) => r.json())
        .then((d) => {
          const score = d?.score ?? 75;
          onScore(score);
          // If score is low, attach Gemini's specific issues to the regenerate feedback
          if (score < 55 && d?.issues?.length) {
            window.__lastVisionIssues = d.issues;
            window.__lastVisionSuggestions = d.suggestions || [];
          }
        })
        .catch(() => onScore(75));
    } catch {
      onScore(75);
    }
  });

  return null;
}

// ── Inner renderer ─────────────────────────────────────────────────────────────
function SceneRenderer({ Component, params, simConfig, topic, onScore, onRuntimeError }) {
  return (
    <ErrorBoundary onRuntimeError={onRuntimeError}>
      <Component params={params} simConfig={simConfig} />
      <VisionVerifier topic={topic} onScore={onScore} />
    </ErrorBoundary>
  );
}

// ── Agent step progress display ────────────────────────────────────────────────
const TOOL_META = {
  research:  { icon: "🔬", label: "Research" },
  generate:  { icon: "✍️",  label: "Generating" },
  strip:     { icon: "🧹", label: "Structure" },
  audit:     { icon: "🔍", label: "Geometry audit" },
  transform: { icon: "⚙️",  label: "JSX transform" },
  compile:   { icon: "🔨", label: "Compile check" },
  review:    { icon: "👁️",  label: "Quality review" },
  fix:       { icon: "🔧", label: "Rewriting" },
};

function statusDot(status) {
  if (status === "running") return <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />;
  if (status === "pass")    return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />;
  if (status === "warn")    return <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />;
  if (status === "fail")    return <span className="inline-block w-2 h-2 rounded-full bg-red-400" />;
  return null;
}

function AgentProgress({ steps, topic }) {
  const activeStep = steps.findLast?.((s) => s.status === "running") ?? steps[steps.length - 1];
  return (
    <div className="bg-slate-900/95 px-5 py-4 rounded-2xl border border-emerald-500/20 backdrop-blur-sm min-w-[280px] max-w-[360px] shadow-2xl">
      <p className="text-[11px] text-emerald-400 font-mono font-semibold uppercase tracking-widest mb-3">
        Building · {topic || "custom scene"}
      </p>
      <div className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const meta = TOOL_META[s.tool] || { icon: "•", label: s.tool };
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5">{statusDot(s.status)}</span>
              <div className="flex-1 min-w-0">
                <span className={`text-[11px] font-mono ${s.status === "running" ? "text-blue-300" : s.status === "fail" ? "text-red-400" : s.status === "warn" ? "text-amber-400" : "text-white/60"}`}>
                  {meta.icon} {s.label || meta.label}
                  {s.turn > 1 && <span className="text-white/30 ml-1">#{s.turn}</span>}
                </span>
                {s.issues?.length > 0 && s.status !== "pass" && (
                  <p className="text-[9px] text-white/30 mt-0.5 truncate" title={s.issues[0]}>
                    {s.issues[0].slice(0, 80)}…
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {(!steps.length || steps[steps.length - 1]?.status === "running") && (
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full h-0.5 bg-white/5 rounded overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 animate-pulse" style={{ width: `${Math.min(95, 15 + steps.length * 12)}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DynamicPhysicsScene({
  code,
  params = {},
  simConfig = {},
  topic = "",
  onRegenerate,        // () => void  — called when user/auto requests a new generation
  agentSteps = [],     // live tool steps from /api/generate-scene SSE
}) {
  const compiled = useMemo(() => compileScene(code || ""), [code]);
  const [score, setScore] = useState(null);
  const [scoreLabel, setScoreLabel] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const autoRegeneratedRef = useRef(false);

  useEffect(() => {
    setScore(null);
    setScoreLabel("");
    setRuntimeError("");
    autoRegeneratedRef.current = false;
  }, [code]);

  useEffect(() => {
    if (score === null) return;
    if (score >= 75) setScoreLabel("");
    else if (score >= 55) setScoreLabel(`Scene score ${score}/100 — quality may be low`);
    else setScoreLabel(`Score ${score}/100 — scene inaccurate`);

    // Auto-regenerate once if score is below 55 — Gemini vision says it doesn't look right
    if (score < 55 && onRegenerate) {
      const visionIssues = window.__lastVisionIssues || [];
      const visionSuggestions = window.__lastVisionSuggestions || [];
      const issueBlock = visionIssues.length
        ? `\nGemini vision issues:\n${visionIssues.map((i) => `• ${i}`).join("\n")}`
        : "";
      const suggestBlock = visionSuggestions.length
        ? `\nSuggestions:\n${visionSuggestions.map((s) => `• ${s}`).join("\n")}`
        : "";
      onRegenerate(
        `Gemini vision scored the rendered scene ${score}/100 — it does not look accurate enough. Rebuild with more precise geometry matching the real object.${issueBlock}${suggestBlock}`,
      );
    }
  }, [score, onRegenerate]);

  useEffect(() => {
    if (!runtimeError || !onRegenerate || autoRegeneratedRef.current) return;
    autoRegeneratedRef.current = true;
    onRegenerate(`Scene crashed during render: ${runtimeError}. Fix all runtime errors and regenerate.`);
  }, [runtimeError, onRegenerate]);

  // ── No code yet — show agent progress or generic spinner
  if (!code) {
    return (
      <group position={[0, 1.2, 0]}>
        <mesh>
          <icosahedronGeometry args={[1.0, 1]} />
          <meshStandardMaterial color="#10b981" wireframe opacity={0.6} transparent />
        </mesh>
        <Html center>
          {agentSteps.length > 0
            ? <AgentProgress steps={agentSteps} topic={topic} />
            : (
              <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-emerald-500/25 text-center backdrop-blur-sm">
                <p className="text-sm text-emerald-400 font-mono">Building 3D scene…</p>
                <p className="text-xs text-white/40 mt-1">Agent pipeline starting</p>
              </div>
            )
          }
        </Html>
      </group>
    );
  }

  // ── Compile error
  if (compiled.error) {
    return (
      <group>
        <mesh>
          <icosahedronGeometry args={[1.2, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-3 py-2 rounded-xl border border-red-500/30 max-w-xs text-center">
            <p className="text-sm text-red-400 font-semibold">Scene compile error</p>
            <p className="text-[10px] text-white/40 mt-1 font-mono">{compiled.error.slice(0, 160)}</p>
            {onRegenerate && (
              <button
                onClick={() => onRegenerate("Previous code had a compile error. Fix it.")}
                className="mt-2 px-3 py-1 text-xs bg-red-900/60 hover:bg-red-800/60 text-red-300 rounded-lg border border-red-500/30"
              >
                Regenerate Scene
              </button>
            )}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <>
      <SceneRenderer
        Component={compiled.Component}
        params={params}
        simConfig={simConfig}
        topic={topic}
        onScore={setScore}
        onRuntimeError={setRuntimeError}
      />

      {/* Runtime render error overlay */}
      {runtimeError && (
        <Html position={[0, 2.8, 0]} center>
          <div className="bg-slate-900/92 px-3 py-2 rounded-lg border border-red-500/30 text-center text-xs max-w-xs">
            <p className="text-red-400 font-semibold">Scene runtime error</p>
            <p className="text-white/40 mt-1 font-mono text-[10px]">{runtimeError.slice(0, 150)}</p>
            {onRegenerate && (
              <button
                onClick={() => onRegenerate(`Scene runtime error: ${runtimeError}. Regenerate with safe refs and guards.`)}
                className="mt-2 px-2 py-0.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded border border-red-500/30"
              >
                Regenerate
              </button>
            )}
          </div>
        </Html>
      )}

      {/* Low-score overlay */}
      {scoreLabel && onRegenerate && (
        <Html position={[0, 3.5, 0]} center>
          <div className="bg-slate-900/90 px-3 py-2 rounded-lg border border-amber-500/30 text-center text-xs">
            <p className="text-amber-400">{scoreLabel}</p>
            <button
              onClick={() => onRegenerate(`Score was ${score}/100. Improve accuracy.`)}
              className="mt-1 px-2 py-0.5 bg-amber-900/50 hover:bg-amber-800/50 text-amber-300 rounded border border-amber-500/30"
            >
              Regenerate
            </button>
          </div>
        </Html>
      )}
    </>
  );
}

// ── Error boundary for runtime R3F errors ─────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { caught: false, msg: "" };
  }
  static getDerivedStateFromError(e) {
    return { caught: true, msg: e?.message || String(e) };
  }
  componentDidCatch(err) {
    this.props.onRuntimeError?.(err?.message || String(err));
  }
  render() {
    if (this.state.caught) {
      return null;
    }
    return this.props.children;
  }
}
