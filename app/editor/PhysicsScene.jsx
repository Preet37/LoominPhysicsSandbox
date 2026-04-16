"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Html } from "@react-three/drei";
import * as THREE from "three";

import PhysicsWindTurbine from "./components/PhysicsWindTurbine";
import PhysicsNewtonsCradle from "./components/PhysicsNewtonsCradle";
import PhysicsInvertedPendulum from "./components/PhysicsInvertedPendulum";
import PhysicsProjectile from "./components/PhysicsProjectile";
import PhysicsRocket from "./components/PhysicsRocket";
import PhysicsSpringMass from "./components/PhysicsSpringMass";
import PhysicsOrbit from "./components/PhysicsOrbit";
import PhysicsBridge from "./components/PhysicsBridge";
import PhysicsWaterBottle from "./components/PhysicsWaterBottle";
import PhysicsF1Car from "./components/PhysicsF1Car";
import PhysicsSteamEngine from "./components/PhysicsSteamEngine";
import PhysicsHelicopter from "./components/PhysicsHelicopter";
import PhysicsMechanicalGears from "./components/PhysicsMechanicalGears";
import PhysicsBicycle from "./components/PhysicsBicycle";
import PhysicsSubmarine from "./components/PhysicsSubmarine";
import PhysicsBreadboard from "./components/PhysicsBreadboard";
import Arm from "./components/Arm";
import HighQualityModel from "./components/HighQualityModel";
import ProceduralGLBModel from "./components/ProceduralGLBModel";
import DynamicPhysicsScene from "./components/DynamicPhysicsScene";

// Known sim types with dedicated physics scenes
const SCENE_CONFIGS = {
  wind_turbine:   { camera: [10, 8, 16],       target: [0, 6, 0],    fov: 35 },
  pendulum:       { camera: [0, 1, 8],          target: [0, 0, 0],    fov: 45 },
  newton_cradle:  { camera: [0, 1, 8],          target: [0, 0, 0],    fov: 45 },
  inverted_pendulum: { camera: [2.2, 1.4, 4.2], target: [0, 0.55, 0], fov: 42 },
  projectile:     { camera: [0, 3, 12],         target: [0, 1, 0],    fov: 50 },
  rocket:         { camera: [0, 4, 14],         target: [0, 2, 0],    fov: 50 },
  spring_mass:    { camera: [4, 2.5, 8],        target: [0, 2, 0],    fov: 40 },
  orbit:          { camera: [0, 10, 10],        target: [0, 0, 0],    fov: 45 },
  robot_arm:      { camera: [6, 4, 8],          target: [0, 2, 0],    fov: 35 },
  bridge:         { camera: [0, 4, 14],         target: [0, 0, 0],    fov: 40 },
  water_bottle:   { camera: [3.5, 3, 4.5],      target: [0, 1.2, 0],  fov: 38 },
  airplane:       { camera: [0, 3, 14],         target: [0, 1, 0],    fov: 50 },
  helicopter:     { camera: [5, 3.5, 7],        target: [0, 1.2, 0],  fov: 44 },
  mechanical_gears: { camera: [2.8, 2.2, 3.5],  target: [0, 0.65, 0], fov: 42 },
  bicycle:        { camera: [3.5, 2.0, -0.5],   target: [0, 0.6, 0.5],fov: 44 },
  submarine:      { camera: [4.2, 2.2, 5.5],    target: [0, 0.5, 0],  fov: 42 },
  breadboard:     { camera: [2.4, 1.9, 2.8],    target: [0, 0.08, 0], fov: 40 },
  f1_car:         { camera: [4.5, 2.8, 7],      target: [0, 0.5, 0],  fov: 42 },
  steam_engine:   { camera: [6, 3.5, 7],        target: [0, 1.2, 0],  fov: 40 },
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

function SceneContent({ simType, params, simConfig, topic, sceneCode, onRegenerate, agentSteps }) {
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
      {!isKnown && (
        <>
          {/* Extra fill lights for AI-generated scenes: avoids hidden dark silhouettes */}
          <hemisphereLight intensity={0.95} color="#f8fbff" groundColor="#0b1220" />
          <directionalLight position={[-6, 8, 6]} intensity={1.0} color="#dbeafe" />
        </>
      )}

      {simType === "wind_turbine"              && <PhysicsWindTurbine    key={`wt-${params?.Blade_Count ?? 3}`} params={params} simConfig={simConfig} />}
      {simType === "inverted_pendulum"         && <PhysicsInvertedPendulum key={`ip-${params?.Pole_Length ?? 0.55}-${params?.Cart_Position ?? 0}`} params={params} simConfig={simConfig} />}
      {isNewtonsCradle                         && <PhysicsNewtonsCradle  key={`nc-${params?.Ball_Count ?? 5}-${params?.Balls_Up ?? 1}`} params={params} simConfig={simConfig} />}
      {simType === "projectile"                && <PhysicsProjectile     params={params} simConfig={simConfig} />}
      {simType === "rocket"                    && <PhysicsRocket         params={params} simConfig={simConfig} />}
      {simType === "spring_mass"               && <PhysicsSpringMass     params={params} simConfig={simConfig} />}
      {simType === "orbit"                     && <PhysicsOrbit          params={params} simConfig={simConfig} />}
      {simType === "bridge"                    && <PhysicsBridge         params={params} simConfig={simConfig} />}
      {simType === "water_bottle"              && <PhysicsWaterBottle    params={params} simConfig={simConfig} />}
      {simType === "robot_arm"                 && <Arm />}
      {simType === "helicopter"                && <PhysicsHelicopter     params={params} simConfig={simConfig} />}
      {simType === "mechanical_gears"          && <PhysicsMechanicalGears params={params} simConfig={simConfig} />}
      {simType === "bicycle"                   && <PhysicsBicycle         params={params} simConfig={simConfig} />}
      {simType === "submarine"                 && <PhysicsSubmarine       params={params} simConfig={simConfig} />}
      {simType === "breadboard"                && <PhysicsBreadboard      params={params} simConfig={simConfig} />}
      {simType === "f1_car"                    && <PhysicsF1Car          params={params} simConfig={simConfig} />}
      {simType === "steam_engine"              && <PhysicsSteamEngine    params={params} simConfig={simConfig} />}

      {/* airplane → HighQualityModel (AI-generated geometry is fine for this) */}
      {simType === "airplane"                  && <HighQualityModel topic={topic || "airplane"} context="" />}

      {/* Unrecognized topic: prefer AI-generated R3F component (reactive, animated),
          fall back to procedural GLB if no code has been generated yet. */}
      {!isKnown && simType && simType !== "robot_arm" && simType !== "airplane" && (
        sceneCode
          ? <DynamicPhysicsScene code={sceneCode} params={params} simConfig={simConfig} topic={topic} onRegenerate={onRegenerate} agentSteps={agentSteps} />
          : (agentSteps?.length
            ? <DynamicPhysicsScene code={null} params={params} simConfig={simConfig} topic={topic} onRegenerate={onRegenerate} agentSteps={agentSteps} />
            : <ProceduralGLBModel topic={topic || simType} simType={simType} params={params} />)
      )}

      {showGround && isKnown && (
        <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={18} blur={2} far={8} resolution={512} />
      )}
    </>
  );
}

export default function PhysicsScene({ simType, params, simConfig, topic, sceneCode, onRegenerate, agentSteps }) {
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
        <SceneContent simType={simType} params={params} simConfig={simConfig} topic={topic} sceneCode={sceneCode} onRegenerate={onRegenerate} agentSteps={agentSteps} />
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
