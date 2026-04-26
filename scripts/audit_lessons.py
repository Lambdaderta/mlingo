#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "app.js"
PACK_DIR = ROOT / "lesson-packs"

ALLOWED_IMPORTS = {
    "autoviz",
    "catboost",
    "cv2",
    "datasets",
    "evaluate",
    "fasttext",
    "gensim",
    "joblib",
    "lightgbm",
    "matplotlib",
    "nltk",
    "numpy",
    "pandas",
    "PIL",
    "plotly",
    "pytorch_lightning",
    "scipy",
    "seaborn",
    "skimage",
    "sklearn",
    "spacy",
    "tensorboard",
    "torch",
    "torchvision",
    "tqdm",
    "transformers",
    "xgboost",
}

STDLIB_IMPORTS = {
    "collections",
    "copy",
    "csv",
    "dataclasses",
    "functools",
    "glob",
    "itertools",
    "json",
    "math",
    "os",
    "pathlib",
    "random",
    "re",
    "statistics",
    "sys",
    "time",
    "typing",
    "warnings",
}

FORBIDDEN_NAMES = {
    "albumentations",
    "detectron2",
    "keras",
    "mmcv",
    "mmdet",
    "segmentation_models_pytorch",
    "tensorflow",
    "timm",
    "torchmetrics",
    "ultralytics",
}

IMPORT_RE = re.compile(r"(?m)(?:^|\\n)\\s*(?:from|import)\\s+([A-Za-z_][\\w.]*)")
CODE_FIELDS = {"answer", "code", "starter", "blocks", "lines"}


def top_level(module_name):
    return module_name.split(".", 1)[0]


def scan_text_for_imports(label, source, problems):
    lowered = source.lower()

    for match in IMPORT_RE.finditer(source):
        module = top_level(match.group(1))
        if module not in ALLOWED_IMPORTS and module not in STDLIB_IMPORTS:
            problems.append(f"{label}: import outside allowlist: {match.group(1)}")

    for name in sorted(FORBIDDEN_NAMES):
        if re.search(rf"\b{re.escape(name)}\b", lowered):
            problems.append(f"{label}: forbidden package mention: {name}")


def audit_lesson(lesson, topic_id, seen_lesson_ids, problems):
    lesson_id = lesson.get("id")
    if not lesson_id:
        problems.append(f"{topic_id}: lesson without id")
    elif lesson_id in seen_lesson_ids:
        problems.append(f"duplicate lesson id in packs: {lesson_id}")
    else:
        seen_lesson_ids.add(lesson_id)

    kind = lesson.get("kind")
    if kind == "idea":
        rubric = lesson.get("rubric")
        if not isinstance(rubric, list) or not rubric:
            problems.append(f"{lesson_id}: idea lesson must have a non-empty rubric")
        if int(lesson.get("minRubric", 1)) > len(rubric or []):
            problems.append(f"{lesson_id}: minRubric is larger than rubric length")
        if not lesson.get("reference"):
            problems.append(f"{lesson_id}: idea lesson should include a reference answer")

    for key in CODE_FIELDS:
        value = lesson.get(key)
        if isinstance(value, str):
            scan_text_for_imports(f"{lesson_id}.{key}", value, problems)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, str):
                    scan_text_for_imports(f"{lesson_id}.{key}[{index}]", item, problems)


def audit_pack(path, seen_topic_ids, seen_lesson_ids, problems):
    try:
        pack = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        problems.append(f"{path.name}: invalid JSON: {exc}")
        return

    if path.name == "index.json":
        packs = pack.get("packs")
        if not isinstance(packs, list) or not packs:
            problems.append("index.json: packs must be a non-empty list")
        for item in packs or []:
            if not item.get("id") or not item.get("url"):
                problems.append("index.json: every pack entry needs id and url")
        return

    topics = pack.get("topics")
    if not isinstance(topics, list) or not topics:
        problems.append(f"{path.name}: topics must be a non-empty list")
        return

    for topic in topics:
        topic_id = topic.get("id")
        if not topic_id:
            problems.append(f"{path.name}: topic without id")
            topic_id = f"{path.name}:unknown-topic"
        elif topic_id in seen_topic_ids:
            problems.append(f"duplicate topic id in packs: {topic_id}")
        else:
            seen_topic_ids.add(topic_id)

        lessons = topic.get("lessons")
        if not isinstance(lessons, list) or not lessons:
            problems.append(f"{topic_id}: lessons must be a non-empty list")
            continue

        for lesson in lessons:
            audit_lesson(lesson, topic_id, seen_lesson_ids, problems)


def main():
    problems = []

    scan_text_for_imports("app.js", APP_JS.read_text(encoding="utf-8"), problems)

    seen_topic_ids = set()
    seen_lesson_ids = set()
    if PACK_DIR.exists():
        for path in sorted(PACK_DIR.glob("*.json")):
            audit_pack(path, seen_topic_ids, seen_lesson_ids, problems)

    if problems:
        print("Lesson library audit failed:")
        for problem in problems:
            print(f"- {problem}")
        raise SystemExit(1)

    print("Lesson library audit passed")


if __name__ == "__main__":
    main()
