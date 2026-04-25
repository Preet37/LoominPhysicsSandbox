/**
 * /api/generate-scene  — tool-using agent pipeline (SSE streaming)
 *
 * Streams Server-Sent Events so the client sees each step live.
 *
 * AGENT TURNS (up to MAX_AGENT_TURNS = 4):
 *   Each turn runs five tools in sequence. Any failure feeds consolidated
 *   error text into the next generation call. On the last turn compile
 *   passing is sufficient to ship.
 *
 * Tool 1 · strip        Clean fences/imports, assert GeneratedScene present.
 * Tool 2 · audit        Static geometry checks + React hook misuse patterns.
 * Tool 3 · transform    sucrase JSX → JS, surface real syntax errors.
 * Tool 4 · compile      new Function() Node parse — catches JS errors before
 *                       the client ever tries to eval the code.
 * Tool 5 · review       Groq LLM quality check (skipped on final turn if compile
 *                       passed, to avoid burning an extra API call).
 *
 * SSE event shape:
 *   { event: 'step',     tool, status, turn, label, issues? }
 *   { event: 'complete', code, rawCode }
 *   { event: 'error',    error }
 */

import Groq from "groq-sdk";
// @ts-ignore
import { transform as sucraseTransform } from "sucrase";

const NVIDIA_BASE    = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL   = "meta/llama-3.1-405b-instruct";
const REVIEW_MODEL   = "llama-3.3-70b-versatile";
const MAX_AGENT_TURNS = 4;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing_groq_key" });

