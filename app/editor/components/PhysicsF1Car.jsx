"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsF1Car({ params = {}, simConfig }) {
  const wheelFL = useRef();
  const wheelFR = useRef();
  const wheelRL = useRef();
  const wheelRR = useRef();
  const rearWingRef = useRef();
  const frontWingRef = useRef();
  const exhaustGlowRef = useRef();

  const speed       = Number(params.Speed          ?? params.speed          ?? 200);
  const downforce   = Number(params.Downforce       ?? params.downforce       ?? 3000);
  const wingAngle   = Number(params.Rear_Wing_Angle ?? params.rear_wing_angle ?? 12);
  const tirePsi     = Number(params.Tire_Pressure   ?? params.tire_pressure   ?? 24);
  const ersLevel    = Number(params.ERS_Deployment  ?? params.ers_deployment  ?? 50);
  const fuelLoad    = Number(params.Fuel_Load       ?? params.fuel_load       ?? 80);

  // Pull thresholds from simConfig
  const speedC = simConfig?.constraints?.find((c) => c.param === "Speed") || {};
  const warnT  = speedC.warningThreshold  ?? 320;
  const critT  = speedC.criticalThreshold ?? 360;
  const isCritical = speed >= critT;
  const isWarning  = !isCritical && speed >= warnT;

  const tireC = simConfig?.constraints?.find((c) => c.param === "Tire_Pressure") || {};
  const tireWarn = tireC.warningThreshold ?? 30;
  const tireCrit = tireC.criticalThreshold ?? 35;
  const tireOver = tirePsi >= tireCrit;
  const tireWarn_ = !tireOver && tirePsi >= tireWarn;

  const wheelRPM = Math.max(0, speed / 10);

  useFrame((state, delta) => {
    const rot = wheelRPM * delta * 0.5;
    [wheelFL, wheelFR, wheelRL, wheelRR].forEach((r) => {
      if (r.current) r.current.rotation.x += rot;
    });

    // DRS: wing flattens at high speed
    if (rearWingRef.current) {
      const targetAngle = speed > 310 ? -0.05 : wingAngle * (Math.PI / 180);
      rearWingRef.current.rotation.x = THREE.MathUtils.lerp(
        rearWingRef.current.rotation.x,
        targetAngle,
        delta * 2,
      );
    }

    // Front wing flexes with downforce
    if (frontWingRef.current) {
      const flex = Math.min(0.12, downforce / 50000);
      frontWingRef.current.position.y = 0.06 - flex;
    }

    // Exhaust glow pulses with ERS
    if (exhaustGlowRef.current) {
      const t = state.clock.elapsedTime;
      exhaustGlowRef.current.intensity =
        (ersLevel / 100) * (1.8 + Math.sin(t * 8) * 0.4);
    }
  });

  // Colours
  const livery     = isCritical ? "#dc2626" : "#e2e8f0"; // white livery → red on failure
  const accent     = "#dc2626"; // red accent (Ferrari/generic)
  const carbon     = "#1e293b";
  const tireCol    = tireOver ? "#fca5a5" : tireWarn_ ? "#fcd34d" : "#111827";
  const rimCol     = "#94a3b8";

  // Helper: Wheel group (cylinder tyre + rim + hub)
  function Wheel({ fwd, ref: wRef }) {
    const tyreR  = fwd ? 0.33 : 0.38;
    const tyreW  = fwd ? 0.40 : 0.50;
    const rimR   = tyreR * 0.56;
    return (
      <group ref={wRef}>
        {/* Tyre */}
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[tyreR, tyreR, tyreW, 40]} />
          <meshStandardMaterial color={tireCol} roughness={0.95} metalness={0} />
        </mesh>
        {/* Rim */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[rimR, rimR, tyreW + 0.02, 20]} />
          <meshStandardMaterial color={rimCol} metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Brake disc glow when critical */}
        {isCritical && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[rimR * 0.7, rimR * 0.7, tyreW * 0.3, 16]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.2} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group>
      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ── FLOOR / UNDERTRAY ── */}
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.9, 0.06, 2.1]} />
        <meshStandardMaterial color={carbon} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* ── MONOCOQUE TUB ── */}
      <mesh position={[0.35, 0.33, 0]} castShadow>
        <boxGeometry args={[3.0, 0.46, 1.42]} />
        <meshStandardMaterial color={livery} metalness={0.45} roughness={0.28} />
      </mesh>
      {/* Upper body (narrower at rear) */}
      <mesh position={[0.4, 0.54, 0]} castShadow>
        <boxGeometry args={[2.2, 0.20, 0.96]} />
        <meshStandardMaterial color={livery} metalness={0.4} roughness={0.28} />
      </mesh>

      {/* ── NOSE CONE ── */}
      {/* Nose step (the raised central section) */}
      <mesh position={[2.25, 0.32, 0]} castShadow>
        <boxGeometry args={[0.7, 0.26, 0.52]} />
        <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Pointed nose tip */}
      <mesh position={[2.82, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <coneGeometry args={[0.13, 0.85, 14]} />
        <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.25} />
      </mesh>

      {/* ── SIDEPODS ── */}
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh position={[-0.15, 0.28, side * 0.92]} castShadow>
            <boxGeometry args={[2.4, 0.38, 0.52]} />
            <meshStandardMaterial color={accent} metalness={0.4} roughness={0.38} />
          </mesh>
          {/* Sidepod air intake (front opening) */}
          <mesh position={[1.05, 0.32, side * 0.98]}>
            <boxGeometry args={[0.14, 0.26, 0.08]} />
            <meshStandardMaterial color="#020617" roughness={1} />
          </mesh>
          {/* Bargeboard / turning vane */}
          <mesh position={[1.2, 0.22, side * 0.72]} rotation={[0, side * 0.25, 0]} castShadow>
            <boxGeometry args={[0.35, 0.22, 0.03]} />
            <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* ── COCKPIT ── */}
      <mesh position={[0.18, 0.60, 0]} castShadow>
        <boxGeometry args={[0.85, 0.3, 0.60]} />
        <meshStandardMaterial color={carbon} metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Halo arch */}
      <mesh position={[0.18, 0.88, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.40, 0.034, 10, 22, Math.PI]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Halo centre pillar */}
      <mesh position={[0.42, 0.71, 0]} castShadow>
        <cylinderGeometry args={[0.038, 0.038, 0.34, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Driver helmet */}
      <mesh position={[0.1, 0.97, 0]} castShadow>
        <sphereGeometry args={[0.20, 20, 16]} />
        <meshStandardMaterial color="#1d4ed8" metalness={0.25} roughness={0.45} />
      </mesh>

      {/* ── ENGINE COVER / AIRBOX ── */}
      <mesh position={[-0.5, 0.68, 0]} castShadow>
        <boxGeometry args={[1.5, 0.32, 0.74]} />
        <meshStandardMaterial color={livery} metalness={0.45} roughness={0.3} />
      </mesh>
      {/* Airbox intake scoop */}
      <mesh position={[0.1, 0.93, 0]} castShadow>
        <boxGeometry args={[0.38, 0.22, 0.28]} />
        <meshStandardMaterial color="#020617" roughness={1} />
      </mesh>

      {/* ── FRONT WING ── */}
      <group ref={frontWingRef} position={[0, 0.06, 0]}>
        {/* Main plane */}
        <mesh position={[2.52, 0, 0]} castShadow>
          <boxGeometry args={[0.58, 0.05, 2.45]} />
          <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.28} />
        </mesh>
        {/* Second flap */}
        <mesh position={[2.42, 0.10, 0]} castShadow>
          <boxGeometry args={[0.48, 0.04, 2.15]} />
          <meshStandardMaterial color={accent} metalness={0.4} roughness={0.3} />
        </mesh>
        {/* Third flap */}
        <mesh position={[2.32, 0.18, 0]} castShadow>
          <boxGeometry args={[0.38, 0.04, 1.80]} />
          <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.28} />
        </mesh>
        {/* End plates */}
        {[1.22, -1.22].map((z, i) => (
          <mesh key={i} position={[2.48, 0.10, z]} castShadow>
            <boxGeometry args={[0.65, 0.30, 0.055]} />
            <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.28} />
          </mesh>
        ))}
      </group>

      {/* ── REAR WING ── */}
      <group ref={rearWingRef} position={[-2.2, 0.88, 0]}>
        {/* Main element */}
        <mesh castShadow>
          <boxGeometry args={[0.52, 0.06, 2.0]} />
          <meshStandardMaterial
            color={carbon}
            metalness={0.5} roughness={0.28}
            emissive={isCritical ? "#7f1d1d" : "#000000"}
            emissiveIntensity={isCritical ? 0.4 : 0}
          />
        </mesh>
        {/* DRS flap */}
        <mesh position={[0, 0.13, 0]} castShadow>
          <boxGeometry args={[0.34, 0.04, 1.96]} />
          <meshStandardMaterial color={accent} metalness={0.4} roughness={0.3} />
        </mesh>
      </group>
      {/* Rear wing end plates */}
      {[1.04, -1.04].map((z, i) => (
        <mesh key={i} position={[-2.2, 0.65, z]} castShadow>
          <boxGeometry args={[0.52, 0.52, 0.055]} />
          <meshStandardMaterial color={carbon} metalness={0.5} roughness={0.28} />
        </mesh>
      ))}
      {/* Rear wing pillars */}
      {[0.52, -0.52].map((z, i) => (
        <mesh key={i} position={[-2.2, 0.52, z]} castShadow>
          <boxGeometry args={[0.07, 0.65, 0.055]} />
          <meshStandardMaterial color={carbon} metalness={0.6} roughness={0.25} />
        </mesh>
      ))}

      {/* ── DIFFUSER ── */}
      <mesh position={[-2.25, 0.14, 0]} castShadow rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.55, 0.22, 1.65]} />
        <meshStandardMaterial color={carbon} metalness={0.55} roughness={0.35} />
      </mesh>

      {/* ── WHEELS ── */}
      {/* Front Left */}
      <group position={[1.90, 0.33, 1.22]}>
        <Wheel fwd ref={wheelFL} />
      </group>
      {/* Front Right */}
      <group position={[1.90, 0.33, -1.22]}>
        <Wheel fwd ref={wheelFR} />
      </group>
      {/* Rear Left */}
      <group position={[-1.72, 0.38, 1.28]}>
        <Wheel fwd={false} ref={wheelRL} />
      </group>
      {/* Rear Right */}
      <group position={[-1.72, 0.38, -1.28]}>
        <Wheel fwd={false} ref={wheelRR} />
      </group>

      {/* ── FRONT SUSPENSION WISHBONES ── */}
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh position={[1.88, 0.44, s * 0.72]} rotation={[0, s * 0.18, 0.08]} castShadow>
            <boxGeometry args={[0.055, 0.04, 0.50]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[1.88, 0.26, s * 0.72]} rotation={[0, s * 0.18, -0.08]} castShadow>
            <boxGeometry args={[0.055, 0.04, 0.50]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* ── EXHAUST PIPES ── */}
      {[0.14, -0.14].map((z, i) => (
        <mesh key={i} position={[-1.92, 0.36, z]} rotation={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.055, 0.38, 12]} />
          <meshStandardMaterial color="#78716c" metalness={0.75} roughness={0.4} />
        </mesh>
      ))}

      {/* ── ERS / EXHAUST GLOW ── */}
      <pointLight
        ref={exhaustGlowRef}
        position={[-2.0, 0.38, 0]}
        color={isCritical ? "#ef4444" : "#f97316"}
        intensity={(ersLevel / 100) * 2}
        distance={4}
      />

      {/* Failure effects */}
      {isCritical && (
        <pointLight position={[0, 1.2, 0]} intensity={5} color="#ef4444" distance={10} />
      )}
      {isWarning && !isCritical && (
        <pointLight position={[0, 1.2, 0]} intensity={2.5} color="#f59e0b" distance={7} />
      )}
    </group>
  );
}
