"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Loader2, Brain, Zap, AlertTriangle, CheckCircle, ShieldCheck, ShieldAlert, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useLoominStore } from "./store";
import PhysicsScene from "./PhysicsScene";
import StatusCard from "./components/StatusCard";
import AskAIDrawer from "./components/AskAIDrawer";
import JournalsNav from "./components/JournalsNav";
import AgentStatusBar from "./components/AgentStatusBar";
import InteractiveNotesSurface from "./components/InteractiveNotesSurface";
import ParamSliderPanel from "./components/ParamSliderPanel";

// ── helpers ────────────────────────────────────────────────────────────────

// Normalize param key to Title_Snake_Case so components always match
// regardless of what case the AI generated (BALL_COUNT / Ball_Count / ball_count all → Ball_Count)
function normalizeKey(key) {
  return key.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("_");
}

function parseParams(text) {
  const out = {};
  // Match: PARAM_NAME = 12 or PARAM_NAME = 12.5 // optional comment
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(?:\/\/.*)?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseFloat(m[2]);
    if (!isNaN(num)) out[normalizeKey(m[1])] = num;
  }
  return out;
}

function parseSIMCONFIG(text) {
  // 1. Case-insensitive tag match (handles <SIMCONFIG> and <simconfig>)
  const tagMatch = text.match(/<simconfig>([\s\S]*?)<\/simconfig>/i);
  if (tagMatch) {
    try { return JSON.parse(tagMatch[1].trim()); } catch {}
  }
  // 2. JSON inside a markdown code block that has a simType field
  const codeMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"simType"[\s\S]*?\})\s*```/i);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1].trim()); } catch {}
  }
  // 3. Last resort: find any JSON object with simType anywhere in the text
  const allJson = [...text.matchAll(/(\{[\s\S]*?"simType"\s*:[\s\S]*?\})\s*(?:\n|$)/g)];
  for (const m of [...allJson].reverse()) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed.simType) return parsed;
    } catch {}
  }
  return null;
}

// Physics chain explanations: Formula → Why it matters → What physically fails → Real consequence
function buildPhysicsFallbackExplanation(simType, paramName, val, warn, crit, unit = "") {
  const p = normalizeKey(paramName);
  const u = unit ? ` ${unit}` : "";

  // Per-param chains within each simType
  const chains = {
    wind_turbine: {
      Wind_Speed: `Wind power scales as P = ½ρAv³ — so doubling wind speed increases aerodynamic load by 8×. More critically, blade bending stress follows σ = M·y/I where M ∝ v²·L², meaning stress grows with the square of wind speed. At ${val}${u}, this stress exceeds CFRP yield strength (~500 MPa). The blade begins to deform at its root, initiating fatigue cracks. If uncorrected, the blade detaches and the sudden imbalance can topple the tower.`,
      Blade_Count: `More blades increase rotor solidity and drag torque. Beyond 6-7 blades, adjacent blades enter each other's wake, reducing aerodynamic efficiency and creating oscillating pressure differentials — the same flutter instability that destroyed the Tacoma Narrows Bridge. At ${val}${u}, the wake interaction frequency approaches the tower's natural frequency, risking resonance.`,
      Rotor_Diameter: `Blade tip speed = ω × R. Larger rotors sweep more area (A = πR²), capturing more power, but centripetal stress on the blade root scales as σ_c ∝ ω²·R². At ${val}${u}m diameter with normal RPM, root stress exceeds structural limits and the blade cannot survive a rated storm load.`,
    },
    newton_cradle: {
      Damping: `Each collision dissipates energy proportional to the damping coefficient. The cradle relies on nearly elastic collision (coefficient of restitution e ≈ 0.98 for steel). At damping = ${val}${u}, energy loss per swing is so high that momentum transfer p = mv is no longer fully passed through the chain — instead of the last ball swinging out fully, the system damps to rest in just a few oscillations, violating the n-in = n-out rule.`,
      Ball_Count: `With ${val} balls, the impulse chain becomes long enough that inelastic losses compound. The elastic wave traveling through the balls loses coherence, and instead of clean 1-1 transfer, multiple balls move simultaneously — breaking the fundamental Newton's Cradle behavior.`,
      String_Length: `Period T = 2π√(L/g). Short strings (L < 0.3m) increase oscillation frequency so high that air resistance and string elasticity dominate the dynamics. The system behaves more like a spring than a pendulum and the ideal elastic collision model breaks down.`,
    },
    projectile: {
      Initial_Speed: `Kinetic energy = ½mv². Range R = v²·sin(2θ)/g, so range grows with v². At ${val}${u}, aerodynamic drag (F_drag = ½ρCdAv²) becomes dominant — drag force grows with v² just as range does, meaning the real trajectory deviates massively from the ideal parabola. In real applications this is the point where the object transitions from ballistic to aerodynamic flight.`,
      Gravity: `Vertical deceleration a = g controls flight time: t_flight = 2v·sinθ/g. At g = ${val}${u}, the projectile stays airborne unrealistically long, simulating a low-gravity environment like the Moon (1.62 m/s²) or Mars (3.72 m/s²). The parabola becomes extremely elongated and horizontal range increases dramatically.`,
      Launch_Angle: `Range is maximized at θ = 45° where sin(2θ) = 1. Current angle ${val}° means sin(2×${val}°) = ${Math.sin(2 * (val || 0) * Math.PI / 180).toFixed(3)}, so range is ${(Math.sin(2 * (val || 0) * Math.PI / 180) * 100).toFixed(1)}% of maximum. The time of flight T = 2v·sinθ/g decreases as angle drops below 45°, reducing hang time and thus range.`,
    },
    rocket: {
      Initial_Speed: `The Tsiolkovsky equation Δv = v_e·ln(m_i/m_f) defines achievable velocity change. At ${val}${u}, dynamic pressure q = ½ρv² is extremely high — at 100 m/s at sea level, q ≈ 6 kPa. Real rockets experience Max-Q (maximum aerodynamic stress) around 35 kPa, where structural loads from q × drag_area approach or exceed frame limits, risking vehicle breakup.`,
      Gravity: `Gravity loss = g·t_burn represents velocity wasted fighting gravity. At g = ${val}${u}, a 10-second burn wastes ${(val * 10).toFixed(0)} m/s — at high gravity this is a significant fraction of achievable Δv, making orbit insertion impossible without much higher thrust.`,
      Mass_Ratio: `The rocket equation requires mass ratio R = m_initial/m_final. At R = ${val}, Δv = v_e·ln(${val}) = ${(3000 * Math.log(Math.max(1.01, val))).toFixed(0)} m/s (for v_e = 3000 m/s). Above R ≈ 40, structural requirements for holding that much propellant exceed typical material limits — tanks become too thin to survive flight loads.`,
    },
    spring_mass: {
      Spring_Stiffness: `Natural frequency ω_n = √(k/m). At k = ${val} N/m, ω_n = √(${val}/m) rad/s. If external forcing frequency matches ω_n, resonance occurs: amplitude A = F₀/(c·ω_n) → ∞ as damping c → 0. This is the mechanism behind the Tacoma Narrows Bridge collapse and fatigue failures in engine mounts.`,
      Mass: `Increasing mass lowers ω_n = √(k/m) and slows the oscillation. At m = ${val} kg, the system becomes sluggish and requires more force to displace. In real systems (car suspensions, seismic isolators), excessive mass reduces the effectiveness of the spring as an energy absorber.`,
      Damping: `The damping ratio ζ = c/(2√(km)) determines response character. At c = ${val}, ζ > 1 means overdamped — the system returns to equilibrium without oscillating, like a door closer. ζ < 1 means underdamped — oscillation persists. At the critical value, ζ = 1 gives fastest non-oscillatory return.`,
      Amplitude: `Stored energy E = ½kA². At A = ${val}m, peak elastic potential energy = ½k·${val}². In real springs, large amplitude strains exceed the elastic limit — the spring yields (deforms permanently) and no longer obeys Hooke's Law F = -kx.`,
    },
    orbit: {
      Orbital_Speed: `Orbital velocity for circular orbit: v = √(GM/r). At v = ${val}× the nominal value, the centripetal acceleration v²/r no longer equals gravitational acceleration GM/r². If v is too high, the body escapes into a hyperbolic trajectory. If too low, it spirals inward and eventually impacts the central body.`,
      Star_Mass: `Gravitational force F = GMm/r². Increasing central mass increases orbital velocity requirement: v ∝ √M. At M = ${val}× nominal, orbital velocities become enormous and the escape velocity v_esc = √(2GM/r) approaches significant fractions of lightspeed for extreme values — the system approaches black hole territory.`,
      Orbital_Radius: `Kepler's 3rd Law: T² ∝ r³. At r = ${val}× nominal, orbital period changes drastically. Too close, tidal forces (differential gravity across the orbiting body) can exceed the body's self-gravity and tear it apart — this is the Roche limit.`,
    },
    robot_arm: {
      Arm_Shoulder_Pitch: `Joint torque τ = r × F. The shoulder must support the full arm weight at angle ${val}°. Torque τ = m_arm·g·L·cos(${val}°) = ${(Math.abs(Math.cos((val||0)*Math.PI/180))*100).toFixed(0)}% of max torque. Near 90°, the moment arm is minimized but motor operates near its torque limit. Beyond 70°, structural load at the shoulder joint exceeds the designed shear stress limit of the fasteners.`,
      Arm_Elbow_Pitch: `At ${val}°, the forearm creates a kinematic singularity — the Jacobian matrix (which maps joint velocities to end-effector velocities) becomes singular. This means small changes in end-effector position require infinite joint velocity, making precise control impossible and risking a dangerous snap motion.`,
      Arm_Wrist_Pitch: `The wrist concentrates force over a small contact area. At ${val}°, the mechanical advantage of the gripper changes dramatically — force F_grip = τ_motor / (r·cos(${val}°)). Near 90°, force transmission efficiency drops to near zero, and the wrist bearing experiences maximum shear load.`,
    },
    bridge: {
      Load: `Bending moment at midspan M = w·L²/8 for uniform load w. At Load = ${val} kN, stress σ = M·c/I where c is distance from neutral axis. When σ exceeds material yield strength (steel: ~250 MPa, concrete: ~30 MPa), the beam yields permanently. The progression is: elastic deformation → plastic hinge → collapse mechanism.`,
      Span: `Deflection δ = 5wL⁴/(384EI) — it scales with L⁴. Doubling span increases deflection by 16×. At Span = ${val}m, self-weight alone creates significant pre-stress. Slender bridges also become susceptible to wind-induced flutter — the same effect that destroyed the Tacoma Narrows Bridge in 1940.`,
      Material_Strength: `Safety factor SF = σ_yield / σ_applied. At Material_Strength = ${val} MPa, the margin above working stress shrinks dangerously. A 10% overload or material defect can cause brittle fracture — sudden failure with no warning, as opposed to ductile failure which shows visible deformation first.`,
      Deck_Thickness: `Section modulus S = I/c ∝ t³ (for rectangular section). Halving thickness reduces bending resistance by 8×. At t = ${val}m, the deck buckles under combined bending and compressive load — like pressing on the middle of a thin ruler.`,
    },
    water_bottle: {
      Temperature: `PET plastic has a glass transition temperature of ~80°C. At ${val}°C, polymer chains gain enough thermal energy to slide past each other, causing permanent creep deformation. Simultaneously, internal vapor pressure of water rises — at 80°C, vapor pressure ≈ 47 kPa above atmospheric. The combination of softened plastic + rising internal pressure causes the bottle to bulge and ultimately fail at its weakest seam.`,
      Pressure: `Hoop stress σ_h = P·r/t (thin-walled pressure vessel formula). At P = ${val} kPa gauge, σ_h = ${val}×1000 × r/t. For a 45mm radius bottle with 2mm wall, σ_h ≈ ${((val*1000*0.045)/0.002/1e6).toFixed(2)} MPa. PET yield strength is ~55 MPa — approaching this causes permanent deformation and stress whitening.`,
      Fill_Level: `At ${val}% fill, the liquid acts as a pressure amplifier when dropped or squeezed. A water hammer effect occurs when sudden deceleration creates a pressure spike P = ρ·c·Δv (c = speed of sound in water ≈ 1500 m/s). Near-full bottles transmit this spike directly to the cap seal, which has the lowest burst pressure of any component.`,
      Wall_Thickness: `Using σ_h = P·r/t, thinner walls mean higher stress for the same internal pressure. At t = ${val}mm, hoop stress σ_h = ${((101000*0.045)/(val/1000)/1e6).toFixed(2)} MPa under just atmospheric pressure. With any overpressure from temperature or impact, this exceeds yield strength and the bottle buckles inward (external pressure) or bursts (internal pressure).`,
    },
    airplane: {
      Angle_Of_Attack: `Lift L = ½ρv²·CL·A where CL peaks near the critical angle of attack (~15-20°). At ${val}°, the boundary layer on the upper wing surface separates — airflow becomes turbulent and detaches, causing CL to drop suddenly by ~40%. This is aerodynamic stall: lift collapses faster than drag, and the nose pitches down uncontrollably unless the pilot reduces AoA immediately.`,
      Airspeed: `Lift equation L = ½ρv²·CL·A shows lift ∝ v². At ${val} km/h, dynamic pressure q = ½ρv² = ${(0.5*1.225*(val/3.6)**2/1000).toFixed(1)} kPa. If this exceeds the wing's structural limit (typically 50-80 kPa for commercial aircraft), flutter occurs — the wing oscillates at its natural frequency with growing amplitude until structural failure.`,
      Thrust: `At ${val} N of thrust, thrust-to-weight ratio T/W = ${val}/(typical 400,000 kg × 9.81). If T < Drag, the aircraft decelerates below stall speed. If T is excessive, q rises rapidly (v increases) and the aircraft can overspeed its Vmo (maximum operating speed), risking structural failure or control surface flutter.`,
      Flap_Setting: `Flaps increase CL_max (allowing lower stall speed) but also dramatically increase drag (CD ∝ flap_angle²). At ${val}°, the drag increase requires more thrust to maintain level flight. Full flaps (40°) nearly double drag — at cruise speed this would create asymmetric loads that could structurally overstress the flap hinges.`,
    },
  };

  // Try to find a specific param chain first
  const simChains = chains[simType];
  const specificChain = simChains?.[p] || simChains?.[paramName];

  if (specificChain) {
    const thresholds = warn !== undefined && crit !== undefined
      ? ` [Thresholds: warning ${warn}${u}, critical ${crit}${u}]`
      : "";
    return `${specificChain}${thresholds}`;
  }

  // Generic fallback with formula chain structure
  return `${p} at ${val}${u} has exceeded the safe operating range (warning: ${warn}${u}, critical: ${crit}${u}). In physical systems, parameters rarely fail in isolation — exceeding this value increases internal forces or stresses that follow power-law relationships (stress ∝ v², deflection ∝ L⁴, etc.), meaning small overages cause disproportionately large failures. Reduce ${p} incrementally and observe how the simulation state changes.`;
}

