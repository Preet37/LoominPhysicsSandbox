"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useLoominStore } from "../store";

export default function Turbine() {
  const rotorRef = useRef();
  
  // READ REAL-TIME VARIABLES
  const activeId = useLoominStore((s) => s.activeId);
  const journals = useLoominStore((s) => s.journals);
  const active = journals.find((j) => j.id === activeId) || journals[0];
  const vars = active?.vars || {};

  const bladeCount = Math.max(1, Math.min(12, vars.Blade_Count || 3));
  const windSpeed = vars.Wind_Speed !== undefined ? vars.Wind_Speed : 20;
  
  // PHYSICS: Stress calculation
  const stressLevel = (windSpeed * bladeCount) / 200; 
  const isCritical = stressLevel > 1.5; 

  useFrame((state, delta) => {
    if (!rotorRef.current) return;
    
    // Spin the rotor around Z axis (like a pinwheel facing you)
    const baseSpeed = 0.5;
    const rotationSpeed = Math.max(baseSpeed, windSpeed * 0.08) * delta;
    rotorRef.current.rotation.z += rotationSpeed;

    // Wobble effect on critical failure
    if (isCritical) {
       rotorRef.current.position.x = (Math.random() - 0.5) * 0.1;
       rotorRef.current.position.y = 8.5 + (Math.random() - 0.5) * 0.1;
    } else {
       rotorRef.current.position.x = 0;
       rotorRef.current.position.y = 8.5;
    }
  });

  const bladeLength = 4.5;
  const bladeWidth = 0.5;

  return (
    <group position={[0, 0, 0]}>
      {/* BASE FOUNDATION */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[1.0, 1.2, 0.3, 32]} />
        <meshStandardMaterial color="#4b5563" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* TOWER */}
      <mesh position={[0, 4.5, 0]}>
        <cylinderGeometry args={[0.2, 0.45, 8.5, 32]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* NACELLE (housing at top) - points forward in Z */}
      <mesh position={[0, 8.5, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>

      {/* ROTOR ASSEMBLY - rotates around Z axis */}
      <group position={[0, 8.5, 1.2]} ref={rotorRef}>
        {/* Hub (nose cone) - pointing forward */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.25]}>
          <coneGeometry args={[0.35, 0.5, 32]} />
          <meshStandardMaterial 
            color={isCritical ? "#ef4444" : "#f1f5f9"} 
            emissive={isCritical ? "#dc2626" : "#000000"}
            emissiveIntensity={isCritical ? 0.5 : 0}
            metalness={0.3} 
            roughness={0.5} 
          />
        </mesh>
        
        {/* Hub back plate */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.12, 32]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* BLADES - distributed around Z axis, extending outward in XY plane */}
        {Array.from({ length: bladeCount }).map((_, i) => {
          const angle = (i / bladeCount) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, 0, angle]}>
              {/* Blade - extends upward in local +Y (which rotates with the group) */}
              <mesh position={[0, bladeLength / 2 + 0.4, 0]}>
                <boxGeometry args={[bladeWidth, bladeLength, 0.12]} />
                <meshStandardMaterial 
                  color={isCritical ? "#fca5a5" : "#ffffff"} 
                  roughness={0.4}
                  metalness={0.1}
                />
              </mesh>
              {/* Blade tip - rounded end */}
              <mesh position={[0, bladeLength + 0.6, 0]}>
                <boxGeometry args={[bladeWidth * 0.6, 0.5, 0.1]} />
                <meshStandardMaterial 
                  color={isCritical ? "#fca5a5" : "#f0f0f0"} 
                  roughness={0.3}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}