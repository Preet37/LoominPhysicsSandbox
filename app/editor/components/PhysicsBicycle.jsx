"use client";

/**
 * PhysicsBicycle — hand-crafted R3F bicycle.
 *
 * Diamond frame layout (side view, facing +Z):
 *   - Rear wheel at origin, front wheel ~1.05m forward (+Z)
 *   - Bottom bracket between wheels at y≈0.32
 *   - Seat tube: BB → saddle (~0.88m up)
 *   - Top tube: seat tube top → head tube
 *   - Down tube: head tube → BB
 *   - Chain stays: BB → rear axle
 *   - Seat stays: rear axle → seat tube top
 *   - Fork: head tube → front axle
 *
 * Wheels are torusGeometry rings standing UPRIGHT (rotation=[π/2,0,0])
 * with individual spoke cylinders radiating from hub.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function PhysicsBicycle({ params = {}, simConfig }) {
  const frontWheelRef = useRef();
  const rearWheelRef  = useRef();
  const crankRef      = useRef();

  // ── Parameters ────────────────────────────────────────────────────────────
  const wheelDiam  = Number(params.Wheel_Diameter  ?? params.wheel_diameter  ?? 26);   // inches
  const gearRatio  = Number(params.Gear_Ratio      ?? params.gear_ratio      ?? 2.5);
  const brakeForce = Number(params.Brake_Force     ?? params.brake_force     ?? 50);
  const riderMass  = Number(params.Rider_Mass      ?? params.rider_mass      ?? 75);
  const speed      = Number(params.Speed           ?? params.speed           ?? 25);

  // ── Constraints ────────────────────────────────────────────────────────────
  const speedC  = simConfig?.constraints?.find((c) => c.param === "Speed")    || {};
  const warnT   = speedC.warningThreshold  ?? 45;
  const critT   = speedC.criticalThreshold ?? 60;
  const isCritical = speed >= critT;
  const isWarning  = !isCritical && speed >= warnT;

  const massC    = simConfig?.constraints?.find((c) => c.param === "Rider_Mass") || {};
  const massOver = riderMass >= (massC.criticalThreshold ?? 120);

  // ── Geometry constants (scaled from real 26" bike) ─────────────────────────
  const WHEEL_R    = (wheelDiam / 26) * 0.52;   // ~0.52m for 26"
  const TYRE_TUBE  = 0.045;
  const WHEELBASE  = 1.05;

  // Frame junction points
  const REAR_AXLE   = [0, WHEEL_R, 0];
  const FRONT_AXLE  = [0, WHEEL_R, WHEELBASE];
  const BB_Y        = 0.32;   // bottom bracket height
  const BB_Z        = WHEELBASE * 0.43;   // bottom bracket z (slightly forward of rear axle)
  const SEAT_TOP_Y  = 0.90;
  const SEAT_TOP_Z  = BB_Z - 0.02;
  const HEAD_TOP_Y  = 0.78;
  const HEAD_BOT_Y  = 0.50;
  const HEAD_Z      = WHEELBASE - 0.14;

  // Derived colours
  const frameCol  = isCritical || massOver ? "#dc2626" : "#1d4ed8"; // blue frame → red on failure
  const tyreCol   = "#111827";
  const rimCol    = "#94a3b8";
  const speckCol  = "#374151"; // spoke colour
  const metalCol  = "#6b7280";

  // ── Animation ─────────────────────────────────────────────────────────────
  const wheelRPM = Math.max(0, (speed * 1000 / 3600) / (Math.PI * WHEEL_R * 2)) * 60;
  const angVel   = (wheelRPM / 60) * Math.PI * 2;

  useFrame((state, delta) => {
    if (frontWheelRef.current) frontWheelRef.current.rotation.z += angVel * delta;
    if (rearWheelRef.current)  rearWheelRef.current.rotation.z  += angVel * delta;
    if (crankRef.current)      crankRef.current.rotation.z      += (angVel / Math.max(0.5, gearRatio)) * delta;

    // Frame wobble at critical speed
    if (isCritical) {
      const t = state.clock.elapsedTime;
      frontWheelRef.current && (frontWheelRef.current.position.y = WHEEL_R + Math.sin(t * 18) * 0.025);
    }
  });

  // Build spoke arrays (16 per wheel)
  const SPOKE_COUNT = 16;
  const spokeAngles = useMemo(
    () => Array.from({ length: SPOKE_COUNT }, (_, i) => (i / SPOKE_COUNT) * Math.PI * 2),
    [],
  );

  // Helper: one complete wheel (torus + spokes + hub) at a given position
  function Wheel({ position, wRef }) {
    const [wx, wy, wz] = position;
    return (
      <group position={position}>
        {/* Tyre ring — stands upright */}
        <mesh ref={wRef} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[WHEEL_R - TYRE_TUBE * 0.5, TYRE_TUBE, 16, 80]} />
          <meshStandardMaterial color={tyreCol} roughness={0.95} metalness={0} />
        </mesh>

        {/* Rim (inner ring) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[WHEEL_R * 0.83, TYRE_TUBE * 0.28, 12, 64]} />
          <meshStandardMaterial color={rimCol} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Spokes (16 thin cylinders from hub to rim) */}
        {spokeAngles.map((angle, i) => {
          const spokeR = WHEEL_R * 0.83;  // attach to rim inner edge
          const cx = Math.cos(angle) * spokeR * 0.5;
          const cy = Math.sin(angle) * spokeR * 0.5;
          return (
            <mesh key={i} position={[cx, cy, 0]} rotation={[0, 0, angle + Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.005, 0.005, spokeR, 4]} />
              <meshStandardMaterial color={rimCol} metalness={0.8} roughness={0.2} />
            </mesh>
          );
        })}

        {/* Hub */}
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.14, 16]} />
          <meshStandardMaterial color={metalCol} metalness={0.75} roughness={0.25} />
        </mesh>
        {/* Axle protrusions */}
        {[-0.09, 0.09].map((z, i) => (
          <mesh key={i} position={[0, 0, z]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.08, 10]} />
            <meshStandardMaterial color={rimCol} metalness={0.85} roughness={0.15} />
          </mesh>
        ))}
      </group>
    );
  }

  // ── Tube helper: draw a round tube between two 3D points ──────────────────
  function Tube({ from, to, r = 0.028, color = frameCol, metalness = 0.5, roughness = 0.35 }) {
    const [fx, fy, fz] = from;
    const [tx, ty, tz] = to;
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const mx = (fx + tx) / 2, my = (fy + ty) / 2, mz = (fz + tz) / 2;

    // Build rotation from default cylinder axis (Y) to the tube direction
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const euler = new THREE.Euler().setFromQuaternion(quat);

    return (
      <mesh position={[mx, my, mz]} rotation={euler} castShadow>
        <cylinderGeometry args={[r, r, len, 12]} />
        <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
      </mesh>
    );
  }

  return (
    <group>
      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, WHEELBASE / 2]}>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* ══════════════════════ WHEELS ══════════════════════ */}
      <Wheel position={REAR_AXLE}  wRef={rearWheelRef}  />
      <Wheel position={FRONT_AXLE} wRef={frontWheelRef} />

      {/* ══════════════════════ DIAMOND FRAME ══════════════════════ */}

      {/* Chain stays: rear axle → bottom bracket (2 parallel tubes) */}
      {[-0.09, 0.09].map((z, i) => (
        <Tube key={i} from={[0, WHEEL_R, z]} to={[0, BB_Y, BB_Z + z * 0.3]} r={0.022} />
      ))}

      {/* Seat stays: rear axle → seat tube top (2 parallel thin tubes) */}
      {[-0.075, 0.075].map((z, i) => (
        <Tube key={i} from={[0, WHEEL_R, z]} to={[0, SEAT_TOP_Y, SEAT_TOP_Z + z * 0.4]} r={0.016} />
      ))}

      {/* Seat tube: BB → top of seat tube */}
      <Tube from={[0, BB_Y, BB_Z]} to={[0, SEAT_TOP_Y, SEAT_TOP_Z]} r={0.030} />

      {/* Top tube: seat tube top → head tube top */}
      <Tube from={[0, SEAT_TOP_Y, SEAT_TOP_Z]} to={[0, HEAD_TOP_Y, HEAD_Z]} r={0.025} />

      {/* Down tube: head tube bottom → BB */}
      <Tube from={[0, HEAD_BOT_Y, HEAD_Z]} to={[0, BB_Y, BB_Z]} r={0.030} />

      {/* Head tube: head top → head bottom */}
      <Tube from={[0, HEAD_TOP_Y, HEAD_Z]} to={[0, HEAD_BOT_Y, HEAD_Z]} r={0.030} />

      {/* ══════════════════════ FORK ══════════════════════ */}
      {/* Two fork blades (parallel, slight forward rake) */}
      {[-0.075, 0.075].map((z, i) => (
        <Tube key={i}
          from={[0, HEAD_BOT_Y, HEAD_Z + z * 0.5]}
          to={[0, WHEEL_R, WHEELBASE + z * 0.8]}
          r={0.020}
          color={frameCol}
        />
      ))}
      {/* Fork crown (bridges the two blades) */}
      <Tube from={[0, HEAD_BOT_Y + 0.02, HEAD_Z - 0.075]} to={[0, HEAD_BOT_Y + 0.02, HEAD_Z + 0.075]} r={0.022} />

      {/* ══════════════════════ HANDLEBARS ══════════════════════ */}
      {/* Stem */}
      <Tube from={[0, HEAD_TOP_Y, HEAD_Z]} to={[0, HEAD_TOP_Y + 0.12, HEAD_Z - 0.09]} r={0.022} color={metalCol} />
      {/* Handlebar horizontal bar */}
      <Tube
        from={[0, HEAD_TOP_Y + 0.12, HEAD_Z - 0.09 - 0.28]}
        to={[0, HEAD_TOP_Y + 0.12, HEAD_Z - 0.09 + 0.28]}
        r={0.018} color={metalCol}
      />
      {/* Bar ends (drop bar style) */}
      {[-0.26, 0.26].map((z, i) => (
        <Tube key={i}
          from={[0, HEAD_TOP_Y + 0.12, HEAD_Z - 0.09 + z]}
          to={[0, HEAD_TOP_Y + 0.02, HEAD_Z - 0.09 + z]}
          r={0.015} color={metalCol}
        />
      ))}
      {/* Brake lever (right side) */}
      <mesh position={[0, HEAD_TOP_Y + 0.10, HEAD_Z - 0.09 + 0.22]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[0.02, 0.08, 0.025]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* ══════════════════════ SADDLE + SEAT POST ══════════════════════ */}
      {/* Seat post */}
      <Tube
        from={[0, SEAT_TOP_Y, SEAT_TOP_Z]}
        to={[0, SEAT_TOP_Y + 0.22, SEAT_TOP_Z - 0.06]}
        r={0.022} color={metalCol}
      />
      {/* Saddle rails */}
      {[-0.04, 0.04].map((z, i) => (
        <Tube key={i}
          from={[0, SEAT_TOP_Y + 0.22, SEAT_TOP_Z - 0.06 - 0.14]}
          to={[0, SEAT_TOP_Y + 0.22, SEAT_TOP_Z - 0.06 + 0.14]}
          r={0.008} color={metalCol}
        />
      ))}
      {/* Saddle */}
      <mesh position={[0, SEAT_TOP_Y + 0.265, SEAT_TOP_Z - 0.06]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.16, 0.045, 0.28]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Saddle nose */}
      <mesh position={[0, SEAT_TOP_Y + 0.265, SEAT_TOP_Z - 0.06 + 0.17]} castShadow>
        <boxGeometry args={[0.08, 0.04, 0.08]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>

      {/* ══════════════════════ BOTTOM BRACKET + CRANKS ══════════════════════ */}
      {/* BB shell */}
      <mesh position={[0, BB_Y, BB_Z]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.17, 16]} />
        <meshStandardMaterial color={metalCol} metalness={0.75} roughness={0.3} />
      </mesh>

      {/* Crank arms (rotate with wheel speed / gear ratio) */}
      <group ref={crankRef} position={[0, BB_Y, BB_Z]}>
        {/* Right crank */}
        <mesh position={[0, 0.105, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.028, 0.175, 0.022]} />
          <meshStandardMaterial color={metalCol} metalness={0.65} roughness={0.35} />
        </mesh>
        {/* Right pedal */}
        <mesh position={[0.06, 0.20, 0]} castShadow>
          <boxGeometry args={[0.10, 0.018, 0.045]} />
          <meshStandardMaterial color="#1f2937" roughness={0.85} />
        </mesh>
        {/* Left crank (opposite) */}
        <mesh position={[0, -0.105, 0]} castShadow>
          <boxGeometry args={[0.028, 0.175, 0.022]} />
          <meshStandardMaterial color={metalCol} metalness={0.65} roughness={0.35} />
        </mesh>
        {/* Left pedal */}
        <mesh position={[0.06, -0.20, 0]} castShadow>
          <boxGeometry args={[0.10, 0.018, 0.045]} />
          <meshStandardMaterial color="#1f2937" roughness={0.85} />
        </mesh>
      </group>

      {/* Chain ring */}
      <mesh position={[0, BB_Y, BB_Z + 0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.11, 0.012, 10, 48]} />
        <meshStandardMaterial color={metalCol} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Chain (simplified — thin curved box) */}
      <mesh position={[0, BB_Y - 0.015, (BB_Z + REAR_AXLE[2]) / 2]} castShadow>
        <boxGeometry args={[0.012, 0.012, Math.abs(BB_Z - REAR_AXLE[2]) + 0.08]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Rear cassette */}
      <mesh position={[0, WHEEL_R, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.042, 0.055, 24]} />
        <meshStandardMaterial color={metalCol} metalness={0.75} roughness={0.3} />
      </mesh>

      {/* ══════════════════════ REFLECTORS + LIGHTS ══════════════════════ */}
      {/* Front light */}
      <mesh position={[0, HEAD_BOT_Y + 0.04, HEAD_Z + 0.04]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.045, 12]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.5} />
      </mesh>
      {/* Rear reflector */}
      <mesh position={[0, WHEEL_R * 0.8, -0.05]} castShadow>
        <boxGeometry args={[0.035, 0.022, 0.012]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>

      {/* ══════════════════════ FAILURE EFFECTS ══════════════════════ */}
      {isCritical && (
        <pointLight position={[0, 1.2, WHEELBASE / 2]} intensity={6} color="#ef4444" distance={10} />
      )}
      {isWarning && !isCritical && (
        <pointLight position={[0, 1.2, WHEELBASE / 2]} intensity={3} color="#f59e0b" distance={7} />
      )}
    </group>
  );
}
