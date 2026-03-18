"use client";

import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, ContactShadows } from "@react-three/drei";
import { useLoominStore } from "./store";
import * as THREE from "three";

import Arm from "./components/Arm";
import Turbine from "./components/Turbine";
import GenericVisual from "./components/GenericVisual";

function ResetCameraOnJournalChange({ mode }) {
  const activeId = useLoominStore((s) => s.activeId);
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!controls) return;
    // Adjust camera based on simulation type
    if (mode === 0) {
      // Turbine - look at hub height (hub is at y=8.5)
      camera.position.set(10, 8, 16);
      controls.target.set(0, 6, 0);
    } else if (mode === 1) {
      // Arm
      camera.position.set(6, 4, 8);
      controls.target.set(0, 2, 0);
    } else {
      // AI generated models - MUCH closer camera for better view
      camera.position.set(1.8, 1.5, 2.2);
      controls.target.set(0, 0.9, 0);
    }
    controls.update();
  }, [activeId, mode, camera, controls]);
  return null;
}

export default function Scene() {
  const activeId = useLoominStore((s) => s.activeId);
  const journals = useLoominStore((s) => s.journals);
  const active = journals.find((j) => j.id === activeId) || journals[0];
  const vars = active?.vars || {};
  
  // Check if user wants to generate something
  const editorValue = active?.editorValue || "";
  const trimmedContent = editorValue.trim();
  
  // Multiple ways to trigger generation:
  // 1. Simple topic: just letters/spaces (2+ chars, 1-5 words) like "sports car", "helicopter"
  const isSimpleTopic = trimmedContent.length >= 2 && 
                        trimmedContent.length <= 60 && 
                        /^[a-zA-Z][a-zA-Z\s\-]*$/i.test(trimmedContent) &&
                        trimmedContent.split(/\s+/).length <= 5;
  // 2. Explicit commands: "generate a car", "create a robot", etc.
  const hasGenerateCommand = /(?:generate|create|make|build|show\s*me|draw|render|visualize|display)\s+(?:a|an|the|some)?\s*[a-z]/i.test(editorValue);
  // 3. Topic headers: "# Car" or "Topic: Car"
  const hasTopicHeader = /^#\s*[a-z]/im.test(editorValue) || /(?:topic|subject|about):\s*[a-z]/i.test(editorValue);
  
  // Trigger generation if any condition is met
  const shouldGenerate = isSimpleTopic || hasGenerateCommand || hasTopicHeader;
  
  // -1 or undefined means "Waiting for input" (unless there's a generate command)
  const mode = vars.Scene_Mode !== undefined ? vars.Scene_Mode : (shouldGenerate ? 2 : -1);

  if (mode === -1) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/30">
              <div className="w-16 h-16 border-2 border-white/10 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">?</span>
              </div>
              <p className="text-sm font-mono">Type "generate a [object]" to create a 3D model</p>
          </div>
      );
  }

  // Determine ground position based on mode
  const groundY = mode === 0 ? 0 : 0;
  // MUCH closer camera for AI generated models
  const cameraPos = mode === 0 ? [10, 8, 16] : [1.8, 1.5, 2.2];

  return (
    <Canvas 
      shadows 
      dpr={[1, 2]} 
      camera={{ fov: 32, position: cameraPos }}
      gl={{ 
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2
      }}
    >
      <ResetCameraOnJournalChange mode={mode} />
      
      {/* Enhanced lighting setup */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-5, 10, -5]} intensity={0.5} color="#b4c6ef" />
      <spotLight position={[0, 15, 0]} angle={0.4} penumbra={1} intensity={0.8} castShadow />
      <pointLight position={[-10, 5, -10]} intensity={0.3} color="#ffd4a3" />
      
      <Suspense fallback={null}>
        <Environment preset="sunset" background={false} />

        {mode === 0 && <Turbine />}
        {mode === 1 && <Arm />}
        {mode >= 2 && <GenericVisual />}

        <ContactShadows 
          position={[0, groundY, 0]} 
          opacity={0.6} 
          scale={30} 
          blur={2} 
          far={8}
          resolution={1024}
        />
        
        {/* Reflective ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.01, 0]} receiveShadow>
          <circleGeometry args={[30, 128]} />
          <meshStandardMaterial 
            color="#0c1222" 
            roughness={0.7} 
            metalness={0.1}
            envMapIntensity={0.5}
          />
        </mesh>

        <OrbitControls 
          makeDefault 
          minDistance={0.1} 
          maxDistance={25} 
          target={mode === 0 ? [0, 6, 0] : [0, 0.9, 0]}
          enableDamping
          dampingFactor={0.05}
        />
      </Suspense>
    </Canvas>
  );
}