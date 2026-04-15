#!/usr/bin/env bash
# Regenerate docs/demo.gif from a fresh simulator run.
#
# Steps:
#   1. Runs the Playwright capture test (tests/capture-demo-gif.spec.ts), which
#      launches the app, skips to all-hands, waits for the next predictive work-order
#      event, and dumps 150 PNG frames (10s @ 15fps) into scripts/frames/.
#   2. Stitches the frames into an optimized, palette-quantized GIF at docs/demo.gif.
#   3. Removes the intermediate frame directory.
#
# Requirements: ffmpeg on PATH, Playwright browsers installed (npx playwright install chromium).
# The Playwright config auto-starts `npm run dev`, so you don't need the server running.
#
# Usage:
#   ./scripts/generate-demo-gif.sh              # default output: docs/demo.gif
#   ./scripts/generate-demo-gif.sh path/out.gif # custom output path

set -euo pipefail

OUT="${1:-docs/demo.gif}"
FRAMES_DIR="scripts/frames"

# Move to repo root (script may be invoked from anywhere).
cd "$(dirname "$0")/.."

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found on PATH (install with 'brew install ffmpeg')." >&2
  exit 1
fi

echo "==> Capturing frames (this takes ~45-90s — waits for a predictive WO event)"
npx playwright test capture-demo-gif --project=chromium --reporter=list

if [ ! -d "$FRAMES_DIR" ] || [ -z "$(ls -A "$FRAMES_DIR" 2>/dev/null)" ]; then
  echo "error: no frames produced at $FRAMES_DIR" >&2
  exit 1
fi

echo "==> Encoding GIF -> $OUT"
mkdir -p "$(dirname "$OUT")"
ffmpeg -y -framerate 15 -i "$FRAMES_DIR/frame_%04d.png" \
  -vf "scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
  -loop 0 "$OUT"

echo "==> Cleaning up frames"
rm -rf "$FRAMES_DIR"

SIZE=$(ls -lh "$OUT" | awk '{print $5}')
echo "==> Done. $OUT ($SIZE)"
