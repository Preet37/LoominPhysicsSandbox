"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";

// High-quality procedural model renderer
export default function ProceduralModel({ topic, context }) {
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastTopic, setLastTopic] = useState(null);
  const groupRef = useRef();

  // Fetch model when topic changes (with debounce to avoid spam)
  useEffect(() => {
    if (!topic || topic === 'generic') return;
    if (topic === lastTopic) return; // Don't refetch same topic
    
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      setLastTopic(topic);
      
      fetch('/api/generate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, context: context?.slice(0, 500) })
      })
        .then(res => res.json())
        .then(data => {
          if (data.model && data.model.parts) {
            setModelData(data.model);
          } else {
            setError('Invalid model data');
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to generate model:', err);
          setError('Failed to generate model');
          setLoading(false);
        });
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [topic]);

  // Gentle rotation for the whole model
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  if (loading) {
    return (
      <group position={[0, 2, 0]}>
        <LoadingIndicator topic={topic} />
      </group>
    );
  }

  if (error || !modelData) {
    return (
      <group position={[0, 2, 0]}>
        <mesh>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe opacity={0.5} transparent />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-red-500/30 text-center">
            <p className="text-sm text-red-400">{error || 'No model data'}</p>
            <p className="text-xs text-white/40 mt-1">Try a different topic</p>
          </div>
        </Html>
      </group>
    );
  }

  const scale = modelData.scale || 1;

  return (
    <group ref={groupRef} position={[0, 2, 0]} scale={[scale, scale, scale]}>
      {modelData.parts?.map((part, index) => (
        <HighQualityPart key={part.id || index} part={part} />
      ))}
      
      <Html position={[0, -3.5 / scale, 0]} center>
        <div className="bg-slate-900/95 px-5 py-3 rounded-xl border border-emerald-500/20 text-center max-w-[240px] backdrop-blur-sm">
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-widest font-medium">AI Generated</p>
          <p className="text-base font-semibold text-white capitalize mt-0.5">{modelData.name || topic}</p>
          {modelData.description && (
            <p className="text-xs text-white/50 mt-1 line-clamp-2">{modelData.description}</p>
          )}
          <p className="text-[10px] text-white/30 mt-2">{modelData.parts?.length || 0} parts</p>
        </div>
      </Html>
    </group>
  );
}

// Loading animation
function LoadingIndicator({ topic }) {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.7;
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial 
          color="#6366f1" 
          wireframe 
          emissive="#6366f1"
          emissiveIntensity={0.3}
        />
      </mesh>
      <Html center>
        <div className="bg-slate-900/95 px-5 py-3 rounded-xl border border-indigo-500/30 text-center backdrop-blur-sm">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-sm text-indigo-400 mt-2">Generating 3D model...</p>
          <p className="text-xs text-white/50 mt-1 capitalize">{topic}</p>
        </div>
      </Html>
    </>
  );
}

// High-quality individual part with better materials
function HighQualityPart({ part }) {
  const meshRef = useRef();
  const initialPos = useRef(part.position || [0, 0, 0]);
  
  // Create high-quality geometry with proper segment counts
  const geometry = useMemo(() => {
    const args = part.args || [];
    switch (part.type) {
      case 'box':
        // Add beveled edges for boxes
        return new THREE.BoxGeometry(
          args[0] || 1, 
          args[1] || 1, 
          args[2] || 1,
          4, 4, 4 // More segments for smoother shading
        );
      case 'sphere':
        return new THREE.SphereGeometry(
          args[0] || 0.5, 
          args[1] || 64, 
          args[2] || 64
        );
      case 'cylinder':
        return new THREE.CylinderGeometry(
          args[0] || 0.5, 
          args[1] || 0.5, 
          args[2] || 1, 
          args[3] || 64,
          1,
          false
        );
      case 'cone':
        return new THREE.ConeGeometry(
          args[0] || 0.5, 
          args[1] || 1, 
          args[2] || 64
        );
      case 'torus':
        return new THREE.TorusGeometry(
          args[0] || 0.5, 
          args[1] || 0.2, 
          args[2] || 32, 
          args[3] || 64
        );
      case 'capsule':
        return new THREE.CapsuleGeometry(
          args[0] || 0.5, 
          args[1] || 1, 
          args[2] || 16, 
          args[3] || 32
        );
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [part.type, JSON.stringify(part.args)]);

  // High-quality physically-based material
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: part.color || '#888888',
      metalness: part.metalness ?? 0.3,
      roughness: part.roughness ?? 0.5,
      envMapIntensity: 1.5, // Enhanced environment reflections
      flatShading: false,
    });
    
    // Add emissive if specified
    if (part.emissive) {
      mat.emissive = new THREE.Color(part.emissive);
      mat.emissiveIntensity = 0.8;
    }
    
    return mat;
  }, [part.color, part.metalness, part.roughness, part.emissive]);

  // Handle animations
  useFrame((state, delta) => {
    if (!meshRef.current || !part.animation) return;
    
    const { type, axis, speed = 1 } = part.animation;
    const axisKey = axis || 'y';
    
    switch (type) {
      case 'rotate':
      case 'spin':
        meshRef.current.rotation[axisKey] += delta * speed;
        break;
      case 'oscillate':
        const offset = Math.sin(state.clock.elapsedTime * speed) * 0.3;
        const basePos = initialPos.current;
        if (axisKey === 'y') meshRef.current.position.y = basePos[1] + offset;
        else if (axisKey === 'x') meshRef.current.position.x = basePos[0] + offset;
        else if (axisKey === 'z') meshRef.current.position.z = basePos[2] + offset;
        break;
      case 'pulse':
        const pulseScale = 1 + Math.sin(state.clock.elapsedTime * speed) * 0.1;
        meshRef.current.scale.setScalar(pulseScale);
        break;
    }
  });

  const position = part.position || [0, 0, 0];
  const rotation = part.rotation || [0, 0, 0];

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    />
  );
}
