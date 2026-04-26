# MLingo apps

MLingo is designed as an offline-first web app that can also be wrapped as native apps.

## Current architecture

```text
Core app: index.html + app.js + styles.css
Lesson bank: built-in lessons + lesson-packs/*.json
Progress: localStorage by default
Online backend: optional Postgres API sync
Native shell: Capacitor Android wrapper
```

This means the app works without a network connection. Accounts can be local-only now; hosted cloud sync can be enabled later without changing the lesson format.

## Android APK

Prerequisites on macOS:

```bash
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Install Android SDK packages:

```bash
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

Build debug APK:

```bash
npm install
npm run android:debug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Before shipping a build, run:

```bash
npm test
npm run check
npm run android:debug
npm run android:test
```

Install to a connected phone:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## macOS app options

Fastest useful option: install the PWA from Chrome/Safari once the site is hosted. It will cache lessons and progress locally.

Native wrapper options:

```text
1. Tauri: small desktop app, good long-term choice.
2. Electron: easiest if we want Node APIs, heavier binary.
3. WKWebView Swift shell: very lightweight, more native work.
```

Recommended next step: keep the core app as PWA + Capacitor Android first. Add Tauri later if a real `.app` bundle is needed.

## GitHub lesson sync

Keep packs in GitHub under:

```text
lesson-packs/index.json
lesson-packs/*.json
```

In the app, open `Шпаргалки -> Паки заданий`, then sync from:

```text
https://raw.githubusercontent.com/Lambdaderta/mlingo/main/lesson-packs/index.json
```

The app stores synced packs locally. After one sync, the lessons are available offline.
