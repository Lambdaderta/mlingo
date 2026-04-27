# Приложения MLingo

MLingo работает как offline-first web app и может быть упакован в нативную оболочку для Android через Capacitor.

## Архитектура

```text
Frontend: index.html + app.js + styles.css
Банк заданий: встроенные уроки + lesson-packs/*.json
Локальный прогресс: localStorage
Облачный прогресс: Python API + PostgreSQL
Android: Capacitor wrapper с immersive mode
```

Приложение остается работоспособным без сети. Сейчас можно использовать локальные оффлайн-профили; после деплоя на домен тот же frontend сможет синхронизировать прогресс через backend.

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

## GitHub Releases для APK

APK не нужно хранить в git. В репе есть workflow `.github/workflows/release-apk.yml`: он собирает Android debug APK и прикрепляет его к GitHub Release.

Сделать новый релиз:

```bash
git tag -a v0.1.0 -m "MLingo v0.1.0"
git push origin v0.1.0
```

После завершения GitHub Actions файл появится здесь:

```text
GitHub repo -> Releases -> v0.1.0 -> Assets -> MLingo-v0.1.0-debug.apk
```

Если tag уже существует, можно открыть `Actions -> release-apk -> Run workflow`, вписать tag, например `v0.1.0`, и workflow перезальет APK в существующий Release.

Важно: это debug APK, его можно ставить друзьям для теста, но для Play Store позже понадобится release signing key и release build.

## Варианты для macOS

Самый быстрый вариант — установить PWA из Chrome или Safari после деплоя сайта на HTTPS. Приложение будет кэшировать интерфейс, задания и локальный прогресс.

Варианты нативной оболочки:

```text
1. Tauri: легкое desktop-приложение, хороший долгосрочный вариант.
2. Electron: проще всего, если нужны Node API, но бинарник тяжелее.
3. WKWebView Swift shell: минимальная нативная оболочка, больше ручной работы.
```

Рекомендуемый порядок: сначала PWA и Android APK, затем Tauri, если понадобится полноценный `.app` bundle.

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
