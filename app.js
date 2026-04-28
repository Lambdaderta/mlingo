const STORAGE_KEY = "mlingo.antivibe.progress.v6";
const AUTH_TOKEN_KEY = "mlingo.auth.token";
const PACK_STORAGE_KEY = "mlingo.lesson.packs.v1";
const PACK_SOURCE_STORAGE_KEY = "mlingo.lesson.pack_source.v1";
const GITHUB_DIRECT_CONFIG_KEY = "mlingo.github.direct.config.v1";
const GITHUB_DIRECT_TOKEN_KEY = "mlingo.github.direct.token.v1";
const GUIDE_SEEN_KEY = "mlingo.guide.seen.v1";
const APP_VERSION = "0.1.0";
const RELEASES_API_URL = "https://api.github.com/repos/Lambdaderta/mlingo/releases/latest";
const PROJECT_ISSUES_URL = "https://github.com/Lambdaderta/mlingo/issues/new";
const PYODIDE_LOCAL_SCRIPT = "./vendor/pyodide/pyodide.js";
const PYODIDE_CDN_SCRIPT = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
const PYTHON_RUNNER_TIMEOUT_MS = 8000;
const DEFAULT_PACK_URLS = [
  "./lesson-packs/core.json",
  "./lesson-packs/cv-offline-pack.json",
  "./lesson-packs/cv-fundamentals-pack.json",
  "./lesson-packs/recsys-rerank-pack.json",
  "./lesson-packs/dl-advanced-pack.json",
  "./lesson-packs/contest-expansion-pack.json",
  "./lesson-packs/detection-vrd-pack.json",
];
const DEFAULT_PACK_INDEX_URL = "https://raw.githubusercontent.com/Lambdaderta/mlingo/main/lesson-packs/index.json";
const API_BASE = window.MLINGO_API_BASE || "";
const AUTH_REQUIRED = false;

let topics = [];

const theoryChapters = [
  {
    id: "start",
    level: "0. Старт",
    title: "Данные и формат",
    subtitle: "Базовый уровень: форма тензоров, типы данных и разделение train/validation.",
    diagram: "start",
    cards: [
      {
        title: "Shapes и dtype сначала",
        body: "`shape` — размеры массива или тензора. `dtype` — тип значений внутри него. Эти два поля определяют, подходит ли объект для модели и loss-функции.",
        bullets: ["Images в torch обычно имеют форму `[B,C,H,W]`.", "Targets для CE — `long`, для BCE — `float`.", "После reshape/permute полезно ставить короткий assert."],
        code:
          "x = torch.randn(8, 3, 224, 224)\ny = torch.randint(0, 2, (8, 1, 224, 224)).float()\n\nassert x.ndim == 4 and x.shape[1] == 3\nassert y.dtype == torch.float32\nassert x.device == y.device",
      },
      {
        title: "Валидация до идей",
        body: "Validation — часть обучающих данных, отложенная для проверки качества. Она должна повторять будущий сценарий применения модели.",
        bullets: ["Classification: stratified split.", "Time/recsys: split по времени.", "Статистики признаков считаются только на train-части fold."],
        code:
          "from sklearn.model_selection import StratifiedKFold\n\nskf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)\nfor fold, (tr_idx, va_idx) in enumerate(skf.split(df, df['target'])):\n    train_df = df.iloc[tr_idx].copy()\n    val_df = df.iloc[va_idx].copy()\n    break",
      },
    ],
  },
  {
    id: "torch",
    level: "1. PyTorch",
    title: "Dataset, loader, training loop",
    subtitle: "Базовые компоненты обучения модели в PyTorch.",
    diagram: "segmentation",
    cards: [
      {
        title: "Dataset возвращает готовые tensors",
        body: "`Dataset` возвращает один пример по индексу. `DataLoader` собирает несколько примеров в batch.",
        bullets: ["В `__getitem__` обычно выполняются чтение и transforms.", "Spatial transforms для image/mask должны быть синхронны.", "Для переменного числа объектов нужен кастомный `collate_fn`."],
        code:
          "class MaskDataset(torch.utils.data.Dataset):\n    def __init__(self, img_paths, mask_paths, transform=None):\n        self.img_paths = img_paths\n        self.mask_paths = mask_paths\n        self.transform = transform\n\n    def __getitem__(self, idx):\n        img = Image.open(self.img_paths[idx]).convert('RGB')\n        mask = Image.open(self.mask_paths[idx]).convert('L')\n        if self.transform:\n            img, mask = self.transform(img, mask)\n        return img, mask\n\n    def __len__(self):\n        return len(self.img_paths)",
      },
      {
        title: "Правильный train step",
        body: "Одна итерация обучения состоит из forward, расчёта loss, backward и обновления весов.",
        bullets: ["`zero_grad` можно делать в начале итерации или после `step`, но не забывать.", "`model.train()` для обучения.", "`model.eval()` и `no_grad` для валидации."],
        code:
          "model.train()\nfor x, y in loader:\n    x = x.to(device)\n    y = y.to(device)\n\n    optimizer.zero_grad()\n    logits = model(x)\n    loss = criterion(logits, y)\n    loss.backward()\n    optimizer.step()",
      },
    ],
  },
  {
    id: "cv-preprocess",
    level: "2. CV preprocessing",
    title: "Изображения, маски, bbox",
    subtitle: "Чтение изображений, преобразование каналов, маски и bounding boxes.",
    diagram: "detection",
    cards: [
      {
        title: "PIL/OpenCV и порядок каналов",
        body: "PIL возвращает RGB, OpenCV возвращает BGR. Перед подачей в модель данные обычно переводятся в float tensor.",
        bullets: ["Image часто нормализуется в диапазон `[0,1]`.", "Torch-модели обычно принимают `[C,H,W]` для одного изображения.", "Маска хранит классы или 0/1, её не обрабатывают как RGB-картинку."],
        code:
          "img = cv2.imread(path)\nimg = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)\nimg = img.astype(np.float32) / 255.0\nimg = torch.from_numpy(img).permute(2, 0, 1)",
      },
      {
        title: "Resize image и mask разными способами",
        body: "Изображение содержит непрерывные цвета, а mask содержит дискретные class ids. Поэтому resize у них разный.",
        bullets: ["Image: bilinear/bicubic.", "Mask: nearest.", "Bbox после resize масштабируй по x/y отдельно."],
        code:
          "img = TF.resize(img, (224, 224), interpolation=InterpolationMode.BILINEAR)\nmask = TF.resize(mask, (224, 224), interpolation=InterpolationMode.NEAREST)\n\nmask = torch.from_numpy(np.array(mask) > 0)[None].float()",
      },
    ],
  },
  {
    id: "segmentation",
    level: "3. Segmentation",
    title: "Logits, masks, Dice/IoU",
    subtitle: "Бинарная и многоклассовая сегментация: выход модели, loss и метрики.",
    diagram: "segmentation",
    cards: [
      {
        title: "BCE + Dice для binary mask",
        body: "`BCEWithLogitsLoss` принимает сырые logits. Dice обычно считается уже по вероятностям или бинарной маске.",
        bullets: ["`logits`: `[B,1,H,W]`.", "`target`: `[B,1,H,W]` float.", "Threshold подбирается на validation."],
        code:
          "def dice_score(prob, target, eps=1e-6):\n    inter = (prob * target).sum(dim=(1, 2, 3))\n    denom = prob.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3))\n    return ((2 * inter + eps) / (denom + eps)).mean()\n\nbce = F.binary_cross_entropy_with_logits(logits, target)\nprob = torch.sigmoid(logits)\nloss = bce + (1 - dice_score(prob, target))",
      },
      {
        title: "Threshold sweep",
        body: "Threshold переводит probability в бинарную маску. Значение 0.5 является обычным стартом, но не математической обязанностью.",
        bullets: ["Подбирай threshold только на validation.", "Сохраняй лучший threshold для test.", "Largest component убирает шум, но может вредить нескольким объектам."],
        code:
          "best_t, best_iou = 0.5, -1\nfor t in np.linspace(0.1, 0.9, 17):\n    pred = (val_prob > t).astype(np.uint8)\n    score = mean_iou(pred, val_masks)\n    if score > best_iou:\n        best_t, best_iou = t, score",
      },
    ],
  },
  {
    id: "detection",
    level: "4. Detection",
    title: "DETR targets и relation rows",
    subtitle: "Object detection: форматы bbox, target-структуры и batch с разным числом объектов.",
    diagram: "detr",
    cards: [
      {
        title: "Relation row → objects",
        body: "В relation dataset одна строка может описывать пару объектов. Для object detection требуется список отдельных объектов на изображение.",
        bullets: ["Не дублируй одинаковый subject из нескольких predicates.", "`xyxy` часто нужно конвертировать в `cxcywh`.", "Labels должны быть integer ids."],
        code:
          "objects = []\nfor row in rows_for_image:\n    objects.append((row.subject_label, [row.subject_x1, row.subject_y1, row.subject_x2, row.subject_y2]))\n    objects.append((row.object_label, [row.object_x1, row.object_y1, row.object_x2, row.object_y2]))\n\nobjects = list(dict.fromkeys(objects))  # simple dedup for exact matches",
      },
      {
        title: "Detection collate_fn",
        body: "У разных картинок разное число объектов. Поэтому targets обычно остаются списком dict, а не stack-ятся в один tensor.",
        bullets: ["Images можно stack-нуть, если resize одинаковый.", "Boxes: `[N,4]`.", "Labels: `[N]`."],
        code:
          "def collate_fn(batch):\n    images, targets = zip(*batch)\n    images = torch.stack(images)\n    return images, list(targets)\n\nloader = DataLoader(ds, batch_size=8, shuffle=True, collate_fn=collate_fn)",
      },
    ],
  },
  {
    id: "relations-recsys",
    level: "5. Ranking",
    title: "Predicate classifier и reranking",
    subtitle: "Задачи, где модель выбирает или сортирует пары, кандидаты и объекты.",
    diagram: "relation",
    cards: [
      {
        title: "Фичи для predicate",
        body: "Predicate classifier получает пару объектов и предсказывает тип отношения между ними.",
        bullets: ["Площади и центры bbox.", "IoU и относительное положение.", "Subject/object label ids."],
        code:
          "def pair_features(s_box, o_box, s_label, o_label):\n    sx = (s_box[0] + s_box[2]) / 2\n    sy = (s_box[1] + s_box[3]) / 2\n    ox = (o_box[0] + o_box[2]) / 2\n    oy = (o_box[1] + o_box[3]) / 2\n    return {\n        's_label': s_label,\n        'o_label': o_label,\n        'dx': ox - sx,\n        'dy': oy - sy,\n        'iou': bbox_iou(s_box, o_box),\n    }",
      },
      {
        title: "Two-stage recsys",
        body: "Candidate generator отвечает за recall, reranker отвечает за порядок. Не требуй от первой стадии идеального ранжирования.",
        bullets: ["Сначала top-K кандидатов на user.", "Потом features для user-item rows.", "Group/query id нужен для ranking loss."],
        code:
          "candidates = popular_items_by_category(user_history, k=200)\nrows = make_user_item_features(user_id, candidates)\nrows['score'] = ranker.predict(rows[feature_cols])\nsubmission = rows.sort_values('score', ascending=False).head(20)",
      },
    ],
  },
  {
    id: "advanced-dl",
    level: "6. Advanced DL",
    title: "Transformers и diffusion без магии",
    subtitle: "Основные вычислительные идеи attention и diffusion training.",
    diagram: "diffusion",
    cards: [
      {
        title: "Self-attention shape",
        body: "Attention берёт query/key/value и строит веса между токенами. Важно понимать, где batch, где sequence, где hidden.",
        bullets: ["`x`: `[B,T,D]`.", "`attn`: `[B,T,T]`.", "Mask запрещает смотреть в ненужные позиции."],
        code:
          "q = Wq(x)  # [B,T,D]\nk = Wk(x)  # [B,T,D]\nv = Wv(x)  # [B,T,D]\n\nscores = q @ k.transpose(-1, -2) / math.sqrt(q.size(-1))\nweights = torch.softmax(scores, dim=-1)\nout = weights @ v",
      },
      {
        title: "Diffusion training step",
        body: "Базовая diffusion-задача: взять чистый объект, добавить шум на timestep t и научить модель предсказывать этот шум.",
        bullets: ["Target часто `noise`, а не clean image.", "`t` подаётся в модель.", "Inference — обратный процесс от шума к картинке."],
        code:
          "noise = torch.randn_like(x0)\nt = torch.randint(0, T, (x0.size(0),), device=x0.device)\nxt = scheduler.add_noise(x0, noise, t)\n\npred_noise = model(xt, t)\nloss = F.mse_loss(pred_noise, noise)",
      },
    ],
  },
];

const lessonLabels = {
  order: "Собери код",
  fill: "Впиши код",
  choice: "Выбери ответ",
  bug: "Найди баг",
  fix: "Исправь код",
  write: "Напиши код",
  idea: "Разбор идеи",
};

