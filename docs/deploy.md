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
       -> GitHub OAuth, если включен вход через GitHub
```

Для первых 100 активных пользователей этого более чем достаточно. Главный узкий участок на старте — не PostgreSQL, а качество задач, удобство добавления контента и стабильность пользовательского опыта.

## Где деплоить

Самые простые варианты:

- Render: web service из Dockerfile + managed PostgreSQL. Есть custom domains и автоматический HTTPS.
- Railway: удобно для Docker + PostgreSQL, быстро поднимается MVP, есть простая настройка домена.
- Fly.io: хороший Docker-first вариант, если нужен контроль региона.
- VPS: дешевле и гибче, но Docker, reverse proxy, SSL и backups придется обслуживать самостоятельно.

Для старта рекомендуется Render или Railway. VPS имеет смысл, когда понадобится больше контроля или станет важна стоимость постоянной нагрузки.

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
4. В переменные окружения добавь:
   - `DATABASE_URL` — internal connection string от Render PostgreSQL;
   - `MLINGO_ALLOWED_ORIGIN` — сначала `https://YOUR-SERVICE.onrender.com`, потом свой домен;
   - `PORT` — Render обычно сам дает порт через env, можно не задавать.
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` — после создания GitHub OAuth App.
5. Нажми Deploy.
6. Открой `https://YOUR-SERVICE.onrender.com/api/health`, должно быть:

```json
{"ok":true,"database":"postgres"}
```

## Быстрый путь через Railway

1. Создай project из GitHub repo.
2. Добавь PostgreSQL service.
3. Добавь web service из этого repo.
4. В web service добавь переменные окружения:
   - `DATABASE_URL` из PostgreSQL variables;
   - `MLINGO_ALLOWED_ORIGIN=https://YOUR-DOMAIN`;
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI`, если нужен GitHub-вход.
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
- Reg.ru или другой удобный локальный регистратор.

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

## Вход через GitHub

MLingo поддерживает GitHub OAuth как способ входа, похожий на TensorTonic: пользователь нажимает GitHub, подтверждает доступ, а прогресс хранится в базе MLingo. Для этого не нужны права на запись в репозитории.

В профиле есть блок “Интеграции”: он показывает connected/disconnected состояние GitHub и позже станет местом для настройки репозитория решений.

1. Открой GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Укажи:
   - Application name: `MLingo`;
   - Homepage URL: `https://mlingo.app`;
   - Authorization callback URL: `https://mlingo.app/api/auth/github/callback`.
3. Скопируй `Client ID`.
4. Сгенерируй `Client secret`.
5. В хостинге добавь переменные:

```text
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_OAUTH_REDIRECT_URI=https://mlingo.app/api/auth/github/callback
GITHUB_OAUTH_SCOPES=read:user user:email public_repo
GITHUB_SOLUTIONS_REPO_NAME=mlingo-solutions
```

Для локальной разработки callback:

```text
http://localhost:4180/api/auth/github/callback
```

Repo mode работает отдельным opt-in: пользователь включает sync в профиле, MLingo создает или использует публичный repo `mlingo-solutions`, а затем пушит туда markdown-файлы решений для `write`, `fix` и `idea` задач. Эти записи также попадают в backend-очередь `queued_for_review`, чтобы позже поверх нее сделать peer review и дискуссии.

Важно: `public_repo` дает приложению право писать в публичные репозитории пользователя. Храни базу и `DATABASE_URL` как секреты, потому что write-token сохраняется в PostgreSQL только для repo mode. Если захочется приватные репозитории, нужен scope `repo`, но для старта лучше публичный `mlingo-solutions`.

## Перед публичным запуском

- Проверь регистрацию и вход с телефона.
- Проверь GitHub-вход на production-домене и на локальном callback.
- Создай тестового пользователя и пройди 2-3 урока.
- Проверь leaderboard.
- Проверь установку PWA на iOS/Android.
- Включи backups у Postgres.
- Не коммить `.env` и дампы базы.
- Для админских задач позже добавь отдельную роль и панель.

## Как обновлять сайт

1. Меняешь задачи/код локально.
2. Проверяешь:

```bash
npm test
npm run check
```

3. Коммитишь и пушишь в `main`.
4. Render или Railway автоматически запускает redeploy.

## Когда понадобится следующий шаг

Когда задач станет очень много, лучше развивать контентную систему:

- отдельные JSON packs в `lesson-packs/`;
- таблица `lessons` в PostgreSQL для облачного каталога;
- admin-only интерфейс для добавления упражнений;
- версии уроков, чтобы не ломать прогресс старых пользователей;
- импортер задач из Markdown/JSON.
