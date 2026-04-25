/**
 * computeGraphData.js
 * Pure functions that compute chart data from simulation parameters.
 * All math is self-contained — no API calls, no side effects.
 *
 * Returns an array of chart configs:
 * [{ id, title, xLabel, yLabel, type, data, currentX, series, regions, annotation }]
 */

const N = 80; // data points per chart

function linspace(a, b, n = N) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(a + (b - a) * (i / (n - 1)));
  return arr;
}

function clampDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

// ── Wind Turbine ─────────────────────────────────────────────────────────────
function computeWindTurbineGraphs(p) {
  const D = Math.max(1, p.Rotor_Diameter ?? 80);
  const R = D / 2;
  const A = Math.PI * R * R;
  const rho = 1.225;
  const Cp = 0.42; // realistic Cp (below Betz 0.593)
  const blades = Math.max(1, p.Blade_Count ?? 3);
  const currentV = p.Wind_Speed ?? 12;

  // Power curve
  const vArr = linspace(0, 40, N);
  const powerData = vArr.map((v) => ({
    v: +v.toFixed(2),
    power: +(0.5 * rho * A * v * v * v * Cp / 1000).toFixed(2), // kW
    betz: +(0.5 * rho * A * v * v * v * 0.593 / 1000).toFixed(2), // Betz limit kW
  }));

  // Blade stress vs wind speed
  const stressData = vArr.map((v) => {
    const M = 0.3 * 0.5 * rho * v * v * R * R; // simplified bending moment (N·m)
    const sigma = (M * (R * 0.01)) / (Math.PI * (R * 0.005) ** 4 / 4) / 1e6; // MPa, thin spar
    return { v: +v.toFixed(2), stress: +Math.min(sigma, 600).toFixed(2) };
  });

  // TSR efficiency curve
  const tsrArr = linspace(1, 12, 60);
  const tsrData = tsrArr.map((tsr) => {
    // Simplified Cp vs TSR curve peaking near TSR=7
    const Cp_tsr = 0.48 * (tsr / 7) * Math.exp(1 - (tsr / 7) ** 2) * Math.min(1, blades / 3 * 0.9 + 0.1);
    return { tsr: +tsr.toFixed(2), Cp: +Math.max(0, Cp_tsr).toFixed(4) };
  });

  const currentTSR = (currentV > 0) ? +(10 * R / (currentV * 60 / (2 * Math.PI))) : 6;

  return [
    {
      id: "power_curve", title: "Power Curve", xKey: "v", xLabel: "Wind Speed (m/s)",
      yLabel: "Power (kW)", type: "line",
      paramKey: "Wind_Speed", paramMin: 0, paramMax: 40, paramDefault: 12, paramUnit: "m/s",
      series: [
        { key: "power", label: "Actual Power (Cp=0.42)", color: "#6366f1" },
        { key: "betz", label: "Betz Limit (Cp=0.593)", color: "#22d3ee", dash: "4 4" },
      ],
      data: powerData, currentX: currentV,
      regions: [{ x1: 25, x2: 35, color: "rgba(251,191,36,0.12)", label: "Warning" }, { x1: 35, x2: 40, color: "rgba(239,68,68,0.12)", label: "Critical" }],
      annotation: `Current output: ${(0.5 * rho * A * currentV ** 3 * Cp / 1000).toFixed(1)} kW`,
    },
    {
      id: "blade_stress", title: "Blade Root Stress vs Wind Speed", xKey: "v", xLabel: "Wind Speed (m/s)",
      yLabel: "Bending Stress (MPa)", type: "line",
      paramKey: "Wind_Speed", paramMin: 0, paramMax: 40, paramDefault: 12, paramUnit: "m/s",
      series: [{ key: "stress", label: "Root Bending Stress", color: "#f59e0b" }],
      data: stressData, currentX: currentV,
      regions: [{ x1: 25, x2: 40, color: "rgba(239,68,68,0.10)", label: "Yield Zone (≥500 MPa)" }],
      annotation: "CFRP yield strength ~500 MPa",
    },
    {
      id: "tsr_curve", title: "Power Coefficient vs Tip Speed Ratio", xKey: "tsr", xLabel: "Tip Speed Ratio (λ)",
      yLabel: "Cp", type: "line",
      series: [{ key: "Cp", label: `Cp (${blades} blades)`, color: "#34d399" }],
      data: tsrData, currentX: +currentTSR.toFixed(2),
      annotation: "Optimal TSR ≈ 6-8 for 3-blade turbines",
    },
  ];
}

// ── Projectile ───────────────────────────────────────────────────────────────
function computeProjectileGraphs(p) {
  const v0 = Math.max(1, p.Initial_Speed ?? 30);
  const theta = (p.Launch_Angle ?? 45) * Math.PI / 180;
  const g = Math.max(0.1, p.Gravity ?? 9.81);

  const tFlight = (2 * v0 * Math.sin(theta)) / g;
  const tArr = linspace(0, tFlight, N);

  // Trajectory x-y
  const trajData = tArr.map((t) => ({
    x: +(v0 * Math.cos(theta) * t).toFixed(2),
    y: +Math.max(0, v0 * Math.sin(theta) * t - 0.5 * g * t * t).toFixed(2),
  }));

  // Speed vs time
  const speedData = tArr.map((t) => ({
    t: +t.toFixed(3),
    speed: +(Math.sqrt((v0 * Math.cos(theta)) ** 2 + (v0 * Math.sin(theta) - g * t) ** 2)).toFixed(2),
    vx: +(v0 * Math.cos(theta)).toFixed(2),
    vy: +(Math.abs(v0 * Math.sin(theta) - g * t)).toFixed(2),
  }));

  // Range vs angle (for current v0 and g)
  const angArr = linspace(0, 90, 91);
  const rangeData = angArr.map((a) => {
    const th = a * Math.PI / 180;
    return { angle: a, range: +(v0 * v0 * Math.sin(2 * th) / g).toFixed(2) };
  });

  const maxRange = (v0 * v0) / g;

  return [
    {
      id: "trajectory", title: "Projectile Trajectory", xKey: "x", xLabel: "Horizontal Distance (m)",
      yLabel: "Height (m)", type: "scatter",
      series: [{ key: "y", label: "Trajectory", color: "#6366f1" }],
      data: trajData,
      annotation: `Max height: ${(v0*v0*Math.sin(theta)**2/(2*g)).toFixed(1)}m  |  Range: ${(v0*v0*Math.sin(2*theta)/g).toFixed(1)}m`,
    },
    {
      id: "speed_time", title: "Speed Components vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Speed (m/s)", type: "line",
      series: [
        { key: "speed", label: "|v| Total", color: "#6366f1" },
        { key: "vx", label: "vx (horizontal)", color: "#22d3ee" },
        { key: "vy", label: "|vy| (vertical)", color: "#f59e0b" },
      ],
      data: speedData,
      annotation: `Impact speed: ${v0.toFixed(1)} m/s  |  Air time: ${tFlight.toFixed(2)}s`,
    },
    {
      id: "range_angle", title: "Range vs Launch Angle", xKey: "angle", xLabel: "Launch Angle (°)",
      yLabel: "Range (m)", type: "line",
      paramKey: "Launch_Angle", paramMin: 5, paramMax: 85, paramDefault: 45, paramUnit: "°",
      series: [{ key: "range", label: "Range", color: "#34d399" }],
      data: rangeData, currentX: (p.Launch_Angle ?? 45),
      annotation: `Max range ${maxRange.toFixed(1)}m at 45°`,
    },
  ];
}

