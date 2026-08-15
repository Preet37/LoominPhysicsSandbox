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
 * and what forces act on it. So the mesh stays fixed and the simulation is drawn
 * around it: airflow whose speed tracks the velocity parameter, body attitude
 * driven by the angle parameter, and force vectors scaled by the force ones.
 *
 * Nothing here re-generates anything, so dragging a slider is free and instant.
 *
 * Parameters are matched by name rather than by a fixed schema, because each
 * topic arrives with its own set — an aircraft has airspeed and angle of attack,
 * an F1 car has speed and rear wing angle, and both should just work.
 */

const SPEED_RE = /speed|velocity|airspeed|flow|rpm|wind/i;
const ANGLE_RE = /angle|attack|pitch|tilt|flap|incidence/i;
const FORCE_RE = /force|thrust|downforce|lift|drag|weight|load/i;

/** Direction each kind of force points, in scene space. */
const FORCE_DIRS = {
  downforce: [0, -1, 0],
  weight:    [0, -1, 0],
  load:      [0, -1, 0],
  lift:      [0, 1, 0],
  thrust:    [1, 0, 0],
  drag:      [-1, 0, 0],
  force:     [0, -1, 0],
};

const FORCE_COLORS = {
  downforce: "#f472b6",
  weight:    "#f472b6",
  load:      "#f472b6",
  lift:      "#4ade80",
  thrust:    "#60a5fa",
  drag:      "#fb923c",
  force:     "#a78bfa",
};

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

/**
 * Classifies the live parameters once per change so the render path stays cheap.
 * First match wins per category — a topic with two speed-ish parameters drives
 * the flow from the first, rather than trying to blend them into nonsense.
 */
function useClassified(params, simConfig) {
  return useMemo(() => {
    const metaByName = {};
    for (const p of simConfig?.params || []) metaByName[p.name] = p;

    let speed = null;
    let angle = null;
    const forces = [];

    for (const [name, value] of Object.entries(params || {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const meta = metaByName[name] || {};
      const entry = { name, value, meta, unit: meta.unit || "" };

      if (!speed && SPEED_RE.test(name)) speed = entry;
      else if (!angle && ANGLE_RE.test(name)) angle = entry;
      else if (FORCE_RE.test(name) && Math.abs(value) > 0) forces.push(entry);
    }

    // More than three arrows reads as clutter rather than as information.
    return { speed, angle, forces: forces.slice(0, 3) };
  }, [params, simConfig]);
}

/**
 * Airflow as advected points. Points rather than ribbons because a few hundred
 * of them read as a field at a glance and cost nothing to update per frame.
 */
function Airflow({ intensity }) {
  const pointsRef = useRef();
  const COUNT = 420;
  const BOUND_X = 7;

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() * 2 - 1) * BOUND_X;
      positions[i * 3 + 1] = Math.random() * 4.6 - 1.4;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * 3.2;
      // Per-particle jitter stops the field pulsing as one rigid block.
      speeds[i] = 0.65 + Math.random() * 0.7;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, delta) => {
    const geom = pointsRef.current?.geometry;
    if (!geom) return;
    const arr = geom.attributes.position.array;
    // Clamp dt so a backgrounded tab does not teleport the whole field on return.
    const dt = Math.min(delta, 0.05);
    const base = 2 + intensity * 22;

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      arr[ix] -= base * speeds[i] * dt;
      if (arr[ix] < -BOUND_X) {
        arr[ix] = BOUND_X;
        arr[ix + 1] = Math.random() * 4.6 - 1.4;
        arr[ix + 2] = (Math.random() * 2 - 1) * 3.2;
      }
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        sizeAttenuation
        color="#7dd3fc"
        transparent
        opacity={0.25 + intensity * 0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * A single labelled force vector. `offset` spreads same-direction arrows apart
 * along z — downforce and fuel load both point down, and stacked on one axis
 * they drew straight through each other's labels.
 */
function ForceArrow({ entry, offset = 0 }) {
  const key = Object.keys(FORCE_DIRS).find((k) => new RegExp(k, "i").test(entry.name)) || "force";
  const dir = FORCE_DIRS[key];
  const color = FORCE_COLORS[key];
  const t = normalize(entry.value, entry.meta);

  // Floor the length so a parameter at the bottom of its range is still legible.
  const length = 1.1 + t * 2.4;

  const arrow = useMemo(() => {
    const a = new THREE.ArrowHelper(
      new THREE.Vector3(...dir).normalize(),
      new THREE.Vector3(0, 0, 0),
      length,
      new THREE.Color(color),
      length * 0.28,
      length * 0.17,
    );
    return a;
  }, [dir[0], dir[1], dir[2], color, length]);

  const tip = [dir[0] * (length + 0.5), dir[1] * (length + 0.5), dir[2] * (length + 0.5)];

  return (
    <group position={[0, 0, offset]}>
      <primitive object={arrow} />
      <Html position={tip} center>
        <div className="px-2 py-0.5 rounded-md bg-slate-900/85 border border-white/10 backdrop-blur-sm whitespace-nowrap pointer-events-none">
          <span className="text-[9px] uppercase tracking-wider" style={{ color }}>
            {prettyName(entry.name)}
          </span>
          <span className="text-[10px] text-white font-semibold ml-1.5 tabular-nums">
            {Math.round(entry.value).toLocaleString()}
            {entry.unit ? ` ${entry.unit}` : ""}
          </span>
        </div>
      </Html>
    </group>
  );
}

export default function FlowOverlay({ params, simConfig, children }) {
  const { speed, angle, forces } = useClassified(params, simConfig);

  const intensity = speed ? normalize(speed.value, speed.meta) : 0;

  // Attitude is exaggerated relative to the real angle: a 5° angle of attack is
  // physically meaningful but visually invisible at this scale.
  const pitch = angle ? THREE.MathUtils.degToRad(-normalize(angle.value, angle.meta) * 18) : 0;

  return (
    <group>
      {speed && <Airflow intensity={intensity} />}

      <group rotation={[0, 0, pitch]}>{children}</group>

      {forces.map((f, i) => (
        <ForceArrow key={f.name} entry={f} offset={(i - (forces.length - 1) / 2) * 1.6} />
      ))}

      {speed && (
        <Html position={[0, 3.7, 0]} center>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/85 border border-sky-500/25 backdrop-blur-sm whitespace-nowrap pointer-events-none">
            <span className="text-[9px] uppercase tracking-widest text-sky-300/90">
              {prettyName(speed.name)}
            </span>
            <span className="text-xs font-semibold text-white tabular-nums">
              {Math.round(speed.value).toLocaleString()}
              {speed.unit ? ` ${speed.unit}` : ""}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
