"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Html, RoundedBox } from "@react-three/drei";
import { useLoominStore } from "../store";

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function degToRad(d) { return (d * Math.PI) / 180; }
function num(vars, key, fallback) { const v = vars?.[key]; return typeof v === "number" && Number.isFinite(v) ? v : fallback; }
function lerp(a, b, t) { return a + (b - a) * t; }

function useActiveVars() {
  return useLoominStore((s) => {
    const j = s.journals.find((x) => x.id === s.activeId) || s.journals[0];
    return j?.vars || {};
  });
}

function Mat({ color = "#E7E9EE", roughness = 0.42, metalness = 0.12, emissive = "#000000", emissiveIntensity = 0 }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />;
}

function DarkMat({ color = "#3B3F46", roughness = 0.55, metalness = 0.18 }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
}

function RubberMat({ color = "#1C1F25", roughness = 0.9, metalness = 0.05 }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
}

function Collar({ r = 0.22, h = 0.12, lip = 0.012 }) {
  return (
    <group>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, h, 64]} />
        <DarkMat />
      </mesh>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, h * 0.5 + lip * 0.5]}>
        <cylinderGeometry args={[r * 1.02, r * 1.02, lip, 64]} />
        <meshStandardMaterial color="#2A2E35" roughness={0.62} metalness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -h * 0.5 - lip * 0.5]}>
        <cylinderGeometry args={[r * 1.02, r * 1.02, lip, 64]} />
        <meshStandardMaterial color="#2A2E35" roughness={0.62} metalness={0.16} />
      </mesh>
    </group>
  );
}

function ShellLink({ size = [0.44, 1.15, 0.36], radius = 0.14, inset = 0.84 }) {
  const [x, y, z] = size;
  return (
    <group>
      <RoundedBox args={[x, y, z]} radius={radius} smoothness={12} castShadow receiveShadow>
        <Mat />
      </RoundedBox>
      <group position={[0, 0, z * 0.26]}>
        <RoundedBox args={[x * 0.9, y * inset, z * 0.22]} radius={radius * 0.72} smoothness={12} castShadow receiveShadow>
          <meshStandardMaterial color="#D7D9DF" roughness={0.48} metalness={0.1} />
        </RoundedBox>
      </group>
      <group position={[0, 0, -z * 0.28]}>
        <RoundedBox args={[x * 0.86, y * (inset * 0.86), z * 0.16]} radius={radius * 0.65} smoothness={12} castShadow receiveShadow>
          <meshStandardMaterial color="#CED1D8" roughness={0.52} metalness={0.1} />
        </RoundedBox>
      </group>
    </group>
  );
}

function WristCuff() {
  return (
    <group>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.14, 64]} />
        <DarkMat color="#2F333A" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.085]}>
        <cylinderGeometry args={[0.19, 0.19, 0.025, 64]} />
        <DarkMat color="#3B3F46" roughness={0.58} metalness={0.18} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.085]}>
        <cylinderGeometry args={[0.19, 0.19, 0.025, 64]} />
        <DarkMat color="#3B3F46" roughness={0.58} metalness={0.18} />
      </mesh>
    </group>
  );
}

function Palm() {
  return (
    <group>
      <RoundedBox args={[0.62, 0.18, 0.44]} radius={0.12} smoothness={14} castShadow receiveShadow>
        <Mat />
      </RoundedBox>
      <group position={[0.02, 0.07, 0.04]} rotation={[-0.03, 0, 0]}>
        <RoundedBox args={[0.54, 0.10, 0.38]} radius={0.1} smoothness={14} castShadow receiveShadow>
          <meshStandardMaterial color="#F0F1F4" roughness={0.42} metalness={0.08} />
        </RoundedBox>
      </group>
      <group position={[0, -0.05, -0.06]} rotation={[0.02, 0, 0]}>
        <RoundedBox args={[0.5, 0.08, 0.28]} radius={0.09} smoothness={14} castShadow receiveShadow>
          <meshStandardMaterial color="#D1D4DB" roughness={0.55} metalness={0.1} />
        </RoundedBox>
      </group>
      <group position={[0, 0.02, 0.18]}>
        <RoundedBox args={[0.54, 0.08, 0.12]} radius={0.06} smoothness={12} castShadow receiveShadow>
          <DarkMat color="#3B3F46" roughness={0.6} metalness={0.16} />
        </RoundedBox>
      </group>
      <group position={[0, 0.03, 0.14]}>
        <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.62, 28]} />
          <DarkMat color="#2F333A" roughness={0.62} metalness={0.18} />
        </mesh>
      </group>
    </group>
  );
}

function FingerSegment({ w, h, l, color = "#E7E9EE", tip = false }) {
  return (
    <RoundedBox args={[w, h, l]} radius={Math.min(0.03, w * 0.45)} smoothness={14} castShadow receiveShadow>
      {tip ? <RubberMat /> : <meshStandardMaterial color={color} roughness={0.46} metalness={0.12} />}
    </RoundedBox>
  );
}

