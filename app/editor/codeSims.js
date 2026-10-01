/**
 * Sim types with a hand-built, fully parametric rig in components/.
 *
 * These are simulated in code even when Photoreal is selected: the rig already
 * exposes every moving part to the physics, while a generated mesh is baked and
 * costs a paid ~90s generation to show something less interactive. Photoreal is
 * for the long tail of objects nobody has built a rig for.
 */
export const CODE_SIMS = new Set([
  "wind_turbine",
  "pendulum",
  "newton_cradle",
  "inverted_pendulum",
  "projectile",
  "rocket",
  "spring_mass",
  "orbit",
  "bridge",
  "water_bottle",
  "robot_arm",
  "helicopter",
  "mechanical_gears",
  "bicycle",
  "submarine",
  "breadboard",
  "f1_car",
  "steam_engine",
]);

export const hasCodeSim = (simType) => CODE_SIMS.has(simType);
