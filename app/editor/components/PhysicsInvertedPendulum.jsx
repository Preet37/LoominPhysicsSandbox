"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Inverted pendulum on a cart — visually distinct from Newton's cradle.
 * Params align with SIMCONFIG from agent-pipeline.
 */
export default function PhysicsInvertedPendulum({ params = {}, simConfig: _simConfig }) {
  const cartRef = useRef();
  const poleRef = useRef();
  const pivotRef = useRef();

  const poleLen = Number(params?.Pole_Length ?? params?.pole_length ?? 0.55) || 0.55;
  const baseDeg = Number(params?.Pole_Angle ?? params?.pole_angle ?? 12) || 12;
  const cartX = Number(params?.Cart_Position ?? params?.cart_position ?? 0) || 0;
  const motor = Number(params?.Motor_Force ?? params?.motor_force ?? 0) || 0;
  const damping = Number(params?.Damping ?? params?.damping ?? 0.08) || 0.08;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const baseRad = (baseDeg * Math.PI) / 180;
    // Lite visualization: unstable-ish motion scaled by motor + damping
    const freq = 1.25 + Math.min(2.5, Math.abs(motor) / 80);
    const decay = Math.max(0.02, 0.18 - damping * 0.4);
    const theta =
      baseRad * Math.cos(t * freq) * Math.exp(-decay * (t % 8)) +
      (motor / 400) * Math.sin(t * 3.2) * 0.15 +
      Math.sin(t * 2.7 + cartX) * 0.04;

    if (pivotRef.current) {
      pivotRef.current.rotation.z = theta;
    }
    if (cartRef.current) {
      cartRef.current.position.x = cartX + Math.sin(t * 1.1) * 0.04 * Math.abs(theta);
    }
  });

  const poleRadius = 0.035;
  const cartW = 0.85;
  const cartH = 0.22;
  const cartD = 0.42;

  return (
    <group>
      {/* Track */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[6, 0.04, 0.5]} />
        <meshStandardMaterial color="#2a3444" metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[5.8, 0.02, 0.08]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
      </mesh>

      <group ref={cartRef} position={[cartX, cartH / 2 + 0.04, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[cartW, cartH, cartD]} />
          <meshStandardMaterial color="#475569" metalness={0.25} roughness={0.45} />
        </mesh>
        {/* Wheels */}
        {[-0.28, 0.28].map((z) => (
          <mesh key={z} position={[0, -cartH * 0.35, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.06, 20]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}

        {/* Pivot + pole (rod from pivot upward; tilt with theta in Z for swing in X) */}
        <group ref={pivotRef} position={[0, cartH * 0.45, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.25} />
          </mesh>
          <group ref={poleRef} position={[0, poleLen / 2, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[poleRadius, poleRadius * 0.7, poleLen, 16]} />
              <meshStandardMaterial color="#c2410c" metalness={0.2} roughness={0.35} />
            </mesh>
            <mesh position={[0, poleLen / 2 + 0.1, 0]} castShadow>
              <sphereGeometry args={[0.12, 20, 20]} />
              <meshStandardMaterial color="#ea580c" metalness={0.45} roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Directional hint: inverted means mass above pivot */}
      <mesh position={[2.4, 0.6, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 0.22]} />
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
