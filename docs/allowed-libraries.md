# Разрешенные библиотеки для задач

Упражнения MLingo должны тренировать код, который реально можно будет писать в олимпиадной среде.

## ML / DL

- `torch`
- `torchvision`
- `pytorch-lightning`
- `scikit-learn`
- `xgboost`
- `catboost`
- `lightgbm`
- `transformers`
- `datasets`
- `evaluate`

## NLP

- `spacy`
- `nltk`
- `gensim`
- `fasttext`

## Табличка / математика

- `pandas`
- `numpy`
- `scipy`
- `joblib`

## CV

- `opencv-python` / `cv2`
- `Pillow` / `PIL`
- `scikit-image` / `skimage`

## Визуализация

- `matplotlib`
- `seaborn`
- `plotly`
- `autoviz`
- `tensorboard`
- `tqdm`

## Что нельзя закладывать в задачи

- `albumentations`
- `timm`
- `segmentation_models_pytorch`
- `torchmetrics`
- `ultralytics`
- `detectron2`
- `mmcv`, `mmdet`
- `tensorflow`, `keras`
- любые pretrained checkpoints или скачивание из интернета

Стандартная библиотека Python (`random`, `math`, `os`, `pathlib`, `json` и т.д.) допустима.

## Правило для новых упражнений

Если упражнение требует импорт, он должен быть из списка выше или из Python stdlib. Если хочется дать идею из недоступной библиотеки, перепиши ее через доступные инструменты: `torchvision.transforms`, `cv2`, `PIL`, `skimage`, `numpy`, `torch`.