const glossary = [
  {
    key: "dice",
    title: "Dice",
    aliases: ["dice"],
    body: "Метрика похожести двух масок. Она смотрит, насколько сильно пересекаются predicted mask и true mask.",
    formula: "Dice = 2 * intersection / (pred_area + true_area)",
    contest: "Часто полезнее accuracy в segmentation, потому что фон может доминировать над объектом.",
  },
  {
    key: "iou",
    title: "IoU",
    aliases: ["iou", "intersection over union"],
    body: "Метрика overlap: какую долю объединения двух масок занимает их пересечение.",
    formula: "IoU = intersection / union",
    contest: "В CV threshold и postprocess обычно подбирают по IoU/Dice на validation.",
  },
  {
    key: "logits",
    title: "Logits",
    aliases: ["logits", "logit"],
    body: "Сырые выходы модели до sigmoid/softmax. Это еще не вероятность.",
    formula: "prob = sigmoid(logit) для binary, softmax(logits) для multiclass",
    contest: "`BCEWithLogitsLoss` и `CrossEntropyLoss` ждут logits, а threshold/метрики обычно работают с probability.",
  },
  {
    key: "bce",
    title: "BCEWithLogitsLoss",
    aliases: ["bcewithlogits", "bce", "binary_cross_entropy_with_logits"],
    body: "Loss для binary classification/segmentation, который внутри сам делает sigmoid численно устойчивым способом.",
    formula: "loss(logits, target_float)",
    contest: "Не ставь `sigmoid` перед этим loss. Sigmoid нужен потом для метрик и threshold.",
  },
  {
    key: "cross_entropy",
    title: "CrossEntropyLoss",
    aliases: ["crossentropyloss", "cross entropy", "ce "],
    body: "Loss для multiclass. В PyTorch он сам делает log-softmax и берет правильный класс из target.",
    formula: "logits: [B,C,H,W], target: [B,H,W] long",
    contest: "Для segmentation target не one-hot, а class ids.",
  },
  {
    key: "threshold",
    title: "Threshold",
    aliases: ["threshold", "порог"],
    body: "Число, которым probability превращается в 0/1 prediction.",
    formula: "mask = prob > threshold",
    contest: "Для F1/Dice/IoU порог часто подбирают на validation.",
  },
  {
    key: "mask",
    title: "Mask",
    aliases: ["mask", "маск", "маска"],
    body: "Карта пикселей: для каждого пикселя указано, объект это или фон, либо id класса.",
    formula: "binary: [H,W] 0/1; multiclass: [H,W] class ids",
    contest: "Маску нельзя resize через bilinear, иначе class ids размажутся.",
  },
  {
    key: "bbox",
    title: "Bounding box",
    aliases: ["bbox", "bounding box"],
    body: "Прямоугольник вокруг объекта, обычно `[x1, y1, x2, y2]`.",
    formula: "x идет по ширине, y идет по высоте",
    contest: "`np.where(mask)` возвращает сначала y, потом x.",
  },
  {
    key: "connected_components",
    title: "Connected components",
    aliases: ["connectedcomponents", "connected components", "компонент"],
    body: "Разбиение бинарной маски на отдельные связные островки foreground.",
    formula: "cv2.connectedComponents(mask) возвращает фон как label 0",
    contest: "Можно убрать мелкий шум или посчитать объекты без полноценного detector.",
  },
  {
    key: "density_map",
    title: "Density map",
    aliases: ["density", "density map", "плотност"],
    body: "Карта плотности объектов: сумма всех пикселей примерно равна количеству объектов.",
    formula: "count = density_map.sum()",
    contest: "Для chicken counting можно учить не bbox, а density/count regression.",
  },
  {
    key: "oof",
    title: "OOF",
    aliases: ["oof", "out-of-fold"],
    body: "Out-of-fold предсказания: каждая строка train предсказана моделью, которая эту строку не видела.",
    formula: "fold model -> valid fold prediction -> собрать весь train",
    contest: "Нужен для честного stacking и target encoding без утечки.",
  },
  {
    key: "leakage",
    title: "Leakage",
    aliases: ["leakage", "утеч"],
    body: "Ситуация, когда модель или preprocessing видят информацию, которой в реальном test не будет.",
    formula: "fit только на train, valid/test только transform",
    contest: "Leakage делает validation красивой, а leaderboard потом внезапно грустным.",
  },
  {
    key: "target_encoding",
    title: "Target encoding",
    aliases: ["target encoding", "target_encode", "city_te"],
    body: "Категория заменяется статистикой target по этой категории, например средним target.",
    formula: "category -> mean(y | category)",
    contest: "Для train делай OOF target encoding, иначе строка увидит собственный target.",
  },
  {
    key: "smoothing",
    title: "Smoothing",
    aliases: ["smoothing", "сглаж"],
    body: "Смешивание статистики категории с global mean, чтобы редкие категории не давали экстремальные значения.",
    formula: "(sum + m * global_mean) / (count + m)",
    contest: "Особенно важно для target encoding на редких категориях.",
  },
  {
    key: "groupkfold",
    title: "GroupKFold",
    aliases: ["groupkfold", "group split", "groups"],
    body: "Валидация, где все строки одной группы остаются только в train или только в valid.",
    formula: "gkf.split(X, y, groups=user_id)",
    contest: "Нужен, если один пользователь/сессия/пациент повторяется в данных.",
  },
  {
    key: "auc",
    title: "ROC-AUC",
    aliases: ["roc-auc", "auc"],
    body: "Метрика ранжирования: насколько positive объекты получают score выше negative.",
    formula: "roc_auc_score(y_true, proba_positive)",
    contest: "Передавай probabilities/scores, не hard labels из `predict`.",
  },
  {
    key: "f1",
    title: "F1",
    aliases: ["f1"],
    body: "Гармоническое среднее precision и recall.",
    formula: "F1 = 2TP / (2TP + FP + FN)",
    contest: "F1 сильно зависит от threshold, поэтому порог подбирают на validation.",
  },
  {
    key: "early_stopping",
    title: "Early stopping",
    aliases: ["early stopping", "early_stopping"],
    body: "Остановка обучения, когда validation metric перестает улучшаться.",
    formula: "много деревьев + stopping_rounds",
    contest: "Позволяет поставить большой `n_estimators` и не угадывать число деревьев руками.",
  },
  {
    key: "broadcasting",
    title: "Broadcasting",
    aliases: ["broadcast", "broadcasting"],
    body: "Правило NumPy/PyTorch, которое растягивает размеры 1 по нужным осям без ручных циклов.",
    formula: "mean.view(C,1,1) работает с image CxHxW",
    contest: "Очень часто нужно для нормализации и операций над batch.",
  },
  {
    key: "device",
    title: "Device",
    aliases: ["device", "cuda", "gpu"],
    body: "Место, где лежит tensor: CPU или GPU.",
    formula: "x = x.to(device); y = y.to(device); model.to(device)",
    contest: "Все tensors в одной операции должны быть на одном device.",
  },
  {
    key: "dtype",
    title: "dtype",
    aliases: ["dtype", "float", "long", "bool"],
    body: "Тип данных tensor: float для regression/BCE target, long для class ids, bool для masks/conditions.",
    formula: "CE target -> long; BCE target -> float",
    contest: "Половина странных torch-ошибок на старте - это shape или dtype.",
  },
  {
    key: "conv2d",
    title: "Conv2d shape",
    aliases: ["conv2d", "сверт"],
    body: "Свертка в PyTorch принимает batch изображений в формате `[B,C,H,W]`.",
    formula: "out = floor((in + 2p - d(k-1) - 1) / s + 1)",
    contest: "Полезно для расчета `in_features` перед Linear.",
  },
  {
    key: "attention",
    title: "Attention",
    aliases: ["attention", "аттенш"],
    body: "Механизм, где каждый query смотрит на keys, получает веса и смешивает values.",
    formula: "softmax(QK^T / sqrt(d))V",
    contest: "Важно понимать shape: scores обычно `[B, heads, T, T]`.",
  },
  {
    key: "rolling",
    title: "Rolling features",
    aliases: ["rolling"],
    body: "Оконные признаки по истории: например среднее последних 3 событий пользователя.",
    formula: "shift(1).rolling(k).mean()",
    contest: "`shift(1)` защищает от использования текущей строки как признака самой себя.",
  },
];

let state = loadState();
let currentTopicId = state.currentTopicId || "";
let currentLessonIndex = state.currentLessonIndex || 0;
let currentScreen = state.currentScreen || "roadmap";
let currentTheoryId = state.currentTheoryId || theoryChapters[0].id;
let currentTheoryArticleIndex = state.currentTheoryArticleIndex || 0;
const initialRouteParams = new URLSearchParams(window.location.search);
const requestedScreen = initialRouteParams.get("screen");
const requestedTopicId = initialRouteParams.get("topic");
const requestedLessonIndex = initialRouteParams.get("lesson");
if (["roadmap", "topics", "lesson", "review", "profile", "library"].includes(requestedScreen)) currentScreen = requestedScreen;
let selectedBlocks = [];
let selectedOption = null;
let selectedBugLine = null;
let activeBlockOrder = [];
let typedCode = "";
let lastIdeaEvaluation = null;
let lastRunnerResult = null;
let els = {};
let currentUser = null;
let syncTimer = null;
let isApplyingRemote = false;
let isCheckingAnswer = false;
let pythonRunnerWorker = null;
let pythonRunnerRequestId = 0;
let runtimeConfig = { githubOAuth: false, githubRepoWrite: false };
let reviewSolutions = [];
let selectedReviewSolutionId = null;

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadRuntimeConfig();
  loadLessonPacks().then(() => {
    applyInitialRoute();
    ensureValidTopicSelection();
    renderAll();
    bootstrapAccount().finally(() => {
      enforceAuthGate();
      maybeOpenGuide();
    });
  });
  registerServiceWorker();
});

function cacheElements() {
  [
    "moduleList",
    "moduleListMain",
    "topicsBadge",
    "railProgress",
    "missionEyebrow",
    "missionTitle",
    "xpValue",
    "fireValue",
    "masteryValue",
    "roadmapTitle",
    "roadmapBadge",
    "roadmapCopy",
    "roadmapPath",
    "lessonTrack",
    "lessonTitle",
    "lessonType",
    "lessonPrompt",
    "lessonBrief",
    "lessonTerms",
    "challengeHost",
    "lessonBackButton",
    "hintButton",
    "reportLessonButton",
    "resetButton",
    "prevButton",
    "checkButton",
    "nextButton",
    "feedbackBox",
    "bossGrid",
    "sideTrackName",
    "sideTrackCopy",
    "moduleProgressBar",
    "moduleProgressText",
    "dailyQuests",
    "weakList",
    "referenceList",
    "theoryGrid",
    "libraryGrid",
    "profileXp",
    "profileStreak",
    "profileDone",
    "profileMisses",
    "githubIntegrationPanel",
    "githubIntegrationMark",
    "githubIntegrationTitle",
    "githubIntegrationSubtitle",
    "githubConnectButton",
    "githubTokenSaveButton",
    "githubTokenClearButton",
    "githubOwnerInput",
    "githubTokenInput",
    "githubRepoEnableButton",
    "githubRepoDisableButton",
    "githubProgressPushButton",
    "githubProgressPullButton",
    "githubRepoInput",
    "githubDisconnectButton",
    "githubRepoLine",
    "githubIntegrationMessage",
    "queueList",
    "accountButton",
    "accountMenu",
    "menuFocusButton",
    "menuGuideButton",
    "menuLoginButton",
    "menuLogoutButton",
    "authModal",
    "authCloseButton",
    "logoutButton",
    "githubLoginButton",
    "githubAuthHint",
    "authStatus",
    "leaderboardList",
    "reviewSolutionList",
    "reviewDetail",
    "reviewRefreshButton",
    "reviewStatus",
    "packExportButton",
    "packImportButton",
    "packImportInput",
    "packSyncButton",
    "packSyncShortcutButton",
    "packSourceInput",
    "packStatus",
    "appVersionBadge",
    "checkUpdatesButton",
    "releaseLink",
    "updateStatus",
    "guideButton",
    "reportAppButton",
    "guideModal",
    "guideCloseButton",
    "guideStartButton",
    "guideLessonButton",
    "guideLaterButton",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => navigateToScreen(button.dataset.screen));
  });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(`.filter-chip[data-filter="${button.dataset.filter}"]`).forEach((b) => b.classList.add("is-active"));
      renderTopics(button.dataset.filter);
    });
  });

  els.challengeHost.addEventListener("click", handleChallengeClick);
  els.hintButton.addEventListener("click", showHint);
  els.reportLessonButton?.addEventListener("click", () => openIssueReport({ lesson: getCurrentLesson(), topic: getCurrentTopic() }));
  els.reportAppButton?.addEventListener("click", () => openIssueReport({}));
  els.resetButton.addEventListener("click", renderLesson);
  els.roadmapPath?.addEventListener("click", handleRoadmapClick);
  els.prevButton?.addEventListener("click", previousLesson);
  els.checkButton.addEventListener("click", checkAnswer);
  els.nextButton.addEventListener("click", nextLesson);
  els.lessonBackButton?.addEventListener("click", () => setScreen("roadmap"));
  els.menuFocusButton?.addEventListener("click", () => {
    document.body.classList.toggle("focus-mode");
    els.menuFocusButton.textContent = document.body.classList.contains("focus-mode") ? "Показать весь UI" : "Режим фокуса";
    closeAccountMenu();
  });
  els.menuGuideButton?.addEventListener("click", () => {
    closeAccountMenu();
    openGuideModal({ manual: true });
  });
  els.menuLoginButton?.addEventListener("click", () => {
    closeAccountMenu();
    openAuthModal();
  });
  els.menuLogoutButton?.addEventListener("click", () => {
    closeAccountMenu();
    logout();
  });
  els.queueList?.addEventListener("click", handleQueueClick);
  els.accountButton?.addEventListener("click", toggleAccountMenu);
  document.addEventListener("click", (event) => {
    if (!els.accountMenu || els.accountMenu.hidden) return;
    if (event.target.closest("#accountButton") || event.target.closest("#accountMenu")) return;
    closeAccountMenu();
  });
  els.accountMenu?.addEventListener("click", (event) => {
    if (event.target.closest("[data-screen]")) closeAccountMenu();
  });
  els.guideButton?.addEventListener("click", () => openGuideModal({ manual: true }));
  els.guideCloseButton?.addEventListener("click", () => closeGuideModal({ remember: true }));
  els.guideModal?.addEventListener("click", (event) => {
    if (event.target === els.guideModal) closeGuideModal({ remember: true });
  });
  els.guideStartButton?.addEventListener("click", () => {
    closeGuideModal({ remember: true });
    setScreen("roadmap");
  });
  els.guideLessonButton?.addEventListener("click", () => {
    closeGuideModal({ remember: true });
    openCurrentLesson();
  });
  els.guideLaterButton?.addEventListener("click", () => closeGuideModal({ remember: false }));
  els.authCloseButton?.addEventListener("click", closeAuthModal);
  els.authModal?.addEventListener("click", (event) => {
    if (event.target === els.authModal) closeAuthModal();
  });
  els.logoutButton?.addEventListener("click", logout);
  els.githubLoginButton?.addEventListener("click", startGithubLogin);
  els.githubConnectButton?.addEventListener("click", startGithubLogin);
  els.githubRepoEnableButton?.addEventListener("click", enableGithubRepoMode);
  els.githubRepoDisableButton?.addEventListener("click", disableGithubRepoMode);
  els.githubTokenSaveButton?.addEventListener("click", saveGithubDirectSettings);
  els.githubTokenClearButton?.addEventListener("click", clearGithubDirectSettings);
  els.githubProgressPushButton?.addEventListener("click", pushProgressToGithubDirect);
  els.githubProgressPullButton?.addEventListener("click", pullProgressFromGithubDirect);
  els.githubDisconnectButton?.addEventListener("click", disconnectGithub);
  els.reviewRefreshButton?.addEventListener("click", fetchReviewSolutions);
  els.reviewSolutionList?.addEventListener("click", handleReviewListClick);
  els.reviewDetail?.addEventListener("click", handleReviewDetailClick);
  els.checkUpdatesButton?.addEventListener("click", checkForUpdates);
  els.theoryGrid?.addEventListener("click", handleTheoryClick);
  els.packExportButton?.addEventListener("click", exportLessonPackSnapshot);
  els.packImportButton?.addEventListener("click", () => els.packImportInput?.click());
  els.packImportInput?.addEventListener("change", importLessonPackFromFile);
  els.packSyncButton?.addEventListener("click", syncLessonPacksFromGithub);
  els.packSyncShortcutButton?.addEventListener("click", syncLessonPacksFromGithub);
  els.packSourceInput?.addEventListener("change", () => {
    const value = els.packSourceInput.value.trim();
    if (value) localStorage.setItem(PACK_SOURCE_STORAGE_KEY, value);
  });
}

function toggleAccountMenu(event) {
  event?.stopPropagation();
  if (!els.accountMenu) {
    openAuthModal();
    return;
  }
  const nextHidden = !els.accountMenu.hidden ? true : false;
  els.accountMenu.hidden = nextHidden;
  els.accountButton?.setAttribute("aria-expanded", nextHidden ? "false" : "true");
}

function closeAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = true;
  els.accountButton?.setAttribute("aria-expanded", "false");
}

function navigateToScreen(screen) {
  if (screen === "lesson") {
    openCurrentLesson();
    return;
  }
  setScreen(screen);
}

function openCurrentLesson() {
  ensureValidTopicSelection();
  renderLesson();
  renderSidebar();
  setScreen("lesson");
}

function openLessonAt(topicId, lessonIndex = 0) {
  currentTopicId = topicId;
  currentLessonIndex = Number(lessonIndex) || 0;
  ensureValidTopicSelection();
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  renderAll();
  setScreen("lesson");
}

function applyInitialRoute() {
  if (!requestedTopicId) return;
  const topic = topics.find((item) => item.id === requestedTopicId);
  if (!topic) return;
  const index = Number.parseInt(requestedLessonIndex, 10);
  currentTopicId = topic.id;
  currentLessonIndex = Number.isInteger(index) && topic.lessons[index] ? index : 0;
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  if (requestedScreen === "lesson") currentScreen = "lesson";
}

function renderAll() {
  ensureCurrentLessonAvailable();
  renderTopics(document.querySelector(".filter-chip.is-active")?.dataset.filter || "all");
  renderRoadmap();
  renderLesson();
  renderSidebar();
  renderPracticeSets();
  renderReviewSolutions();
  renderLibrary();
  renderStats();
  setScreen(currentScreen, false);
}

function ensureCurrentLessonAvailable() {
  const topic = getCurrentTopic();
  const level = getUnlockedLevel(topic);
  const current = topic.lessons[currentLessonIndex];
  if (current && (current.difficulty || 1) <= level) return;
  const firstOpen = topic.lessons.findIndex((lesson) => (lesson.difficulty || 1) <= level && !state.completed[lesson.id]);
  currentLessonIndex = firstOpen === -1 ? 0 : firstOpen;
  state.currentLessonIndex = currentLessonIndex;
}

function setScreen(screen, persist = true) {
  currentScreen = screen;
  document.body.dataset.screen = screen;
  document.querySelectorAll(".app-screen").forEach((section) => {
    section.classList.toggle("is-active", section.id === `screen-${screen}`);
  });
  document.querySelectorAll(".nav-button, .mobile-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === screen);
  });
  if (persist) {
    state.currentScreen = screen;
    saveState();
    updateBrowserRoute(screen);
  }
  if (screen === "review") fetchReviewSolutions({ silent: reviewSolutions.length > 0 });
}

function updateBrowserRoute(screen) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("screen", screen);
    if (screen === "lesson") {
      url.searchParams.set("topic", currentTopicId);
      url.searchParams.set("lesson", String(currentLessonIndex));
    } else {
      url.searchParams.delete("topic");
      url.searchParams.delete("lesson");
    }
    window.history.replaceState(null, "", url);
  } catch {
    // The persisted state still keeps navigation working if history is unavailable.
  }
}

