// Physics Knowledge Base — RAG source for the Research Agent
// Each entry is indexed by sim type and contains domain knowledge, real-world specs,
// equations, and failure modes grounded in actual physics literature.

/** Normalize synonyms / typos so routing matches user intent (e.g. "inverse pendulum" → inverted pendulum). */
export function expandPhysicsTopicAliases(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/\binversed?\s+pendulum\b/g, "inverted pendulum")
    .replace(/\ba\s+inverse\s+pendulum\b/g, "inverted pendulum")
    .replace(/\ban\s+inverse\s+pendulum\b/g, "inverted pendulum");
}

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

  /** Distinct from Newton's cradle / simple pendulum — control on a cart, unstable equilibrium */
  inverted_pendulum: {
    simType: "inverted_pendulum",
    domain: "Classical Mechanics — Underactuated Systems & Stability",
    keywords: [
      "inverted pendulum",
      "inverse pendulum",
      "inversed pendulum",
      "cartpole",
      "cart pole",
      "pole on a cart",
      "pole balancing",
      "balancing inverted",
      "double inverted",
      "segway",
      "self-balancing",
      "reaction wheel inverted",
      "inverted bot",
    ],
    equations: [
      "Linearized dynamics: (M+m)ẍ + mlθ̈cosθ − mlθ̇²sinθ = F",
      "θ̈ = (g sinθ − ẍ cosθ)/l  (pendulum on accelerating cart)",
      "Characteristic equation for linearized upright: unstable without feedback",
      "Typical LQR / pole placement keeps θ ≈ 0 while tracking x",
    ],
    realWorldSpecs: {
      typical_pole_length: "0.3–0.6 m (education kits)",
      cart_mass_ratio: "M/m typically 5–20 for classroom rigs",
      sensor_rate: "100–500 Hz IMU for balance bots",
    },
    failureModes: [
      "Excessive pole angle: center of mass outside support → tip-over",
      "Insufficient motor force: cannot correct growing θ",
      "High damping in joint: kills fast correction needed for stability",
      "Cart hits track limits: control authority lost",
    ],
    paramGuide: {
      Pole_Angle:    { typical: 12, unit: "deg", warn: 35, critical: 50 },
      Cart_Position: { typical: 0,  unit: "m",   warn: 1.6, critical: 2.0 },
      Pole_Length:   { typical: 0.55, unit: "m",  warn: 1.0, critical: 1.15 },
      Motor_Force:   { typical: 0,  unit: "N",   warn: 95,  critical: 115 },
      Damping:       { typical: 0.08, unit: "", warn: 0.22, critical: 0.3 },
    },
  },

  newton_cradle: {
    simType: "newton_cradle",
    domain: "Classical Mechanics — Conservation of Momentum & Energy",
    keywords: ["pendulum", "newton", "cradle", "swing", "ball", "collision", "momentum", "elastic", "oscillate", "impact", "sphere chain", "executive toy"],
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

  mechanical_gears: {
    simType: "mechanical_gears",
    domain: "Mechanical Engineering — Gear Kinematics & Tribology",
    keywords: ["gear", "gears", "spur gear", "mechanical gears", "gear train", "gear ratio", "tooth", "teeth", "transmission", "gearbox", "pinion", "rack and pinion"],
    equations: [
      "Gear ratio: i = N₂/N₁ = ω₁/ω₂ (tooth count ratio = inverse speed ratio)",
      "Pitch radius: r = m·N/2 (module × tooth count / 2)",
      "Torque: T_out = T_in × i × η (efficiency η ≈ 0.97 for spur gears)",
      "Contact stress: σ_H = √(F_t·K/(b·d₁·Z_H²)) (Hertz contact theory)",
      "Lewis bending stress: σ_F = F_t·K_A/(b·m·Y) (Y = Lewis form factor)",
    ],
    realWorldSpecs: {
      spur_gear_efficiency: "96–99% per mesh",
      typical_module: "1–10 mm (larger = stronger teeth)",
      max_pitch_line_velocity: "~25 m/s for precision gears",
      tooth_hardness_steel: "58–62 HRC (case hardened)",
      typical_lubrication_viscosity: "ISO VG 68–320",
    },
    failureModes: [
      "Tooth fatigue fracture: bending stress > endurance limit → root crack",
      "Pitting: contact stress > Hertz limit → surface fatigue",
      "Scoring/scuffing: lubrication breakdown at high speed → tooth welding",
      "Wear: abrasive particles in oil → accelerated tooth loss",
    ],
    paramGuide: {
      Number_of_Teeth:      { typical: 20,  unit: "teeth",    warn: 50,   critical: 80   },
      Gear_Ratio:           { typical: 2,   unit: "unitless", warn: 8,    critical: 12   },
      Input_Torque:         { typical: 100, unit: "Nm",       warn: 400,  critical: 600  },
      Lubrication_Quality:  { typical: 0.8, unit: "unitless", warn: 0.35, critical: 0.2  },
      Tooth_Strength:       { typical: 500, unit: "MPa",      warn: 300,  critical: 200  },
      Operating_Speed:      { typical: 1000,unit: "RPM",      warn: 3000, critical: 4500 },
    },
  },

  bicycle: {
    simType: "bicycle",
    domain: "Vehicle Dynamics — Bicycle Mechanics & Kinematics",
    keywords: ["bicycle", "bike", "cycling", "cycle", "road bike", "mountain bike", "bmx", "fixie", "velodrome", "pedal", "chain drive", "derailleur"],
    equations: [
      "Speed: v = π·d·n/i_gear (wheel diameter, cadence, gear ratio)",
      "Braking: F_brake = μ·m·g (friction × mass × gravity)",
      "Rolling resistance: F_roll = C_rr·m·g (coefficient × normal force)",
      "Aerodynamic drag: F_drag = ½ρv²·C_d·A",
      "Power: P = F_total·v = (F_drag + F_roll + F_grade)·v",
    ],
    realWorldSpecs: {
      road_bike_wheel: "700c = 622mm bead seat diameter",
      typical_gear_range: "1:1 to 5:1 (46-11 chainring-sprocket)",
      typical_cadence: "80–100 RPM",
      max_world_record_speed: "284 km/h (motor-paced), 133 km/h (unpaced)",
      tyre_pressure_road: "80–130 psi",
    },
    failureModes: [
      "Wheel spoke fatigue: tension cycling → spoke breakage → wheel collapse",
      "Chain failure: excessive torque or wear → chain snap",
      "Frame fatigue: repeated load cycling → crack initiation at welds",
      "Brake fade: overheating → glazed pads → sudden loss of stopping power",
    ],
    paramGuide: {
      Wheel_Diameter: { typical: 26,  unit: "inches",   warn: 36,  critical: 40  },
      Gear_Ratio:     { typical: 2.5, unit: "unitless", warn: 6,   critical: 8   },
      Brake_Force:    { typical: 50,  unit: "N",        warn: 150, critical: 200 },
      Rider_Mass:     { typical: 75,  unit: "kg",       warn: 100, critical: 120 },
      Speed:          { typical: 25,  unit: "km/h",     warn: 45,  critical: 60  },
    },
  },

  submarine: {
    simType: "submarine",
    domain: "Naval Architecture — Submarine Hydrostatics & Pressure Hull",
    keywords: [
      "submarine",
      "submersible",
      "u-boat",
      "underwater vessel",
      "ballast tank",
      "snorkel",
      "periscope",
      "diesel-electric submarine",
      "ssn",
      "ssbn",
    ],
    equations: [
      "Archimedes: buoyant force F_b = ρ_water·g·V_displaced",
      "Hydrostatic pressure: p = p₀ + ρ·g·h (hull must withstand p at depth)",
      "Steady dive: weight = buoyancy when ballast matches displacement",
      "Propeller thrust: T ∝ ρ·n²·D⁴ (n = rev/s, D = diameter)",
    ],
    realWorldSpecs: {
      typical_test_depth: "300–400 m for attack submarines (classified crush depth higher)",
      seawater_density: "~1025 kg/m³ at surface",
      pressure_at_200m: "~2.0 MPa gauge (20 bar) on hull",
      typical_hull_steel: "HY-80 / HY-100 high-yield submarine steel",
    },
    failureModes: [
      "Hull below minimum thickness: implosion risk at operating depth",
      "Excessive depth: yield/exceeding crush depth → catastrophic hull failure",
      "Snorkel depth errors: flooding or engine intake failure",
    ],
    paramGuide: {
      Ballast_Tank_Volume: { typical: 500, unit: "m³", warn: 800, critical: 1000 },
      Propeller_RPM:       { typical: 80,  unit: "rev/s", warn: 120, critical: 150 },
      Dive_Depth:          { typical: 200, unit: "m", warn: 400, critical: 600 },
      Hull_Thickness:      { typical: 0.18, unit: "m", warn: 0.15, critical: 0.12 },
      Snorkel_Depth:       { typical: 1,   unit: "m", warn: 8, critical: 12 },
    },
  },

  breadboard: {
    simType: "breadboard",
    domain: "Electronics — Solderless Prototyping & Contact Physics",
    keywords: [
      "breadboard",
      "solderless breadboard",
      "prototyping board",
      "plugboard",
      "dupont",
      "jumper wires",
      "dip socket",
      "electronics prototyping",
    ],
    equations: [
      "Ohm's law: V = I·R (contact + track resistance)",
      "RC at contacts: τ = R_contact·C_parasitic (high frequency rolloff)",
      "Thermal noise: V_rms ∝ √(4kTRΔf) (temperature-dependent)",
    ],
    realWorldSpecs: {
      typical_pitch: "2.54 mm (0.1 in) hole spacing",
      contact_resistance: "~0.01–0.1 Ω per tie point (varies with wear)",
      abs_plastic: "common breadboard body material",
    },
    failureModes: [
      "Loose contacts: intermittent resistance → digital logic errors",
      "High frequency: parasitic capacitance limits usable bandwidth",
      "Humidity + contamination: leakage paths between rows",
    ],
    paramGuide: {
      Contact_Resistance: { typical: 1,   unit: "Ω", warn: 5, critical: 10 },
      Component_Mass:     { typical: 50,  unit: "g", warn: 150, critical: 250 },
      Signal_Frequency:   { typical: 1,   unit: "MHz", warn: 50, critical: 100 },
      Humidity_Level:     { typical: 50,  unit: "%", warn: 75, critical: 90 },
      Temperature:        { typical: 25,  unit: "°C", warn: 60, critical: 85 },
    },
  },

  helicopter: {
    simType: "helicopter",
    domain: "Aeronautics — Rotary-Wing Flight Mechanics",
    keywords: ["helicopter", "chopper", "helo", "rotor", "rotorcraft", "autorotation", "blade", "collective pitch", "cyclic pitch", "tail rotor", "hover"],
    equations: [
      "Lift: L = ½ρv²·C_L·A (density, tip speed, lift coeff, disc area)",
      "Thrust: T = Ω²·ρ·A·R²·C_T (angular velocity, disc area, radius)",
      "Torque reaction: Q_main = Q_tail (tail rotor balances torque)",
      "Hover power: P = T^(3/2) / √(2ρA) (disk actuator theory)",
      "Blade tip speed: v_tip = Ω·R (critical: compressibility near Mach 0.9)",
    ],
    realWorldSpecs: {
      UH60_main_rotor_rpm: "258 rpm (4 blades, 8.18 m radius)",
      UH60_gross_weight: "9980 kg max",
      UH60_engine_power: "2 × 1940 shp",
      typical_collective_range: "0–15° blade pitch",
      tail_rotor_speed_ratio: "tail ≈ 4.5× main rotor angular velocity",
      hover_ceiling: "~4000 m ISA (density altitude limited)",
    },
    failureModes: [
      "Blade stall: excessive collective pitch → retreating blade stalls at high speed",
      "Tail rotor failure: uncontrolled yaw spin from main rotor torque",
      "Ground resonance: rotor imbalance couples with undercarriage at critical RPM",
      "Vortex ring state: descent into own downwash → catastrophic lift loss",
    ],
    paramGuide: {
      Main_Rotor_RPM: { typical: 300, unit: "RPM", warn: 400, critical: 500 },
      Collective_Pitch:{ typical: 10,  unit: "deg", warn: 18,  critical: 22  },
      Air_Density:    { typical: 1.225,unit: "kg/m³",warn: 0.9, critical: 0.7 },
      Gross_Weight:   { typical: 3000, unit: "kg",  warn: 4000, critical: 4500},
      Tail_Rotor_RPM: { typical: 1800, unit: "RPM", warn: 2500, critical: 3000},
    },
  },

  f1_car: {
    simType: "f1_car",
    domain: "Vehicle Dynamics — Formula One Aerodynamics & Performance",
    keywords: ["f1", "formula one", "formula 1", "formula-one", "racecar", "race car", "f1 car", "grand prix", "motorsport", "downforce", "drs"],
    equations: [
      "Downforce: F_d = ½ρv²·C_L·A (density, velocity, lift coefficient, area)",
      "Drag: F_drag = ½ρv²·C_D·A",
      "Lateral G-force: a_lat = v²/r (cornering radius r)",
      "Braking distance: s = v²/(2·μ·g) (friction coefficient μ)",
      "Power: P = F_drag·v + F_rolling·v (aerodynamic + tyre losses)",
    ],
    realWorldSpecs: {
      max_speed: "380 km/h (Monza straight)",
      downforce_at_200: "~2500 N at 200 km/h",
      downforce_at_300: "~5000 N at 300 km/h",
      tyre_width_front: "305 mm",
      tyre_width_rear: "405 mm",
      engine_power: "~1000 hp (1.6L V6 hybrid + ERS)",
      fuel_load: "110 kg max race start",
      drs_speed_gain: "10–15 km/h on straights",
    },
    failureModes: [
      "Overspeed aerodynamic instability: rear wing stall at extreme angles",
      "Tyre degradation: thermal graining above Tyre_Pressure threshold",
      "ERS overload: energy store thermal runaway",
      "Loss of downforce: diffuser stall at high yaw angles",
    ],
    paramGuide: {
      Speed:          { typical: 200, unit: "km/h",   warn: 320,  critical: 360 },
      Rear_Wing_Angle:{ typical: 12,  unit: "degrees", warn: 25,   critical: 35  },
      Downforce:      { typical: 3000,unit: "N",       warn: 6000, critical: 8000},
      Tire_Pressure:  { typical: 24,  unit: "psi",     warn: 30,   critical: 35  },
      Brake_Balance:  { typical: 55,  unit: "%",       warn: 70,   critical: 80  },
      ERS_Deployment: { typical: 60,  unit: "%",       warn: 90,   critical: 100 },
      Fuel_Load:      { typical: 80,  unit: "kg",      warn: 100,  critical: 110 },
    },
  },

  steam_engine: {
    simType: "steam_engine",
    domain: "Thermodynamics — Rankine Cycle & Steam Power",
    keywords: ["steam engine", "steam turbine", "piston engine", "steam power", "watt engine", "steam boiler", "rankine", "flywheel", "steam piston", "stirling"],
    equations: [
      "Rankine efficiency: η = 1 − Q_out/Q_in (heat rejection over input)",
      "Steam work: W = (P1 − P2)·V (expansion from inlet to exhaust pressure)",
      "Mean effective pressure: MEP = W/V_displacement",
      "Torque: τ = F_piston·r_crank (force × crank radius)",
      "Carnot limit: η_max = 1 − T_cold/T_hot (absolute temperatures)",
    ],
    realWorldSpecs: {
      watt_engine_1782: "efficiency ~2–3%, 40 rpm, 10 hp",
      modern_steam_plant: "efficiency ~40%, 3000 rpm (turbine)",
      typical_boiler_pressure: "8–15 bar (locomotive), up to 200 bar (power station)",
      typical_boiler_temp: "150–370°C",
      conrod_to_crank_ratio: "3:1 to 5:1 typical",
    },
    failureModes: [
      "Boiler explosion: Boiler_Pressure exceeds design limit → catastrophic failure",
      "Thermal creep: prolonged high Boiler_Temp weakens steel",
      "Lubrication failure: piston seizure, scoring of cylinder walls",
      "Cylinder condensation: liquid water hammer when cold steam admitted",
    ],
    paramGuide: {
      Boiler_Pressure:  { typical: 10,  unit: "bar", warn: 14,  critical: 18  },
      Piston_Speed:     { typical: 60,  unit: "RPM", warn: 200, critical: 300 },
      Boiler_Temp:      { typical: 180, unit: "°C",  warn: 260, critical: 320 },
      Lubrication_Level:{ typical: 80,  unit: "%",   warn: 30,  critical: 15  },
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
  const t = expandPhysicsTopicAliases(topic);

  // Direct sim-type match
  if (PHYSICS_KB[t]) return PHYSICS_KB[t];

  // Keyword-based retrieval: score each entry by how many keywords match the topic.
  // Disambiguation: "inverted pendulum" is NOT Newton's cradle (both involve "pendulum" language).
  let bestKey = "";
  let bestScore = 0;
  for (const [key, entry] of Object.entries(PHYSICS_KB)) {
    const score = entry.keywords.filter((kw) => {
      if (!t.includes(kw)) return false;
      if (entry.simType === "newton_cradle" && kw === "pendulum" && /\b(inverted|inverse)\s+pendulum\b/.test(t))
        return false;
      return true;
    }).length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  return bestScore > 0 ? PHYSICS_KB[bestKey] : null;
}

// Classify sim type from topic string (deterministic, no AI needed)
export function classifySimType(topic: string): string {
  const t = expandPhysicsTopicAliases(topic);

  // Conceptual routing first (phrase-level), before single-keyword scoring
  if (
    /\binverted\s+pendulum\b/.test(t) ||
    /cart[-\s]?pole|cartpole/.test(t) ||
    /\bpole\s+on\s+(a\s+)?cart\b/.test(t) ||
    /balancing\s+inverted|(double\s+)+inverted/.test(t) ||
    /self[-\s]?balancing\s+(robot|vehicle|wheelchair)/.test(t) ||
    /\bsegway\b/.test(t) ||
    /reaction\s+wheel.*inverted|inverted\s+bot/.test(t)
  ) {
    return "inverted_pendulum";
  }

  if (/\bsubmarine\b|submersible|\bu-boat\b|diesel[-\s]?electric\s+sub/.test(t)) return "submarine";
  if (/\bbreadboard\b|solderless\s+breadboard|prototyping\s+board|plugboard/.test(t)) return "breadboard";

  const entry = retrievePhysicsKnowledge(topic);
  if (entry) return entry.simType;
  // Additional pattern matching for dedicated scenes
  if (/\bgear(s|box|train|ratio|pair)?\b|spur.?gear|pinion|tooth.?mesh|mechanical.?gear/.test(t)) return "mechanical_gears";
  if (/\bbicycle\b|\bbike\b|cycling|road.?bike|mountain.?bike|bmx|velodrome/.test(t)) return "bicycle";
  if (/helicopter|chopper|\bhelo\b|rotorcraft/.test(t)) return "helicopter";
  if (/f1|formula.?one|formula.?1|racecar|race.?car|f1.?car/.test(t)) return "f1_car";
  if (/steam.?engine|steam.?turbine|piston.?engine|steam.?power|watt.?engine|stirling/.test(t)) return "steam_engine";
  if (/rocket|missile|spacecraft|space.?ship|shuttle|booster/.test(t)) return "rocket";
  if (/airplane|aeroplane|aircraft|airliner|plane|jet|aviation|glider|drone/.test(t)) return "airplane";
  if (/water.?bottle|bottle|flask|thermos|container|vessel|jug/.test(t)) return "water_bottle";
  if (/earthquake|seismic|vibrat/.test(t)) return "spring_mass";
  if (/black.?hole|neutron.?star|galaxy|comet|asteroid|solar.?system/.test(t)) return "orbit";
  return "custom";
}
