"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Html } from "@react-three/drei";
import * as THREE from "three";

import PhysicsWindTurbine from "./components/PhysicsWindTurbine";
import PhysicsNewtonsCradle from "./components/PhysicsNewtonsCradle";
import PhysicsProjectile from "./components/PhysicsProjectile";
import PhysicsRocket from "./components/PhysicsRocket";
import PhysicsSpringMass from "./components/PhysicsSpringMass";
import PhysicsOrbit from "./components/PhysicsOrbit";
import PhysicsBridge from "./components/PhysicsBridge";
import PhysicsWaterBottle from "./components/PhysicsWaterBottle";
import Arm from "./components/Arm";
import HighQualityModel from "./components/HighQualityModel";

// Known sim types with dedicated physics scenes
const SCENE_CONFIGS = {
  wind_turbine:   { camera: [10, 8, 16],       target: [0, 6, 0],    fov: 35 },
  pendulum:       { camera: [0, 1, 8],          target: [0, 0, 0],    fov: 45 },
  newton_cradle:  { camera: [0, 1, 8],          target: [0, 0, 0],    fov: 45 },
  projectile:     { camera: [0, 3, 12],         target: [0, 1, 0],    fov: 50 },
  rocket:         { camera: [0, 4, 14],         target: [0, 2, 0],    fov: 50 },
  spring_mass:    { camera: [4, 2.5, 8],        target: [0, 2, 0],    fov: 40 },
  orbit:          { camera: [0, 10, 10],        target: [0, 0, 0],    fov: 45 },
  robot_arm:      { camera: [6, 4, 8],          target: [0, 2, 0],    fov: 35 },
  bridge:         { camera: [0, 4, 14],         target: [0, 0, 0],    fov: 40 },
  water_bottle:   { camera: [3.5, 3, 4.5],      target: [0, 1.2, 0],  fov: 38 },
  airplane:       { camera: [0, 3, 14],         target: [0, 1, 0],    fov: 50 },
  custom:         { camera: [1.8, 1.5, 2.5],    target: [0, 0.9, 0],  fov: 35 },
};

const KNOWN_TYPES = Object.keys(SCENE_CONFIGS).filter((k) => k !== "custom");

function Loader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-indigo-500/60 border-t-indigo-400 rounded-full animate-spin" />
        <span className="text-xs text-white/40 font-mono">Building scene…</span>
      </div>
    </Html>
  );
}

function SceneContent({ simType, params, simConfig, topic }) {
  // "pendulum" also maps to Newton's Cradle for a richer multi-ball experience
  const isNewtonsCradle = simType === "newton_cradle" || simType === "pendulum";
  const isKnown = KNOWN_TYPES.includes(simType) || isNewtonsCradle;
  const showGround = simType !== "orbit";

  return (
    <>
      {/* Lighting — no external HDR so the app works fully offline */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 20, 10]} intensity={1.6} castShadow shadow-mapSize={2048} />
      <directionalLight position={[-5, 10, -5]} intensity={0.5} color="#b4c6ef" />
      <pointLight position={[-8, 5, -8]} intensity={0.35} color="#ffd4a3" />
      <pointLight position={[0, 8, 0]} intensity={0.2} color="#c7d5f0" />

      {simType === "wind_turbine"              && <PhysicsWindTurbine    key={`wt-${params?.Blade_Count ?? 3}`} params={params} simConfig={simConfig} />}
      {isNewtonsCradle                         && <PhysicsNewtonsCradle  key={`nc-${params?.Ball_Count ?? 5}-${params?.Balls_Up ?? 1}`} params={params} simConfig={simConfig} />}
      {simType === "projectile"                && <PhysicsProjectile     params={params} simConfig={simConfig} />}
      {simType === "rocket"                    && <PhysicsRocket         params={params} simConfig={simConfig} />}
      {simType === "spring_mass"               && <PhysicsSpringMass     params={params} simConfig={simConfig} />}
      {simType === "orbit"                     && <PhysicsOrbit          params={params} simConfig={simConfig} />}
      {simType === "bridge"                    && <PhysicsBridge         params={params} simConfig={simConfig} />}
      {simType === "water_bottle"              && <PhysicsWaterBottle    params={params} simConfig={simConfig} />}
      {simType === "robot_arm"                 && <Arm />}

      {/* airplane → HighQualityModel (AI-generated geometry is fine for this) */}
      {simType === "airplane"                  && <HighQualityModel topic={topic || "airplane"} context="" />}

      {/* Any other unrecognized topic → AI-generated 3D model */}
      {!isKnown && simType && simType !== "robot_arm" && simType !== "airplane" && (
        <HighQualityModel topic={topic || simType} context="" />
      )}

      {showGround && isKnown && (
        <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={18} blur={2} far={8} resolution={512} />
      )}
    </>
  );
}

export default function PhysicsScene({ simType, params, simConfig, topic }) {
  const cfg = SCENE_CONFIGS[simType] || SCENE_CONFIGS.custom;

  if (!simType) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-4">
        <div className="w-16 h-16 border-2 border-white/10 rounded-full flex items-center justify-center">
          <span className="text-3xl">⚛</span>
        </div>
        <div className="text-center px-8">
          <p className="text-sm font-mono mb-1">Type any physics topic above</p>
          <p className="text-[11px] text-white/20">wind turbine · pendulum · black hole · bridge · anything</p>
        </div>
      </div>
    );
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: cfg.fov, position: cfg.camera }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
    >
      <Suspense fallback={<Loader />}>
        <SceneContent simType={simType} params={params} simConfig={simConfig} topic={topic} />
        <OrbitControls
          makeDefault
          minDistance={0.5}
          maxDistance={30}
          target={cfg.target}
          enableDamping
          dampingFactor={0.05}
        />
      </Suspense>
    </Canvas>
  );
}
