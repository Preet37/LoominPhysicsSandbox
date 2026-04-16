import express from "express";
import fs from "fs";
import { spawn } from "child_process";
import os from "os";
import path from "path";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

function base64File(p) {
  return fs.readFileSync(p).toString("base64");
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
  const pyPath = path.join(tmpDir, "script.py");
  writeFile(pyPath, scriptSource);

  const outGlb = "/tmp/output.glb";
  const outPng = "/tmp/thumbnail.png";
  // Clean old outputs if any
  try {
    fs.rmSync(outGlb, { force: true });
    fs.rmSync(outPng, { force: true });
  } catch {}

  let blend = { stdout: "", stderr: "" };
  let blendError = null;
  try {
    blend = await runCmd("blender", ["--background", "--python", pyPath]);
  } catch (e) {
    // Exit code non-zero is common when Cycles denoiser/GPU init fails in headless Docker,
    // even though the GLB export may have already been written successfully.
    // Do NOT bail here — check if the output file exists first.
    blendError = e?.message || String(e);
    blend.stderr = blendError;
  }

  const glbBase64 =
    fs.existsSync(outGlb) && fs.statSync(outGlb).size > 0 ? base64File(outGlb) : "";
  const thumbnailBase64 =
    fs.existsSync(outPng) && fs.statSync(outPng).size > 0 ? base64File(outPng) : "";

  if (!glbBase64 || glbBase64.length < MIN_GLB_B64) {
    const hint = blendError
      ? `Blender exited with error and /tmp/output.glb is missing or empty: ${blendError.slice(0, 400)}`
      : "Blender finished but /tmp/output.glb is missing or too small. Script must call bpy.ops.export_scene.gltf(filepath='/tmp/output.glb', export_format='GLB').";
    return {
      ok: false,
      glbBase64: "",
      thumbnailBase64,
      error: hint,
      stderr: blend.stderr || "",
    };
  }

  // GLB exists — success regardless of Blender's exit code
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

  const outStl = "/tmp/output.stl";
  const outGlb = "/tmp/output.glb";
  const outPng = "/tmp/thumbnail.png";

  try {
    fs.rmSync(outStl, { force: true });
    fs.rmSync(outGlb, { force: true });
    fs.rmSync(outPng, { force: true });
  } catch {}

  // 1) Compile scad → STL
  // binstl tends to be smaller/faster than ascii; it's still importable by Blender.
  let scadStderr = "";
  try {
    const o = await runCmd("openscad", ["-o", outStl, "--export-format", "binstl", scadPath]);
    scadStderr = o.stderr || "";
  } catch (e) {
    return {
      glbBase64: "",
      thumbnailBase64: "",
      ok: false,
      error: e?.message || String(e),
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

# Import STL
bpy.ops.import_mesh.stl(filepath=out_stl)
imported = bpy.context.selected_objects

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
    blend = await runCmd("blender", ["--background", "--python", pyPath]);
  } catch (e) {
    // GLB may still have been written before Blender hit the denoiser crash — check below.
    blendErr = e?.message || String(e);
    blend.stderr = blendErr;
  }

  const glbBase64 =
    fs.existsSync(outGlb) && fs.statSync(outGlb).size > 0 ? base64File(outGlb) : "";
  const thumbnailBase64 =
    fs.existsSync(outPng) && fs.statSync(outPng).size > 0 ? base64File(outPng) : "";

  if (!glbBase64 || glbBase64.length < MIN_GLB_B64) {
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

  return { ok: true, glbBase64, thumbnailBase64, error: null, stderr: blend.stderr || "" };
}

app.post("/render", async (req, res) => {
  const { generator, script, topic, paramsJson, scadSource, screenshot } = req.body || {};

  try {
    if (!generator) {
      return res.status(400).json({ success: false, error: "generator required" });
    }

    if (generator === "blender") {
      const out = await renderWithBlenderScript({
        scriptSource: script || "",
        screenshot,
      });
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
      const out = await exportFromOpenScadToGLB({
        scadSource: script || scadSource || "",
        screenshot,
      });
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

app.listen(PORT, () => {
  console.log(`[render-worker] listening on :${PORT}`);
});

