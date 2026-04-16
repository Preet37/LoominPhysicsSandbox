"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import { Html } from "@react-three/drei";

function stableHash(obj) {
  try {
    const sorted = {};
    Object.keys(obj || {})
      .sort()
      .forEach((k) => {
        sorted[k] = obj[k];
      });
    return JSON.stringify(sorted);
  } catch {
    return String(obj);
  }
}

function base64ToObjectUrl(base64) {
  if (!base64) return null;
  const binary = typeof atob !== "undefined" ? atob(base64) : "";
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob);
}

function GLBModel({ url }) {
  const gltf = useLoader(GLTFLoader, url);
  const groupRef = useRef();

  useEffect(() => {
    const root = groupRef.current;
    if (!root) return;

    // Fit to a reasonable display size.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const height = Math.max(0.0001, size.y || 1);
    const targetHeight = 2.2;
    const s = targetHeight / height;

    root.position.sub(center);
    root.scale.setScalar(s);

    root.traverse?.((child) => {
      if (child?.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [gltf]);

  return <primitive ref={groupRef} object={gltf.scene} />;
}

export default function ProceduralGLBModel({ topic, simType, params = {} }) {
  const cacheRef = useRef(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);

  // Only regenerate when the TOPIC changes — physics params (pressure, speed, etc.)
  // don't affect the model geometry. Re-generating on every slider drag wastes 30s.
  const reqKey = useMemo(() => {
    return `${String(topic || simType || "")}::${String(simType || "")}`;
  }, [topic, simType]);

  useEffect(() => {
    let cancelled = false;
    let prevUrl = null;

    async function run() {
      setError(null);
      setLoading(true);

      const cached = cacheRef.current.get(reqKey);
      if (cached?.glbBase64) {
        const url = base64ToObjectUrl(cached.glbBase64);
        prevUrl = url;
        if (!cancelled) setObjectUrl(url);
        setLoading(false);
        return;
      }

      // Debounce-ish: callers will re-render rapidly; keep this component
      // from spamming the worker.
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;

      const res = await fetch("/api/geometry-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic || simType, simType, params }),
      });

      const data = await res.json();
      if (!data?.success || !data?.glbBase64) {
        throw new Error(data?.error || "Geometry render failed");
      }

      cacheRef.current.set(reqKey, data);

      const url = base64ToObjectUrl(data.glbBase64);
      prevUrl = url;
      if (!cancelled) setObjectUrl(url);
      setLoading(false);
    }

    run().catch((e) => {
      if (cancelled) return;
      setError(e?.message || "Geometry render failed");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [reqKey]);

  if (error) {
    return (
      <group>
        <mesh>
          <icosahedronGeometry args={[1.2, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-red-500/30 text-center max-w-[320px]">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Html>
      </group>
    );
  }

  if (loading && !objectUrl) {
    return (
      <group position={[0, 1.5, 0]}>
        <mesh>
          <icosahedronGeometry args={[1.0, 1]} />
          <meshStandardMaterial color="#10b981" wireframe opacity={0.7} />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-emerald-500/25 text-center backdrop-blur-sm">
            <p className="text-sm text-emerald-400">Rebuilding 3D geometry…</p>
            <p className="text-xs text-white/40 mt-1">{topic || simType}</p>
          </div>
        </Html>
      </group>
    );
  }

  if (!objectUrl) return null;

  return (
    <Suspense fallback={null}>
      <GLBModel url={objectUrl} />
    </Suspense>
  );
}

