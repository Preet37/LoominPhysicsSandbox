/**
 * Deterministic geometry-quality gates for AI-generated React Three Fiber code.
 *
 * These run inside the generate-scene agent loop. Prompting a model to "avoid
 * blocky output" is unreliable; failing an audit with specific numbers and
 * feeding that back into the next attempt is not.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic polish
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum segment counts, by geometry, as {argIndex: minimum}.
 * Arg indices follow the three.js constructor signatures.
 */
const SEGMENT_MINIMUMS: Record<string, Record<number, number>> = {
  // (radius, widthSegments, heightSegments)
  sphereGeometry: { 1: 48, 2: 32 },
  // (radiusTop, radiusBottom, height, radialSegments)
  cylinderGeometry: { 3: 48 },
  // (radius, height, radialSegments)
  coneGeometry: { 2: 48 },
  // (radius, tube, radialSegments, tubularSegments)
  torusGeometry: { 2: 24, 3: 96 },
  // (radius, segments)
  circleGeometry: { 1: 64 },
  // (innerRadius, outerRadius, thetaSegments)
  ringGeometry: { 2: 64 },
  // (radius, length, capSegments, radialSegments)
  capsuleGeometry: { 2: 12, 3: 32 },
  // (points, segments)
  latheGeometry: { 1: 64 },
  // (path, tubularSegments, radius, radialSegments)
  tubeGeometry: { 1: 64, 3: 24 },
};

/** Split an argument list on top-level commas, respecting nesting and strings. */
function splitTopLevelArgs(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

/**
 * Find `args={[ ... ]}` immediately following a position, returning the inner
 * text and its bounds. Uses bracket balancing because argument arrays commonly
 * nest (a lathe profile is an array of Vector2s inside the args array).
 */
function findArgsArray(code: string, from: number): { inner: string; start: number; end: number } | null {
  const m = /args=\{\s*\[/.exec(code.slice(from, from + 200));
  if (!m) return null;
  const openIdx = from + m.index + m[0].length - 1; // index of the '['
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === quote && code[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) return { inner: code.slice(openIdx + 1, i), start: openIdx + 1, end: i };
    }
  }
  return null;
}

/**
 * Fix the mechanical half of blockiness in place, before the code is ever shown
 * to a reviewer.
 *
 * Low segment counts and flatShading are the two most visible causes of faceted
 * output, and both are fully determined — there is no judgement involved in
 * raising 16 segments to 48. Repairing them here means the agent's remaining
 * turns are spent on the parts that genuinely need a model (choosing the right
 * construction for a shape), instead of being burned on arithmetic the loop
 * often ran out of turns before completing.
 */
export function polishGeometry(code: string): { code: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = code;

  // 1. Raise literal segment counts below the documented minimums.
  // Rebuild left-to-right so replacement offsets stay valid.
  const geomRe = /<([a-z][a-zA-Z]*Geometry)\b/g;
  let result = "";
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = geomRe.exec(out)) !== null) {
    const geom = m[1];
    const minimums = SEGMENT_MINIMUMS[geom];
    if (!minimums) continue;

    const args = findArgsArray(out, m.index + m[0].length);
    if (!args) continue;

    const parts = splitTopLevelArgs(args.inner);
    let changed = false;
    for (const [idxStr, min] of Object.entries(minimums)) {
      const idx = Number(idxStr);
      if (idx >= parts.length) continue;
      const raw = parts[idx].trim();
      const n = Number(raw);
      // Only literal integers are safe to rewrite; expressions may be intentional.
      if (!Number.isInteger(n) || n <= 2 || n >= min) continue;
      parts[idx] = parts[idx].replace(raw, String(min));
      changed = true;
      fixes.push(`${geom} segment arg ${idx}: ${n} → ${min}`);
    }

    if (changed) {
      result += out.slice(cursor, args.start) + parts.join(",");
      cursor = args.end;
    }
  }
  out = result + out.slice(cursor);

  // 2. flatShading is the explicit "render faceted" flag.
  const flatBefore = (out.match(/flatShading/g) || []).length;
  if (flatBefore > 0) {
    out = out
      .replace(/\s+flatShading=\{(?:true|false)\}/g, "")
      .replace(/\s+flatShading(?=[\s/>])/g, "")
      .replace(/,?\s*flatShading:\s*(?:true|false)\s*,?/g, (mm) => (mm.trim().startsWith(",") && mm.trim().endsWith(",") ? "," : ""));
    const flatAfter = (out.match(/flatShading/g) || []).length;
    if (flatAfter < flatBefore) fixes.push(`removed flatShading ×${flatBefore - flatAfter}`);
  }

  return { code: out, fixes };
}

/**
 * Blockiness gate.
 *
 * "It looks blocky" is the most common complaint about generated scenes, and
 * prompting alone does not reliably fix it — models default to boxes and low
 * segment counts. Failing the audit routes the problem into the existing repair
 * loop, which does fix it, because the specific numbers get fed back.
 */
