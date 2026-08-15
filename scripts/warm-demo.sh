#!/usr/bin/env bash
# Warm both model pipelines for a live demo.
#
# Run this AFTER the final `pnpm dev` restart and BEFORE presenting. The Tripo
# route caches in memory, so every restart empties it and the first request for
# a topic pays the full ~90s generation again — on stage.
#
#   bash scripts/warm-demo.sh
#
# Topics are the ones the demo actually types. Add yours to either list.
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"

# Long-tail topics with no hand-built component — these exercise OpenSCAD/Blender.
CAD_TOPICS=("pulley system" "trebuchet" "hydraulic press" "bicycle disc brake")

# Photoreal topics — these must be the journal names you actually open, because
# the topic string is what reaches Tripo. The prompt below MUST stay identical to
# what Tripo3DModel.jsx sends, since the route keys its cache on the prompt.
# ~90s and 20 credits each, so keep the list to what you will really demo.
TRIPO_TOPICS=("formula one race car" "airplane" "guitar" "iphone")

fail=0

echo "Checking services..."
curl -sf "$BASE" >/dev/null || { echo "  ✗ Next.js is not answering on $BASE — run: pnpm dev"; exit 1; }
echo "  ✓ Next.js"
if curl -sf http://127.0.0.1:8787/health >/dev/null 2>&1; then
  echo "  ✓ render worker (:8787)"
else
  echo "  ✗ render worker down — CAD topics will fail. Run: pnpm dev:worker"
  fail=1
fi

echo
echo "Warming CAD geometry..."
for t in "${CAD_TOPICS[@]}"; do
  out=$(curl -s -X POST "$BASE/api/geometry-render" \
    -H 'Content-Type: application/json' \
    -d "{\"topic\":\"$t\",\"simType\":\"mechanics\"}" --max-time 180)
  if printf '%s' "$out" | grep -q '"success":true'; then
    echo "  ✓ $t"
  else
    echo "  ✗ $t — $(printf '%s' "$out" | head -c 160)"
    fail=1
  fi
done

echo
echo "Warming Tripo meshes (~90s each, 20 credits each)..."
for t in "${TRIPO_TOPICS[@]}"; do
  # `topic` must be sent exactly as the editor sends it — it is the library key,
  # and a mismatch silently stores the model under a name nothing looks up.
  out=$(curl -s -X POST "$BASE/api/generate-3d" \
    -H 'Content-Type: application/json' \
    -d "{\"topic\":\"$t\",\"prompt\":\"High quality 3D model of $t, detailed, realistic\",\"style\":\"realistic\"}" \
    --max-time 280)
  if printf '%s' "$out" | grep -q '"success":true'; then
    echo "  ✓ $t"
  else
    echo "  ✗ $t — $(printf '%s' "$out" | head -c 160)"
    fail=1
  fi
done

echo
if [[ "$fail" == "0" ]]; then
  echo "All warm. Typing these topics in the editor now renders instantly."
else
  echo "Some topics failed — see above. Do not demo the ones marked ✗."
fi
exit "$fail"
