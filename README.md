# MLingo

Темный PWA-тренажер для ручного ML-кода: короткие упражнения по CV, PyTorch, валидации, метрикам, NumPy/Pandas и бустингу.

Проект source-available: код открыт для чтения, учебы и контрибьютов, но основной публичный инстанс предполагается один, на домене владельца проекта.

## Быстрый запуск через Docker

```bash
docker compose up --build
```

Открыть:

```text
http://localhost:4180/
```

Compose поднимает:

- `app` — Python backend + статический PWA frontend;
- `db` — PostgreSQL 16;
- volume `postgres_data` — локальное постоянное хранилище базы.

## Запуск backend без Docker

Нужен PostgreSQL и Python-зависимости:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 server.py --port 4180
```

Переменные окружения:

- `DATABASE_URL` — PostgreSQL connection string.
- `MLINGO_ALLOWED_ORIGIN` — origin сайта, например `https://mlingo.ru`.
- `PORT` — порт приложения, по умолчанию `4180`.

## API

- `GET /api/health`
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/progress`
- `PUT /api/progress`
- `POST /api/event`
- `GET /api/leaderboard`

В Postgres хранятся:

- пользователи;
- сессии;
- полный JSON прогресса;
- XP, стрик, число пройденных уроков, ошибки;
- события прохождения уроков;
- leaderboard.

## Что внутри

- `index.html` — оболочка приложения.
- `styles.css` — desktop/mobile layout, темный интерфейс в стиле `#1E1E1E`.
- `app.js` — темы, упражнения, прогресс, стрик, очередь уроков.
- `server.py` — API, аккаунты, PostgreSQL, leaderboard.
- `Dockerfile`, `docker-compose.yml` — локальный и production-friendly запуск.
- `manifest.webmanifest` — PWA-настройки для установки на телефон.
- `service-worker.js` — offline/cache для PWA.
- `CONTRIBUTING.md` — как добавлять упражнения.
- `docs/allowed-libraries.md` — список библиотек, под которые можно писать задачи.
- `scripts/audit_lessons.py` — быстрый аудит задач на запрещенные imports/packages.
- `LICENSE` — source-available license.

## Обучающий формат

- `choice`, `order`, `fill`, `bug` — короткий вход без усталости от набора.
- `fix`, `write` — ручная правка и написание кода, сложность 3-5.
- Богатые подсказки: кнопка `Подсказка` показывает не только намек, но и мини-словарь терминов вроде `Dice`, `IoU`, `OOF`, `logits`, `leakage`.
- Адаптивная сложность: новые уровни в теме открываются по мере прохождения.

## Мобильная версия

Приложение работает как PWA:

- адаптивная верстка под телефон;
- нижняя навигация;
- `manifest.webmanifest` для установки;
- service worker для кэша;
- прогресс синхронизируется через аккаунт и Postgres.

На iPhone/Android после деплоя на HTTPS открой сайт и добавь на главный экран:

- iOS Safari: `Share` -> `Add to Home Screen`;
- Android Chrome: меню -> `Install app` или `Add to Home screen`.

## Деплой

Рекомендуемый путь для первого публичного запуска:

1. Хостинг: Render, Railway, Fly.io или VPS.
2. База: managed PostgreSQL на том же провайдере или Neon/Supabase Postgres.
3. Один домен для всего приложения: backend отдает и API, и frontend.
4. HTTPS через провайдера или Cloudflare.

Почему не GitHub Pages: Pages подходит только для статического frontend. Здесь нужны аккаунты, база, сессии, leaderboard и API, поэтому нужен web service + Postgres.

Подробный гайд: [docs/deploy.md](docs/deploy.md).

## Проверки

```bash
node --check app.js
PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile server.py
docker compose config
python3 scripts/audit_lessons.py
```
