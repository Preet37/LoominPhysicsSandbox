"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsPendulum({ params = {}, simConfig }) {
  const timeRef = useRef(0);
  const bobRef = useRef();
  const rodRef = useRef();

  const length = Math.max(0.5, Math.min(8, params.Length ?? 3));
  const mass = Math.max(0.1, Math.min(20, params.Mass ?? 2));
  const gravity = Math.max(1, Math.min(25, params.Gravity ?? 9.81));
  const damping = Math.max(0, Math.min(2, params.Damping ?? 0.1));

  const theta0 = 0.6; // initial angle radians
  const omega0 = Math.sqrt(gravity / length);
  const bobRadius = Math.max(0.15, Math.min(0.5, 0.08 * Math.cbrt(mass)));

  const constraint = simConfig?.constraints?.find((c) => c.param === "Length" || c.param === "Gravity") || {};
  const maxG = constraint.criticalThreshold || 25;
  const stressRatio = Math.max(0, Math.min(1, (gravity - 9.81) / (maxG - 9.81)));
  const bobColor = stressRatio < 0.5 ? "#6366f1" : stressRatio < 0.8 ? "#f59e0b" : "#ef4444";

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;

    // Damped harmonic oscillation: θ(t) = θ₀ cos(ω t) e^(-ζt)
    const dampFactor = Math.exp(-damping * t * 0.5);
    const angle = theta0 * Math.cos(omega0 * t) * dampFactor;

    const x = Math.sin(angle) * length;
    const y = -Math.cos(angle) * length;

    if (bobRef.current) {
      bobRef.current.position.set(x, y, 0);
    }

    if (rodRef.current) {
      const mid = new THREE.Vector3(x / 2, y / 2, 0);
      rodRef.current.position.copy(mid);
      const dir = new THREE.Vector3(x, y, 0);
      const up = new THREE.Vector3(0, 1, 0);
      rodRef.current.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      rodRef.current.scale.set(1, dir.length(), 1);
    }

    // Reset to give it a kick when amplitude fades
    if (dampFactor < 0.05) {
      timeRef.current = 0;
    }
  });

  const pivotY = 4;

  return (
    <group position={[0, pivotY, 0]}>
      {/* Pivot support */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.6, 0.12, 0.3]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[-0.3, -0.6, 0]}>
        <boxGeometry args={[0.06, 1.2, 0.06]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.3, -0.6, 0]}>
        <boxGeometry args={[0.06, 1.2, 0.06]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Pivot pin */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Rod (scaled unit cylinder) */}
      <mesh ref={rodRef} position={[0, -length / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Bob */}
      <mesh ref={bobRef} position={[0, -length, 0]} castShadow>
        <sphereGeometry args={[bobRadius, 24, 24]} />
        <meshStandardMaterial
          color={bobColor}
          metalness={0.3}
          roughness={0.5}
          emissive={bobColor}
          emissiveIntensity={0.1 + stressRatio * 0.2}
        />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(pivotY + 0.05), 0]} receiveShadow>
        <circleGeometry args={[4, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
    </group>
  );
}
