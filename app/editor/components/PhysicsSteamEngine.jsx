"use client";

/**
 * PhysicsSteamEngine — hand-crafted R3F steam engine.
 *
 * Layout (horizontal portable / stationary engine, viewed from the side):
 *  ← rear (firebox + boiler)          front (cylinder + flywheel) →
 *
 * Animation: realistic slider-crank mechanism — flywheel rotation drives
 * the piston via a connecting rod, just like the real physics.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsSteamEngine({ params = {}, simConfig }) {
  const flywheelRef    = useRef();
  const pistonRodRef   = useRef();
  const conRodRef      = useRef();
  const safetyRef      = useRef();
  const steamCloudRef  = useRef();
  const crankAngleRef  = useRef(0);

  // ── Parameters ──────────────────────────────────────────────────────────────
  const pistonSpeedRPM = Number(params.Piston_Speed      ?? params.piston_speed      ?? 60);
  const boilerPressure = Number(params.Boiler_Pressure   ?? params.boiler_pressure   ?? 10);
  const boilerTemp     = Number(params.Boiler_Temp       ?? params.boiler_temp       ?? 200);
  const lubricLevel    = Number(params.Lubrication_Level ?? params.lubrication_level ?? 80);

  // ── Constraint thresholds from simConfig ────────────────────────────────────
  const pressC = simConfig?.constraints?.find((c) => c.param === "Boiler_Pressure") || {};
  const warnT  = pressC.warningThreshold  ?? 14;
  const critT  = pressC.criticalThreshold ?? 18;
  const isCritical = boilerPressure >= critT;
  const isWarning  = !isCritical && boilerPressure >= warnT;

  const tempC    = simConfig?.constraints?.find((c) => c.param === "Boiler_Temp") || {};
  const tempWarn = tempC.warningThreshold  ?? 260;
  const tempCrit = tempC.criticalThreshold ?? 320;
  const tempOver = boilerTemp >= tempCrit;

  const lubWarn = lubricLevel < 30;
  const lubCrit = lubricLevel < 15;

  // ── Derived colours ──────────────────────────────────────────────────────────
  // Boiler colour responds to temperature (cool grey → warm orange-red)
  const boilerHeat = Math.min(1, Math.max(0, (boilerTemp - 100) / 250));
  const boilerR = Math.round(180 + boilerHeat * 75);
  const boilerG = Math.round(180 - boilerHeat * 100);
  const boilerB = Math.round(180 - boilerHeat * 120);
  const boilerCol = isCritical || tempOver
    ? "#dc2626"
    : isWarning
    ? "#f97316"
    : `rgb(${boilerR},${boilerG},${boilerB})`;

  const metalDark   = "#374151";
  const metalMid    = "#6b7280";
  const metalLight  = "#9ca3af";
  const brickRed    = "#7f2a2a";
  const castIronCol = lubCrit ? "#991b1b" : lubWarn ? "#b45309" : "#374151";

  // Slider-crank geometry constants
  const CRANK_R   = 0.38;   // crank throw radius
  const CONROD_L  = 1.10;   // connecting rod length
  const FLYWHEEL_X = -1.70; // x-position of flywheel centre

  // ── Animation ────────────────────────────────────────────────────────────────
  useFrame((state, delta) => {
    const angularVel = (pistonSpeedRPM / 60) * Math.PI * 2;
    crankAngleRef.current += angularVel * delta;
    const θ = crankAngleRef.current;

    // Flywheel rotation
    if (flywheelRef.current) {
      flywheelRef.current.rotation.z = θ;
    }

    // Piston x-position (slider-crank formula):
    //   x = r·cos(θ) + √(L² − r²·sin²(θ))
    const crankX = CRANK_R * Math.cos(θ);
    const underSqrt = CONROD_L ** 2 - (CRANK_R * Math.sin(θ)) ** 2;
    const pistonOffset = crankX + Math.sqrt(Math.max(0, underSqrt));
    const pistonX = FLYWHEEL_X + pistonOffset;

    if (pistonRodRef.current) {
      pistonRodRef.current.position.x = pistonX + 0.55;
    }

    // Connecting rod angle
    const sinPhi = (CRANK_R * Math.sin(θ)) / CONROD_L;
    const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));
    if (conRodRef.current) {
      const crankPinX = FLYWHEEL_X + CRANK_R * Math.cos(θ);
      const crankPinY = 0.62 + CRANK_R * Math.sin(θ);
      conRodRef.current.position.x = (crankPinX + pistonX + 0.55) / 2;
      conRodRef.current.position.y = (crankPinY + 0.62) / 2;
      conRodRef.current.rotation.z = -phi;
    }

    // Safety valve jitters at high pressure
    if (safetyRef.current) {
      if (isCritical) {
        safetyRef.current.position.y = 2.04 + Math.abs(Math.sin(state.clock.elapsedTime * 18)) * 0.06;
      } else {
        safetyRef.current.position.y = 2.04;
      }
    }

    // Steam cloud opacity at high pressure
    if (steamCloudRef.current) {
      const vis = isCritical ? 1 : isWarning ? 0.45 : 0;
      steamCloudRef.current.material.opacity =
        THREE.MathUtils.lerp(steamCloudRef.current.material.opacity, vis, delta * 3);
    }
  });

  // ── Spoke helper for flywheel ─────────────────────────────────────────────
  const SPOKE_COUNT = 6;
  const spokes = Array.from({ length: SPOKE_COUNT }, (_, i) => {
    const angle = (i / SPOKE_COUNT) * Math.PI * 2;
    return {
      x: Math.cos(angle) * (CRANK_R * 1.5),
      y: Math.sin(angle) * (CRANK_R * 1.5),
      rot: angle,
    };
  });

  return (
    <group>
      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[7, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          BEDPLATE / FOUNDATION
      ══════════════════════════════════════════════════ */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[5.4, 0.16, 1.8]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.7} />
      </mesh>
      {/* Cross ribs on bedplate */}
      {[-1.6, -0.4, 0.8, 1.8].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0]} castShadow>
          <boxGeometry args={[0.12, 0.06, 1.8]} />
          <meshStandardMaterial color="#111827" metalness={0.4} roughness={0.7} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════════════
          FIREBOX (brick red box, rear of boiler)
      ══════════════════════════════════════════════════ */}
      <mesh position={[2.15, 0.88, 0]} castShadow>
        <boxGeometry args={[0.85, 1.45, 1.55]} />
        <meshStandardMaterial color={brickRed} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Firebox door */}
      <mesh position={[2.62, 0.72, 0]} castShadow>
        <boxGeometry args={[0.06, 0.40, 0.36]} />
        <meshStandardMaterial color={metalDark} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Firebox grate glow (inside) */}
      <mesh position={[2.15, 0.42, 0]}>
        <boxGeometry args={[0.82, 0.06, 1.50]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#f97316"
          emissiveIntensity={isCritical ? 2.5 : 0.8 + (boilerTemp / 400)}
        />
      </mesh>
      <pointLight position={[2.15, 0.5, 0]} color="#f97316" intensity={isCritical ? 4 : 1.5} distance={5} />

      {/* ══════════════════════════════════════════════════
          BOILER (dominant horizontal cylinder)
      ══════════════════════════════════════════════════ */}
      <mesh position={[0.2, 1.22, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.78, 0.78, 3.90, 40]} />
        <meshStandardMaterial
          color={boilerCol}
          metalness={0.55}
          roughness={0.4}
          emissive={isCritical ? "#7f1d1d" : tempOver ? "#7c2d12" : "#000000"}
          emissiveIntensity={isCritical || tempOver ? 0.35 : 0}
        />
      </mesh>
      {/* Boiler end caps */}
      {[2.15, -1.75].map((x, i) => (
        <mesh key={i} position={[x, 1.22, 0]} castShadow>
          <sphereGeometry args={[0.78, 24, 20]} />
          <meshStandardMaterial color={boilerCol} metalness={0.55} roughness={0.4} />
        </mesh>
      ))}
      {/* Boiler rivets (decorative bands) */}
      {[-1.4, -0.6, 0.2, 1.0, 1.8].map((x, i) => (
        <mesh key={i} position={[x, 1.22, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[0.80, 0.035, 8, 36]} />
          <meshStandardMaterial color={metalDark} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════════════
          DOME (steam dome on top of boiler)
      ══════════════════════════════════════════════════ */}
      <mesh position={[0.4, 2.02, 0]} castShadow>
        <sphereGeometry args={[0.30, 20, 16]} />
        <meshStandardMaterial color={metalLight} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0.4, 1.82, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.24, 20]} />
        <meshStandardMaterial color={metalMid} metalness={0.65} roughness={0.3} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          SAFETY VALVE
      ══════════════════════════════════════════════════ */}
      <group ref={safetyRef} position={[-0.2, 2.04, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.30, 12]} />
          <meshStandardMaterial
            color={isCritical ? "#ef4444" : metalMid}
            metalness={0.7} roughness={0.3}
            emissive={isCritical ? "#dc2626" : "#000000"}
            emissiveIntensity={isCritical ? 0.8 : 0}
          />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshStandardMaterial color={isCritical ? "#ef4444" : metalDark} />
        </mesh>
      </group>

      {/* Steam cloud at safety valve (visible on overpressure) */}
      <mesh ref={steamCloudRef} position={[-0.2, 2.55, 0]}>
        <sphereGeometry args={[0.28, 12, 10]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0} roughness={1} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          CHIMNEY / SMOKESTACK
      ══════════════════════════════════════════════════ */}
      {/* Chimney base */}
      <mesh position={[1.65, 1.68, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.96, 16]} />
        <meshStandardMaterial color={metalDark} metalness={0.6} roughness={0.45} />
      </mesh>
      {/* Chimney stack */}
      <mesh position={[1.65, 2.66, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.21, 1.10, 16]} />
        <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.55} />
      </mesh>
      {/* Chimney cap / spark arrestor */}
      <mesh position={[1.65, 3.24, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.19, 0.18, 16]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.45} />
      </mesh>
      {/* Smoke glow */}
      <pointLight position={[1.65, 3.4, 0]} color="#78716c" intensity={0.6 + boilerTemp / 500} distance={3} />

      {/* ══════════════════════════════════════════════════
          WORKING CYLINDER
      ══════════════════════════════════════════════════ */}
      {/* Cylinder body */}
      <mesh position={[-0.7, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 1.40, 24]} />
        <meshStandardMaterial color={castIronCol} metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Cylinder end cover (front) */}
      <mesh position={[-1.40, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.10, 24]} />
        <meshStandardMaterial color={metalDark} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Cylinder end cover (back, steam chest) */}
      <mesh position={[-0.02, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.10, 24]} />
        <meshStandardMaterial color={metalDark} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Steam chest on top of cylinder */}
      <mesh position={[-0.70, 0.98, 0.18]} castShadow>
        <boxGeometry args={[1.10, 0.24, 0.28]} />
        <meshStandardMaterial color={metalMid} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Steam inlet pipe from boiler to steam chest */}
      <mesh position={[-0.0, 1.05, 0.18]} rotation={[0, 0, 0.4]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.55, 10]} />
        <meshStandardMaterial color={metalMid} metalness={0.65} roughness={0.4} />
      </mesh>

      {/* Crosshead guides (two parallel rails) */}
      {[-0.18, 0.18].map((z, i) => (
        <mesh key={i} position={[-1.55, 0.62, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
          <meshStandardMaterial color={metalMid} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Piston rod + crosshead (animated) */}
      <group ref={pistonRodRef} position={[-0.85, 0.62, 0]}>
        {/* Piston rod */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.70, 12]} />
          <meshStandardMaterial color={metalLight} metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Crosshead */}
        <mesh position={[-0.38, 0, 0]} castShadow>
          <boxGeometry args={[0.18, 0.22, 0.42]} />
          <meshStandardMaterial color={metalDark} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════
          CONNECTING ROD (animated via useFrame)
      ══════════════════════════════════════════════════ */}
      <mesh ref={conRodRef} position={[-1.2, 0.62, 0]} castShadow>
        <boxGeometry args={[CONROD_L, 0.08, 0.10]} />
        <meshStandardMaterial color={castIronCol} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          FLYWHEEL
      ══════════════════════════════════════════════════ */}
      <group ref={flywheelRef} position={[FLYWHEEL_X, 0.62, 0]}>
        {/* Outer rim */}
        <mesh castShadow>
          <torusGeometry args={[CRANK_R * 2.55, 0.075, 14, 56]} />
          <meshStandardMaterial color={castIronCol} metalness={0.6} roughness={0.45} />
        </mesh>
        {/* Spokes */}
        {spokes.map((s, i) => (
          <mesh key={i} position={[s.x * 0.5, s.y * 0.5, 0]} rotation={[0, 0, s.rot]} castShadow>
            <boxGeometry args={[CRANK_R * 1.55, 0.07, 0.09]} />
            <meshStandardMaterial color={castIronCol} metalness={0.6} roughness={0.45} />
          </mesh>
        ))}
        {/* Hub / boss */}
        <mesh castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.12, 16]} />
          <meshStandardMaterial color={metalMid} metalness={0.75} roughness={0.3} />
        </mesh>
        {/* Crank pin (offset from centre) */}
        <mesh position={[CRANK_R, 0, 0.05]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.14, 10]} />
          <meshStandardMaterial color={metalLight} metalness={0.85} roughness={0.15} />
        </mesh>
      </group>

      {/* Flywheel shaft bearing */}
      <mesh position={[FLYWHEEL_X, 0.62, -0.25]} castShadow>
        <cylinderGeometry args={[0.16, 0.20, 0.42, 16]} />
        <meshStandardMaterial color={metalDark} metalness={0.65} roughness={0.4} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          GOVERNOR (centrifugal speed regulator)
      ══════════════════════════════════════════════════ */}
      <mesh position={[-0.5, 1.22, -0.7]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.10, 10]} />
        <meshStandardMaterial color={metalMid} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Governor balls */}
      {[-0.1, 0.1].map((x, i) => (
        <group key={i}>
          <mesh position={[-0.5 + x * 3, 1.45, -0.7 + (i === 0 ? -0.18 : 0.18)]} castShadow>
            <sphereGeometry args={[0.085, 10, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* ══════════════════════════════════════════════════
          PRESSURE GAUGE on boiler
      ══════════════════════════════════════════════════ */}
      <mesh position={[-0.6, 2.04, 0.55]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.07, 16]} />
        <meshStandardMaterial color={metalLight} metalness={0.75} roughness={0.25} />
      </mesh>
      <mesh position={[-0.6, 2.07, 0.55]}>
        <circleGeometry args={[0.13, 16]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
      </mesh>

      {/* ══════════════════════════════════════════════════
          FRAME / SUPPORT COLUMNS
      ══════════════════════════════════════════════════ */}
      {[-0.8, 1.6].map((x, i) => (
        <mesh key={i} position={[x, 0.55, 0]} castShadow>
          <boxGeometry args={[0.12, 0.96, 1.55]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════════════
          STRESS / FAILURE EFFECTS
      ══════════════════════════════════════════════════ */}
      {isCritical && (
        <pointLight position={[0.2, 1.22, 0]} intensity={6} color="#ef4444" distance={8} />
      )}
      {isWarning && !isCritical && (
        <pointLight position={[0.2, 1.22, 0]} intensity={3} color="#f59e0b" distance={6} />
      )}
    </group>
  );
}