function evaluateNotesQuality(text, simConfig) {
  const checks = [];
  const body = text || "";
  const hasEquation = /(=|\\frac|\\sigma|\\tau|\\rho|\\omega|F\s*=|P\s*=|m\s*\*)/.test(body);
  const hasFailureModes = /failure|fracture|stall|collapse|buckl|resonance|singular|fatigue/i.test(body);
  const hasInteractiveBlock = /interactive simulation/i.test(body);
  const hasParamLines = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*[-+]?(?:\d+\.?\d*|\.\d+)/m.test(body);

  checks.push({ label: "Equation(s) present", pass: hasEquation });
  checks.push({ label: "Failure modes explained", pass: hasFailureModes });
  checks.push({ label: "Interactive section present", pass: hasInteractiveBlock });
  checks.push({ label: "Editable parameter lines found", pass: hasParamLines });

  if (simConfig?.params?.length) {
    const lines = parseParams(body);
    const expected = simConfig.params.map((p) => normalizeKey(p.name));
    const missing = expected.filter((k) => lines[k] === undefined);
    checks.push({
      label: missing.length === 0 ? "All SIMCONFIG params are editable in notes" : `Missing editable params: ${missing.join(", ")}`,
      pass: missing.length === 0,
    });
  }

  const passCount = checks.filter((c) => c.pass).length;
  const score = Math.round((passCount / Math.max(1, checks.length)) * 100);
  return { score, checks };
}