// ─────────────────────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw
    .replace(/```(?:jsx?|tsx?|javascript|typescript)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

function stripImportsExports(code: string): string {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "")
    .trim();
}

/**
 * Server-side code sanitizer: fix LLM alias mistakes before any audit or
 * transform runs. These substitutions are safe because the correct names are
 * injected into the client sandbox by DynamicPhysicsScene.
 */
function sanitizeCode(raw: string): string {
  return raw
    .replace(/\buseFrameR3F\b/g, "useFrame")
    .replace(/\buseR3FThree\b/g, "useThree")
    .replace(/\buseR3F\b/g, "useThree")
    .replace(/\buseThreeContext\b/g, "useThree")
    .replace(/\bReact\.useFrame\b/g, "useFrame");
}

/** Tool 1: strip — clean fences, imports, assert GeneratedScene present. */
function toolStrip(rawCode: string): { code: string; issues: string[] } {
  const stripped = stripImportsExports(stripFences(rawCode));
  // Auto-fix known LLM alias mistakes before auditing
  const code = sanitizeCode(stripped);
  const issues: string[] = [];
  if (!code.includes("GeneratedScene")) {
    issues.push(
      "GeneratedScene function not found — name your component exactly 'function GeneratedScene(...)'. Do NOT rename it.",
    );
  }
  if (code.length < 200) {
    issues.push(
      `Output only ${code.length} chars — write the complete component (minimum ~200 lines / 6000 chars).`,
    );
  }
  return { code, issues };
}

/** Tool 3: transform — sucrase JSX→JS, surface real parse error. */
function toolTransform(code: string): { transformed: string | null; issues: string[] } {
  try {
    const transformed = sucraseTransform(code, {
      transforms: ["jsx"],
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
      production: true,
    }).code;
    return { transformed, issues: [] };
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    return {
      transformed: null,
      issues: [
        `JSX SYNTAX ERROR (sucrase): ${msg}\nFix all JSX syntax errors — every opening tag must have a matching closing tag, all attributes must be valid JSX.`,
      ],
    };
  }
}

/** Tool 4: compile — new Function() parse in Node. Catches JS errors before client eval. */
function toolCompile(transformedCode: string): { issues: string[] } {
  try {
    // Mirror the sandbox params in DynamicPhysicsScene exactly so compile errors
    // match what the client will see at runtime.
    // eslint-disable-next-line no-new-func
    new Function(
      "React",
      "useFrame",
      "useRef",
      "useState",
      "useEffect",
      "useMemo",
      "THREE",
      "useThree",       // @react-three/fiber (commonly used by LLMs)
      "useFrameR3F",    // alias for useFrame (LLM compat — sanitized before this, but keep as fallback)
      "Html",           // @react-three/drei
      "Line",           // @react-three/drei
      "Text",           // @react-three/drei
      `${transformedCode}\nreturn typeof GeneratedScene !== 'undefined' ? GeneratedScene : null;`,
    );
    return { issues: [] };
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    return {
      issues: [
        `COMPILE ERROR (JavaScript): ${msg}\nThis is a JavaScript runtime error — fix the syntax or logic that causes it.`,
      ],
    };
  }
}

/**
 * Why in-app LLM output still diverges from hand-crafted Physics*.jsx:
 * - One-shot generation under token/time limits vs an agent that reads files, compiles, and fixes.
 * - Prompt sees a few embedded examples, not the whole components folder or every edge case.
 * - No TypeScript or test run on the server before eval — we mitigate with audits + review loops.
 * - Curated scenes (KB → dedicated component) stay the reliable path; this pipeline is best-effort for "custom".
 */

/** Same rules we use when writing hand-crafted Physics*.jsx — forces Nemotron to reason in 3D correctly. */
const HAND_CRAFT_METHODOLOGY = `
═══ HOW HAND-CRAFTED R3F SCENES ARE BUILT (YOU MUST FOLLOW THIS EXACTLY) ═══

COORDINATE SYSTEM (Three.js / R3F):
- Y is UP. Ground is a disc in the XZ plane: rotation [-PI/2, 0, 0], position y=0.
- Objects "standing" on the ground have their bottom near y=0 and extend +Y.

WHEELS (bicycles, cars, any vehicle):
- A wheel is a TORUS or CYLINDER that must roll on the ground → its axle is along X.
- CORRECT: mesh rotation={[Math.PI/2, 0, 0]} so the wheel stands VERTICAL (round profile in XZ, tire touches ground).
- WRONG: default torus lying flat like a coin on the floor — NEVER do this for road wheels.
- Two wheels: place at different Z (or X) along the wheelbase; both use the same vertical rotation.

GEARS:
- Teeth are NOT a single torus. Each tooth is a small box (or wedge) placed at angle = (i/N)*2*PI
  with position [cos(angle)*(R+h/2), 0, sin(angle)*(R+h/2)] and rotation Y = angle.
- Two meshing gears: centers separated by (r1+r2), rotate in OPPOSITE directions.

GENERAL:
- Minimum 25 distinct <mesh> elements for a complex object; 40+ is better.
- Every param from the list MUST appear in the code and change color, size, speed, or count.
- useFrame: animate anything that moves in real life; read delta from useFrame((_, d)=>).
- Build from real proportions: estimate size in meters, keep relative scale consistent.

SELF-CHECK before output:
1. If the topic has wheels, search your code for torusGeometry/cylinderGeometry — confirm rotation [PI/2,0,0] for vertical wheels.
2. If gears, confirm multiple tooth meshes in a loop with sin/cos.
3. Confirm ground circle at y=0 exists.

AVAILABLE SANDBOX GLOBALS — these are the ONLY names you can use:
  React, useRef, useState, useEffect, useMemo  ← from React
  useFrame(callback, priority?)                ← from @react-three/fiber (for animation)
  useThree()                                   ← from @react-three/fiber (returns { gl, camera, scene, size, ... })
  THREE                                        ← from three.js (THREE.MathUtils, THREE.Vector3, etc.)
  Html, Line, Text                             ← from @react-three/drei

CRITICAL — DO NOT USE THESE (they do not exist in the sandbox):
  ❌ useFrameR3F  → use useFrame
  ❌ useR3FThree  → use useThree
  ❌ useThreeContext → use useThree
  ❌ React.useFrame → use useFrame directly
  ❌ Any import statement — all are STRIPPED. Never write import/require.
  ❌ OrbitControls, Stars, Sky, MeshReflectorMaterial — not available.

REACT HOOKS (runtime — invalid hooks crash the canvas):
- useMemo(fn, DEPS) and useCallback(fn, DEPS): DEPS must be an ARRAY: [] or [x, y]. NEVER undefined, null, or a bare object.
- Prefer useMemo(() => [...], []) for stable arrays; never useMemo(fn, params) unless params is wrapped: [params].
- useFrame only — never setInterval or setTimeout inside a component.

REFS USED AS ARRAYS — common crash in useFrame:
- WRONG: const lines = useRef(); ... useFrame(() => { lines.current.forEach(...) }); // current is undefined on frame 1
- CORRECT: const lines = useRef([]); ... useFrame(() => { lines.current.forEach(...) }); // always an array
- CORRECT: const lines = useRef(null); ... useFrame(() => { if (!lines.current) return; ... });
- Rule: EVERY .current.forEach / .current.map / .current.filter call MUST be guarded or the ref initialised to [].
`.trim();

/** Catches hook misuse that survives sucrase but breaks React reconciler at runtime. */
function staticRuntimeAudit(code: string): string[] {
  const issues: string[] = [];
  const c = code.replace(/\s+/g, " ");

  if (/useMemo\s*\([^)]*,\s*undefined\s*\)/.test(c)) {
    issues.push(
      "RUNTIME: useMemo(..., undefined) is INVALID — use an array deps list, e.g. useMemo(fn, []) or useMemo(fn, [a,b]).",
    );
  }
  if (/useMemo\s*\([^)]*,\s*null\s*\)/.test(c)) {
    issues.push("RUNTIME: useMemo(..., null) is INVALID — use [] for empty dependencies.");
  }
  if (/useCallback\s*\([^)]*,\s*undefined\s*\)/.test(c)) {
    issues.push("RUNTIME: useCallback(..., undefined) is INVALID — use [] or [deps].");
  }
  if (/useCallback\s*\([^)]*,\s*null\s*\)/.test(c)) {
    issues.push("RUNTIME: useCallback(..., null) is INVALID — use [].");
  }

  // NOTE: ref.current.forEach / .map / .filter without guards is already caught at
  // runtime by DynamicPhysicsScene's useFrameSafe wrapper (silently stops that frame
  // callback and logs once). Flagging it here as a hard failure caused destructive
  // full rewrites that made scene quality much worse. Let useFrameSafe handle it.

  return issues;
}

/**
 * Post-sanitize audit: after the server sanitizer runs, any remaining undefined-name
 * patterns are bugs that slipped through and must trigger a regeneration.
 */
function sanitizerAudit(code: string): string[] {
  const issues: string[] = [];
  // These should have been replaced by sanitizeCode; if still present, something went wrong.
  if (/\buseFrameR3F\b/.test(code)) {
    issues.push("SANDBOX ERROR: useFrameR3F is NOT a valid R3F hook — replace every occurrence with useFrame. This will crash at runtime.");
  }
  if (/\buseR3FThree\b/.test(code)) {
    issues.push("SANDBOX ERROR: useR3FThree is NOT a valid hook — replace with useThree.");
  }
  if (/\buseThreeContext\b/.test(code)) {
    issues.push("SANDBOX ERROR: useThreeContext is NOT a valid hook — replace with useThree.");
  }
  if (/\bimport\b.*\bfrom\b/.test(code)) {
    issues.push("SANDBOX ERROR: import statements are stripped at runtime and will cause ReferenceError. Remove all import/require lines.");
  }
  return issues;
}

/** Deterministic checks — catches common LLM spatial mistakes the text reviewer misses. */
function staticGeometryAudit(code: string, topic: string): string[] {
  const t = topic.toLowerCase();
  const issues: string[] = [];
  const c = code.replace(/\s+/g, " ");

  if (/\b(bicycle|bike|cycling|mountain bike|road bike)\b/.test(t)) {
    const hasVert = /rotation=\{\s*\[\s*Math\.PI\s*\/\s*2|rotation=\{\[Math\.PI\/2/.test(code);
    const hasWheelish = /torusGeometry|cylinderGeometry/.test(code);
    if (hasWheelish && !hasVert) {
      issues.push(
        "SPATIAL: Bicycle/motorcycle wheels must be VERTICAL (rotation [Math.PI/2,0,0] on torus/cylinder). Flat rings on the floor are WRONG.",
      );
    }
  }

  if (/\b(gear|gears|spur|pinion|mechanical gear)\b/.test(t)) {
    const hasTeeth = /tooth|teeth|Math\.cos\(|Math\.sin\(.*angle|Array\.from.*length.*map/.test(code);
    if (!hasTeeth) {
      issues.push(
        "SPATIAL: Spur gears need explicit teeth — radial loop with cos/sin placing box meshes, not a lone torus or cube.",
      );
    }
  }

  if (/\b(helicopter|chopper)\b/.test(t)) {
    const hasRotor = /mainRotor|rotor|blade|rotation\.y\s*\+=/.test(c);
    if (!hasRotor) {
      issues.push("SPATIAL: Helicopter needs a visible main rotor group that spins in useFrame.");
    }
  }

  // Objects with repeated elements (strings, spokes, teeth, rungs, grids) legitimately
  // generate many meshes via loops — a single `.map()` call can render dozens of meshes
  // but only appears as one `<mesh>` tag in source. Lower the threshold for these topics.
  const hasRepeatedElements = /racket|racquet|string|fence|grid|lattice|spoke|rung|tooth|tee|truss|ladder/.test(t);
  // Also detect loop-generated meshes: Array.from / .map returning <mesh>
  const hasLoopMeshes = /Array\.from|\.map\s*\(.*<mesh|useMemo.*<mesh/.test(code);
  const meshCount = (code.match(/<mesh\b/g) || []).length;
  const effectiveMeshCount = hasLoopMeshes ? Math.max(meshCount * 3, meshCount) : meshCount;
  const minMeshes = hasRepeatedElements || hasLoopMeshes ? 8 : 18;
  if (effectiveMeshCount < minMeshes) {
    issues.push(`STRUCTURE: Only ${meshCount} <mesh> elements — too simplistic. Build a recognisable object with many sub-parts (target ${minMeshes}+).`);
  }

  const boxCount = (code.match(/<boxGeometry\b/g) || []).length;
  const sphereCount = (code.match(/<sphereGeometry\b/g) || []).length;
  const cylCount = (code.match(/<cylinderGeometry\b/g) || []).length;
  const torusCount = (code.match(/<torusGeometry\b/g) || []).length;
  const capsuleCount = (code.match(/<capsuleGeometry\b/g) || []).length;
  const coneCount = (code.match(/<coneGeometry\b/g) || []).length;
  const shapeVariety = [boxCount, sphereCount, cylCount, torusCount, capsuleCount, coneCount].filter((n) => n > 0).length;

  // Don't flag "mostly boxes" for objects where thin boxes are the correct geometry
  // (racket strings, bridge beams, fences, ladders, grids, buildings with windows, etc.)
  const boxesAreIntentional = /racket|racquet|string|bridge|fence|lattice|building|ladder|grid|shelf|book|window/.test(t);
  if (!boxesAreIntentional && (boxCount >= Math.max(1, meshCount - 2) || shapeVariety <= 1)) {
    issues.push("STRUCTURE: Scene is degenerate (mostly a single primitive family, often box-only). Use multiple geometry types and real sub-assemblies.");
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE COMPONENT — full PhysicsF1Car shown to generation model
// ─────────────────────────────────────────────────────────────────────────────
const REFERENCE = `
// ═══════════════════════════════════════════════════════════
// REFERENCE: PhysicsF1Car  (match this quality & depth)
// ═══════════════════════════════════════════════════════════
"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsF1Car({ params = {}, simConfig }) {
  const wheelFL = useRef(); const wheelFR = useRef();
  const wheelRL = useRef(); const wheelRR = useRef();
  const rearWingRef = useRef(); const frontWingRef = useRef();
  const exhaustGlowRef = useRef();

  const speed     = Number(params.Speed          ?? 200);
  const downforce = Number(params.Downforce      ?? 3000);
  const wingAngle = Number(params.Rear_Wing_Angle ?? 12);
  const tirePsi   = Number(params.Tire_Pressure  ?? 24);
  const ersLevel  = Number(params.ERS_Deployment ?? 50);

  const speedC = simConfig?.constraints?.find((c) => c.param === "Speed") || {};
  const warnT  = speedC.warningThreshold ?? 320;
  const critT  = speedC.criticalThreshold ?? 360;
  const isCritical = speed >= critT;
  const isWarning  = !isCritical && speed >= warnT;

  const tireOver  = tirePsi >= (simConfig?.constraints?.find(c=>c.param==="Tire_Pressure")?.criticalThreshold ?? 35);
  const tireWarn_ = !tireOver && tirePsi >= (simConfig?.constraints?.find(c=>c.param==="Tire_Pressure")?.warningThreshold ?? 30);

  useFrame((state, delta) => {
    const rot = Math.max(0, speed / 10) * delta * 0.5;
    [wheelFL, wheelFR, wheelRL, wheelRR].forEach(r => { if (r.current) r.current.rotation.x += rot; });
    if (rearWingRef.current) {
      const target = speed > 310 ? -0.05 : wingAngle * (Math.PI / 180);
      rearWingRef.current.rotation.x = THREE.MathUtils.lerp(rearWingRef.current.rotation.x, target, delta * 2);
    }
    if (frontWingRef.current) frontWingRef.current.position.y = 0.06 - Math.min(0.12, downforce / 50000);
    if (exhaustGlowRef.current) exhaustGlowRef.current.intensity = (ersLevel / 100) * (1.8 + Math.sin(state.clock.elapsedTime * 8) * 0.4);
  });

  const livery = isCritical ? "#dc2626" : "#e2e8f0";
  const carbon = "#1e293b"; const accent = "#dc2626";
  const tireCol = tireOver ? "#fca5a5" : tireWarn_ ? "#fcd34d" : "#111827";

  function Wheel({ fwd, ref: wRef }) {
    const tyreR = fwd ? 0.33 : 0.38; const tyreW = fwd ? 0.40 : 0.50;
    return (
      <group ref={wRef}>
        <mesh castShadow rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[tyreR,tyreR,tyreW,40]}/><meshStandardMaterial color={tireCol} roughness={0.95}/></mesh>
        <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[tyreR*0.56,tyreR*0.56,tyreW+0.02,20]}/><meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.15}/></mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><circleGeometry args={[8,64]}/><meshStandardMaterial color="#0f172a" roughness={0.9}/></mesh>
      {/* Floor */}
      <mesh position={[0,0.07,0]} castShadow><boxGeometry args={[4.9,0.06,2.1]}/><meshStandardMaterial color={carbon} metalness={0.6} roughness={0.3}/></mesh>
      {/* Monocoque tub */}
      <mesh position={[0.35,0.33,0]} castShadow><boxGeometry args={[3.0,0.46,1.42]}/><meshStandardMaterial color={livery} metalness={0.45} roughness={0.28}/></mesh>
      {/* Upper body */}
      <mesh position={[0.4,0.54,0]} castShadow><boxGeometry args={[2.2,0.20,0.96]}/><meshStandardMaterial color={livery} metalness={0.4} roughness={0.28}/></mesh>
      {/* Nose step */}
      <mesh position={[2.25,0.32,0]} castShadow><boxGeometry args={[0.7,0.26,0.52]}/><meshStandardMaterial color={carbon} metalness={0.5} roughness={0.3}/></mesh>
      {/* Nose tip */}
      <mesh position={[2.82,0.28,0]} rotation={[0,0,Math.PI/2]} castShadow><coneGeometry args={[0.13,0.85,14]}/><meshStandardMaterial color={carbon}/></mesh>
      {/* Sidepods */}
      {[1,-1].map(s=>(<group key={s}><mesh position={[-0.15,0.28,s*0.92]} castShadow><boxGeometry args={[2.4,0.38,0.52]}/><meshStandardMaterial color={accent} metalness={0.4} roughness={0.38}/></mesh></group>))}
      {/* Cockpit+halo */}
      <mesh position={[0.18,0.60,0]} castShadow><boxGeometry args={[0.85,0.3,0.60]}/><meshStandardMaterial color={carbon} metalness={0.6} roughness={0.2}/></mesh>
      <mesh position={[0.18,0.88,0]} rotation={[0,Math.PI/2,0]} castShadow><torusGeometry args={[0.40,0.034,10,22,Math.PI]}/><meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.15}/></mesh>
      <mesh position={[0.1,0.97,0]} castShadow><sphereGeometry args={[0.20,20,16]}/><meshStandardMaterial color="#1d4ed8"/></mesh>
      {/* Engine cover */}
      <mesh position={[-0.5,0.68,0]} castShadow><boxGeometry args={[1.5,0.32,0.74]}/><meshStandardMaterial color={livery} metalness={0.45} roughness={0.3}/></mesh>
      {/* Front wing group */}
      <group ref={frontWingRef} position={[0,0.06,0]}>
        <mesh position={[2.52,0,0]} castShadow><boxGeometry args={[0.58,0.05,2.45]}/><meshStandardMaterial color={carbon}/></mesh>
        <mesh position={[2.42,0.10,0]} castShadow><boxGeometry args={[0.48,0.04,2.15]}/><meshStandardMaterial color={accent}/></mesh>
        {[1.22,-1.22].map((z,i)=>(<mesh key={i} position={[2.48,0.10,z]} castShadow><boxGeometry args={[0.65,0.30,0.055]}/><meshStandardMaterial color={carbon}/></mesh>))}
      </group>
      {/* Rear wing */}
      <group ref={rearWingRef} position={[-2.2,0.88,0]}>
        <mesh castShadow><boxGeometry args={[0.52,0.06,2.0]}/><meshStandardMaterial color={carbon} emissive={isCritical?"#7f1d1d":"#000"} emissiveIntensity={isCritical?0.4:0}/></mesh>
        <mesh position={[0,0.13,0]} castShadow><boxGeometry args={[0.34,0.04,1.96]}/><meshStandardMaterial color={accent}/></mesh>
      </group>
      {[1.04,-1.04].map((z,i)=>(<mesh key={i} position={[-2.2,0.65,z]} castShadow><boxGeometry args={[0.52,0.52,0.055]}/><meshStandardMaterial color={carbon}/></mesh>))}
      {/* Diffuser */}
      <mesh position={[-2.25,0.14,0]} castShadow rotation={[0.22,0,0]}><boxGeometry args={[0.55,0.22,1.65]}/><meshStandardMaterial color={carbon}/></mesh>
      {/* Wheels */}
      <group position={[1.90,0.33,1.22]}><Wheel fwd ref={wheelFL}/></group>
      <group position={[1.90,0.33,-1.22]}><Wheel fwd ref={wheelFR}/></group>
      <group position={[-1.72,0.38,1.28]}><Wheel fwd={false} ref={wheelRL}/></group>
      <group position={[-1.72,0.38,-1.28]}><Wheel fwd={false} ref={wheelRR}/></group>
      {/* Exhaust */}
      <pointLight ref={exhaustGlowRef} position={[-2.0,0.38,0]} color="#f97316" intensity={1} distance={4}/>
      {isCritical&&<pointLight position={[0,1.2,0]} intensity={5} color="#ef4444" distance={10}/>}
    </group>
  );
}
// ═══════════════════════════════════════════════════════════
// END REFERENCE  (F1 car above has 40+ distinct mesh elements)
// ═══════════════════════════════════════════════════════════
`.trim();

/** Second pattern: non-vehicle object + correct useMemo(..., []) for derived arrays. */
const REFERENCE_BICYCLE_SNIPPET = `
// ═══ SECOND REFERENCE (bicycle excerpt — upright wheels + stable useMemo) ═══
const spokeAngles = useMemo(
  () => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2),
  [],
);
// Wheel tyre — MUST be rotation={[Math.PI/2, 0, 0]} so the wheel is vertical on the ground
<mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
  <torusGeometry args={[0.48, 0.045, 16, 80]} />
  <meshStandardMaterial color="#111827" />
