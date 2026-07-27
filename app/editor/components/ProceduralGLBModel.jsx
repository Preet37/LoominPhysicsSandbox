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

function RenderWorkerHelp({ error, onRetry }) {
  const workerDown = /worker|CAD|render worker/i.test(error || "");
  const isProductionHint = /RENDER_WORKER_URL|hosted|deployment|Vercel/i.test(error || "");
  return (
    <Html center>
      <div className="bg-slate-900/95 px-5 py-4 rounded-xl border border-amber-500/35 text-left max-w-[400px] backdrop-blur-sm shadow-xl">
        <p className="text-sm font-semibold text-amber-300 mb-1">
          {workerDown ? "CAD render worker unreachable" : "Couldn't build this model"}
        </p>
        <p className="text-xs text-white/55 leading-relaxed mb-3">
          {error || "The render worker is not running."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition"
          >
            Try again
          </button>
          <span className="text-[10px] text-white/35">
            or switch to <span className="text-amber-300">Fast</span> mode for a quick preview.
          </span>
        </div>
        {workerDown && !isProductionHint && (
          <p className="text-[10px] text-white/30 mt-3">
            Still failing? Restart once with <span className="font-mono text-emerald-300/80">pnpm dev</span> — it launches the CAD worker automatically.
          </p>
        )}
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
  const [manualRetry, setManualRetry] = useState(0);

  const reqKey = useMemo(() => {
    const specId = specSheet?.referenceProduct || "";
    return `${String(topic || simType || "")}::${String(simType || "")}::${specId}::${reloadToken}::${manualRetry}`;
  }, [topic, simType, specSheet?.referenceProduct, reloadToken, manualRetry]);

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
      const requestBody = JSON.stringify({
        topic: topic || simType,
        simType,
        params,
        specSheet: specSheet?.dimensions?.length ? specSheet : null,
      });

      // The worker can be briefly unreachable while it warms up or finishes a
      // cold render, so a 503 is worth retrying rather than immediately telling
      // the user to restart everything.
      let data = null;
      let lastError = "Geometry render failed";
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));

        let res;
        try {
          res = await fetch("/api/geometry-render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });
        } catch (e) {
          lastError = e?.message || "Network error reaching the render worker";
          continue;
        }

        const payload = await res.json().catch(() => null);
        if (payload?.success && payload?.glbBase64) {
          data = payload;
          break;
        }
        lastError = payload?.error || `Render failed (HTTP ${res.status})`;
        // A hard modelling error (bad geometry) won't fix itself on retry;
        // only retry the transient "worker not reachable / not running" states.
        if (res.status !== 503 && !/worker/i.test(lastError)) break;
      }

      if (cancelled) return;
      if (!data) throw new Error(lastError);

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
        <RenderWorkerHelp error={error} onRetry={() => setManualRetry((n) => n + 1)} />
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
