import express from "express";
import fs from "fs";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { resolveCadBinaries } from "./binPaths.js";

const CAD = resolveCadBinaries();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

/**
 * Reads happen inside a serialized render, so a synchronous readFileSync of a
 * multi-hundred-KB GLB blocks the event loop long enough to make a concurrent
 * /health ping time out. Reading async keeps the worker responsive mid-render.
 */
async function readBase64IfPresent(p) {
  try {
    const buf = await fs.promises.readFile(p);
    return buf.length > 0 ? buf.toString("base64") : "";
  } catch {
    return "";
  }
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, "utf8");
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe", ...opts });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ code, stdout, stderr });
      reject(new Error(`Command failed: ${cmd} ${args.join(" ")} (code ${code})\n${stderr}`));
    });
  });
}

const MIN_GLB_B64 = 80; // non-empty glTF binary is at least dozens of bytes when base64

/**
 * Renders share one CPU and previously shared one set of /tmp output paths, so two
 * concurrent requests would delete each other's intermediate files mid-pipeline
 * ("STL Import: Cannot open file '/tmp/output.stl'"). Each job now gets its own
 * directory, and the queue keeps Blender/OpenSCAD from thrashing the machine.
 */
let renderQueue = Promise.resolve();

function enqueue(job) {
  const run = renderQueue.then(job, job);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/**
 * LLM-authored Blender scripts hardcode the legacy /tmp/output.glb paths, so
 * redirect them into this job's private directory.
 */
function redirectHardcodedPaths(source, { outGlb, outPng, outStl }) {
  return String(source)
    .replaceAll("/tmp/output.glb", outGlb)
    .replaceAll("/tmp/thumbnail.png", outPng)
    .replaceAll("/tmp/output.stl", outStl);
}

async function renderWithBlenderScript({ scriptSource, screenshot }) {
  if (!scriptSource || !String(scriptSource).trim()) {
    return {
      ok: false,
      glbBase64: "",
      thumbnailBase64: "",
      error: "Empty Blender script",
      stderr: "",
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loomin-blender-"));
  const outGlb = path.join(tmpDir, "output.glb");
  const outPng = path.join(tmpDir, "thumbnail.png");
  const outStl = path.join(tmpDir, "output.stl");

  const pyPath = path.join(tmpDir, "script.py");
  writeFile(pyPath, redirectHardcodedPaths(scriptSource, { outGlb, outPng, outStl }));

  let blend = { stdout: "", stderr: "" };
  let blendError = null;
  try {
    blend = await runCmd(CAD.blender, ["--background", "--python", pyPath]);
  } catch (e) {
    // Exit code non-zero is common when Cycles denoiser/GPU init fails in headless Docker,
    // even though the GLB export may have already been written successfully.
    // Do NOT bail here — check if the output file exists first.
    blendError = e?.message || String(e);
    blend.stderr = blendError;
  }

  const glbBase64 = await readBase64IfPresent(outGlb);
  const thumbnailBase64 = await readBase64IfPresent(outPng);

  if (!glbBase64 || glbBase64.length < MIN_GLB_B64) {
    const hint = blendError
      ? `Blender exited with error and the GLB is missing or empty: ${blendError.slice(0, 400)}`
      : "Blender finished but no GLB was written. Script must call bpy.ops.export_scene.gltf(filepath='/tmp/output.glb', export_format='GLB').";
    cleanup(tmpDir);
    return {
      ok: false,
      glbBase64: "",
      thumbnailBase64,
      error: hint,
      stderr: blend.stderr || "",
    };
  }

  // GLB exists — success regardless of Blender's exit code
  cleanup(tmpDir);
  return { ok: true, glbBase64, thumbnailBase64, error: null, stderr: blend.stderr || "" };
}

async function exportFromOpenScadToGLB({ scadSource, screenshot }) {
  if (!scadSource || !String(scadSource).trim()) {
    return {
      ok: false,
      glbBase64: "",
      thumbnailBase64: "",
      error: "Empty OpenSCAD script",
      stderr: "",
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loomin-openscad-"));
  const scadPath = path.join(tmpDir, "model.scad");
  writeFile(scadPath, scadSource);

  const outStl = path.join(tmpDir, "output.stl");
  const outGlb = path.join(tmpDir, "output.glb");
  const outPng = path.join(tmpDir, "thumbnail.png");

  // 1) Compile scad → STL
  // binstl tends to be smaller/faster than ascii; it's still importable by Blender.
  let scadStderr = "";
  try {
    const o = await runCmd(CAD.openscad, ["-o", outStl, "--export-format", "binstl", scadPath]);
    scadStderr = o.stderr || "";
  } catch (e) {
    cleanup(tmpDir);
    return {
      glbBase64: "",
      thumbnailBase64: "",
      ok: false,
      error: e?.message || String(e),
      stderr: scadStderr,
    };
  }

  if (!fs.existsSync(outStl) || fs.statSync(outStl).size === 0) {
    cleanup(tmpDir);
    return {
      glbBase64: "",
      thumbnailBase64: "",
      ok: false,
      error: "OpenSCAD produced no STL — the script likely renders nothing (empty or 2D-only geometry).",
      stderr: scadStderr,
    };
  }

  // 2) Import STL into Blender and export GLB + thumbnail.
  const importPy = `
import bpy, math, os, sys, traceback

out_stl = "${outStl}"
out_glb = "${outGlb}"
out_png = "${outPng}"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# CRITICAL: read_factory_settings clears all addons — re-enable glTF exporter
import addon_utils as _au
try:
    _au.enable("io_scene_gltf2", default_set=False, persistent=False)
except Exception as _e:
    print("io_scene_gltf2 enable:", _e, file=sys.stderr)

# Use Cycles CPU — reliable in headless Docker without GPU
scene.render.engine = "CYCLES"
try:
    scene.cycles.device = "CPU"
except Exception:
    pass

# Camera
bpy.ops.object.camera_add(location=(3.2, -3.0, 2.2), rotation=(1.1, 0, 0))
scene.camera = bpy.context.active_object

# Use SUN lights (AREA light energy API differs between Blender versions)
bpy.ops.object.light_add(type="SUN", location=(4, -4, 8))
bpy.context.active_object.data.energy = 2.5
bpy.ops.object.light_add(type="SUN", location=(-4, 4, 6))
bpy.context.active_object.data.energy = 1.5

# Import STL (Blender 4.x+ uses wm.stl_import; 3.x used import_mesh.stl)
try:
    bpy.ops.wm.stl_import(filepath=out_stl)
except AttributeError:
    bpy.ops.import_mesh.stl(filepath=out_stl)
imported = list(bpy.context.selected_objects)
if not imported:
    imported = [o for o in bpy.data.objects if o.type == "MESH"]

def do_export():
    try:
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=False)
    except Exception as _e1:
        try:
            bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB")
        except Exception as _e2:
            traceback.print_exc(file=sys.stderr)
            raise RuntimeError(f"glTF export failed: {_e1} | {_e2}")

def do_render():
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out_png
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as _re:
        print("Render skip (OK):", _re, file=sys.stderr)

if not imported:
    # Nothing imported — export empty scene so the pipeline at least returns a GLB
    do_export()
    do_render()
else:
    objs = imported
    min_v = [1e9, 1e9, 1e9]
    max_v = [-1e9, -1e9, -1e9]
    for o in objs:
        for v in o.bound_box:
            min_v[0] = min(min_v[0], v[0])
            min_v[1] = min(min_v[1], v[1])
            min_v[2] = min(min_v[2], v[2])
            max_v[0] = max(max_v[0], v[0])
            max_v[1] = max(max_v[1], v[1])
            max_v[2] = max(max_v[2], v[2])

    cx = (min_v[0] + max_v[0]) / 2
    cy = (min_v[1] + max_v[1]) / 2
    cz = (min_v[2] + max_v[2]) / 2
    for o in objs:
        o.location.x -= cx
        o.location.y -= cy
        o.location.z -= cz

    size = max(max_v[0] - min_v[0], max_v[1] - min_v[1], max_v[2] - min_v[2], 1e-6)
    scale = 2.3 / size
    for o in objs:
        o.scale = (o.scale[0] * scale, o.scale[1] * scale, o.scale[2] * scale)

    mat = bpy.data.materials.new(name="Mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.35, 0.5, 0.9, 1)
        bsdf.inputs["Roughness"].default_value = 0.45
        bsdf.inputs["Metallic"].default_value = 0.15
    for o in objs:
        if len(o.data.materials) == 0:
            o.data.materials.append(mat)
        else:
            o.data.materials[0] = mat

    do_export()
    do_render()
`;

  const pyPath = path.join(tmpDir, "import_export.py");
  writeFile(pyPath, importPy);

  let blend = { stdout: "", stderr: "" };
  let blendErr = null;
  try {
    blend = await runCmd(CAD.blender, ["--background", "--python", pyPath]);
  } catch (e) {
    // GLB may still have been written before Blender hit the denoiser crash — check below.
    blendErr = e?.message || String(e);
    blend.stderr = blendErr;
  }

  const glbBase64 = await readBase64IfPresent(outGlb);
  const thumbnailBase64 = await readBase64IfPresent(outPng);

  if (!glbBase64 || glbBase64.length < MIN_GLB_B64) {
    cleanup(tmpDir);
    return {
      ok: false,
      glbBase64: "",
      thumbnailBase64,
      error: blendErr
        ? `OpenSCAD/Blender step failed and produced no GLB: ${blendErr.slice(0, 400)}`
        : "OpenSCAD/STL pipeline produced no usable GLB",
      stderr: (blend.stderr || "") + scadStderr,
    };
  }

  cleanup(tmpDir);
  return { ok: true, glbBase64, thumbnailBase64, error: null, stderr: blend.stderr || "" };
}

app.post("/render", async (req, res) => {
  const { generator, script, topic, paramsJson, scadSource, screenshot } = req.body || {};

  try {
    if (!generator) {
      return res.status(400).json({ success: false, error: "generator required" });
    }

    if (generator === "blender") {
      const out = await enqueue(() =>
        renderWithBlenderScript({
          scriptSource: script || "",
          screenshot,
        }),
      );
      if (!out.ok) {
        console.error("[render-worker] blender failed:", out.error, out.stderr?.slice?.(-500));
        return res.status(500).json({
          success: false,
          error: out.error,
          stderrTail: (out.stderr || "").slice(-1500),
        });
      }
      return res.json({ success: true, glbBase64: out.glbBase64, thumbnailBase64: out.thumbnailBase64 });
    }

    if (generator === "openscad") {
      const out = await enqueue(() =>
        exportFromOpenScadToGLB({
          scadSource: script || scadSource || "",
          screenshot,
        }),
      );
      if (!out.ok) {
        console.error("[render-worker] openscad failed:", out.error, out.stderr?.slice?.(-500));
        return res.status(500).json({
          success: false,
          error: out.error,
          stderrTail: (out.stderr || "").slice(-1500),
        });
      }
      return res.json({ success: true, glbBase64: out.glbBase64, thumbnailBase64: out.thumbnailBase64 });
    }

    return res.status(400).json({ success: false, error: `Unknown generator: ${generator}` });
  } catch (e) {
    console.error("[render-worker] error:", e);
    return res.status(500).json({ success: false, error: e?.message || "render failed" });
  }
});

app.get("/health", (_req, res) => {
  const cad = resolveCadBinaries();
  res.json({
    status: "ok",
    ok: true,
    blender: cad.blenderOk,
    openscad: cad.openscadOk,
    blenderPath: cad.blender,
    openscadPath: cad.openscad,
  });
});

app.listen(PORT, () => {
  console.log(`[render-worker] listening on :${PORT}`);
});