</mesh>
// ═══ END SECOND REFERENCE ═══
`.trim();

/**
 * Third reference: sports/hand-held equipment with connected parts.
 * Shows the tennis racket as the canonical non-vehicle 3D example —
 * oval torus frame, string grid loop, throat, handle, all CONNECTED in Y-axis.
 * CRITICAL layout rule: everything hangs off a single <group> so parts are
 * relative to each other, NOT independently positioned at wild y-offsets.
 */
const REFERENCE_SPORTS_SNIPPET = `
// ═══ THIRD REFERENCE: Tennis Racket — connected parts, string grid, oval frame ═══
//
// COORDINATE LAYOUT (use this pattern for ANY hand-held / standing object):
//   y=0.00  — ground / butt of handle
//   y=0.00–0.38 — grip cylinder
//   y=0.38–0.62 — throat (two angled thin boxes converging upward)
//   y=0.62–0.72 — frame yoke (short neck connecting throat to oval)
//   y=0.72–1.18 — oval head centre at y=0.95  ← this is where the torus sits
//
// ALL parts are children of a single <group> — they share the same origin.
// Never scatter parts across unrelated y-offsets; always build hierarchically.

// ── String grid helper ─────────────────────────────────────────────────────
const H_STRINGS = 14;  // horizontal
const V_STRINGS = 10;  // vertical
const STRING_SPAN = 0.38; // half-length of strings inside oval

