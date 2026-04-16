"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Exhaust particle (single)
function ExhaustParticle({ index, speed }) {
  const ref = useRef();
  const offset = (index * 0.37) % 1;
  useFrame((state) => {
    if (!ref.current) return;
    const t = ((state.clock.elapsedTime * speed * 1.8 + offset) % 1);
    ref.current.position.set(
      (Math.random() - 0.5) * 0.04 * t,
      -0.35 - t * 0.7,
      (Math.random() - 0.5) * 0.04 * t,
    );
    ref.current.material.opacity = (1 - t) * 0.7;
    const s = 0.03 + t * 0.12;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        color={speed > 60 ? "#ff6b00" : "#ffd700"}
        emissive={speed > 60 ? "#ff3300" : "#ffaa00"}
        emissiveIntensity={0.8}
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </mesh>
  );
}

// The rocket 3D model — centered at origin, nose pointing +Y
function RocketModel({ speed, isCritical, isWarning }) {
  const color  = isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#e2e8f0";
  const accent = isCritical ? "#dc2626" : "#475569";
  const nozzleGlow = isCritical ? "#ff2200" : speed > 60 ? "#ff6600" : "#ffaa00";

  return (
    <group>
      {/* Body — main cylinder */}
      <mesh castShadow>
        <cylinderGeometry args={[0.18, 0.18, 1.4, 24]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Nose cone */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.18, 0.55, 24]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Window ring */}
      <mesh position={[0, 0.52, 0]}>
        <torusGeometry args={[0.185, 0.025, 8, 24]} />
        <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Engine section — slightly wider */}
      <mesh position={[0, -0.8, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.28, 24]} />
        <meshStandardMaterial color={accent} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Fins (4 fins, rotated 90°) */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i / 4) * Math.PI * 2, 0]}>
          <mesh position={[0.32, -0.88, 0]} castShadow>
            <boxGeometry args={[0.28, 0.38, 0.03]} />
            <meshStandardMaterial color={accent} metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Fin taper */}
          <mesh position={[0.42, -1.0, 0]} rotation={[0, 0, -0.5]}>
            <coneGeometry args={[0.06, 0.22, 4]} />
            <meshStandardMaterial color={accent} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Nozzle */}
      <mesh position={[0, -1.04, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 0.14, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Exhaust plume */}
      <pointLight position={[0, -1.15, 0]} intensity={3.5} color={nozzleGlow} distance={2.5} />
      {Array.from({ length: 12 }, (_, i) => (
        <ExhaustParticle key={i} index={i} speed={speed} />
      ))}
    </group>
  );
}

export default function PhysicsRocket({ params = {}, simConfig }) {
  const groupRef = useRef();
  const timeRef  = useRef(0);

  const launchAngle = (params.Launch_Angle ?? 45) * (Math.PI / 180);
  const initSpeed   = params.Initial_Speed  ?? 30;
  const gravity     = params.Gravity        ?? 9.81;
  const massRatio   = params.Mass_Ratio     ?? 20;

  // Get constraint thresholds
  const speedC  = simConfig?.constraints?.find((c) => c.param === "Initial_Speed");
  const massC   = simConfig?.constraints?.find((c) => c.param === "Mass_Ratio");
  const sWarn   = speedC?.warningThreshold  ?? 100;
  const sCrit   = speedC?.criticalThreshold ?? 150;
  const isCritical = initSpeed >= sCrit;
  const isWarning  = !isCritical && initSpeed >= sWarn;

  // Tsiolkovsky rocket equation: Δv = Ve × ln(m_ratio)
  const exhaustVel  = 3000;
  const deltaV      = exhaustVel * Math.log(Math.max(1.01, massRatio));
  const effectiveV  = Math.min(initSpeed + deltaV * 0.01, initSpeed * 1.4);

  // Parabolic arc physics — same as PhysicsProjectile but rocket follows it
  const vx = effectiveV * Math.cos(launchAngle);
  const vy = effectiveV * Math.sin(launchAngle);
  const tFlight = (2 * vy) / Math.max(0.1, gravity);
  const range   = vx * tFlight;
  const maxH    = (vy * vy) / (2 * gravity);

  // Scene scale so the arc fits nicely
  const sceneScale = 6 / Math.max(range, 1);

  // Arc line points for the trail
  const arcPoints = useMemo(() => {
    const pts = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tFlight;
      const x = vx * t * sceneScale;
      const y = Math.max(0, (vy * t - 0.5 * gravity * t * t)) * sceneScale;
      pts.push(new THREE.Vector3(x - (range * sceneScale) / 2, y, 0));
    }
    return pts;
  }, [vx, vy, gravity, tFlight, range, sceneScale]);

  const arcGeom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(arcPoints);
    return g;
  }, [arcPoints]);

  useFrame((_, delta) => {
    timeRef.current = (timeRef.current + delta * 0.35) % 1;
    if (!groupRef.current) return;

    const t     = timeRef.current * tFlight;
    const x     = vx * t * sceneScale - (range * sceneScale) / 2;
    const y     = Math.max(0, (vy * t - 0.5 * gravity * t * t)) * sceneScale;

    // Velocity direction → rocket points in that direction
    const vxNow = vx;
    const vyNow = vy - gravity * t;
    const angle = Math.atan2(vxNow, vyNow); // angle from +Y axis

    groupRef.current.position.set(x, y, 0);
    groupRef.current.rotation.set(0, 0, -angle);
  });

  const groundY = 0;

  return (
    <group>
      {/* Arc trajectory trail */}
      <line>
        <primitive object={arcGeom} attach="geometry" />
        <lineBasicMaterial
          color={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#334155"}
          transparent
          opacity={0.45}
        />
      </line>

      {/* Launch pad */}
      <mesh position={[-(range * sceneScale) / 2, 0.04, 0]}>
        <boxGeometry args={[0.35, 0.08, 0.35]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Landing zone marker */}
      <mesh position={[(range * sceneScale) / 2, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.28, 32]} />
        <meshStandardMaterial color={isCritical ? "#ef4444" : "#10b981"} />
      </mesh>

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
        <planeGeometry args={[range * sceneScale * 2 + 4, 8]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} metalness={0.03} />
      </mesh>

      {/* The rocket — follows the arc */}
      <group ref={groupRef} scale={[0.45, 0.45, 0.45]}>
        <RocketModel speed={initSpeed} isCritical={isCritical} isWarning={isWarning} />
      </group>

      {/* Stats panel glow */}
      {isCritical && (
        <pointLight position={[0, maxH * sceneScale * 0.5, 0]} intensity={1.5} color="#ef4444" distance={8} />
      )}
    </group>
  );
}
