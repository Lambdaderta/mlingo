# MLingo lesson packs

MLingo is offline-first: the app can ship with built-in lessons, load bundled JSON packs, import a local JSON file, or sync packs from GitHub.

## Recommended GitHub layout

```text
lesson-packs/
  index.json
  cv-offline-pack.json
  recsys-pack.json
  torch-pack.json
```

`index.json` is the entry point:

```json
{
  "schemaVersion": 1,
  "id": "mlingo-pack-index",
  "title": "MLingo lesson packs",
  "packs": [
    { "id": "cv-offline-pack-v1", "title": "CV Offline Expansion", "url": "./cv-offline-pack.json" }
  ]
}
```

The app can sync from a GitHub raw URL like:

```text
https://raw.githubusercontent.com/Lambdaderta/mlingo/main/lesson-packs/index.json
```

After sync, packs are saved in `localStorage`, so the same lessons remain available offline on desktop/mobile.

## Pack schema

Each pack contains topics. A topic may be new, or may append lessons to an existing topic with the same `id`.

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
      "copy": "Short description",
      "rules": ["Rule 1", "Rule 2"],
      "lessons": []
    }
  ]
}
```

Supported lesson kinds:

```text
order   arrange code blocks
fill    fill blanks
choice  choose one option
bug     pick a broken line
fix     edit broken code
write   write code
idea    free-form strategy answer checked by rubric keywords
```

## Idea tasks

`idea` tasks are intentionally not multiple-choice. They use a lightweight local rubric now and can later be upgraded to GPT review on the hosted site.

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
  "reference": "Good answer frame..."
}
```

Local checking is not pretending to be a perfect judge. It enforces enough structure that the answer must mention the key ideas, while the reference answer teaches the intended plan after success.
