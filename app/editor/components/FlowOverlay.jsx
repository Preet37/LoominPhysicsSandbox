"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/**
 * Parameter-driven physics overlay for generated meshes.
 *
 * A generated mesh is baked — no slider can move a wheelbase. But the physics a
 * student needs to see is not the shape, it is what the shape does to the air
 * and what forces act on it. So the mesh stays fixed and the simulation is
 * drawn around it. Nothing here re-generates anything, so dragging a slider is
 * instant and free.
 *
 * Parameters are matched by name rather than against a fixed schema, because
 * every topic arrives with its own set — an aircraft has airspeed and angle of
 * attack, an F1 car has speed and rear wing angle, and both should just work.
 */

const SPEED_RE = /speed|velocity|airspeed|flow|rpm|wind/i;
const ANGLE_RE = /angle|attack|pitch|tilt|flap|incidence/i;
const FORCE_RE = /force|thrust|downforce|lift|drag/i;

/** Direction each force points, in scene space, and the colour that reads it. */
const FORCE_KINDS = [
  { re: /downforce/i, dir: [0, -1, 0], color: "#f472b6" },
  { re: /lift/i,      dir: [0, 1, 0],  color: "#4ade80" },
  { re: /thrust/i,    dir: [1, 0, 0],  color: "#60a5fa" },
  { re: /drag/i,      dir: [-1, 0, 0], color: "#fb923c" },
  { re: /.*/,         dir: [0, -1, 0], color: "#a78bfa" },
];

