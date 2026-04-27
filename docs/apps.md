# Приложения MLingo

MLingo работает как offline-first web app и может быть упакован в нативные оболочки для Android и macOS.

## Архитектура

```text
Frontend: index.html + app.js + styles.css
Банк заданий: встроенные уроки + lesson-packs/*.json
Кэш прогресса на устройстве: localStorage
GitHub-прогресс: backend repo mode или local token + GitHub Contents API
Облачный прогресс: GitHub OAuth + Python API + PostgreSQL
Android: Capacitor wrapper с immersive mode
macOS: native AppKit + WKWebView wrapper
```

Вход обязателен перед уроками и идет только через GitHub. Для OAuth нужны `GITHUB_CLIENT_ID` и `GITHUB_CLIENT_SECRET` на backend; кнопка GitHub создает или открывает аккаунт MLingo автоматически. Кэш уроков и прогресса остается на устройстве, но локальных password-профилей в приложении больше нет.

## Android APK

Требования на macOS:

```bash
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Установка пакетов Android SDK:

```bash
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

Сборка debug APK:

```bash
npm install
npm run android:debug
```

Результат:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Перед публикацией сборки:

```bash
npm test
npm run check
npm run android:debug
npm run android:test
```

Установка на подключенный телефон:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

При открытии APK приложение включает fullscreen/immersive mode. Системные кнопки “домой/назад” и панели Android скрываются до свайпа от края экрана.

## macOS App

Локальная сборка:

```bash
npm install
npm run macos:build
```

Результат:

```text
dist/MLingo.app
dist/MLingo-v0.1.4-macOS.zip
```

Это unsigned build. При первом запуске macOS может попросить подтвердить открытие приложения из внешнего источника.

## GitHub Releases для приложений

APK и macOS zip не нужно хранить в git. Workflow `.github/workflows/release-apk.yml` публикует оба артефакта в GitHub Release.

Сделать новый релиз:

```bash
git tag -a v0.1.4 -m "MLingo v0.1.4"
git push origin v0.1.4
```

После завершения GitHub Actions файл появится здесь:

```text
GitHub repo -> Releases -> v0.1.4 -> Assets
```

Если tag уже существует, можно открыть `Actions -> release-apps -> Run workflow`, вписать tag, например `v0.1.4`, и workflow перезальет APK/macOS zip в существующий Release.

Важно: это debug APK, его можно ставить друзьям для теста, но для Play Store позже понадобится release signing key и release build.

## Проверка обновлений

В профиле есть блок `Обновления`. Он читает `https://api.github.com/repos/Lambdaderta/mlingo/releases/latest`, сравнивает версию приложения с последним tag и показывает ссылки на APK/macOS assets.

## Синхронизация заданий из GitHub

Паки заданий лежат в репозитории:

```text
lesson-packs/index.json
lesson-packs/*.json
```

В приложении открой `Шпаргалки -> Паки заданий` и синхронизируй URL:

```text
https://raw.githubusercontent.com/Lambdaderta/mlingo/main/lesson-packs/index.json
```

После успешной синхронизации приложение сохраняет packs в `localStorage`. Дальше эти задания доступны оффлайн.
