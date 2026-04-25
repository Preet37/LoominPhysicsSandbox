"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Loader2, Brain, Zap, AlertTriangle, CheckCircle,
  ShieldCheck, ShieldAlert, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, ThumbsUp, ThumbsDown,
  FileText, Sigma, BarChart2, Code2, Paperclip, BookOpen, GraduationCap,
} from "lucide-react";
import { useLoominStore } from "./store";
import PhysicsScene from "./PhysicsScene";
import StatusCard from "./components/StatusCard";
import AskAIDrawer from "./components/AskAIDrawer";
import JournalsNav from "./components/JournalsNav";
import AgentStatusBar from "./components/AgentStatusBar";
import InteractiveNotesSurface from "./components/InteractiveNotesSurface";
import ParamSliderPanel from "./components/ParamSliderPanel";
import EquationsPanel from "./components/EquationsPanel";
import GraphsPanel from "./components/GraphsPanel";
import PythonPanel from "./components/PythonPanel";
import WikiPanel from "./components/WikiPanel";
import SourcesPanel from "./components/SourcesPanel";
import LearnPanel from "./components/LearnPanel";

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { id: "notes",     label: "Notes",     Icon: FileText       },
  { id: "equations", label: "Equations", Icon: Sigma          },
  { id: "graphs",    label: "Graphs",    Icon: BarChart2      },
  { id: "python",    label: "Python",    Icon: Code2          },
  { id: "learn",     label: "Learn",     Icon: GraduationCap  },
  { id: "sources",   label: "Sources",   Icon: Paperclip      },
  { id: "wiki",      label: "Wiki",      Icon: BookOpen       },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeKey(key) {
  return key.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("_");
}

function parseParams(text) {
  const out = {};
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(?:\/\/.*)?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseFloat(m[2]);
    if (!isNaN(num)) out[normalizeKey(m[1])] = num;
  }
  return out;
}

