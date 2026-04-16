"use client";

// Three.js equivalent of Blender's Screw Modifier + Principled BSDF shader
// LatheGeometry  = Blender's Screw Modifier (sweeps a 2D profile 360° around Z axis)
// MeshPhysicalMaterial with transmission + IOR = Blender's Principled BSDF with Glass setup
// Everything is parametric and regenerates instantly when params change

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Build the 2D profile of the bottle (like a lathe outline) ─────────────
// Same algorithm as the Blender Python script's create_profile_curve()
function buildBottleProfile(H, R_base, R_neck, R_wall, segments) {
  const pts = [];

  // Base: flat bottom with a slight dome
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(R_base * 0.88, 0));
  pts.push(new THREE.Vector2(R_base * 0.96, H * 0.012)); // chamfer

  // Body: organic curve with waist indent (sin wave like the Blender script)
  const bodyTop = H * 0.80;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = t * bodyTop;
    let r = R_base - Math.sin(t * Math.PI) * (R_base * 0.07); // waist dip

    // Shoulder taper
    if (t > 0.78) {
      const mix = (t - 0.78) / 0.22;
      r = (1 - mix) * r + mix * R_neck;
    }
    pts.push(new THREE.Vector2(r, z));
  }

  // Neck: vertical cylinder
  pts.push(new THREE.Vector2(R_neck, H * 0.80));
  pts.push(new THREE.Vector2(R_neck, H * 0.91));

  // Lip/rim: small flare that catches light
  pts.push(new THREE.Vector2(R_neck + R_wall * 1.5, H * 0.91));
  pts.push(new THREE.Vector2(R_neck + R_wall * 1.5, H * 0.945));
  pts.push(new THREE.Vector2(R_neck, H * 0.96));
  pts.push(new THREE.Vector2(R_neck, H));

  return pts;
}

// ── Water profile — inner volume capped at fill level ─────────────────────
function buildWaterProfile(H, R_base, R_wall, fillFraction, segments) {
  if (fillFraction <= 0.01) return [];
  const waterTopZ = H * 0.80 * fillFraction;
  const pts = [];
  pts.push(new THREE.Vector2(0, R_wall * 0.5));
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = R_wall * 0.5 + t * (waterTopZ - R_wall * 0.5);
    const tProfile = t * fillFraction;
    const r = (R_base - R_wall * 2) - Math.sin(tProfile * Math.PI) * ((R_base - R_wall * 2) * 0.07);
    pts.push(new THREE.Vector2(Math.max(R_wall, r * 0.94), z));
  }
  // Water surface (flat top)
  pts.push(new THREE.Vector2(R_wall, waterTopZ));
  return pts;
}

// ── Steam particle (single puff, animated) ────────────────────────────────
function SteamPuff({ x, delay, H, R_neck }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = ((state.clock.elapsedTime + delay) % 2.5) / 2.5;
    ref.current.position.set(x, H + t * H * 0.35, 0);
    ref.current.material.opacity = Math.sin(t * Math.PI) * 0.35;
    const s = 0.5 + t * 1.5;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[x, H, 0]}>
      <sphereGeometry args={[R_neck * 0.8, 8, 8]} />
      <meshStandardMaterial color="white" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// ── Cap with knurling ridges ───────────────────────────────────────────────