// Horizontal strings (run left–right across the head)
{Array.from({ length: H_STRINGS }, (_, i) => {
  const y = -STRING_SPAN + (i / (H_STRINGS - 1)) * STRING_SPAN * 2;
  return (
    <mesh key={"h" + i} position={[0, 0.95 + y, 0]} castShadow>
      <boxGeometry args={[0.44, 0.005, 0.005]} />
      <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
    </mesh>
  );
})}

// Vertical strings (run top–bottom across the head)
{Array.from({ length: V_STRINGS }, (_, i) => {
  const x = -0.19 + (i / (V_STRINGS - 1)) * 0.38;
  return (
    <mesh key={"v" + i} position={[x, 0.95, 0]} castShadow>
      <boxGeometry args={[0.005, STRING_SPAN * 2, 0.005]} />
      <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
    </mesh>
  );
})}

// ── Oval frame ─────────────────────────────────────────────────────────────
// torusGeometry: [ring-radius, tube-radius, tubularSegments, radialSegments]
// rotation={[Math.PI/2, 0, 0]} makes the ring face the camera (lie in XY plane)
<mesh position={[0, 0.95, 0]} rotation={[Math.PI/2, 0, 0]} castShadow>
  <torusGeometry args={[0.22, 0.013, 10, 60]} />
  <meshStandardMaterial color="#1e40af" metalness={0.6} roughness={0.2} />
