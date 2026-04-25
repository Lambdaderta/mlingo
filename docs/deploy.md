# Деплой MLingo на свой домен

Цель: один публичный сайт, например `https://mlingo.app`, где сидят все пользователи. Код открыт, но production-инстанс твой.

## Рекомендуемая архитектура

```text
Browser / PWA
  -> HTTPS domain
  -> Python container
       -> static files: index.html, app.js, styles.css
       -> API: /api/*
       -> Postgres
```

Для первых 100 активных пользователей этого более чем достаточно. Главный bottleneck будет не Postgres, а качество задач и удобство добавления контента.

## Где деплоить

Самые простые варианты:

- Render: web service из Dockerfile + managed PostgreSQL. У Render есть custom domains и автоматический HTTPS.
- Railway: удобно для Docker + Postgres, быстро поднять MVP, CLI показывает нужные DNS-записи для домена.
- Fly.io: хорошо, если хочется Docker-first и контроль региона; custom domain добавляется через certificates.
- VPS: дешевле и гибче, но придется самому ставить Docker, reverse proxy, SSL, backups.

Для старта я бы выбрал Render или Railway. VPS оставил бы на момент, когда захочется больше контроля и дешевле держать постоянную нагрузку.

Официальные доки:

- Render custom domains: https://render.com/docs/custom-domains
- Railway domains: https://docs.railway.com/cli/domain
- Fly.io custom domains: https://fly.io/docs/networking/custom-domain/

## Быстрый путь через Render

1. Зайди на Render и подключи GitHub repo `Lambdaderta/mlingo`.
2. Создай PostgreSQL database.
3. Создай Web Service:
   - environment: Docker;
   - branch: `main`;
   - root directory: пусто, если repo содержит файлы в корне;
   - health check path: `/api/health`.
4. В Environment Variables добавь:
   - `DATABASE_URL` — internal connection string от Render Postgres;
   - `MLINGO_ALLOWED_ORIGIN` — сначала `https://YOUR-SERVICE.onrender.com`, потом свой домен;
   - `PORT` — Render обычно сам дает порт через env, можно не задавать.
5. Нажми Deploy.
6. Открой `https://YOUR-SERVICE.onrender.com/api/health`, должно быть:

```json
{"ok":true,"database":"postgres"}
```

## Быстрый путь через Railway

1. Создай project из GitHub repo.
2. Добавь PostgreSQL service.
3. Добавь web service из этого repo.
4. В web service добавь env:
   - `DATABASE_URL` из PostgreSQL variables;
   - `MLINGO_ALLOWED_ORIGIN=https://YOUR-DOMAIN`;
5. Укажи старт через Dockerfile.
6. Создай Railway domain или custom domain.

Railway CLI умеет показать DNS-записи:

```bash
railway domain
```

## Домен

Купить домен можно у любого регистратора, которого тебе удобно оплачивать:

- Cloudflare Registrar;
- Porkbun;
- Namecheap;
- Reg.ru или другой локальный регистратор.

Как выбрать:

- бери короткое имя, которое легко продиктовать;
- лучше `.com`, `.app`, `.io`, `.dev`, `.ru`, `.ai`, но не переплачивай за красивую зону на MVP;
- включи авто-продление;
- сразу поставь 2FA на аккаунт регистратора;
- DNS удобнее держать там же, где понятная панель, или перенести nameservers в Cloudflare.

## Подключение домена

Общий алгоритм:

1. В хостинге добавь custom domain, например `mlingo.app` и `www.mlingo.app`.
2. Хостинг покажет DNS-записи.
3. У регистратора или в Cloudflare DNS добавь эти записи:
   - для `www` чаще всего `CNAME`;
   - для корневого домена `@` чаще `A/AAAA`, `ALIAS` или `CNAME flattening`, зависит от провайдера.
4. Подожди выпуск TLS-сертификата.
5. Поставь redirect `www -> apex` или `apex -> www`, чтобы был один canonical домен.
6. В `MLINGO_ALLOWED_ORIGIN` поставь финальный origin, например:

```text
https://mlingo.app
```

## Перед публичным запуском

- Проверь регистрацию и вход с телефона.
- Создай тестового пользователя и пройди 2-3 урока.
- Проверь leaderboard.
- Проверь PWA install на iOS/Android.
- Включи backups у Postgres.
- Не коммить `.env` и дампы базы.
- Для админских задач позже добавь отдельную роль/панель, сейчас все задачи лежат в `app.js`.

## Как обновлять сайт

1. Меняешь задачи/код локально.
2. Проверяешь:

```bash
node --check app.js
PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile server.py
docker compose config
```

3. Коммитишь и пушишь в `main`.
4. Render/Railway автоматически redeploy.

## Когда понадобится следующий шаг

Когда задач станет очень много, лучше вынести контент из `app.js`:

- `lessons/*.json` или Postgres table `lessons`;
- admin-only интерфейс для добавления упражнений;
- версии уроков, чтобы не ломать прогресс старых пользователей;
- импортер задач из Markdown/JSON.