function prettyName(name) {
  return String(name).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 0..1 position of `value` within the parameter's declared range. */
function normalize(value, meta) {
  const min = Number.isFinite(meta?.min) ? meta.min : 0;
  const max = Number.isFinite(meta?.max) ? meta.max : Math.max(min + 1, Math.abs(value) * 2);
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function useClassified(params, simConfig) {
  return useMemo(() => {
    const metaByName = {};
    for (const p of simConfig?.params || []) metaByName[p.name] = p;

    const all = [];
    let speed = null;
    let angle = null;
    const forces = [];

    for (const [name, value] of Object.entries(params || {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const meta = metaByName[name] || {};
      const entry = { name, value, meta, unit: meta.unit || "" };
      all.push(entry);

      if (!speed && SPEED_RE.test(name)) speed = entry;
      else if (!angle && ANGLE_RE.test(name)) angle = entry;
      else if (FORCE_RE.test(name) && Math.abs(value) > 0) forces.push(entry);
    }

    // Two arrows is the most that stays readable around a vehicle-sized mesh.
    return { all, speed, angle, forces: forces.slice(0, 2) };
  }, [params, simConfig]);
}

/**
 * Airflow as directional streaks.
 *
 * An earlier version scattered round points through the whole volume, which
 * read as a starfield rather than as moving air. Streaks are elongated along
 * the flow axis and confined to a band around the body, so direction and speed
 * are legible without any label explaining them.
 */
function Airflow({ intensity }) {
  const linesRef = useRef();
  const COUNT = 110;
  const BOUND_X = 8;

  const { positions, speeds } = useMemo(() => {
    // Two vertices per streak.
    const positions = new Float32Array(COUNT * 6);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() * 2 - 1) * BOUND_X;
      // Hug the body's height band instead of filling the frame.
      const y = -1.2 + Math.random() * 3.8;
      const z = (Math.random() * 2 - 1) * 2.4;
      positions[i * 6]     = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + 0.5;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z;
      speeds[i] = 0.7 + Math.random() * 0.6;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, delta) => {
    const geom = linesRef.current?.geometry;
    if (!geom) return;
    const arr = geom.attributes.position.array;
    // Clamp dt so a backgrounded tab does not teleport the field on return.
    const dt = Math.min(delta, 0.05);
    const base = 3 + intensity * 26;
    // Faster air draws longer streaks — the same cue a wind tunnel photo uses.
    const streak = 0.35 + intensity * 2.2;

    for (let i = 0; i < COUNT; i++) {
      const head = i * 6;
      const tail = head + 3;
      arr[head] -= base * speeds[i] * dt;

      if (arr[head] < -BOUND_X) {
        const y = -1.2 + Math.random() * 3.8;
        const z = (Math.random() * 2 - 1) * 2.4;
        arr[head] = BOUND_X;
        arr[head + 1] = y;
        arr[head + 2] = z;
        arr[tail + 1] = y;
        arr[tail + 2] = z;
      }
      arr[tail] = arr[head] + streak;
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#7dd3fc"
        transparent
        opacity={0.16 + intensity * 0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

/**
 * A labelled force vector. The label sits beside the shaft rather than at the
 * tip: tips converge on the same point below the body, and the labels there
 * covered each other and the model's own caption.
 */
function ForceArrow({ entry, slot }) {
  const kind = FORCE_KINDS.find((k) => k.re.test(entry.name));
  const t = normalize(entry.value, entry.meta);
  // Floor the length so a parameter at the bottom of its range stays legible.
  const length = 1.0 + t * 1.9;

  const arrow = useMemo(() => {
    return new THREE.ArrowHelper(
      new THREE.Vector3(...kind.dir).normalize(),
      new THREE.Vector3(0, 0, 0),
      length,
      new THREE.Color(kind.color),
      length * 0.26,
      length * 0.16,
    );
  }, [kind.dir[0], kind.dir[1], kind.dir[2], kind.color, length]);

  // Lateral offset keeps same-direction arrows (downforce and weight both point
  // down) from drawing through one another.
  const lateral = slot * 2.3;
  const mid = [
    kind.dir[0] * length * 0.55,
    kind.dir[1] * length * 0.55,
    kind.dir[2] * length * 0.55,
  ];

  return (
    <group position={[lateral, 0, 0]}>
      <primitive object={arrow} />
      <Html position={mid} center zIndexRange={[20, 10]}>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/80 border border-white/10 whitespace-nowrap pointer-events-none">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: kind.color }}>
            {prettyName(entry.name)}
          </span>
          <span className="text-[10px] text-white font-semibold tabular-nums">
            {Math.round(entry.value).toLocaleString()}
            {entry.unit ? ` ${entry.unit}` : ""}
          </span>
        </div>
      </Html>
    </group>
  );
}

/**
 * Live readout for every numeric parameter, including the ones with no physical
 * representation on a baked mesh (tyre pressure, brake balance). Without this,
 * dragging those sliders changed nothing anywhere in the viewport and looked
 * broken; the bar makes each one visibly connected to the scene.
 */
function ParameterReadout({ entries, driven }) {
  if (!entries.length) return null;
  return (
    <Html position={[-5.0, 3.3, 0]} zIndexRange={[30, 20]}>
      <div className="flex flex-col gap-1 px-2.5 py-2 rounded-lg bg-slate-950/70 border border-white/10 backdrop-blur-sm min-w-[150px] pointer-events-none">
        {entries.map((e) => {
          const t = normalize(e.value, e.meta);
          const isDriven = driven.has(e.name);
          return (
            <div key={e.name} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                <span className={`text-[8px] uppercase tracking-wider ${isDriven ? "text-sky-300/90" : "text-white/40"}`}>
                  {prettyName(e.name)}
                </span>
                <span className="text-[9px] text-white font-semibold tabular-nums">
                  {Math.round(e.value).toLocaleString()}
                  {e.unit ? ` ${e.unit}` : ""}
                </span>
              </div>
              <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isDriven ? "bg-sky-400" : "bg-white/35"}`}
                  style={{ width: `${Math.round(t * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Html>
  );
}

export default function FlowOverlay({ params, simConfig, children }) {
  const { all, speed, angle, forces } = useClassified(params, simConfig);

  const intensity = speed ? normalize(speed.value, speed.meta) : 0;

  // Attitude is exaggerated relative to the true angle: 5° of incidence is
  // physically meaningful but invisible at this scale.
  const pitch = angle ? THREE.MathUtils.degToRad(-normalize(angle.value, angle.meta) * 18) : 0;

  const driven = useMemo(() => {
    const s = new Set();
    if (speed) s.add(speed.name);
    if (angle) s.add(angle.name);
    for (const f of forces) s.add(f.name);
    return s;
  }, [speed, angle, forces]);

  return (
    <group>
      {speed && <Airflow intensity={intensity} />}

      <group rotation={[0, 0, pitch]}>{children}</group>

      {forces.map((f, i) => (
        <ForceArrow key={f.name} entry={f} slot={i - (forces.length - 1) / 2} />
      ))}

      <ParameterReadout entries={all} driven={driven} />
    </group>
  );
}
