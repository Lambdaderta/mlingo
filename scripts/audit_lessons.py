#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "app.js"

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


def top_level(module_name):
    return module_name.split(".", 1)[0]


def main():
    source = APP_JS.read_text(encoding="utf-8")
    problems = []

    for match in IMPORT_RE.finditer(source):
        module = top_level(match.group(1))
        if module not in ALLOWED_IMPORTS and module not in STDLIB_IMPORTS:
            problems.append(f"import outside allowlist: {match.group(1)}")

    lowered = source.lower()
    for name in sorted(FORBIDDEN_NAMES):
        if re.search(rf"\\b{re.escape(name)}\\b", lowered):
            problems.append(f"forbidden package mention: {name}")

    if problems:
        print("Lesson library audit failed:")
        for problem in problems:
            print(f"- {problem}")
        raise SystemExit(1)

    print("Lesson library audit passed")


if __name__ == "__main__":
    main()