// ── Spring-Mass ───────────────────────────────────────────────────────────────
function computeSpringMassGraphs(p) {
  const k = Math.max(1, p.Spring_Stiffness ?? 100);
  const m = Math.max(0.01, p.Mass ?? 2);
  const c = Math.max(0, p.Damping ?? 0.5);
  const A0 = Math.max(0.01, p.Amplitude ?? 0.8);

  const omega_n = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const omega_d = zeta < 1 ? omega_n * Math.sqrt(Math.max(0, 1 - zeta * zeta)) : 0;
  const T = zeta < 1 && omega_d > 0 ? 6 * Math.PI / omega_d : 20 / omega_n;

  const tArr = linspace(0, T, N);

  // Position vs time
  let xData;
  if (zeta < 1 && omega_d > 0) {
    xData = tArr.map((t) => ({
      t: +t.toFixed(3),
      x: +(A0 * Math.exp(-zeta * omega_n * t) * Math.cos(omega_d * t)).toFixed(4),
      envelope: +(A0 * Math.exp(-zeta * omega_n * t)).toFixed(4),
      neg_envelope: +(-A0 * Math.exp(-zeta * omega_n * t)).toFixed(4),
    }));
  } else {
    // Overdamped or critically damped
    xData = tArr.map((t) => ({
      t: +t.toFixed(3),
      x: +(A0 * Math.exp(-zeta * omega_n * t)).toFixed(4),
      envelope: +(A0 * Math.exp(-zeta * omega_n * t)).toFixed(4),
      neg_envelope: +(-A0 * Math.exp(-zeta * omega_n * t)).toFixed(4),
    }));
  }

  // Energy vs time
  const energyData = tArr.map((t, i) => {
    const x = xData[i].x;
    const vel = i > 0 ? (xData[i].x - xData[i - 1].x) / (tArr[1] - tArr[0]) : 0;
    const PE = 0.5 * k * x * x;
    const KE = 0.5 * m * vel * vel;
    return { t: +t.toFixed(3), PE: +PE.toFixed(4), KE: +KE.toFixed(4), total: +(PE + KE).toFixed(4) };
  });

  // Phase portrait (x vs v)
  const phaseData = tArr.map((t, i) => {
    const x = xData[i].x;
    const vel = i > 0 ? (xData[i].x - xData[i - 1].x) / (tArr[1] - tArr[0]) : 0;
    return { x: +x.toFixed(4), v: +vel.toFixed(4) };
  });

  return [
    {
      id: "oscillation", title: "Position vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Position (m)", type: "line",
      series: [
        { key: "x", label: "Position x(t)", color: "#6366f1" },
        { key: "envelope", label: "Envelope", color: "rgba(99,102,241,0.3)", dash: "3 3" },
        { key: "neg_envelope", label: "", color: "rgba(99,102,241,0.3)", dash: "3 3" },
      ],
      data: xData,
      annotation: `ωn=${omega_n.toFixed(2)} rad/s  |  ζ=${zeta.toFixed(3)}  |  ${zeta < 1 ? "Underdamped" : zeta === 1 ? "Critically damped" : "Overdamped"}`,
    },
    {
      id: "energy", title: "Energy vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Energy (J)", type: "line",
      series: [
        { key: "total", label: "Total Energy", color: "#6366f1" },
        { key: "KE", label: "Kinetic Energy", color: "#22d3ee" },
        { key: "PE", label: "Potential Energy", color: "#f59e0b" },
      ],
      data: energyData,
      annotation: `Initial energy: ${(0.5 * k * A0 * A0).toFixed(3)} J`,
    },
    {
      id: "phase", title: "Phase Portrait (x vs ẋ)", xKey: "x", xLabel: "Position (m)",
      yLabel: "Velocity (m/s)", type: "scatter",
      series: [{ key: "v", label: "Phase trajectory", color: "#34d399" }],
      data: phaseData,
      annotation: "Spiral inward → energy dissipation from damping",
    },
  ];
}

// ── Orbit ─────────────────────────────────────────────────────────────────────
function computeOrbitGraphs(p) {
  const M = Math.max(1, p.Star_Mass ?? 20);
  const r0 = Math.max(1, p.Orbital_Radius ?? 4);
  const vRel = Math.max(0.1, p.Orbital_Speed ?? 1);

  const GM = M * 0.5; // scaled units
  const v_circ = Math.sqrt(GM / r0);
  const v = v_circ * vRel;

  // Orbital path (ellipse from given initial conditions)
  // For simplicity, approximate as ellipse with semi-major = r0
  const phiArr = linspace(0, 2 * Math.PI, 100);
  const ecc = Math.abs(1 - vRel * vRel); // eccentricity approximation
  const a = r0;
  const b = a * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const orbitData = phiArr.map((phi) => ({
    x: +(a * Math.cos(phi)).toFixed(3),
    y: +(b * Math.sin(phi)).toFixed(3),
  }));

  // Speed vs radius (Kepler)
  const rArr = linspace(0.5, 12, N);
  const keplerData = rArr.map((r) => ({
    r: +r.toFixed(2),
    v: +(Math.sqrt(GM / r)).toFixed(3),
    escape: +(Math.sqrt(2 * GM / r)).toFixed(3),
  }));

  // Period vs semi-major axis (T^2 ∝ a^3)
  const aArr = linspace(1, 10, N);
  const periodData = aArr.map((aa) => ({
    a: +aa.toFixed(2),
    T: +(2 * Math.PI * Math.sqrt(aa ** 3 / GM)).toFixed(3),
  }));

  return [
    {
      id: "orbit_path", title: "Orbital Path", xKey: "x", xLabel: "x (AU)",
      yLabel: "y (AU)", type: "scatter",
      series: [{ key: "y", label: "Orbit", color: "#6366f1" }],
      data: orbitData,
      annotation: `Eccentricity ≈ ${ecc.toFixed(2)}  |  v/v_circular = ${vRel.toFixed(2)}`,
    },
    {
      id: "kepler_speed", title: "Orbital Speed vs Radius (Kepler)", xKey: "r", xLabel: "Orbital Radius (AU)",
      yLabel: "Speed (rel. units)", type: "line",
      series: [
        { key: "v", label: "Circular orbit speed", color: "#6366f1" },
        { key: "escape", label: "Escape velocity", color: "#f59e0b", dash: "4 4" },
      ],
      data: keplerData, currentX: r0,
      annotation: "v = √(GM/r)  |  v_esc = √(2GM/r)",
    },
    {
      id: "kepler_period", title: "Orbital Period vs Semi-major Axis", xKey: "a", xLabel: "Semi-major Axis (AU)",
      yLabel: "Period (years)", type: "line",
      series: [{ key: "T", label: "Orbital Period T", color: "#34d399" }],
      data: periodData, currentX: r0,
      annotation: "Kepler's 3rd Law: T² ∝ a³",
    },
  ];
}

