// Physics Knowledge Base — RAG source for the Research Agent
// Each entry is indexed by sim type and contains domain knowledge, real-world specs,
// equations, and failure modes grounded in actual physics literature.

export interface PhysicsEntry {
  simType: string;
  domain: string;
  keywords: string[];
  equations: string[];
  realWorldSpecs: Record<string, string>;
  failureModes: string[];
  paramGuide?: Record<string, { typical: number; unit: string; warn: number; critical: number }>;
}

export const PHYSICS_KB: Record<string, PhysicsEntry> = {
  wind_turbine: {
    simType: "wind_turbine",
    domain: "Fluid Mechanics & Structural Engineering",
    keywords: ["wind", "turbine", "blade", "rotor", "nacelle", "energy", "wind power", "generator", "offshore", "onshore"],
    equations: [
      "Power: P = 0.5 × ρ × A × v³ × Cp  (Betz limit: Cp_max = 0.593)",
      "Blade stress: σ = M·y/I  where M ∝ v²·L²",
      "RPM ≈ λ·v / R  (tip-speed ratio λ ≈ 7 for modern HAWT)",
      "Cut-out condition: σ > σ_yield of CFRP (~500 MPa)",
    ],
    realWorldSpecs: {
      rated_wind_speed: "12–14 m/s",
      cut_out_speed: "25 m/s",
      critical_structural_limit: "35 m/s",
      standard: "IEC 61400-1",
      blade_material: "Carbon Fibre Reinforced Polymer (CFRP)",
      cfrp_yield_strength: "500–700 MPa",
      typical_blade_count: "3",
      typical_hub_height: "80–120 m",
    },
    failureModes: [
      "Blade fatigue fracture (cyclic loading beyond CFRP yield)",
      "Tower resonance at harmonic RPM",
      "Gearbox bearing failure from torque spikes",
      "Control system failure during storm (auto-shutdown per IEC 61400)",
    ],
    paramGuide: {
      Wind_Speed:    { typical: 12, unit: "m/s",   warn: 25, critical: 35 },
      Blade_Count:   { typical: 3,  unit: "blades", warn: 7,  critical: 10 },
      Blade_Pitch:   { typical: 12, unit: "deg",    warn: 35, critical: 45 },
      Rotor_Diameter:{ typical: 80, unit: "m",      warn: 130, critical: 150 },
    },
  },

  newton_cradle: {
    simType: "newton_cradle",
    domain: "Classical Mechanics — Conservation of Momentum & Energy",
    keywords: ["pendulum", "newton", "cradle", "swing", "ball", "collision", "momentum", "elastic", "oscillate", "impact"],
    equations: [
      "Conservation of momentum: Σ(m·v) = constant",
      "Elastic collision: KE conserved — ½m₁v₁² + ½m₂v₂² = constant",
      "Newton's Cradle rule: n balls in → n balls out (conservation law)",
      "Period: T = 2π√(L/g) — pendulum oscillation period",
      "Damping: A(t) = A₀·e^(−γt)",
    ],
    realWorldSpecs: {
      typical_string_length: "0.3–2 m",
      steel_ball_COR: "0.95–0.98 (near-elastic)",
      damping_coefficient: "0.01–0.05 per oscillation",
    },
    failureModes: [
      "High damping halts motion (energy dissipation > input)",
      "Too many balls raised exceeds available momentum transfer",
      "Short strings increase frequency but reduce visible swing amplitude",
    ],
    // IMPORTANT: these MUST match PhysicsNewtonsCradle.jsx — no COR, no Ball_Diameter
    paramGuide: {
      Ball_Count:    { typical: 5,    unit: "balls", warn: 6,   critical: 7 },
      Balls_Up:      { typical: 1,    unit: "balls", warn: 4,   critical: 5 },
      String_Length: { typical: 1.5,  unit: "m",     warn: 2.5, critical: 3 },
      Damping:       { typical: 0.04, unit: "",       warn: 0.3, critical: 0.5 },
    },
  },

  robot_arm: {
    simType: "robot_arm",
    domain: "Robotics — Kinematics, Dynamics & Control",
    keywords: ["robot", "arm", "joint", "actuator", "gripper", "manipulator", "servo", "DOF", "degrees of freedom", "end-effector"],
    equations: [
      "Torque: τ = I·α + τ_friction + τ_gravity",
      "Forward kinematics: x = L₁cos(θ₁) + L₂cos(θ₁+θ₂)",
      "Jacobian singularity: det(J) = 0 → loss of degree of freedom",
      "Workspace: reachable volume = π(L₁+L₂)² − π(L₁−L₂)²",
    ],
    realWorldSpecs: {
      typical_joint_speed: "100–200 deg/s",
      rated_payload: "5–20 kg (industrial), 1–5 kg (collaborative)",
      repeatability: "±0.02–0.1 mm",
      shoulder_range: "±170 deg",
      elbow_range: "±120 deg",
      wrist_range: "±90 deg",
    },
    failureModes: [
      "Over-torque: motor current exceeds thermal limit → stall or damage",
      "Kinematic singularity: det(J)=0 → infinite joint velocities for finite end-effector velocity",
      "Instability: payload exceeds rated capacity → tipping or gear strip",
      "Backlash: gear wear causes positional error accumulation",
    ],
    paramGuide: {
      Arm_Shoulder_Pitch: { typical: 0,  unit: "deg", warn: 60,  critical: 70 },
      Arm_Elbow_Pitch:    { typical: 0,  unit: "deg", warn: 100, critical: 120 },
      Arm_Wrist_Pitch:    { typical: 0,  unit: "deg", warn: 75,  critical: 90 },
      Gripper_Open:       { typical: 50, unit: "%",   warn: 95,  critical: 100 },
      Finger_Curl:        { typical: 18, unit: "deg", warn: 60,  critical: 75 },
    },
  },

  projectile: {
    simType: "projectile",
    domain: "Classical Mechanics — Projectile Motion",
    keywords: ["projectile", "launch", "cannon", "bullet", "trajectory", "ballistic", "throw", "angle", "range"],
    equations: [
      "Range: R = v₀²·sin(2θ)/g",
      "Max height: H = v₀²·sin²(θ)/(2g)",
      "Time of flight: T = 2v₀·sin(θ)/g",
      "With drag: F_drag = 0.5·ρ·Cd·A·v²",
    ],
    realWorldSpecs: {
      optimal_angle: "45° for max range (no drag)",
      with_drag_optimal: "30–38° (drag reduces optimal angle)",
      mach_1: "340 m/s — compressibility effects begin",
      typical_cannon_speed: "500–900 m/s",
    },
    failureModes: [
      "Drag instability above Mach 0.8 (transonic regime)",
      "Spin instability beyond 90 m/s without rifling stabilization",
      "Angle > 80°: near-vertical trajectory — minimal range",
    ],
    paramGuide: {
      Launch_Angle:  { typical: 45, unit: "deg",  warn: 75,  critical: 85 },
      Initial_Speed: { typical: 30, unit: "m/s",  warn: 100, critical: 150 },
      Gravity:       { typical: 9.81, unit: "m/s²", warn: 20, critical: 25 },
    },
  },

  spring_mass: {
    simType: "spring_mass",
    domain: "Classical Mechanics — Harmonic Oscillator",
    keywords: ["spring", "mass", "oscillat", "harmonic", "damping", "resonance", "vibration", "SHM"],
    equations: [
      "Hooke's Law: F = −kx",
      "Natural frequency: ω₀ = √(k/m), T = 2π/ω₀",
      "Damped: x(t) = A·e^(−γt)·cos(ω·t + φ)",
      "Resonance condition: ω_drive = ω₀ → amplitude → maximum",
      "Critical damping: γ_c = 2√(k·m) — no oscillation",
    ],
    realWorldSpecs: {
      automotive_spring_k: "20,000–50,000 N/m",
      building_isolation_k: "100–1000 N/m",
      quality_factor_underdamped: "Q > 0.5",
    },
    failureModes: [
      "Resonance: driving frequency matches natural → catastrophic amplitude growth",
      "Spring exceeds elastic limit (Hooke's Law invalid beyond yield)",
      "Over-damping: system returns to rest without oscillating",
    ],
    paramGuide: {
      Spring_Stiffness: { typical: 100, unit: "N/m",   warn: 700, critical: 1000 },
      Mass:             { typical: 2,   unit: "kg",    warn: 15,  critical: 20 },
      Damping:          { typical: 0.5, unit: "N.s/m", warn: 7,   critical: 10 },
      Amplitude:        { typical: 0.8, unit: "m",     warn: 2.5, critical: 3 },
    },
  },

  rocket: {
    simType: "rocket",
    domain: "Aerospace Engineering — Rocket Propulsion",
    keywords: ["rocket", "rocketship", "spacecraft", "missile", "space", "shuttle", "launch", "propulsion", "thruster", "booster"],
    equations: [
      "Tsiolkovsky rocket equation: Δv = Ve × ln(m_initial / m_final)",
      "Thrust: F = ṁ × Ve  (mass flow × exhaust velocity)",
      "Drag: Fd = 0.5 × ρ × v² × Cd × A",
      "Max altitude (no drag): H = v₀²·sin²(θ) / (2g)",
    ],
    realWorldSpecs: {
      spacex_falcon9_exhaust_vel: "3050 m/s (Merlin engine, vacuum)",
      falcon9_mass_ratio: "~20:1 (full to dry mass)",
      max_q_dynamic_pressure: "~35 kPa at ~14 km",
      typical_launch_angle: "90° vertical, then gravity turn",
      structural_limit_q: "50 kPa dynamic pressure",
    },
    failureModes: [
      "Max-Q structural failure: dynamic pressure exceeds vehicle limits",
      "Staging failure: separation at wrong velocity",
      "Guidance failure: attitude control lost → tumble",
      "Propellant depletion before orbit insertion",
    ],
    // Launch_Angle has a parabolic optimum at 45° — both directions reduce range,
    // so it cannot be a unidirectional constraint. Only constrain speed and gravity.
    paramGuide: {
      Launch_Angle:  { typical: 45, unit: "deg",     warn: null, critical: null }, // no constraint — optimum is 45°
      Initial_Speed: { typical: 30, unit: "m/s",     warn: 100,  critical: 150 },
      Gravity:       { typical: 9.81, unit: "m/s²",  warn: 20,   critical: 25 },
      Mass_Ratio:    { typical: 20, unit: "unitless", warn: 40,   critical: 50 },
    },
  },

  airplane: {
    simType: "airplane",
    domain: "Aerodynamics & Fluid Mechanics",
    keywords: ["airplane", "aeroplane", "aircraft", "plane", "jet", "wing", "aviation", "flight", "airliner", "glider"],
    equations: [
      "Lift: L = 0.5 × ρ × v² × CL × A  (ρ=1.225 kg/m³ at sea level)",
      "Drag: D = 0.5 × ρ × v² × CD × A  (CD_min ≈ 0.02 for clean jet)",
      "Stall condition: AoA > AoA_critical → CL drops sharply",
      "Mach: M = v / 343  (M>0.8 → transonic drag rise)",
    ],
    realWorldSpecs: {
      boeing_747_cruise: "250 m/s at 10,700 m",
      stall_speed:       "~70 m/s for commercial aircraft",
      critical_aoa:      "15–20 degrees",
      mach_limit:        "Mmo ≈ 0.89 for most airliners",
      max_structural_g:  "2.5g (positive) / −1g (negative) FAR 25",
    },
    failureModes: [
      "Aerodynamic stall: AoA exceeds 15–20° → CL collapses, aircraft falls",
      "Transonic drag rise: Mach > 0.8 → shockwaves form, drag spikes",
      "Flutter: structural resonance at high speed → wing failure",
      "Engine flameout: thrust loss at extreme AoA or fuel starvation",
    ],
    // NOTE: Air_Density is intentionally NOT a constraint — it is an environmental
    // constant (1.225 kg/m³ at sea level). Only pilot-controlled params are constrained.
    paramGuide: {
      Airspeed:         { typical: 250,    unit: "km/h", warn: 290,  critical: 330 },
      Angle_of_Attack:  { typical: 5,      unit: "deg",  warn: 14,   critical: 18 },
      Thrust:           { typical: 250000, unit: "N",    warn: 285000, critical: 310000 },
      Flap_Setting:     { typical: 0,      unit: "deg",  warn: 35,   critical: 40 },
    },
  },

  water_bottle: {
    simType: "water_bottle",
    domain: "Material Science & Thermodynamics",
    keywords: ["water", "bottle", "container", "flask", "thermos", "jug", "vessel", "plastic", "drink"],
    equations: [
      "Hoop stress (thin-walled pressure vessel): σ = P·r / t",
      "Internal pressure: P = P_atm + ρ·g·h + P_thermal",
      "Thermal expansion: ΔV = V₀ × β × ΔT  (β≈0.00021 /°C for water)",
      "Burst pressure (PET plastic): P_burst ≈ 2t·σ_yield / r",
    ],
    realWorldSpecs: {
      PET_yield_strength:     "55–75 MPa",
      typical_wall_thickness: "0.3–0.5 mm (thin), 1–3 mm (robust)",
      boiling_point:          "100°C at sea level",
      PET_softening_temp:     "80°C (glass transition)",
      burst_pressure_500ml:   "~200 kPa internal (typical safety limit ~150 kPa)",
    },
    failureModes: [
      "Thermal deformation: PET softens at 80°C → permanent shape loss",
      "Pressure burst: internal pressure > 150 kPa → seam failure",
      "Wall collapse: thin walls (<0.5mm) buckle under external load",
      "Cap ejection: overcarbonation + heat → pressure ejects cap",
    ],
    paramGuide: {
      Fill_Level:      { typical: 65,  unit: "%",   warn: 90,  critical: 98 },
      Temperature:     { typical: 20,  unit: "°C",  warn: 60,  critical: 80 },
      Pressure:        { typical: 101, unit: "kPa", warn: 130, critical: 160 },
      Wall_Thickness:  { typical: 2,   unit: "mm",  warn: 0.8, critical: 0.5 }, // NOTE: lower is worse here
    },
  },

  orbit: {
    simType: "orbit",
    domain: "Celestial Mechanics — Orbital Physics",
    keywords: ["orbit", "planet", "gravity", "space", "celestial", "satellite", "kepler", "star", "moon", "gravitational"],
    equations: [
      "Newton's Gravity: F = G·m₁·m₂/r²",
      "Orbital velocity: v = √(GM/r)",
      "Escape velocity: v_esc = √(2GM/r)",
      "Kepler's Third Law: T² ∝ r³",
    ],
    realWorldSpecs: {
      ISS_orbital_speed: "7.66 km/s at 408 km altitude",
      earth_escape_velocity: "11.2 km/s",
      geostationary_altitude: "35,786 km",
      moon_orbital_period: "27.3 days",
    },
    failureModes: [
      "Exceeding escape velocity: satellite leaves orbit permanently",
      "Too slow: orbital decay → atmospheric re-entry",
      "Orbital resonance: periodic gravitational perturbation destabilizes orbit",
    ],
    paramGuide: {
      Star_Mass:      { typical: 20, unit: "×M☉", warn: 75,  critical: 100 },
      Orbital_Radius: { typical: 4,  unit: "AU",  warn: 7,   critical: 8 },
      Orbital_Speed:  { typical: 1,  unit: "×v₀", warn: 3.5, critical: 5 },
    },
  },

  bridge: {
    simType: "bridge",
    domain: "Structural Engineering — Beam Mechanics",
    keywords: ["bridge", "beam", "structural", "load", "span", "truss", "suspension", "arch", "civil"],
    equations: [
      "Bending stress: σ = M·y/I (M=moment, y=distance from NA, I=second moment)",
      "Deflection (simply supported): δ = F·L³/(48·E·I)",
      "Safety factor: SF = σ_yield / σ_applied",
      "Shear stress: τ = VQ/(Ib) (V=shear force, Q=first moment)",
    ],
    realWorldSpecs: {
      structural_steel_yield: "250–350 MPa",
      high_strength_steel_yield: "700 MPa",
      concrete_compressive: "20–50 MPa",
      typical_live_load: "5 kN/m² (pedestrian), 15 kN/m² (highway)",
      longest_suspension_bridge: "1991 m main span (Akashi Kaikyō)",
    },
    failureModes: [
      "Bending failure: σ > σ_yield at extreme fibre",
      "Shear failure: τ > τ_yield near supports",
      "Resonance (Tacoma Narrows 1940): aeroelastic flutter at 42 m/s wind",
      "Fatigue crack propagation under cyclic loading",
    ],
    paramGuide: {
      Load:             { typical: 100, unit: "kN",  warn: 350, critical: 450 },
      Span:             { typical: 40,  unit: "m",   warn: 90,  critical: 120 },
      Material_Strength:{ typical: 350, unit: "MPa", warn: 150, critical: 100 },
      Deck_Thickness:   { typical: 0.5, unit: "m",   warn: 0.2, critical: 0.1 },
    },
  },
};

