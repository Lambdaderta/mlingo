#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
APP_DIR="$ROOT_DIR/dist/MLingo.app"
DMG_ROOT="$ROOT_DIR/dist/dmg-root"
DMG_PATH="$ROOT_DIR/dist/MLingo-v$APP_VERSION-macOS.dmg"
ZIP_PATH="$ROOT_DIR/dist/MLingo-v$APP_VERSION-macOS.zip"
WEB_DIR="$APP_DIR/Contents/Resources/web"

cd "$ROOT_DIR"
npm run cap:prepare

rm -rf "$APP_DIR" "$DMG_ROOT" "$DMG_PATH" "$ZIP_PATH"
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
cp "$ROOT_DIR/index.html" "$ROOT_DIR/app.js" "$ROOT_DIR/styles.css" "$ROOT_DIR/service-worker.js" "$ROOT_DIR/manifest.webmanifest" "$ROOT_DIR/icon.svg" "$ROOT_DIR/python-runner-worker.js" "$WEB_DIR/"
mkdir -p "$WEB_DIR/assets/brand"
cp "$ROOT_DIR/assets/brand/mlingo-cat-logo-512.png" "$WEB_DIR/assets/brand/mlingo-cat-logo-512.png"
mkdir -p "$WEB_DIR/lesson-packs"
cp "$ROOT_DIR"/lesson-packs/*.json "$WEB_DIR/lesson-packs/"
if [ -d "$ROOT_DIR/vendor/pyodide" ]; then
  mkdir -p "$WEB_DIR/vendor"
  cp -R "$ROOT_DIR/vendor/pyodide" "$WEB_DIR/vendor/pyodide"
fi

if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_DIR"
  codesign --verify --deep --strict "$APP_DIR"
fi

if command -v hdiutil >/dev/null 2>&1; then
  mkdir -p "$DMG_ROOT"
  cp -R "$APP_DIR" "$DMG_ROOT/MLingo.app"
  ln -s /Applications "$DMG_ROOT/Applications"
  if ! hdiutil create -volname "MLingo" -srcfolder "$DMG_ROOT" -ov -format UDZO "$DMG_PATH"; then
    echo "hdiutil failed; building zip fallback" >&2
    (cd "$ROOT_DIR/dist" && ditto -c -k --sequesterRsrc --keepParent "MLingo.app" "$ZIP_PATH")
  fi
  rm -rf "$DMG_ROOT"
else
  echo "hdiutil not found; building zip fallback" >&2
  (cd "$ROOT_DIR/dist" && ditto -c -k --sequesterRsrc --keepParent "MLingo.app" "$ZIP_PATH")
fi

echo "Built $APP_DIR"
if [ -f "$DMG_PATH" ]; then
  echo "Built $DMG_PATH"
fi
if [ -f "$ZIP_PATH" ]; then
  echo "Built $ZIP_PATH"
fi
