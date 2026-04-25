"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Code2, Play, Loader2, RotateCcw, Download, Copy, Check, Terminal, X } from "lucide-react";

// Load Monaco lazily — it's large and only needed for this tab
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false, loading: () => <div className="flex-1 bg-[#0b1220] flex items-center justify-center"><Loader2 className="h-5 w-5 text-white/30 animate-spin" /></div> }
);

// ── Pyodide loader ─────────────────────────────────────────────────────────

let pyodideInstance = null;
let pyodideLoading = false;
let pyodideCallbacks = [];

async function getPyodide(onProgress) {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) {
    return new Promise((res) => pyodideCallbacks.push(res));
  }
  pyodideLoading = true;

  // Dynamically inject pyodide script
  if (!document.getElementById("pyodide-script")) {
    await new Promise((res, rej) => {
      const script = document.createElement("script");
      script.id = "pyodide-script";
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js";
      script.onload = res;
      script.onerror = rej;
      document.head.appendChild(script);
    });
  }

  onProgress?.("Loading Python runtime…");
  const pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" });

  onProgress?.("Loading NumPy…");
  await pyodide.loadPackage("numpy");
  onProgress?.("Loading Matplotlib…");
  await pyodide.loadPackage("matplotlib");
  onProgress?.("Loading SciPy…");
  await pyodide.loadPackage("scipy");
  onProgress?.("Ready!");

  pyodideInstance = pyodide;
  pyodideLoading = false;
  pyodideCallbacks.forEach((cb) => cb(pyodide));
  pyodideCallbacks = [];
  return pyodide;
}

// ── Matplotlib capture code (injected before user script) ─────────────────

const MATPLOTLIB_SETUP = `
import sys, io, base64, json
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

_FIGURES = []
_original_show = plt.show

def _capture_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=120,
                facecolor='#070a0f', edgecolor='none')
    buf.seek(0)
    _FIGURES.append(base64.b64encode(buf.read()).decode())
    plt.close('all')

plt.show = _capture_show

_stdout_capture = io.StringIO()
import sys as _sys
_old_stdout = _sys.stdout
_sys.stdout = _stdout_capture
`;

const MATPLOTLIB_TEARDOWN = `
_sys.stdout = _old_stdout
_captured_output = _stdout_capture.getvalue()

# Auto-capture any unclosed figures
if plt.get_fignums():
    _capture_show()

import json as _json
_captured_json_out = _json.dumps({"stdout": _captured_output, "figures": _FIGURES})
`;

// ── Output renderer ───────────────────────────────────────────────────────

function OutputBlock({ output, error }) {
  if (!output && !error) return null;

  const parseFigures = () => {
    if (!output) return { text: "", figures: [] };
    try {
      const data = JSON.parse(output);
      return { text: data.stdout || "", figures: data.figures || [] };
    } catch {
      return { text: output, figures: [] };
    }
  };

  const { text, figures } = parseFigures();

  return (
    <div className="flex-shrink-0 border-t border-white/10 bg-[#050810]">
      {error && (
        <div className="px-4 py-3 text-[12px] font-mono text-red-300/90 whitespace-pre-wrap leading-5 max-h-40 overflow-y-auto">
          <span className="text-red-500">Error: </span>{error}
        </div>
      )}
      {text && (
        <div className="px-4 py-3 text-[12px] font-mono text-emerald-300/80 whitespace-pre-wrap leading-5 max-h-48 overflow-y-auto loomin-scroll">
          {text}
        </div>
      )}
      {figures.map((fig, i) => (
        <div key={i} className="px-4 pb-4">
          <img
            src={`data:image/png;base64,${fig}`}
            alt={`Plot ${i + 1}`}
            className="rounded-xl w-full border border-white/10 max-h-64 object-contain"
          />
        </div>
      ))}
    </div>
  );
}

// ── Default script template ───────────────────────────────────────────────