function Finger({ base = [0, 0, 0], yaw = 0, openZ = 0.08, curl = 0.35, lengths = [0.19, 0.15, 0.12], widths = [0.075, 0.068, 0.062], heights = [0.078, 0.072, 0.066] }) {
  const [l1, l2, l3] = lengths;
  const [w1, w2, w3] = widths;
  const [h1, h2, h3] = heights;

  const c0 = clamp(curl, 0, degToRad(80));
  const c1 = clamp(c0 * 0.92, 0, degToRad(80));
  const c2 = clamp(c0 * 0.84 + degToRad(6), 0, degToRad(80));

  const z = Math.max(0.045, openZ);

  return (
    <group position={base} rotation={[0, yaw, 0]}>
      <group position={[0, 0, z]}>
        <group rotation={[c0, 0, 0]}>
          <group position={[0, 0, l1 * 0.5]}>
            <FingerSegment w={w1} h={h1} l={l1} />
          </group>

          <group position={[0, 0, l1]} rotation={[c1, 0, 0]}>
            <group position={[0, 0, l2 * 0.5]}>
              <FingerSegment w={w2} h={h2} l={l2} color="#EEF0F4" />
            </group>

            <group position={[0, 0, l2]} rotation={[c2, 0, 0]}>
              <group position={[0, 0, l3 * 0.5]}>
                <FingerSegment w={w3} h={h3} l={l3} color="#E9EBF0" />
              </group>
              <group position={[0, -h3 * 0.1, l3 * 0.9]}>
                <FingerSegment w={w3 * 0.98} h={h3 * 0.92} l={l3 * 0.45} tip />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export default function Arm({ position = [0, 0, 0], scale = 1.25 }) {
  const vars = useActiveVars();

  const baseYaw = degToRad(clamp(num(vars, "Arm_Base_Yaw", 22), -180, 180));
  const shoulderPitch = degToRad(clamp(num(vars, "Arm_Shoulder_Pitch", 28), -70, 70));
  const elbowPitch = degToRad(clamp(num(vars, "Arm_Elbow_Pitch", 52), -120, 120));
  const wristPitch = degToRad(clamp(num(vars, "Arm_Wrist_Pitch", -42), -90, 90));
  const wristRoll = degToRad(clamp(num(vars, "Arm_Wrist_Roll", -18), -160, 160));
  const wristRotate = degToRad(clamp(num(vars, "Wrist_Rotate", -52), -180, 180));

  const handYaw = degToRad(clamp(num(vars, "Gripper_Yaw", -18), -110, 110));
  const handPitch = degToRad(clamp(num(vars, "Gripper_Pitch", -6), -85, 85));

  const gripPct = clamp(num(vars, "Gripper_Open", 48), 0, 100);
  const splayPct = clamp(num(vars, "Finger_Splay", 46), 0, 100);

  const globalCurlDeg = clamp(num(vars, "Finger_Curl", 18), 0, 75);
  const thumbCurlDeg = clamp(num(vars, "Thumb_Curl", 28), 0, 65);
  const indexCurlDeg = clamp(num(vars, "Index_Curl", globalCurlDeg), 0, 80);
  const middleCurlDeg = clamp(num(vars, "Middle_Curl", globalCurlDeg), 0, 80);
  const ringCurlDeg = clamp(num(vars, "Ring_Curl", globalCurlDeg + 6), 0, 80);
  const pinkyCurlDeg = clamp(num(vars, "Pinky_Curl", globalCurlDeg + 12), 0, 80);

  const openZ = useMemo(() => lerp(0.06, 0.14, gripPct / 100), [gripPct]);
  const splay = useMemo(() => lerp(0.06, 0.36, splayPct / 100), [splayPct]);

  const thumbCurl = useMemo(() => degToRad(thumbCurlDeg), [thumbCurlDeg]);
  const indexCurl = useMemo(() => degToRad(indexCurlDeg), [indexCurlDeg]);
  const middleCurl = useMemo(() => degToRad(middleCurlDeg), [middleCurlDeg]);
  const ringCurl = useMemo(() => degToRad(ringCurlDeg), [ringCurlDeg]);
  const pinkyCurl = useMemo(() => degToRad(pinkyCurlDeg), [pinkyCurlDeg]);

  const baseH = 0.22;
  const pedestalH = 0.34;

  const upperLen = 1.18;
  const foreLen = 1.02;
  const wristLen = 0.48;

  const yawIndex = clamp(splay * 0.55, 0, 0.30);
  const yawRing = clamp(splay * 0.42, 0, 0.24);
  const yawPinky = clamp(splay * 0.85, 0, 0.42);

  const sep = useMemo(() => lerp(0.12, 0.16, splayPct / 100), [splayPct]);

  return (
    <>
      <group position={position} scale={scale}>
        <group rotation={[0, baseYaw, 0]}>
          <mesh castShadow receiveShadow position={[0, baseH / 2, 0]}>
            <cylinderGeometry args={[0.46, 0.46, baseH, 72]} />
            <DarkMat color="#2F333A" roughness={0.62} metalness={0.2} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, baseH + pedestalH / 2, 0]}>
            <cylinderGeometry args={[0.26, 0.30, pedestalH, 56]} />
            <Mat color="#E9EBF0" roughness={0.48} metalness={0.1} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, baseH + pedestalH, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.08, 48]} />
            <DarkMat color="#3B3F46" roughness={0.58} metalness={0.18} />
          </mesh>

          <group position={[0, baseH + pedestalH, 0]}>
            <Collar r={0.28} h={0.14} />
            <group rotation={[shoulderPitch, 0, 0]}>
              <group position={[0, upperLen / 2, 0]}>
                <ShellLink size={[0.48, upperLen, 0.40]} radius={0.15} inset={0.82} />
              </group>

              <group position={[0, upperLen, 0]}>
                <Collar r={0.25} h={0.13} />
                <group rotation={[elbowPitch, 0, 0]}>
                  <group position={[0, foreLen / 2, 0]}>
                    <ShellLink size={[0.46, foreLen, 0.38]} radius={0.14} inset={0.84} />
                  </group>

                  <group position={[0, foreLen, 0]}>
                    <Collar r={0.23} h={0.12} />
                    <group rotation={[wristPitch, 0, 0]}>
                      <group rotation={[0, 0, wristRoll]}>
                        <group rotation={[0, 0, wristRotate]}>
                          <group position={[0, wristLen / 2, 0]}>
                            <ShellLink size={[0.40, wristLen, 0.34]} radius={0.12} inset={0.86} />
                          </group>

                          <group position={[0, wristLen, 0]} rotation={[handPitch, handYaw, 0]}>
                            <WristCuff />
                            <group position={[0, 0.02, 0.09]}>
                              <Palm />
                              <group position={[0, 0.06, 0.18]}>
                                <Finger base={[0, 0.01, 0]} yaw={0} openZ={openZ} curl={middleCurl} lengths={[0.19, 0.15, 0.12]} widths={[0.078, 0.07, 0.064]} heights={[0.08, 0.074, 0.068]} />
                                <Finger base={[sep, 0.01, 0.01]} yaw={yawIndex} openZ={openZ} curl={indexCurl} lengths={[0.185, 0.145, 0.115]} widths={[0.076, 0.068, 0.062]} heights={[0.078, 0.072, 0.066]} />
                                <Finger base={[-sep, 0.01, 0.01]} yaw={-yawRing} openZ={openZ} curl={ringCurl} lengths={[0.182, 0.142, 0.115]} widths={[0.076, 0.068, 0.062]} heights={[0.078, 0.072, 0.066]} />
                                <Finger base={[sep * 1.85, 0.01, 0.02]} yaw={yawPinky} openZ={openZ} curl={pinkyCurl} lengths={[0.17, 0.132, 0.108]} widths={[0.072, 0.064, 0.058]} heights={[0.074, 0.068, 0.062]} />
                                <group position={[-0.24, -0.03, -0.02]} rotation={[0.18, -0.95, 0.42]}>
                                  <Finger base={[0, 0, 0]} yaw={0} openZ={openZ * 0.95} curl={thumbCurl} lengths={[0.162, 0.126, 0.102]} widths={[0.082, 0.074, 0.066]} heights={[0.084, 0.078, 0.072]} />
                                </group>
                              </group>
                            </group>
                          </group>
                        </group>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <circleGeometry args={[2.9, 140]} />
          <meshStandardMaterial color="#070d1b" roughness={0.985} metalness={0.03} />
        </mesh>
      </group>

      <Html fullscreen>
        <div style={{ position: "absolute", right: 18, bottom: 18, pointerEvents: "none" }}>
          <div className="select-none rounded-2xl bg-black/45 ring-1 ring-white/15 backdrop-blur-xl px-3 py-2 text-[11px] text-white/85 min-w-[300px]">
            <div className="text-white/55 tracking-[0.16em] uppercase text-[10px]">Arm Telemetry</div>
            <div className="mt-1 flex items-center justify-between"><span className="text-white/60">Wrist_Rotate</span><span className="font-semibold text-white/95">{num(vars, "Wrist_Rotate", -52).toFixed(0)}°</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-white/60">Gripper_Open</span><span className="font-semibold text-white/95">{num(vars, "Gripper_Open", 48).toFixed(0)}%</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-white/60">Finger_Splay</span><span className="font-semibold text-white/95">{num(vars, "Finger_Splay", 46).toFixed(0)}%</span></div>
            <div className="mt-1 flex items-center justify-between"><span className="text-white/60">Finger_Curl</span><span className="font-semibold text-white/95">{num(vars, "Finger_Curl", 18).toFixed(0)}°</span></div>
          </div>
        </div>
      </Html>
    </>
  );
}
