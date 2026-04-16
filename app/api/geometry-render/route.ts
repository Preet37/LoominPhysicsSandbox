import { NextResponse } from "next/server";
import Groq from "groq-sdk";

// Headless geometry render pipeline
// Blender 3.4 (Debian): read_factory_settings(use_empty=True) clears ALL addons —
// io_scene_gltf2 must be re-enabled explicitly.

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing_groq_key" });

type ParamsMap = Record<string, number | string>;

// ── Topic classification ───────────────────────────────────────────────────────
type TopicCategory =
  | "car" | "aircraft" | "rocket" | "building" | "bottle"
  | "robot" | "bridge" | "turbine" | "ship" | "bicycle" | "unicycle"
  | "engine" | "satellite" | "microscope" | "guitar" | "generic";

function classifyTopic(topic: string): TopicCategory {
  const t = topic.toLowerCase();
  if (/(f1|formula[- ]?1|racecar|race car|sports car|\bcar\b|truck|vehicle|suv|sedan|bus|automobile|buggy|jeep|van)/.test(t)) return "car";
  if (/(airplane|aircraft|jet fighter|airliner|glider|biplane|drone|uav|f-16|f-22|b-52|boeing|airbus)/.test(t)) return "aircraft";
  if (/(helicopter|chopper|rotorcraft)/.test(t)) return "aircraft";
  if (/(rocket|spacecraft|missile|saturn v|space shuttle|launch vehicle|booster)/.test(t)) return "rocket";
  if (/(skyscraper|building|tower|house|hut|cabin|shed|cathedral|church|pyramid|temple)/.test(t)) return "building";
  if (/(bottle|flask|jug|vase|cup|mug|glass|container|jar|vessel|canteen)/.test(t)) return "bottle";
  if (/(robot arm|robotic arm|manipulator|exoskeleton|android|humanoid|\brobot\b)/.test(t)) return "robot";
  if (/(bridge|truss|arch|suspension bridge|overpass)/.test(t)) return "bridge";
  if (/(wind turbine|windmill|wind mill|wind farm)/.test(t)) return "turbine";
  if (/(turbine|fan|propeller|impeller)/.test(t)) return "turbine";
  if (/(ship|boat|vessel|submarine|yacht|sailboat|frigate|destroyer|carrier)/.test(t)) return "ship";
  if (/unicycle/.test(t)) return "unicycle";
  if (/(bike|bicycle|motorcycle|scooter|motorbike)/.test(t)) return "bicycle";
  // Engines / machines — steam, combustion, electric, etc.
  if (/(steam engine|steam turbine|steam|boiler|piston engine|combustion|internal combustion|diesel engine|gasoline engine|stirling|watt engine)/.test(t)) return "engine";
  if (/(electric motor|\bmotor\b|\bgenerator\b|dynamo|alternator|transformer|pump|compressor|gearbox)/.test(t)) return "engine";
  // Other specific objects
  if (/(satellite|space station|iss|hubble|telescope)/.test(t)) return "satellite";
  if (/(microscope|telescope|binoculars|periscope|lens|optic)/.test(t)) return "microscope";
  if (/(guitar|violin|cello|piano|drum|instrument|harp)/.test(t)) return "guitar";
  return "generic";
}

function pickGenerator(topic: string, simType?: string, generatorHint?: string): "blender" | "openscad" {
  if (/^blender$/i.test(generatorHint || "")) return "blender";
  if (/^openscad$/i.test(generatorHint || "")) return "openscad";
  // OpenSCAD is better at all structured/mechanical shapes
  // Only use Blender for truly organic/freeform shapes (generic)
  const cat = classifyTopic(topic);
  if (cat === "generic") return "blender";
  return "openscad";
}