</mesh>

// ── Throat ─────────────────────────────────────────────────────────────────
// Two thin boxes angled inward from head down to handle neck
<mesh position={[-0.09, 0.67, 0]} rotation={[0, 0, 0.38]} castShadow>
  <boxGeometry args={[0.035, 0.17, 0.015]} />
  <meshStandardMaterial color="#1e40af" metalness={0.55} roughness={0.25} />
</mesh>
<mesh position={[0.09, 0.67, 0]} rotation={[0, 0, -0.38]} castShadow>
  <boxGeometry args={[0.035, 0.17, 0.015]} />
  <meshStandardMaterial color="#1e40af" metalness={0.55} roughness={0.25} />
</mesh>

// ── Handle shaft ───────────────────────────────────────────────────────────
<mesh position={[0, 0.30, 0]} castShadow>
  <cylinderGeometry args={[0.016, 0.020, 0.42, 16]} />
  <meshStandardMaterial color="#1e40af" metalness={0.5} roughness={0.3} />
</mesh>

// ── Grip (wrapped section — slightly octagonal, different material) ─────────
<mesh position={[0, 0.22, 0]} castShadow>
  <cylinderGeometry args={[0.024, 0.024, 0.30, 8]} />
  <meshStandardMaterial color="#374151" roughness={0.9} metalness={0.0} />
</mesh>

// ── Butt cap ───────────────────────────────────────────────────────────────
<mesh position={[0, 0.065, 0]} castShadow>
  <cylinderGeometry args={[0.030, 0.028, 0.025, 16]} />
  <meshStandardMaterial color="#111827" roughness={0.7} />
</mesh>
// ═══ END THIRD REFERENCE ═══
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — VISUAL RESEARCH
//
// Priority order:
//   1. Gemini 2.0 Flash + Google Search grounding (live web search for real specs)
//   2. Gemini 1.5 Flash (from training data — no web)
//   3. NVIDIA Nano
//   4. Groq llama-3.3-70b
//
// The structured JSON output feeds directly into Nemotron's code generation prompt.
// ─────────────────────────────────────────────────────────────────────────────

/** Build the structured research brief prompt for any Gemini/LLM call. */
function buildResearchPrompt(topic: string, params: Record<string, number>): string {
  return `You are a world-class technical illustrator and 3D modeller.
Research "${topic}" thoroughly — look up reference images, engineering diagrams, real product specifications, and existing 3D model breakdowns.

Produce an EXHAUSTIVE structural brief that a Three.js developer will use to build a pixel-accurate 3D model.
Every measurement should be grounded in real-world proportions you found.

Output ONLY a valid JSON object (no markdown, no explanation) with ALL of the following fields:

{
  "overallShape": "<one-sentence silhouette description based on real references>",
  "realWorldDimensions": "<actual size, e.g. 'standard tennis racket: 68.5 cm long, 29 cm wide head'>",
  "boundingBox": { "widthRatio": <number>, "heightRatio": 1.0, "depthRatio": <number> },
  "coordinateOrigin": "<where [0,0,0] should be placed — e.g. 'butt of handle at y=0, object stands up along Y-axis'>",

  "parts": [
    {
      "name": "<exact part name from real engineering diagrams>",
      "count": <integer — how many of this part exist>,
      "shape": "<box|cylinder|sphere|torus|cone|capsule|lathe|loop-of-boxes>",
      "realDimensions": "<actual size in cm or mm from specs>",
      "relativePosition": "<position relative to origin in Three.js units where total height=1.0, e.g. '[0, 0.85, 0]'>",
      "rotation": "<Three.js rotation array, e.g. '[Math.PI/2, 0, 0]' or 'none'>",
      "material": "<metal|rubber|nylon|graphite|foam|leather|etc>",
      "color": "<realistic hex color>",
      "parent": "<parent part name or 'root'>"
    }
  ],

  "viewDescriptions": {
    "front": "<what you see from the front — from real photos/references>",
    "side":  "<side profile from references>",
    "top":   "<top-down view from references>"
  },

  "distinctiveFeatures": ["<at least 6 features that make this unmistakably recognizable>"],
  "commonMistakes": ["<at least 4 things naive 3D modellers get wrong about this object>"],

  "geometryRules": [
    "<at least 10 concrete Three.js geometry rules, e.g. 'Frame: torusGeometry [0.22, 0.013, 10, 60] at y=0.85, rotated [PI/2,0,0]'>",
    "<strings rule>",
    "<handle rule>",
    "..."
  ],

  "params": ${JSON.stringify(Object.keys(params))},
  "howParamsAffectVisuals": { "<param>": "<what changes visually>" },
  "animationNotes": "<what moves in real life and how to animate it in useFrame>"
}

REQUIREMENTS:
- parts[] must have at LEAST 20 entries for a complex object
- All positions must form a CONNECTED hierarchy — no floating disconnected parts
- Largest dimension = 1.0 in relative units — everything else is a fraction of that`;
}

