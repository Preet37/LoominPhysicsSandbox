"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html, useGLTF, Center, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

// High-quality 3D model loader for Tripo3D generated models
export default function Tripo3DModel({ topic, onFallback }) {
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [lastTopic, setLastTopic] = useState(null);
  const groupRef = useRef();

  // Generate model when topic changes
  useEffect(() => {
    if (!topic || topic === 'generic') return;
    if (topic === lastTopic) return;
    
    const generateModel = async () => {
      setLoading(true);
      setError(null);
      setProgress(0);
      setLastTopic(topic);
      
      try {
        // Call Tripo3D API
        const response = await fetch('/api/generate-3d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt: `High quality 3D model of ${topic}, detailed, realistic`,
            style: 'realistic'
          })
        });
        
        const data = await response.json();
        
        if (data.success && data.modelUrl) {
          setModelData(data);
          setLoading(false);
        } else if (data.fallback) {
          // Fall back to primitive generation
          console.log('Tripo3D fallback:', data.error);
          setError(data.error);
          setLoading(false);
          if (onFallback) onFallback(topic);
        } else {
          setError(data.error || 'Failed to generate model');
          setLoading(false);
        }
      } catch (err) {
        console.error('Tripo3D error:', err);
        setError('Network error');
        setLoading(false);
        if (onFallback) onFallback(topic);
      }
    };

    generateModel();
  }, [topic]);

  // Gentle rotation
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2;
    }
  });

  if (loading) {
    return (
      <group position={[0, 2, 0]}>
        <LoadingSpinner progress={progress} topic={topic} />
      </group>
    );
  }

  if (error || !modelData?.modelUrl) {
    return (
      <group position={[0, 2, 0]}>
        <mesh>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#f59e0b" wireframe />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-amber-500/30 text-center max-w-[280px]">
            <p className="text-sm text-amber-400">{error || 'Tripo3D unavailable'}</p>
            <p className="text-xs text-white/50 mt-1">Falling back to primitive generation</p>
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[0, 1, 0]}>
      <Suspense fallback={<LoadingSpinner topic={topic} />}>
        <GLBModel url={modelData.modelUrl} />
      </Suspense>
      
      <Html position={[0, -2.5, 0]} center>
        <div className="bg-slate-900/95 px-5 py-3 rounded-xl border border-emerald-500/30 text-center max-w-[260px] backdrop-blur-sm">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <p className="text-[10px] text-emerald-400/90 uppercase tracking-widest font-medium">Tripo3D</p>
          </div>
          <p className="text-base font-semibold text-white capitalize">{topic}</p>
          <p className="text-[10px] text-white/40 mt-1">Real 3D Model</p>
        </div>
      </Html>
    </group>
  );
}

// GLB Model Loader Component
function GLBModel({ url }) {
  const groupRef = useRef();
  const [model, setModel] = useState(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    
    loader.load(
      url,
      (gltf) => {
        // Center and scale the model
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        // Scale to fit in a 3 unit box
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.sub(center.multiplyScalar(scale));
        
        // Enable shadows on all meshes
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Enhance materials
            if (child.material) {
              child.material.envMapIntensity = 1.5;
            }
          }
        });
        
        setModel(gltf.scene);
      },
      (progress) => {
        console.log('Loading:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
      },
      (error) => {
        console.error('GLB load error:', error);
      }
    );
  }, [url]);

  if (!model) {
    return (
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="#6366f1" wireframe />
      </mesh>
    );
  }

  return <primitive ref={groupRef} object={model} />;
}

// Loading animation
function LoadingSpinner({ progress = 0, topic }) {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.8;
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <torusGeometry args={[1, 0.3, 16, 32]} />
        <meshStandardMaterial 
          color="#10b981" 
          wireframe 
          emissive="#10b981"
          emissiveIntensity={0.3}
        />
      </mesh>
      <Html center>
        <div className="bg-slate-900/95 px-5 py-4 rounded-xl border border-emerald-500/30 text-center backdrop-blur-sm min-w-[200px]">
          <div className="flex items-center gap-2 justify-center mb-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            <p className="text-sm text-emerald-400">Generating with Tripo3D...</p>
          </div>
          <p className="text-xs text-white/60 capitalize">{topic}</p>
          {progress > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-white/40 mt-1">{progress}%</p>
            </div>
          )}
          <p className="text-[10px] text-white/30 mt-2">This may take 30-60 seconds</p>
        </div>
      </Html>
    </>
  );
}
