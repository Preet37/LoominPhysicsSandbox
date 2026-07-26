#!/usr/bin/env bash
# Start Next.js + render worker together (macOS/Linux, no Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -x "/Applications/Blender.app/Contents/MacOS/Blender" ]] && ! command -v blender >/dev/null 2>&1; then
  echo ""
  echo "⚠️  CAD tools not installed — High Quality 3D will not work."
  echo "    Run once: pnpm setup:cad"
  echo ""
  exec pnpm dev:next
fi

if [[ ! -d "$ROOT/render-worker/node_modules" ]]; then
  (cd "$ROOT/render-worker" && npm install --omit=dev)
fi

STARTED_WORKER=0
WORKER_PID=""

cleanup() {
  if [[ "$STARTED_WORKER" == "1" && -n "$WORKER_PID" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -sf "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
  echo "[dev] render worker already running on :8787"
else
  echo "[dev] starting render worker on :8787..."
  node "$ROOT/render-worker/server.js" &
  WORKER_PID=$!
  STARTED_WORKER=1
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
      echo "[dev] render worker ready"
      break
    fi
    sleep 0.25
  done
  if ! curl -sf "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
    echo "[dev] WARNING: render worker did not become ready — High Quality 3D may fail"
  fi
fi

exec pnpm dev:next
