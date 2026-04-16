"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Ball({ xBase, stringLen, radius, getAngle, color }) {
  const meshRef = useRef();
  const lineRef = useRef();

  useFrame(() => {
    const theta = getAngle();
    const x = xBase + Math.sin(theta) * stringLen;
    const y = -Math.cos(theta) * stringLen;

    if (meshRef.current) {
      meshRef.current.position.set(x, y, 0);
    }
    // Update string geometry
    if (lineRef.current) {
      const positions = lineRef.current.geometry.attributes.position.array;
      positions[0] = xBase; positions[1] = 0; positions[2] = 0;
      positions[3] = x;     positions[4] = y; positions[5] = 0;
      lineRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* String */}
      <line ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([xBase, 0, 0, xBase, -stringLen, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#888" />
      </line>
      {/* Ball */}
      <mesh ref={meshRef} position={[xBase, -stringLen, 0]} castShadow>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          metalness={0.85}
          roughness={0.12}
          envMapIntensity={0.8}
        />
      </mesh>
    </group>
  );
}

export default function PhysicsNewtonsCradle({ params }) {
  const timeRef = useRef(0);
  const startRef = useRef(null);
  const swingPhaseRef = useRef("left"); // which side is swinging

  const ballCount = Math.round(Math.max(2, Math.min(7, params?.Ball_Count ?? 5)));
  const stringLen = Math.max(0.5, Math.min(3, params?.String_Length ?? 1.5));
  const ballsUp = Math.round(Math.max(1, Math.min(ballCount - 1, params?.Balls_Up ?? 1)));
  const damping = Math.max(0, Math.min(0.5, params?.Damping ?? 0.04));

  const radius = 0.17;
  const spacing = radius * 2.08;
  const totalWidth = (ballCount - 1) * spacing;

  const g = 9.81;
  const omega = Math.sqrt(g / stringLen);
  const amplitude = 0.75; // radians ~43°

  // Colours: left-swing balls = warm, right-swing = cool, middle = silver
  const ballColors = useMemo(() => {
    return Array.from({ length: ballCount }, (_, i) => {
      if (i < ballsUp) return "#f97316"; // orange
      if (i >= ballCount - ballsUp) return "#6366f1"; // indigo
      return "#94a3b8"; // slate
    });
  }, [ballCount, ballsUp]);

  // Newton's Cradle physics — direction fixed:
  //
  //  raw = A·cos(ωt)·e^(-γt)   [starts +A at t=0, hits 0 at T/4, -A at T/2, ...]
  //
  //  LEFT balls:  angle = min(0, -raw)
  //    t=0    → -A  (displaced to the LEFT, away from the cluster — correct!)
  //    t=T/4  →  0  (reached bottom, collision point, stops here)
  //    t=T/2  →  0  (stays at rest while right side swings out)
  //
  //  RIGHT balls: angle = max(0, -raw)
  //    t=0    →  0  (at rest)
  //    t=T/2  → +A  (swung out to the RIGHT — correct!)
  //    t=3T/4 →  0  (returned, triggers next collision)
  //
  //  Middle balls: always 0 — energy passes through them invisibly (elastic chain)
  const makeAngleGetter = (i) => () => {
    const t   = timeRef.current;
    const raw = amplitude * Math.cos(omega * t) * Math.exp(-damping * t);
    if (i < ballsUp)              return Math.min(0, -raw); // LEFT: negative = swings left of vertical
    if (i >= ballCount - ballsUp) return Math.max(0, -raw); // RIGHT: positive = swings right of vertical
    return 0;                                                // MIDDLE: stationary (elastic transfer)
  };

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (timeRef.current > 2 * Math.PI / omega * 30) {
      // reset so damping doesn't hit zero forever
      timeRef.current = 0;
    }
  });

  const frameY = 0; // top of strings = y=0, balls hang below

  return (
    <group position={[0, stringLen * 0.5, 0]}>
      {/* Top crossbar */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[totalWidth + 0.6, 0.06, 0.1]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Front bar */}
      <mesh position={[0, 0, radius + 0.06]} castShadow>
        <boxGeometry args={[totalWidth + 0.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Back bar */}
      <mesh position={[0, 0, -(radius + 0.06)]} castShadow>
        <boxGeometry args={[totalWidth + 0.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Left leg */}
      <mesh position={[-(totalWidth / 2 + 0.25), -stringLen / 2, 0]} castShadow>
        <boxGeometry args={[0.05, stringLen + 0.1, 0.05]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Right leg */}
      <mesh position={[(totalWidth / 2 + 0.25), -stringLen / 2, 0]} castShadow>
        <boxGeometry args={[0.05, stringLen + 0.1, 0.05]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Bottom rail */}
      <mesh position={[0, -stringLen - 0.05, 0]} receiveShadow>
        <boxGeometry args={[totalWidth + 0.6, 0.04, 0.05]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Balls */}
      {Array.from({ length: ballCount }, (_, i) => {
        const xBase = (i - (ballCount - 1) / 2) * spacing;
        return (
          <Ball
            key={i}
            xBase={xBase}
            stringLen={stringLen}
            radius={radius}
            getAngle={makeAngleGetter(i)}
            color={ballColors[i]}
          />
        );
      })}
    </group>
  );
}
