"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export default function PhysicsSpringMass({ params = {}, simConfig }) {
  const timeRef = useRef(0);
  const massRef = useRef();
  const coilsRef = useRef([]);

  const k = Math.max(10, Math.min(1000, params.Spring_Stiffness ?? 100));
  const m = Math.max(0.1, Math.min(20, params.Mass ?? 2));
  const b = Math.max(0, Math.min(10, params.Damping ?? 0.5));
  const A = Math.max(0.1, Math.min(2, params.Amplitude ?? 0.8));

  const omega0 = Math.sqrt(k / m);
  const zeta = b / (2 * Math.sqrt(k * m));
  const omegaD = omega0 * Math.sqrt(Math.max(0.001, 1 - zeta * zeta));

  const restY = 1.0;
  const topY = 4;
  const numCoils = 12;
  const coilSpacing = (topY - restY) / numCoils;

  const constraint = simConfig?.constraints?.find((c) => c.param === "Spring_Stiffness" || c.param === "Mass") || {};
  const maxStress = constraint.criticalThreshold || 800;
  const tension = k * A;
  const stressRatio = Math.max(0, Math.min(1, tension / (maxStress * 0.5)));
  const massColor = stressRatio < 0.5 ? "#6366f1" : stressRatio < 0.8 ? "#f59e0b" : "#ef4444";
  const springColor = stressRatio < 0.5 ? "#10b981" : stressRatio < 0.8 ? "#f59e0b" : "#ef4444";

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;

    const y = A * Math.exp(-zeta * omega0 * t) * Math.cos(omegaD * t);

    if (massRef.current) {
      massRef.current.position.y = restY + y;
    }

    // Reset when oscillation dies out
    if (Math.abs(y) < 0.01 && t > 1) {
      timeRef.current = 0;
    }
  });

  // Spring coils
  const coils = Array.from({ length: numCoils }, (_, i) => ({
    y: restY + i * coilSpacing + coilSpacing / 2,
    offset: (i % 2 === 0 ? 1 : -1) * 0.18,
  }));

  return (
    <group>
      {/* Ceiling mount */}
      <mesh position={[0, topY + 0.15, 0]}>
        <boxGeometry args={[0.7, 0.3, 0.4]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Spring coils (zig-zag boxes) */}
      {coils.map((coil, i) => (
        <mesh key={i} position={[coil.offset, coil.y, 0]}>
          <boxGeometry args={[0.04, coilSpacing * 0.9, 0.04]} />
          <meshStandardMaterial color={springColor} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {/* Spring center line */}
      <mesh position={[0, (topY + restY) / 2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, topY - restY, 6]} />
        <meshStandardMaterial color={springColor} metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Mass block */}
      <mesh ref={massRef} position={[0, restY, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial
          color={massColor}
          metalness={0.4}
          roughness={0.5}
          emissive={massColor}
          emissiveIntensity={0.08 + stressRatio * 0.15}
        />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
    </group>
  );
}
