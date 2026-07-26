#!/usr/bin/env bash
# Native CAD setup for macOS (no Docker required).
# Installs Blender + OpenSCAD via Homebrew and starts the render worker deps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Loomin CAD setup (macOS native)"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install from https://brew.sh then re-run."
  exit 1
fi

install_cask() {
  local cask="$1"
  if brew list --cask "$cask" >/dev/null 2>&1; then
    echo "  ✓ $cask already installed"
  else
    echo "  → installing $cask (may take several minutes)..."
    brew install --cask "$cask"
  fi
}

echo "→ Checking Blender (required for GLB export)..."
install_cask blender

echo "→ Checking OpenSCAD (required for parametric models)..."
install_cask openscad

# Homebrew cask OpenSCAD is deprecated on Gatekeeper — remove quarantine so CLI works.
for app in /Applications/OpenSCAD*.app; do
  if [[ -d "$app" ]]; then
    echo "  → clearing Gatekeeper quarantine on $(basename "$app")..."
    xattr -cr "$app" 2>/dev/null || true
  fi
done

echo "→ Render worker npm deps..."
cd "$ROOT/render-worker"
npm install --omit=dev

BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
OPENSCAD="$(command -v openscad || true)"

if [[ ! -x "$BLENDER" ]] && ! command -v blender >/dev/null 2>&1; then
  echo "ERROR: Blender not found. Re-run: brew install --cask blender"
  exit 1
fi
if [[ -z "$OPENSCAD" ]] || [[ ! -x "$OPENSCAD" ]]; then
  echo "ERROR: OpenSCAD not found. Re-run: brew install --cask openscad"
  exit 1
fi

echo ""
echo "✓ CAD tools ready"
echo "  Blender:  $(command -v blender || echo "$BLENDER")"
echo "  OpenSCAD: $OPENSCAD"
echo ""
echo "Start the render worker (keep this running):"
echo "  pnpm dev:worker"
echo ""
echo "In another terminal, start the app:"
echo "  pnpm dev"
