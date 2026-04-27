# GitHub Sync без сервера

MLingo может работать без публичного backend: задания берутся из GitHub raw, прогресс и решения сохраняются в личный репозиторий пользователя через GitHub Contents API.

## Что хранится

В репозитории пользователя, обычно `mlingo-solutions`:

```text
progress/mlingo-progress.json
solutions/<lesson-id>/<timestamp>.md
```

`progress/mlingo-progress.json` содержит JSON состояния приложения: пройденные уроки, даты прохождения, ошибки, XP и стрик.

`solutions/` хранит markdown-файлы для задач типов `write`, `fix` и `idea`. Это публичный архив решений, но не полноценный peer review. Разборы, комментарии и уведомления будут отдельным backend-слоем.

## Как подключить

1. Создай на GitHub fine-grained personal access token.
2. Дай ему доступ только к repo `mlingo-solutions`.
3. В permissions включи `Contents: Read and write`.
4. В MLingo открой `Профиль -> Интеграции -> GitHub`.
5. Введи owner, token и repo.
6. Нажми `Сохранить token`.
7. Нажми `Сохранить прогресс`.

Token хранится только в `localStorage` текущего устройства. Не отправляй его друзьям и не коммить в репозиторий.

## Что можно делать без backend

- Синхронизировать банк задач из GitHub.
- Сохранять прогресс в GitHub.
- Загружать прогресс на другом устройстве из того же repo.
- Автоматически сохранять решения после прохождения `write/fix/idea` задач.
- Проверять новые версии приложения через GitHub Releases.

## Что требует backend

- Аккаунты MLingo без ручного token.
- Очередь разборов решений.
- Line comments и ответы автора.
- Уведомления.
- XP за ревью и социальный leaderboard.
