# MLingo

![MLingo](assets/brand/mlingo-readme-card.png)

MLingo — тренажер для практики ML-кода руками. Проект собирает короткие упражнения по NumPy, Pandas, PyTorch, computer vision, segmentation, validation, boosting, recommender systems, transformers и diffusion basics.

Цель проекта — прокачивать не только знание идей, но и привычку быстро писать рабочий код в contest-style условиях: без бесконечного контекста, без готовых шаблонов и без слепого копирования.

## Возможности

- Короткие интерактивные задания: выбор ответа, порядок строк, пропуски, поиск бага, исправление кода, ручное написание кода и свободный разбор идеи.
- Дорожные карты по темам, профиль, опыт, стрики и локальный прогресс.
- Offline-first режим: приложение продолжает работать с уже загруженными заданиями.
- JSON-паки заданий: банк задач можно расширять без пересборки приложения.
- Импорт и синхронизация паков из GitHub raw URL.
- Опциональная интеграция с GitHub для сохранения прогресса и решений в отдельный репозиторий.
- Опциональный backend на Python + PostgreSQL для аккаунтов, синхронизации, leaderboard и будущих review-механик.
- PWA, Android shell через Capacitor и macOS shell на WKWebView.

## Быстрый запуск

Статический запуск без backend:

```bash
python3 -m http.server 4173
```

После запуска откройте:

```text
http://127.0.0.1:4173/
```

Запуск с backend и PostgreSQL:

```bash
docker compose up --build
```

Приложение будет доступно на:

```text
http://localhost:4180/
```

## Запуск Backend Без Docker

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 server.py --port 4180
```

Основные переменные окружения:

- `DATABASE_URL` — строка подключения к PostgreSQL.
- `MLINGO_ALLOWED_ORIGIN` — origin frontend-приложения.
- `PORT` — порт backend, по умолчанию `4180`.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth App.
- `GITHUB_OAUTH_REDIRECT_URI` — callback URL GitHub OAuth.
- `GITHUB_SOLUTIONS_REPO_NAME` — репозиторий для сохранения решений, по умолчанию `mlingo-solutions`.

## Пакеты Заданий

Bundled-паки лежат в [lesson-packs](lesson-packs):

- `cv-offline-pack.json` — CV пайплайны, segmentation, classification и идейные задачи.
- `cv-fundamentals-pack.json` — image IO, masks, bbox, transforms, CNN/U-Net basics.
- `recsys-rerank-pack.json` — candidate generation, reranking, ranking metrics и leakage-safe validation.
- `dl-advanced-pack.json` — transformers, diffusion, RL basics и training tricks.
- `contest-expansion-pack.json` — дополнительные contest-задачи по CV, recsys и deep learning.

Индекс паков хранится в [lesson-packs/index.json](lesson-packs/index.json). Формат описан в [docs/lesson-packs.md](docs/lesson-packs.md).

## GitHub Sync

MLingo умеет сохранять прогресс и решения в GitHub-репозиторий пользователя. Сейчас доступны два режима:

- serverless token mode — fine-grained token хранится локально в браузере;
- backend repo mode — OAuth и запись решений проходят через backend.

Подробнее: [docs/github-sync.md](docs/github-sync.md).

## Сборка Приложений

Android debug APK:

```bash
npm install
npm run android:debug
```

APK появится в:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

macOS app:

```bash
npm install
npm run macos:build
```

Артефакты появятся в `dist/`.

Подробности по APK, macOS build и GitHub Releases: [docs/apps.md](docs/apps.md).

## Проверки

```bash
npm test
npm run check
```

`npm test` проверяет синтаксис frontend, Python backend, JSON-паки, разрешенные библиотеки, PWA-контракты и базовую структуру приложения.

`npm run check` дополнительно собирает Capacitor web bundle и запускает smoke-тест локального сайта.

## Структура

- [index.html](index.html) — HTML-оболочка приложения.
- [styles.css](styles.css) — стили desktop/mobile интерфейса.
- [app.js](app.js) — логика приложения, упражнения, прогресс и offline режим.
- [lesson-packs](lesson-packs) — JSON-паки заданий.
- [server.py](server.py) — backend API, GitHub OAuth, PostgreSQL, leaderboard и review queue.
- [android](android) — Capacitor Android shell.
- [macos](macos) — macOS WKWebView shell.
- [docs](docs) — документация по пакам, приложениям, GitHub sync и деплою.
- [assets/brand](assets/brand) — брендовые ассеты проекта.

## Контрибьютинг

Перед добавлением задач прочитайте [CONTRIBUTING.md](CONTRIBUTING.md) и список разрешенных библиотек в [docs/allowed-libraries.md](docs/allowed-libraries.md).

Задания должны быть воспроизводимыми без интернета и без скачивания pretrained weights. Если задача требует внешние данные, они должны быть явно описаны или поставляться вместе с контестом.