function stripCodeFences(text: string) {
  return text
    .replace(/```(?:python|py|scad|openscad)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ── Blender addon preamble ────────────────────────────────────────────────────
const BLENDER_GLTF_ADDON = `
import addon_utils as _au
try:
    _au.enable("io_scene_gltf2", default_set=False, persistent=False)
except Exception as _e:
    import sys; print("io_scene_gltf2:", _e, file=sys.stderr)
`.trim();

// ── Topic-aware OpenSCAD templates ───────────────────────────────────────────
function deterministicOpenScadScript(topic: string): string {
  const cat = classifyTopic(topic);

  const templates: Record<TopicCategory, string> = {
    car: `
$fn = 32;
// --- ${topic} ---
module wheel(r=0.38, w=0.35) { rotate([90,0,0]) cylinder(h=w, r=r, center=true); }
// Chassis (low, wide, long)
hull() {
  translate([0,0,0.22]) cube([4.6, 1.85, 0.44], center=true);
  translate([0,0,0.52]) cube([3.2, 1.5,  0.18], center=true);
}
// Cockpit bubble
translate([0.25,0,0.78]) scale([1.0,0.55,0.45]) sphere(r=0.7);
// Front wing
translate([2.35, 0, 0.05]) cube([0.9, 2.4, 0.07], center=true);
// Rear wing blade + pillars
translate([-2.2, 0, 0.80]) cube([0.5, 2.2, 0.07], center=true);
translate([-2.2,  0.8, 0.50]) cube([0.08, 0.08, 0.52], center=true);
translate([-2.2, -0.8, 0.50]) cube([0.08, 0.08, 0.52], center=true);
// Nose cone
translate([2.55, 0, 0.22]) scale([0.55,0.5,0.35]) sphere(r=0.6);
// 4 Wheels
translate([ 1.45,  1.12, 0]) wheel();
translate([ 1.45, -1.12, 0]) wheel();
translate([-1.45,  1.22, 0]) wheel(r=0.42, w=0.42);
translate([-1.45, -1.22, 0]) wheel(r=0.42, w=0.42);
// Exhaust pipes
translate([-2.0,  0.4, 0.45]) rotate([0,90,0]) cylinder(h=0.6, r=0.07, center=true);
translate([-2.0, -0.4, 0.45]) rotate([0,90,0]) cylinder(h=0.6, r=0.07, center=true);
`,
    aircraft: `
$fn = 32;
// --- ${topic} ---
// Fuselage
hull() {
  translate([0,0,0]) cylinder(h=7.0, r=0.55, center=true);
  translate([3.6,0,0]) scale([0.18,0.3,0.3]) sphere(r=0.55);
  translate([-3.6,0,0]) scale([0.4,0.5,0.5]) sphere(r=0.55);
}
// Main wings
translate([0.3, 0, 0]) rotate([0,0,0]) {
  hull() {
    cube([1.0, 5.5, 0.12], center=true);
    translate([0.6, 0, 0]) cube([0.3, 3.5, 0.08], center=true);
  }
}
// Tail horizontal stabilizers
translate([-3.0, 0, 0]) {
  cube([0.7, 2.8, 0.08], center=true);
}
// Tail vertical fin
translate([-3.0, 0, 0.5]) rotate([90,0,0]) {
  cube([0.7, 1.1, 0.08], center=true);
}
// Engines (2 under wings)
translate([ 0.2,  1.8, -0.45]) rotate([0,90,0]) cylinder(h=1.4, r=0.22, center=true);
translate([ 0.2, -1.8, -0.45]) rotate([0,90,0]) cylinder(h=1.4, r=0.22, center=true);
`,
    rocket: `
$fn = 64;
// --- ${topic} ---
// Main body
cylinder(h=5.0, r=0.5, center=true);
// Nose cone
translate([0, 0, 2.8]) cylinder(h=1.5, r1=0.5, r2=0.02);
// 4 Fins
for(i=[0:3])
  rotate([0, 0, i*90])
    translate([0.5, 0, -1.8])
      rotate([0, 15, 0])
        cube([0.8, 0.06, 1.4], center=true);
// Engine nozzle
translate([0,0,-2.8]) cylinder(h=0.6, r1=0.3, r2=0.55);
// Booster ring
translate([0,0,-2.3]) difference() {
  cylinder(h=0.2, r=0.7, center=true);
  cylinder(h=0.25, r=0.5, center=true);
}
`,
    building: `
$fn = 32;
// --- ${topic} ---
// Main tower
cube([2.0, 2.0, 5.0], center=true);
// Entrance arch
translate([0, 1.05, -1.8])
  rotate([90,0,0])
    linear_extrude(0.2)
      polygon([[-.5,0],[.5,0],[.5,.7],[0,1.1],[-.5,.7]]);
// Windows (grid)
for(x=[-0.55,0,0.55], z=[-1.5,-0.5,0.5,1.5])
  translate([x, 1.05, z]) cube([0.3, 0.06, 0.4], center=true);
// Roof
translate([0,0,2.7]) cylinder(h=0.9, r1=1.5, r2=0.1);
`,
    bottle: `
$fn = 64;
// --- ${topic} ---
rotate_extrude()
  polygon([
    [0.00, 0.00],
    [0.55, 0.00],
    [0.55, 0.06],
    [0.62, 0.12],
    [0.62, 2.20],
    [0.50, 2.50],
    [0.25, 2.80],
    [0.25, 3.30],
    [0.32, 3.40],
    [0.32, 3.80],
    [0.25, 3.90],
    [0.00, 3.90]
  ]);
`,
    robot: `
$fn = 32;
// --- ${topic} ---
// Torso
cube([1.4, 0.9, 1.8], center=true);
// Head
translate([0, 0, 1.4]) sphere(r=0.55);
// Eyes
translate([ 0.22, 0.52, 1.52]) sphere(r=0.1);
translate([-0.22, 0.52, 1.52]) sphere(r=0.1);
// Arms
translate([ 0.95, 0, 0.2]) rotate([0,0,15]) cylinder(h=1.5, r=0.2, center=true);
translate([-0.95, 0, 0.2]) rotate([0,0,-15]) cylinder(h=1.5, r=0.2, center=true);
// Legs
translate([ 0.35, 0, -1.5]) cylinder(h=1.6, r=0.25, center=true);
translate([-0.35, 0, -1.5]) cylinder(h=1.6, r=0.25, center=true);
// Feet
translate([ 0.35, 0.2, -2.4]) cube([0.5, 0.8, 0.25], center=true);
translate([-0.35, 0.2, -2.4]) cube([0.5, 0.8, 0.25], center=true);
`,
    bridge: `
$fn = 16;
// --- ${topic} ---
// Deck
cube([8.0, 1.2, 0.2], center=true);
// Two towers
translate([ 2.5, 0, 1.2]) cube([0.3, 1.2, 2.4], center=true);
translate([-2.5, 0, 1.2]) cube([0.3, 1.2, 2.4], center=true);
// Suspension cables (simplified arcs)
for(y=[-0.5, 0.5]) {
  for(x=[-2.2,-1.5,-0.8,0,0.8,1.5,2.2])
    translate([x, y, 0.1])
      cylinder(h=2.4 - abs(x)*0.6, r=0.04);
}
// Side railings
translate([0,  0.65, 0.18]) cube([8.0, 0.06, 0.36], center=true);
translate([0, -0.65, 0.18]) cube([8.0, 0.06, 0.36], center=true);
// Supports / pylons
for(x=[-3.5,3.5])
  translate([x, 0, -0.5]) cylinder(h=1.0, r=0.25, center=true);
`,
    turbine: `
$fn = 64;
// --- ${topic} ---
// Tower
cylinder(h=4.5, r=0.18, center=true);
// Nacelle
translate([0,0,2.4]) rotate([0,90,0]) cylinder(h=1.0, r=0.28, center=true);
// Hub
translate([0.55,0,2.4]) sphere(r=0.22);
// 3 Blades
for(i=[0:2])
  rotate([i*120, 0, 0])
    translate([0.55, 0, 2.4])
      rotate([0, 8, 0])
        cube([0.12, 0.06, 2.8], center=true);
// Base foundation
translate([0,0,-2.4]) cylinder(h=0.4, r=0.7, center=true);
`,
    ship: `
$fn = 32;
// --- ${topic} ---
// Hull
hull() {
  translate([0,0,0]) cube([6.0, 2.2, 0.6], center=true);
  translate([3.2,0,0]) scale([0.4,0.6,1]) sphere(r=1.1);
  translate([-3.0,0,-0.15]) scale([0.3,0.7,0.5]) sphere(r=1.0);
}
// Superstructure
translate([-0.5, 0, 0.7]) cube([2.5, 1.6, 1.0], center=true);
translate([-0.3, 0, 1.3]) cube([1.5, 1.2, 0.5], center=true);
// Funnel/chimney
translate([-0.8, 0, 1.8]) cylinder(h=0.9, r=0.22, center=true);
// Mast
translate([2.0, 0, 0.8]) cylinder(h=2.2, r=0.06);
translate([-2.0, 0, 0.8]) cylinder(h=1.6, r=0.06);
// Deck details
for(x=[-2,-1,0,1,2])
  translate([x,0,0.34]) cylinder(h=0.15, r=0.1, center=true);
`,
    bicycle: `
$fn = 48;
// --- ${topic} ---
module wheel(r=0.55) {
  difference() {
    cylinder(h=0.08, r=r, center=true);
    cylinder(h=0.12, r=r-0.09, center=true);
  }
  for(i=[0:7]) rotate([0,0,i*45]) cube([r*1.88, 0.04, 0.08], center=true);
  cylinder(h=0.10, r=0.09, center=true);
}
translate([ 1.15, 0, 0]) rotate([90,0,0]) wheel();
translate([-1.15, 0, 0]) rotate([90,0,0]) wheel();
// Main frame (diamond)
hull() {
  translate([1.15,0,0]) sphere(r=0.07);
  translate([0,0,0.9]) sphere(r=0.06);
}
hull() {
  translate([-1.15,0,0]) sphere(r=0.07);
  translate([0,0,0.9]) sphere(r=0.06);
}
hull() {
  translate([-0.3,0,0.9]) sphere(r=0.05);
  translate([0.8,0,0.9]) sphere(r=0.05);
}
// Seat post + saddle
translate([-0.3,0,0.9]) cylinder(h=0.55, r=0.04, center=true);
translate([-0.3,0,1.2]) cube([0.42,0.18,0.06], center=true);
// Handlebars
translate([0.95,0,0.98]) rotate([0,90,0]) cylinder(h=0.55,r=0.04,center=true);
translate([0.95,0,0.98]) cube([0.06,0.62,0.06],center=true);
// Pedal cranks
translate([0,0,0]) rotate([90,0,0]) {
  cylinder(h=0.52,r=0.05,center=true);
  translate([0.22,0,0]) cylinder(h=0.06,r=0.07,center=true);
  translate([-0.22,0,0]) cylinder(h=0.06,r=0.07,center=true);
}
`,
    unicycle: `
$fn = 64;
// --- ${topic} ---
// Wheel with spokes and hub
difference() {
  cylinder(h=0.18, r=0.75, center=true);
  cylinder(h=0.22, r=0.62, center=true);
}
for(i=[0:7]) rotate([0,0,i*45]) cube([1.36, 0.05, 0.18], center=true);
cylinder(h=0.22, r=0.13, center=true);
// Tire tread (outer ring slightly wider)
difference() {
  cylinder(h=0.22, r=0.76, center=true);
  cylinder(h=0.25, r=0.72, center=true);
}
// Axle
rotate([90,0,0]) cylinder(h=0.5, r=0.04, center=true);
// Pedal cranks
rotate([90,0,0]) {
  translate([0.28,0,0]) { cylinder(h=0.3,r=0.04,center=true); translate([0.15,0,0]) cube([0.25,0.04,0.04],center=true); }
  translate([-0.28,0,0]) { cylinder(h=0.3,r=0.04,center=true); translate([-0.15,0,0]) cube([0.25,0.04,0.04],center=true); }
}
// Fork / bearing holder
translate([0.02,0,0.6]) rotate([2,0,0]) {
  translate([0, 0.12,0]) cylinder(h=1.1, r=0.04, center=true);
  translate([0,-0.12,0]) cylinder(h=1.1, r=0.04, center=true);
  translate([0,0,-0.55]) cylinder(h=0.06, r=0.18, center=true);
}
// Seat post
translate([0,0,1.25]) cylinder(h=1.0, r=0.04, center=true);
// Saddle
translate([0,0,1.78]) hull() {
  translate([-0.18,0,0]) sphere(r=0.08);
  translate([ 0.18,0,0]) sphere(r=0.07);
}
`,
    engine: `
$fn = 48;
// --- ${topic} (steam engine) ---
// Boiler — large horizontal cylinder (the heart of a steam engine)
rotate([0,90,0]) cylinder(h=3.8, r=0.82, center=true);
// Boiler end caps
translate([ 1.95,0,0]) sphere(r=0.82);
translate([-1.95,0,0]) sphere(r=0.82);
// Chimney stack
translate([1.5, 0, 1.05]) cylinder(h=2.0, r=0.22);
// Chimney cap/flare
translate([1.5, 0, 3.0]) cylinder(h=0.2, r1=0.22, r2=0.32);
// Firebox (rectangular box at rear of boiler)
translate([-1.6, 0, -0.5]) cube([1.2, 1.5, 0.9], center=true);
// Cylinder (working cylinder, horizontal)
translate([0.6, 0.9, 0.6]) rotate([0,90,0]) cylinder(h=1.2, r=0.28, center=true);
// Cylinder end cover
translate([1.22, 0.9, 0.6]) sphere(r=0.29);
translate([-0.02, 0.9, 0.6]) sphere(r=0.29);
// Piston rod (extends from cylinder)
translate([1.55, 0.9, 0.6]) rotate([0,90,0]) cylinder(h=0.7, r=0.07, center=true);
// Crosshead
translate([1.92, 0.9, 0.6]) cube([0.18, 0.35, 0.25], center=true);
// Connecting rod (to flywheel crank)
hull() {
  translate([1.92, 0.9, 0.6]) sphere(r=0.06);
  translate([-1.2, 0.9, 0.1]) sphere(r=0.06);
}
// Flywheel (large spoked wheel)
translate([-1.6, 1.1, 0.1]) rotate([90,0,0]) {
  difference() {
    cylinder(h=0.14, r=1.05, center=true);
    cylinder(h=0.18, r=0.85, center=true);
  }
  for(i=[0:5]) rotate([0,0,i*60]) cube([1.82, 0.09, 0.14], center=true);
  cylinder(h=0.18, r=0.14, center=true);
}
// Valve chest
translate([0.6, 0.55, 0.85]) cube([1.0, 0.4, 0.28], center=true);
// Steam pipe from boiler to valve
hull() {
  translate([0.7,0,0.82]) sphere(r=0.07);
  translate([0.7,0.55,0.82]) sphere(r=0.07);
}
// Base/bedplate
translate([0, 0, -1.0]) cube([5.0, 2.0, 0.22], center=true);
// Two upright frame columns
translate([ 0.6, 0, -0.55]) cube([0.14, 1.9, 1.0], center=true);
translate([-1.2, 0, -0.55]) cube([0.14, 1.9, 0.8], center=true);
// Pressure gauge on boiler top
translate([0.2, 0, 0.9]) cylinder(h=0.18, r=0.22, center=true);
translate([0.2, 0, 1.0]) sphere(r=0.19);
`,
    satellite: `
$fn = 32;
// --- ${topic} ---
// Main body (bus)
cube([1.4, 1.0, 1.8], center=true);
// Solar panels (2 large wings)
translate([ 1.7, 0, 0]) cube([2.4, 0.06, 1.2], center=true);
translate([-1.7, 0, 0]) cube([2.4, 0.06, 1.2], center=true);
// Panel frames
for(x=[-1.7,1.7], z=[-0.55,0,0.55])
  translate([x,0,z]) cube([2.4,0.09,0.05],center=true);
// Antenna dish
translate([0, 0, 1.3]) {
  cylinder(h=0.08, r1=0.7, r2=0.5);
  translate([0,0,0.3]) cylinder(h=0.5, r=0.04, center=true);
}
// Thruster nozzles
for(x=[-0.45,0.45], y=[-0.45,0.45])
  translate([x,y,-1.0]) cylinder(h=0.25, r1=0.05, r2=0.12);
// Payload (telescope or sensor box)
translate([0,0.6,0.5]) cube([0.4,0.3,0.5], center=true);
`,
    microscope: `
$fn = 32;
// --- ${topic} ---
// Base
cylinder(h=0.18, r=1.1, center=true);
// Arm / column
translate([0.2,0,0]) cylinder(h=3.8, r=0.18);
// Stage (specimen platform)
translate([0.2,0,1.4]) cylinder(h=0.12, r=0.7, center=true);
// Stage clips
translate([0.2, 0.55, 1.42]) cube([0.5,0.06,0.08],center=true);
translate([0.2,-0.55, 1.42]) cube([0.5,0.06,0.08],center=true);
// Objective turret
translate([0.2,0,2.1]) cylinder(h=0.3, r=0.42, center=true);
// Objectives (3 lenses)
for(i=[0:2]) rotate([0,0,i*120])
  translate([0.2+0.3,0,2.0]) cylinder(h=0.5, r=0.08);
// Eyepiece tube + eyepiece
translate([0.2,0,3.85]) cylinder(h=0.55, r=0.19, center=true);
translate([0.2,0,4.15]) cylinder(h=0.2, r1=0.22, r2=0.19, center=true);
// Coarse focus knob
translate([0.2+0.18,0,2.5]) rotate([90,0,0]) cylinder(h=0.08,r=0.28,center=true);
`,
    guitar: `
$fn = 48;
// --- ${topic} ---
// Body — figure-8 shape using two offset hulls
hull() {
  translate([0, 0.55, 0]) cylinder(h=0.34, r=0.85, center=true);
  translate([0,-0.55, 0]) cylinder(h=0.34, r=0.85, center=true);
}
// Waist pinch
difference() {
  cube([2,2,0.36],center=true);
  translate([ 0.72,0,0]) cylinder(h=0.4,r=0.45,center=true);
  translate([-0.72,0,0]) cylinder(h=0.4,r=0.45,center=true);
}
// Sound hole
cylinder(h=0.4, r=0.3, center=true);
// Neck
translate([0,1.52,0.04]) cube([0.28,1.8,0.22],center=true);
// Frets (6)
for(i=[0:5]) translate([0,0.72+i*0.18,0.14]) cube([0.28,0.03,0.04],center=true);
// Headstock
translate([0,2.5,0.06]) cube([0.38,0.45,0.24],center=true);
// Tuning pegs (6)
for(x=[-0.14,0.14], y=[2.36,2.5,2.64])
  translate([x,y,0.22]) cylinder(h=0.18,r=0.04,center=true);
// Bridge
translate([0,-0.8,0.18]) cube([0.7,0.1,0.1],center=true);
// Strings (6 thin cylinders)
for(x=[-0.09,-0.05,-0.01,0.01,0.05,0.09])
  translate([x,0.9,0.2]) cube([0.015,3.6,0.015],center=true);
`,
    generic: `
$fn = 48;
// --- ${topic} ---
union() {
  translate([0, 0, 1.0]) cube([1.5, 1.5, 2.0], center=true);
  translate([0, 0, 2.2]) sphere(r=0.55);
  translate([0, 0, 0]) cylinder(h=0.14, r=1.1, center=true);
}
`,
  };

  return templates[cat].trim();
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function openScadPrompt(topic: string, params: ParamsMap, feedback: string | null) {
  const cat = classifyTopic(topic);
  const paramsJson = JSON.stringify(params ?? {});

  // Few-shot example matching the category
  const examples: Partial<Record<TopicCategory, string>> = {
    car: `Example for "racing car":
$fn=32;
module wheel(r=0.38,w=0.35){rotate([90,0,0])cylinder(h=w,r=r,center=true);}
hull(){translate([0,0,.22])cube([4.6,1.85,.44],center=true);translate([0,0,.52])cube([3.2,1.5,.18],center=true);}
translate([0.25,0,.78])scale([1,.55,.45])sphere(r=0.7);  // cockpit
translate([2.35,0,.05])cube([0.9,2.4,.07],center=true);  // front wing
translate([-2.2,0,.80])cube([0.5,2.2,.07],center=true);  // rear wing
translate([1.45,1.12,0])wheel(); translate([1.45,-1.12,0])wheel();
translate([-1.45,1.22,0])wheel(r=0.42,w=0.42); translate([-1.45,-1.22,0])wheel(r=0.42,w=0.42);`,
    aircraft: `Example for "jet fighter":
$fn=32;
hull(){cylinder(h=7.0,r=0.55,center=true);translate([3.6,0,0])scale([.18,.3,.3])sphere(r=.55);}
translate([0.3,0,0])hull(){cube([1.0,5.5,.12],center=true);translate([.6,0,0])cube([.3,3.5,.08],center=true);}
translate([-3.0,0,0])cube([.7,2.8,.08],center=true);
translate([-3.0,0,.5])rotate([90,0,0])cube([.7,1.1,.08],center=true);`,
    rocket: `Example for "saturn V rocket":
$fn=64;
cylinder(h=5,r=0.5,center=true);
translate([0,0,2.8])cylinder(h=1.5,r1=0.5,r2=0.02);
for(i=[0:3])rotate([0,0,i*90])translate([.5,0,-1.8])rotate([0,15,0])cube([.8,.06,1.4],center=true);`,
  };

  const exampleStr = examples[cat]
    ? `\nEXAMPLE OUTPUT (adapt this style for "${topic}"):\n${examples[cat]}\n`
    : "";

  return `You generate OpenSCAD 3D model scripts.
Return ONLY valid OpenSCAD code — no markdown, no triple backticks, no explanations, no JSON.

TOPIC: "${topic}" (category: ${cat})
PARAMS: ${paramsJson}
FEEDBACK: ${feedback || "none"}
${exampleStr}
RULES:
1. Pure OpenSCAD syntax ONLY. Valid primitives: cube, sphere, cylinder, hull(), union(), difference(), intersection(), translate(), rotate(), scale(), mirror(), for(), module, linear_extrude(), rotate_extrude(), polygon()
2. No JavaScript. No Python. No json.loads(). All values must be numeric literals.
3. Build a RECOGNIZABLE "${topic}" — make it look like the real object with its characteristic shape features.
4. Use $fn=32 or $fn=64 for smooth curves.
5. Must have 3+ distinct parts (body, appendages, details).
6. Use hull() for smooth transitions between shapes.
7. Scale the whole model to fit roughly within a 6×6×6 unit bounding box.

BUILD A "${topic.toUpperCase()}" THAT IS CLEARLY RECOGNIZABLE.
`;
}

function blenderScriptPrompt(topic: string, params: ParamsMap, feedback: string | null) {
  const paramsJson = JSON.stringify(params ?? {});
  return `You write Blender 3.4 Python scripts for headless Docker rendering.
Return ONLY valid Python — no markdown, no explanations.

MANDATORY: These lines must appear EXACTLY after read_factory_settings():
import addon_utils as _au
try: _au.enable("io_scene_gltf2", default_set=False, persistent=False)
except: pass
scene.render.engine = "CYCLES"
try: scene.cycles.device = "CPU"
except: pass

THEN add camera (camera_add) and SUN light (light_add type="SUN"), then build geometry.

EXPORT (mandatory): bpy.ops.export_scene.gltf(filepath="/tmp/output.glb", export_format="GLB", use_selection=False)
RENDER (wrap in try/except): scene.render.filepath="/tmp/thumbnail.png"; bpy.ops.render.render(write_still=True)

TOPIC: "${topic}"
PARAMS: ${paramsJson}
FEEDBACK: ${feedback || "none"}

CRITICAL: Build a recognizable "${topic}" using bpy mesh operations.
Use multiple primitives (cube, cylinder, sphere, torus) arranged to form the actual shape.
DO NOT just make a box. Think about what "${topic}" looks like and represent its key features:
- Characteristic silhouette
- Main structural components
- At least 4-6 distinct mesh objects composited together
Apply Principled BSDF material with an appropriate color for "${topic}".
`;
}

/** Known-good Blender script — enables io_scene_gltf2, topic-aware colors */
function deterministicBlenderScript(topic: string, params: ParamsMap): string {
  const paramsJson = JSON.stringify(params ?? {});
  const cat = classifyTopic(topic);
  const colors: Record<TopicCategory, string> = {
    car: "(0.8,0.1,0.05,1)", aircraft: "(0.85,0.85,0.85,1)", rocket: "(0.9,0.9,0.9,1)",
    building: "(0.7,0.65,0.55,1)", bottle: "(0.15,0.5,0.9,0.7)", robot: "(0.5,0.55,0.6,1)",
    bridge: "(0.6,0.55,0.5,1)", turbine: "(0.9,0.9,0.88,1)", ship: "(0.25,0.35,0.5,1)",
    bicycle: "(0.1,0.4,0.9,1)", unicycle: "(0.1,0.4,0.9,1)", engine: "(0.45,0.42,0.38,1)",
    satellite: "(0.7,0.75,0.8,1)", microscope: "(0.85,0.85,0.82,1)", guitar: "(0.6,0.28,0.05,1)",
    generic: "(0.4,0.55,0.9,1)",
  };
  const col = colors[cat];

  return `
import bpy, json, sys, traceback

PARAMS = json.loads(${JSON.stringify(paramsJson)})
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

import addon_utils as _au
try:
    _au.enable("io_scene_gltf2", default_set=False, persistent=False)
except Exception as _e:
    print("io_scene_gltf2:", _e, file=sys.stderr)

scene.render.engine = "CYCLES"
try: scene.cycles.device = "CPU"
except: pass

bpy.ops.object.camera_add(location=(5.0, -5.0, 3.5), rotation=(1.15, 0.0, 0.85))
scene.camera = bpy.context.active_object
bpy.ops.object.light_add(type="SUN", location=(2.0, 2.0, 12.0))
bpy.context.active_object.data.energy = 3.0

def make_mat(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.35
        bsdf.inputs["Metallic"].default_value = 0.2
    return mat

mat = make_mat("Mat", ${col})

def add(loc=(0,0,0), scale=(1,1,1), kind="cube"):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=loc)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=1.0, location=loc)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    if o.data.materials: o.data.materials[0] = mat
    else: o.data.materials.append(mat)
    return o

${cat === "car" ? `
# F1 / race car shape
add((0,0,0.22), (4.6,1.85,0.44))    # chassis
add((0,0,0.55), (3.2,1.5,0.2))     # upper body
add((0.25,0,0.8), (1.0,0.55,0.45), "sphere") # cockpit
add((2.35,0,0.05), (0.9,2.4,0.07)) # front wing
add((-2.2,0,0.8), (0.5,2.2,0.07))  # rear wing
add((2.55,0,0.22), (0.55,0.5,0.35), "sphere") # nose
# wheels
for x,y,sz in [(1.45,1.12,0.38),(1.45,-1.12,0.38),(-1.45,1.22,0.42),(-1.45,-1.22,0.42)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=sz, depth=0.35, location=(x,y,0))
    o = bpy.context.active_object
    o.rotation_euler = (1.5708,0,0)
    if o.data.materials: o.data.materials[0] = mat
    else: o.data.materials.append(mat)
` : cat === "aircraft" ? `
# Aircraft shape
add((0,0,0), (7.0,0.55,0.55), "cylinder") # fuselage — rotated
bpy.data.objects[-1].rotation_euler=(0,1.5708,0)
add((0.3,0,0), (1.0,5.5,0.1)) # wings
add((-3.0,0,0), (0.6,2.8,0.08)) # horiz stabilizer
add((-3.0,0,0.5), (0.06,0.06,1.1), "cylinder") # vert fin
` : cat === "rocket" ? `
# Rocket shape
add((0,0,0), (0.5,0.5,2.5), "cylinder") # body
add((0,0,2.8), (0.5,0.5,1.5), "sphere") # nose cone
for ang in [0,90,180,270]:
    import math
    rad=math.radians(ang)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(math.cos(rad)*0.8,math.sin(rad)*0.8,-1.8))
    o=bpy.context.active_object
    o.scale=(0.8,0.06,1.4)
    o.rotation_euler=(0,0,rad)
    if o.data.materials: o.data.materials[0]=mat
    else: o.data.materials.append(mat)
` : cat === "building" ? `
# Building shape
add((0,0,2.5), (2.0,2.0,5.0))        # tower
add((0,0,5.5), (0.1,0.1,0.1), "sphere") # spire base
for z in [-1.5,-0.5,0.5,1.5]:
    for x in [-0.55,0,0.55]:
        add((x,1.05,z), (0.3,0.06,0.4))
` : cat === "bottle" ? `
# Bottle shape
bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=2.4, location=(0,0,1.2))
o=bpy.context.active_object
if o.data.materials: o.data.materials[0]=mat
else: o.data.materials.append(mat)
bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=0.8, location=(0,0,2.7))
o=bpy.context.active_object
if o.data.materials: o.data.materials[0]=mat
else: o.data.materials.append(mat)
bpy.ops.mesh.primitive_torus_add(major_radius=0.55, minor_radius=0.07, location=(0,0,0.0))
o=bpy.context.active_object
if o.data.materials: o.data.materials[0]=mat
else: o.data.materials.append(mat)
` : `
# Generic shape
sx = float(PARAMS.get("Width", 1.5)) or 1.5
sy = float(PARAMS.get("Height", 2.0)) or 2.0
sz = float(PARAMS.get("Length", 1.0)) or 1.0
add((0,0,sy/2), (sx/2,sy/2,sz/2))
add((0,0,sy+0.4), (0.55,0.55,0.55), "sphere")
`}

bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0,0.0,-0.05))