function validatePhysics(simConfig, params) {
  if (!simConfig?.constraints?.length) {
    return { state: "OPTIMAL", explanation: "", fixedParams: simConfig?.optimalParams || {} };
  }
  let worst = "OPTIMAL";
  let explanation = "";
  for (const c of simConfig.constraints) {
    // Normalize the SIMCONFIG param name too, so it always matches the normalized editor key
    const val = params[normalizeKey(c.param)] ?? params[c.param];
    if (val === undefined) continue;
    // Get unit for display
    const paramDef = simConfig.params?.find((p) => p.name === c.param);
    const unit = paramDef?.unit ? ` ${paramDef.unit}` : "";
    // Always use our detailed physics chain explanation — it's far more educational
    const detailed = buildPhysicsFallbackExplanation(
      simConfig?.simType,
      c.param,
      val,
      c.warningThreshold,
      c.criticalThreshold,
      paramDef?.unit || ""
    );
    if (val >= (c.criticalThreshold ?? Infinity)) {
      worst = "CRITICAL_FAILURE";
      explanation = `${normalizeKey(c.param)} is ${val}${unit} — exceeds the critical limit of ${c.criticalThreshold}${unit}. ${detailed}`;
      break;
    } else if (val >= (c.warningThreshold ?? Infinity) && worst !== "CRITICAL_FAILURE") {
      worst = "WARNING";
      explanation = `${normalizeKey(c.param)} is ${val}${unit}, approaching the critical limit of ${c.criticalThreshold}${unit}. ${detailed}`;
    }
  }
  return { state: worst, explanation, fixedParams: simConfig?.optimalParams || {} };
}