async function runVisualResearch(topic: string, params: Record<string, number>): Promise<string> {
  const geminiKey = process.env.GOOGLE_API_KEY;

  // ── 1. Gemini 2.0 Flash + Google Search (live web research) ──────────────
  // Gemini 2.0 Flash can search the web mid-request, giving it access to real
  // product specs, engineering diagrams, and 3D model references for any topic.
  if (geminiKey) {
    try {
      const searchPrompt = `Search the web for: "${topic} dimensions specifications engineering diagram 3D model parts breakdown measurements"

Use what you find to fill out this exact structural brief for a Three.js developer.

${buildResearchPrompt(topic, params)}`;

      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tools: [{ google_search: {} }],
            contents: [{ parts: [{ text: searchPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        },
      );
      const gData = await gRes.json();
      // Gemini 2.0 with grounding concatenates all text parts
      const parts = gData?.candidates?.[0]?.content?.parts || [];
      const gTxt = parts.map((p: { text?: string }) => p.text || "").join("");
      const gm = gTxt.match(/\{[\s\S]*\}/);
      if (gm && gm[0].length > 600) {
        console.log(`[generate-scene] Research via Gemini 2.0 Flash + Google Search: ${gm[0].length} chars`);
        return gm[0];
      }
      console.warn("[generate-scene] Gemini 2.0 Flash search returned short result, falling back");
    } catch (e) {
      console.warn("[generate-scene] Gemini 2.0 Flash search error:", e);
    }
  }

  // ── 2. Gemini 1.5 Flash (training data only — no live search) ────────────
  if (geminiKey) {
    try {
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildResearchPrompt(topic, params) }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        },
      );
      const gData = await gRes.json();
      const gTxt = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const gm = gTxt.match(/\{[\s\S]*\}/);
      if (gm && gm[0].length > 500) {
        console.log(`[generate-scene] Research via Gemini 1.5 Flash: ${gm[0].length} chars`);
        return gm[0];
      }
    } catch (e) {
      console.warn("[generate-scene] Gemini 1.5 Flash research error:", e);
    }
  }

  // ── 3. NVIDIA Nano fallback ───────────────────────────────────────────────
  if (process.env.NVIDIA_API_KEY) {
    try {
      const nRes = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
          messages: [{ role: "user", content: buildResearchPrompt(topic, params) }],
          temperature: 0.1,
          max_tokens: 3000,
        }),
      });
      const nData = await nRes.json();
      const nTxt = nData?.choices?.[0]?.message?.content || "";
      const nm = nTxt.match(/\{[\s\S]*\}/);
      if (nm && nm[0].length > 400) {
        console.log(`[generate-scene] Research via NVIDIA Nano: ${nm[0].length} chars`);
        return nm[0];
      }
    } catch (e) {
      console.warn("[generate-scene] NVIDIA Nano research error:", e);
    }
  }

  // ── 4. Groq fallback (last resort) ───────────────────────────────────────
  const res = await groq.chat.completions.create({
    model: REVIEW_MODEL,
    temperature: 0.15,
    max_tokens: 3000,
    messages: [{ role: "user", content: buildResearchPrompt(topic, params) }],
  });

  const txt = res.choices?.[0]?.message?.content || "";
  const m = txt.match(/\{[\s\S]*\}/);
  const result = m ? m[0] : txt;
  console.log(`[generate-scene] Research via Groq fallback: ${result.length} chars`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — CODE GENERATION (Nemotron Ultra, streaming)
// ─────────────────────────────────────────────────────────────────────────────
function formatAccuracyHistory(history: unknown): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  const lines = history.slice(-15).map((e: { topic?: string; accurate?: boolean; simType?: string }) => {
    const ok = e.accurate ? "ACCURATE (keep this style)" : "NOT ACCURATE (avoid repeating)";
    return `- "${String(e.topic || "").slice(0, 80)}" [${String(e.simType || "")}]: user marked ${ok}`;
  });
  return `\n\n══════ USER ACCURACY FEEDBACK (from this app — respect it) ══════\n${lines.join("\n")}\nUsers want recognisable silhouettes and correct orientation (wheels vertical, gears with teeth, etc.).\n══════ END ACCURACY FEEDBACK ══════\n`;
}

