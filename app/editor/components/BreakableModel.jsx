"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/**
 * Makes a baked photoreal mesh physically breakable.
 *
 * A generated mesh has no named parts, so it cannot fail the way a hand-built
 * rig does. Instead it is pre-fractured into Voronoi fragments around points
 * sampled on its own surface, and the fragments are driven by how close the
 * current parameters are to the topic's failure thresholds:
 *
 *   below warning      intact — the original mesh, pixel for pixel
 *   warning → critical cracks open, the body strains, shakes and heats up
 *   past critical      it shatters and the fragments fall under gravity
 *   back under         the fragments fly back and reassemble (Auto-fix)
 *
 * Stress is computed from the same SIMCONFIG constraints the status card uses,
 * so the mesh breaks exactly when the notes say CRITICAL_FAILURE.
 */

const FRAGMENT_COUNT = 28;
const GRAVITY = 14;
const REASSEMBLE_SECONDS = 1.4;
const MAX_STAGGER = 0.35;

function normalizeKey(key) {
  return String(key)
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("_");
}

function prettyName(name) {
  return String(name).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 0 below the warning threshold, 0→1 between warning and critical, ≥1 past
 * critical. Mirrors constraintSeverity in the editor, including constraints
 * where a lower value is the dangerous direction.
 */
export function structuralStress(params, simConfig) {
  let worst = { stress: 0, param: null };
  for (const c of simConfig?.constraints || []) {
    const raw = params?.[normalizeKey(c.param)] ?? params?.[c.param];
    const val = Number(raw);
    if (raw === undefined || !Number.isFinite(val)) continue;
    const warn = Number(c.warningThreshold);
    const crit = Number(c.criticalThreshold);

    let s = 0;
    if (Number.isFinite(warn) && Number.isFinite(crit) && warn !== crit) {
      // Sign-agnostic: for lower-is-bad constraints crit < warn and both the
      // numerator and denominator flip together.
      s = Math.max(0, (val - warn) / (crit - warn));
    } else if (Number.isFinite(crit)) {
      s = val >= crit ? 1 : 0;
    }
    if (s > worst.stress) worst = { stress: s, param: c.param };
  }
  return worst;
}

/** Copies the listed triangles of a non-indexed geometry into a new one, recentred. */
function sliceGeometry(source, triangles, offset) {
  const out = new THREE.BufferGeometry();
  const vertexCount = triangles.length * 3;
  for (const [name, attr] of Object.entries(source.attributes)) {
    const size = attr.itemSize;
    const arr = new Float32Array(vertexCount * size);
    let w = 0;
    for (const tri of triangles) {
      for (let v = tri * 3; v < tri * 3 + 3; v++) {
        arr[w++] = attr.getX(v);
        if (size > 1) arr[w++] = attr.getY(v);
        if (size > 2) arr[w++] = attr.getZ(v);
        if (size > 3) arr[w++] = attr.getW(v);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.translate(-offset.x, -offset.y, -offset.z);
  out.computeBoundingSphere();
  return out;
}

/**
 * Splits every mesh under `root` into FRAGMENT_COUNT Voronoi cells, expressed
 * in the space of root's parent so fragments can sit beside the original.
 */
function buildFragments(root) {
  root.updateWorldMatrix(true, true);
  const toParent = new THREE.Matrix4();
  if (root.parent) toParent.copy(root.parent.matrixWorld).invert();

  const sources = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toParent, o.matrixWorld));
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    sources.push({ g, material, triCount: g.attributes.position.count / 3 });
  });
  const totalTris = sources.reduce((n, s) => n + s.triCount, 0);
  if (!totalTris) return null;

  const centroidOf = (g, tri, out) => {
    const p = g.attributes.position;
    const i = tri * 3;
    return out.set(
      (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
      (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3,
      (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3,
    );
  };

  // Seeds sampled on the surface itself, so cells follow the object's shape
  // rather than slicing empty bounding-box space.
  const seeds = [];
  const tmp = new THREE.Vector3();
  for (let k = 0; k < FRAGMENT_COUNT; k++) {
    let pick = Math.floor(Math.random() * totalTris);
    for (const s of sources) {
      if (pick < s.triCount) {
        seeds.push(centroidOf(s.g, pick, new THREE.Vector3()));
        break;
      }
      pick -= s.triCount;
    }
  }

  // cells[seed][source] = triangle indices
  const cells = seeds.map(() => sources.map(() => []));
  const sums = seeds.map(() => new THREE.Vector3());
  const counts = new Array(seeds.length).fill(0);
  sources.forEach((s, si) => {
    for (let t = 0; t < s.triCount; t++) {
      centroidOf(s.g, t, tmp);
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const d = tmp.distanceToSquared(seeds[k]);
        if (d < bestD) { bestD = d; best = k; }
      }
      cells[best][si].push(t);
      sums[best].add(tmp);
      counts[best]++;
    }
  });

  const bounds = new THREE.Box3();
  for (const s of sources) {
    s.g.computeBoundingBox();
    bounds.union(s.g.boundingBox);
  }
  const center = bounds.getCenter(new THREE.Vector3());

  const group = new THREE.Group();
  const fragments = [];
  cells.forEach((perSource, k) => {
    if (!counts[k]) return;
    const home = sums[k].divideScalar(counts[k]);
    const node = new THREE.Group();
    node.position.copy(home);
    let radius = 0.05;
    perSource.forEach((tris, si) => {
      if (!tris.length) return;
      const geom = sliceGeometry(sources[si].g, tris, home);
      radius = Math.max(radius, geom.boundingSphere?.radius ?? 0);
      const mesh = new THREE.Mesh(geom, sources[si].material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      node.add(mesh);
    });
    group.add(node);

    const dir = home.clone().sub(center);
    if (dir.lengthSq() < 1e-6) dir.set(Math.random() - 0.5, 1, Math.random() - 0.5);
    dir.normalize();

    fragments.push({
      node,
      home: home.clone(),
      dir,
      radius,
      velocity: new THREE.Vector3(),
      spinAxis: new THREE.Vector3(),
      spin: 0,
      fromPos: new THREE.Vector3(),
      fromQuat: new THREE.Quaternion(),
      delay: Math.random() * MAX_STAGGER,
    });
  });

  for (const s of sources) s.g.dispose();

  const materials = [...new Set(sources.map((s) => s.material).filter(Boolean))];
  return { group, fragments, center, floorY: bounds.min.y, materials };
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const crackGap = (s) => 0.02 + 0.12 * Math.min(1, s);
const HEAT = new THREE.Color("#ff3b1f");

export default function BreakableModel({ model, params, simConfig }) {
  const wrapperRef = useRef();
  const flashRef = useRef();
  const ringRef = useRef();
  const fracture = useRef(null);
  const sim = useRef({ mode: "intact", t: 0, sinceShatter: 0 });

  const { stress, param } = useMemo(() => structuralStress(params, simConfig), [params, simConfig]);
  const stressRef = useRef(stress);
  stressRef.current = stress;

  const ensureFracture = () => {
    if (fracture.current || !wrapperRef.current) return fracture.current;
    const built = buildFragments(model);
    if (!built) return null;
    built.group.visible = false;
    wrapperRef.current.add(built.group);
    built.originals = built.materials.map((m) => ({
      m,
      emissive: m.emissive ? m.emissive.clone() : null,
      intensity: m.emissiveIntensity ?? 1,
    }));
    fracture.current = built;
    return built;
  };

  // Fracture shortly after load rather than on the first slider drag, so the
  // moment the user crosses a threshold never hitches.
  useEffect(() => {
    const id = setTimeout(ensureFracture, 400);
    return () => {
      clearTimeout(id);
      const f = fracture.current;
      if (!f) return;
      for (const o of f.originals) {
        if (o.emissive) o.m.emissive.copy(o.emissive);
        o.m.emissiveIntensity = o.intensity;
      }
      f.group.traverse((o) => o.isMesh && o.geometry.dispose());
      f.group.removeFromParent();
      fracture.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useFrame((state, delta) => {
    const s = stressRef.current;
    const st = sim.current;
    const dt = Math.min(delta, 1 / 30);
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const f = s > 0 || st.mode !== "intact" ? ensureFracture() : fracture.current;
    if (!f) return;

    const restPose = (frag, target) =>
      target.copy(frag.home).addScaledVector(frag.dir, s > 0 ? crackGap(s) : 0);

    // ── transitions ──
    if (s >= 1 && st.mode !== "shattered") {
      st.mode = "shattered";
      st.sinceShatter = 0;
      const overshoot = Math.min(1, s - 1);
      for (const frag of f.fragments) {
        frag.velocity
          .copy(frag.dir)
          .multiplyScalar((3 + Math.random() * 4) * (1 + overshoot * 0.6))
          .add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2));
        frag.spinAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        frag.spin = 3 + Math.random() * 7;
      }
    } else if (s < 1 && st.mode === "shattered") {
      st.mode = "reassembling";
      st.t = 0;
      for (const frag of f.fragments) {
        frag.fromPos.copy(frag.node.position);
        frag.fromQuat.copy(frag.node.quaternion);
      }
    } else if (s > 0 && st.mode === "intact") {
      st.mode = "strained";
    } else if (s <= 0 && st.mode === "strained") {
      st.mode = "intact";
    }

    const broken = st.mode !== "intact";
    model.visible = !broken;
    f.group.visible = broken;

    // ── fragment motion ──
    const target = new THREE.Vector3();
    if (st.mode === "strained") {
      for (const frag of f.fragments) {
        frag.node.position.copy(restPose(frag, target));
        frag.node.quaternion.identity();
      }
    } else if (st.mode === "shattered") {
      st.sinceShatter += dt;
      const dq = new THREE.Quaternion();
      for (const frag of f.fragments) {
        frag.velocity.y -= GRAVITY * dt;
        frag.node.position.addScaledVector(frag.velocity, dt);
        dq.setFromAxisAngle(frag.spinAxis, frag.spin * dt);
        frag.node.quaternion.premultiply(dq);

        const rest = f.floorY + frag.radius * 0.45;
        if (frag.node.position.y < rest) {
          frag.node.position.y = rest;
          if (frag.velocity.y < 0) frag.velocity.y *= -0.28;
          frag.velocity.x *= 0.8;
          frag.velocity.z *= 0.8;
          frag.spin *= 0.75;
        }
      }
    } else if (st.mode === "reassembling") {
      st.t += dt / REASSEMBLE_SECONDS;
      for (const frag of f.fragments) {
        const local = Math.min(1, Math.max(0, (st.t - frag.delay) / (1 - MAX_STAGGER)));
        const e = easeInOutCubic(local);
        frag.node.position.lerpVectors(frag.fromPos, restPose(frag, target), e);
        frag.node.quaternion.slerpQuaternions(frag.fromQuat, new THREE.Quaternion(), e);
      }
      if (st.t >= 1) st.mode = s > 0 ? "strained" : "intact";
    }

    // ── strain shake ──
    if (st.mode === "strained") {
      const amp = 0.035 * s * s;
      wrapper.position.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    } else {
      wrapper.position.set(0, 0, 0);
    }

    // ── heat ──
    let heat = 0;
    // Kept low: through ACES tone mapping anything stronger floods the texture
    // solid red and the object stops reading as the real thing.
    if (st.mode === "strained") heat = (0.02 + 0.16 * s * s) * (0.7 + 0.3 * Math.sin(state.clock.elapsedTime * 9));
    else if (st.mode === "shattered") heat = 0.05 + 0.2 * Math.exp(-st.sinceShatter * 1.5);
    else if (st.mode === "reassembling") heat = 0.05 * (1 - st.t);
    for (const o of f.originals) {
      if (!o.emissive) continue;
      if (heat > 0) {
        o.m.emissive.copy(HEAT);
        o.m.emissiveIntensity = heat;
      } else {
        o.m.emissive.copy(o.emissive);
        o.m.emissiveIntensity = o.intensity;
      }
    }

    // ── shatter flash and shock ring ──
    const since = st.mode === "shattered" ? st.sinceShatter : Infinity;
    if (flashRef.current) {
      flashRef.current.position.copy(f.center);
      flashRef.current.intensity = Number.isFinite(since) ? 60 * Math.exp(-since * 5) : 0;
    }
    if (ringRef.current) {
      const ringT = Number.isFinite(since) ? since / 0.9 : 1;
      ringRef.current.visible = ringT < 1;
      ringRef.current.position.set(f.center.x, f.floorY + 0.02, f.center.z);
      ringRef.current.scale.setScalar(0.5 + ringT * 9);
      ringRef.current.material.opacity = 0.7 * (1 - ringT);
    }
  });

  const critical = stress >= 1;

  return (
    <group>
      <group ref={wrapperRef}>
        <primitive object={model} />
      </group>

      <pointLight ref={flashRef} color="#ff5a36" intensity={0} distance={14} decay={2} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.5, 64]} />
        <meshBasicMaterial color="#ff6a3d" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {param && stress > 0 && (
        <Html
          calculatePosition={(_el, _camera, size) => [12, size.height - 52]}
          zIndexRange={[30, 20]}
        >
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-sm whitespace-nowrap ${
              critical ? "bg-rose-950/85 border-rose-500/50" : "bg-amber-950/80 border-amber-500/40"
            }`}
            style={{ transform: "translate(0, -100%)", pointerEvents: "none" }}
          >
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${critical ? "bg-rose-400" : "bg-amber-400"}`} />
            <span className={`text-[11px] font-semibold ${critical ? "text-rose-200" : "text-amber-200"}`}>
              {critical
                ? `Structural failure — ${prettyName(param)} past its limit`
                : `${prettyName(param)} at ${Math.round(stress * 100)}% of failure`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
