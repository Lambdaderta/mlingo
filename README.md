# MLingo

Темный PWA-тренажер для ручного ML-кода: короткие упражнения по CV, PyTorch, валидации, метрикам, NumPy/Pandas и бустингу.

## Запуск локально без backend

```bash
cd /Users/lambda/projects/ioai/mlingo
python3 -m http.server 4175
```

Открыть:

```text
http://127.0.0.1:4175/
```

В этом режиме прогресс хранится только в `localStorage`.

## Запуск с backend, аккаунтами и базой

Backend написан на Python stdlib + SQLite, без внешних зависимостей:

```bash
cd /Users/lambda/projects/ioai/mlingo
python3 server.py --port 4180
```

Открыть:

```text
http://127.0.0.1:4180/
```

Что хранится в `mlingo.db`:

- пользователи;
- сессии;
- полный JSON прогресса;
- XP, стрик, число пройденных уроков, ошибки;
- события прохождения уроков;
- leaderboard.

API:

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/progress`
- `PUT /api/progress`
- `POST /api/event`
- `GET /api/leaderboard`

## Что внутри

- `index.html` — оболочка приложения.
- `styles.css` — desktop/mobile layout, темный интерфейс в стиле `#1E1E1E`.
- `app.js` — все темы, упражнения, прогресс, стрик, очередь уроков.
- `server.py` — API, аккаунты, SQLite, leaderboard.
- `manifest.webmanifest` — PWA-настройки для установки на телефон.
- `service-worker.js` — offline/cache для PWA.
- `.nojekyll` — отключает Jekyll на GitHub Pages, чтобы статические файлы отдавались как есть.
- `CONTRIBUTING.md` — как добавлять упражнения и готовить PR.
- `LICENSE` — MIT-лицензия для open-source запуска.

## Обучающий формат

Внутри есть несколько типов упражнений:

- `choice`, `order`, `fill`, `bug` — короткий вход без усталости от набора.
- `fix`, `write` — ручная правка и написание кода, сложность 3-5.
- Богатые подсказки: кнопка `Подсказка` показывает не только намек, но и мини-словарь терминов вроде `Dice`, `IoU`, `OOF`, `logits`, `leakage`.
- Адаптивная сложность: новые уровни в теме открываются по мере прохождения.

## Desktop-макеты

Кнопка `Макет` переключает рабочие компоновки:

- `курс` — широкий учебный экран с дорожной картой и панелями снизу.
- `практика` — lesson-first режим: фокус на текущем упражнении.
- `студия` — плотный трехколоночный workspace.

## Мобильная версия

Приложение уже работает как PWA:

- адаптивная верстка под телефон;
- нижняя навигация;
- `manifest.webmanifest` для установки;
- service worker для кэша;
- локальный прогресс хранится в `localStorage`.

На iPhone/Android после деплоя на HTTPS открой сайт и добавь на главный экран:

- iOS Safari: `Share` → `Add to Home Screen`;
- Android Chrome: меню → `Install app` или `Add to Home screen`.

## Деплой на GitHub Pages

GitHub Pages подходит только для frontend/PWA без backend. Он не запускает Python/Node сервер и не дает базу данных.

Самый простой static-only путь:

1. Создать репозиторий на GitHub, например `mlingo`.
2. Положить содержимое папки `mlingo/` в корень репозитория.
3. Запушить в ветку `main`.
4. На GitHub открыть `Settings` → `Pages`.
5. В `Build and deployment` выбрать `Deploy from a branch`.
6. Выбрать `main` и папку `/root`, затем `Save`.

После публикации сайт будет доступен примерно так:

```text
https://USERNAME.github.io/mlingo/
```

Если проект будет лежать не в корне репозитория, а в папке `docs/`, в настройках Pages выбери `main` + `/docs`.

## Деплой с backend

Для аккаунтов и базы нужен отдельный backend-хостинг:

- Render / Railway / Fly.io — проще всего для `server.py` + SQLite на persistent disk.
- VPS — максимально контролируемо.
- Supabase/Firebase — если хочешь готовую авторизацию и managed database, но тогда backend-код надо переписать под их API.

Варианты архитектуры:

1. Frontend и backend вместе на одном Python-сервере: проще всего, `python3 server.py`, один домен, PWA работает без CORS-боли.
2. Frontend на GitHub Pages, backend на Render/Railway/Fly: нужно указать `window.MLINGO_API_BASE = "https://your-api.example.com"` перед подключением `app.js`.

Для продакшена лучше не держать SQLite на ephemeral filesystem. Нужен persistent disk или Postgres.

## Open source

Проект можно выкладывать на GitHub как обычный open-source репозиторий. Минимальный набор уже есть:

- MIT license;
- contributing guide;
- PWA manifest;
- backend без внешних зависимостей;
- static-only режим для GitHub Pages;
- backend режим для аккаунтов, стриков и leaderboard.

## Нативное мобильное приложение

Для личного пользования PWA обычно достаточно. Если захочется именно `.apk` или iOS-wrapper, следующий шаг — обернуть эту же статическую версию через Capacitor:

```text
npm create @capacitor/app
npx cap add android
npx cap add ios
npx cap sync
```

Это уже отдельный слой сборки, но сам UI и логика останутся теми же.
