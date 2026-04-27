# Паки заданий MLingo

MLingo хранит задания отдельно от логики приложения. Это позволяет расширять банк упражнений через JSON-файлы, не пересобирая frontend и мобильное приложение.

Приложение умеет:

- загружать bundled packs из репозитория;
- импортировать локальный JSON-файл;
- синхронизировать packs из GitHub raw URL;
- сохранять загруженные packs в `localStorage` для оффлайн-режима.

## Рекомендуемая структура в GitHub

```text
lesson-packs/
  index.json
  cv-offline-pack.json
  recsys-pack.json
  torch-pack.json
```

`index.json` — точка входа:

```json
{
  "schemaVersion": 1,
  "id": "mlingo-pack-index",
  "title": "Паки заданий MLingo",
  "packs": [
    { "id": "cv-offline-pack-v1", "title": "CV Offline Expansion", "url": "./cv-offline-pack.json" }
  ]
}
```

Приложение может синхронизироваться из GitHub raw URL:

```text
https://raw.githubusercontent.com/Lambdaderta/mlingo/main/lesson-packs/index.json
```

После синхронизации packs сохраняются локально. На desktop и mobile они остаются доступными без сети.

## Схема pack

Каждый pack содержит список тем. Тема может быть новой или может дополнять существующую тему с тем же `id`.

```json
{
  "schemaVersion": 1,
  "id": "cv-offline-pack-v1",
  "title": "CV Offline Expansion",
  "topics": [
    {
      "id": "cv-supervised-pipelines",
      "title": "CV: supervised пайплайны",
      "track": "Segmentation / Classification",
      "tag": "cv",
      "icon": "CP",
      "color": "#b8a16d",
      "copy": "Короткое описание темы",
      "rules": ["Правило 1", "Правило 2"],
      "lessons": []
    }
  ]
}
```

Поддерживаемые типы уроков:

```text
order   собрать строки кода в правильном порядке
fill    заполнить пропуски
choice  выбрать один вариант
bug     найти строку с ошибкой
fix     исправить готовый код
write   написать код руками
idea    написать план решения; локальная проверка по rubric keywords
```

## Идейные задачи

`idea`-задачи специально не являются multiple choice. Они тренируют выбор подхода: validation, baseline, leakage, postprocess, быстрые эксперименты, риски private/public gap.

Сейчас такие задачи проверяются локальной рубрикой. Позже на hosted-сайте их можно заменить или дополнить GPT-review.

```json
{
  "id": "idea-cuties-20-masks",
  "kind": "idea",
  "title": "20 масок и CLIP",
  "prompt": "Напиши план...",
  "context": "Дано...",
  "rubric": [
    { "label": "frozen features", "keywords": ["frozen", "замороз", "feature extractor"] },
    { "label": "small head", "keywords": ["head", "голов", "linear", "conv"] }
  ],
  "minRubric": 2,
  "minWords": 45,
  "reference": "Эталонная рамка ответа..."
}
```

Локальная проверка не пытается быть идеальным судьей. Она заставляет ответ упомянуть ключевые блоки плана, а эталонная рамка после успеха показывает ожидаемое направление мысли.

## Правила качества

- `id` должен быть уникальным и написан в kebab-case.
- `hint` должен помогать по конкретной задаче, а не говорить общие фразы.
- `explain` должен объяснять идею после ответа.
- Код в `answer`, `starter`, `code`, `blocks`, `lines` должен использовать только разрешенные библиотеки.
- Для `order` можно добавить поле `answers`, если несколько порядков строк фактически эквивалентны.
- Для `write` и `fix` желательно добавлять `testsText`, чтобы ученик понимал, какой контракт проверяется.

## Проверка packs

```bash
npm run test:lessons
npm run audit:lessons
```

`test:lessons` проверяет схему, уникальность `id`, структуру `idea`-рубрик и минимальный объем банка задач.

`audit:lessons` проверяет, что в заданиях нет запрещенных библиотек.
