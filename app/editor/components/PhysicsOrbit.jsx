"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsOrbit({ params = {}, simConfig }) {
  const planetRef = useRef();
  const trailRef = useRef();
  const angleRef = useRef(0);
  const trailPoints = useRef([]);

  const starMass = Math.max(1, Math.min(100, params.Star_Mass ?? 20));
  const orbitalRadius = Math.max(1, Math.min(8, params.Orbital_Radius ?? 4));
  const orbitalSpeed = Math.max(0.05, Math.min(5, params.Orbital_Speed ?? 1));

  // Orbital period scales with radius^1.5 / starMass^0.5 (Kepler)
  const angularVelocity = orbitalSpeed * (starMass ** 0.5) / (orbitalRadius ** 1.5) * 0.4;

  const constraint = simConfig?.constraints?.find((c) => c.param === "Orbital_Speed" || c.param === "Star_Mass") || {};
  const maxSpeed = constraint.criticalThreshold || 5;
  const stressRatio = Math.max(0, Math.min(1, (orbitalSpeed - 0) / maxSpeed));
  const planetColor = stressRatio < 0.5 ? "#6366f1" : stressRatio < 0.8 ? "#f59e0b" : "#ef4444";

  // Star size based on mass
  const starSize = 0.15 + (starMass / 100) * 0.5;
  const planetSize = 0.12;

  const orbitPoints = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(Math.cos(a) * orbitalRadius, 0, Math.sin(a) * orbitalRadius));
  }
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);

  useFrame((_, delta) => {
    angleRef.current += angularVelocity * delta;
    const angle = angleRef.current;

    const x = Math.cos(angle) * orbitalRadius;
    const z = Math.sin(angle) * orbitalRadius;

    if (planetRef.current) {
      planetRef.current.position.set(x, 0, z);
    }

    // Trail
    trailPoints.current.push(new THREE.Vector3(x, 0, z));
    if (trailPoints.current.length > 60) trailPoints.current.shift();
    if (trailRef.current) {
      const geo = new THREE.BufferGeometry().setFromPoints(trailPoints.current);
      trailRef.current.geometry.dispose();
      trailRef.current.geometry = geo;
    }
  });

  return (
    <group>
      {/* Star */}
      <mesh>
        <sphereGeometry args={[starSize, 24, 24]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={1.5}
          metalness={0}
          roughness={1}
        />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2 + starMass * 0.05} color="#fde68a" distance={20} />

      {/* Orbit ring */}
      <line geometry={orbitGeometry}>
        <lineBasicMaterial color="#1e293b" transparent opacity={0.6} />
      </line>

      {/* Planet trail */}
      <line ref={trailRef}>
        <bufferGeometry />
        <lineBasicMaterial color={planetColor} transparent opacity={0.4} />
      </line>

      {/* Planet */}
      <mesh ref={planetRef} position={[orbitalRadius, 0, 0]} castShadow>
        <sphereGeometry args={[planetSize, 20, 20]} />
        <meshStandardMaterial
          color={planetColor}
          metalness={0.1}
          roughness={0.7}
          emissive={planetColor}
          emissiveIntensity={0.08 + stressRatio * 0.15}
        />
      </mesh>

      {/* Background stars (static) */}
      {Array.from({ length: 80 }, (_, i) => {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 9 + Math.random() * 2;
        return (
          <mesh key={i} position={[
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi),
          ]}>
            <sphereGeometry args={[0.015 + Math.random() * 0.02, 4, 4]} />
            <meshBasicMaterial color="#e2e8f0" />
          </mesh>
        );
      })}
    </group>
  );
}
