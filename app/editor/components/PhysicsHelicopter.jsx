"use client";

/**
 * PhysicsHelicopter — hand-crafted R3F helicopter.
 *
 * Layout (right-side view):
 *   Nose (front, +x) → cockpit → fuselage → tail boom → tail rotor (rear, -x)
 *   Main rotor spins on top (y+).
 *
 * Physics:
 *   - Main rotor RPM drives lift; below a threshold → warning (blade flap)
 *   - Collective pitch controls blade angle → affects climb rate
 *   - Gross weight vs lift (RPM × air density × blade area) determines hover safety
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const DEG = Math.PI / 180;

export default function PhysicsHelicopter({ params = {}, simConfig }) {
  const mainRotorRef  = useRef();
  const tailRotorRef  = useRef();
  const blade1Ref     = useRef();
  const blade2Ref     = useRef();
  const blade3Ref     = useRef();
  const blade4Ref     = useRef();
  const hullRef       = useRef();
  const exhaustRef    = useRef();

  // ── Parameters ──────────────────────────────────────────────────────────────
  const rpm          = Number(params.Main_Rotor_RPM    ?? params.main_rotor_rpm    ?? 300);
  const pitch        = Number(params.Collective_Pitch  ?? params.collective_pitch  ?? 10);
  const airDensity   = Number(params.Air_Density       ?? params.air_density       ?? 1.225);
  const grossWeight  = Number(params.Gross_Weight      ?? params.gross_weight      ?? 3000);
  const tailRPM      = Number(params.Tail_Rotor_RPM    ?? params.tail_rotor_rpm    ?? 1800);

  // ── Constraint thresholds ────────────────────────────────────────────────────
  const rpmC   = simConfig?.constraints?.find((c) => c.param === "Main_Rotor_RPM") || {};
  const warnT  = rpmC.warningThreshold  ?? 400;
  const critT  = rpmC.criticalThreshold ?? 500;
  const isCritical = rpm >= critT;
  const isWarning  = !isCritical && rpm >= warnT;

  const weightC     = simConfig?.constraints?.find((c) => c.param === "Gross_Weight") || {};
  const weightCrit  = weightC.criticalThreshold ?? 4500;
  const weightOver  = grossWeight >= weightCrit;

  // ── Derived visuals ──────────────────────────────────────────────────────────
  // Lift margin: ratio of generated lift to weight (simplified)
  const liftForce    = rpm * airDensity * 0.012 * Math.sin(Math.max(0, pitch) * DEG + 0.1);
  const liftShortfall = grossWeight > liftForce;

  const bodyCol      = isCritical || weightOver ? "#dc2626" : "#4a5568";
  const bladeCol     = isCritical ? "#fca5a5" : isWarning ? "#fcd34d" : "#cbd5e1";
  const cockpitCol   = "#93c5fd"; // blue-tinted glass

  // ── Animation ────────────────────────────────────────────────────────────────
  const wobbleRef = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Main rotor — angular velocity from RPM
    if (mainRotorRef.current) {
      mainRotorRef.current.rotation.y += (rpm / 60) * Math.PI * 2 * delta;
    }

    // Tail rotor spins ~6x main rotor angular velocity
    if (tailRotorRef.current) {
      tailRotorRef.current.rotation.x += (tailRPM / 60) * Math.PI * 2 * delta;
    }

    // Blade flap at high RPM (centrifugal stress)
    const bladeRefs = [blade1Ref, blade2Ref, blade3Ref, blade4Ref];
    bladeRefs.forEach((r, i) => {
      if (!r.current) return;
      const flapAngle = isCritical
        ? Math.sin(t * 25 + i * Math.PI / 2) * 0.18  // violent flap
        : isWarning
        ? Math.sin(t * 12 + i * Math.PI / 2) * 0.06  // mild flap
        : 0;
      r.current.rotation.z = flapAngle;
    });

    // Fuselage hover oscillation (light bob when liftShortfall)
    if (hullRef.current) {
      const bob = liftShortfall ? Math.sin(t * 3) * 0.04 : Math.sin(t * 1.2) * 0.012;
      hullRef.current.position.y = 0.9 + bob;
    }

    // Engine exhaust glow pulses
    if (exhaustRef.current) {
      exhaustRef.current.intensity = 0.6 + Math.sin(t * 8) * 0.2;
    }
  });

  // Rotor blade geometry: each blade is a long flat box with slight sweep
  // 4 blades, arranged 90° apart in the horizontal plane
  const BLADE_LEN  = 4.4;
  const BLADE_W    = 0.28;
  const BLADE_THICK = 0.055;

  // Pitch angle from collective pitch param → blade angle
  const bladeAngle = Math.min(25, Math.max(0, pitch)) * DEG;

  return (
    <group>
      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ══════════════════════ SKIDS ══════════════════════ */}
      {/* Two landing skids running front-to-back */}
      {[0.75, -0.75].map((z, i) => (
        <group key={i}>
          {/* Skid tube */}
          <mesh position={[0, 0.18, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 3.8, 12]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Forward strut */}
          <mesh position={[0.85, 0.52, z]} rotation={[0, 0, 0.45]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.80, 10]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Rear strut */}
          <mesh position={[-0.7, 0.52, z]} rotation={[0, 0, -0.38]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.72, 10]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* ══════════════════════ MAIN HULL ══════════════════════ */}
      <group ref={hullRef} position={[0, 0.9, 0]}>

        {/* ── Fuselage main body ── */}
        <mesh castShadow>
          <capsuleGeometry args={[0.68, 1.80, 12, 24]} />
          <meshStandardMaterial
            color={bodyCol}
            metalness={0.4}
            roughness={0.45}
            emissive={isCritical ? "#7f1d1d" : "#000000"}
            emissiveIntensity={isCritical ? 0.3 : 0}
          />
        </mesh>

        {/* ── Cockpit bubble (glass) ── */}
        <mesh position={[1.0, 0.12, 0]} castShadow>
          <sphereGeometry args={[0.65, 24, 18]} />
          <meshPhysicalMaterial
            color={cockpitCol}
            metalness={0}
            roughness={0}
            transmission={0.55}
            transparent
            opacity={0.65}
          />
        </mesh>

        {/* Cockpit frame pillars */}
        {[-0.3, 0.3].map((z, i) => (
          <mesh key={i} position={[0.65, 0.38, z]} rotation={[0, 0, 0.35]} castShadow>
            <boxGeometry args={[0.04, 0.55, 0.04]} />
            <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}

        {/* ── Nose / chin ── */}
        <mesh position={[1.45, -0.18, 0]} castShadow>
          <sphereGeometry args={[0.32, 16, 14]} />
          <meshStandardMaterial color={bodyCol} metalness={0.35} roughness={0.5} />
        </mesh>

        {/* ── Engine intake (top of fuselage behind rotor mast) ── */}
        <mesh position={[0.1, 0.72, 0]} castShadow>
          <boxGeometry args={[0.42, 0.28, 0.38]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
        <mesh position={[0.1, 0.72, 0]}>
          <boxGeometry args={[0.32, 0.22, 0.32]} />
          <meshStandardMaterial color="#020617" roughness={1} />
        </mesh>

        {/* ── Exhaust ── */}
        <mesh position={[-0.12, 0.8, 0.28]} rotation={[0.4, 0, 0.3]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 0.30, 10]} />
          <meshStandardMaterial color="#78716c" metalness={0.7} roughness={0.4} />
        </mesh>
        <pointLight
          ref={exhaustRef}
          position={[-0.12, 0.95, 0.28]}
          color="#f97316"
          intensity={0.7}
          distance={1.8}
        />

        {/* ── Side doors / windows ── */}
        {[1, -1].map((s, i) => (
          <mesh key={i} position={[0.3, 0.05, s * 0.70]} castShadow>
            <boxGeometry args={[0.85, 0.55, 0.04]} />
            <meshPhysicalMaterial
              color="#bfdbfe"
              transmission={0.4}
              transparent
              opacity={0.5}
              roughness={0.05}
            />
          </mesh>
        ))}

        {/* ── Tail boom ── (long tube going backward) */}
        <mesh position={[-1.80, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.20, 0.30, 2.60, 16]} />
          <meshStandardMaterial color={bodyCol} metalness={0.4} roughness={0.45} />
        </mesh>

        {/* Tail boom end */}
        <mesh position={[-3.10, 0.05, 0]} castShadow>
          <sphereGeometry args={[0.20, 14, 12]} />
          <meshStandardMaterial color={bodyCol} metalness={0.4} roughness={0.45} />
        </mesh>

        {/* ── Horizontal stabiliser ── */}
        {[1, -1].map((s, i) => (
          <mesh key={i} position={[-2.75, 0.15, s * 0.65]} rotation={[0, s * 0.05, 0]} castShadow>
            <boxGeometry args={[0.55, 0.05, 0.70]} />
            <meshStandardMaterial color={bodyCol} metalness={0.3} roughness={0.5} />
          </mesh>
        ))}

        {/* ── Vertical tail fin ── */}
        <mesh position={[-2.80, 0.50, 0]} castShadow>
          <boxGeometry args={[0.48, 0.80, 0.05]} />
          <meshStandardMaterial color={bodyCol} metalness={0.35} roughness={0.45} />
        </mesh>

        {/* ── Tail rotor ── */}
        <group ref={tailRotorRef} position={[-3.08, 0.22, 0.24]}>
          {[0, 1, 2].map((i) => {
            const ang = (i / 3) * Math.PI * 2;
            return (
              <mesh key={i} position={[0, Math.cos(ang) * 0.42, Math.sin(ang) * 0.42]} rotation={[ang, 0, 0]} castShadow>
                <boxGeometry args={[0.06, 0.80, 0.10]} />
                <meshStandardMaterial color={bladeCol} roughness={0.4} />
              </mesh>
            );
          })}
          {/* Tail rotor hub */}
          <mesh>
            <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* ══════════════════════ MAIN ROTOR ASSEMBLY ══════════════════════ */}

        {/* Rotor mast */}
        <mesh position={[0, 1.02, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 0.55, 14]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Rotor hub */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 0.18, 16]} />
          <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.25} />
        </mesh>

        {/* ── Spinning rotor group ── */}
        <group ref={mainRotorRef} position={[0, 1.40, 0]}>

          {/* 4 blades: long flat boxes with collective pitch angle */}
          {[0, 1, 2, 3].map((i) => {
            const azimuth = (i / 4) * Math.PI * 2;
            const bladeRef = [blade1Ref, blade2Ref, blade3Ref, blade4Ref][i];
            return (
              <group key={i} rotation={[0, azimuth, 0]}>
                {/* Pitch hinge */}
                <group rotation={[bladeAngle, 0, 0]}>
                  <mesh ref={bladeRef} position={[0, 0, BLADE_LEN / 2 + 0.2]} castShadow>
                    <boxGeometry args={[BLADE_W, BLADE_THICK, BLADE_LEN]} />
                    <meshStandardMaterial
                      color={bladeCol}
                      metalness={0.3}
                      roughness={0.38}
                      emissive={isCritical ? "#991b1b" : "#000000"}
                      emissiveIntensity={isCritical ? 0.25 : 0}
                    />
                  </mesh>
                  {/* Blade tip */}
                  <mesh position={[0, 0, BLADE_LEN + 0.22]} castShadow>
                    <boxGeometry args={[BLADE_W * 0.55, BLADE_THICK, 0.28]} />
                    <meshStandardMaterial color={bladeCol} roughness={0.4} />
                  </mesh>
                </group>
              </group>
            );
          })}

          {/* Swashplate (visible mechanical detail) */}
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.06, 20]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

      </group>{/* end hullRef group */}

      {/* ══════════════════════ STRESS / FAILURE LIGHTS ══════════════════════ */}
      {isCritical && (
        <pointLight position={[0, 3, 0]} intensity={6} color="#ef4444" distance={12} />
      )}
      {isWarning && !isCritical && (
        <pointLight position={[0, 3, 0]} intensity={3} color="#f59e0b" distance={8} />
      )}
      {weightOver && !isCritical && (
        <pointLight position={[0, 1.5, 0]} intensity={2.5} color="#dc2626" distance={7} />
      )}
    </group>
  );
}