function parseSIMCONFIG(text) {
  // 1. Explicit XML-style tags (case-insensitive)
  const tagMatch = text.match(/<simconfig>([\s\S]*?)<\/simconfig>/i);
  if (tagMatch) { try { return JSON.parse(tagMatch[1].trim()); } catch {} }

  // 2. Triple-backtick code block containing simType
  const codeMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"simType"[\s\S]*?\})\s*```/i);
  if (codeMatch) { try { return JSON.parse(codeMatch[1].trim()); } catch {} }

  // 3. Model outputs "SIMCONFIG\n{...}" (no tags, just a labeled block)
  const labeledMatch = text.match(/SIMCONFIG\s*\n(\{[\s\S]*?\n\})/i);
  if (labeledMatch) { try { const p = JSON.parse(labeledMatch[1]); if (p.simType) return p; } catch {} }

  // 4. Find any standalone JSON object containing "simType" — try progressively wider patterns
  //    Extract all {...} blocks that contain "simType" and try to parse them
  const jsonBlocks = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        jsonBlocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (const block of jsonBlocks.reverse()) {
    if (!block.includes('"simType"')) continue;
    try {
      const parsed = JSON.parse(block);
      if (parsed.simType) return parsed;
    } catch { /* not valid JSON, skip */ }
  }
  return null;
}

function buildPhysicsFallbackExplanation(simType, paramName, val, warn, crit, unit = "") {
  const p = normalizeKey(paramName);
  const u = unit ? ` ${unit}` : "";
  return `${p} at ${val}${u} has exceeded the safe operating range (warning: ${warn}${u}, critical: ${crit}${u}). Reduce the parameter incrementally to restore optimal state.`;
}

function constraintSeverity(val, c) {
  const lowerIsBad = c.criticalThreshold != null && c.warningThreshold != null && c.criticalThreshold < c.warningThreshold;
  if (lowerIsBad) {
    if (val <= (c.criticalThreshold ?? -Infinity)) return "CRITICAL";
    if (val <= (c.warningThreshold ?? -Infinity)) return "WARNING";
    return "OK";
  }
  if (val >= (c.criticalThreshold ?? Infinity)) return "CRITICAL";
  if (val >= (c.warningThreshold ?? Infinity)) return "WARNING";
  return "OK";
}

function validatePhysics(simConfig, params) {
  if (!simConfig?.constraints?.length) return { state: "OPTIMAL", explanation: "", fixedParams: simConfig?.optimalParams || {} };
  let worst = "OPTIMAL";
  let explanation = "";
  for (const c of simConfig.constraints) {
    const val = params[normalizeKey(c.param)] ?? params[c.param];
    if (val === undefined) continue;
    const paramDef = simConfig.params?.find((p) => p.name === c.param);
    const unit = paramDef?.unit ? ` ${paramDef.unit}` : "";
    const detailed = buildPhysicsFallbackExplanation(simConfig?.simType, c.param, val, c.warningThreshold, c.criticalThreshold, paramDef?.unit || "");
    const lowerIsBad = c.criticalThreshold != null && c.warningThreshold != null && c.criticalThreshold < c.warningThreshold;
    const sev = constraintSeverity(val, c);
    if (sev === "CRITICAL") {
      worst = "CRITICAL_FAILURE";
      explanation = lowerIsBad
        ? `${normalizeKey(c.param)} is ${val}${unit} — below the critical minimum safe value of ${c.criticalThreshold}${unit}. ${detailed}`
        : `${normalizeKey(c.param)} is ${val}${unit} — exceeds the critical limit of ${c.criticalThreshold}${unit}. ${detailed}`;
      break;
    } else if (sev === "WARNING" && worst !== "CRITICAL_FAILURE") {
      worst = "WARNING";
      explanation = lowerIsBad
        ? `${normalizeKey(c.param)} is ${val}${unit}, approaching the minimum safe threshold. ${detailed}`
        : `${normalizeKey(c.param)} is ${val}${unit}, approaching the critical limit of ${c.criticalThreshold}${unit}. ${detailed}`;
    }
  }
  return { state: worst, explanation, fixedParams: simConfig?.optimalParams || {} };
}

function findByKey(obj, key) {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) { if (k.toLowerCase() === lower) return v; }
  return undefined;
}

function patchParamFlexible(text, paramName, newValue) {
  const escaped = String(paramName).replace(/_/g, "[_\\s]*");
  const re = new RegExp(`^(\\s*${escaped}\\s*=\\s*)([\\d.+-]+)(\\s*.*)$`, "mi");
  return text.replace(re, `$1${newValue}$3`);
}

function buildAutoFixText(editorText, simConfig, currentParams) {
  let result = editorText;
  for (const constraint of simConfig?.constraints || []) {
    const normKey = normalizeKey(constraint.param);
    const val = currentParams[normKey] ?? findByKey(currentParams, constraint.param);
    if (val === undefined) continue;
    if (constraintSeverity(val, constraint) !== "OK") {
      const optimalVal = findByKey(simConfig?.optimalParams, constraint.param) ?? findByKey(simConfig?.optimalParams, normKey) ?? simConfig?.params?.find((p) => normalizeKey(p.name) === normKey)?.default;
      if (optimalVal !== undefined) {
        const before = result;
        result = patchParamFlexible(result, constraint.param, optimalVal);
        if (result === before) result = patchParamFlexible(result, normKey, optimalVal);
      }
    }
  }
  return result;
}

function evaluateNotesQuality(text, simConfig) {
  const checks = [];
  const body = text || "";
  checks.push({ label: "Equation(s) present", pass: /(=|\\frac|\\sigma|\\tau|\\rho|\\omega|F\s*=|P\s*=|m\s*\*)/.test(body) });
  checks.push({ label: "Failure modes explained", pass: /failure|fracture|stall|collapse|buckl|resonance|singular|fatigue/i.test(body) });
  checks.push({ label: "Interactive section present", pass: /interactive simulation/i.test(body) });
  checks.push({ label: "Editable parameter lines found", pass: /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*[-+]?(?:\d+\.?\d*|\.\d+)/m.test(body) });
  if (simConfig?.params?.length) {
    const lines = parseParams(body);
    const expected = simConfig.params.map((p) => normalizeKey(p.name));
    const missing = expected.filter((k) => lines[k] === undefined);
    checks.push({ label: missing.length === 0 ? "All SIMCONFIG params are editable" : `Missing params: ${missing.join(", ")}`, pass: missing.length === 0 });
  }
  const passCount = checks.filter((c) => c.pass).length;
  return { score: Math.round((passCount / Math.max(1, checks.length)) * 100), checks };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PhysicsEditorPage() {
  const updateFromStorage  = useLoominStore((s) => s.updateFromStorage);
  const hasUpdated         = useLoominStore((s) => s.hasUpdated);
  const journals           = useLoominStore((s) => s.journals);
  const activeId           = useLoominStore((s) => s.activeId);
  const setEditorValue     = useLoominStore((s) => s.setEditorValue);
  const setVars            = useLoominStore((s) => s.setVars);
  const mergeVar           = useLoominStore((s) => s.mergeVar);
  const setSimConfig       = useLoominStore((s) => s.setSimConfig);
  const setSceneCode       = useLoominStore((s) => s.setSceneCode);
  const recordVisualAccuracy = useLoominStore((s) => s.recordVisualAccuracy);
  const setTopic           = useLoominStore((s) => s.setTopic);
  const setQuality         = useLoominStore((s) => s.setQuality);
  const createJournal      = useLoominStore((s) => s.createJournal);
  const renameJournal      = useLoominStore((s) => s.renameJournal);
  const setActiveTab       = useLoominStore((s) => s.setActiveTab);
  const setPythonScript    = useLoominStore((s) => s.setPythonScript);
  const setEquations       = useLoominStore((s) => s.setEquations);
  const setArtifactsGenerating = useLoominStore((s) => s.setArtifactsGenerating);
  const addSource          = useLoominStore((s) => s.addSource);
  const removeSource       = useLoominStore((s) => s.removeSource);
  const setWikiArticle     = useLoominStore((s) => s.setWikiArticle);

  const active = useMemo(() => journals.find((j) => j.id === activeId) || journals[0], [journals, activeId]);
  const editorValue  = active?.editorValue ?? "";
  const vars         = active?.vars ?? {};
  const simConfig    = active?.simConfig ?? null;
  const activeTopic  = active?.topic ?? "";
  const quality      = active?.quality ?? "thinking";
  const sceneCode    = active?.sceneCode ?? null;
  const activeTab    = active?.activeTab ?? "notes";
  const pythonScript = active?.pythonScript ?? null;
  const equations    = active?.equations ?? [];
  const sources      = active?.sources ?? [];
  const wikiArticle  = active?.wikiArticle ?? null;
  const artifactsGenerating = active?.artifactsGenerating ?? false;

  const [difficulty, setDifficulty]     = useState(1);
  const [navOpen, setNavOpen]           = useState(false);
  const [topicInput, setTopicInput]     = useState("");
  const [streaming, setStreaming]       = useState(false);
  const [askDrawerOpen, setAskDrawerOpen] = useState(false);
  const [physicsState, setPhysicsState] = useState({ state: "OPTIMAL", explanation: "", fixedParams: {} });
  const [agentSteps, setAgentSteps]     = useState([]);
  const [panelMode, setPanelMode]       = useState("both");
  const [agentStates, setAgentStates]   = useState({ research: { status: "idle", msg: "", toolCalls: 0 }, design: { status: "idle", msg: "", toolCalls: 0 }, validator: { status: "idle", msg: "", toolCalls: 0 } });
  const [pipelineMeta, setPipelineMeta] = useState({ totalToolCalls: 0, ragUsed: false, visible: false });
  const [wikiCompiling, setWikiCompiling] = useState(false);

  useEffect(() => { updateFromStorage(); }, [updateFromStorage]);

  useEffect(() => { setPhysicsState(validatePhysics(simConfig, vars)); }, [vars, simConfig]);

  useEffect(() => {
    if (!hasUpdated) return;
    setVars(parseParams(editorValue));
    setTopicInput(active?.topic ?? "");
  }, [hasUpdated, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleanDisplay = (text) =>
    text
      .replace(/<simconfig>[\s\S]*?<\/simconfig>/gi, "")
      .replace(/```(?:json)?\s*\{[\s\S]*?"simType"[\s\S]*?\}\s*```/gi, "")
      .replace(/RULES FOR SIMCONFIG[\s\S]*/i, "")
      .replace(/CRITICAL RULES[\s\S]*/i, "")
      .replace(/SIM TYPE REFERENCE[\s\S]*/i, "")
      .replace(/Do not output any explanation of these rules[\s\S]*/i, "")
      .trimEnd();

  // ── Generate artifacts (Python + Equations) ──────────────────────────────

  const generateArtifacts = useCallback(async (notes, simType, topic, params) => {
    if (!notes?.trim() || !simType) return;
    setArtifactsGenerating(true);
    try {
      const res = await fetch("/api/generate-artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.slice(0, 3000), simType, topic, params }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.pythonScript) setPythonScript(data.pythonScript);
      if (data.equations?.length) setEquations(data.equations);
    } catch (err) {
      console.warn("[generateArtifacts]", err);
    } finally {
      setArtifactsGenerating(false);
    }
  }, [setArtifactsGenerating, setPythonScript, setEquations]);

  // ── Generate notes (main pipeline) ───────────────────────────────────────

  const generateNotes = useCallback(async (topicOverride, notesOverride) => {
    const topic = (topicOverride || topicInput).trim();
    if (!topic || streaming) return;
    setStreaming(true);
    setTopic(topic);
    if (!notesOverride) {
      setEditorValue(`## Generating: ${topic}\n\n_Initialising multi-agent pipeline…_\n`);
    }

    const idle = { status: "idle", msg: "", toolCalls: 0 };
    setAgentStates({ research: idle, design: idle, validator: idle });
    setPipelineMeta({ totalToolCalls: 0, ragUsed: false, visible: true });

    try {
      const res = await fetch("/api/agent-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, quality, difficulty }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = notesOverride || "";
      // simType from the research agent (comes before any LLM generation)
      let classifiedSimType = "custom";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          switch (evt.event) {
            case "agent_start":
              setAgentStates((prev) => ({ ...prev, [evt.agent]: { status: "running", msg: evt.msg, toolCalls: 0 } }));
              break;
            case "agent_complete":
              // Capture simType from the research agent's completion event
              if (evt.agent === "research" && evt.simType) classifiedSimType = evt.simType;
              setAgentStates((prev) => ({ ...prev, [evt.agent]: { status: "done", msg: evt.msg, toolCalls: evt.toolCalls ?? 0 } }));
              break;
            case "design_chunk":
              fullText += evt.chunk ?? "";
              setEditorValue(cleanDisplay(fullText));
              break;
            case "pipeline_complete":
              // Use the server's authoritative fullText and simType
              fullText = evt.fullText ?? fullText;
              if (evt.simType) classifiedSimType = evt.simType;
              setPipelineMeta((prev) => ({ ...prev, totalToolCalls: evt.totalToolCalls ?? 0, ragUsed: evt.ragUsed ?? false }));
              break;
            case "error":
              console.error("[agent-pipeline]", evt.message);
              break;
          }
        }
      }

      // Parse SIMCONFIG from the generated text. Fall back to the research-classified simType.
      const config = parseSIMCONFIG(fullText);
      const knownTypes = ["wind_turbine","pendulum","newton_cradle","inverted_pendulum","projectile","rocket","spring_mass","orbit","robot_arm","bridge","water_bottle","airplane","helicopter","mechanical_gears","bicycle","submarine","breadboard","f1_car","steam_engine"];
      const finalSimType = config?.simType || classifiedSimType || "custom";

      if (config) {
        setSimConfig(config);
        const initialVars = {};
        for (const p of config.params || []) initialVars[p.name] = p.default;
        setVars(initialVars);
      } else {
        // Build a minimal simConfig from the classified simType so graphs and scene work
        setSimConfig({ simType: finalSimType, displayName: topic, params: [], constraints: [], optimalParams: {} });
      }

      const finalDisplay = cleanDisplay(fullText);
      setEditorValue(finalDisplay);
      const parsedVars = parseParams(finalDisplay);
      if (Object.keys(parsedVars).length > 0) setVars(parsedVars);

      renameJournal(activeId, topic.replace(/\s+/g, " ").trim().slice(0, 72) || "Study");

      if (!knownTypes.includes(finalSimType)) {
        setSceneCode(null);
        generateSceneCode(topic, finalSimType, parseParams(cleanDisplay(fullText)), null);
      }

      // Always fire artifact generation — runs in background, non-blocking
      generateArtifacts(finalDisplay, finalSimType, topic, parsedVars);

    } catch (err) {
      console.error("generateNotes error:", err);
      setEditorValue(`## Error\nFailed to generate notes. ${String(err).includes("fetch") ? "Network error — check your connection." : "Please try again."}`);
    } finally {
      setStreaming(false);
      setTopicInput("");
    }
  }, [topicInput, quality, difficulty, streaming, activeId, setEditorValue, setVars, setSimConfig, setSceneCode, setTopic, renameJournal, generateArtifacts]);

  // ── Generate scene code ───────────────────────────────────────────────────

  const generateSceneCode = useCallback(async (topic, simType, params, feedback) => {
    setAgentSteps([]);
    try {
      const { journals, activeId } = useLoominStore.getState();
      const accuracyHistory = journals.find((j) => j.id === activeId)?.accuracyLog?.slice(-20) ?? [];
      const res = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, simType: simType || "custom", params: params || vars, physicsContext: `Physics simulation for ${topic}. ${feedback || ""}`, feedback: feedback || "", accuracyHistory }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.event === "step") {
              setAgentSteps((prev) => {
                const idx = prev.findIndex((s) => s.tool === ev.tool && s.turn === (ev.turn ?? 0));
                if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
                return [...prev, ev];
              });
            } else if (ev.event === "complete") {
              setSceneCode(ev.code);
              setAgentSteps([]);
            } else if (ev.event === "error") {
              setAgentSteps([]);
            }
          } catch { /* malformed */ }
        }
      }
    } catch (e) { console.warn("[generate-scene]", e); setAgentSteps([]); }
  }, [vars, setSceneCode]);

  const handleRegenerate = useCallback((feedback) => {
    if (!activeTopic) return;
    setSceneCode(null);
    generateSceneCode(activeTopic, simConfig?.simType || "custom", vars, feedback);
  }, [activeTopic, simConfig, vars, generateSceneCode, setSceneCode]);

  const handleAutoFix = useCallback(() => {
    if (!simConfig) return;
    const newText = buildAutoFixText(editorValue, simConfig, vars);
    setEditorValue(newText);
    const nextVars = { ...vars };
    for (const constraint of simConfig?.constraints || []) {
      const normKey = normalizeKey(constraint.param);
      const val = vars[normKey] ?? findByKey(vars, constraint.param);
      if (val === undefined) continue;
      if (constraintSeverity(val, constraint) !== "OK") {
        const optimalVal = findByKey(simConfig?.optimalParams, constraint.param) ?? findByKey(simConfig?.optimalParams, normKey) ?? simConfig?.params?.find((p) => normalizeKey(p.name) === normKey)?.default;
        if (optimalVal !== undefined) { nextVars[normKey] = optimalVal; nextVars[constraint.param] = optimalVal; }
      }
    }
    setVars(nextVars);
  }, [editorValue, simConfig, vars, setEditorValue, setVars]);

  // ── Compile wiki ──────────────────────────────────────────────────────────
  // Compiles a structured wiki article for the CURRENT journal's topic.
  // Optionally includes related journals for cross-topic connections.

  const compileWiki = useCallback(async () => {
    if (!active) return;
    setWikiCompiling(true);
    try {
      // Primary: current journal. Secondary: up to 4 related journals for connections.
      const currentJournal = { topic: active.topic || active.name, name: active.name, editorValue: active.editorValue };
      const related = journals
        .filter((j) => j.id !== activeId && j.editorValue?.length > 100 && j.topic)
        .slice(0, 4)
        .map((j) => ({ topic: j.topic, name: j.name, editorValue: j.editorValue.slice(0, 800) }));

      const res = await fetch("/api/compile-wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journals: [currentJournal, ...related],
          focusTopic: currentJournal.topic,
        }),
      });
      if (!res.ok) return;
      const { article } = await res.json();
      if (article) setWikiArticle(article);
    } catch (err) {
      console.warn("[compileWiki]", err);
    } finally {
      setWikiCompiling(false);
    }
  }, [active, activeId, journals, setWikiArticle]);

  // ── Generate notes from source ────────────────────────────────────────────
  // Triggers the FULL pipeline: notes → SIMCONFIG → scene → artifacts (Python + equations) → wiki

  const generateFromSource = useCallback(async (source) => {
    setActiveTab("notes");

    if (source.generatedNotes) {
      // Apply pre-generated notes from analyze_document
      const display = cleanDisplay(source.generatedNotes);
      setEditorValue(display);

      const config = parseSIMCONFIG(source.generatedNotes);
      const knownTypes = ["wind_turbine","pendulum","newton_cradle","inverted_pendulum","projectile","rocket","spring_mass","orbit","robot_arm","bridge","water_bottle","airplane","helicopter","mechanical_gears","bicycle","submarine","breadboard","f1_car","steam_engine"];
      const sourceTopic = source.detectedTopic?.replace(/_/g, " ") || source.name?.replace(/\.[^.]+$/, "") || "physics";
      const finalSimType = config?.simType || "custom";

      if (config) {
        setSimConfig(config);
        const iv = {};
        for (const p of config.params || []) iv[p.name] = p.default;
        setVars(iv);
      } else {
        setSimConfig({ simType: finalSimType, displayName: sourceTopic, params: [], constraints: [], optimalParams: {} });
      }

      const parsedVars = parseParams(display);
      if (Object.keys(parsedVars).length > 0) setVars(parsedVars);

      renameJournal(activeId, sourceTopic.slice(0, 60));
      setTopic(sourceTopic);

      // Generate scene if not a built-in type
      if (!knownTypes.includes(finalSimType)) {
        setSceneCode(null);
        generateSceneCode(sourceTopic, finalSimType, parsedVars, null);
      }

      // Fire the full artifact pipeline in background
      generateArtifacts(display, finalSimType, sourceTopic, parsedVars);

    } else if (source.name || source.url) {
      // No pre-generated notes — run the full agent pipeline
      const topic = source.detectedTopic?.replace(/_/g, " ") || source.name?.replace(/\.[^.]+$/, "") || "physics";
      generateNotes(topic, "");
    }
  }, [setEditorValue, setSimConfig, setVars, renameJournal, activeId, setActiveTab, generateNotes, generateArtifacts, generateSceneCode, setSceneCode, setTopic]);

  // ── Derived values ────────────────────────────────────────────────────────

  const liveOk = physicsState.state !== "CRITICAL_FAILURE";
  const simType = simConfig?.simType || null;
  const notesQuality = useMemo(() => evaluateNotesQuality(editorValue, simConfig), [editorValue, simConfig]);

  // ── Tab content renderer ──────────────────────────────────────────────────

  const renderTab = () => {
    switch (activeTab) {
      case "notes":
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Agent pipeline status */}
            <AgentStatusBar
              agentStates={agentStates}
              visible={pipelineMeta.visible}
              totalToolCalls={pipelineMeta.totalToolCalls}
              ragUsed={pipelineMeta.ragUsed}
            />
            {/* Notes surface */}
            <div className="flex-1 min-h-0">
              <InteractiveNotesSurface
                value={editorValue}
                onChange={(v) => { setEditorValue(v); setVars(parseParams(v)); }}
                currentParams={vars}
                checks={notesQuality.checks}
              />
            </div>
          </div>
        );

      case "equations":
        return (
          <EquationsPanel
            editorValue={editorValue}
            params={vars}
            aiEquations={equations}
            artifactsGenerating={artifactsGenerating}
          />
        );

      case "graphs":
        return (
          <GraphsPanel
            simType={simType}
            params={vars}
            onParamChange={(key, val) => mergeVar(key, val)}
          />
        );

      case "python":
        return (
          <PythonPanel
            script={pythonScript}
            onScriptChange={(v) => setPythonScript(v)}
            topic={activeTopic}
            artifactsGenerating={artifactsGenerating}
          />
        );

      case "learn":
        return (
          <LearnPanel
            editorValue={editorValue}
            topic={activeTopic}
            artifactsGenerating={artifactsGenerating}
          />
        );

      case "sources":
        return (
          <SourcesPanel
            sources={sources}
            onAddSource={addSource}
            onRemoveSource={removeSource}
            onGenerateFromSource={generateFromSource}
          />
        );

      case "wiki":
        return (
          <WikiPanel
            wikiArticle={wikiArticle}
            journals={journals}
            onCompile={compileWiki}
            compiling={wikiCompiling}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-[100vh] overflow-hidden bg-[#070A0F] text-white selection:bg-white/20">
      <style>{`
        .loomin-scroll{scrollbar-gutter:stable}
        .loomin-scroll::-webkit-scrollbar{width:8px}
        .loomin-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.03);border-radius:999px}
        .loomin-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border:2px solid rgba(0,0,0,0);background-clip:padding-box;border-radius:999px}
        .loomin-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.18)}
      `}</style>

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.65]" style={{ background: "radial-gradient(1200px 600px at 70% 20%, rgba(99,102,241,0.22), transparent 55%), radial-gradient(900px 520px at 20% 80%, rgba(16,185,129,0.16), transparent 58%)" }} />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-[0.05]" />

      <div className="relative mx-auto h-full max-w-[1440px] px-4 py-4 grid grid-cols-[260px,1fr] gap-4">
        {/* Left sidebar */}
        <JournalsNav open={navOpen} onToggle={() => setNavOpen((v) => !v)} onNewJournal={() => createJournal(`Session ${journals.length + 1}`)} />

        {/* Main area */}
        <div className="min-h-0 grid grid-rows-[auto,1fr] gap-4">

          {/* Navbar */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center">
                <div className="h-4 w-4 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300" />
              </div>
              <div className="leading-tight min-w-0 max-w-[min(280px,36vw)]">
                <div className="text-[10px] tracking-[0.18em] uppercase text-white/45">Loomin</div>
                <div className="text-[15px] font-semibold text-white/92 whitespace-normal break-words" title={active?.name ?? "Physics Sandbox"}>
                  {active?.name ?? "Physics Sandbox"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ring-1 backdrop-blur-md ${liveOk ? "bg-emerald-950/60 ring-emerald-500/30" : "bg-red-950/60 ring-red-500/30"}`}>
                <div className={`h-2 w-2 rounded-full ${liveOk ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"}`} />
                <span className={`text-xs font-mono font-semibold ${liveOk ? "text-emerald-400" : "text-red-400"}`}>{liveOk ? "LIVE" : "ERROR"}</span>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ring-1 backdrop-blur-md ${liveOk ? "bg-white/5 ring-white/10" : "bg-red-950/40 ring-red-500/20"}`}>
                {liveOk ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                <span className={`text-xs ${liveOk ? "text-white/60" : "text-red-300"}`}>{liveOk ? "System Ready" : "Error Detected"}</span>
              </div>
              <button onClick={() => setAskDrawerOpen(true)} className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition text-xs font-semibold text-indigo-300">
                <Brain className="h-3.5 w-3.5" />
                Ask AI
              </button>
            </div>
          </header>

          {/* Content grid */}
          <div className="min-h-0 flex gap-4">

            {/* Left panel */}
            {panelMode !== "sandbox-only" && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 flex-1 overflow-hidden relative z-20"
              >
                <div className="h-full min-h-0 rounded-3xl bg-white/[0.05] ring-1 ring-white/12 backdrop-blur-xl overflow-hidden flex flex-col">

                  {/* Topic input bar */}
                  <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-white/70">Topic</span>
                      </div>
                      <input
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && generateNotes()}
                        placeholder="e.g. pendulum, wind turbine, projectile…"
                        disabled={streaming}
                        className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-xs text-white/90 placeholder:text-white/30 outline-none ring-1 ring-white/10 focus:ring-indigo-500/50 transition disabled:opacity-50"
                      />
                      <button
                        onClick={() => generateNotes()}
                        disabled={streaming || !topicInput.trim()}
                        className="h-8 w-8 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center flex-shrink-0"
                      >
                        {streaming ? <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" /> : <Send className="h-3.5 w-3.5 text-indigo-400" />}
                      </button>
                      <button
                        onClick={() => setPanelMode(panelMode === "notes-only" ? "both" : "notes-only")}
                        title={panelMode === "notes-only" ? "Show sandbox" : "Fullscreen notes"}
                        className="p-1.5 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/65 transition flex-shrink-0"
                      >
                        {panelMode === "notes-only" ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {/* HQ / Fast + difficulty */}
                    <div className="flex items-center justify-between mt-2 gap-3">
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 ring-1 ring-white/10">
                        <button onClick={() => setQuality("thinking")} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${quality === "thinking" ? "bg-violet-600/40 ring-1 ring-violet-500/50 text-violet-300" : "text-white/40 hover:text-white/60"}`}>
                          <Brain className="h-3 w-3" /> High Quality
                        </button>
                        <button onClick={() => setQuality("fast")} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${quality === "fast" ? "bg-amber-600/40 ring-1 ring-amber-500/50 text-amber-300" : "text-white/40 hover:text-white/60"}`}>
                          <Zap className="h-3 w-3" /> Fast
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-white/45">Level</span>
                        <input type="range" min={0} max={3} step={1} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} disabled={streaming} className="w-20 accent-indigo-400" />
                        <span className="text-[11px] font-mono text-white/60 w-16">{["Beginner","Intermediate","Advanced","PhD"][difficulty]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Tab bar — compact: active shows icon+label, inactive shows icon-only with tooltip */}
                  <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-white/8">
                    {TABS.map(({ id, label, Icon }) => {
                      const isActive = activeTab === id;
                      const hasBadge = (id === "equations" && equations.length > 0) ||
                                       (id === "sources"   && sources.length > 0) ||
                                       (id === "python"    && !!pythonScript) ||
                                       (id === "wiki"      && !!wikiArticle);
                      const isSpinning = (id === "equations" || id === "python") && artifactsGenerating;
                      return (
                        <button
                          key={id}
                          onClick={() => setActiveTab(id)}
                          title={label}
                          className={`relative flex items-center gap-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex-shrink-0 ${
                            isActive
                              ? "bg-white/10 ring-1 ring-white/15 text-white px-2.5 py-1.5"
                              : "text-white/40 hover:text-white/65 hover:bg-white/5 px-2 py-1.5"
                          }`}
                        >
                          <Icon className={`flex-shrink-0 ${isActive ? "h-3.5 w-3.5 text-indigo-400" : "h-3.5 w-3.5"}`} />
                          {/* Show label only for active tab to save horizontal space */}
                          {isActive && <span>{label}</span>}
                          {hasBadge && !isActive && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          )}
                          {isSpinning && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </button>
                      );
                    })}

                    {/* Factual guard badge — pinned to right */}
                    <div className={`ml-auto flex-shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg ring-1 ${
                      notesQuality.score >= 80 ? "bg-emerald-950/40 ring-emerald-500/25 text-emerald-300" : "bg-amber-950/35 ring-amber-500/25 text-amber-300"
                    }`} title={`Notes quality: ${notesQuality.score}%`}>
                      {notesQuality.score >= 80 ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      {notesQuality.score}%
                    </div>
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {renderTab()}
                  </div>

                  {/* Params summary bar */}
                  {simConfig && (
                    <div className="flex-shrink-0 border-t border-white/8 px-4 py-2 flex items-center gap-3 overflow-x-auto">
                      {(simConfig.params || []).slice(0, 4).map((p) => (
                        <div key={p.name} className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] text-white/40">{p.label || p.name}</span>
                          <span className="text-[10px] font-mono font-bold text-cyan-400">{vars[p.name] ?? p.default}</span>
                          <span className="text-[10px] text-white/30">{p.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.section>
            )}

            {/* Right panel — 3D Sandbox */}
            {panelMode !== "notes-only" && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 flex-1 overflow-hidden relative z-0"
              >
                <div className="h-full min-h-0 rounded-3xl bg-white/[0.05] ring-1 ring-white/12 backdrop-blur-xl overflow-hidden grid grid-rows-[auto,1fr,auto]">
                  {/* Compact single-row header — never wraps */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0 min-w-0">
                    <button
                      onClick={() => setPanelMode(panelMode === "sandbox-only" ? "both" : "sandbox-only")}
                      className="p-1 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/70 transition flex-shrink-0"
                    >
                      {panelMode === "sandbox-only" ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                    </button>
                    <div className="text-[12px] font-semibold text-white/85 flex-shrink-0">3D Sandbox</div>
                    <div className="px-1.5 py-0.5 rounded-md bg-white/8 text-[9px] text-white/45 font-mono truncate min-w-0 max-w-[90px]">
                      {simConfig?.displayName || simType || "—"}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1 min-w-0" />

                    {/* Visual accuracy buttons — compact icon+text */}
                    {simType && (
                      <>
                        <button
                          type="button"
                          onClick={() => recordVisualAccuracy(true, activeTopic, simType)}
                          title="Mark visual as accurate"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-300 text-[10px] font-medium transition flex-shrink-0"
                        >
                          <ThumbsUp className="h-3 w-3" />
                          <span className="hidden sm:inline">Accurate</span>
                        </button>
                        <button
                          type="button"
                          title="Mark visual as inaccurate — triggers regeneration"
                          onClick={() => {
                            recordVisualAccuracy(false, activeTopic, simType);
                            if (sceneCode) {
                              setSceneCode(null);
                              generateSceneCode(activeTopic, simType, vars, "USER MARKED THE 3D VISUAL AS INACCURATE. Rebuild from scratch with correct geometry.");
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-rose-300 text-[10px] font-medium transition flex-shrink-0"
                        >
                          <ThumbsDown className="h-3 w-3" />
                          <span className="hidden sm:inline">Off</span>
                        </button>
                      </>
                    )}

                    {/* Panel expand/collapse right */}
                    <button
                      onClick={() => setPanelMode(panelMode === "notes-only" ? "both" : "notes-only")}
                      className="p-1 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/70 transition flex-shrink-0"
                      title={panelMode === "notes-only" ? "Show 3D sandbox" : "Expand 3D sandbox"}
                    >
                      {panelMode === "notes-only" ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Canvas row — fills all remaining height, never shrinks for sliders */}
                  <div className="relative min-h-0 overflow-hidden bg-[#050810]">
                    <PhysicsScene
                      simType={simType}
                      params={vars}
                      simConfig={simConfig}
                      topic={activeTopic}
                      sceneCode={sceneCode}
                      onRegenerate={handleRegenerate}
                      agentSteps={agentSteps}
                    />
                    <AnimatePresence mode="wait">
                      <StatusCard key={physicsState.state} physicsState={physicsState} onAutoFix={handleAutoFix} />
                    </AnimatePresence>
                  </div>

                  {/* Param sliders — separate row below canvas, scrollable if many params */}
                  {(simConfig?.params?.length > 0) && (
                    <ParamSliderPanel
                      simConfig={simConfig}
                      currentParams={vars}
                      editorValue={editorValue}
                      onParamChange={(key, val) => mergeVar(key, val)}
                      onEditorChange={(v) => { setEditorValue(v); setVars(parseParams(v)); }}
                    />
                  )}
                </div>
              </motion.section>
            )}
          </div>
        </div>
      </div>

      {/* Ask AI Drawer */}
      <AskAIDrawer
        open={askDrawerOpen}
        onClose={() => setAskDrawerOpen(false)}
        simConfig={simConfig}
        currentParams={vars}
        editorValue={editorValue}
        onGenerateNotes={async (topic) => {
          setAskDrawerOpen(false);
          await generateNotes(topic);
        }}
      />
    </div>
  );
}