// ── Bridge ────────────────────────────────────────────────────────────────────
function computeBridgeGraphs(p) {
  const W = Math.max(1, p.Load ?? 100); // kN
  const L = Math.max(1, p.Span ?? 40); // m
  const E = 200e3; // MPa for steel
  const sigma_y = Math.max(1, p.Material_Strength ?? 350); // MPa
  const h = Math.max(0.01, p.Deck_Thickness ?? 0.5); // m
  const b = 1.0; // assumed width m

  // I for rectangular section
  const I = (b * h ** 3) / 12; // m^4

  // Deflection vs Load
  const wArr = linspace(0, 500, N);
  const deflData = wArr.map((w) => {
    // w is kN, convert to N/m assuming uniform over L
    const q = (w * 1000) / L; // N/m
    const delta = (5 * q * L ** 4) / (384 * E * 1e6 * I); // m
    const sigma_max = (w * 1000 * L) / (8 * (I / (h / 2)) * 1e6); // MPa (M=wL/8 for mid-span)
    return { load: w, deflection: +(delta * 1000).toFixed(3), stress: +sigma_max.toFixed(2) };
  });

  // Bending moment diagram (simply supported, uniform load)
  const xArr = linspace(0, L, 60);
  const q_cur = (W * 1000) / L;
  const momentData = xArr.map((x) => ({
    x: +x.toFixed(2),
    moment: +(q_cur * x * (L - x) / 2 / 1000).toFixed(2), // kN·m
  }));

  // Shear force diagram
  const shearData = xArr.map((x) => ({
    x: +x.toFixed(2),
    shear: +(q_cur * (L / 2 - x) / 1000).toFixed(2), // kN
  }));

  return [
    {
      id: "deflection_load", title: "Mid-span Deflection vs Load", xKey: "load", xLabel: "Load (kN)",
      yLabel: "Deflection (mm)", type: "line",
      series: [
        { key: "deflection", label: "Deflection (mm)", color: "#6366f1" },
      ],
      data: deflData, currentX: W,
      regions: [
        { x1: sigma_y * 0.6, x2: sigma_y, color: "rgba(251,191,36,0.12)", label: "Warning" },
        { x1: sigma_y, x2: 500, color: "rgba(239,68,68,0.10)", label: "Yield" },
      ],
      annotation: `Current deflection: ${((5*(W*1000/L)*L**4)/(384*E*1e6*I)*1000).toFixed(1)} mm  |  L/360 limit: ${(L/360*1000).toFixed(1)} mm`,
    },
    {
      id: "bending_moment", title: "Bending Moment Diagram", xKey: "x", xLabel: "Position along span (m)",
      yLabel: "Bending Moment (kN·m)", type: "area",
      series: [{ key: "moment", label: "M(x)", color: "#6366f1" }],
      data: momentData,
      annotation: `Max moment at mid-span: ${(q_cur*L**2/8/1000).toFixed(1)} kN·m`,
    },
    {
      id: "shear_force", title: "Shear Force Diagram", xKey: "x", xLabel: "Position along span (m)",
      yLabel: "Shear Force (kN)", type: "area",
      series: [{ key: "shear", label: "V(x)", color: "#f59e0b" }],
      data: shearData,
      annotation: `Max shear at supports: ±${(q_cur*L/2/1000).toFixed(1)} kN`,
    },
  ];
}

// ── Rocket ────────────────────────────────────────────────────────────────────
function computeRocketGraphs(p) {
  const v0 = Math.max(1, p.Initial_Speed ?? 30);
  const theta = (p.Launch_Angle ?? 45) * Math.PI / 180;
  const g = Math.max(0.1, p.Gravity ?? 9.81);
  const massRatio = Math.max(1.01, p.Mass_Ratio ?? 20);

  // Tsiolkovsky: Δv vs mass ratio
  const ve = 3000; // m/s exhaust velocity (kerosene/LOX)
  const rArr = linspace(1.5, 50, N);
  const tsiolkovskyData = rArr.map((R) => ({
    R: +R.toFixed(2),
    dv: +(ve * Math.log(R) / 1000).toFixed(3), // km/s
    orbit_needed: 7.9, // LEO delta-v (km/s)
  }));

  // Altitude vs time (simplified constant thrust burn)
  const burnTime = 60; // seconds
  const tArr = linspace(0, burnTime * 1.5, N);
  const altData = tArr.map((t) => {
    let alt;
    if (t <= burnTime) {
      const thrust_acc = (ve / burnTime) * Math.log(massRatio); // simplified
      alt = 0.5 * Math.max(0, thrust_acc - g) * t * t;
    } else {
      const vel_end = Math.max(0, ve * Math.log(massRatio) - g * burnTime);
      const alt_end = 0.5 * Math.max(0, ve / burnTime * Math.log(massRatio) - g) * burnTime ** 2;
      alt = alt_end + vel_end * (t - burnTime) - 0.5 * g * (t - burnTime) ** 2;
    }
    return { t: +t.toFixed(1), altitude: +Math.max(0, alt / 1000).toFixed(3) }; // km
  });

  // Δv split analysis
  const stages = [
    { stage: "Gravity loss", dv: g * burnTime / 1000 },
    { stage: "Drag loss", dv: 0.15 },
    { stage: "LEO target", dv: 7.9 },
    { stage: "Available Δv", dv: +(ve * Math.log(massRatio) / 1000).toFixed(2) },
  ];

  return [
    {
      id: "tsiolkovsky", title: "Tsiolkovsky Rocket Equation", xKey: "R", xLabel: "Mass Ratio (m₀/mf)",
      yLabel: "Δv (km/s)", type: "line",
      series: [
        { key: "dv", label: "Δv = vₑ·ln(R)", color: "#6366f1" },
        { key: "orbit_needed", label: "LEO requirement (7.9 km/s)", color: "#f59e0b", dash: "4 4" },
      ],
      data: tsiolkovskyData, currentX: massRatio,
      annotation: `Current Δv: ${(ve * Math.log(massRatio) / 1000).toFixed(2)} km/s  |  vₑ = ${ve} m/s (kerosene/LOX)`,
    },
    {
      id: "altitude_time", title: "Altitude vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Altitude (km)", type: "area",
      series: [{ key: "altitude", label: "Altitude", color: "#34d399" }],
      data: altData,
      annotation: `Burn time: ${burnTime}s  |  Peak Δv: ${(ve * Math.log(massRatio) / 1000).toFixed(2)} km/s`,
    },
  ];
}

