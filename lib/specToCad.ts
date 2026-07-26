/**
 * Turn validated spec-sheet dimensions into CAD script constants.
 * Values in spec sheets are canonical mm; OpenSCAD templates target ~4–6 unit models.
 */

import type { SpecDimension, SpecSheet } from "./specSheet";

export function findSpecMm(
  dimensions: SpecDimension[] | undefined,
  patterns: RegExp[],
  fallbackMm: number,
): number {
  if (!dimensions?.length) return fallbackMm;
  for (const re of patterns) {
    const hit = dimensions.find((d) => re.test(d.key) || re.test(d.label));
    if (hit && Number.isFinite(hit.value) && hit.value > 0) return hit.value;
  }
  return fallbackMm;
}

/** Porsche-scale defaults (mm) when spec is missing a field. */
const CAR_DEFAULTS = {
  length: 4515,
  width: 1852,
  height: 1310,
  wheelbase: 2450,
};

/**
 * Spec-grounded OpenSCAD car — smooth hulls + cylinders, not R3F boxes.
 * Scales so overall length ≈ 4.6 OpenSCAD units (matches legacy template scale).
 */
export function openScadCarFromSpec(topic: string, spec?: SpecSheet | null): string {
  const dims = spec?.dimensions;
  const lenMm = findSpecMm(dims, [/overall.?length/i, /total.?length/i, /^length$/i], CAR_DEFAULTS.length);
  const widMm = findSpecMm(dims, [/overall.?width/i, /max.?width/i, /^width$/i], CAR_DEFAULTS.width);
  const hgtMm = findSpecMm(dims, [/overall.?height/i, /^height$/i], CAR_DEFAULTS.height);
  const wbMm = findSpecMm(dims, [/wheelbase/i], CAR_DEFAULTS.wheelbase);

  const s = 4.6 / (lenMm / 1000);
  const L = (lenMm / 1000) * s;
  const W = (widMm / 1000) * s;
  const H = (hgtMm / 1000) * s;
  const WB = (wbMm / 1000) * s;
  const wheelR = W * 0.19;
  const wheelW = W * 0.18;
  const ref = spec?.referenceProduct || topic;

  return `
$fn = 48;
// ${ref} — dimensions from verified spec (mm → scaled model units)
module wheel(r=${wheelR.toFixed(3)}, w=${wheelW.toFixed(3)}) {
  rotate([90,0,0]) cylinder(h=w, r=r, center=true);
}
// Low sporty chassis
hull() {
  translate([0,0,${(H * 0.22).toFixed(3)}]) cube([${L.toFixed(3)}, ${W.toFixed(3)}, ${(H * 0.38).toFixed(3)}], center=true);
  translate([${(L * 0.05).toFixed(3)},0,${(H * 0.48).toFixed(3)}]) cube([${(L * 0.62).toFixed(3)}, ${(W * 0.82).toFixed(3)}, ${(H * 0.16).toFixed(3)}], center=true);
}
// Cabin bubble
translate([${(L * 0.08).toFixed(3)},0,${(H * 0.62).toFixed(3)}]) scale([1.0,0.58,0.42]) sphere(r=${(H * 0.38).toFixed(3)});
// Hood + rear deck taper
translate([${(L * 0.42).toFixed(3)},0,${(H * 0.28).toFixed(3)}]) scale([0.9,0.85,0.35]) sphere(r=${(W * 0.42).toFixed(3)});
translate([${(-L * 0.38).toFixed(3)},0,${(H * 0.32).toFixed(3)}]) scale([0.7,0.8,0.3]) sphere(r=${(W * 0.38).toFixed(3)});
// Wheels at spec wheelbase
translate([${(WB * 0.5).toFixed(3)},  ${(W * 0.46).toFixed(3)}, 0]) wheel();
translate([${(WB * 0.5).toFixed(3)},  ${(-W * 0.46).toFixed(3)}, 0]) wheel();
translate([${(-WB * 0.5).toFixed(3)},  ${(W * 0.48).toFixed(3)}, 0]) wheel(r=${(wheelR * 1.08).toFixed(3)}, w=${(wheelW * 1.1).toFixed(3)});
translate([${(-WB * 0.5).toFixed(3)},  ${(-W * 0.48).toFixed(3)}, 0]) wheel(r=${(wheelR * 1.08).toFixed(3)}, w=${(wheelW * 1.1).toFixed(3)});
// Headlights
translate([${(L * 0.47).toFixed(3)}, ${(W * 0.32).toFixed(3)}, ${(H * 0.22).toFixed(3)}]) sphere(r=${(W * 0.05).toFixed(3)});
translate([${(L * 0.47).toFixed(3)}, ${(-W * 0.32).toFixed(3)}, ${(H * 0.22).toFixed(3)}]) sphere(r=${(W * 0.05).toFixed(3)});
`;
}