// ── Retrieval function ─────────────────────────────────────────────────────
export function retrievePhysicsKnowledge(topic: string): PhysicsEntry | null {
  const t = topic.toLowerCase();

  // Direct sim-type match
  if (PHYSICS_KB[t]) return PHYSICS_KB[t];

  // Keyword-based retrieval: score each entry by how many keywords match the topic
  let bestKey = "";
  let bestScore = 0;
  for (const [key, entry] of Object.entries(PHYSICS_KB)) {
    const score = entry.keywords.filter((kw) => t.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  return bestScore > 0 ? PHYSICS_KB[bestKey] : null;
}

// Classify sim type from topic string (deterministic, no AI needed)
export function classifySimType(topic: string): string {
  const t = topic.toLowerCase();
  const entry = retrievePhysicsKnowledge(t);
  if (entry) return entry.simType;
  // Additional pattern matching for edge cases
  if (/f1|formula.?one|racecar|race car|nascar|indy/.test(t)) return "custom";
  if (/rocket|missile|spacecraft|space.?ship|shuttle|booster/.test(t)) return "rocket";
  if (/airplane|aeroplane|aircraft|airliner|plane|jet|aviation|glider|drone/.test(t)) return "airplane";
  if (/water.?bottle|bottle|flask|thermos|container|vessel|jug/.test(t)) return "water_bottle";
  if (/earthquake|seismic|vibrat/.test(t)) return "spring_mass";
  if (/black.?hole|neutron.?star|galaxy|comet|asteroid|solar.?system/.test(t)) return "orbit";
  return "custom";
}