// Only fix the params that are actually violating constraints — don't reset unrelated ones
function buildAutoFixText(editorText, simConfig, currentParams) {
  let result = editorText;
  for (const constraint of simConfig?.constraints || []) {
    const normKey = normalizeKey(constraint.param);
    const val = currentParams[normKey] ?? currentParams[constraint.param];
    if (val === undefined) continue;
    // Only touch this param if it's actually at or above the warning threshold
    if (val >= (constraint.warningThreshold ?? Infinity)) {
      const optimalVal = simConfig?.optimalParams?.[constraint.param]
        ?? simConfig?.optimalParams?.[normKey];
      if (optimalVal !== undefined) {
        // Match the param regardless of case (editor may have BALL_COUNT or Ball_Count)
        result = result.replace(
          new RegExp(`^(\\s*${constraint.param}\\s*=\\s*)([\\d.+-]+)(\\s*.*)$`, "mi"),
          `$1${optimalVal}$3`
        );
      }
    }
  }
  return result;
}

// ── main component ─────────────────────────────────────────────────────────

export default function PhysicsEditorPage() {
  const updateFromStorage = useLoominStore((s) => s.updateFromStorage);
  const hasUpdated = useLoominStore((s) => s.hasUpdated);
  const journals = useLoominStore((s) => s.journals);
  const activeId = useLoominStore((s) => s.activeId);
  const setEditorValue = useLoominStore((s) => s.setEditorValue);
  const setVars = useLoominStore((s) => s.setVars);
  const setSimConfig = useLoominStore((s) => s.setSimConfig);
  const setTopic = useLoominStore((s) => s.setTopic);
  const setQuality = useLoominStore((s) => s.setQuality);
  const createJournal = useLoominStore((s) => s.createJournal);

  const active = useMemo(
    () => journals.find((j) => j.id === activeId) || journals[0],
    [journals, activeId]
  );
  const editorValue = active?.editorValue ?? "";
  const vars = active?.vars ?? {};
  const simConfig = active?.simConfig ?? null;
  // activeTopic and quality are stored per-journal so switching notes restores
  // the exact simulation that was generated, not a stale or reset state
  const activeTopic = active?.topic ?? "";
  const quality = active?.quality ?? "thinking";

  const [navOpen, setNavOpen] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [askDrawerOpen, setAskDrawerOpen] = useState(false);
  const [physicsState, setPhysicsState] = useState({ state: "OPTIMAL", explanation: "", fixedParams: {} });
  // Panel collapse: "both" | "notes-only" | "sandbox-only"
  const [panelMode, setPanelMode] = useState("both");

  // Agent pipeline state — drives the AgentStatusBar UI
  const [agentStates, setAgentStates] = useState({
    research:  { status: "idle", msg: "", toolCalls: 0 },
    design:    { status: "idle", msg: "", toolCalls: 0 },
    validator: { status: "idle", msg: "", toolCalls: 0 },
  });
  const [pipelineMeta, setPipelineMeta] = useState({ totalToolCalls: 0, ragUsed: false, visible: false });

  useEffect(() => { updateFromStorage(); }, [updateFromStorage]);

  // Re-validate on vars / simConfig change
  useEffect(() => {
    setPhysicsState(validatePhysics(simConfig, vars));
  }, [vars, simConfig]);

  // When switching journals: re-parse vars and restore topic input
  useEffect(() => {
    if (!hasUpdated) return;
    const parsed = parseParams(editorValue);
    setVars(parsed);
    // Restore the topic input to what was last used for this journal
    setTopicInput(active?.topic ?? "");
  }, [hasUpdated, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Strips leaked prompt rules and SIMCONFIG blocks from display text
  const cleanDisplay = (text) =>
    text
      .replace(/<simconfig>[\s\S]*?<\/simconfig>/gi, "")
      .replace(/```(?:json)?\s*\{[\s\S]*?"simType"[\s\S]*?\}\s*```/gi, "")
      .replace(/RULES FOR SIMCONFIG[\s\S]*/i, "")
      .replace(/CRITICAL RULES[\s\S]*/i, "")
      .replace(/SIM TYPE REFERENCE[\s\S]*/i, "")
      .replace(/Do not output any explanation of these rules[\s\S]*/i, "")
      .trimEnd();

  // Multi-agent pipeline: Research → Design → Validate
  const generateNotes = useCallback(async () => {
    const topic = topicInput.trim();
    if (!topic || streaming) return;
    setStreaming(true);
    setTopic(topic);
    setEditorValue(`## Generating: ${topic}\n\n_Initialising multi-agent pipeline…_\n`);

    // Reset agent status bar
    const idle = { status: "idle", msg: "", toolCalls: 0 };
    setAgentStates({ research: idle, design: idle, validator: idle });
    setPipelineMeta({ totalToolCalls: 0, ragUsed: false, visible: true });

    try {
      const res = await fetch("/api/agent-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, quality }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";

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
              setAgentStates((prev) => ({
                ...prev,
                [evt.agent]: { status: "running", msg: evt.msg, toolCalls: 0 },
              }));
              break;

            case "agent_complete":
              setAgentStates((prev) => ({
                ...prev,
                [evt.agent]: { status: "done", msg: evt.msg, toolCalls: evt.toolCalls ?? 0 },
              }));
              break;

            case "design_chunk":
              fullText += evt.chunk ?? "";
              setEditorValue(cleanDisplay(fullText));
              break;

            case "pipeline_complete":
              fullText = evt.fullText ?? fullText;
              setPipelineMeta((prev) => ({
                ...prev,
                totalToolCalls: evt.totalToolCalls ?? 0,
                ragUsed: evt.ragUsed ?? false,
              }));
              break;

            case "error":
              console.error("[agent-pipeline]", evt.message);
              break;
          }
        }
      }

      // Parse + apply SIMCONFIG
      const config = parseSIMCONFIG(fullText);
      if (config) {
        setSimConfig(config);
        const initialVars = {};
        for (const p of config.params || []) initialVars[p.name] = p.default;
        setVars(initialVars);
      }

      // Final clean display
      const finalDisplay = cleanDisplay(fullText);
      setEditorValue(finalDisplay);
      const parsedVars = parseParams(finalDisplay);
      if (Object.keys(parsedVars).length > 0) setVars(parsedVars);

    } catch (err) {
      console.error("generateNotes error:", err);
      setEditorValue(`## Error\nFailed to generate notes. Please try again.`);
    } finally {
      setStreaming(false);
      setTopicInput("");
    }
  }, [topicInput, quality, streaming, setEditorValue, setVars, setSimConfig]);

  // AUTO-FIX: only fix violated params, leave the rest (e.g. keep user's blade count)
  const handleAutoFix = useCallback(() => {
    if (!simConfig) return;
    const newText = buildAutoFixText(editorValue, simConfig, vars);
    setEditorValue(newText);
    const parsed = parseParams(newText);
    setVars(parsed);
  }, [editorValue, simConfig, vars, setEditorValue, setVars]);

  // Derive live indicator
  const liveOk = physicsState.state !== "CRITICAL_FAILURE";
  const simType = simConfig?.simType || null;
  const notesQuality = useMemo(() => evaluateNotesQuality(editorValue, simConfig), [editorValue, simConfig]);

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
      <div className="pointer-events-none fixed inset-0 opacity-[0.65]" style={{
        background: "radial-gradient(1200px 600px at 70% 20%, rgba(99,102,241,0.22), transparent 55%), radial-gradient(900px 520px at 20% 80%, rgba(16,185,129,0.16), transparent 58%)",
      }} />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-[0.05]" />

      <div className="relative mx-auto h-full max-w-[1440px] px-4 py-4 grid grid-cols-[260px,1fr] gap-4">
        {/* Left sidebar — journals */}
        <JournalsNav
          open={navOpen}
          onToggle={() => setNavOpen((v) => !v)}
          onNewJournal={() => createJournal(`Session ${journals.length + 1}`)}
        />

        {/* Main area */}
        <div className="min-h-0 grid grid-rows-[auto,1fr] gap-4">
          {/* Navbar */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center">
                <div className="h-4 w-4 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300" />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] tracking-[0.18em] uppercase text-white/45">Loomin</div>
                <div className="text-[15px] font-semibold text-white/92">{active?.name ?? "Physics Sandbox"}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Live indicator */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ring-1 backdrop-blur-md ${liveOk ? "bg-emerald-950/60 ring-emerald-500/30" : "bg-red-950/60 ring-red-500/30"}`}>
                <div className={`h-2 w-2 rounded-full ${liveOk ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"}`} />
                <span className={`text-xs font-mono font-semibold ${liveOk ? "text-emerald-400" : "text-red-400"}`}>
                  {liveOk ? "LIVE" : "ERROR"}
                </span>
              </div>

              {/* System status */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ring-1 backdrop-blur-md ${liveOk ? "bg-white/5 ring-white/10" : "bg-red-950/40 ring-red-500/20"}`}>
                {liveOk
                  ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                <span className={`text-xs ${liveOk ? "text-white/60" : "text-red-300"}`}>
                  {liveOk ? "System Ready" : "Error Detected"}
                </span>
              </div>

              {/* Ask AI button */}
              <button
                onClick={() => setAskDrawerOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition text-xs font-semibold text-indigo-300"
              >
                <Brain className="h-3.5 w-3.5" />
                Ask AI
              </button>
            </div>
          </header>

          {/* Content grid — dynamic panel widths based on panelMode */}
          <div className="min-h-0 flex gap-4">
            {/* Left panel — Notes */}
            {panelMode !== "sandbox-only" && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 flex-1 overflow-hidden relative z-20"
              >
              <div className="min-h-0 rounded-3xl bg-white/[0.05] ring-1 ring-white/12 backdrop-blur-xl overflow-hidden flex flex-col">
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
                      onClick={generateNotes}
                      disabled={streaming || !topicInput.trim()}
                      className="h-8 w-8 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center flex-shrink-0"
                    >
                      {streaming ? (
                        <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 text-indigo-400" />
                      )}
                    </button>
                    {/* Collapse notes → sandbox-only */}
                    <button
                      onClick={() => setPanelMode(panelMode === "notes-only" ? "both" : "notes-only")}
                      title={panelMode === "notes-only" ? "Show sandbox" : "Fullscreen notes"}
                      className="p-1.5 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/65 transition flex-shrink-0"
                    >
                      {panelMode === "notes-only" ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* HQ / Fast toggle + model indicator */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 ring-1 ring-white/10">
                      <button
                        onClick={() => setQuality("thinking")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          quality === "thinking"
                            ? "bg-violet-600/40 ring-1 ring-violet-500/50 text-violet-300"
                            : "text-white/40 hover:text-white/60"
                        }`}
                      >
                        <Brain className="h-3 w-3" />
                        High Quality
                      </button>
                      <button
                        onClick={() => setQuality("fast")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          quality === "fast"
                            ? "bg-amber-600/40 ring-1 ring-amber-500/50 text-amber-300"
                            : "text-white/40 hover:text-white/60"
                        }`}
                      >
                        <Zap className="h-3 w-3" />
                        Fast
                      </button>
                    </div>
                    <span className="text-[10px] text-white/25 font-mono">
                      {quality === "thinking" ? "nemotron-ultra / llama-70b" : "nemotron-nano / llama-8b"}
                    </span>
                  </div>
                </div>

                {/* Factual quality */}
                <div className="flex-shrink-0 px-4 py-2 border-b border-white/8 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-white/55">
                    Rich Notes Surface (click any block to edit inline)
                  </div>

                  <div className={`flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-lg ring-1 ${
                    notesQuality.score >= 80
                      ? "bg-emerald-950/40 ring-emerald-500/25 text-emerald-300"
                      : "bg-amber-950/35 ring-amber-500/25 text-amber-300"
                  }`}>
                    {notesQuality.score >= 80 ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                    Factual Guard: {notesQuality.score}%
                  </div>
                </div>

                {/* Agent pipeline status bar */}
                <AgentStatusBar
                  agentStates={agentStates}
                  visible={pipelineMeta.visible}
                  totalToolCalls={pipelineMeta.totalToolCalls}
                  ragUsed={pipelineMeta.ragUsed}
                />

                {/* Notes area — single preview+edit surface */}
                <div className="flex-1 min-h-0">
                  <InteractiveNotesSurface
                    value={editorValue}
                    onChange={(v) => {
                      setEditorValue(v);
                      const parsed = parseParams(v);
                      setVars(parsed);
                    }}
                    currentParams={vars}
                    checks={notesQuality.checks}
                  />
                </div>

                {/* Params summary bar */}
                {simConfig && (
                  <div className="flex-shrink-0 border-t border-white/8 px-4 py-2 flex items-center gap-3 overflow-x-auto">
                    {(simConfig.params || []).slice(0, 4).map((p) => (
                      <div key={p.name} className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-white/40">{p.label || p.name}</span>
                        <span className="text-[10px] font-mono font-bold text-cyan-400">
                          {vars[p.name] ?? p.default}
                        </span>
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
              <div className="h-full min-h-0 rounded-3xl bg-white/[0.05] ring-1 ring-white/12 backdrop-blur-xl overflow-hidden grid grid-rows-[auto,1fr]">
                {/* Sandbox header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    {/* Expand-notes button */}
                    <button
                      onClick={() => setPanelMode(panelMode === "sandbox-only" ? "both" : "sandbox-only")}
                      title={panelMode === "sandbox-only" ? "Show notes panel" : "Hide notes panel"}
                      className="p-1.5 rounded-lg hover:bg-white/8 text-white/35 hover:text-white/70 transition"
                    >
                      {panelMode === "sandbox-only" ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                    </button>
                    <div className="text-sm font-semibold text-white/90">3D Sandbox</div>
                    <div className="px-2 py-0.5 rounded-md bg-white/8 text-[10px] text-white/50 font-mono">
                      {simConfig?.displayName || simType || "No simulation"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30">Drag to orbit</span>
                  </div>
                </div>

                {/* Canvas + overlays */}
                <div className="relative min-h-0 bg-[#050810]" style={{ paddingBottom: simConfig?.params?.length ? `${52 + simConfig.params.length * 40}px` : 0 }}>
                  <PhysicsScene
                    simType={simType}
                    params={vars}
                    simConfig={simConfig}
                    topic={activeTopic}
                  />

                  {/* Status card overlay */}
                  <AnimatePresence mode="wait">
                    <StatusCard
                      key={physicsState.state}
                      physicsState={physicsState}
                      onAutoFix={handleAutoFix}
                    />
                  </AnimatePresence>

                  {/* Parameter sliders pinned to sandbox bottom */}
                  <ParamSliderPanel
                    simConfig={simConfig}
                    currentParams={vars}
                    editorValue={editorValue}
                    onEditorChange={(v) => {
                      setEditorValue(v);
                      setVars(parseParams(v));
                    }}
                  />
                </div>
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
        onGenerateNotes={async (topic) => {
          setAskDrawerOpen(false);
          setStreaming(true);
          setTopic(topic);
          setEditorValue(`## Generating: ${topic}\n\n_Initialising multi-agent pipeline…_\n`);
          const idle = { status: "idle", msg: "", toolCalls: 0 };
          setAgentStates({ research: idle, design: idle, validator: idle });
          setPipelineMeta({ totalToolCalls: 0, ragUsed: false, visible: true });
          try {
            const res = await fetch("/api/agent-pipeline", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ topic, quality }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let fullText = "";
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
                if (evt.event === "agent_start")
                  setAgentStates((p) => ({ ...p, [evt.agent]: { status: "running", msg: evt.msg, toolCalls: 0 } }));
                else if (evt.event === "agent_complete")
                  setAgentStates((p) => ({ ...p, [evt.agent]: { status: "done", msg: evt.msg, toolCalls: evt.toolCalls ?? 0 } }));
                else if (evt.event === "design_chunk") { fullText += evt.chunk ?? ""; setEditorValue(cleanDisplay(fullText)); }
                else if (evt.event === "pipeline_complete") {
                  fullText = evt.fullText ?? fullText;
                  setPipelineMeta((p) => ({ ...p, totalToolCalls: evt.totalToolCalls ?? 0, ragUsed: evt.ragUsed ?? false }));
                }
              }
            }
            const config = parseSIMCONFIG(fullText);
            if (config) {
              setSimConfig(config);
              const iv = {};
              for (const p of config.params || []) iv[p.name] = p.default;
              setVars(iv);
            }
            const finalDisplay = cleanDisplay(fullText);
            setEditorValue(finalDisplay);
            const parsedVars = parseParams(finalDisplay);
            if (Object.keys(parsedVars).length > 0) setVars(parsedVars);
          } catch (err) {
            console.error(err);
          } finally {
            setStreaming(false);
          }
        }}
      />
    </div>
  );
}