async function runCodeGeneration(
  topic: string,
  simType: string,
  params: Record<string, number>,
  physicsContext: string,
  visualResearch: string,
  reviewerFeedback: string | null,
  attempt: number,
  accuracyHistory: unknown,
  sessionFeedback: string,
): Promise<string> {

  const paramLines = Object.entries(params)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n") || "  (use realistic defaults for this topic)";

  const systemMsg = `You are a world-class React Three Fiber (R3F) 3D developer. You write extraordinarily detailed, accurate, hand-crafted physics simulations — the SAME way a senior engineer writes PhysicsWindTurbine.jsx or PhysicsF1Car.jsx by hand.

${HAND_CRAFT_METHODOLOGY}

You have studied the following reference components thoroughly:

${REFERENCE}

${REFERENCE_BICYCLE_SNIPPET}

${REFERENCE_SPORTS_SNIPPET}

EXPECTATIONS:
- The reference F1 car has 40+ distinct mesh elements
- The reference tennis racket shows the CORRECT connected-parts pattern (all parts relative to one root <group>)
- You must write at least that many parts for "${topic}"
- CRITICAL: ALL parts MUST be children of a single root <group> — never scatter parts at random y-offsets
- Every param must drive at least ONE visual change
- Every moving part in real life must animate in useFrame
- Stress colours and point lights for warning/critical states
- Take your time — quality matters far more than speed
- Nemotron Ultra has strong reasoning: USE IT — plan the scene mentally, then emit code step by step`;

  const researchSection = visualResearch
    ? `\n\n══════ VISUAL RESEARCH (what "${topic}" looks like) ══════\n${visualResearch}\n══════ END RESEARCH ══════\n`
    : "";

  const feedbackSection = reviewerFeedback
    ? `\n\n══════ REVIEWER / AUDIT FEEDBACK (attempt ${attempt}) ══════\n${reviewerFeedback}\nFIX EVERY ISSUE LISTED ABOVE IN THIS NEW VERSION.\n══════ END FEEDBACK ══════\n`
    : "";

  const accSection = formatAccuracyHistory(accuracyHistory);
  const sess = sessionFeedback?.trim()
    ? `\n\nSESSION FEEDBACK:\n${sessionFeedback.trim()}\n`
    : "";

  const userMsg = `Write a COMPLETE, DETAILED React Three Fiber component for: "${topic}"
${researchSection}
${feedbackSection}
${accSection}
${sess}
PARAMS (each must drive a visual property):
${paramLines}

SIM TYPE: ${simType}
PHYSICS CONTEXT: ${physicsContext || "Physics simulation."}

══════ TWO-PHASE APPROACH — MANDATORY ══════

PHASE 1 — SCENE BLUEPRINT (write this as a JSX comment block first):
Before writing any executable code, open with a detailed comment:
/*
  SCENE BLUEPRINT: ${topic}
  ─────────────────────────────
  Bounding box: [width] × [height] × [depth] units
  Coordinate origin: [describe where 0,0,0 sits, e.g. "ground centre, object base"]

  GROUP HIERARCHY:
    root
    ├─ <groupName>  position=[x,y,z]  — <what it contains>
    │   ├─ <part>   shape=cylinder    dims=[r,h]  pos=[x,y,z]  mat=<material>
    │   └─ <part>   shape=box         dims=[w,h,d] pos=[x,y,z] mat=<material>
    └─ ...

  MATERIALS:
    primary:   color=#____  roughness=0.x  metalness=0.x
    secondary: color=#____  roughness=0.x  metalness=0.x
    accent:    color=#____  ...

  ANIMATIONS:
    - <partName>: rotate on Y at speed proportional to <param>
    - <partName>: oscillate on Z ±amp driven by <param>

  WHY THIS LOOKS LIKE A ${topic.toUpperCase()} AND NOT SOMETHING ELSE:
    - <key visual feature 1>
    - <key visual feature 2>
    - <key visual feature 3>
*/

PHASE 2 — FULL JSX CODE:
After the blueprint comment, write the complete GeneratedScene component.

══════ CODE REQUIREMENTS ══════
1. Function signature: function GeneratedScene({ params = {}, simConfig = {} }) {  (no export/import)
2. JSX is fine — auto-transformed on server via sucrase.
3. NO import statements — all globals are pre-injected (React, useFrame, useThree, THREE, Html, Line, Text, useRef, useState, useEffect, useMemo).
4. NEVER write useFrameR3F — it does not exist. Use useFrame.
5. Defensive param reading: const x = Number(params.X ?? params.x ?? DEFAULT);
6. Pull constraint thresholds from simConfig?.constraints?.find(c => c.param === "X") || {}
7. useFrame for ALL animation. No setInterval/setTimeout.
8. castShadow / receiveShadow on all major meshes.
9. Dark ground disc: <circleGeometry args={[6,64]} /> at y=0.
10. Stress colours: if (val>=critT) "#ef4444" else if (val>=warnT) "#fcd34d" else normal.
11. pointLight effects at warning/critical states.
12. MINIMUM 300 lines of code. Aim for 400+. More is always better — be relentlessly exhaustive.
13. Think carefully about 3D positions — follow your blueprint exactly.
14. Reproduce EVERY structural part listed in the visual research AND your blueprint.
15. Keep the main model centered near origin and on/above ground (avoid huge offsets that hide the object from camera).
16. Use high-contrast materials. Avoid all-dark scenes; include at least one readable light-toned material for silhouette clarity.
17. useMemo / useCallback: second argument MUST be an array ([] or [a,b]). Never undefined or null.
18. Refs used as arrays: initialise with useRef([]) OR guard every .current.forEach/.map/.filter with Array.isArray(ref.current) check.
19. Output ONLY the blueprint comment + component code. Zero markdown fences. Zero prose explanation.`;

  // Try Nemotron Ultra (streaming) first — 16k tokens so it can write a full blueprint + code
  if (process.env.NVIDIA_API_KEY) {
    try {
      const content = await streamNvidia(systemMsg, userMsg, 16000);
      if (content.length > 500) return content;
      console.warn(`[generate-scene] Nemotron Ultra attempt ${attempt}: only ${content.length} chars, retrying with Groq`);
    } catch (e) {
      console.warn("[generate-scene] Nemotron Ultra error:", e);
    }
  }

  // Groq fallback (streaming)
  return streamGroq(systemMsg, userMsg, 8000);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — CODE REVIEW
// ─────────────────────────────────────────────────────────────────────────────
async function runCodeReview(
  topic: string,
  code: string,
  visualResearch: string,
  params: Record<string, number>,
  staticIssues: string[],
): Promise<{ pass: boolean; issues: string[] }> {

  const paramKeys = Object.keys(params).join(", ");
  const researchSnippet = visualResearch.slice(0, 4000); // full research context for accurate review
  const staticBlock = staticIssues.length
    ? `\nAUTOMATED SPATIAL AUDIT (fail if any remain unfixed):\n${staticIssues.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
    : "";

  const res = await groq.chat.completions.create({
    model: REVIEW_MODEL,
    temperature: 0.1,
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are reviewing a React Three Fiber component for "${topic}".
${staticBlock}
METHODOLOGY (fail code that violates these):
${HAND_CRAFT_METHODOLOGY.slice(0, 2800)}

Visual research:
${researchSnippet}

Params that must be used: ${paramKeys}

Review the code below. Check:
1. Main structural parts from research → present as meshes?
2. All params read and used visually?
3. useFrame present for motion?
4. At least 18 <mesh> elements for a complex object?
5. Wheels vertical (rotation [PI/2,0,0]) if topic is vehicle/bicycle?
6. Gears have radial teeth if topic mentions gears?
7. useMemo/useCallback must use array deps — no undefined/null second argument?

Output ONLY JSON: { "pass": true/false, "issues": ["issue1", "issue2", ...] }
Set pass:false if ANY automated spatial audit line above is still violated OR the scene would not look like "${topic}".
Minor cosmetic issues alone → pass:true with issues listed.

CODE:
\`\`\`
${code.slice(0, 12000)}
\`\`\``,
    }],
  });

  const txt = res.choices?.[0]?.message?.content || "";
  try {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { pass?: boolean; issues?: string[] };
      const merged = [...staticIssues, ...(parsed.issues || [])];
      const pass = staticIssues.length === 0 && parsed.pass === true;
      return { pass, issues: merged };
    }
  } catch { /* fallthrough */ }

  return { pass: staticIssues.length === 0, issues: staticIssues };
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function streamNvidia(system: string, user: string, maxTokens: number): Promise<string> {
  // Large token budgets (16k) can take 2+ minutes — use a generous timeout
  const timeoutMs = maxTokens > 8000 ? 150_000 : 90_000;
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.25,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
  return collectSSE(res);
}

async function streamGroq(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: REVIEW_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.25,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  return collectSSE(res);
}

