"use client";

import { useMemo } from "react";

/** Solderless breadboard — ABS base, red/blue power rails, aligned hole grid. */
export default function PhysicsBreadboard({ params = {}, simConfig }) {
  const freq = Number(params.Signal_Frequency ?? params.signal_frequency ?? 1);
  const humidity = Number(params.Humidity_Level ?? params.humidity_level ?? 50);
  const temp = Number(params.Temperature ?? params.temperature ?? 25);

  const tempC = simConfig?.constraints?.find((c) => c.param === "Temperature") || {};
  const tempHigh = temp >= (tempC.criticalThreshold ?? 85);

  const rows = 10;
  const cols = 30;
  const pitch = 0.068;
  const boardW = cols * pitch + 0.35;
  const boardD = rows * pitch + 0.5;

  const holes = useMemo(() => {
    const list = [];
    const offX = -boardW / 2 + 0.22;
    const offZ = -boardD / 2 + 0.18;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (c > 1 && c < cols - 2 && (c === 15 || c === 16)) continue; // gutter
        list.push([offX + c * pitch, 0.11, offZ + r * pitch]);
      }
    }
    return list;
  }, [rows, cols, pitch, boardW, boardD]);

  const plasticCol =
    tempHigh ? "#fecaca" : humidity > 75 ? "#e2e8f0" : freq > 50 ? "#f1f5f9" : "#f8fafc";
  const railBlue = "#1d4ed8";
  const railRed = "#b91c1c";

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>

      {/* Main white body */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[boardW, 0.12, boardD]} />
        <meshStandardMaterial color={plasticCol} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Blue (-) rail */}
      <mesh position={[-boardW / 2 + 0.1, 0.065, 0]} castShadow>
        <boxGeometry args={[0.14, 0.04, boardD - 0.08]} />
        <meshStandardMaterial color={railBlue} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Red (+) rail */}
      <mesh position={[boardW / 2 - 0.1, 0.065, 0]} castShadow>
        <boxGeometry args={[0.14, 0.04, boardD - 0.08]} />
        <meshStandardMaterial color={railRed} roughness={0.4} metalness={0.2} />
      </mesh>

      {/* Center notch */}
      <mesh position={[0, 0.065, 0]} castShadow>
        <boxGeometry args={[0.06, 0.05, boardD - 0.1]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {/* Metal hole inserts (simplified as dark rings) */}
      {holes.slice(0, 420).map((pos, i) => (
        <mesh key={i} position={pos} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.024, 0.028, 10]} />
          <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.35} />
        </mesh>
      ))}

      {/* Sample jumper + DIP block for recognisability */}
      <mesh position={[-0.4, 0.14, 0.1]} castShadow rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.35]} />
        <meshStandardMaterial color="#111827" roughness={0.7} />
      </mesh>
      <mesh position={[0.2, 0.13, -0.05]} castShadow>
        <boxGeometry args={[0.45, 0.04, 0.12]} />
        <meshStandardMaterial color="#facc15" roughness={0.5} />
      </mesh>

      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 10, 6]} intensity={1.2} castShadow />

      {tempHigh && (
        <pointLight position={[0, 1.5, 0]} intensity={5} color="#ef4444" distance={8} />
      )}
    </group>
  );
}
