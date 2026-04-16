"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

/** Hand-crafted submarine — pressure hull, sail, dive planes, rudder, propeller. */
export default function PhysicsSubmarine({ params = {}, simConfig }) {
  const propRef = useRef();
  const hullRef = useRef();

  const ballastVol = Number(params.Ballast_Tank_Volume ?? params.ballast_tank_volume ?? 500);
  const propRpm = Number(params.Propeller_RPM ?? params.propeller_rpm ?? 80);
  const depth = Number(params.Dive_Depth ?? params.dive_depth ?? 200);
  const hullThick = Number(params.Hull_Thickness ?? params.hull_thickness ?? 0.18);
  const snorkel = Number(params.Snorkel_Depth ?? params.snorkel_depth ?? 1);

  const depthC = simConfig?.constraints?.find((c) => c.param === "Dive_Depth") || {};
  const warnD = depthC.warningThreshold ?? 400;
  const critD = depthC.criticalThreshold ?? 600;
  const depthCrit = depth >= critD;
  const depthWarn = !depthCrit && depth >= warnD;

  const thickC = simConfig?.constraints?.find((c) => c.param === "Hull_Thickness") || {};
  const lowerIsBad = thickC.criticalThreshold != null && thickC.warningThreshold != null && thickC.criticalThreshold < thickC.warningThreshold;
  const thickCrit = lowerIsBad ? hullThick <= (thickC.criticalThreshold ?? 0.12) : hullThick >= (thickC.criticalThreshold ?? 0.05);
  const thickWarn = !thickCrit && (lowerIsBad ? hullThick <= (thickC.warningThreshold ?? 0.15) : hullThick >= (thickC.warningThreshold ?? 0.08));

  const hullCol = thickCrit || depthCrit ? "#dc2626" : depthWarn || thickWarn ? "#f59e0b" : "#475569";

  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += (propRpm / 60) * Math.PI * 2 * delta * 2;
    }
    if (hullRef.current && depthCrit) {
      hullRef.current.position.y = Math.sin(performance.now() / 200) * 0.02;
    }
  });

  const L = 4.2;
  const hullR = 0.55;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#0c1220" roughness={1} />
      </mesh>

      <group ref={hullRef} position={[0, hullR + 0.02, 0]}>
        {/* Main pressure hull */}
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[hullR, L * 0.85, 12, 24]} />
          <meshStandardMaterial color={hullCol} metalness={0.55} roughness={0.35} />
        </mesh>

        {/* Bow cap */}
        <mesh position={[0, 0, L * 0.48]} castShadow>
          <sphereGeometry args={[hullR * 0.98, 24, 20]} />
          <meshStandardMaterial color={hullCol} metalness={0.5} roughness={0.38} />
        </mesh>

        {/* Stern taper */}
        <mesh position={[0, 0, -L * 0.52]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[hullR * 0.85, 0.45, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Sail / conning tower */}
        <mesh position={[0, hullR * 0.9, 0.15]} castShadow>
          <boxGeometry args={[0.42, 0.55, 0.85]} />
          <meshStandardMaterial color="#1e293b" metalness={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[0, hullR * 0.9 + 0.45, 0.15]} castShadow>
          <boxGeometry args={[0.28, 0.35, 0.5]} />
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
        </mesh>

        {/* Periscope */}
        <mesh position={[0, hullR * 0.9 + 0.75, 0.35]} castShadow>
          <cylinderGeometry args={[0.04, 0.045, 0.55, 10]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Forward dive planes */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * 0.55, hullR * 0.3, L * 0.35]} rotation={[0, 0, s * 0.35]} castShadow>
            <boxGeometry args={[0.08, 0.02, 0.35]} />
            <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.35} />
          </mesh>
        ))}

        {/* Rudder + stern planes */}
        <mesh position={[0, hullR * 0.25, -L * 0.48]} castShadow>
          <boxGeometry args={[0.04, 0.45, 0.28]} />
          <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.38} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * 0.35, hullR * 0.2, -L * 0.5]} rotation={[s * 0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.35, 0.02, 0.12]} />
            <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.38} />
          </mesh>
        ))}

        {/* Propeller */}
        <group ref={propRef} position={[0, 0, -L * 0.62]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, 0, (i / 4) * Math.PI * 2]}>
              <boxGeometry args={[0.38, 0.06, 0.12]} />
              <meshStandardMaterial color="#1e293b" metalness={0.65} roughness={0.35} />
            </mesh>
          ))}
          <mesh>
            <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Snorkel (when near surface — scale with param) */}
        <mesh position={[0.25, hullR * 0.9 + 0.5 + Math.min(0.4, snorkel * 0.05), 0.5]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 0.9 + snorkel * 0.02, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      <pointLight position={[0, 3, 2]} intensity={depthCrit ? 4 : 1.2} color={depthCrit ? "#ef4444" : "#38bdf8"} distance={12} />
    </group>
  );
}