async function collectSSE(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta;
        if (delta?.content) full += delta.content;
      } catch { /* ignore */ }
    }
  }
  return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTE — SSE streaming agent loop
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { topic, simType, params, physicsContext, feedback, accuracyHistory } = body;
  if (!topic) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", error: "topic required" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const safeParams   = params || {};
  const sessionFeedback = typeof feedback === "string" ? feedback : "";
  const accHist      = Array.isArray(accuracyHistory) ? accuracyHistory : [];
  const safeSimType  = simType || "custom";
  const safeCtx      = physicsContext || "";
  const enc          = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // ── Research ──────────────────────────────────────────────────────────
        send({ event: "step", tool: "research", status: "running", label: "Studying the topic…" });
        let visualResearch = "";
        try {
          visualResearch = await runVisualResearch(topic, safeParams);
          send({ event: "step", tool: "research", status: "pass", label: "Topic researched" });
        } catch {
          send({ event: "step", tool: "research", status: "warn", label: "Research skipped" });
        }

        // ── Initial generation ────────────────────────────────────────────────
        send({ event: "step", tool: "generate", status: "running", turn: 1, label: "Writing 3D component…" });
        let rawCode = await runCodeGeneration(
          topic, safeSimType, safeParams, safeCtx,
          visualResearch, null, 1, accHist, sessionFeedback,
        );
        send({ event: "step", tool: "generate", status: "pass", turn: 1, label: "Component written" });

        // ── Agent tool-chain loop ─────────────────────────────────────────────
        let finalCode        = "";
        let finalTransformed = "";

        for (let turn = 1; turn <= MAX_AGENT_TURNS; turn++) {
          const allIssues: string[] = [];

          // ── Tool 1: strip ─────────────────────────────────────────────────
          send({ event: "step", tool: "strip", status: "running", turn, label: "Checking structure…" });
          const { code, issues: stripIssues } = toolStrip(rawCode);
          if (stripIssues.length) {
            send({ event: "step", tool: "strip", status: "fail", turn, issues: stripIssues, label: "Structure invalid" });
            allIssues.push(...stripIssues);
          } else {
            send({ event: "step", tool: "strip", status: "pass", turn, label: "Structure OK" });

            // ── Tool 2: audit ────────────────────────────────────────────────
            send({ event: "step", tool: "audit", status: "running", turn, label: "Auditing geometry & hooks…" });
            const auditIssues = [...staticGeometryAudit(code, topic), ...staticRuntimeAudit(code), ...sanitizerAudit(code)];
            if (auditIssues.length) {
              send({ event: "step", tool: "audit", status: "fail", turn, issues: auditIssues, label: `${auditIssues.length} issue(s) found` });
              allIssues.push(...auditIssues);
            } else {
              send({ event: "step", tool: "audit", status: "pass", turn, label: "Geometry & hooks OK" });
            }

            // ── Tool 3: transform ────────────────────────────────────────────
            send({ event: "step", tool: "transform", status: "running", turn, label: "Transforming JSX → JS…" });
            const { transformed, issues: txIssues } = toolTransform(code);
            if (txIssues.length) {
              send({ event: "step", tool: "transform", status: "fail", turn, issues: txIssues, label: "JSX syntax error" });
              allIssues.push(...txIssues);
            } else {
              send({ event: "step", tool: "transform", status: "pass", turn, label: "JSX transformed" });

              // ── Tool 4: compile ────────────────────────────────────────────
              send({ event: "step", tool: "compile", status: "running", turn, label: "Compile check (Node)…" });
              const { issues: compileIssues } = toolCompile(transformed!);
              if (compileIssues.length) {
                send({ event: "step", tool: "compile", status: "fail", turn, issues: compileIssues, label: "Compile error" });
                allIssues.push(...compileIssues);
              } else {
                send({ event: "step", tool: "compile", status: "pass", turn, label: "Compiles successfully" });

                // ── Tool 5: review ─────────────────────────────────────────
                // On the last turn: if compile passed, accept without extra API call.
                const isLastTurn = turn === MAX_AGENT_TURNS;
                if (!isLastTurn) {
                  send({ event: "step", tool: "review", status: "running", turn, label: "LLM quality review…" });
                  const review = await runCodeReview(topic, code, visualResearch, safeParams, auditIssues);
                  if (review.pass && allIssues.length === 0) {
                    send({ event: "step", tool: "review", status: "pass", turn, label: "Quality approved ✓" });
                    finalCode        = code;
                    finalTransformed = transformed!;
                    break;
                  } else {
                    send({ event: "step", tool: "review", status: "warn", turn, issues: review.issues, label: `${review.issues.length} quality issue(s)` });
                    // Only block on hard failures (structural/spatial issues from static audit +
                    // reviewer hard-fails). Pure reviewer suggestions don't block on the last rewrite turn.
                    if (!review.pass || auditIssues.length > 0) {
                      allIssues.push(...review.issues);
                    }
                  }
                } else {
                  // Last turn — compile passed so always accept. Downgrade any remaining
                  // quality issues to warnings so the user always gets a result.
                  if (allIssues.length === 0) {
                    send({ event: "step", tool: "review", status: "pass", turn, label: "Accepted ✓" });
                  } else {
                    send({
                      event: "step",
                      tool: "review",
                      status: "warn",
                      turn,
                      issues: allIssues,
                      label: `Accepted with ${allIssues.length} minor note(s)`,
                    });
                  }
                  finalCode        = code;
                  finalTransformed = transformed!;
                  break;
                }
              }
            }
          }

          // Last turn with no clean result — return error (do not ship low-quality scene)
          if (turn === MAX_AGENT_TURNS) {
            break;
          }

          // ── Fix: regenerate with consolidated feedback ────────────────────
          const feedbackText = allIssues.map((iss, n) => `${n + 1}. ${iss}`).join("\n");
          send({ event: "step", tool: "fix", status: "running", turn, label: `Rewriting — fixing ${allIssues.length} issue(s)…` });
          rawCode = await runCodeGeneration(
            topic, safeSimType, safeParams, safeCtx,
            visualResearch, feedbackText, turn + 1, accHist, sessionFeedback,
          );
          send({ event: "step", tool: "fix", status: "pass", turn, label: "Code rewritten" });
        }

        // ── Done ─────────────────────────────────────────────────────────────
        if (!finalCode || !finalTransformed) {
          send({ event: "error", error: "Could not produce a valid GeneratedScene after all agent turns." });
        } else {
          send({ event: "complete", code: finalTransformed, rawCode: finalCode });
        }
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? String(e);
        console.error("[generate-scene]", msg);
        send({ event: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
