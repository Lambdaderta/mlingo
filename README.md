# MLingo

MLingo — темный offline-first тренажер для ручного ML-кода. Проект помогает готовиться к олимпиадам и коротким ML-контестам: задачи маленькие, но проверяют реальные навыки — PyTorch loops, CV, segmentation, validation, leakage, metrics, NumPy/Pandas, boosting, recsys и reranking.

Код открыт для чтения, обучения и контрибьютов. Основной публичный инстанс предполагается один: сайт владельца проекта с аккаунтами, прогрессом, стриками и таблицей лидеров.

## Возможности

- PWA-интерфейс для desktop и mobile.
- Оффлайн-профили и локальное сохранение прогресса.
- Опциональный backend на Python + PostgreSQL для аккаунтов, синхронизации и leaderboard.
- JSON-паки заданий, которые можно хранить в GitHub и подгружать без пересборки приложения.
- Android APK через Capacitor.
- GitHub Actions для проверок и публикации APK в GitHub Releases.
- Типы упражнений: выбор ответа, порядок строк, пропуски, поиск бага, исправление кода, ручное написание кода и свободный разбор идеи.

## Быстрый запуск

Рекомендуемый локальный запуск с backend и PostgreSQL:

```bash
docker compose up --build
```

После запуска приложение доступно по адресу:

```text
http://localhost:4180/
```

Docker Compose поднимает:

- `app` — Python backend и статический frontend;
- `db` — PostgreSQL 16;
- `postgres_data` — локальное постоянное хранилище базы.

## Запуск без Docker

Нужны PostgreSQL и Python-зависимости:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 server.py --port 4180
```

Переменные окружения:

- `DATABASE_URL` — строка подключения к PostgreSQL.
- `MLINGO_ALLOWED_ORIGIN` — origin сайта, например `https://mlingo.app`.
- `PORT` — порт приложения, по умолчанию `4180`.

## API

- `GET /api/health` — проверка состояния backend и базы.
- `POST /api/register` — регистрация пользователя.
- `POST /api/login` — вход.
- `POST /api/logout` — выход.
- `GET /api/me` — текущий пользователь.
- `GET /api/progress` — загрузка прогресса.
- `PUT /api/progress` — сохранение прогресса.
- `POST /api/event` — событие прохождения урока.
- `GET /api/leaderboard` — таблица лидеров.

В PostgreSQL хранятся пользователи, сессии, JSON прогресса, XP, стрики, ошибки, события уроков и leaderboard.

## Структура проекта

- `index.html` — HTML-оболочка приложения.
- `styles.css` — стили desktop/mobile интерфейса.
- `app.js` — логика приложения, встроенные темы, прогресс и оффлайн-режим.
- `lesson-packs/` — внешние JSON-паки заданий.
- `server.py` — backend API, аккаунты, PostgreSQL и leaderboard.
- `android/` — Capacitor Android shell.
- `manifest.webmanifest` — настройки PWA.
- `service-worker.js` — кэш и оффлайн-доступ.
- `Dockerfile`, `docker-compose.yml` — локальный и production-запуск.
- `scripts/` — проверки, аудит уроков и подготовка Capacitor bundle.
- `docs/` — документация по деплою, мобильным сборкам и пакам заданий.

## Пак заданий

Задания можно добавлять в `lesson-packs/*.json`, а индекс хранить в `lesson-packs/index.json`. Приложение умеет:

- грузить bundled packs из репозитория;
- импортировать JSON-файл локально;
- синхронизировать packs из GitHub raw URL;
- кэшировать загруженные packs в `localStorage`.

Подробный формат описан в [docs/lesson-packs.md](docs/lesson-packs.md).

## Android APK

Локальная debug-сборка:

```bash
npm install
npm run android:debug
```

APK будет создан здесь:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Установка на подключенный телефон:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Публичный APK для тестеров публикуется через GitHub Releases:

```bash
git tag -a v0.1.0 -m "MLingo v0.1.0"
git push origin v0.1.0
```

Workflow `release-apk` соберет `MLingo-v0.1.0-debug.apk` и прикрепит его к Release. Подробности: [docs/apps.md](docs/apps.md).

## Деплой

Для публичного запуска нужен web service и PostgreSQL. GitHub Pages подходит только для статического frontend, но MLingo использует аккаунты, сессии, синхронизацию прогресса и leaderboard.

Рекомендуемый путь:

1. Render, Railway, Fly.io или VPS.
2. Managed PostgreSQL или собственный PostgreSQL.
3. Один HTTPS-домен для frontend и API.
4. Автоматический redeploy из ветки `main`.

Подробная инструкция: [docs/deploy.md](docs/deploy.md).

## Проверки

```bash
npm test
npm run check
npm run android:debug
npm run android:test
```

`npm test` проверяет синтаксис frontend, Python backend, схему JSON-паков, разрешенные библиотеки и базовые PWA-контракты.

`npm run check` дополнительно собирает Capacitor web bundle и запускает smoke-тест локального сайта.

## Контрибьютинг

Перед добавлением задач прочитайте [CONTRIBUTING.md](CONTRIBUTING.md) и список разрешенных библиотек в [docs/allowed-libraries.md](docs/allowed-libraries.md). Задания должны быть воспроизводимыми без интернета и без скачивания pretrained weights.
