"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useLoominStore } from "../store";

// HIGH QUALITY MODEL RENDERER
// Renders AI-generated component specifications at the quality level of Arm.jsx and Turbine.jsx
// Features: nested parts, parameter bindings, animations, physics, HUD

export default function HighQualityModel({ topic, context = "" }) {
  const [componentData, setComponentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verifyState, setVerifyState] = useState({ status: "idle", attempt: 0, issues: [] });
  const verifyRef = useRef({ inFlight: false, lastKey: null });
  const { gl, camera, scene } = useThree();

  // Get data from store
  const activeId = useLoominStore((s) => s.activeId);
  const journals = useLoominStore((s) => s.journals);
  const setGeneratedModel = useLoominStore((s) => s.setGeneratedModel);
  const active = journals.find((j) => j.id === activeId) || journals[0];
  const vars = active?.vars || {};
  const cachedModel = active?.generatedModel;
  const cachedTopic = active?.generatedTopic;

  const generateComponent = useCallback(async ({ feedback = null, attempt = 0, force = false } = {}) => {
    if (!topic) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-3d-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, feedback, attempt })
      });

      const data = await response.json();

      if (data.success && data.component) {
        console.log('Generation complete:', data.partCount, 'parts, source:', data.source);
        setComponentData(data.component);
        setGeneratedModel(data.component, topic);
        setVerifyState((prev) => ({ ...prev, status: "idle" }));
      } else {
        setError(data.error || 'Failed to generate');
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [topic, setGeneratedModel]);

  // Check if we have a cached model for this topic
  useEffect(() => {
    if (!topic) return;

    setVerifyState({ status: "idle", attempt: 0, issues: [] });
    verifyRef.current.lastKey = null;
    verifyRef.current.inFlight = false;

    // If we already have a cached model for this exact topic, use it
    if (cachedModel && cachedTopic === topic) {
      console.log('Using cached model for:', topic);
      setComponentData(cachedModel);
      setLoading(false);
      return;
    }

    // Only regenerate if topic changed
    if (cachedTopic === topic) return;

    const timer = setTimeout(() => generateComponent(), 500);
    return () => clearTimeout(timer);
  }, [topic, cachedModel, cachedTopic, activeId, generateComponent]);

  // Verify with Gemini and retry if needed
  useEffect(() => {
    if (!componentData || !topic || verifyRef.current.inFlight) return;
    if (verifyState.status === "failed" || verifyState.status === "verified") return;

    const key = `${topic}:${componentData.parts?.length || 0}:${verifyState.attempt}`;
    if (verifyRef.current.lastKey === key) return;

    const MAX_ATTEMPTS = 2;
    if (verifyState.attempt > MAX_ATTEMPTS) {
      verifyRef.current.lastKey = key;
      setVerifyState((prev) => ({ ...prev, status: "failed" }));
      return;
    }

    verifyRef.current.inFlight = true;
    setVerifyState((prev) => ({ ...prev, status: "verifying" }));

    const timer = setTimeout(async () => {
      try {
        const dataUrl = gl.domElement.toDataURL('image/png');
        const imageBase64 = dataUrl.split(',')[1];

        const response = await fetch('/api/verify-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Send both the screenshot (for Gemini vision) and the component data
          // (for the text-based NVIDIA/Groq fallback when no Gemini key is present)
          body: JSON.stringify({ description: topic, imageBase64, component: componentData })
        });

        const result = await response.json();
        const verified = result?.verified === true || (result?.score ?? 0) >= 70;

        if (result?.success !== true) {
          verifyRef.current.lastKey = key;
          setVerifyState((prev) => ({ ...prev, status: "failed", issues: result?.issues || [] }));
          return;
        }

        if (verified) {
          verifyRef.current.lastKey = key;
          setVerifyState({ status: "verified", attempt: verifyState.attempt, issues: result?.issues || [] });
        } else if (verifyState.attempt < MAX_ATTEMPTS) {
          const feedback = [
            ...(result?.issues || []),
            ...(result?.suggestions || [])
          ].join("; ");
          setVerifyState((prev) => ({ ...prev, status: "retrying", attempt: prev.attempt + 1, issues: result?.issues || [] }));
          await generateComponent({ feedback, attempt: verifyState.attempt + 1, force: true });
        } else {
          verifyRef.current.lastKey = key;
          setVerifyState({ status: "failed", attempt: verifyState.attempt, issues: result?.issues || [] });
        }
      } catch (err) {
        console.error("Verification error:", err);
        setVerifyState((prev) => ({ ...prev, status: "failed" }));
      } finally {
        verifyRef.current.inFlight = false;
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [componentData, topic, gl, generateComponent, verifyState.attempt, verifyState.status]);

  if (loading) {
    return <LoadingIndicator topic={topic} />;
  }

  if (error || !componentData) {
    return (
      <group position={[0, 2, 0]}>
        <mesh>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe />
        </mesh>
        <Html center>
          <div className="bg-red-900/90 px-4 py-2 rounded-xl text-white text-sm">
            {error || 'No data'}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <ComponentRenderer 
      component={componentData} 
      vars={vars} 
      verifyState={verifyState}
    />
  );
}

// MAIN COMPONENT RENDERER
function ComponentRenderer({ component, vars, verifyState }) {
  const groupRef = useRef();
  const partsRef = useRef({});
  const [physicsState, setPhysicsState] = useState({ stress: 0, isCritical: false });

  const [fit, setFit] = useState({ scale: 1, offset: [0, 0, 0] });

  useEffect(() => {
    setFit({ scale: 1, offset: [0, 0, 0] });
    if (!groupRef.current) return;

    const frame = requestAnimationFrame(() => {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const height = Math.max(0.1, size.y || 0.1);
      const targetHeight = 3.2;
      let scale = targetHeight / height;
      scale = Math.max(0.6, Math.min(6, scale));

      const offset = [
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale
      ];

      setFit((prev) => {
        const diff =
          Math.abs(prev.scale - scale) +
          Math.abs(prev.offset[0] - offset[0]) +
          Math.abs(prev.offset[1] - offset[1]) +
          Math.abs(prev.offset[2] - offset[2]);
        if (diff < 0.01) return prev;
        return { scale, offset };
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [component.parts]);

  // Build parent-child hierarchy
  const { rootParts, childMap } = useMemo(() => {
    const childMap = {};
    const rootParts = [];

    component.parts.forEach(part => {
      if (part.parent) {
        if (!childMap[part.parent]) childMap[part.parent] = [];
        childMap[part.parent].push(part);
      } else {
        rootParts.push(part);
      }
    });

    return { rootParts, childMap };
  }, [component.parts]);

  // Get material from definition
  const getMaterial = (part) => {
    if (part.customMaterial) {
      return part.customMaterial;
    }
    return component.materials[part.material] || component.materials.primary;
  };

  // Calculate physics
  useFrame((state, delta) => {
    if (component.physics?.stressFormula) {
      try {
        // Simple eval for physics (in production, use a safer method)
        const windSpeed = vars.Wind_Speed ?? 20;
        const bladeCount = vars.Blade_Count ?? 3;
        const speed = vars.Speed ?? 0;
        const rpm = vars.Engine_RPM ?? 0;
        
        // Safe formula evaluation
        let stress = 0;
        const formula = component.physics.stressFormula.toLowerCase();
        if (formula.includes('windspeed') && formula.includes('bladecount')) {
          stress = (windSpeed * bladeCount) / 200;
        } else if (formula.includes('speed')) {
          stress = speed / 100;
        } else if (formula.includes('rpm')) {
          stress = rpm / 8000;
        }
        
        const isCritical = stress > (component.physics.criticalThreshold || 1.5);
        setPhysicsState({ stress, isCritical });
      } catch (e) {
        // Ignore formula errors
      }
    }
  });

  return (
    <>
      {/* 3D Model Group */}
      <group ref={groupRef} position={fit.offset} scale={fit.scale}>
        {/* Render root parts and their children recursively */}
        {rootParts.map(part => (
          <PartRenderer
            key={part.id}
            part={part}
            childMap={childMap}
            materials={component.materials}
            vars={vars}
            physics={physicsState}
            partsRef={partsRef}
            parameters={component.parameters}
          />
        ))}

        {/* Ground shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <circleGeometry args={[4, 64]} />
          <meshStandardMaterial color="#0a0f1a" roughness={0.95} metalness={0.05} />
        </mesh>
      </group>

      {/* HUD - Fixed to screen corners, never covers model */}
      <Html
        calculatePosition={() => [0, 0, 0]}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 1000
        }}
      >
        {/* TOP RIGHT - Stats panel */}
        {component.hud && (
          <div style={{ 
            position: "absolute", 
            top: 16, 
            right: 16,
            pointerEvents: "none"
          }}>
            <div className="select-none rounded-xl bg-black/80 ring-1 ring-white/20 backdrop-blur-xl px-3 py-2 text-[10px] text-white/85 min-w-[160px]">
              <div className="text-emerald-400/80 tracking-[0.12em] uppercase text-[9px] mb-1 font-medium">
                {component.hud.title || component.name}
              </div>

              {verifyState?.status && verifyState.status !== "idle" && (
                <div className="mb-1 text-[9px] text-white/60">
                  Verification: {verifyState.status}
                </div>
              )}
              
              {component.hud.displays?.map((display, i) => {
                const value = vars[display.parameter] ?? 
                  component.parameters?.find(p => p.name === display.parameter)?.default ?? 0;
                return (
                  <div key={i} className="flex items-center justify-between mt-0.5">
                    <span className="text-white/50">{display.label}</span>
                    <span className="font-medium text-white/90">
                      {typeof value === 'number' ? value.toFixed(1) : value}{display.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TOP LEFT - AI Generated label */}
        <div style={{ 
          position: "absolute", 
          top: 16, 
          left: 16,
          pointerEvents: "none"
        }}>
          <div className="bg-slate-900/90 px-3 py-2 rounded-lg border border-emerald-500/40 text-left">
            <p className="text-[8px] text-emerald-400 uppercase tracking-wider font-medium">AI Generated</p>
            <p className="text-sm font-semibold text-white mt-0.5">{component.name}</p>
            <p className="text-[9px] text-white/50">{component.parts?.length} parts</p>
          </div>
        </div>
      </Html>
    </>
  );
}

// RECURSIVE PART RENDERER
function PartRenderer({ part, childMap, materials, vars, physics, partsRef, parameters }) {
  const meshRef = useRef();
  const groupRef = useRef();

  // Get material
  const mat = part.customMaterial || materials?.[part.material] || materials?.primary || {
    color: "#E7E9EE",
    roughness: 0.5,
    metalness: 0.2,
    emissive: "#000000",
    emissiveIntensity: 0
  };

  // Apply parameter bindings to get current values
  const { position, rotation, scale } = useMemo(() => {
    let pos = [...(part.position || [0, 0, 0])];
    let rot = [...(part.rotation || [0, 0, 0])];
    let scl = [1, 1, 1];
    if (part.scale !== undefined) {
      if (Array.isArray(part.scale)) {
        scl = [...part.scale];
      } else if (typeof part.scale === "number") {
        scl = [part.scale, part.scale, part.scale];
      }
    }

    if (part.parameterBindings) {
      Object.entries(part.parameterBindings).forEach(([prop, binding]) => {
        const paramValue = vars[binding.parameter] ?? 
          parameters?.find(p => p.name === binding.parameter)?.default ?? 0;
        const value = paramValue * (binding.scale || 1) + (binding.offset || 0);

        if (prop.startsWith('rotation.')) {
          const axis = prop.split('.')[1];
          const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
          rot[idx] = value;
        } else if (prop.startsWith('position.')) {
          const axis = prop.split('.')[1];
          const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
          pos[idx] = value;
        } else if (prop.startsWith('scale.')) {
          const axis = prop.split('.')[1];
          const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
          scl[idx] = value;
        }
      });
    }

    return { position: pos, rotation: rot, scale: scl };
  }, [part, vars, parameters]);

  // Animation
  useFrame((state, delta) => {
    if (!groupRef.current || !part.animation) return;

    const anim = part.animation;
    const speed = anim.speed || 1;
    const amp = anim.amplitude || 1;

    // Get parameter value if animation is tied to a parameter
    let paramMultiplier = 1;
    if (anim.parameter && vars[anim.parameter] !== undefined) {
      paramMultiplier = vars[anim.parameter] / 50; // Normalize to ~1
    }

    const axisIdx = anim.axis === 'x' ? 0 : anim.axis === 'y' ? 1 : 2;

    switch (anim.type) {
      case 'rotate':
        groupRef.current.rotation[anim.axis] += delta * speed * paramMultiplier;
        break;
      case 'oscillate':
        const osc = Math.sin(state.clock.elapsedTime * speed) * amp * 0.1;
        if (anim.axis === 'x') groupRef.current.position.x = position[0] + osc;
        if (anim.axis === 'y') groupRef.current.position.y = position[1] + osc;
        if (anim.axis === 'z') groupRef.current.position.z = position[2] + osc;
        break;
      case 'pulse':
        const scale = 1 + Math.sin(state.clock.elapsedTime * speed) * 0.05 * amp;
        groupRef.current.scale.setScalar(scale);
        break;
    }

    // Physics effects
    if (physics.isCritical && part.id.includes('blade') || part.id.includes('rotor')) {
      groupRef.current.position.x += (Math.random() - 0.5) * 0.02;
      groupRef.current.position.y += (Math.random() - 0.5) * 0.02;
    }
  });

  // Store ref
  useEffect(() => {
    if (meshRef.current) {
      partsRef.current[part.id] = meshRef.current;
    }
  }, [part.id]);

  // Children of this part
  const children = childMap[part.id] || [];

  // Critical color override
  const finalColor = physics.isCritical && (part.id?.includes('indicator') || part.id?.includes('warning'))
    ? '#ef4444'
    : mat.color;

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <MeshByType
        ref={meshRef}
        type={part.type}
        args={part.args}
        points={part.points}
        segments={part.segments}
        material={{
          ...mat,
          color: finalColor,
          emissive: physics.isCritical && part.id.includes('indicator') ? '#dc2626' : (mat.emissive || '#000000'),
          emissiveIntensity: physics.isCritical && part.id.includes('indicator') ? 0.5 : (mat.emissiveIntensity || 0)
        }}
        castShadow={part.castShadow !== false}
        receiveShadow={part.receiveShadow !== false}
      />

      {/* Render children */}
      {children.map(child => (
        <PartRenderer
          key={child.id}
          part={child}
          childMap={childMap}
          materials={materials}
          vars={vars}
          physics={physics}
          partsRef={partsRef}
          parameters={parameters}
        />
      ))}
    </group>
  );
}

function LatheMesh({ points, segments = 64, material, castShadow, receiveShadow }) {
  const geometry = useMemo(() => {
    const safePoints = Array.isArray(points) ? points : [];
    const vec2 = safePoints.map((p) => new THREE.Vector2(p[0], p[1]));
    return new THREE.LatheGeometry(vec2, Math.max(12, segments));
  }, [points, segments]);

  return (
    <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
      <primitive attach="geometry" object={geometry} />
      <meshStandardMaterial {...material} />
    </mesh>
  );
}

// MESH BY TYPE - renders different geometry types
const MeshByType = ({ type, args, material, castShadow, receiveShadow, points, segments }) => {
  const matProps = {
    color: material.color || '#E7E9EE',
    roughness: material.roughness ?? 0.5,
    metalness: material.metalness ?? 0.2,
    emissive: material.emissive || '#000000',
    emissiveIntensity: material.emissiveIntensity || 0
  };

  switch (type) {
    case 'box':
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <boxGeometry args={args} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'cylinder':
      // Cylinders are vertical by default - rotate 90° on Z for wheel orientation
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <cylinderGeometry args={[args[0], args[1] || args[0], args[2] || 1, args[3] || 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'sphere':
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <sphereGeometry args={[args[0] || 1, args[1] || 32, args[2] || 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'capsule':
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <capsuleGeometry args={[args[0] || 0.5, args[1] || 1, args[2] || 8, args[3] || 16]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'cone':
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <coneGeometry args={[args[0] || 0.5, args[1] || 1, args[2] || 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'torus':
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <torusGeometry args={[args[0] || 1, args[1] || 0.3, args[2] || 16, args[3] || 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );

    case 'roundedBox':
      return (
        <RoundedBox 
          args={args.slice(0, 3)} 
          radius={args[3] || 0.1} 
          smoothness={12} 
          castShadow={castShadow} 
          receiveShadow={receiveShadow}
        >
          <meshStandardMaterial {...matProps} />
        </RoundedBox>
      );
    case 'lathe':
      return (
        <LatheMesh
          points={points}
          segments={segments}
          material={matProps}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      );

    default:
      return (
        <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
          <boxGeometry args={args || [1, 1, 1]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );
  }
};

// LOADING INDICATOR
function LoadingIndicator({ topic }) {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.7;
    }
  });

  return (
    <group position={[0, 2, 0]}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshStandardMaterial 
          color="#10b981" 
          wireframe 
          emissive="#10b981"
          emissiveIntensity={0.3}
        />
      </mesh>
      <Html center>
        <div className="bg-slate-900/95 px-6 py-4 rounded-xl border border-emerald-500/30 text-center backdrop-blur-sm">
          <div className="flex items-center gap-2 justify-center mb-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            <p className="text-sm text-emerald-400">Generating High-Quality Model...</p>
          </div>
          <p className="text-xs text-white/60 capitalize">{topic}</p>
          <p className="text-[10px] text-white/30 mt-2">Creating detailed meshes, materials & parameters</p>
        </div>
      </Html>
    </group>
  );
}
