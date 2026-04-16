"use client";

/**
 * PhysicsMechanicalGears — hand-crafted R3F spur gear pair.
 *
 * Driver gear (left) meshes with driven gear (right).
 * Teeth are individual boxes placed radially — exact spur gear geometry.
 * Gear ratio changes the driven gear's tooth count and rotation speed.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsMechanicalGears({ params = {}, simConfig }) {
  const driverRef  = useRef();
  const drivenRef  = useRef();
  const crankRef   = useRef();

  // ── Parameters ───────────────────────────────────────────────────────────────
  const numTeeth       = Math.max(6, Math.round(Number(params.Number_of_Teeth     ?? params.number_of_teeth     ?? 20)));
  const inputTorque    = Number(params.Input_Torque      ?? params.input_torque      ?? 100);
  const lubQuality     = Number(params.Lubrication_Quality ?? params.lubrication_quality ?? 0.8);
  const toothStrength  = Number(params.Tooth_Strength    ?? params.Tooth_Material_Strength ?? params.tooth_strength ?? 500);
  const opSpeed        = Number(params.Operating_Speed   ?? params.operating_speed   ?? 1000);

  // ── Constraint thresholds ────────────────────────────────────────────────────
  const speedC  = simConfig?.constraints?.find((c) => c.param === "Operating_Speed") || {};
  const warnT   = speedC.warningThreshold  ?? 3000;
  const critT   = speedC.criticalThreshold ?? 4500;
  const isCritical = opSpeed >= critT;
  const isWarning  = !isCritical && opSpeed >= warnT;

  const strengthC   = simConfig?.constraints?.find((c) => c.param === "Tooth_Strength") || {};
  const strCrit     = strengthC.criticalThreshold ?? 200;
  const strWarn     = strengthC.warningThreshold  ?? 300;
  // Tooth strength: lower is worse
  const strLow      = toothStrength <= strCrit;
  const strMid      = !strLow && toothStrength <= strWarn;

  const lubC       = simConfig?.constraints?.find((c) => c.param === "Lubrication_Quality") || {};
  const lubCrit    = lubC.criticalThreshold ?? 0.2;
  const lubWarn    = lubC.warningThreshold  ?? 0.35;
  const lubLow     = lubQuality <= lubCrit;
  const lubMid     = !lubLow && lubQuality <= lubWarn;

  // ── Derived colours ──────────────────────────────────────────────────────────
  const gearCol   = isCritical || strLow
    ? "#dc2626" : isWarning || strMid
    ? "#f59e0b" : "#374151";
  const toothCol  = lubLow
    ? "#dc2626" : lubMid
    ? "#f59e0b" : "#4b5563";
  const shaftCol  = "#94a3b8";
  const baseCol   = "#1e293b";

  // ── Gear geometry constants ─────────────────────────────────────────────────
  const MODULE         = 0.12;    // gear module (tooth pitch / π)
  const DRIVER_R       = (numTeeth * MODULE) / 2;       // pitch radius
  const DRIVER_TEETH   = numTeeth;

  // Driven gear: always 12 teeth (for a fixed ratio display)
  // The gear ratio drives the rotation speed ratio
  const gearRatio      = Number(params.Gear_Ratio ?? params.gear_ratio ?? 2);
  const DRIVEN_TEETH   = Math.max(6, Math.round(DRIVER_TEETH / Math.max(0.2, gearRatio)));
  const DRIVEN_R       = (DRIVEN_TEETH * MODULE) / 2;

  const TOOTH_H        = MODULE * 2.2;    // addendum + dedendum
  const TOOTH_W        = MODULE * 0.9;    // tooth face width (along pitch circle)
  const GEAR_THICKNESS = 0.18;

  // Separation: driver and driven pitch circles just touch
  const SEPARATION = DRIVER_R + DRIVEN_R;
  const DRIVER_X   = -SEPARATION / 2;
  const DRIVEN_X   =  SEPARATION / 2;

  // ── Rotation speed ────────────────────────────────────────────────────────
  const angVelDriver = (opSpeed / 60) * Math.PI * 2 * 0.003; // scaled for display
  const angVelDriven = angVelDriver * (DRIVER_TEETH / DRIVEN_TEETH);

  useFrame((state, delta) => {
    if (driverRef.current) driverRef.current.rotation.z += angVelDriver * delta * 60;
    if (drivenRef.current) drivenRef.current.rotation.z -= angVelDriven * delta * 60; // opposite direction

    // Crank turns with driver
    if (crankRef.current) crankRef.current.rotation.z += angVelDriver * delta * 60;

    // Wobble on critical (misaligned shaft)
    if (isCritical && driverRef.current) {
      const t = state.clock.elapsedTime;
      driverRef.current.position.y = Math.sin(t * 25) * 0.015;
    } else if (driverRef.current) {
      driverRef.current.position.y = THREE.MathUtils.lerp(driverRef.current.position.y, 0, delta * 8);
    }
  });

  // Build tooth arrays for each gear (memoised — regenerate when tooth count changes)
  const driverTeethMeshes = useMemo(() => {
    return Array.from({ length: DRIVER_TEETH }, (_, i) => {
      const angle = (i / DRIVER_TEETH) * Math.PI * 2;
      const cx = Math.cos(angle) * (DRIVER_R + TOOTH_H * 0.5);
      const cz = Math.sin(angle) * (DRIVER_R + TOOTH_H * 0.5);
      return { angle, cx, cz };
    });
  }, [DRIVER_TEETH, DRIVER_R, TOOTH_H]);

  const drivenTeethMeshes = useMemo(() => {
    return Array.from({ length: DRIVEN_TEETH }, (_, i) => {
      const angle = (i / DRIVEN_TEETH) * Math.PI * 2;
      const cx = Math.cos(angle) * (DRIVEN_R + TOOTH_H * 0.5);
      const cz = Math.sin(angle) * (DRIVEN_R + TOOTH_H * 0.5);
      return { angle, cx, cz };
    });
  }, [DRIVEN_TEETH, DRIVEN_R, TOOTH_H]);

  // Spoke arrays (6 spokes per gear)
  const SPOKE_COUNT = 6;
  const spokes = Array.from({ length: SPOKE_COUNT }, (_, i) => ({
    angle: (i / SPOKE_COUNT) * Math.PI * 2,
  }));

  return (
    <group>
      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[7, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ══════════════════════════════════════════
          MOUNTING PLATE / GEARBOX BASE
      ══════════════════════════════════════════ */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[SEPARATION * 2.4, 0.12, GEAR_THICKNESS * 3.2]} />
        <meshStandardMaterial color={baseCol} metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Side walls of gearbox */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[0, 0.38, s * GEAR_THICKNESS * 1.7]} castShadow>
          <boxGeometry args={[SEPARATION * 2.4, 0.56, 0.055]} />
          <meshStandardMaterial color={baseCol} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════
          DRIVER GEAR (LEFT)
      ══════════════════════════════════════════ */}
      <group ref={driverRef} position={[DRIVER_X, 0.65, 0]}>
        {/* Main disc body */}
        <mesh castShadow>
          <cylinderGeometry args={[DRIVER_R * 0.98, DRIVER_R * 0.98, GEAR_THICKNESS, 48]} />
          <meshStandardMaterial
            color={gearCol}
            metalness={0.55}
            roughness={0.35}
            emissive={isCritical ? "#7f1d1d" : "#000000"}
            emissiveIntensity={isCritical ? 0.4 : 0}
          />
        </mesh>
        {/* Gear teeth */}
        {driverTeethMeshes.map((t, i) => (
          <mesh key={i} position={[t.cx, 0, t.cz]} rotation={[0, t.angle, 0]} castShadow>
            <boxGeometry args={[TOOTH_W, GEAR_THICKNESS + 0.01, TOOTH_H]} />
            <meshStandardMaterial color={toothCol} metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {/* Spokes */}
        {spokes.map((s, i) => (
          <mesh key={i}
            position={[Math.cos(s.angle) * DRIVER_R * 0.52, 0, Math.sin(s.angle) * DRIVER_R * 0.52]}
            rotation={[0, s.angle, 0]}
            castShadow
          >
            <boxGeometry args={[DRIVER_R * 0.85, GEAR_THICKNESS * 0.55, GEAR_THICKNESS * 0.25]} />
            <meshStandardMaterial color={baseCol} metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {/* Hub bore */}
        <mesh>
          <cylinderGeometry args={[DRIVER_R * 0.18, DRIVER_R * 0.18, GEAR_THICKNESS + 0.04, 20]} />
          <meshStandardMaterial color={shaftCol} metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Key slot indicator */}
        <mesh position={[0, GEAR_THICKNESS / 2 + 0.01, 0]}>
          <boxGeometry args={[DRIVER_R * 0.08, 0.02, DRIVER_R * 0.22]} />
          <meshStandardMaterial color="#020617" />
        </mesh>
      </group>

      {/* Driver shaft */}
      <mesh position={[DRIVER_X, 0.65, 0]} castShadow>
        <cylinderGeometry args={[DRIVER_R * 0.12, DRIVER_R * 0.12, GEAR_THICKNESS * 4, 16]} />
        <meshStandardMaterial color={shaftCol} metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Driver bearing housing */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[DRIVER_X, 0.65, s * GEAR_THICKNESS * 1.6]} castShadow>
          <cylinderGeometry args={[DRIVER_R * 0.26, DRIVER_R * 0.26, 0.10, 20]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════
          DRIVEN GEAR (RIGHT)
      ══════════════════════════════════════════ */}
      <group ref={drivenRef} position={[DRIVEN_X, 0.65, 0]}>
        {/* Main disc */}
        <mesh castShadow>
          <cylinderGeometry args={[DRIVEN_R * 0.98, DRIVEN_R * 0.98, GEAR_THICKNESS, 48]} />
          <meshStandardMaterial color={gearCol} metalness={0.55} roughness={0.35} />
        </mesh>
        {/* Gear teeth */}
        {drivenTeethMeshes.map((t, i) => (
          <mesh key={i} position={[t.cx, 0, t.cz]} rotation={[0, t.angle, 0]} castShadow>
            <boxGeometry args={[TOOTH_W, GEAR_THICKNESS + 0.01, TOOTH_H]} />
            <meshStandardMaterial color={toothCol} metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {/* Spokes (fewer for smaller gear) */}
        {Array.from({ length: Math.max(3, SPOKE_COUNT - 2) }, (_, i) => {
          const a = (i / (SPOKE_COUNT - 2)) * Math.PI * 2;
          return (
            <mesh key={i}
              position={[Math.cos(a) * DRIVEN_R * 0.52, 0, Math.sin(a) * DRIVEN_R * 0.52]}
              rotation={[0, a, 0]}
              castShadow
            >
              <boxGeometry args={[DRIVEN_R * 0.85, GEAR_THICKNESS * 0.55, GEAR_THICKNESS * 0.25]} />
              <meshStandardMaterial color={baseCol} metalness={0.4} roughness={0.5} />
            </mesh>
          );
        })}
        {/* Hub */}
        <mesh>
          <cylinderGeometry args={[DRIVEN_R * 0.22, DRIVEN_R * 0.22, GEAR_THICKNESS + 0.04, 20]} />
          <meshStandardMaterial color={shaftCol} metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* Driven shaft */}
      <mesh position={[DRIVEN_X, 0.65, 0]} castShadow>
        <cylinderGeometry args={[DRIVEN_R * 0.14, DRIVEN_R * 0.14, GEAR_THICKNESS * 4, 16]} />
        <meshStandardMaterial color={shaftCol} metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Driven bearing housing */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[DRIVEN_X, 0.65, s * GEAR_THICKNESS * 1.6]} castShadow>
          <cylinderGeometry args={[DRIVEN_R * 0.30, DRIVEN_R * 0.30, 0.10, 20]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════
          INPUT CRANK / HANDLE on driver
      ══════════════════════════════════════════ */}
      <group ref={crankRef} position={[DRIVER_X, 0.65, -GEAR_THICKNESS * 1.8]}>
        {/* Crank arm */}
        <mesh position={[DRIVER_R * 0.6, 0, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[DRIVER_R * 1.2, 0.055, 0.055]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Crank pin */}
        <mesh position={[DRIVER_R * 1.2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.22, 12]} />
          <meshStandardMaterial color={shaftCol} metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════
          TOOTH CONTACT POINT GLOW
      ══════════════════════════════════════════ */}
      <pointLight
        position={[0, 0.65, 0]}
        color={isCritical ? "#ef4444" : lubLow ? "#f97316" : "#fbbf24"}
        intensity={isCritical ? 3 : lubLow ? 1.5 : 0.3}
        distance={2.5}
      />

      {/* ══════════════════════════════════════════
          LABELS / FAILURE GLOW
      ══════════════════════════════════════════ */}
      {isCritical && (
        <pointLight position={[0, 1.2, 0]} intensity={6} color="#ef4444" distance={9} />
      )}
      {isWarning && !isCritical && (
        <pointLight position={[0, 1.2, 0]} intensity={3} color="#f59e0b" distance={6} />
      )}
    </group>
  );
}