// ── Newton's Cradle ───────────────────────────────────────────────────────────
function computeNewtonsCradleGraphs(p) {
  const n = Math.round(Math.max(2, p.Ball_Count ?? 5));
  const nUp = Math.round(Math.max(1, Math.min(p.Balls_Up ?? 1, n - 1)));
  const L = Math.max(0.1, p.String_Length ?? 1.5);
  const d = Math.max(0, Math.min(0.99, p.Damping ?? 0.04));

  const T = 2 * Math.PI * Math.sqrt(L / 9.81); // pendulum period
  const swings = 30;
  const swingArr = Array.from({ length: swings }, (_, i) => i);

  // Energy decay per swing
  const E0 = nUp * 0.5 * 0.1 * 9.81 * L * (1 - Math.cos(0.4)); // simplified initial energy
  const energyData = swingArr.map((i) => ({
    swing: i,
    energy: +(E0 * (1 - d) ** i).toFixed(6),
    normalized: +((1 - d) ** i).toFixed(6),
  }));

  // Ball position over time (first ball)
  const tArr = linspace(0, swings * T, 200);
  const posData = tArr.map((t) => {
    const swing_num = Math.floor(t / (T / 2));
    const t_in_half = t % (T / 2);
    const decay = (1 - d) ** swing_num;
    const theta = decay * 0.4 * Math.sin(2 * Math.PI * t_in_half / T);
    return { t: +t.toFixed(3), theta: +(theta * 180 / Math.PI).toFixed(2) };
  });

  return [
    {
      id: "energy_decay", title: "Energy Decay per Swing", xKey: "swing", xLabel: "Swing Number",
      yLabel: "Normalized Energy", type: "line",
      series: [{ key: "normalized", label: "E/E₀", color: "#6366f1" }],
      data: energyData,
      annotation: `Damping: ${(d * 100).toFixed(1)}%/swing  |  Half-life: ${(Math.log(0.5) / Math.log(1 - d)).toFixed(1)} swings`,
    },
    {
      id: "oscillation", title: "Ball Angle vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Angle (°)", type: "line",
      series: [{ key: "theta", label: "Ball angle", color: "#22d3ee" }],
      data: posData,
      annotation: `Period T = 2π√(L/g) = ${T.toFixed(3)}s  |  ${n} balls, ${nUp} lifted`,
    },
  ];
}

// ── Pendulum ──────────────────────────────────────────────────────────────────
function computePendulumGraphs(p) {
  const L = Math.max(0.1, p.Length ?? 1.0);
  const theta0 = Math.max(0.01, (p.Angle ?? 30) * Math.PI / 180);
  const d = Math.max(0, p.Damping ?? 0.02);
  const g = 9.81;

  const omega_n = Math.sqrt(g / L);
  const T = 2 * Math.PI * Math.sqrt(L / g);
  const cycles = 5;
  const tArr = linspace(0, cycles * T, 200);

  const angData = tArr.map((t) => ({
    t: +t.toFixed(3),
    theta: +(theta0 * Math.exp(-d * omega_n * t) * Math.cos(omega_n * t) * 180 / Math.PI).toFixed(3),
  }));

  const LArr = linspace(0.1, 5, N);
  const periodData = LArr.map((l) => ({ L: +l.toFixed(2), T: +(2 * Math.PI * Math.sqrt(l / g)).toFixed(3) }));

  return [
    {
      id: "pendulum_osc", title: "Angular Displacement vs Time", xKey: "t", xLabel: "Time (s)",
      yLabel: "Angle (°)", type: "line",
      series: [{ key: "theta", label: "θ(t)", color: "#6366f1" }],
      data: angData,
      annotation: `T = ${T.toFixed(3)}s  |  ωn = ${omega_n.toFixed(3)} rad/s`,
    },
    {
      id: "period_length", title: "Period vs Length", xKey: "L", xLabel: "Pendulum Length (m)",
      yLabel: "Period T (s)", type: "line",
      paramKey: "Length", paramMin: 0.1, paramMax: 5, paramDefault: 1, paramUnit: "m",
      series: [{ key: "T", label: "T = 2π√(L/g)", color: "#34d399" }],
      data: periodData, currentX: L,
      annotation: "T is independent of mass and amplitude (for small angles)",
    },
  ];
}