function renderTopics(filter = "all") {
  const visible = filter === "all" ? topics : topics.filter((topic) => topic.tag === filter);
  const containers = [els.moduleList, els.moduleListMain].filter(Boolean);
  containers.forEach((container) => {
    container.innerHTML = "";
  });
  if (els.topicsBadge) els.topicsBadge.textContent = `${visible.length} / ${topics.length}`;
  visible.forEach((topic) => {
    containers.forEach((container) => container.appendChild(createModuleButton(topic)));
  });
}

function createModuleButton(topic) {
    const done = completedInTopic(topic);
    const button = document.createElement("button");
    button.className = `module-button${topic.id === currentTopicId ? " is-active" : ""}`;
    button.type = "button";
    button.style.setProperty("--module-color", topic.color);
    button.innerHTML = `
      <span class="module-icon">${topic.icon}</span>
      <span class="module-copy">
        <strong>${topic.title}</strong>
        <small>${topic.track}</small>
      </span>
      <span class="module-count">${done}/${topic.lessons.length}</span>
    `;
    button.addEventListener("click", () => {
      currentTopicId = topic.id;
      currentLessonIndex = 0;
      state.currentTopicId = currentTopicId;
      state.currentLessonIndex = currentLessonIndex;
      saveState();
      renderAll();
      setScreen("roadmap");
    });
    return button;
}

function renderRoadmap() {
  const topic = getCurrentTopic();
  const done = completedInTopic(topic);
  const level = getUnlockedLevel(topic);
  els.roadmapTitle.textContent = topic.title;
  els.roadmapBadge.textContent = `${done} / ${topic.lessons.length} · L${level}`;
  els.roadmapCopy.textContent = topic.copy;
  els.roadmapPath.innerHTML = "";

  topic.lessons.forEach((lesson, index) => {
    const isDone = Boolean(state.completed[lesson.id]);
    const isCurrent = index === currentLessonIndex;
    const isLocked = (lesson.difficulty || 1) > level;
    const node = document.createElement("div");
    node.className = `road-node${isDone ? " is-done" : ""}${isCurrent ? " is-current" : ""}${isLocked ? " is-locked" : ""}`;
    node.dataset.roadTopic = topic.id;
    node.dataset.roadIndex = String(index);
    if (isLocked) {
      node.setAttribute("aria-disabled", "true");
    }
    node.style.setProperty("--node-color", topic.color);
    node.innerHTML = `
      <span class="road-node-icon">${isLocked ? "L" : isDone ? "✓" : index + 1}</span>
      <span class="road-node-copy">
        <strong>${lesson.title}</strong>
        <small>${lessonLabels[lesson.kind]} · сложность ${lesson.difficulty || 1}/5${isLocked ? " · откроется позже" : ""}</small>
      </span>
      <span class="road-node-actions">
        ${
          isLocked
            ? `<span class="road-start-button is-disabled">Закрыто</span>`
            : `<a class="road-start-button" href="${escapeHtml(buildLessonHref(topic.id, index))}" data-road-start="true">Пройти</a>`
        }
      </span>
    `;
    els.roadmapPath.appendChild(node);
  });
}

function buildLessonHref(topicId, lessonIndex) {
  const url = new URL(window.location.href);
  url.searchParams.set("screen", "lesson");
  url.searchParams.set("topic", topicId);
  url.searchParams.set("lesson", String(lessonIndex));
  return `${url.pathname}${url.search}${url.hash}`;
}

function handleRoadmapClick(event) {
  const node = event.target.closest("[data-road-topic][data-road-index]");
  if (!node || node.getAttribute("aria-disabled") === "true" || node.disabled) return;
  if (event.target.closest("[data-road-start]")) {
    event.preventDefault();
    openLessonAt(node.dataset.roadTopic, Number(node.dataset.roadIndex));
    return;
  }
  currentTopicId = node.dataset.roadTopic;
  currentLessonIndex = Number(node.dataset.roadIndex);
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  saveState();
  renderRoadmap();
  renderSidebar();
}

function renderLesson() {
  selectedBlocks = [];
  selectedOption = null;
  selectedBugLine = null;
  typedCode = "";
  lastIdeaEvaluation = null;

  const topic = getCurrentTopic();
  const lesson = getCurrentLesson();
  activeBlockOrder = lesson.kind === "order" ? shuffle(lesson.blocks) : [];
  els.lessonTrack.textContent = topic.title;
  els.lessonTitle.textContent = lesson.title;
  els.lessonType.textContent = lessonLabels[lesson.kind];
  els.lessonPrompt.textContent = lesson.prompt;
  if (els.prevButton) els.prevButton.disabled = !findPreviousLesson();
  renderLessonBrief(lesson);
  renderLessonTerms(lesson);
  els.feedbackBox.hidden = true;
  els.feedbackBox.className = "feedback";

  if (lesson.kind === "order") renderOrder(lesson);
  if (lesson.kind === "choice") renderChoice(lesson);
  if (lesson.kind === "fill") renderFill(lesson);
  if (lesson.kind === "bug") renderBug(lesson);
  if (lesson.kind === "fix") renderCodeWrite(lesson, "Исправь код здесь");
  if (lesson.kind === "write") renderCodeWrite(lesson, "Напиши решение здесь");
  if (lesson.kind === "idea") renderIdea(lesson);
}

function renderLessonBrief(lesson) {
  if (!els.lessonBrief) return;
  const rows = buildLessonBriefRows(lesson);

  if (!rows.length) {
    els.lessonBrief.hidden = true;
    els.lessonBrief.innerHTML = "";
    return;
  }

  els.lessonBrief.hidden = false;
  els.lessonBrief.innerHTML = rows
    .map(
      ({ label, value }) => `
        <div class="brief-row">
          <span>${label}</span>
          <p>${formatBriefValue(value)}</p>
        </div>
      `,
    )
    .join("");
}

function buildLessonBriefRows(lesson) {
  if (isCodeBriefLesson(lesson)) {
    return [
      { label: "Вход", value: lesson.input || inferLessonInput(lesson) },
      { label: "Выход", value: lesson.output || inferLessonOutput(lesson) },
      { label: "Пример", value: lesson.examples || lesson.example || inferLessonExample(lesson) },
      { label: canRunPythonLessonTests(lesson) ? "Скрытые тесты" : "Проверка", value: lesson.hidden || lesson.check || lesson.testsText || inferLessonCheck(lesson) },
    ].filter((row) => row.value);
  }

  return [
    { label: "Контекст", value: lesson.input },
    { label: "Цель", value: lesson.output },
    { label: "Пример", value: lesson.examples || lesson.example || inferLessonExample(lesson) },
    { label: "Проверка", value: lesson.hidden || lesson.check },
  ].filter((row) => row.value);
}

function isCodeBriefLesson(lesson) {
  if (lesson.kind === "write") return true;
  if (lesson.kind !== "fix") return false;
  return Boolean(lesson.input || lesson.output || lesson.example || lesson.examples || lesson.check || lesson.hidden || lesson.testsText || canRunPythonLessonTests(lesson));
}

function inferLessonInput(lesson) {
  const promptInput = inferInputFromPrompt(lesson);
  if (promptInput) return promptInput;
  if (lesson.kind === "fix") return "Код в редакторе и контракт из условия.";
  if (lesson.kind === "write") {
    const signature = extractFunctionSignature(lesson);
    return signature ? `Аргументы функции \`${signature}\`.` : "Аргументы и структуры данных описаны в условии.";
  }
  return "";
}

function inferLessonOutput(lesson) {
  const promptOutput = inferOutputFromPrompt(lesson);
  if (promptOutput) return promptOutput;
  if (lesson.kind === "fix") return "Исправленная версия кода.";
  if (lesson.kind === "write") return "Полная реализация на Python с тем же именем функции.";
  return "";
}

function inferLessonExample(lesson) {
  if (lesson.sampleInput || lesson.sampleOutput) {
    return [
      lesson.sampleInput ? `input: ${lesson.sampleInput}` : "",
      lesson.sampleOutput ? `output: ${lesson.sampleOutput}` : "",
    ].filter(Boolean);
  }
  const promptExample = inferExampleFromPrompt(lesson);
  if (promptExample) return promptExample;
  const testExample = inferExampleFromPyTests(lesson);
  if (testExample) return testExample;
  return "";
}

function inferLessonCheck(lesson) {
  if (canRunPythonLessonTests(lesson)) return "Нужен GitHub-вход. Код запускается на серверных hidden tests; стиль решения не важен.";
  if (lesson.kind === "write" || lesson.kind === "fix") return "Сверяется поведение из условия; если runner недоступен, используется нормализованная сверка с эталоном.";
  return "";
}

function extractFunctionSignature(lesson) {
  const source = [lesson.starter, lesson.answer, lesson.prompt].filter(Boolean).join("\n");
  const defMatch = source.match(/def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
  if (defMatch) return `${defMatch[1]}(${defMatch[2].trim()})`;
  const inlineMatch = source.match(/`([A-Za-z_]\w*\([^`)]*\))`/);
  return inlineMatch ? inlineMatch[1] : "";
}

function inferInputFromPrompt(lesson) {
  const text = lesson.prompt || "";
  const lower = text.toLowerCase();
  const signature = extractFunctionSignature(lesson);

  if (lower.includes("mask_to_bbox")) return "mask: 2D numpy array или tensor. 0 означает фон, ненулевые пиксели считаются объектом.";
  if (lower.includes("bbox") && lower.includes("coco")) return "bbox в формате `[x1, y1, x2, y2]` с координатами в пикселях.";
  if (lower.includes("rle_encode")) return "mask: 2D numpy array HxW со значениями 0/1.";
  if (lower.includes("rle_decode")) return "rle: строка Kaggle RLE; shape: итоговый размер маски `(H, W)`.";
  if (lower.includes("iou") && lower.includes("mask")) return "pred и target: бинарные маски одинакового размера.";
  if (lower.includes("box_iou")) return "a и b: bbox `[x1, y1, x2, y2]` в exclusive-формате.";
  if (lower.includes("dice")) return "pred/prob/logits и target: маски одинаковой формы.";
  if (lower.includes("threshold")) return "probabilities/scores и true labels на validation.";
  if (lower.includes("train") || lower.includes("validation")) return "model, batch/loader и служебные объекты из условия: optimizer, criterion, device.";
  if (signature) return `Аргументы функции \`${signature}\` в формате из условия.`;
  return "";
}

function inferOutputFromPrompt(lesson) {
  const text = lesson.prompt || "";
  const lower = text.toLowerCase();
  const returnMatch = text.match(/(?:возвращает|верни|вернуть)\s+([^.;]+)(?:[.;]|$)/i);
  if (returnMatch) return returnMatch[1].trim();

  if (lower.includes("mask_to_bbox")) return "`[x1, y1, x2, y2]` или `None`, если foreground-пикселей нет.";
  if (lower.includes("rle_encode")) return "Kaggle RLE строка в column-major/Fortran порядке.";
  if (lower.includes("rle_decode")) return "2D numpy mask HxW со значениями 0/1.";
  if (lower.includes("iou")) return "float score от 0 до 1.";
  if (lower.includes("dice")) return "scalar Dice/Dice loss в формате из условия.";
  if (lesson.kind === "fix") return "Код с тем же смыслом, но без указанной ошибки.";
  if (lesson.kind === "write") return "Результат ровно в формате, описанном в условии.";
  return "";
}

function inferExampleFromPrompt(lesson) {
  const lower = (lesson.prompt || "").toLowerCase();
  if (lower.includes("mask_to_bbox")) {
    return [
      "mask = [[0,0,0], [0,1,1], [0,1,0]]",
      "mask_to_bbox(mask) -> [1, 1, 2, 2]",
      "mask = zeros((2, 3)) -> None",
    ];
  }
  if (lower.includes("box_iou")) {
    return ["a = [0,0,2,2], b = [1,1,3,3]", "box_iou(a, b) -> 1 / 7"];
  }
  if (lower.includes("rle_encode")) {
    return ["mask с foreground в двух соседних пикселях одного столбца", "rle_encode(mask) -> строка start length в Kaggle-формате"];
  }
  if (lower.includes("rle_decode")) {
    return ["rle = '2 3', shape = (2, 3)", "rle_decode(rle, shape) -> mask HxW с восстановленным foreground"];
  }
  return "";
}

function inferExampleFromPyTests(lesson) {
  const tests = lesson.pyTests?.code || "";
  if (!tests) return "";
  const signature = extractFunctionSignature(lesson);
  const name = signature.match(/^([A-Za-z_]\w*)\(/)?.[1];
  if (!name) return "";

  const examples = [];
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const equalityRe = new RegExp(`assert\\s+${escapedName}\\(([^\\n]+?)\\)\\s*==\\s*([^\\n]+)`, "g");
  for (const match of tests.matchAll(equalityRe)) {
    examples.push(`${name}(${match[1].trim()}) -> ${match[2].trim()}`);
    if (examples.length >= 2) break;
  }
  const noneRe = new RegExp(`assert\\s+${escapedName}\\(([^\\n]+?)\\)\\s+is\\s+None`, "g");
  for (const match of tests.matchAll(noneRe)) {
    examples.push(`${name}(${match[1].trim()}) -> None`);
    if (examples.length >= 2) break;
  }
  return examples.length ? examples : "";
}

function formatBriefValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => `<code>${escapeHtml(String(item))}</code>`).join("<br>");
  }
  const escaped = escapeHtml(String(value));
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderOrder(lesson) {
  const bank = activeBlockOrder.length ? activeBlockOrder : lesson.blocks;
  els.challengeHost.innerHTML = `
    <div class="answer-dropzone">
      <div class="answer-label">Твой код</div>
      <div class="selected-blocks" id="selectedBlocks">${renderSelectedBlocks()}</div>
    </div>
    <div class="block-bank" aria-label="Блоки кода">
      ${bank
        .map((block) => {
          const disabled = selectedBlocks.includes(block) ? "disabled" : "";
          return `<button class="code-block" data-action="add-block" data-value="${encodeURIComponent(block)}" type="button" ${disabled}>${escapeHtml(block)}</button>`;
        })
        .join("")}
    </div>
  `;
}

function renderSelectedBlocks() {
  if (!selectedBlocks.length) return "";
  return selectedBlocks
    .map(
      (block, index) =>
        `<button class="code-block selected-line" data-action="remove-block" data-index="${index}" type="button" title="Убрать строку">${escapeHtml(block)}</button>`,
    )
    .join("");
}

