import fs from "fs";
import { execSync } from "child_process";

const MAC_BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MAC_OPENSCAD_CANDIDATES = [
  "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
  "/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD",
];

function which(cmd) {
  try {
    return execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Resolve CAD binaries — Homebrew casks on macOS, plain PATH on Linux/Docker. */
export function resolveCadBinaries() {
  const blenderPath = which("blender");
  const openscadPath = which("openscad");

  const blender =
    process.env.BLENDER_PATH ||
    blenderPath ||
    (fs.existsSync(MAC_BLENDER) ? MAC_BLENDER : "blender");

  const openscad =
    process.env.OPENSCAD_PATH ||
    openscadPath ||
    firstExisting(MAC_OPENSCAD_CANDIDATES) ||
    "openscad";

  return {
    blender,
    openscad,
    blenderOk: fs.existsSync(blender) || Boolean(blenderPath),
    openscadOk: fs.existsSync(openscad) || Boolean(openscadPath),
  };
}