export function smoothnessAudit(
  code: string,
  topicLower: string,
  meshCount: number,
  boxCount: number,
  boxesAreIntentional: boolean,
): string[] {
  const issues: string[] = [];

  // 1. Segment counts. Low values are the single most visible cause of faceting.
  const MIN_SEGMENTS: Record<string, number> = {
    sphere: 32, cylinder: 32, torus: 24, cone: 32, circle: 32, lathe: 32,
  };
  // How many leading args are dimensions rather than segment counts.
  const DIM_ARGS: Record<string, number> = {
    sphere: 1, cylinder: 3, torus: 2, cone: 2, circle: 1, lathe: 0,
  };
  const faceted: string[] = [];
  for (const m of code.matchAll(
    /<(sphere|cylinder|torus|cone|circle|lathe)Geometry\s+args=\{\[([^\]]*)\]/g,
  )) {
    const kind = m[1];
    const args = m[2].split(",").map((s) => s.trim());
    const segs = args
      .slice(DIM_ARGS[kind])
      .map((s) => Number(s))
      // Only literal integers are checkable; expressions are left alone.
      .filter((n) => Number.isInteger(n) && n > 2);
    if (segs.length && Math.max(...segs) < MIN_SEGMENTS[kind]) {
      faceted.push(`${kind}Geometry(${segs.join(",")}) → needs ≥${MIN_SEGMENTS[kind]}`);
    }
  }
  if (faceted.length) {
    issues.push(
      `SMOOTHNESS: ${faceted.length} geometry(s) use segment counts low enough to look faceted: ` +
      `${faceted.slice(0, 6).join("; ")}. Raise them — extra segments are nearly free.`,
    );
  }

  // 2. flatShading is literally the "look faceted" flag.
  if (/flatShading/.test(code)) {
    issues.push("SMOOTHNESS: Remove flatShading — it forces the blocky faceted look.");
  }

  // 3. Box dominance. Curved real-world objects built from boxes read as LEGO.
  const smoothCount =
    (code.match(/<latheGeometry\b/g) || []).length +
    (code.match(/<extrudeGeometry\b/g) || []).length +
    (code.match(/<tubeGeometry\b/g) || []).length;

  if (!boxesAreIntentional && meshCount >= 6) {
    const boxRatio = boxCount / meshCount;
    if (boxRatio > 0.45) {
      issues.push(
        `SMOOTHNESS: ${boxCount} of ${meshCount} meshes are boxGeometry (${Math.round(boxRatio * 100)}%) — ` +
        `this reads as a LEGO model. Convert the curved parts: use latheGeometry for ` +
        `revolved/turned shapes, extrudeGeometry with bevelEnabled for rounded plates ` +
        `and outlines, tubeGeometry along a CatmullRomCurve3 for anything that sweeps or bends.`,
      );
    }
    // A genuinely rectilinear object is rare; ask for at least one curved
    // construction unless the topic is explicitly boxy.
    const rectilinear = /breadboard|brick|block|cube|box|crate|shelf|building|circuit/.test(topicLower);
    if (smoothCount === 0 && !rectilinear) {
      issues.push(
        "SMOOTHNESS: No latheGeometry, extrudeGeometry or tubeGeometry anywhere. Real objects " +
        "have curved, filleted surfaces — build at least the main body or shell from a lathe " +
        "profile or a bevelled extrude instead of stacked primitives.",
      );
    }
  }

  // 4. Custom BufferGeometry without normals renders flat and unlit-looking.
  if (/BufferGeometry\(\)/.test(code) && !/computeVertexNormals/.test(code)) {
    issues.push(
      "SMOOTHNESS: Custom BufferGeometry is built without .computeVertexNormals() — " +
      "it will shade flat. Call it after setting positions.",
    );
  }

  // 5. A lathe profile made of straight steps revolves into a cylinder or a
  // washer — no curvature gained. Models reach for latheGeometry when told to
  // avoid boxes, then hand it a rectangular profile, which defeats the point.
  const straightLathes = countStraightLatheProfiles(code);
  if (straightLathes > 0) {
    issues.push(
      `SMOOTHNESS: ${straightLathes} latheGeometry profile(s) use a constant or purely stepped ` +
      `radius, which revolves into a plain cylinder/washer — no curvature is gained. Either ` +
      `vary the radius smoothly along the profile (that is the entire point of a lathe: ` +
      `generate 20+ points with the radius following a curve), or — if the part is defined by ` +
      `a 2D OUTLINE rather than a revolved cross-section — use extrudeGeometry with a ` +
      `bevelled THREE.Shape built from quadraticCurveTo/bezierCurveTo instead.`,
    );
  }

  // 6. An extrude without a bevel has knife-sharp edges.
  const extrudeCount = (code.match(/<extrudeGeometry\b/g) || []).length;
  if (extrudeCount > 0 && !/bevelEnabled:\s*true/.test(code)) {
    issues.push(
      "SMOOTHNESS: extrudeGeometry is used without bevelEnabled: true — the edges will be " +
      "perfectly sharp. Add bevelEnabled with a small bevelThickness/bevelSize and " +
      "bevelSegments: 4+ so edges catch light like a real filleted part.",
    );
  }

  return issues;
}

/**
 * Count lathe profiles that revolve into something with no curvature.
 *
 * A curved profile sweeps its radius through many values; a rectangular or
 * stepped one uses only a couple. Profiles of 3 or fewer points are skipped
 * because a cone or flat disc is legitimately described that way, and profiles
 * containing computed values are skipped because they cannot be judged
 * statically.
 */
function countStraightLatheProfiles(code: string): number {
  let straight = 0;
  // Match the args array of each latheGeometry, in JSX or transformed form.
  const re = /latheGeometry['"]?[^[]{0,30}\[\s*\[([\s\S]{0,900}?)\]\s*,/g;
  for (const m of code.matchAll(re)) {
    const radii: number[] = [];
    let sawNonLiteral = false;
    for (const v of m[1].matchAll(/Vector2\(\s*([^,)]+)\s*,/g)) {
      const n = Number(v[1].trim());
      if (Number.isFinite(n)) radii.push(n);
      else sawNonLiteral = true;
    }
    if (sawNonLiteral || radii.length < 4) continue;
    const distinct = new Set(radii.map((r) => Math.round(r * 1e4))).size;
    if (distinct <= 2) straight++;
  }
  return straight;
}