const DEFAULT_SCRIPT = `# Physics Simulation Script
# Generate notes first, then the AI will produce a custom script for your topic.

import numpy as np
import matplotlib.pyplot as plt

# Pendulum example — edit me!
L = 1.0    # length (m)
g = 9.81   # gravity (m/s²)
theta0 = np.radians(30)  # initial angle

t = np.linspace(0, 10, 1000)
omega = np.sqrt(g / L)
theta = theta0 * np.cos(omega * t) * np.exp(-0.02 * t)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
fig.patch.set_facecolor('#070a0f')

ax1.plot(t, np.degrees(theta), color='#6366f1', lw=2)
ax1.set_xlabel('Time (s)', color='white')
ax1.set_ylabel('Angle (°)', color='white')
ax1.set_title('Pendulum Oscillation', color='white')
ax1.set_facecolor('#0b1220')
ax1.tick_params(colors='white')

ax2.plot(theta, -omega * np.sin(theta) * L, color='#22d3ee', lw=2)
ax2.set_xlabel('θ (rad)', color='white')
ax2.set_ylabel('θ̇ (rad/s)', color='white')
ax2.set_title('Phase Portrait', color='white')
ax2.set_facecolor('#0b1220')
ax2.tick_params(colors='white')

plt.tight_layout()
plt.show()

print(f"Period T = {2 * np.pi / omega:.4f} s")
print(f"Natural frequency ω = {omega:.4f} rad/s")
`;

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PythonPanel({ script, onScriptChange, topic, artifactsGenerating }) {
  const [pyStatus, setPyStatus] = useState("idle"); // idle | loading | ready | running | error
  const [pyProgress, setPyProgress] = useState("");
  const [output, setOutput] = useState(null);
  const [runError, setRunError] = useState(null);
  const [copied, setCopied] = useState(false);
  const pyRef = useRef(null);

  const effectiveScript = script || DEFAULT_SCRIPT;

  const loadAndRun = useCallback(async () => {
    if (pyStatus === "running" || pyStatus === "loading") return;
    setOutput(null);
    setRunError(null);

    if (!pyRef.current) {
      setPyStatus("loading");
      setPyProgress("Initialising Python runtime…");
      try {
        pyRef.current = await getPyodide((msg) => setPyProgress(msg));
        setPyStatus("ready");
      } catch (err) {
        setPyStatus("error");
        setRunError(String(err));
        return;
      }
    }

    setPyStatus("running");
    // Yield to React so the spinner renders before the synchronous runPython blocks
    await new Promise((r) => setTimeout(r, 20));
    try {
      const fullScript = MATPLOTLIB_SETUP + "\n" + effectiveScript + "\n" + MATPLOTLIB_TEARDOWN;
      // runPython is synchronous — it returns the last expression value.
      // Our teardown script prints JSON to old_stdout and returns None,
      // so we capture stdout directly from the Pyodide instance instead.
      pyRef.current.runPython(fullScript);
      // The teardown already printed JSON to _old_stdout (the real JS stdout).
      // Pyodide captures print() calls to its internal stream — read it back.
      const captured = pyRef.current.runPython("_captured_json_out if '_captured_json_out' in dir() else '{\"stdout\":\"\",\"figures\":[]}'");
      setOutput(String(captured ?? ""));
    } catch (err) {
      // Try to extract a clean Python traceback
      const msg = String(err).replace(/^PythonError:\s*/, "");
      setRunError(msg);
    } finally {
      setPyStatus("ready");
    }
  }, [effectiveScript, pyStatus]);

  const reset = () => {
    setOutput(null);
    setRunError(null);
    if (pyRef.current) {
      try { pyRef.current.runPython("plt.close('all')"); } catch { /* ignore */ }
    }
  };

  const copyScript = () => {
    navigator.clipboard.writeText(effectiveScript).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([effectiveScript], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(topic || "simulation").replace(/\s+/g, "_").toLowerCase()}.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel = {
    idle: "Run",
    loading: pyProgress || "Loading…",
    ready: "Run",
    running: "Running…",
    error: "Retry",
  }[pyStatus];

  const isRunning = pyStatus === "loading" || pyStatus === "running";

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-indigo-400" />
          <span className="text-[12px] font-semibold text-white/80">Python</span>
          {artifactsGenerating && (
            <div className="flex items-center gap-1 text-[10px] text-amber-300/60">
              <Loader2 className="h-3 w-3 animate-spin" /> generating script…
            </div>
          )}
          {pyRef.current && pyStatus === "ready" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              Pyodide ready
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={reset} title="Clear output" className="p-1.5 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/60 transition">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={copyScript} title="Copy script" className="p-1.5 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/60 transition">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={download} title="Download .py" className="p-1.5 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/60 transition">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={loadAndRun}
            disabled={isRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
              isRunning
                ? "bg-amber-600/20 ring-1 ring-amber-500/30 text-amber-300 cursor-not-allowed"
                : "bg-emerald-600/20 ring-1 ring-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30"
            }`}
          >
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {statusLabel}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
        <MonacoEditor
          value={effectiveScript}
          onChange={(v) => onScriptChange?.(v || "")}
          language="python"
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 20,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            renderWhitespace: "none",
            padding: { top: 12, bottom: 12 },
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
            theme: "vs-dark",
          }}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme("loomin-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: { "editor.background": "#070a0f", "editor.lineHighlightBackground": "#0d1117" },
            });
          }}
          onMount={(editor, monaco) => {
            monaco.editor.setTheme("loomin-dark");
          }}
        />
      </div>

      {/* Loading indicator */}
      {isRunning && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-white/8 bg-amber-950/20 flex items-center gap-2 text-[11px] text-amber-300/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pyProgress || (pyStatus === "running" ? "Executing script…" : "Loading packages…")}
          <span className="text-[10px] text-amber-300/40 ml-auto">First run loads Pyodide (~3-5s)</span>
        </div>
      )}

      {/* Output */}
      <OutputBlock output={output} error={runError} />

      {/* Info bar */}
      {!output && !runError && !isRunning && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-white/5 flex items-center gap-2 text-[10px] text-white/25">
          <Terminal className="h-3 w-3" />
          Python 3.x · NumPy · SciPy · Matplotlib · runs in-browser via Pyodide
        </div>
      )}
    </div>
  );
}