function renderChoice(lesson) {
  const options = shuffledChoiceOptions(lesson);
  els.challengeHost.innerHTML = `
    <div class="options-grid">
      ${options
        .map(
          (option) =>
            `<button class="option-card${selectedOption === option ? " is-selected" : ""}" data-action="select-option" data-value="${encodeURIComponent(option)}" type="button">${escapeHtml(option)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledChoiceOptions(lesson) {
  const options = [...(lesson.options || [])];
  let seed = stableHash(`${lesson.id}:${options.join("|")}`);
  for (let index = options.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
  }
  return options;
}

function renderFill(lesson) {
  els.challengeHost.innerHTML = `
    <pre class="code-panel"><code>${escapeHtml(lesson.code)}</code></pre>
    <div>
      ${lesson.blanks
        .map(
          (_, index) => `
            <div class="fill-row">
              <label for="blank-${index}">Пропуск ${index + 1}</label>
              <input id="blank-${index}" data-blank-index="${index}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="впиши код" />
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderBug(lesson) {
  els.challengeHost.innerHTML = `
    <div class="bug-lines">
      ${lesson.lines
        .map(
          (line, index) =>
            `<button class="bug-line${selectedBugLine === index ? " is-selected" : ""}" data-action="select-bug" data-index="${index}" type="button">${index + 1}. ${escapeHtml(line)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function renderCodeWrite(lesson, placeholder) {
  const starter = lesson.kind === "fix" ? lesson.code : lesson.starter || "";
  els.challengeHost.innerHTML = `
    ${lesson.kind === "fix" ? `<pre class="code-panel"><code>${escapeHtml(lesson.code)}</code></pre>` : ""}
    <div class="write-panel">
      <div class="answer-label">${placeholder}</div>
      <textarea class="code-textarea" id="codeAnswer" autocomplete="off" autocapitalize="off" spellcheck="false">${escapeHtml(starter)}</textarea>
      ${canRunPythonLessonTests(lesson) ? `<p class="tests-text">Hidden tests запускаются на сервере. Если сервер недоступен, MLingo попробует offline runner или запасную проверку.</p>` : ""}
    </div>
  `;
  document.getElementById("codeAnswer")?.addEventListener("keydown", handleCodeTextareaKeydown);
}

function renderIdea(lesson) {
  const criteria = lesson.rubric || [];
  els.challengeHost.innerHTML = `
    <div class="idea-panel">
      ${lesson.context ? `<pre class="code-panel idea-context"><code>${escapeHtml(lesson.context)}</code></pre>` : ""}
      <div class="answer-label">Напиши план решения своими словами</div>
      <textarea class="code-textarea idea-textarea" id="ideaAnswer" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="Например: валидация, baseline, что проверить, почему это должно сработать...">${escapeHtml(lesson.starter || "")}</textarea>
      ${
        criteria.length
          ? `<div class="idea-rubric">${criteria
              .map((item) => `<span>${escapeHtml(item.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${lesson.testsText ? `<p class="tests-text">${escapeHtml(lesson.testsText)}</p>` : ""}
    </div>
  `;
  document.getElementById("ideaAnswer")?.addEventListener("keydown", handleCodeTextareaKeydown);
}

function handleCodeTextareaKeydown(event) {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  if (event.shiftKey) {
    unindentSelection(textarea, start, end, value);
  } else {
    indentSelection(textarea, start, end, value);
  }
}

function indentSelection(textarea, start, end, value) {
  const indent = "    ";
  if (start === end || !value.slice(start, end).includes("\n")) {
    textarea.setRangeText(indent, start, end, "end");
    return;
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const selected = value.slice(lineStart, safeLineEnd);
  const updated = selected
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
  textarea.setRangeText(updated, lineStart, safeLineEnd, "select");
  textarea.selectionStart = lineStart;
  textarea.selectionEnd = lineStart + updated.length;
}

function unindentSelection(textarea, start, end, value) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = start === end ? start : value.indexOf("\n", end);
  const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const selected = value.slice(lineStart, safeLineEnd);
  const lines = selected.split("\n");
  let removedBeforeStart = 0;
  let removedTotal = 0;
  const updated = lines
    .map((line, index) => {
      const withoutIndent = line.replace(/^( {1,4}|\t)/, "");
      const removed = line.length - withoutIndent.length;
      if (index === 0) removedBeforeStart = Math.min(removed, Math.max(0, start - lineStart));
      removedTotal += removed;
      return withoutIndent;
    })
    .join("\n");
  textarea.setRangeText(updated, lineStart, safeLineEnd, "select");
  if (start === end) {
    const caret = Math.max(lineStart, start - removedBeforeStart);
    textarea.selectionStart = caret;
    textarea.selectionEnd = caret;
  } else {
    textarea.selectionStart = Math.max(lineStart, start - removedBeforeStart);
    textarea.selectionEnd = Math.max(textarea.selectionStart, end - removedTotal);
  }
}

function handleChallengeClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const lesson = getCurrentLesson();
  const action = button.dataset.action;
  if (action === "add-block") {
    selectedBlocks.push(decodeURIComponent(button.dataset.value));
    renderOrder(lesson);
  }
  if (action === "remove-block") {
    selectedBlocks.splice(Number(button.dataset.index), 1);
    renderOrder(lesson);
  }
  if (action === "select-option") {
    selectedOption = decodeURIComponent(button.dataset.value);
    renderChoice(lesson);
  }
  if (action === "select-bug") {
    selectedBugLine = Number(button.dataset.index);
    renderBug(lesson);
  }
}

function renderLessonTerms(lesson) {
  if (!els.lessonTerms) return;
  const terms = getLessonTerms(lesson).slice(0, 3);
  els.lessonTerms.hidden = terms.length === 0;
  els.lessonTerms.innerHTML = terms
    .map(
      (term) => `
        <div class="term-chip">
          <strong>${escapeHtml(term.title)}</strong>
          <span>${escapeHtml(term.body)}</span>
        </div>
      `,
    )
    .join("");
}

function showHint() {
  const lesson = getCurrentLesson();
  showFeedback("Подсказка", buildHintText(lesson), false);
}

function buildHintText(lesson) {
  const terms = getLessonTerms(lesson);
  const pieces = [];
  if (lesson.hint) pieces.push(`Идея задачи: ${lesson.hint}`);
  const concept = buildConceptHint(lesson);
  if (concept) pieces.push(concept);
  if (lesson.testsText) pieces.push(`Самопроверка: ${lesson.testsText}`);
  if (terms.length) {
    pieces.push(
      `Мини-словарь:\n${terms
        .slice(0, 4)
        .map((term) => {
          const lines = [`${term.title}: ${term.body}`];
          if (term.formula) lines.push(`Формула/shape: ${term.formula}`);
          if (term.contest) lines.push(`Практическая роль: ${term.contest}`);
          return lines.join("\n");
        })
        .join("\n\n")}`,
    );
  }
  return pieces.join("\n\n");
}

function buildMistakeText(lesson) {
  const terms = getLessonTerms(lesson);
  const pieces = [];
  const attempt = describeCurrentAttempt(lesson);
  const mismatch = buildMismatchHint(lesson);
  const concept = buildConceptHint(lesson);

  if (attempt) pieces.push(attempt);
  if (mismatch) pieces.push(mismatch);
  if (lesson.hint) pieces.push(`Ключевая идея: ${lesson.hint}`);
  if (concept) pieces.push(concept);
  if (lesson.testsText) pieces.push(`Мини-чеклист: ${lesson.testsText}`);
  if (terms.length) {
    const term = terms[0];
    pieces.push(`Термин рядом с ошибкой: ${term.title} — ${term.body}`);
  }

  return pieces.filter(Boolean).join("\n\n");
}

function describeCurrentAttempt(lesson) {
  if (lesson.kind === "choice") {
    return selectedOption ? `Выбран вариант: ${selectedOption}.` : "Вариант пока не выбран.";
  }
  if (lesson.kind === "bug") {
    return selectedBugLine === null ? "Строка пока не выбрана." : `Выбрана строка ${selectedBugLine + 1}.`;
  }
  if (lesson.kind === "order") {
    if (!selectedBlocks.length) return "Цепочка пока пустая.";
    return `Текущая цепочка по смыслу:\n${selectedBlocks.map((line, index) => `${index + 1}. ${lineConcept(line)}`).join("\n")}`;
  }
  if (lesson.kind === "fill") {
    const wrong = lesson.blanks
      .map((answer, index) => {
        const input = document.querySelector(`[data-blank-index="${index}"]`);
        const value = input?.value || "";
        return normalizeCode(value) === normalizeCode(answer) ? null : `пропуск ${index + 1}: «${value || "пусто"}»`;
      })
      .filter(Boolean);
    return wrong.length ? `Не совпали: ${wrong.join(", ")}.` : "";
  }
  if (lesson.kind === "fix" || lesson.kind === "write") {
    const lines = splitUsefulLines(typedCode);
    return lines.length ? `В коде сейчас ${lines.length} непустых строк. Проверяются смысловые действия, а не только общая идея.` : "Код пока пустой.";
  }
  if (lesson.kind === "idea") {
    const text = document.getElementById("ideaAnswer")?.value || "";
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words ? `В плане примерно ${words} слов. Проверяется не стиль, а наличие ключевых решений из рубрики.` : "План пока пустой.";
  }
  return "";
}

function buildMismatchHint(lesson) {
  if (lesson.kind === "order") return buildOrderMismatchHint(lesson);
  if (lesson.kind === "choice") return buildChoiceMismatchHint(lesson);
  if (lesson.kind === "fill") return buildFillMismatchHint(lesson);
  if (lesson.kind === "bug") return buildBugMismatchHint(lesson);
  if (lesson.kind === "fix" || lesson.kind === "write") return buildCodeMismatchHint(lesson);
  if (lesson.kind === "idea") return buildIdeaMismatchHint(lesson);
  return "";
}

function buildIdeaMismatchHint(lesson) {
  const evaluation = lastIdeaEvaluation || evaluateIdeaAnswer(lesson, document.getElementById("ideaAnswer")?.value || "");
  const pieces = [];
  if (evaluation.wordCount < (lesson.minWords || 35)) {
    pieces.push(`Ответ короткий: сейчас ${evaluation.wordCount} слов, а для этой задачи нужно хотя бы ${lesson.minWords || 35}.`);
  }
  if (evaluation.missing.length) {
    pieces.push(`Не хватает блоков плана: ${evaluation.missing.join(", ")}.`);
  }
  if (lesson.reference) pieces.push(`Эталонная рамка: ${lesson.reference}`);
  return pieces.join("\n\n");
}

function buildOrderMismatchHint(lesson) {
  const best = chooseClosestOrderAnswer(lesson);
  if (!best.length) return "";
  const mismatchIndex = firstMismatchIndex(selectedBlocks, best);
  if (mismatchIndex === -1 && selectedBlocks.length < best.length) {
    return `Следующий смысловой шаг: ${lineConcept(best[selectedBlocks.length])}.`;
  }
  if (mismatchIndex === -1) return "";
  const got = selectedBlocks[mismatchIndex];
  const expected = best[mismatchIndex];
  if (!got) return `Начни с действия: ${lineConcept(expected)}.`;
  return `Первый разъезд на шаге ${mismatchIndex + 1}: сейчас там «${lineConcept(got)}», а в этой логике сначала нужно «${lineConcept(expected)}».`;
}

function buildChoiceMismatchHint(lesson) {
  if (!selectedOption) return "Сначала выбрать вариант, затем проверить, какую сущность реально принимает функция/метрика в условии.";
  const selected = selectedOption.toLowerCase();
  if (selected.includes("sigmoid") || selected.includes("softmax") || selected.includes("argmax")) {
    return "Выбран вариант с преобразованием выхода модели. Нужно различать loss/training и inference/metric: loss часто хочет logits, а probability/class id нужны позже.";
  }
  if (selected.includes("one-hot") || selected.includes("float") || selected.includes("long")) {
    return "Тут важно не название loss, а формат target: class indices обычно `long`, бинарные/регрессионные target обычно `float`.";
  }
  return "Сравни варианты по контракту функции: что она принимает на вход и что возвращает. Не выбирай по знакомому слову, выбери по shape/dtype/стадии pipeline.";
}

function buildFillMismatchHint(lesson) {
  const wrong = lesson.blanks
    .map((answer, index) => {
      const input = document.querySelector(`[data-blank-index="${index}"]`);
      const value = input?.value || "";
      if (normalizeCode(value) === normalizeCode(answer)) return null;
      return `Пропуск ${index + 1}: смотри на выражение вокруг \`____\`; здесь нужен ${lineConcept(answer)}.`;
    })
    .filter(Boolean);
  return wrong.join("\n");
}

function buildBugMismatchHint(lesson) {
  if (selectedBugLine === null) return "Ищи строку, где нарушен контракт: неправильный dtype, shape, leakage, device или порядок pipeline.";
  const selected = lesson.lines?.[selectedBugLine] || "";
  return `Выбранная строка по смыслу: ${lineConcept(selected)}. Если это не ломает контракт из условия, ищи строку, где данные впервые становятся неправильными для следующей операции.`;
}

function buildCodeMismatchHint(lesson) {
  if (lastRunnerResult?.available && canRunPythonLessonTests(lesson)) {
    const runnerLabel = lastRunnerResult.via === "server" ? "Серверные тесты" : "Offline Python-тесты";
    return `${runnerLabel} не прошли:\n${lastRunnerResult.error || "проверь контракт задачи и edge cases."}`;
  }
  if (lastRunnerResult && !lastRunnerResult.available && canRunPythonLessonTests(lesson)) {
    return `Runner недоступен: ${lastRunnerResult.error}\nСейчас работает запасная сверка с эталонным кодом. На сайте кодовые задачи проверяются сервером; offline fallback требует Pyodide в \`vendor/pyodide\`.`;
  }
  const answer = chooseClosestTextAnswer(lesson);
  const answerLines = splitUsefulLines(answer);
  const userLines = splitUsefulLines(typedCode);
  if (!answerLines.length) return "";

  const missing = answerLines
    .filter((line) => isImportantLine(line) && !userLines.some((candidate) => equivalentCodeLine(candidate, line)))
    .slice(0, 3)
    .map((line) => `не найдено действие: ${lineConcept(line)}`);

  const diffIndex = firstDifferentLineIndex(userLines, answerLines);
  const diff = diffIndex === -1 ? "" : `Первый разъезд примерно на строке ${diffIndex + 1}: сейчас «${lineConcept(userLines[diffIndex] || "пусто")}», а нужно действие «${lineConcept(answerLines[diffIndex])}».`;
  const syntax = lesson.strictLines ? "Для этой задачи важны отступы, двоеточия после `for/if/with` и скобки у вызовов." : "";
  return [diff, missing.join("\n"), syntax].filter(Boolean).join("\n");
}

function buildConceptHint(lesson) {
  const text = [
    lesson.title,
    lesson.prompt,
    lesson.code,
    lesson.starter,
    lesson.context,
    lesson.reference,
    lesson.hint,
    lesson.explain,
    ...(lesson.rubric || []).map((item) => item.label),
    ...(lesson.blocks || []),
    ...(lesson.options || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("eval") || text.includes("no_grad") || text.includes("valid")) {
    return "Validation-инвариант: `eval()` фиксирует поведение dropout/batchnorm, `no_grad()` выключает граф, а метрика должна повторять leaderboard.";
  }
  if (text.includes("device") || text.includes("cuda")) {
    return "Device-инвариант: модель, входы и target должны оказаться на одном device до операции, которая их смешивает.";
  }
  if (text.includes("zero_grad") || text.includes("backward") || text.includes("optimizer")) {
    return "Train-step инвариант: очистить старые `.grad`, сделать forward, посчитать loss, вызвать backward, затем обновить веса.";
  }
  if (text.includes("accumulation")) {
    return "Gradient accumulation: `backward()` вызывается каждый mini-batch, а `step()` и `zero_grad()` только раз в N mini-batch; loss обычно делится на N.";
  }
  if (text.includes("bcewithlogits") || text.includes("crossentropy") || text.includes("logits")) {
    return "Pipeline: модель даёт logits. Training loss часто получает logits напрямую; probability (`sigmoid/softmax`) и class ids (`argmax/threshold`) обычно появляются уже для метрик, inference или postprocess.";
  }
  if (text.includes("dice") || text.includes("iou") || text.includes("threshold")) {
    return "Для segmentation держи цепочку: logits → probability → threshold/argmax → mask → metric/postprocess. Loss и metric могут хотеть разные стадии этой цепочки.";
  }
  if (text.includes("bbox") || text.includes("np.where") || text.includes("mask_to_bbox")) {
    return "В 2D маске координаты идут как `(y, x)`: строки — это y, столбцы — это x. Bbox обычно возвращают как `[x1, y1, x2, y2]`.";
  }
  if (text.includes("target encoding") || text.includes("leakage") || text.includes("fold")) {
    return "Leakage-инвариант: всё, что делает `fit` или считает статистику, должно видеть только train/fold-train. Validation имитирует будущее.";
  }
  if (text.includes("candidate") || text.includes("reranker") || text.includes("recsys")) {
    return "RecSys-инвариант: сначала генерируешь кандидатов без будущего и seen items, потом reranker сортирует кандидаты внутри каждого user.";
  }
  if (text.includes("density") || text.includes("count")) {
    return "Counting-инвариант: сумма density map — это predicted count; validation должна считать ошибку количества, если leaderboard про count.";
  }
  if (text.includes("dataset") || text.includes("dataloader") || text.includes("collate")) {
    return "Dataset возвращает один sample, DataLoader собирает batch, а `collate_fn` нужен, когда стандартный stack не подходит.";
  }
  return lesson.explain ? `Смысл задачи: ${lesson.explain}` : "";
}

function chooseClosestOrderAnswer(lesson) {
  return acceptedAnswers(lesson).reduce((best, answer) => (commonPrefixLength(selectedBlocks, answer) > commonPrefixLength(selectedBlocks, best) ? answer : best), acceptedAnswers(lesson)[0] || []);
}

function chooseClosestTextAnswer(lesson) {
  const user = normalizeCode(typedCode);
  return acceptedAnswers(lesson).reduce((best, answer) => {
    const bestScore = commonTokenScore(user, normalizeCode(best));
    const score = commonTokenScore(user, normalizeCode(answer));
    return score > bestScore ? answer : best;
  }, acceptedAnswers(lesson)[0] || "");
}

function commonPrefixLength(a, b) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  return index;
}

function firstMismatchIndex(a, b) {
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    if (a[index] !== b[index]) return index;
  }
  return -1;
}

function firstDifferentLineIndex(a, b) {
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    if (normalizeWrittenCode(a[index] || "") !== normalizeWrittenCode(b[index] || "")) return index;
  }
  return -1;
}

function splitUsefulLines(value) {
  return String(value || "")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
}

function equivalentCodeLine(a, b) {
  return normalizeCode(a) === normalizeCode(b);
}

function isImportantLine(line) {
  const trimmed = String(line || "").trim();
  return Boolean(trimmed) && !trimmed.startsWith("#");
}

function commonTokenScore(a, b) {
  if (!a || !b) return 0;
  let score = 0;
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    if (a[index] === b[index]) score += 1;
  }
  return score;
}

function lineConcept(line) {
  const raw = String(line || "").trim();
  const text = raw.toLowerCase();
  if (!raw) return "пустая строка";
  if (text.includes("zero_grad")) return "очистка старых градиентов";
  if (text.includes("backward")) return "расчёт градиентов через backward";
  if (text.includes("optimizer.step") || text.includes("scaler.step")) return "обновление весов оптимизатором";
  if (text.includes("scaler.update")) return "обновление GradScaler после AMP step";
  if (text.includes("autocast")) return "mixed precision forward/loss внутри autocast";
  if (text.includes("criterion") || text.includes("loss")) return "посчитать loss из prediction и target";
  if (text.includes("model.eval")) return "переключение модели в eval-режим";
  if (text.includes("model.train")) return "переключение модели в train-режим";
  if (text.includes("no_grad")) return "выключение autograd graph";
  if (text.includes("to(device)")) return "перенос tensor/model на device";
  if (text.includes("model(") || text.includes("logits") || text.includes("pred =")) return "forward: получить prediction/logits";
  if (text.includes("sigmoid")) return "перевести logits в probability для binary задачи";
  if (text.includes("softmax")) return "перевести logits в распределение вероятностей";
  if (text.includes("argmax")) return "выбрать class id по максимальному score";
  if (text.includes("threshold") || text.includes(">")) return "пороговать probability в дискретную маску/решение";
  if (text.includes("permute")) return "переставить оси изображения, например HWC → CHW";
  if (text.includes("cvtcolor") || text.includes("bgr2rgb")) return "перевести OpenCV BGR в RGB";
  if (text.includes("imread")) return "прочитать изображение с диска";
  if (text.includes("astype") || text.includes("float")) return "привести dtype к float для модели/loss";
  if (text.includes("long")) return "привести target к long class ids";
  if (text.includes("nearest")) return "resize маски без смешивания классов";
  if (text.includes("bilinear")) return "плавный resize изображения, но не class mask";
  if (text.includes("np.where") || text.includes("torch.where")) return "найти координаты foreground/условия";
  if (text.includes("logical_and") || text.includes("intersection")) return "посчитать пересечение масок";
  if (text.includes("logical_or") || text.includes("union")) return "посчитать объединение масок";
  if (text.includes("sum")) return "суммирование по нужным осям";
  if (text.includes("mean")) return "усреднение score/loss";
  if (text.includes("groupby")) return "агрегация по группе";
  if (text.includes("fit_transform")) return "опасный fit+transform, проверь leakage";
  if (text.includes(".fit(")) return "fit только на train/fold-train";
  if (text.includes(".transform(")) return "transform готовой статистикой";
  if (text.includes("stratify")) return "сохранить баланс классов в split";
  if (text.includes("argsort") || text.includes("sort_values")) return "сортировка score/rank";
  if (text.includes("value_counts")) return "частоты категорий/items";
  if (text.includes("clip_grad")) return "ограничить норму градиентов";
  if (text.includes("clip")) return "обрезать значения в безопасный диапазон";
  if (text.includes("return")) return "вернуть результат нужного формата";
  if (text.startsWith("for ")) return "цикл по batch/object/fold";
  if (text.startsWith("if ")) return "ветвление по условию";
  if (text.startsWith("with ")) return "context manager";
  return `строка \`${raw.length > 60 ? `${raw.slice(0, 57)}...` : raw}\``;
}

function getLessonTerms(lesson) {
  const explicit = new Set(lesson.terms || []);
  const text = [
    lesson.title,
    lesson.prompt,
    lesson.code,
    lesson.starter,
    lesson.context,
    lesson.reference,
    lesson.hint,
    lesson.explain,
    ...(lesson.rubric || []).map((item) => item.label),
    ...(lesson.blocks || []),
    ...(lesson.options || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return glossary.filter((term) => explicit.has(term.key) || term.aliases.some((alias) => text.includes(alias.toLowerCase())));
}

async function checkAnswer() {
  if (isCheckingAnswer) return;
  const lesson = getCurrentLesson();
  let ok = false;
  lastRunnerResult = null;

  try {
    if (canRunPythonLessonTests(lesson)) {
      if (!currentUser) {
        openAuthModal();
        showAuthStatus("Для задач с запуском кода нужен GitHub-вход. Так мы сможем ограничивать очередь runner-а и сохранять решения.");
        showFeedback("Нужен вход", "Кодовые задачи с hidden tests принимаются только после регистрации через GitHub.", false);
        return;
      }
      setCheckingUi(true);
      const input = document.getElementById("codeAnswer");
      typedCode = input?.value || "";
      showFeedback("Проверяю", "Отправляю код на серверную проверку. Если очередь занята, просто подождём.", null);
      lastRunnerResult = await runServerPythonLessonTests(lesson, typedCode);
      if (!lastRunnerResult.available && lesson.pyTests?.code) {
        showFeedback("Проверяю", "Серверный runner недоступен. Пробую offline Python runner в браузере.", null);
        const offlineResult = await runPythonLessonTests(lesson, typedCode);
        lastRunnerResult = offlineResult.available ? offlineResult : lastRunnerResult;
      }
      ok = lastRunnerResult.available ? lastRunnerResult.ok : checkDeterministicAnswer(lesson);
    } else {
      ok = checkDeterministicAnswer(lesson);
    }
  } finally {
    setCheckingUi(false);
  }

  if (ok) {
    const firstPass = !state.completed[lesson.id];
    state.completed[lesson.id] = true;
    state.completedDates[lesson.id] = todayKey();
    if (firstPass) state.xp += 12;
    updateStreak();
    saveState();
    const checkedByRunner = lastRunnerResult?.available && canRunPythonLessonTests(lesson);
    const successText = checkedByRunner
      ? `${lastRunnerResult.via === "server" ? "Серверные тесты" : "Python-тесты"} прошли.\n\n${lesson.explain}`
      : lesson.kind === "idea"
        ? `${lesson.explain}\n\n${lesson.reference || ""}`
        : lesson.explain;
    showFeedback("Верно", successText, true);
    sendEvent(lesson.id, true, firstPass ? 12 : 0);
    syncSolutionIfEnabled(lesson, firstPass);
    renderStats();
    renderTopics(document.querySelector(".filter-chip.is-active")?.dataset.filter || "all");
    renderRoadmap();
    renderSidebar();
  } else {
    state.misses[lesson.id] = (state.misses[lesson.id] || 0) + 1;
    saveState();
    sendEvent(lesson.id, false, 0);
    showFeedback("Пока нет", buildMistakeText(lesson), false);
    renderStats();
    renderSidebar();
  }
}

function checkDeterministicAnswer(lesson) {
  if (lesson.kind === "order") return acceptedAnswers(lesson).some((answer) => arraysEqual(selectedBlocks, answer));
  if (lesson.kind === "choice") return acceptedAnswers(lesson).includes(selectedOption);
  if (lesson.kind === "fill") {
    return lesson.blanks.every((answer, index) => {
      const input = document.querySelector(`[data-blank-index="${index}"]`);
      return normalizeCode(input?.value || "") === normalizeCode(answer);
    });
  }
  if (lesson.kind === "bug") return selectedBugLine === lesson.answer;
  if (lesson.kind === "fix" || lesson.kind === "write") {
    const input = document.getElementById("codeAnswer");
    typedCode = input?.value || "";
    return acceptedAnswers(lesson).some((answer) =>
      lesson.strictLines
        ? normalizeWrittenCode(typedCode) === normalizeWrittenCode(answer)
        : normalizeCode(typedCode) === normalizeCode(answer),
    );
  }
  if (lesson.kind === "idea") {
    const input = document.getElementById("ideaAnswer");
    typedCode = input?.value || "";
    lastIdeaEvaluation = evaluateIdeaAnswer(lesson, typedCode);
    return lastIdeaEvaluation.ok;
  }
  return false;
}

function canRunPythonLessonTests(lesson) {
  return Boolean((lesson.pyTests?.code || lesson.serverTests) && (lesson.kind === "write" || lesson.kind === "fix"));
}

function setCheckingUi(checking) {
  isCheckingAnswer = checking;
  if (!els.checkButton) return;
  els.checkButton.disabled = checking;
  els.checkButton.textContent = checking ? "Проверяю..." : "Проверить";
}

function getPyodideSources() {
  const localScriptUrl = new URL(PYODIDE_LOCAL_SCRIPT, window.location.href).href;
  const localIndexUrl = new URL("./vendor/pyodide/", window.location.href).href;
  const sources = [{ scriptUrl: localScriptUrl, indexUrl: localIndexUrl }];
  if (navigator.onLine) {
    sources.push({
      scriptUrl: PYODIDE_CDN_SCRIPT,
      indexUrl: PYODIDE_CDN_SCRIPT.replace(/pyodide\.js$/, ""),
    });
  }
  return sources;
}

function getPythonRunnerWorker() {
  if (pythonRunnerWorker) return pythonRunnerWorker;
  pythonRunnerWorker = new Worker(new URL("./python-runner-worker.js", window.location.href), { name: "mlingo-python-runner" });
  return pythonRunnerWorker;
}

async function runServerPythonLessonTests(lesson, code) {
  try {
    const data = await apiRequest("/api/runner/python", {
      method: "POST",
      body: {
        lessonId: lesson.id,
        code,
        timeoutMs: lesson.pyTests?.timeoutMs || PYTHON_RUNNER_TIMEOUT_MS,
      },
    });
    return {
      available: true,
      via: "server",
      ...(data.result || {}),
    };
  } catch (error) {
    return {
      available: false,
      via: "server",
      ok: false,
      error: error.message || "Серверный runner недоступен.",
    };
  }
}

function resetPythonRunnerWorker() {
  if (!pythonRunnerWorker) return;
  pythonRunnerWorker.terminate();
  pythonRunnerWorker = null;
}

function runPythonLessonTests(lesson, code) {
  if (!window.Worker) {
    return Promise.resolve({
      available: false,
      via: "offline",
      ok: false,
      error: "Web Worker недоступен в этом браузере.",
    });
  }

  const requestId = (pythonRunnerRequestId += 1);
  const timeoutMs = lesson.pyTests.timeoutMs || PYTHON_RUNNER_TIMEOUT_MS;
  const worker = getPythonRunnerWorker();

  return new Promise((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    const onMessage = (event) => {
      const message = event.data || {};
      if (message.id !== requestId) return;
      if (message.ok) {
        finish({
          available: true,
          via: "offline",
          ok: true,
          stdout: message.stdout || "",
        });
        return;
      }

      if (message.phase === "loading") resetPythonRunnerWorker();
      finish({
        available: message.phase !== "loading",
        via: "offline",
        ok: false,
        phase: message.phase,
        error: message.error || "Python-тесты завершились с ошибкой.",
      });
    };

    const onError = (event) => {
      finish({
        available: false,
        via: "offline",
        ok: false,
        error: event.message || "Не удалось запустить Python runner.",
      });
    };

    const timer = window.setTimeout(() => {
      resetPythonRunnerWorker();
      finish({
        available: true,
        via: "offline",
        ok: false,
        phase: "timeout",
        error: `Python-тесты не завершились за ${Math.round(timeoutMs / 1000)} сек. Проверь бесконечные циклы или слишком тяжелый код.`,
      });
    }, timeoutMs);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({
      id: requestId,
      code,
      setup: lesson.pyTests.setup || "",
      tests: lesson.pyTests.code,
      packages: lesson.pyTests.packages || [],
      sources: getPyodideSources(),
    });
  });
}

function nextLesson() {
  const topic = getCurrentTopic();
  const level = getUnlockedLevel(topic);
  let nextIndex = currentLessonIndex + 1;
  while (nextIndex < topic.lessons.length && (topic.lessons[nextIndex].difficulty || 1) > level) {
    nextIndex += 1;
  }
  currentLessonIndex = nextIndex;
  if (currentLessonIndex >= topic.lessons.length) {
    const topicIndex = topics.findIndex((item) => item.id === topic.id);
    currentTopicId = topics[(topicIndex + 1) % topics.length].id;
    currentLessonIndex = 0;
  }
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  saveState();
  renderAll();
  setScreen("lesson");
}

function findPreviousLesson() {
  const topic = getCurrentTopic();
  const level = getUnlockedLevel(topic);
  for (let index = currentLessonIndex - 1; index >= 0; index -= 1) {
    if ((topic.lessons[index].difficulty || 1) <= level) return { topicId: topic.id, index };
  }
  const topicIndex = topics.findIndex((item) => item.id === topic.id);
  for (let offset = 1; offset < topics.length; offset += 1) {
    const prevTopic = topics[(topicIndex - offset + topics.length) % topics.length];
    const prevLevel = getUnlockedLevel(prevTopic);
    for (let index = prevTopic.lessons.length - 1; index >= 0; index -= 1) {
      if ((prevTopic.lessons[index].difficulty || 1) <= prevLevel) return { topicId: prevTopic.id, index };
    }
  }
  return null;
}

function previousLesson() {
  const previous = findPreviousLesson();
  if (!previous) return;
  currentTopicId = previous.topicId;
  currentLessonIndex = previous.index;
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  saveState();
  renderAll();
  setScreen("lesson");
}

function startDaily() {
  const flat = flatLessons();
  const seed = Number(todayKey().replaceAll("-", ""));
  const pick = flat[seed % flat.length];
  currentTopicId = pick.topic.id;
  currentLessonIndex = pick.index;
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  saveState();
  renderAll();
  setScreen("lesson");
}

function renderSidebar() {
  const topic = getCurrentTopic();
  const done = completedInTopic(topic);
  const percent = Math.round((done / topic.lessons.length) * 100);
  const doneToday = Object.values(state.completedDates).filter((date) => date === todayKey()).length;
  els.sideTrackName.textContent = topic.title;
  els.sideTrackCopy.textContent = topic.copy;
  els.moduleProgressBar.style.width = `${percent}%`;
  els.moduleProgressText.textContent = `${done} из ${topic.lessons.length} узлов пройдено`;
  els.referenceList.innerHTML = topic.rules.map((rule) => `<div class="mini-row"><span>${rule}</span></div>`).join("");
  els.dailyQuests.innerHTML = `
    <div class="quest-row"><span>Пройти 3 мини-урока</span><strong>${Math.min(doneToday, 3)}/3</strong></div>
    <div class="quest-row"><span>Сделать один CV-узел</span><strong>${completedInTopic(topics[0]) ? "ok" : "0/1"}</strong></div>
    <div class="quest-row"><span>Один ручной ответ</span><strong>код</strong></div>
  `;
  renderWeakList();
  renderQueueList();
}

function renderPracticeSets() {
  els.bossGrid.innerHTML = practiceSets
    .map((set) => `<div class="boss-card"><strong>${set.title}</strong><small>${set.copy}</small></div>`)
    .join("");
}

function openIssueReport({ lesson = null, topic = null } = {}) {
  const title = lesson ? `Ошибка в уроке: ${lesson.title}` : "Ошибка или предложение по MLingo";
  const body = [
    "## Что не так?",
    "",
    "<опиши проблему коротко>",
    "",
    "## Где заметил",
    lesson ? `- Урок: ${lesson.title}` : "- Раздел: общий интерфейс / контент / сборка",
    lesson ? `- lessonId: ${lesson.id}` : "",
    topic ? `- Тема: ${topic.title}` : "",
    `- URL: ${window.location.href}`,
    "",
    "## Что ожидалось",
    "",
    "<как должно работать или звучать>",
  ]
    .filter((line) => line !== "")
    .join("\n");
  const url = `${PROJECT_ISSUES_URL}?${new URLSearchParams({
    title,
    body,
    labels: "content-feedback",
  }).toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderReviewSolutions() {
  if (!els.reviewSolutionList) return;
  if (!reviewSolutions.length) {
    els.reviewSolutionList.innerHTML = `<div class="empty-state">Пока нет публичных решений. Они появятся после GitHub sync.</div>`;
    if (els.reviewDetail) els.reviewDetail.innerHTML = `<div class="empty-state">Включи sync в профиле и реши write/fix/idea задачу.</div>`;
    return;
  }
  els.reviewSolutionList.innerHTML = reviewSolutions
    .map(
      (solution) => `
        <button class="review-row${solution.id === selectedReviewSolutionId ? " is-active" : ""}" data-review-id="${solution.id}" type="button">
          <span>
            <strong>${escapeHtml(solution.lessonTitle)}</strong>
            <small>${escapeHtml(solution.topicTitle || "MLingo")} · @${escapeHtml(solution.author || "user")}</small>
          </span>
          <em>${solution.commentCount || 0}</em>
        </button>
      `,
    )
    .join("");
}

function handleReviewListClick(event) {
  const button = event.target.closest("[data-review-id]");
  if (!button) return;
  selectedReviewSolutionId = Number(button.dataset.reviewId);
  renderReviewSolutions();
  fetchReviewSolutionDetail(selectedReviewSolutionId);
}

async function fetchReviewSolutions({ silent = false } = {}) {
  if (!silent) showReviewStatus("Загружаю разборы...", true);
  try {
    const data = await apiRequest("/api/review/solutions", { skipAuth: true });
    reviewSolutions = data.solutions || [];
    if (!selectedReviewSolutionId && reviewSolutions[0]) selectedReviewSolutionId = reviewSolutions[0].id;
    renderReviewSolutions();
    if (selectedReviewSolutionId) await fetchReviewSolutionDetail(selectedReviewSolutionId, { silent: true });
    showReviewStatus(reviewSolutions.length ? "" : "Пока нет решений для разбора.", true);
  } catch (error) {
    renderReviewSolutions();
    showReviewStatus(`Разборы недоступны: ${error.message}`, false);
  }
}

async function fetchReviewSolutionDetail(solutionId, { silent = false } = {}) {
  if (!els.reviewDetail || !solutionId) return;
  if (!silent) els.reviewDetail.innerHTML = `<div class="empty-state">Открываю решение...</div>`;
  try {
    const data = await apiRequest(`/api/review/solutions/${solutionId}`, { skipAuth: true });
    renderReviewDetail(data.solution, data.comments || []);
  } catch (error) {
    els.reviewDetail.innerHTML = `<div class="empty-state">Не удалось открыть решение: ${escapeHtml(error.message)}</div>`;
  }
}

function renderReviewDetail(solution, comments) {
  if (!els.reviewDetail || !solution) return;
  const language = solution.kind === "idea" ? "markdown" : "python";
  els.reviewDetail.innerHTML = `
    <div class="review-detail-head">
      <div>
        <span class="eyebrow">${escapeHtml(solution.kind)} · ${escapeHtml(solution.topicTitle || "MLingo")}</span>
        <h3>${escapeHtml(solution.lessonTitle)}</h3>
        <small>@${escapeHtml(solution.author || "user")} · ${formatTimestamp(solution.createdAt)}</small>
      </div>
      ${solution.githubUrl ? `<a class="ghost-button link-button" href="${escapeHtml(solution.githubUrl)}" target="_blank" rel="noreferrer">GitHub</a>` : ""}
    </div>
    <pre class="code-panel review-code"><code class="language-${language}">${escapeHtml(solution.answer || "")}</code></pre>
    <div class="review-comments">
      <strong>Комментарии</strong>
      ${
        comments.length
          ? comments
              .map(
                (comment) => `
                  <div class="review-comment">
                    <span>@${escapeHtml(comment.author || "user")} · ${formatTimestamp(comment.createdAt)}</span>
                    <p>${escapeHtml(comment.body)}</p>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty-state">Пока нет комментариев. Можно оставить первый разбор.</div>`
      }
    </div>
    <div class="review-comment-form">
      <textarea id="reviewCommentInput" class="code-textarea" placeholder="Что хорошо, где edge case, как бы ты упростил или проверил решение?"></textarea>
      <button class="primary-button" data-action="post-review-comment" data-review-id="${solution.id}" type="button">Отправить разбор</button>
    </div>
  `;
}

function handleReviewDetailClick(event) {
  const button = event.target.closest("[data-action='post-review-comment']");
  if (!button) return;
  postReviewComment(Number(button.dataset.reviewId));
}

async function postReviewComment(solutionId) {
  if (!currentUser) {
    openAuthModal();
    showReviewStatus("Чтобы оставить разбор, войди через GitHub.", false);
    return;
  }
  const input = document.getElementById("reviewCommentInput");
  const body = (input?.value || "").trim();
  if (body.length < 8) {
    showReviewStatus("Комментарий слишком короткий.", false);
    return;
  }
  try {
    await apiRequest(`/api/review/solutions/${solutionId}/comments`, {
      method: "POST",
      body: { body },
    });
    if (input) input.value = "";
    showReviewStatus("Разбор опубликован.", true);
    await fetchReviewSolutions({ silent: true });
    await fetchReviewSolutionDetail(solutionId, { silent: true });
  } catch (error) {
    showReviewStatus(error.message, false);
  }
}

function showReviewStatus(text, good = false) {
  if (!els.reviewStatus) return;
  els.reviewStatus.hidden = !text;
  els.reviewStatus.className = `feedback pack-status ${good ? "is-good" : "is-bad"}`;
  els.reviewStatus.textContent = text;
}

function renderLibrary() {
  if (els.theoryGrid) {
    ensureTheorySelection();
    const group = getCurrentTheoryGroup();
    const article = group.cards[currentTheoryArticleIndex] || group.cards[0];
    els.theoryGrid.innerHTML = `
      <div class="theory-topic-grid" aria-label="Темы теории">
        ${theoryChapters
          .map(
            (chapter) => `
              <button class="theory-topic-button${chapter.id === currentTheoryId ? " is-active" : ""}" data-theory-id="${escapeHtml(chapter.id)}" type="button">
                <span>${escapeHtml(chapter.level)}</span>
                <strong>${escapeHtml(chapter.title)}</strong>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="theory-panel">
        <div class="theory-subtopic-grid" aria-label="Подтемы">
          ${group.cards
            .map(
              (card, index) => `
                <button class="theory-subtopic-button${index === currentTheoryArticleIndex ? " is-active" : ""}" data-theory-article="${index}" type="button">
                  ${escapeHtml(card.title)}
                </button>
              `,
            )
            .join("")}
        </div>
        ${renderTheoryArticle(group, article, currentTheoryArticleIndex)}
      </div>
    `;
  }
  if (els.libraryGrid) {
    els.libraryGrid.innerHTML = libraryCards
      .map((card) => `<div class="library-card"><strong>${card.title}</strong><p>${card.text}</p></div>`)
      .join("");
  }
  if (els.packSourceInput) {
    els.packSourceInput.value = localStorage.getItem(PACK_SOURCE_STORAGE_KEY) || DEFAULT_PACK_INDEX_URL;
  }
  if (els.appVersionBadge) els.appVersionBadge.textContent = `v${APP_VERSION}`;
  renderGithubIntegration();
}

function ensureTheorySelection() {
  if (!theoryChapters.some((chapter) => chapter.id === currentTheoryId)) {
    currentTheoryId = theoryChapters[0].id;
    currentTheoryArticleIndex = 0;
  }
  const group = getCurrentTheoryGroup();
  if (!group.cards[currentTheoryArticleIndex]) currentTheoryArticleIndex = 0;
}

function getCurrentTheoryGroup() {
  return theoryChapters.find((chapter) => chapter.id === currentTheoryId) || theoryChapters[0];
}

function handleTheoryClick(event) {
  const topicButton = event.target.closest("[data-theory-id]");
  if (topicButton) {
    currentTheoryId = topicButton.dataset.theoryId;
    currentTheoryArticleIndex = 0;
    state.currentTheoryId = currentTheoryId;
    state.currentTheoryArticleIndex = currentTheoryArticleIndex;
    saveState();
    renderLibrary();
    return;
  }

  const articleButton = event.target.closest("[data-theory-article]");
  if (articleButton) {
    currentTheoryArticleIndex = Number(articleButton.dataset.theoryArticle);
    state.currentTheoryId = currentTheoryId;
    state.currentTheoryArticleIndex = currentTheoryArticleIndex;
    saveState();
    renderLibrary();
  }
}

function renderTheoryArticle(group, card, index) {
  return `
    <article class="theory-reader">
      <div class="theory-reader-head">
        <div>
          <span class="eyebrow">${escapeHtml(group.level)}</span>
          <h3>${escapeHtml(card.title)}</h3>
        </div>
        <span class="lesson-type">${index + 1} / ${group.cards.length}</span>
      </div>
      <p>${escapeHtml(card.body)}</p>
      <ul class="theory-points">
        ${card.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <pre class="theory-code"><code>${escapeHtml(card.code)}</code></pre>
    </article>
  `;
}

function renderTheoryDiagram(kind) {
  const diagrams = {
    detection: `
      <div class="theory-diagram diagram-detection" aria-hidden="true">
        <div class="diagram-image"><span class="bbox subject">person</span><span class="bbox object">bike</span></div>
        <div class="diagram-row"><span>xyxy</span><i></i><span>xywh</span><i></i><span>target</span></div>
      </div>
    `,
    start: `
      <div class="theory-diagram diagram-start" aria-hidden="true">
        <div class="shape-chip">shape</div>
        <div class="shape-chip">dtype</div>
        <div class="shape-chip">split</div>
      </div>
    `,
    detr: `
      <div class="theory-diagram diagram-detr" aria-hidden="true">
        <div class="query-stack"><span>q1</span><span>q2</span><span>q3</span><span>no</span></div>
        <div class="match-lines"><i></i><i></i><i></i></div>
        <div class="target-stack"><span>box A</span><span>box B</span><span>empty</span></div>
      </div>
    `,
    segmentation: `
      <div class="theory-diagram diagram-segmentation" aria-hidden="true">
        <div class="mask-panel logits">logits</div>
        <i></i>
        <div class="mask-panel prob">sigmoid</div>
        <i></i>
        <div class="mask-panel mask">mask</div>
      </div>
    `,
    relation: `
      <div class="theory-diagram diagram-relation" aria-hidden="true">
        <div class="pair-box"><span>subject</span><strong>→</strong><span>object</span></div>
        <div class="feature-pills"><span>IoU</span><span>dx</span><span>labels</span></div>
        <div class="predicate-pill">predicate</div>
      </div>
    `,
    recsys: `
      <div class="theory-diagram diagram-recsys" aria-hidden="true">
        <div class="candidate-cloud"><span></span><span></span><span></span><span></span><span></span></div>
        <i></i>
        <div class="ranked-list"><span>1</span><span>2</span><span>3</span></div>
      </div>
    `,
    diffusion: `
      <div class="theory-diagram diagram-diffusion" aria-hidden="true">
        <div class="noise-frame clean"></div>
        <i></i>
        <div class="noise-frame noisy"></div>
        <i></i>
        <div class="noise-frame pure"></div>
      </div>
    `,
  };
  return diagrams[kind] || "";
}

function renderStats() {
  const flat = flatLessons();
  const done = flat.filter(({ lesson }) => state.completed[lesson.id]).length;
  const misses = Object.values(state.misses).reduce((sum, value) => sum + value, 0);
  const mastery = Math.round((done / flat.length) * 100);
  els.railProgress.textContent = `${done} / ${flat.length}`;
  els.xpValue.textContent = state.xp;
  els.fireValue.textContent = state.streak;
  els.masteryValue.textContent = `${mastery}%`;
  els.profileXp.textContent = state.xp;
  els.profileStreak.textContent = state.streak;
  els.profileDone.textContent = done;
  els.profileMisses.textContent = misses;
  renderAuthUi();
}

function renderWeakList() {
  const misses = Object.entries(state.misses).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!misses.length) {
    els.weakList.innerHTML = `<div class="mini-row"><span>Пока слабых мест нет</span><strong>чисто</strong></div>`;
    return;
  }
  els.weakList.innerHTML = misses
    .map(([id, count]) => {
      const found = findLesson(id);
      return `<div class="mini-row"><span>${found?.lesson.title || id}</span><strong>${count}</strong></div>`;
    })
    .join("");
}

function renderQueueList() {
  if (!els.queueList) return;
  const flat = flatLessons();
  const unlockedFlat = flat.filter(({ topic, lesson }) => (lesson.difficulty || 1) <= getUnlockedLevel(topic));
  const currentFlatIndex = flat.findIndex(
    ({ topic, index }) => topic.id === currentTopicId && index === currentLessonIndex,
  );
  const currentUnlockedIndex = unlockedFlat.findIndex(
    ({ topic, index }) => topic.id === currentTopicId && index === currentLessonIndex,
  );
  const start = currentUnlockedIndex === -1 ? Math.max(0, currentFlatIndex) : currentUnlockedIndex;
  const queue = (currentUnlockedIndex === -1 ? flat : unlockedFlat).slice(start, start + 5);
  els.queueList.innerHTML = queue
    .map(
      ({ topic, lesson, index }, offset) => `
        <button class="queue-row${offset === 0 ? " is-current" : ""}" data-topic="${topic.id}" data-index="${index}" type="button">
          <span>
            <strong>${lesson.title}</strong>
            <small>${topic.title} · L${lesson.difficulty || 1}</small>
          </span>
          <em>${lessonLabels[lesson.kind]}</em>
        </button>
      `,
    )
    .join("");
}

function handleQueueClick(event) {
  const button = event.target.closest("[data-topic][data-index]");
  if (!button) return;
  currentTopicId = button.dataset.topic;
  currentLessonIndex = Number(button.dataset.index);
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  saveState();
  renderAll();
  setScreen("lesson");
}

function showFeedback(label, text, good) {
  els.feedbackBox.hidden = false;
  const stateClass = good === null ? "is-running" : good ? "is-good" : "is-bad";
  els.feedbackBox.className = `feedback ${stateClass}`;
  els.feedbackBox.innerHTML = `<strong>${escapeHtml(label)}.</strong>${formatFeedbackText(text)}`;
}

function maybeOpenGuide() {
  if (isAuthLocked()) return;
  if (localStorage.getItem(GUIDE_SEEN_KEY)) return;
  window.setTimeout(() => openGuideModal(), 450);
}

function openGuideModal({ manual = false } = {}) {
  if (!els.guideModal) return;
  if (manual) localStorage.setItem(GUIDE_SEEN_KEY, "1");
  els.guideModal.hidden = false;
  els.guideStartButton?.focus();
}

function closeGuideModal({ remember = true } = {}) {
  if (!els.guideModal) return;
  if (remember) localStorage.setItem(GUIDE_SEEN_KEY, "1");
  els.guideModal.hidden = true;
}

function isAuthLocked() {
  return AUTH_REQUIRED && !currentUser;
}

function enforceAuthGate() {
  renderAuthUi();
  if (isAuthLocked()) openAuthModal();
}

function openAuthModal() {
  els.authModal.hidden = false;
  els.authModal.dataset.locked = isAuthLocked() ? "true" : "false";
  renderAuthUi({ skipGate: true });
  els.githubLoginButton?.focus();
}

function closeAuthModal() {
  if (isAuthLocked()) {
    showAuthStatus("Сначала войди через GitHub. Потом MLingo откроет карту и уроки.");
    return;
  }
  els.authModal.hidden = true;
}

function showAuthStatus(text, good = false) {
  els.authStatus.hidden = false;
  els.authStatus.className = `feedback auth-feedback ${good ? "is-good" : "is-bad"}`;
  els.authStatus.textContent = text;
}

function startGithubLogin() {
  if (!runtimeConfig.githubOAuth) {
    openAuthModal();
    showAuthStatus("GitHub OAuth пока не настроен на backend. Можно продолжать тренироваться без входа.");
    showGithubIntegrationMessage("Backend OAuth не настроен. Для облачного аккаунта позже добавь GitHub OAuth App.", false);
    return;
  }
  window.location.assign(`${API_BASE}/api/auth/github/start`);
}

async function saveGithubDirectSettings() {
  const token = (els.githubTokenInput?.value || "").trim();
  const repo = (els.githubRepoInput?.value || "mlingo-solutions").trim();
  const ownerFromInput = (els.githubOwnerInput?.value || "").trim();
  if (!repo) {
    showGithubIntegrationMessage("Укажи название repo.");
    return;
  }
  let owner = ownerFromInput;
  if (token) {
    localStorage.setItem(GITHUB_DIRECT_TOKEN_KEY, token);
  }
  const savedToken = getGithubDirectToken();
  if (!savedToken) {
    showGithubIntegrationMessage("Вставь GitHub token с Contents: Read and write.");
    return;
  }
  try {
    if (!owner) {
      const me = await githubDirectRequest("/user");
      owner = me.login;
    }
    saveGithubDirectConfig({ owner, repo, enabled: true });
    if (els.githubTokenInput) els.githubTokenInput.value = "";
    renderGithubIntegration();
    showGithubIntegrationMessage(`Serverless sync подключен: ${owner}/${repo}.`, true);
  } catch (error) {
    showGithubIntegrationMessage(error.message);
  }
}

function clearGithubDirectSettings() {
  localStorage.removeItem(GITHUB_DIRECT_CONFIG_KEY);
  localStorage.removeItem(GITHUB_DIRECT_TOKEN_KEY);
  if (els.githubTokenInput) els.githubTokenInput.value = "";
  renderGithubIntegration();
  showGithubIntegrationMessage("Локальный GitHub token удален с этого устройства.", true);
}

async function enableGithubRepoMode() {
  const direct = getGithubDirectConfig();
  if (direct.enabled && getGithubDirectToken()) {
    await pushProgressToGithubDirect();
    return;
  }
  if (!currentUser?.github) {
    startGithubLogin();
    return;
  }
  if (!runtimeConfig.githubRepoWrite) {
    showGithubIntegrationMessage("Backend OAuth сейчас без public_repo. Для прямой записи в repo вставь token выше.");
    return;
  }
  if (!currentUser.github.canWriteRepo) {
    showGithubIntegrationMessage("Нужно обновить права GitHub. Сейчас отправлю на OAuth с public_repo.", false);
    startGithubLogin();
    return;
  }
  const repoName = (els.githubRepoInput?.value || currentUser.github.repo?.name || "mlingo-solutions").trim();
  try {
    const data = await apiRequest("/api/github/repo/enable", {
      method: "POST",
      body: { repoName },
    });
    currentUser = data.user;
    renderAuthUi();
    showGithubIntegrationMessage(`Repo mode включен: ${data.repo?.fullName || repoName}.`, true);
  } catch (error) {
    showGithubIntegrationMessage(error.message);
  }
}

async function disconnectGithub() {
  if (!currentUser) {
    openAuthModal();
    showGithubIntegrationMessage("Сначала войди в аккаунт MLingo.", false);
    return;
  }
  if (!currentUser.github) {
    showGithubIntegrationMessage("GitHub уже не подключен.", true);
    return;
  }
  try {
    const data = await apiRequest("/api/auth/github/disconnect", { method: "POST" });
    currentUser = data.user;
    renderAuthUi();
    showGithubIntegrationMessage("GitHub отключен от аккаунта.", true);
  } catch (error) {
    showGithubIntegrationMessage(error.message);
  }
}

async function disableGithubRepoMode() {
  const direct = getGithubDirectConfig();
  if (direct.enabled) {
    saveGithubDirectConfig({ ...direct, enabled: false });
    renderGithubIntegration();
    showGithubIntegrationMessage("Serverless GitHub sync поставлен на паузу. Token остался на устройстве.", true);
    return;
  }
  if (!currentUser?.github) {
    showGithubIntegrationMessage("GitHub не подключен.", false);
    return;
  }
  try {
    const data = await apiRequest("/api/github/repo/disable", { method: "POST" });
    currentUser = data.user;
    renderAuthUi();
    showGithubIntegrationMessage("Автосохранение решений в GitHub поставлено на паузу.", true);
  } catch (error) {
    showGithubIntegrationMessage(error.message);
  }
}

async function loadRuntimeConfig() {
  try {
    const data = await apiRequest("/api/config", { skipAuth: true });
    runtimeConfig = {
      ...runtimeConfig,
      githubOAuth: Boolean(data.githubOAuth),
      githubRepoWrite: Boolean(data.githubRepoWrite),
    };
  } catch {
    runtimeConfig = { ...runtimeConfig, githubOAuth: false, githubRepoWrite: false };
  }
  renderAuthUi();
}

async function logout() {
  try {
    await apiRequest("/api/logout", { method: "POST" });
  } catch {
    // Token or cookie may already be dead; local UI logout is still useful.
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  currentUser = null;
  renderAuthUi();
  renderLeaderboard([]);
  showAuthStatus("Вышел из аккаунта.", true);
}

async function bootstrapAccount() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  renderAuthUi();
  const authResult = new URLSearchParams(window.location.search).get("auth");
  if (authResult === "github") {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    await bootstrapGithubAccount();
    return;
  }
  if (authResult === "github-error") {
    openAuthModal();
    showAuthStatus("GitHub не смог авторизовать вход. Попробуй еще раз.");
    history.replaceState(null, "", window.location.pathname);
  }
  if (!token) {
    const cookieAccount = await bootstrapCookieAccount();
    if (!cookieAccount) fetchLeaderboard();
    return;
  }
  try {
    const data = await apiRequest("/api/me");
    currentUser = data.user;
    mergeRemoteProgress(data.progress);
    renderAll();
    renderLeaderboard(data.leaderboard);
    queueProgressSync();
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    currentUser = null;
    renderAuthUi();
    fetchLeaderboard();
  }
}

async function bootstrapGithubAccount() {
  try {
    const data = await apiRequest("/api/me", { skipAuth: true });
    currentUser = data.user;
    mergeRemoteProgress(data.progress);
    renderAll();
    renderLeaderboard(data.leaderboard);
    queueProgressSync();
    showAuthStatus("Вошёл через GitHub. Прогресс синхронизирован.", true);
  } catch {
    currentUser = null;
    renderAuthUi();
    fetchLeaderboard();
    openAuthModal();
    showAuthStatus("GitHub-сессия не подтянулась. Проверь настройки backend OAuth.");
  } finally {
    history.replaceState(null, "", window.location.pathname);
  }
}

async function bootstrapCookieAccount() {
  try {
    const data = await apiRequest("/api/me", { skipAuth: true });
    currentUser = data.user;
    mergeRemoteProgress(data.progress);
    renderAll();
    renderLeaderboard(data.leaderboard);
    queueProgressSync();
    return true;
  } catch {
    currentUser = null;
    renderAuthUi();
    return false;
  }
}

function mergeRemoteProgress(progress) {
  if (!progress?.state) return;
  const remote = progress.state;
  isApplyingRemote = true;
  state.completed = { ...(state.completed || {}), ...(remote.completed || {}) };
  state.completedDates = { ...(state.completedDates || {}), ...(remote.completedDates || {}) };
  state.misses = { ...(remote.misses || {}), ...(state.misses || {}) };
  state.xp = Math.max(Number(state.xp || 0), Number(progress.xp || remote.xp || 0));
  state.streak = Math.max(Number(state.streak || 0), Number(progress.streak || remote.streak || 0));
  isApplyingRemote = false;
}

function renderAuthUi({ skipGate = false } = {}) {
  if (!els.accountButton) return;
  const provider = currentUser?.github?.login ? " · GitHub" : "";
  const locked = isAuthLocked();
  document.body.classList.toggle("auth-required", locked);
  els.accountButton.textContent = currentUser ? `@${currentUser.username}${provider}` : "Меню";
  if (els.menuLoginButton) els.menuLoginButton.hidden = Boolean(currentUser);
  if (els.menuLogoutButton) els.menuLogoutButton.hidden = !currentUser;
  if (els.authModal) els.authModal.dataset.locked = locked ? "true" : "false";
  if (els.authCloseButton) els.authCloseButton.hidden = locked;
  if (els.logoutButton) els.logoutButton.hidden = !currentUser;
  if (els.githubLoginButton) {
    els.githubLoginButton.hidden = Boolean(currentUser);
    els.githubLoginButton.classList.toggle("is-unavailable", !runtimeConfig.githubOAuth && !currentUser);
  }
  if (els.githubAuthHint) {
    els.githubAuthHint.textContent = runtimeConfig.githubOAuth
      ? "GitHub создаст аккаунт автоматически и привяжет профиль."
      : "Backend OAuth не настроен: нужны GITHUB_CLIENT_ID и GITHUB_CLIENT_SECRET.";
  }
  renderGithubIntegration();
  if (locked && !skipGate && els.authModal?.hidden) openAuthModal();
}

function renderGithubIntegration() {
  if (!els.githubIntegrationPanel) return;
  const direct = getGithubDirectConfig();
  const directToken = Boolean(getGithubDirectToken());
  const directReady = Boolean(direct.enabled && directToken);
  const connected = Boolean(currentUser?.github);
  const repoEnabled = Boolean(currentUser?.github?.repo?.enabled);
  const canWrite = Boolean(currentUser?.github?.canWriteRepo && runtimeConfig.githubRepoWrite);
  els.githubIntegrationPanel.classList.toggle("is-connected", connected || directToken);
  els.githubIntegrationPanel.classList.toggle("is-syncing", repoEnabled || directReady);
  els.githubIntegrationPanel.classList.toggle("is-disabled", !runtimeConfig.githubOAuth && !connected && !directToken);
  els.githubIntegrationMark.textContent = repoEnabled || directReady ? "↗" : connected || directToken ? "✓" : "GH";
  els.githubIntegrationTitle.textContent = directReady ? "Serverless GitHub sync включен" : repoEnabled ? "Solutions repo включен" : connected ? "Подключен к GitHub" : directToken ? "Token сохранен" : "GitHub не подключен";
  if (directReady) {
    els.githubIntegrationSubtitle.textContent = `${direct.owner || "owner"}/${direct.repo || "mlingo-solutions"}`;
  } else if (directToken) {
    els.githubIntegrationSubtitle.textContent = "Token есть, нажми “Сохранить token” или “Сохранить прогресс”.";
  } else if (repoEnabled) {
    els.githubIntegrationSubtitle.textContent = currentUser.github.repo?.fullName || currentUser.github.repo?.name || "mlingo-solutions";
  } else if (connected && !canWrite) {
    els.githubIntegrationSubtitle.textContent = runtimeConfig.githubRepoWrite ? "Нужно обновить GitHub-права для записи решений." : "Backend OAuth пока без public_repo.";
  } else if (connected) {
    els.githubIntegrationSubtitle.textContent = `@${currentUser.github.login || currentUser.username}`;
  } else if (runtimeConfig.githubOAuth) {
    els.githubIntegrationSubtitle.textContent = currentUser ? "GitHub уже основной способ входа." : "Войди через GitHub, аккаунт MLingo создастся автоматически.";
  } else {
    els.githubIntegrationSubtitle.textContent = "Вставь GitHub token для прямой записи в repo.";
  }
  if (els.githubConnectButton) els.githubConnectButton.hidden = connected || !runtimeConfig.githubOAuth;
  if (els.githubTokenClearButton) els.githubTokenClearButton.hidden = !directToken;
  if (els.githubProgressPushButton) els.githubProgressPushButton.hidden = !directToken;
  if (els.githubProgressPullButton) els.githubProgressPullButton.hidden = !directToken;
  if (els.githubRepoEnableButton) {
    els.githubRepoEnableButton.hidden = directReady || repoEnabled || (!connected && !directToken);
    els.githubRepoEnableButton.disabled = connected && !directToken && !runtimeConfig.githubRepoWrite;
    els.githubRepoEnableButton.textContent = directToken ? "Включить sync" : canWrite ? "Включить sync" : "Дать write-доступ";
  }
  if (els.githubRepoDisableButton) els.githubRepoDisableButton.hidden = !repoEnabled && !directReady;
  if (els.githubOwnerInput) {
    els.githubOwnerInput.value = direct.owner || els.githubOwnerInput.value || "";
    els.githubOwnerInput.disabled = directReady;
  }
  if (els.githubRepoInput) {
    els.githubRepoInput.value = direct.repo || currentUser?.github?.repo?.name || els.githubRepoInput.value || "mlingo-solutions";
    els.githubRepoInput.disabled = repoEnabled || directReady;
  }
  if (els.githubDisconnectButton) els.githubDisconnectButton.hidden = !connected;
  if (els.githubDisconnectButton) {
    els.githubDisconnectButton.disabled = connected && !currentUser.hasPassword;
    els.githubDisconnectButton.title = connected && !currentUser.hasPassword ? "Нельзя отключить единственный способ входа" : "";
  }
  if (els.githubRepoLine) {
    const fullName = directReady
      ? `${direct.owner}/${direct.repo}`
      : currentUser?.github?.repo?.fullName || `${currentUser?.github?.login || currentUser?.username || "username"}/${currentUser?.github?.repo?.name || "mlingo-solutions"}`;
    els.githubRepoLine.innerHTML = connected || directToken
      ? `Repo mode ${repoEnabled || directReady ? "пушит" : "будет пушить"} прогресс и решения в <code>${escapeHtml(fullName)}</code>.`
      : "Serverless mode будет пушить прогресс и решения в твой GitHub repo.";
  }
}

function showGithubIntegrationMessage(text, good = false) {
  if (!els.githubIntegrationMessage) return;
  els.githubIntegrationMessage.textContent = text || "";
  els.githubIntegrationMessage.className = `auth-hint ${good ? "is-good" : text ? "is-bad" : ""}`;
}

function getGithubDirectToken() {
  return localStorage.getItem(GITHUB_DIRECT_TOKEN_KEY) || "";
}

function getGithubDirectConfig() {
  try {
    return {
      owner: "",
      repo: "mlingo-solutions",
      enabled: false,
      ...(JSON.parse(localStorage.getItem(GITHUB_DIRECT_CONFIG_KEY)) || {}),
    };
  } catch {
    return { owner: "", repo: "mlingo-solutions", enabled: false };
  }
}

function saveGithubDirectConfig(config) {
  localStorage.setItem(GITHUB_DIRECT_CONFIG_KEY, JSON.stringify(config));
}

async function githubDirectRequest(path, options = {}) {
  const token = getGithubDirectToken();
  if (!token) throw new Error("GitHub token не сохранен на устройстве.");
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (options.allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(data.message || `GitHub API вернул ${response.status}`);
  return data;
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const clean = String(value || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function normalizeRepoNameClient(value) {
  const repo = String(value || "mlingo-solutions").trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(repo)) throw new Error("Repo: только буквы, цифры, точка, _ или -.");
  return repo;
}

async function ensureGithubDirectRepo() {
  const config = getGithubDirectConfig();
  const repo = normalizeRepoNameClient(els.githubRepoInput?.value || config.repo);
  let owner = (els.githubOwnerInput?.value || config.owner || "").trim();
  if (!owner) {
    const me = await githubDirectRequest("/user");
    owner = me.login;
  }
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const existing = await githubDirectRequest(`/repos/${encodedOwner}/${encodedRepo}`, { allow404: true });
  if (existing) {
    saveGithubDirectConfig({ ...config, owner, repo, fullName: existing.full_name, url: existing.html_url, enabled: true });
    return existing;
  }
  const created = await githubDirectRequest("/user/repos", {
    method: "POST",
    body: {
      name: repo,
      description: "MLingo progress and solutions.",
      private: false,
      auto_init: true,
    },
  });
  saveGithubDirectConfig({ ...config, owner, repo, fullName: created.full_name, url: created.html_url, enabled: true });
  return created;
}

function githubProgressPayload() {
  return {
    schema: 1,
    app: "MLingo",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

async function putGithubDirectFile(filePath, content, message) {
  const repo = await ensureGithubDirectRepo();
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const current = await githubDirectRequest(`/repos/${repo.full_name}/contents/${encodedPath}`, { allow404: true });
  const payload = {
    message,
    content: encodeBase64Utf8(content),
  };
  if (current?.sha) payload.sha = current.sha;
  const result = await githubDirectRequest(`/repos/${repo.full_name}/contents/${encodedPath}`, {
    method: "PUT",
    body: payload,
  });
  return { repo, result };
}

async function pushProgressToGithubDirect(options = {}) {
  try {
    const { repo } = await putGithubDirectFile(
      "progress/mlingo-progress.json",
      JSON.stringify(githubProgressPayload(), null, 2),
      "Update MLingo progress",
    );
    renderGithubIntegration();
    if (!options.silent) showGithubIntegrationMessage(`Прогресс сохранен в ${repo.full_name}/progress/mlingo-progress.json.`, true);
    return true;
  } catch (error) {
    if (!options.silent) showGithubIntegrationMessage(error.message);
    return false;
  }
}

async function pullProgressFromGithubDirect() {
  try {
    const repo = await ensureGithubDirectRepo();
    const current = await githubDirectRequest(`/repos/${repo.full_name}/contents/progress/mlingo-progress.json`, { allow404: true });
    if (!current?.content) throw new Error("В repo пока нет progress/mlingo-progress.json.");
    const remote = JSON.parse(decodeBase64Utf8(current.content));
    if (!remote?.state) throw new Error("Файл прогресса есть, но формат не похож на MLingo.");
    mergeRemoteProgress({ state: remote.state, xp: remote.state.xp, streak: remote.state.streak });
    saveState();
    renderAll();
    showGithubIntegrationMessage(`Прогресс загружен из ${repo.full_name}.`, true);
  } catch (error) {
    showGithubIntegrationMessage(error.message);
  }
}

function buildDirectSolutionMarkdown(lesson, topic, answer) {
  const checklist = (lesson.rubric || []).map((item) => item.label).filter(Boolean);
  const fallback = [
    "Validation: какой split использован и нет ли leakage.",
    "Контракт данных: входные shapes, dtype, device, формат target.",
    "Воспроизводимость: seed, версии, порядок строк в submission.",
  ];
  const language = lesson.kind === "idea" ? "markdown" : "python";
  const fence = answer.includes("```") ? "````" : "```";
  return `# ${lesson.title}

- Тема: ${topic.title}
- Тип задания: ${lesson.kind}
- Экспортировано: ${new Date().toISOString()}
- Версия MLingo: ${APP_VERSION}

## Условие

${lesson.prompt}

## Решение

${fence}${language}
${answer}
${fence}

## Review checklist

${(checklist.length ? checklist : fallback).map((item) => `- ${item}`).join("\n")}
`;
}

function slugifyClient(value, fallback = "item") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

async function syncSolutionToGithubDirect(lesson, topic, answer) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const path = `solutions/${slugifyClient(lesson.id, "lesson")}/${stamp}.md`;
  const { repo } = await putGithubDirectFile(
    path,
    buildDirectSolutionMarkdown(lesson, topic, answer),
    `Add MLingo solution for ${lesson.id}`,
  );
  return `${repo.full_name}/${path}`;
}

function compareVersions(a, b) {
  const left = String(a || "0").replace(/^v/, "").split(".").map(Number);
  const right = String(b || "0").replace(/^v/, "").split(".").map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function checkForUpdates() {
  if (!els.updateStatus) return;
  els.updateStatus.hidden = false;
  els.updateStatus.className = "feedback pack-status";
  els.updateStatus.textContent = "Проверяю GitHub Releases...";
  try {
    const response = await fetch(RELEASES_API_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`GitHub Releases вернул ${response.status}`);
    const release = await response.json();
    const latest = String(release.tag_name || "").replace(/^v/, "");
    const apk = (release.assets || []).find((asset) => asset.name.endsWith(".apk"));
    const mac = (release.assets || []).find((asset) => {
      const name = asset.name.toLowerCase();
      return name.includes("macos") && (name.endsWith(".dmg") || name.endsWith(".zip"));
    });
    const newer = compareVersions(latest, APP_VERSION) > 0;
    if (els.releaseLink && release.html_url) els.releaseLink.href = release.html_url;
    const links = [
      apk ? `<a href="${escapeHtml(apk.browser_download_url)}" target="_blank" rel="noreferrer">Android APK</a>` : "",
      mac ? `<a href="${escapeHtml(mac.browser_download_url)}" target="_blank" rel="noreferrer">macOS app</a>` : "",
    ].filter(Boolean);
    els.updateStatus.className = `feedback pack-status ${newer ? "is-good" : ""}`;
    els.updateStatus.innerHTML = newer
      ? `Доступна версия v${escapeHtml(latest)}. ${links.join(" · ") || `<a href="${escapeHtml(release.html_url)}" target="_blank" rel="noreferrer">Открыть Release</a>`}`
      : `Текущая версия v${APP_VERSION}. Последний release: v${escapeHtml(latest || APP_VERSION)}.`;
  } catch (error) {
    els.updateStatus.className = "feedback pack-status is-bad";
    els.updateStatus.textContent = `Не смог проверить обновления: ${error.message}`;
  }
}

function appendFeedbackNote(text, good = true) {
  if (!els.feedbackBox || els.feedbackBox.hidden || !text) return;
  els.feedbackBox.insertAdjacentHTML("beforeend", `<p class="feedback-note ${good ? "is-good" : "is-bad"}">${escapeHtml(text)}</p>`);
}

function solutionEligible(lesson) {
  return ["write", "fix", "idea"].includes(lesson.kind);
}

function captureSolutionAnswer(lesson) {
  if (lesson.kind === "idea") return document.getElementById("ideaAnswer")?.value || typedCode || "";
  if (lesson.kind === "write" || lesson.kind === "fix") return document.getElementById("codeAnswer")?.value || typedCode || "";
  return "";
}

async function syncSolutionIfEnabled(lesson, firstPass) {
  if (!firstPass) return;
  const topic = getCurrentTopic();
  const direct = getGithubDirectConfig();
  if (direct.enabled && getGithubDirectToken()) {
    await pushProgressToGithubDirect({ silent: true });
    if (!solutionEligible(lesson)) return;
    const answer = captureSolutionAnswer(lesson).trim();
    if (!answer) return;
    try {
      const location = await syncSolutionToGithubDirect(lesson, topic, answer);
      appendFeedbackNote(`Решение сохранено в GitHub: ${location}.`, true);
      showGithubIntegrationMessage("Решение ушло в GitHub. Review появится позже, когда подключим backend.", true);
    } catch (error) {
      appendFeedbackNote(`GitHub sync не прошёл: ${error.message}`, false);
      showGithubIntegrationMessage(error.message);
    }
    return;
  }
  if (!solutionEligible(lesson)) return;
  const answer = captureSolutionAnswer(lesson).trim();
  if (!answer) return;
  if (!currentUser?.github?.repo?.enabled) return;
  try {
    const data = await apiRequest("/api/github/solutions", {
      method: "POST",
      body: {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        topicId: topic.id,
        topicTitle: topic.title,
        kind: lesson.kind,
        prompt: lesson.prompt,
        answer,
        reviewChecklist: (lesson.rubric || []).map((item) => item.label).filter(Boolean),
      },
    });
    const repo = currentUser.github.repo?.fullName || data.solution?.githubRepo;
    appendFeedbackNote(`Решение сохранено в GitHub: ${repo}/${data.solution?.githubPath || "solutions"}.`, true);
    showGithubIntegrationMessage("Последнее решение ушло в GitHub и добавлено в review queue.", true);
  } catch (error) {
    appendFeedbackNote(`GitHub sync не прошёл: ${error.message}`, false);
    showGithubIntegrationMessage(error.message);
  }
}

function renderLeaderboard(items = []) {
  if (!els.leaderboardList) return;
  if (!items.length) {
    els.leaderboardList.innerHTML = `<div class="leaderboard-row"><span>Пока нет данных</span><strong>—</strong></div>`;
    return;
  }
  els.leaderboardList.innerHTML = items
    .map(
      (item) => `
        <div class="leaderboard-row${currentUser?.username === item.username ? " is-you" : ""}">
          <span><b>${item.rank}. @${escapeHtml(item.username)}</b><small>${item.completedCount} уроков · стрик ${item.streak}</small></span>
          <strong>${item.xp}</strong>
        </div>
      `,
    )
    .join("");
}

async function fetchLeaderboard() {
  try {
    const data = await apiRequest("/api/leaderboard", { skipAuth: true });
    renderLeaderboard(data.leaderboard);
  } catch {
    renderLeaderboard([]);
  }
}

function queueProgressSync() {
  if (!currentUser || isApplyingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncProgressNow, 550);
}

async function syncProgressNow() {
  if (!currentUser) return;
  try {
    const data = await apiRequest("/api/progress", {
      method: "PUT",
      body: { state },
    });
    if (data.progress) {
      isApplyingRemote = true;
      state.xp = Number(data.progress.xp || state.xp || 0);
      state.streak = Number(data.progress.streak || state.streak || 0);
      isApplyingRemote = false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderStats();
    }
    renderLeaderboard(data.leaderboard);
  } catch {
    // Keep device progress. Next successful action will sync again.
  }
}

async function sendEvent(lessonId, correct, xpDelta) {
  if (!currentUser) return;
  try {
    await apiRequest("/api/event", { method: "POST", body: { lessonId, correct, xpDelta } });
  } catch {
    // Analytics events are best-effort; progress sync is authoritative here.
  }
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token && !options.skipAuth) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      credentials: "same-origin",
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const error = new Error("API недоступен");
    error.offline = true;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "API недоступен");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadLessonPacks() {
  for (const url of DEFAULT_PACK_URLS) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (response.ok) mergeLessonPack(await response.json(), { trustedRunner: true });
    } catch {
      // Other bundled packs or stored packs can still keep the app usable.
    }
  }
  loadStoredLessonPacks().forEach((pack) => mergeLessonPack(pack, { trustedRunner: false }));
}

function mergeLessonPack(pack, { trustedRunner = false } = {}) {
  if (!pack?.topics?.length) return { added: 0, skipped: 0 };
  let added = 0;
  let skipped = 0;

  for (const incoming of pack.topics) {
    if (!incoming?.id || !Array.isArray(incoming.lessons)) continue;
    let topic = topics.find((item) => item.id === incoming.id);
    if (!topic) {
      topic = {
        id: incoming.id,
        title: incoming.title || incoming.id,
        track: incoming.track || pack.title || "Пак заданий",
        tag: incoming.tag || "contest",
        icon: incoming.icon || "PK",
        color: incoming.color || "#8ea4c7",
        copy: incoming.copy || "Импортированный набор заданий.",
        rules: incoming.rules || [],
        lessons: [],
      };
      topics.push(topic);
    } else if (incoming.rules?.length) {
      topic.rules = [...new Set([...(topic.rules || []), ...incoming.rules])];
    }

    const existing = new Set(topic.lessons.map((lesson) => lesson.id));
    for (const lesson of incoming.lessons) {
      if (!lesson?.id || existing.has(lesson.id)) {
        skipped += 1;
        continue;
      }
      topic.lessons.push(trustedRunner ? lesson : withoutRunnerCode(lesson));
      existing.add(lesson.id);
      added += 1;
    }
  }
  return { added, skipped };
}

function withoutRunnerCode(lesson) {
  if (!lesson?.pyTests) return lesson;
  const { pyTests, ...safeLesson } = lesson;
  return safeLesson;
}

function loadStoredLessonPacks() {
  try {
    const packs = JSON.parse(localStorage.getItem(PACK_STORAGE_KEY));
    return Array.isArray(packs) ? packs : [];
  } catch {
    return [];
  }
}

function saveStoredLessonPack(pack) {
  const packs = loadStoredLessonPacks();
  const packId = pack.id || `imported-${Date.now()}`;
  const next = packs.filter((item) => item.id !== packId);
  next.push({ ...pack, id: packId, importedAt: new Date().toISOString() });
  localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(next));
}

function exportLessonPackSnapshot() {
  const pack = {
    schemaVersion: 1,
    id: `mlingo-snapshot-${todayKey()}`,
    title: "MLingo current lesson bank",
    exportedAt: new Date().toISOString(),
    topics,
  };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showPackStatus(`Экспортировано: ${flatLessons().length} заданий.`, true);
}

async function importLessonPackFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const pack = JSON.parse(await file.text());
    const result = mergeLessonPack(pack);
    saveStoredLessonPack(pack);
    ensureValidTopicSelection();
    saveState();
    renderAll();
    showPackStatus(`Импортировано: ${result.added} новых заданий, пропущено дублей: ${result.skipped}.`, true);
  } catch (error) {
    showPackStatus(`Не смог прочитать pack JSON: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function syncLessonPacksFromGithub() {
  const indexUrl = (els.packSourceInput?.value || DEFAULT_PACK_INDEX_URL).trim();
  if (!indexUrl) {
    showPackStatus("Укажи URL на index.json в GitHub raw.");
    return;
  }
  localStorage.setItem(PACK_SOURCE_STORAGE_KEY, indexUrl);
  showPackStatus("Синхронизирую pack index...");
  try {
    const index = await fetchJson(indexUrl);
    const packRefs = Array.isArray(index.packs) ? index.packs : [];
    if (!packRefs.length) throw new Error("В index.json нет массива packs.");

    let added = 0;
    let skipped = 0;
    for (const ref of packRefs) {
      const packUrl = resolvePackUrl(typeof ref === "string" ? ref : ref.url, indexUrl);
      if (!packUrl) continue;
      const pack = await fetchJson(packUrl);
      const result = mergeLessonPack(pack);
      saveStoredLessonPack({ ...pack, sourceUrl: packUrl });
      added += result.added;
      skipped += result.skipped;
    }

    ensureValidTopicSelection();
    saveState();
    renderAll();
    showPackStatus(`GitHub sync готов: новых заданий ${added}, дублей пропущено ${skipped}.`, true);
  } catch (error) {
    showPackStatus(`GitHub sync не удался: ${error.message}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function resolvePackUrl(url, indexUrl) {
  if (!url) return "";
  return new URL(url, indexUrl).toString();
}

function showPackStatus(text, good = false) {
  if (!els.packStatus) return;
  els.packStatus.hidden = false;
  els.packStatus.className = `feedback pack-status ${good ? "is-good" : "is-bad"}`;
  els.packStatus.textContent = text;
}

function getCurrentTopic() {
  return topics.find((topic) => topic.id === currentTopicId) || topics[0];
}

function ensureValidTopicSelection() {
  if (!topics.length) throw new Error("Lesson packs are empty");
  if (!topics.some((topic) => topic.id === currentTopicId)) {
    currentTopicId = topics[0].id;
    currentLessonIndex = 0;
  }
  const topic = getCurrentTopic();
  if (!topic.lessons[currentLessonIndex]) currentLessonIndex = 0;
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
}

function getCurrentLesson() {
  const topic = getCurrentTopic();
  return topic.lessons[currentLessonIndex] || topic.lessons[0];
}

function completedInTopic(topic) {
  return topic.lessons.filter((lesson) => state.completed[lesson.id]).length;
}

function getUnlockedLevel(topic) {
  const done = completedInTopic(topic);
  if (done >= 10) return 5;
  if (done >= 7) return 4;
  if (done >= 3) return 3;
  if (done >= 1) return 2;
  return 1;
}

function flatLessons() {
  return topics.flatMap((topic) => topic.lessons.map((lesson, index) => ({ topic, lesson, index })));
}

function findLesson(id) {
  for (const topic of topics) {
    const index = topic.lessons.findIndex((lesson) => lesson.id === id);
    if (index !== -1) return { topic, lesson: topic.lessons[index], index };
  }
  return null;
}

function updateStreak() {
  const today = todayKey();
  if (state.streakDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  state.streak = state.streakDate === dateKey(yesterday) ? state.streak + 1 : 1;
  state.streakDate = today;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      xp: 0,
      streak: 0,
      completed: {},
      completedDates: {},
      misses: {},
      ...parsed,
    };
  } catch {
    return { xp: 0, streak: 0, completed: {}, completedDates: {}, misses: {} };
  }
}

function saveState() {
  state.currentTopicId = currentTopicId;
  state.currentLessonIndex = currentLessonIndex;
  state.currentScreen = currentScreen;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueProgressSync();
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function evaluateIdeaAnswer(lesson, value) {
  const text = String(value || "").toLowerCase();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const rubric = lesson.rubric || [];
  const hits = rubric.filter((item) => (item.keywords || []).some((keyword) => text.includes(String(keyword).toLowerCase())));
  const missing = rubric.filter((item) => !hits.includes(item)).map((item) => item.label);
  const minRubric = lesson.minRubric || Math.min(3, rubric.length);
  const minWords = lesson.minWords || 35;
  return {
    wordCount,
    hitCount: hits.length,
    missing,
    ok: wordCount >= minWords && hits.length >= minRubric,
  };
}

function acceptedAnswers(lesson) {
  return lesson.answers || [lesson.answer];
}

function normalizeCode(value) {
  return value.replace(/\s+/g, "").trim();
}

function normalizeWrittenCode(value) {
  return String(value)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function formatFeedbackText(text) {
  return String(text)
    .split("\n\n")
    .map((chunk) => `<p>${escapeHtml(chunk).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function formatTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "только что";
  return new Date(timestamp * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
