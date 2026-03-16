"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function stressColor(value, warnThreshold, critThreshold) {
  if (value === undefined || warnThreshold === undefined) return new THREE.Color("#10b981");
  const ratio = Math.max(0, Math.min(1, (value - 0) / (critThreshold || 40)));
  if (ratio < 0.6) return new THREE.Color("#10b981");
  if (ratio < 0.85) return new THREE.Color("#f59e0b");
  return new THREE.Color("#ef4444");
}

function getConstraint(simConfig, paramName) {
  return simConfig?.constraints?.find((c) => c.param === paramName) || {};
}

export default function PhysicsWindTurbine({ params = {}, simConfig }) {
  const rotorRef = useRef();

  const windSpeed = params.Wind_Speed ?? 12;
  const bladeCount = Math.round(Math.max(1, Math.min(6, params.Blade_Count ?? 3)));
  const bladePitch = (params.Blade_Pitch ?? 12) * (Math.PI / 180);
  const rotorDiam = params.Rotor_Diameter ?? 80;
  const bladeLength = Math.max(1.5, Math.min(5, rotorDiam / 20));

  const windConstraint = getConstraint(simConfig, "Wind_Speed");
  const bladeColor = stressColor(windSpeed, windConstraint.warningThreshold, windConstraint.criticalThreshold);
  const hubGlowIntensity = windSpeed > (windConstraint.criticalThreshold || 35) ? 2.5 : windSpeed > (windConstraint.warningThreshold || 25) ? 1.2 : 0.4;
  const hubGlowColor = windSpeed > (windConstraint.criticalThreshold || 35) ? "#ef4444" : windSpeed > (windConstraint.warningThreshold || 25) ? "#f59e0b" : "#10b981";

  useFrame((_, delta) => {
    if (rotorRef.current) {
      const angularVelocity = Math.max(0, windSpeed) * 0.12;
      rotorRef.current.rotation.z += angularVelocity * delta;
    }
  });

  const blades = Array.from({ length: bladeCount }, (_, i) => {
    const angle = (i / bladeCount) * Math.PI * 2;
    return { angle };
  });

  return (
    <group>
      {/* Tower */}
      <mesh position={[0, 5, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.55, 10, 20]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Tower base flange */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.8, 0.9, 0.2, 20]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Nacelle */}
      <mesh position={[0, 10.3, 0.4]} castShadow>
        <boxGeometry args={[1.2, 0.8, 2.2]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Nacelle top fin */}
      <mesh position={[0, 10.9, 0.2]}>
        <boxGeometry args={[0.12, 0.5, 1.2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Hub + rotor group */}
      <group position={[0, 10.3, 1.6]} ref={rotorRef}>
        {/* Hub */}
        <mesh castShadow>
          <sphereGeometry args={[0.35, 20, 20]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Blades */}
        {blades.map(({ angle }, i) => (
          <group key={i} rotation={[0, 0, angle]}>
            <group position={[0, bladeLength / 2 + 0.35, 0]} rotation={[bladePitch, 0, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.18, bladeLength, 0.06]} />
                <meshStandardMaterial
                  color={bladeColor}
                  metalness={0.2}
                  roughness={0.6}
                  emissive={bladeColor}
                  emissiveIntensity={windSpeed > (windConstraint.warningThreshold || 25) ? 0.15 : 0}
                />
              </mesh>
              {/* Blade tip */}
              <mesh position={[0, bladeLength / 2, 0]}>
                <sphereGeometry args={[0.1, 8, 8]} />
                <meshStandardMaterial color={bladeColor} metalness={0.3} roughness={0.5} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* Stress glow point light near hub */}
      <pointLight
        position={[0, 10.3, 1.6]}
        intensity={hubGlowIntensity}
        color={hubGlowColor}
        distance={6}
      />

      {/* Ground base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.05} />
      </mesh>
    </group>
  );
}
