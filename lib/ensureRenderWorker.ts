import { spawn } from "child_process";
import fs from "fs";
import os from "os";
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

/** True when a non-localhost worker URL is configured (required for Vercel/production). */
export function isRemoteWorkerConfigured(): boolean {
  const url = process.env.RENDER_WORKER_URL || "";
  if (!url) return false;
  return !url.includes("127.0.0.1") && !url.includes("localhost");
}

/** Serverless hosts (Vercel) cannot run Blender/OpenSCAD — only a remote worker works. */
export function isServerlessDeployment(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === "production";
}

export function workerUnavailableMessage(): string {
  if (isServerlessDeployment() && !isRemoteWorkerConfigured()) {
    return "High-quality CAD needs a hosted render worker on this deployment. Switch to Fast mode for a Three.js preview, or set RENDER_WORKER_URL in Vercel to a Railway/Fly worker running render-worker/.";
  }
  return "Render worker is not running. Run `pnpm dev` locally — it starts the CAD worker automatically.";
}

let spawnInFlight: Promise<boolean> | null = null;

async function pingOnce(timeoutMs: number): Promise<boolean> {
  for (const url of workerHealthUrls()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return true;
    } catch {
      /* try next url */
    }
  }
  return false;
}

/**
 * A single ping used to decide the worker was dead, but a cold render blocks the
 * worker's event loop for a beat while it reads/writes multi-hundred-KB files,
 * so one timed-out ping meant a healthy worker got reported as down. Retry a few
 * times with backoff before giving up.
 */
async function pingWorker(): Promise<boolean> {
  const delaysMs = [0, 400, 900];
  for (const delay of delaysMs) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (await pingOnce(4000)) return true;
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
    // Log to a file (not "ignore") so a crashing worker is diagnosable, and
    // PIN the port: the worker reads process.env.PORT, and Next.js dev often has
    // PORT set (e.g. 3000) in its environment, which would make the spawned
    // worker bind the wrong port so the :8787 health check never passes.
    const logPath = path.join(os.tmpdir(), "loomin-render-worker.log");
    let out: number;
    try {
      out = fs.openSync(logPath, "a");
    } catch {
      out = 1;
    }
    const workerPort = new URL(resolveRenderWorkerUrl()).port || "8787";
    const child = spawn(process.execPath, [workerScript], {
      detached: true,
      stdio: ["ignore", out, out],
      cwd: process.cwd(),
      env: { ...process.env, PORT: workerPort },
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
  // Vercel cannot spawn Blender/OpenSCAD — skip the 12s spawn wait when no remote URL is set.
  if (isServerlessDeployment() && !isRemoteWorkerConfigured()) return false;
  if (!spawnInFlight) {
    spawnInFlight = spawnWorkerOnce().finally(() => {
      spawnInFlight = null;
    });
  }
  return spawnInFlight;
}