// ── Inverted Pendulum ─────────────────────────────────────────────────────────
function computeInvertedPendulumGraphs(p) {
  const L = Math.max(0.1, p.Pole_Length ?? 0.55);
  const theta0 = (p.Pole_Angle ?? 12) * Math.PI / 180;
  const g = 9.81;
  const omega_u = Math.sqrt(g / L); // unstable natural frequency

  // Unstable divergence without control
  const tArr = linspace(0, 2, N);
  const divergeData = tArr.map((t) => ({
    t: +t.toFixed(3),
    theta_unstable: +(theta0 * Math.cosh(omega_u * t) * 180 / Math.PI).toFixed(3),
    theta_stable_ref: 0,
  }));

  // Phase portrait for different initial angles
  const thetaArr = linspace(-0.8, 0.8, N);
  const phaseData = thetaArr.map((th) => ({
    theta: +(th * 180 / Math.PI).toFixed(2),
    theta_dot_sq: +(2 * g / L * (Math.cos(0) - Math.cos(th))).toFixed(4),
  }));

  // Recovery force needed vs angle
  const angleArr = linspace(0, 40, N);
  const forceData = angleArr.map((a) => {
    const th = a * Math.PI / 180;
    const M_cart = 2.0, m_pole = 0.5;
    const F_needed = (M_cart + m_pole) * g * Math.tan(th); // simplified
    return { angle: a, force: +Math.min(F_needed, 200).toFixed(2) };
  });

  return [
    {
      id: "divergence", title: "Unstable Divergence Without Control", xKey: "t", xLabel: "Time (s)",
      yLabel: "Pole Angle (°)", type: "line",
      series: [
        { key: "theta_unstable", label: "Uncontrolled θ(t)", color: "#ef4444" },
      ],
      data: divergeData,
      annotation: `Unstable mode: θ grows as cosh(√(g/L)·t). Tip-over in ~${(1/omega_u).toFixed(2)}s`,
      regions: [{ x1: 0.3, x2: 2, color: "rgba(239,68,68,0.08)", label: "Unrecoverable zone" }],
    },
    {
      id: "recovery_force", title: "Required Recovery Force vs Angle", xKey: "angle", xLabel: "Pole Angle (°)",
      yLabel: "Recovery Force (N)", type: "line",
      series: [{ key: "force", label: "F_required", color: "#f59e0b" }],
      data: forceData, currentX: Math.abs((p.Pole_Angle ?? 12)),
      annotation: "Motor saturation at high angles → unrecoverable fall",
    },
  ];
}

// ── Water Bottle ─────────────────────────────────────────────────────────────
function computeWaterBottleGraphs(p) {
  const P = Math.max(80, p.Pressure ?? 101); // kPa
  const T = p.Temperature ?? 20; // °C
  const t_wall = Math.max(0.1, p.Wall_Thickness ?? 2) / 1000; // m
  const r = 0.045; // m bottle radius
  const E_PET = 2.7e9; // Pa Young's modulus of PET
  const sigma_yield = 55e6; // Pa PET yield strength

  // Hoop stress vs pressure
  const pArr = linspace(80, 250, N);
  const hoopData = pArr.map((pp) => ({
    pressure: pp,
    sigma_hoop: +((pp * 1000 * r) / t_wall / 1e6).toFixed(3),
    yield_limit: sigma_yield / 1e6,
  }));

  // Temperature effect: vapor pressure + polymer softening
  const tempArr = linspace(0, 100, N);
  const tempData = tempArr.map((temp) => {
    const P_vap = 0.6113 * Math.exp(17.67 * temp / (temp + 243.5)); // kPa Antoine
    const softening = temp > 60 ? Math.exp((temp - 60) / 20) : 1;
    const sigma_eff = (P * 1000 + P_vap * 1000) * r / t_wall / (1e6 * softening);
    return { T: temp, sigma_effective: +sigma_eff.toFixed(3), safe_limit: sigma_yield / 1e6 };
  });

  return [
    {
      id: "hoop_stress", title: "Hoop Stress vs Internal Pressure", xKey: "pressure", xLabel: "Internal Pressure (kPa)",
      yLabel: "Hoop Stress (MPa)", type: "line",
      series: [
        { key: "sigma_hoop", label: "σ_hoop = Pr/t", color: "#6366f1" },
        { key: "yield_limit", label: "PET Yield (55 MPa)", color: "#ef4444", dash: "4 4" },
      ],
      data: hoopData, currentX: P,
      annotation: `σ = P·r/t formula  |  Current: ${((P*1000*r)/t_wall/1e6).toFixed(2)} MPa`,
    },
    {
      id: "temp_stress", title: "Effective Stress vs Temperature", xKey: "T", xLabel: "Temperature (°C)",
      yLabel: "Effective Stress (MPa)", type: "line",
      series: [
        { key: "sigma_effective", label: "Effective stress (vapor + softening)", color: "#f59e0b" },
        { key: "safe_limit", label: "Yield limit", color: "#ef4444", dash: "4 4" },
      ],
      data: tempData, currentX: T,
      regions: [{ x1: 80, x2: 100, color: "rgba(239,68,68,0.12)", label: "Failure Zone" }],
      annotation: "PET glass transition: ~80°C → creep + vapor pressure amplification",
    },
  ];
}

// ── Airplane ─────────────────────────────────────────────────────────────────
function computeAirplaneGraphs(p) {
  const v = Math.max(50, p.Airspeed ?? 250) / 3.6; // m/s
  const alpha = p.Angle_of_Attack ?? 5; // deg
  const F = Math.max(1, p.Thrust ?? 250000); // N
  const flap = p.Flap_Setting ?? 0; // deg

  const rho = 1.225;
  const S = 122; // wing area m² (Boeing 737)
  const AR = 9.5; // aspect ratio
  const e = 0.82; // Oswald efficiency
  const alpha_stall = 15 + flap * 0.2; // stall angle increases with flap

  // CL vs AoA
  const alphaArr = linspace(-5, 25, N);
  const clData = alphaArr.map((a) => {
    const CL = a < alpha_stall ? 2 * Math.PI * (a + 2) * Math.PI / 180 + flap * 0.04 : 0.6 * Math.exp(-(a - alpha_stall) / 3);
    const CD = 0.025 + CL * CL / (Math.PI * AR * e);
    return { alpha: +a.toFixed(1), CL: +Math.max(-0.5, CL).toFixed(4), CD: +Math.max(0.025, CD).toFixed(4), LD: +Math.abs(clampDiv(CL, CD)).toFixed(2) };
  });

  // Lift vs airspeed (for current AoA)
  const vArr = linspace(50, 350, N).map((kph) => kph / 3.6);
  const CL_cur = Math.max(0, 2 * Math.PI * (alpha + 2) * Math.PI / 180 + flap * 0.04);
  const liftData = vArr.map((vv) => ({
    speed: +(vv * 3.6).toFixed(1),
    lift: +(0.5 * rho * vv * vv * CL_cur * S / 1000).toFixed(1),
    drag: +(0.5 * rho * vv * vv * (0.025 + CL_cur ** 2 / (Math.PI * AR * e)) * S / 1000).toFixed(1),
    weight: 740, // 737 MTOW ~740 kN
  }));

  return [
    {
      id: "cl_alpha", title: "Lift & L/D vs Angle of Attack", xKey: "alpha", xLabel: "Angle of Attack (°)",
      yLabel: "CL / L/D ratio", type: "line",
      series: [
        { key: "CL", label: "CL (Lift coefficient)", color: "#6366f1" },
        { key: "LD", label: "L/D ratio (÷10)", color: "#22d3ee" },
      ],
      data: clData.map((d) => ({ ...d, LD: +(d.LD / 10).toFixed(3) })),
      currentX: alpha,
      regions: [{ x1: alpha_stall, x2: 25, color: "rgba(239,68,68,0.12)", label: "Stall Region" }],
      annotation: `Stall at α = ${alpha_stall.toFixed(1)}°  |  Best L/D ≈ 15-18 for commercial jets`,
    },
    {
      id: "lift_speed", title: "Lift & Drag vs Airspeed", xKey: "speed", xLabel: "Airspeed (km/h)",
      yLabel: "Force (kN)", type: "line",
      series: [
        { key: "lift", label: "Lift (kN)", color: "#34d399" },
        { key: "drag", label: "Drag (kN)", color: "#ef4444" },
        { key: "weight", label: "Weight 740 kN", color: "#f59e0b", dash: "4 4" },
      ],
      data: liftData, currentX: p.Airspeed ?? 250,
      annotation: "Level flight: Lift = Weight. Cruise: ~250-900 km/h depending on altitude",
    },
  ];
}