out_glb = "/tmp/output.glb"
out_png  = "/tmp/thumbnail.png"

try:
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=False)
except Exception as _e1:
    try:
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB")
    except Exception as _e2:
        traceback.print_exc(file=sys.stderr)
        raise RuntimeError(f"glTF export failed: {_e1} | {_e2}")

scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out_png
scene.render.resolution_x = 640
scene.render.resolution_y = 480
try:
    bpy.ops.render.render(write_still=True)
except Exception as _re:
    print("Render skip (OK):", _re, file=sys.stderr)
`.trim();
}

async function generateOpenScadScript(topic: string, params: ParamsMap, feedback: string | null): Promise<string> {
  if (!process.env.GROQ_API_KEY) return deterministicOpenScadScript(topic);
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: openScadPrompt(topic, params, feedback) }],
      temperature: 0.25,
      max_tokens: 2000,
    });
    const raw = stripCodeFences(completion.choices?.[0]?.message?.content || "");
    return raw || deterministicOpenScadScript(topic);
  } catch {
    return deterministicOpenScadScript(topic);
  }
}

async function generateBlenderScript(topic: string, params: ParamsMap, feedback: string | null): Promise<string> {
  if (!process.env.GROQ_API_KEY) return deterministicBlenderScript(topic, params ?? {});
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: blenderScriptPrompt(topic, params, feedback) }],
      temperature: 0.2,
      max_tokens: 2800,
    });
    const raw = stripCodeFences(completion.choices?.[0]?.message?.content || "");
    return raw || deterministicBlenderScript(topic, params ?? {});
  } catch {
    return deterministicBlenderScript(topic, params ?? {});
  }
}

async function verifyWithVision(description: string, imageBase64: string, origin: string): Promise<number> {
  try {
    const res = await fetch(`${origin}/api/verify-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, imageBase64 }),
    });
    const data = await res.json();
    return data?.score ?? 75;
  } catch {
    return 75;
  }
}