const RACKET_DEFAULTS = {
  overallLength: 685,
  headWidth: 290,
  headLength: 330,
  handleLength: 140,
  frameThickness: 22,
};

/** Spec-grounded tennis racket — oval head, string grid, handle + grip. Built along Z (handle bottom). */
export function openScadRacketFromSpec(topic: string, spec?: SpecSheet | null): string {
  const dims = spec?.dimensions;
  const lenMm = findSpecMm(
    dims,
    [/overall.?length/i, /total.?length/i, /racket.?length/i, /^length$/i],
    RACKET_DEFAULTS.overallLength,
  );
  const headWMm = findSpecMm(
    dims,
    [/head.?width/i, /frame.?width/i, /max.?width/i],
    RACKET_DEFAULTS.headWidth,
  );
  const headLMm = findSpecMm(
    dims,
    [/head.?length/i, /head.?height/i],
    RACKET_DEFAULTS.headLength,
  );
  const handleMm = findSpecMm(
    dims,
    [/handle.?length/i, /grip.?length/i],
    RACKET_DEFAULTS.handleLength,
  );
  const frameMm = findSpecMm(
    dims,
    [/frame.?thickness/i, /beam.?width/i],
    RACKET_DEFAULTS.frameThickness,
  );

  const s = 4.0 / (lenMm / 1000);
  const L = (lenMm / 1000) * s;
  const headW = (headWMm / 1000) * s * 0.5;
  const headH = (headLMm / 1000) * s * 0.5;
  const handleL = (handleMm / 1000) * s;
  const frameT = Math.max(0.025, (frameMm / 1000) * s * 0.45);
  const headZ = handleL + headH * 0.85;
  const ref = spec?.referenceProduct || topic;

  return `
$fn = 64;
// ${ref} — spec-grounded tennis racket
module oval_frame(rx, ry, t, z) {
  difference() {
    translate([0, 0, z]) scale([rx, ry, 1]) cylinder(h=t, r=1, center=true, $fn=96);
    translate([0, 0, z]) scale([rx - t * 2.2, ry - t * 2.2, 1]) cylinder(h=t + 0.02, r=1, center=true, $fn=96);
  }
}
module throat(z0, z1) {
  hull() {
    translate([0, 0, z0]) scale([1.1, 0.55, 1]) sphere(r=${(headW * 0.35).toFixed(3)});
    translate([0, 0, z1]) scale([0.45, 0.35, 1]) sphere(r=${(headW * 0.22).toFixed(3)});
  }
}
// Handle + grip
translate([0, 0, ${(handleL * 0.5).toFixed(3)}]) cylinder(h=${handleL.toFixed(3)}, r=${(headW * 0.11).toFixed(3)}, center=true, $fn=48);
for (i = [0:7])
  translate([0, 0, ${(handleL * 0.12).toFixed(3)} + i * ${(handleL * 0.09).toFixed(3)}])
    cylinder(h=${(handleL * 0.07).toFixed(3)}, r=${(headW * 0.13).toFixed(3)}, center=true, $fn=32);
translate([0, 0, ${(handleL * 0.04).toFixed(3)}]) cylinder(h=${(frameT * 1.2).toFixed(3)}, r=${(headW * 0.14).toFixed(3)}, center=true, $fn=32);
// Throat + head frame
throat(${handleL.toFixed(3)}, ${(handleL + headH * 0.25).toFixed(3)});
oval_frame(${headW.toFixed(3)}, ${headH.toFixed(3)}, ${frameT.toFixed(3)}, ${headZ.toFixed(3)});
// String bed
for (x = [${(-headW * 0.78).toFixed(3)} : ${(headW * 0.16).toFixed(3)} : ${(headW * 0.78).toFixed(3)}])
  translate([x, 0, ${headZ.toFixed(3)}]) cube([${(frameT * 0.22).toFixed(3)}, ${(headH * 1.55).toFixed(3)}, ${(frameT * 0.9).toFixed(3)}], center=true);
for (y = [${(-headH * 0.72).toFixed(3)} : ${(headH * 0.14).toFixed(3)} : ${(headH * 0.72).toFixed(3)}])
  translate([0, y, ${headZ.toFixed(3)}]) cube([${(headW * 1.55).toFixed(3)}, ${(frameT * 0.22).toFixed(3)}, ${(frameT * 0.9).toFixed(3)}], center=true);
`;
}