// ── Generic (custom) ──────────────────────────────────────────────────────────
function computeGenericGraphs(params) {
  const entries = Object.entries(params).filter(([k]) => !k.startsWith("Scene"));
  if (entries.length < 2) return [];

  // Parameter sensitivity: vary each param ±50% and show effect
  const data = linspace(0.5, 1.5, N).map((scale) => {
    const row = { scale: +(scale * 100 - 100).toFixed(1) };
    entries.slice(0, 3).forEach(([k, v]) => {
      row[k] = +(Number(v) * scale).toFixed(3);
    });
    return row;
  });

  return [
    {
      id: "param_sensitivity", title: "Parameter Sensitivity", xKey: "scale", xLabel: "Parameter change (%)",
      yLabel: "Parameter value", type: "line",
      series: entries.slice(0, 3).map(([k], i) => ({
        key: k, label: k.replace(/_/g, " "),
        color: ["#6366f1", "#22d3ee", "#f59e0b"][i],
      })),
      data,
      annotation: "Shows how parameters scale with each other",
    },
  ];
}

// ── F1 / Race Car ─────────────────────────────────────────────────────────────
function computeF1CarGraphs(p) {
  const mass = Math.max(1, p.Mass ?? p.Car_Mass ?? 800);         // kg
  const Cd = p.Drag_Coefficient ?? p.Cd ?? 1.0;
  const A = p.Frontal_Area ?? 1.5;                               // m²
  const rho = 1.225;
  const df = p.Downforce_Coefficient ?? 3.5;
  const vMax = p.Top_Speed ?? 90;                                // m/s (~320 km/h)
  const mu = p.Tyre_Friction ?? 1.6;

  const vArr = linspace(0, vMax, N);
  const dragData = vArr.map(v => ({
    v: +v.toFixed(1),
    drag: +(0.5 * rho * Cd * A * v * v).toFixed(0),
    downforce: +(0.5 * rho * df * A * v * v).toFixed(0),
  }));

  const cornerData = linspace(0, vMax, N).map(v => {
    const down = 0.5 * rho * df * A * v * v;
    const normalForce = mass * 9.81 + down;
    const maxLat = mu * normalForce;
    const radius = maxLat > 0 ? mass * v * v / maxLat : 9999;
    return { v: +v.toFixed(1), minRadius: +Math.min(radius, 500).toFixed(1) };
  });

  return [
    { id: "aero", title: "Aerodynamic Forces vs Speed", xKey: "v", xLabel: "Speed (m/s)", yLabel: "Force (N)",
      type: "line", series: [{ key: "drag", label: "Drag", color: "#ef4444" }, { key: "downforce", label: "Downforce", color: "#6366f1" }],
      data: dragData, currentX: vMax * 0.7, annotation: `At ${(vMax * 3.6).toFixed(0)} km/h downforce exceeds car weight` },
    { id: "corner", title: "Minimum Corner Radius vs Speed", xKey: "v", xLabel: "Speed (m/s)", yLabel: "Radius (m)",
      type: "line", series: [{ key: "minRadius", label: "Min radius", color: "#22d3ee" }],
      data: cornerData, currentX: vMax * 0.6, annotation: "Tyre grip limits cornering radius" },
  ];
}

// ── Bicycle / Motorcycle ──────────────────────────────────────────────────────
function computeBicycleGraphs(p) {
  const mass = Math.max(1, (p.Rider_Mass ?? 75) + (p.Bike_Mass ?? 10));
  const Cd = p.Drag_Coefficient ?? 0.9;
  const A = p.Frontal_Area ?? 0.5;
  const rho = 1.225;
  const vMax = p.Top_Speed ?? 15;
  const mu = p.Rolling_Resistance ?? 0.004;
  const grade = (p.Grade ?? 0) / 100;

  const vArr = linspace(0, vMax, N);
  const powerData = vArr.map(v => ({
    v: +v.toFixed(2),
    aeroPower: +(0.5 * rho * Cd * A * v * v * v).toFixed(1),
    rollingPower: +(mass * 9.81 * mu * v).toFixed(1),
    gradePower: +(mass * 9.81 * grade * v).toFixed(1),
    total: +(0.5 * rho * Cd * A * v * v * v + mass * 9.81 * (mu + grade) * v).toFixed(1),
  }));

  return [
    { id: "power", title: "Power Requirements vs Speed", xKey: "v", xLabel: "Speed (m/s)", yLabel: "Power (W)",
      type: "line",
      series: [
        { key: "total", label: "Total", color: "#6366f1" },
        { key: "aeroPower", label: "Aero drag", color: "#ef4444" },
        { key: "rollingPower", label: "Rolling", color: "#f59e0b" },
        { key: "gradePower", label: "Grade", color: "#22d3ee" },
      ],
      data: powerData, currentX: p.Speed ?? vMax * 0.6, annotation: "Aero drag dominates above ~8 m/s" },
  ];
}

