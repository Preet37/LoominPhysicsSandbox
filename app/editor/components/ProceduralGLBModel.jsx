"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import { Html } from "@react-three/drei";

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

function RenderWorkerHelp({ error }) {
  return (
    <Html center>
      <div className="bg-slate-900/95 px-5 py-4 rounded-xl border border-amber-500/35 text-left max-w-[400px] backdrop-blur-sm shadow-xl">
        <p className="text-sm font-semibold text-amber-300 mb-1">High-quality CAD path unavailable</p>
        <p className="text-xs text-white/55 leading-relaxed mb-3">
          {error || "The render worker is not running."}
          {" "}
          High Quality builds real GLB meshes via Blender + OpenSCAD — not Three.js boxes.
        </p>
        <p className="text-[11px] text-white/40 mb-2">Fix:</p>
        <p className="text-[11px] font-mono text-emerald-300/90 bg-black/40 rounded-lg px-3 py-2 leading-relaxed">
          Stop the dev server (Ctrl+C), then:<br />
          pnpm dev
        </p>
        <p className="text-[10px] text-white/35 mt-2">
          That starts Next.js and the CAD worker together. Then refresh this page.
          Use <span className="text-amber-300">Fast</span> mode for a quick Three.js preview without CAD.
        </p>
      </div>
    </Html>
  );
}

export default function ProceduralGLBModel({
  topic,
  simType,
  params = {},
  specSheet = null,
  reloadToken = 0,
}) {
  const cacheRef = useRef(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [meta, setMeta] = useState(null);

  const reqKey = useMemo(() => {
    const specId = specSheet?.referenceProduct || "";
    return `${String(topic || simType || "")}::${String(simType || "")}::${specId}::${reloadToken}`;
  }, [topic, simType, specSheet?.referenceProduct, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    let prevUrl = null;

    async function run() {
      setError(null);
      setLoading(true);
      setObjectUrl(null);

      const cached = cacheRef.current.get(reqKey);
      if (cached?.glbBase64) {
        const url = base64ToObjectUrl(cached.glbBase64);
        prevUrl = url;
        if (!cancelled) {
          setObjectUrl(url);
          setMeta(cached);
        }
        setLoading(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 200));
      if (cancelled) return;

      // The route looks up the shared model library first and only researches a
      // spec sheet on a miss, so asking for one here would defeat the cache.
      const res = await fetch("/api/geometry-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || simType,
          simType,
          params,
          specSheet: specSheet?.dimensions?.length ? specSheet : null,
        }),
      });

      const data = await res.json();
      if (!data?.success || !data?.glbBase64) {
        throw new Error(data?.error || "Geometry render failed");
      }

      cacheRef.current.set(reqKey, data);
      const url = base64ToObjectUrl(data.glbBase64);
      prevUrl = url;
      if (!cancelled) {
        setObjectUrl(url);
        setMeta(data);
      }
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
  }, [reqKey, topic, simType, params, specSheet]);

  if (error) {
    return (
      <group>
        <RenderWorkerHelp error={error} />
      </group>
    );
  }

  if (loading && !objectUrl) {
    return (
      <group position={[0, 1.5, 0]}>
        <mesh>
          <icosahedronGeometry args={[1.0, 1]} />
          <meshStandardMaterial color="#10b981" wireframe opacity={0.7} transparent />
        </mesh>
        <Html center>
          <div className="bg-slate-900/95 px-4 py-3 rounded-xl border border-emerald-500/25 text-center backdrop-blur-sm max-w-[300px]">
            <p className="text-sm text-emerald-400 font-medium">Building CAD geometry…</p>
            <p className="text-xs text-white/45 mt-1">{specSheet?.referenceProduct || topic || simType}</p>
            <p className="text-[10px] text-white/30 mt-1">Blender / OpenSCAD → GLB</p>
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