const AIRCRAFT_DEFAULTS = {
  length: 70700,
  wingspan: 64040,
  height: 19240,
};

/** Spec-grounded fixed-wing aircraft — fuselage, wings, tail, engines. Nose along +X. */
export function openScadAircraftFromSpec(topic: string, spec?: SpecSheet | null): string {
  const dims = spec?.dimensions;
  const lenMm = findSpecMm(
    dims,
    [/overall.?length/i, /fuselage.?length/i, /total.?length/i, /^length$/i],
    AIRCRAFT_DEFAULTS.length,
  );
  const spanMm = findSpecMm(
    dims,
    [/wingspan/i, /wing.?span/i, /overall.?width/i],
    AIRCRAFT_DEFAULTS.wingspan,
  );
  const hgtMm = findSpecMm(
    dims,
    [/overall.?height/i, /tail.?height/i, /^height$/i],
    AIRCRAFT_DEFAULTS.height,
  );

  const s = 6.0 / (lenMm / 1000);
  const L = (lenMm / 1000) * s;
  const W = (spanMm / 1000) * s;
  const H = (hgtMm / 1000) * s;
  const fuseR = H * 0.12;
  const ref = spec?.referenceProduct || topic;

  return `
$fn = 48;
// ${ref} — spec-grounded airliner / fixed-wing aircraft
// Fuselage (nose +X)
hull() {
  translate([${(L * 0.42).toFixed(3)}, 0, ${(H * 0.08).toFixed(3)}]) scale([0.35, 0.42, 0.42]) sphere(r=${fuseR.toFixed(3)});
  rotate([0, 90, 0]) translate([0, 0, ${(H * 0.08).toFixed(3)}]) cylinder(h=${(L * 0.72).toFixed(3)}, r=${fuseR.toFixed(3)}, center=true);
  translate([${(-L * 0.38).toFixed(3)}, 0, ${(H * 0.1).toFixed(3)}]) scale([0.55, 0.55, 0.55]) sphere(r=${fuseR.toFixed(3)});
}
// Main wings (mid fuselage)
translate([${(L * 0.02).toFixed(3)}, 0, ${(H * 0.06).toFixed(3)}]) hull() {
  cube([${(L * 0.22).toFixed(3)}, ${W.toFixed(3)}, ${(H * 0.018).toFixed(3)}], center=true);
  translate([${(L * 0.08).toFixed(3)}, 0, 0]) cube([${(L * 0.08).toFixed(3)}, ${(W * 0.72).toFixed(3)}, ${(H * 0.012).toFixed(3)}], center=true);
}
// Horizontal stabilizer
translate([${(-L * 0.36).toFixed(3)}, 0, ${(H * 0.12).toFixed(3)}])
  cube([${(L * 0.12).toFixed(3)}, ${(W * 0.38).toFixed(3)}, ${(H * 0.014).toFixed(3)}], center=true);
// Vertical fin
translate([${(-L * 0.36).toFixed(3)}, 0, ${(H * 0.28).toFixed(3)}])
  rotate([90, 0, 0]) cube([${(L * 0.11).toFixed(3)}, ${(H * 0.22).toFixed(3)}, ${(H * 0.012).toFixed(3)}], center=true);
// Engine nacelles (under wings)
translate([${(L * 0.0).toFixed(3)}, ${(W * 0.32).toFixed(3)}, ${(-H * 0.06).toFixed(3)}])
  rotate([0, 90, 0]) cylinder(h=${(L * 0.18).toFixed(3)}, r=${(fuseR * 0.55).toFixed(3)}, center=true);
translate([${(L * 0.0).toFixed(3)}, ${(-W * 0.32).toFixed(3)}, ${(-H * 0.06).toFixed(3)}])
  rotate([0, 90, 0]) cylinder(h=${(L * 0.18).toFixed(3)}, r=${(fuseR * 0.55).toFixed(3)}, center=true);
// Cockpit glazing
translate([${(L * 0.32).toFixed(3)}, 0, ${(H * 0.14).toFixed(3)}]) scale([0.55, 0.35, 0.28]) sphere(r=${(fuseR * 0.85).toFixed(3)});
`;
}