const MIN_GLB_B64_LEN = 80;

async function postToWorker(workerUrl: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Cannot reach render worker: ${msg}` };
  }
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return { success: false, error: `Worker HTTP ${res.status} — non-JSON body` };
  }
}

function isGoodGlb(data: Record<string, unknown>): boolean {
  return (
    data?.success === true &&
    typeof data.glbBase64 === "string" &&
    data.glbBase64.length >= MIN_GLB_B64_LEN
  );
}

export async function POST(req: Request) {
  try {
    const { topic, simType, params, generatorHint } = await req.json();
    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ success: false, error: "topic is required" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const primaryGen = pickGenerator(topic, simType, generatorHint);
    const fallbackGen = primaryGen === "openscad" ? "blender" : "openscad";
    const workerUrl = process.env.RENDER_WORKER_URL || "http://localhost:8787/render";
    const threshold = Number(process.env.GEOMETRY_VERIFY_THRESHOLD ?? 70);
    const basePayload = { topic, simType, paramsJson: params || {}, exportFormat: "glb", screenshot: true };

    // 4-attempt cascade: LLM primary → det primary → LLM fallback → det fallback
    const attempts: Array<{ generator: string; getScript: () => Promise<string> }> = [
      {
        generator: primaryGen,
        getScript: () =>
          primaryGen === "openscad"
            ? generateOpenScadScript(topic, params || {}, null)
            : generateBlenderScript(topic, params || {}, null),
      },
      {
        generator: primaryGen,
        getScript: async () =>
          primaryGen === "openscad"
            ? deterministicOpenScadScript(topic)
            : deterministicBlenderScript(topic, params || {}),
      },
      {
        generator: fallbackGen,
        getScript: () =>
          fallbackGen === "openscad"
            ? generateOpenScadScript(topic, params || {}, null)
            : generateBlenderScript(topic, params || {}, null),
      },
      {
        generator: fallbackGen,
        getScript: async () =>
          fallbackGen === "openscad"
            ? deterministicOpenScadScript(topic)
            : deterministicBlenderScript(topic, params || {}),
      },
    ];

    let lastError = "All generation attempts failed";

    for (let i = 0; i < attempts.length; i++) {
      const { generator, getScript } = attempts[i];
      let script: string;
      try {
        script = await getScript();
      } catch (e) {
        console.warn(`[geometry-render] attempt ${i + 1} script gen error:`, e);
        continue;
      }

      const data = await postToWorker(workerUrl, { ...basePayload, generator, script });

      if (isGoodGlb(data)) {
        const glbBase64 = data.glbBase64 as string;
        const thumbnailBase64 = data.thumbnailBase64;
        const score = thumbnailBase64 ? await verifyWithVision(topic, String(thumbnailBase64), origin) : 75;
        console.log(`[geometry-render] success: attempt ${i + 1}, gen=${generator}, score=${score}`);
        return NextResponse.json({ success: true, glbBase64, thumbnailBase64, score, generator, attempt: i });
      }

      lastError =
        (typeof data?.error === "string" && data.error.slice(0, 600)) ||
        `Attempt ${i + 1} (${generator}) failed`;
      console.warn(`[geometry-render] attempt ${i + 1} (${generator}) failed:`, lastError.slice(0, 200));
    }

    return NextResponse.json({ success: false, error: lastError }, { status: 500 });
  } catch (e) {
    console.error("[geometry-render]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
