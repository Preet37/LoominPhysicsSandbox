"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsBridge({ params = {}, simConfig }) {
  const deckRef = useRef();
  const loadRef = useRef();
  const cracksRef = useRef([]);

  const load = Math.max(0, Math.min(600, params.Load ?? 100));
  const span = Math.max(5, Math.min(120, params.Span ?? 40));
  const strength = Math.max(50, Math.min(800, params.Material_Strength ?? 350));
  const thickness = Math.max(0.05, Math.min(2, params.Deck_Thickness ?? 0.5));

  // Bending stress: σ = M*c/I where M = P*L/4 (midspan, point load)
  // I = b*h^3/12, c = h/2, b=1 (per unit width), so σ = 3*P*L / (2*b*h^2)
  const beamWidth = span / 8;
  const M = (load * 1000 * span) / 4; // Nm
  const I = (beamWidth * thickness ** 3) / 12;
  const c = thickness / 2;
  const sigma = (M * c) / I / 1e6; // MPa
  const stressRatio = Math.max(0, Math.min(1, sigma / strength));

  const warnConstraint = simConfig?.constraints?.find((c) => c.param === "Load") || {};
  const isCritical = load >= (warnConstraint.criticalThreshold || 450);
  const isWarning = load >= (warnConstraint.warningThreshold || 300);

  const deckColor = stressRatio < 0.5 ? "#64748b" : stressRatio < 0.8 ? "#b45309" : "#991b1b";
  const sag = Math.min(1.5, stressRatio * 1.8); // visual sag

  const deckLength = Math.max(3, Math.min(10, span / 5));

  useFrame((state) => {
    // Animate sag when approaching failure
    if (deckRef.current) {
      const wobble = isCritical
        ? Math.sin(state.clock.elapsedTime * 12) * 0.04
        : 0;
      deckRef.current.position.y = -sag * 0.5 + wobble;
    }
    if (loadRef.current) {
      loadRef.current.position.y = 0.3 + (isCritical ? Math.sin(state.clock.elapsedTime * 12) * 0.04 : 0) - sag * 0.5;
    }
  });

  // Support columns
  const supports = [-deckLength / 2, deckLength / 2];

  return (
    <group>
      {/* Abutments */}
      {supports.map((x, i) => (
        <mesh key={i} position={[x, -0.5, 0]}>
          <boxGeometry args={[0.5, 1.5, 0.8]} />
          <meshStandardMaterial color="#374151" metalness={0.3} roughness={0.7} />
        </mesh>
      ))}

      {/* Deck beam */}
      <group ref={deckRef}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[deckLength, thickness, 0.8]} />
          <meshStandardMaterial
            color={deckColor}
            metalness={0.5}
            roughness={0.4}
            emissive={isCritical ? "#991b1b" : isWarning ? "#92400e" : "#000000"}
            emissiveIntensity={isCritical ? 0.3 : isWarning ? 0.15 : 0}
          />
        </mesh>

        {/* Cables */}
        {[-deckLength / 2 + 0.5, 0, deckLength / 2 - 0.5].map((x, i) => (
          <mesh key={i} position={[x, 0.5 + thickness / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1 + sag * 0.3, 6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
          </mesh>
        ))}

        {/* Deck road surface */}
        <mesh position={[0, thickness / 2 + 0.02, 0]}>
          <boxGeometry args={[deckLength - 0.1, 0.04, 0.7]} />
          <meshStandardMaterial color="#1e293b" roughness={0.95} />
        </mesh>

        {/* Crack overlay at failure */}
        {isCritical && (
          <mesh position={[0, thickness / 2 + 0.04, 0.01]}>
            <boxGeometry args={[0.08, thickness + 0.1, 0.82]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} transparent opacity={0.6} />
          </mesh>
        )}
      </group>

      {/* Load block */}
      <mesh ref={loadRef} position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.6, Math.max(0.1, load / 200), 0.6]} />
        <meshStandardMaterial
          color={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#6366f1"}
          metalness={0.4}
          roughness={0.5}
          emissive={isCritical ? "#ef4444" : "#000000"}
          emissiveIntensity={isCritical ? 0.3 : 0}
        />
      </mesh>

      {/* Load arrows (force indicator) */}
      {[0.15, -0.15].map((x, i) => (
        <mesh key={i} position={[x, 0.9, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.06, 0.3, 8]} />
          <meshStandardMaterial
            color={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#6366f1"}
            emissive={isCritical ? "#ef4444" : "#000000"}
            emissiveIntensity={isCritical ? 0.4 : 0}
          />
        </mesh>
      ))}

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]} receiveShadow>
        <planeGeometry args={[deckLength + 4, 6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
    </group>
  );
}