// ── Helicopter ────────────────────────────────────────────────────────────────
function computeHelicopterGraphs(p) {
  const mass = Math.max(1, p.Mass ?? 2000);
  const R = p.Rotor_Radius ?? 5;
  const rho = 1.225;
  const A = Math.PI * R * R;
  const g = 9.81;

  const omegaArr = linspace(0, p.Max_RPM ?? 300, N).map(r => r * Math.PI / 30);
  const hoverData = omegaArr.map(omega => {
    const tip = omega * R;
    const thrust = 0.5 * rho * A * tip * tip * 0.015; // CT approx
    const power = thrust > 0 ? Math.pow(thrust, 1.5) / Math.sqrt(2 * rho * A) : 0;
    return { rpm: +(omega * 30 / Math.PI).toFixed(0), thrust: +thrust.toFixed(0), power: +(power / 1000).toFixed(1) };
  });

  const requiredThrust = mass * g;
  return [
    { id: "thrust", title: "Thrust & Power vs Rotor RPM", xKey: "rpm", xLabel: "RPM", yLabel: "Thrust (N) / Power (kW)",
      type: "line",
      series: [{ key: "thrust", label: "Thrust (N)", color: "#6366f1" }, { key: "power", label: "Power (kW)", color: "#f59e0b" }],
      data: hoverData, currentX: p.Max_RPM ?? 300,
      regions: [{ y: requiredThrust, label: "Hover thrust", color: "#22d3ee" }],
      annotation: `Need ${requiredThrust.toFixed(0)} N to hover` },
  ];
}

// ── Submarine ─────────────────────────────────────────────────────────────────
function computeSubmarineGraphs(p) {
  const L = Math.max(1, p.Length ?? 100);
  const D = p.Diameter ?? 10;
  const rho = p.Water_Density ?? 1025;
  const mass = p.Mass ?? (rho * Math.PI * (D / 2) ** 2 * L * 0.3);
  const Cd = p.Drag_Coefficient ?? 0.04;
  const A = Math.PI * (D / 2) ** 2;
  const vMax = p.Max_Speed ?? 10;
  const g = 9.81;

  const depthArr = linspace(0, p.Max_Depth ?? 500, N);
  const pressureData = depthArr.map(d => ({
    depth: +d.toFixed(0),
    pressure: +(rho * g * d / 1e6).toFixed(3),
    hullStress: +(rho * g * d * (D / 2) / (p.Hull_Thickness ?? 0.05) / 1e6).toFixed(1),
  }));

  const vArr = linspace(0, vMax, N);
  const dragData = vArr.map(v => ({
    v: +v.toFixed(2),
    drag: +(0.5 * rho * Cd * A * v * v).toFixed(0),
  }));

  return [
    { id: "pressure", title: "Pressure & Hull Stress vs Depth", xKey: "depth", xLabel: "Depth (m)", yLabel: "MPa",
      type: "line",
      series: [{ key: "pressure", label: "Water pressure (MPa)", color: "#6366f1" }, { key: "hullStress", label: "Hull hoop stress (MPa)", color: "#ef4444" }],
      data: pressureData, currentX: p.Operating_Depth ?? 200,
      annotation: "Hoop stress = p·r / t" },
    { id: "drag", title: "Hydrodynamic Drag vs Speed", xKey: "v", xLabel: "Speed (m/s)", yLabel: "Drag (N)",
      type: "line", series: [{ key: "drag", label: "Drag", color: "#22d3ee" }],
      data: dragData, currentX: vMax * 0.6, annotation: "Drag ∝ v²" },
  ];
}

// ── Steam Engine ──────────────────────────────────────────────────────────────
function computeSteamEngineGraphs(p) {
  const boilerP = Math.max(1, p.Boiler_Pressure ?? 10);   // bar
  const bore = p.Bore ?? 0.2;                              // m
  const stroke = p.Stroke ?? 0.3;
  const rpm = p.RPM ?? 200;
  const efficiency = (p.Thermal_Efficiency ?? 15) / 100;

  const pressArr = linspace(0, boilerP * 2, N);
  const pvData = pressArr.map(P => {
    const V = P > 0 ? (boilerP / P) * (Math.PI * bore * bore / 4 * stroke) : 0;
    return { pressure: +P.toFixed(2), volume: +(V * 1e3).toFixed(3) };
  });

  const rpmArr = linspace(10, 500, N);
  const powerData = rpmArr.map(r => {
    const strokes = r / 60;
    const work = boilerP * 1e5 * Math.PI * bore * bore / 4 * stroke * efficiency;
    const power = work * strokes;
    return { rpm: +r.toFixed(0), power: +(power / 1000).toFixed(2) };
  });

  return [
    { id: "pv", title: "P-V Diagram (Indicator Diagram)", xKey: "volume", xLabel: "Volume (L)", yLabel: "Pressure (bar)",
      type: "line", series: [{ key: "pressure", label: "Pressure", color: "#f59e0b" }],
      data: pvData, annotation: "Area = work done per cycle" },
    { id: "power_rpm", title: "Power Output vs RPM", xKey: "rpm", xLabel: "RPM", yLabel: "Power (kW)",
      type: "line", series: [{ key: "power", label: "Power", color: "#6366f1" }],
      data: powerData, currentX: rpm, annotation: `At ${rpm} RPM, efficiency = ${(efficiency*100).toFixed(0)}%` },
  ];
}

// ── Mechanical Gears ─────────────────────────────────────────────────────────
function computeMechanicalGearsGraphs(p) {
  const teeth1 = Math.max(1, p.Driver_Teeth ?? p.Teeth_1 ?? 20);
  const teeth2 = Math.max(1, p.Driven_Teeth ?? p.Teeth_2 ?? 40);
  const torqueIn = p.Input_Torque ?? 10;                // Nm
  const rpmIn = p.Input_RPM ?? 1000;
  const ratio = teeth2 / teeth1;
  const efficiency = (p.Efficiency ?? 98) / 100;

  const rpmArr = linspace(100, 3000, N);
  const gearData = rpmArr.map(r => ({
    inputRPM: +r.toFixed(0),
    outputRPM: +(r / ratio).toFixed(0),
    outputTorque: +(torqueIn * ratio * efficiency).toFixed(2),
    power: +(torqueIn * r * Math.PI / 30 / 1000).toFixed(3),
  }));

  const ratioArr = linspace(0.5, 5, N);
  const sensitivityData = ratioArr.map(gr => ({
    ratio: +gr.toFixed(2),
    outputTorque: +(torqueIn * gr * efficiency).toFixed(2),
    outputRPM: +(rpmIn / gr).toFixed(0),
  }));

  return [
    { id: "gear_ratio", title: "Output vs Gear Ratio", xKey: "ratio", xLabel: "Gear ratio", yLabel: "Torque (Nm) / RPM",
      type: "line",
      series: [{ key: "outputTorque", label: "Output torque (Nm)", color: "#6366f1" }, { key: "outputRPM", label: "Output RPM", color: "#f59e0b" }],
      data: sensitivityData, currentX: ratio,
      annotation: `Current ratio ${ratio.toFixed(2)}:1 — torque multiplied ${(ratio * efficiency).toFixed(2)}x` },
    { id: "power_speed", title: "Power Transmission vs Input RPM", xKey: "inputRPM", xLabel: "Input RPM", yLabel: "Power (kW)",
      type: "line", series: [{ key: "power", label: "Power", color: "#22d3ee" }],
      data: gearData, currentX: rpmIn, annotation: "Power = Torque × ω" },
  ];
}

