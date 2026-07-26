import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const DEFAULT_RENDER_WORKER_URL = "http://127.0.0.1:8787/render";

function workerHealthUrls(): string[] {
  const render = process.env.RENDER_WORKER_URL || DEFAULT_RENDER_WORKER_URL;
  const fromEnv = render.replace(/\/render\/?$/, "/health");
  return [
    fromEnv,
    "http://127.0.0.1:8787/health",
    "http://localhost:8787/health",
  ];
}

export function resolveRenderWorkerUrl(): string {
  return process.env.RENDER_WORKER_URL || DEFAULT_RENDER_WORKER_URL;
}

let spawnInFlight: Promise<boolean> | null = null;

async function pingWorker(): Promise<boolean> {
  for (const url of workerHealthUrls()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function cadToolsPresent(): boolean {
  if (process.env.BLENDER_PATH && fs.existsSync(process.env.BLENDER_PATH)) return true;
  const candidates = [
    "/opt/homebrew/bin/blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
  ];
  return candidates.some((p) => fs.existsSync(p));
}

/** Best-effort: start render-worker/server.js if CAD tools exist and nothing listens on :8787. */
async function spawnWorkerOnce(): Promise<boolean> {
  if (!cadToolsPresent()) return false;

  const workerScript = path.join(process.cwd(), "render-worker", "server.js");
  if (!fs.existsSync(workerScript)) return false;

  const nodeModules = path.join(process.cwd(), "render-worker", "node_modules");
  if (!fs.existsSync(nodeModules)) return false;

  try {
    const child = spawn(process.execPath, [workerScript], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: { ...process.env },
    });
    child.unref();
  } catch {
    return false;
  }

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await pingWorker()) {
      console.log("[geometry-render] auto-started render worker on :8787");
      return true;
    }
  }
  return false;
}

/** Ensure the local render worker is reachable (used by /api/geometry-render). */
export async function ensureRenderWorker(): Promise<boolean> {
  if (await pingWorker()) return true;
  if (!spawnInFlight) {
    spawnInFlight = spawnWorkerOnce().finally(() => {
      spawnInFlight = null;
    });
  }
  return spawnInFlight;
}
