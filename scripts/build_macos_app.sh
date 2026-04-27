#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
APP_DIR="$ROOT_DIR/dist/MLingo.app"
WEB_DIR="$APP_DIR/Contents/Resources/web"

cd "$ROOT_DIR"
npm run cap:prepare

rm -rf "$APP_DIR" "$ROOT_DIR/dist/MLingo-v$APP_VERSION-macOS.zip"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$WEB_DIR"
mkdir -p "$ROOT_DIR/.build/clang-module-cache"

CLANG_MODULE_CACHE_PATH="$ROOT_DIR/.build/clang-module-cache" clang \
  -fobjc-arc \
  "$ROOT_DIR/macos/MLingoApp.m" \
  -o "$APP_DIR/Contents/MacOS/MLingo" \
  -framework Cocoa \
  -framework WebKit

cp "$ROOT_DIR/macos/Info.plist" "$APP_DIR/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" "$APP_DIR/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $APP_VERSION" "$APP_DIR/Contents/Info.plist"
cp "$ROOT_DIR/macos/MLingo.icns" "$APP_DIR/Contents/Resources/MLingo.icns"
cp "$ROOT_DIR/index.html" "$ROOT_DIR/app.js" "$ROOT_DIR/styles.css" "$ROOT_DIR/service-worker.js" "$ROOT_DIR/manifest.webmanifest" "$ROOT_DIR/icon.svg" "$WEB_DIR/"
mkdir -p "$WEB_DIR/assets/brand"
cp "$ROOT_DIR/assets/brand/mlingo-cat-logo-512.png" "$WEB_DIR/assets/brand/mlingo-cat-logo-512.png"
mkdir -p "$WEB_DIR/lesson-packs"
cp "$ROOT_DIR"/lesson-packs/*.json "$WEB_DIR/lesson-packs/"

(
  cd "$ROOT_DIR/dist"
  ditto -c -k --sequesterRsrc --keepParent "MLingo.app" "MLingo-v$APP_VERSION-macOS.zip"
)

echo "Built $APP_DIR"
echo "Built $ROOT_DIR/dist/MLingo-v$APP_VERSION-macOS.zip"
