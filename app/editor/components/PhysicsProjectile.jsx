"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsProjectile({ params = {}, simConfig }) {
  const timeRef = useRef(0);
  const ballRef = useRef();
  const trailRef = useRef([]);

  const angleDeg = Math.max(0, Math.min(90, params.Launch_Angle ?? 45));
  const v0 = Math.max(1, Math.min(150, params.Initial_Speed ?? 30));
  const g = Math.max(1, Math.min(25, params.Gravity ?? 9.81));

  const angleRad = angleDeg * (Math.PI / 180);
  const vx = v0 * Math.cos(angleRad);
  const vy = v0 * Math.sin(angleRad);

  // Scale: 1 unit = 5 m, time scaled for visual
  const scale = 1 / 8;
  const timeScale = 0.4;

  const flightTime = (2 * vy) / g;
  const range = vx * flightTime;
  const maxHeight = (vy * vy) / (2 * g);

  const constraint = simConfig?.constraints?.find((c) => c.param === "Initial_Speed") || {};
  const stressRatio = Math.max(0, Math.min(1, (v0 - 0) / ((constraint.criticalThreshold || 150))));
  const ballColor = stressRatio < 0.6 ? "#6366f1" : stressRatio < 0.85 ? "#f59e0b" : "#ef4444";

  useFrame((_, delta) => {
    timeRef.current += delta * timeScale;
    if (timeRef.current > flightTime) timeRef.current = 0;

    const t = timeRef.current;
    const x = vx * t * scale - (range * scale) / 2;
    const y = (vy * t - 0.5 * g * t * t) * scale;

    if (ballRef.current) {
      ballRef.current.position.set(x, Math.max(0, y), 0);
    }
  });

  // Build trajectory arc points for display
  const arcPoints = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * flightTime;
    const x = vx * t * scale - (range * scale) / 2;
    const y = (vy * t - 0.5 * g * t * t) * scale;
    arcPoints.push(new THREE.Vector3(x, Math.max(0, y), 0));
  }
  const arcGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);

  return (
    <group>
      {/* Launch platform */}
      <mesh position={[-(range * scale) / 2, 0.12, 0]}>
        <boxGeometry args={[0.4, 0.25, 0.4]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Trajectory arc (dashed line) */}
      <line geometry={arcGeometry}>
        <lineBasicMaterial color="#334155" transparent opacity={0.5} />
      </line>

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[Math.max(4, range * scale + 2), 4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* Ball */}
      <mesh ref={ballRef} castShadow>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshStandardMaterial
          color={ballColor}
          metalness={0.3}
          roughness={0.5}
          emissive={ballColor}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Landing marker */}
      <mesh position={[(range * scale) / 2, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.03, 16]} />
        <meshStandardMaterial color="#10b981" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
