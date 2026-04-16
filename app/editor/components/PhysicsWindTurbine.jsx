"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

// Returns the constraint-based color (green / amber / red)
function stressColor(value, warn, crit) {
  if (value === undefined) return "#ffffff";
  if (value >= crit) return "#fca5a5";
  if (value >= warn) return "#fcd34d";
  return "#ffffff";
}

export default function PhysicsWindTurbine({ params = {}, simConfig }) {
  const rotorRef = useRef();

  const windSpeed   = params.Wind_Speed     ?? 12;
  const bladeCount  = Math.round(Math.max(1, params.Blade_Count ?? 3));
  const rotorDiam   = params.Rotor_Diameter ?? 80;
  const bladeLength = Math.max(2.5, Math.min(5.5, rotorDiam / 16));

  // Visual cap: show at most 10 blades on screen; physics still uses the real bladeCount
  const visibleBlades = Math.min(10, bladeCount);

  // Pull constraint thresholds from simConfig, fall back to sensible defaults
  const windC = simConfig?.constraints?.find((c) => c.param === "Wind_Speed") || {};
  const warnT = windC.warningThreshold  ?? 25;
  const critT = windC.criticalThreshold ?? 35;

  const isCritical = windSpeed >= critT;
  const isWarning  = !isCritical && windSpeed >= warnT;
  const bladeCol   = stressColor(windSpeed, warnT, critT);
  const hubCol     = isCritical ? "#ef4444" : "#f1f5f9";
  const hubEmissive = isCritical ? "#dc2626" : "#000000";

  useFrame((_, delta) => {
    if (!rotorRef.current) return;
    // RPM increases with wind speed; same physics regardless of visual cap
    const rpm = Math.max(0.3, windSpeed * 0.08);
    rotorRef.current.rotation.z += rpm * delta;

    // Wobble on critical failure (structural resonance)
    if (isCritical) {
      rotorRef.current.position.x = (Math.random() - 0.5) * 0.14;
      rotorRef.current.position.y = 8.5 + (Math.random() - 0.5) * 0.14;
    } else {
      rotorRef.current.position.x = 0;
      rotorRef.current.position.y = 8.5;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Foundation pad */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[1.0, 1.2, 0.3, 32]} />
        <meshStandardMaterial color="#4b5563" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* Tower — tapered cylinder, light grey like the original */}
      <mesh position={[0, 4.5, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.45, 8.5, 32]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Nacelle — capsule shape, horizontal, the look from the original */}
      <mesh position={[0, 8.5, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Rotor assembly — spins around Z */}
      <group position={[0, 8.5, 1.2]} ref={rotorRef}>
        {/* Hub nose cone */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.25]} castShadow>
          <coneGeometry args={[0.35, 0.5, 32]} />
          <meshStandardMaterial
            color={hubCol}
            emissive={hubEmissive}
            emissiveIntensity={isCritical ? 0.5 : 0}
            metalness={0.3}
            roughness={0.5}
          />
        </mesh>

        {/* Hub back plate */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.12, 32]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Blades — visually capped at 10, physics uses full bladeCount */}
        {Array.from({ length: visibleBlades }).map((_, i) => {
          const angle = (i / visibleBlades) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, 0, angle]}>
              {/* Main blade body */}
              <mesh position={[0, bladeLength / 2 + 0.4, 0]} castShadow>
                <boxGeometry args={[0.5, bladeLength, 0.12]} />
                <meshStandardMaterial
                  color={bladeCol}
                  roughness={0.4}
                  metalness={0.1}
                  emissive={isCritical ? "#ef4444" : "#000000"}
                  emissiveIntensity={isCritical ? 0.15 : 0}
                />
              </mesh>
              {/* Blade tip */}
              <mesh position={[0, bladeLength + 0.6, 0]} castShadow>
                <boxGeometry args={[0.3, 0.5, 0.1]} />
                <meshStandardMaterial
                  color={bladeCol}
                  roughness={0.3}
                  emissive={isCritical ? "#ef4444" : "#000000"}
                  emissiveIntensity={isCritical ? 0.15 : 0}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Stress glow at rotor */}
      {(isCritical || isWarning) && (
        <pointLight
          position={[0, 8.5, 1.2]}
          intensity={isCritical ? 3.0 : 1.5}
          color={isCritical ? "#ef4444" : "#f59e0b"}
          distance={10}
        />
      )}
    </group>
  );
}