function Cap({ R_neck, R_wall, H, color, ridges = 24 }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    // Cap profile
    shape.moveTo(0, 0);
    shape.lineTo(R_neck + R_wall * 3, 0);
    shape.lineTo(R_neck + R_wall * 3, -H * 0.065);
    shape.lineTo(R_neck + R_wall * 4.5, -H * 0.065);
    shape.lineTo(R_neck + R_wall * 4.5, H * 0.02);
    shape.lineTo(0, H * 0.02);
    shape.closePath();

    // Lathe the profile
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(new THREE.Vector2(
        shape.getPoint(t).x,
        shape.getPoint(t).y,
      ));
    }
    return new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(R_neck + R_wall * 3, 0),
        new THREE.Vector2(R_neck + R_wall * 4.5, -H * 0.025),
        new THREE.Vector2(R_neck + R_wall * 4.5, -H * 0.065),
        new THREE.Vector2(R_neck + R_wall * 3.5, -H * 0.065),
        new THREE.Vector2(R_neck + R_wall * 3.5, 0),
      ],
      ridges,
    );
  }, [R_neck, R_wall, H, ridges]);

  return (
    <mesh geometry={geom} position={[0, H * 0.96, 0]} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PhysicsWaterBottle({ params = {}, simConfig }) {
  const bottleRef  = useRef();
  const timeRef    = useRef(0);

  // Read params — render at 8× actual scale so it fills the scene nicely
  const S          = 8; // display scale multiplier
  const fillLevel  = Math.max(0, Math.min(100, params.Fill_Level   ?? 65)) / 100;
  const temperature= params.Temperature   ?? 20;  // °C
  const pressure   = params.Pressure      ?? 101; // kPa
  const wallMM     = Math.max(0.5, Math.min(5, params.Wall_Thickness ?? 2));

  // Physical dimensions (real metres × S)
  const H      = 0.24  * S;
  const R_base = 0.045 * S;
  const R_neck = 0.015 * S;
  const R_wall = (wallMM / 1000) * S;

  // Constraint colours
  const tc = simConfig?.constraints?.find((c) => c.param === "Temperature");
  const pc = simConfig?.constraints?.find((c) => c.param === "Pressure");
  const tWarn = tc?.warningThreshold ?? 60;
  const tCrit = tc?.criticalThreshold ?? 80;
  const pWarn = pc?.warningThreshold ?? 130;
  const pCrit = pc?.criticalThreshold ?? 160;

  const isCritical = temperature >= tCrit || pressure >= pCrit;
  const isWarning  = !isCritical && (temperature >= tWarn || pressure >= pWarn);

  const bodyColor  = isCritical ? "#ff6b6b" : isWarning ? "#fcd34d" : "#a8d8ea";
  const capColor   = isCritical ? "#ef4444" : "#1e293b";
  const waterColor = temperature > 60 ? "#ff8c42" : "#29b6f6";
  const waterOpacity = temperature > 60 ? 0.85 : 0.55;

  const showSteam  = temperature > 70;

  // ── Geometries (rebuild only when structural params change) ──────────────
  const bottleGeom = useMemo(
    () => new THREE.LatheGeometry(buildBottleProfile(H, R_base, R_neck, R_wall, 48), 96),
    [H, R_base, R_neck, R_wall],
  );

  const waterPts   = useMemo(
    () => buildWaterProfile(H, R_base, R_wall, fillLevel, 32),
    [H, R_base, R_wall, fillLevel],
  );
  const waterGeom  = useMemo(
    () => waterPts.length > 1 ? new THREE.LatheGeometry(waterPts, 64) : null,
    [waterPts],
  );

  // ── Pressure wobble & thermal deformation at failure ─────────────────────
  useFrame((_, delta) => {
    timeRef.current += delta;
    if (!bottleRef.current) return;
    if (isCritical) {
      const freq = pressure >= pCrit ? 14 : 6;
      const amp  = pressure >= pCrit ? 0.018 : 0.008;
      const w    = Math.sin(timeRef.current * freq) * amp;
      bottleRef.current.scale.x = 1 + w;
      bottleRef.current.scale.z = 1 + w;
      bottleRef.current.scale.y = 1 - w * 0.5;
    } else {
      bottleRef.current.scale.set(1, 1, 1);
    }
  });

  return (
    <group ref={bottleRef} position={[0, 0, 0]}>
      {/* ── Bottle body — MeshPhysicalMaterial (= Blender Principled BSDF glass) */}
      <mesh geometry={bottleGeom} castShadow>
        <meshPhysicalMaterial
          color={bodyColor}
          transmission={0.88}       // = Blender Transmission Weight
          ior={1.45}                 // = Blender IOR (plastic 1.45, glass 1.52)
          roughness={0.04}           // = Blender Roughness
          thickness={R_wall * 80}    // = Blender Thickness (for refraction depth)
          metalness={0}
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* ── Water / liquid inside */}
      {waterGeom && (
        <mesh geometry={waterGeom}>
          <meshPhysicalMaterial
            color={waterColor}
            transmission={0.75}
            ior={1.33}              // Water IOR
            roughness={0.01}
            thickness={R_base * 4}
            transparent
            opacity={waterOpacity}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ── Cap with knurling ridges */}
      <Cap R_neck={R_neck} R_wall={R_wall} H={H} color={capColor} ridges={32} />

      {/* ── Pressure indicator ring */}
      {pressure > 110 && (
        <mesh position={[0, H * 0.45, 0]}>
          <torusGeometry args={[R_base * 1.02, R_wall * 1.5, 8, 64]} />
          <meshStandardMaterial
            color={isCritical ? "#ef4444" : "#f59e0b"}
            emissive={isCritical ? "#dc2626" : "#d97706"}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}

      {/* ── Steam effect when hot */}
      {showSteam && [-0.02 * S, 0, 0.02 * S].map((x, i) => (
        <SteamPuff key={i} x={x} delay={i * 0.7} H={H} R_neck={R_neck} />
      ))}

      {/* ── Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[R_base * 3.5, 64]} />
        <meshStandardMaterial color="#0a0f1a" roughness={0.95} />
      </mesh>

      {/* ── Stress point glow */}
      {isCritical && (
        <pointLight position={[0, H * 0.5, R_base * 1.2]} intensity={2.5} color="#ef4444" distance={H * 2} />
      )}
    </group>
  );
}
