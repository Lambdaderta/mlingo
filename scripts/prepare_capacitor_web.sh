#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/web"

rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR/lesson-packs" "$WEB_DIR/assets/brand"

cp "$ROOT/index.html" "$WEB_DIR/index.html"
cp "$ROOT/app.js" "$WEB_DIR/app.js"
cp "$ROOT/styles.css" "$WEB_DIR/styles.css"
cp "$ROOT/service-worker.js" "$WEB_DIR/service-worker.js"
cp "$ROOT/manifest.webmanifest" "$WEB_DIR/manifest.webmanifest"
cp "$ROOT/icon.svg" "$WEB_DIR/icon.svg"
cp "$ROOT/assets/brand/mlingo-cat-logo-512.png" "$WEB_DIR/assets/brand/mlingo-cat-logo-512.png"
cp "$ROOT/lesson-packs/"*.json "$WEB_DIR/lesson-packs/"

echo "Prepared Capacitor web assets in $WEB_DIR"
