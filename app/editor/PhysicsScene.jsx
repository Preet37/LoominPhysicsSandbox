"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

import PhysicsWindTurbine from "./components/PhysicsWindTurbine";
import PhysicsPendulum from "./components/PhysicsPendulum";
import PhysicsProjectile from "./components/PhysicsProjectile";
import PhysicsSpringMass from "./components/PhysicsSpringMass";
import PhysicsOrbit from "./components/PhysicsOrbit";
import Arm from "./components/Arm";

const SCENE_CONFIGS = {
  wind_turbine: { camera: [10, 8, 16], target: [0, 6, 0], fov: 35 },
  pendulum: { camera: [0, 3, 10], target: [0, 2, 0], fov: 40 },
  projectile: { camera: [0, 3, 12], target: [0, 1, 0], fov: 50 },
  spring_mass: { camera: [4, 2.5, 8], target: [0, 2, 0], fov: 40 },
  orbit: { camera: [0, 10, 10], target: [0, 0, 0], fov: 45 },
  robot_arm: { camera: [6, 4, 8], target: [0, 2, 0], fov: 35 },
  bridge: { camera: [0, 4, 14], target: [0, 1, 0], fov: 40 },
};

function SceneContent({ simType, params, simConfig }) {
  const groundY = simType === "orbit" ? 0 : 0;
  const showGround = simType !== "orbit";

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow shadow-mapSize={2048} />
      <directionalLight position={[-5, 10, -5]} intensity={0.4} color="#b4c6ef" />
      <pointLight position={[-8, 5, -8]} intensity={0.25} color="#ffd4a3" />

      <Environment preset="sunset" background={false} />

      {simType === "wind_turbine" && <PhysicsWindTurbine params={params} simConfig={simConfig} />}
      {simType === "pendulum" && <PhysicsPendulum params={params} simConfig={simConfig} />}
      {simType === "projectile" && <PhysicsProjectile params={params} simConfig={simConfig} />}
      {simType === "spring_mass" && <PhysicsSpringMass params={params} simConfig={simConfig} />}
      {simType === "orbit" && <PhysicsOrbit params={params} simConfig={simConfig} />}
      {simType === "robot_arm" && <Arm />}

      {showGround && (
        <ContactShadows
          position={[0, groundY, 0]}
          opacity={0.5}
          scale={20}
          blur={2}
          far={8}
          resolution={512}
        />
      )}
    </>
  );
}

export default function PhysicsScene({ simType, params, simConfig }) {
  const cfg = SCENE_CONFIGS[simType] || SCENE_CONFIGS.wind_turbine;

  if (!simType) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/30">
        <div className="w-16 h-16 border-2 border-white/10 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">⚛</span>
        </div>
        <p className="text-sm font-mono text-center px-8">
          Type a physics topic above and click Generate to start the simulation
        </p>
      </div>
    );
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: cfg.fov, position: cfg.camera }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
    >
      <Suspense fallback={null}>
        <SceneContent simType={simType} params={params} simConfig={simConfig} />
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