// ── Robot Arm ─────────────────────────────────────────────────────────────────
function computeRobotArmGraphs(p) {
  const L1 = Math.max(0.01, p.Link1_Length ?? p.Upper_Arm ?? 0.5);
  const L2 = Math.max(0.01, p.Link2_Length ?? p.Forearm ?? 0.4);
  const payload = p.Payload_Mass ?? p.Payload ?? 2;
  const g = 9.81;

  const reachMax = L1 + L2;
  const thetaArr = linspace(0, Math.PI, N);
  const reachData = thetaArr.map(t1 => {
    const reach = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(p.Elbow_Angle ?? Math.PI / 2));
    const torque1 = g * (payload * reach + (p.Link2_Mass ?? 1) * L1 * Math.cos(t1));
    return {
      angle: +(t1 * 180 / Math.PI).toFixed(1),
      reach: +reach.toFixed(3),
      shoulderTorque: +Math.abs(torque1).toFixed(2),
    };
  });

  const payloadArr = linspace(0, payload * 3, N);
  const torqueData = payloadArr.map(m => ({
    payload: +m.toFixed(2),
    torque: +(g * m * reachMax).toFixed(2),
  }));

  return [
    { id: "torque_payload", title: "Required Shoulder Torque vs Payload", xKey: "payload", xLabel: "Payload (kg)", yLabel: "Torque (Nm)",
      type: "line", series: [{ key: "torque", label: "Torque", color: "#6366f1" }],
      data: torqueData, currentX: payload,
      annotation: `At max reach (${reachMax.toFixed(2)} m): ${(g * payload * reachMax).toFixed(1)} Nm required` },
    { id: "workspace", title: "Reach vs Shoulder Angle", xKey: "angle", xLabel: "Shoulder angle (°)", yLabel: "Reach (m)",
      type: "line", series: [{ key: "reach", label: "Reach", color: "#22d3ee" }],
      data: reachData, annotation: "2-link arm workspace boundary" },
  ];
}

// ── Breadboard / RC Circuit ────────────────────────────────────────────────────
function computeBreadboardGraphs(p) {
  const R = Math.max(0.01, p.Resistance ?? p.R1 ?? 1000);
  const C = Math.max(1e-12, (p.Capacitance ?? p.C1 ?? 100) * 1e-6);
  const L = Math.max(1e-9, (p.Inductance ?? p.L1 ?? 10) * 1e-3);
  const V0 = p.Supply_Voltage ?? p.Voltage ?? 5;

  const tau = R * C;
  const tArr = linspace(0, 5 * tau, N);
  const rcData = tArr.map(t => ({
    t: +(t * 1000).toFixed(3),
    vC: +(V0 * (1 - Math.exp(-t / tau))).toFixed(4),
    iR: +(V0 / R * Math.exp(-t / tau) * 1000).toFixed(4),
  }));

  const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
  const fArr = linspace(f0 * 0.1, f0 * 5, N);
  const freqData = fArr.map(f => {
    const omega = 2 * Math.PI * f;
    const ZL = omega * L;
    const ZC = 1 / (omega * C);
    const Z = Math.sqrt(R * R + (ZL - ZC) ** 2);
    return { freq: +f.toFixed(1), gain: +(V0 / Z).toFixed(5), phase: +(Math.atan2(ZL - ZC, R) * 180 / Math.PI).toFixed(1) };
  });

  return [
    { id: "rc_charge", title: "RC Capacitor Charge (τ = RC)", xKey: "t", xLabel: "Time (ms)", yLabel: "Voltage (V) / Current (mA)",
      type: "line",
      series: [{ key: "vC", label: "Capacitor V", color: "#6366f1" }, { key: "iR", label: "Current (mA)", color: "#f59e0b" }],
      data: rcData, annotation: `τ = ${(tau * 1000).toFixed(2)} ms` },
    { id: "rlc_freq", title: "RLC Frequency Response", xKey: "freq", xLabel: "Frequency (Hz)", yLabel: "Gain (A)",
      type: "line", series: [{ key: "gain", label: "Current gain", color: "#22d3ee" }],
      data: freqData, currentX: f0,
      annotation: `Resonance at ${f0.toFixed(1)} Hz` },
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────
export function computeGraphData(simType, params) {
  if (!params) return [];
  try {
    switch (simType) {
      case "wind_turbine":       return computeWindTurbineGraphs(params);
      case "projectile":         return computeProjectileGraphs(params);
      case "spring_mass":        return computeSpringMassGraphs(params);
      case "orbit":              return computeOrbitGraphs(params);
      case "bridge":             return computeBridgeGraphs(params);
      case "rocket":             return computeRocketGraphs(params);
      case "water_bottle":       return computeWaterBottleGraphs(params);
      case "airplane":           return computeAirplaneGraphs(params);
      case "newton_cradle":      return computeNewtonsCradleGraphs(params);
      case "pendulum":           return computePendulumGraphs(params);
      case "inverted_pendulum":  return computeInvertedPendulumGraphs(params);
      case "f1_car":
      case "race_car":           return computeF1CarGraphs(params);
      case "bicycle":
      case "motorcycle":         return computeBicycleGraphs(params);
      case "helicopter":         return computeHelicopterGraphs(params);
      case "submarine":          return computeSubmarineGraphs(params);
      case "steam_engine":       return computeSteamEngineGraphs(params);
      case "mechanical_gears":
      case "gears":              return computeMechanicalGearsGraphs(params);
      case "robot_arm":          return computeRobotArmGraphs(params);
      case "breadboard":
      case "rc_circuit":
      case "circuit":            return computeBreadboardGraphs(params);
      default:                   return computeGenericGraphs(params);
    }
  } catch (e) {
    console.warn("[computeGraphData]", e);
    return [];
  }

  // ── NOTE: paramKey metadata is added per chart in each compute function.
  // Charts without paramKey don't show an interactive slider.
  // GraphsPanel reads chart.paramKey, chart.paramMin, chart.paramMax, chart.paramUnit.
}
