const STORAGE_KEY = "mlingo.antivibe.progress.v6";
const AUTH_TOKEN_KEY = "mlingo.auth.token";
const API_BASE = window.MLINGO_API_BASE || "";
const LAYOUT_MODES = ["course", "practice", "studio"];
const LAYOUT_LABELS = {
  course: "курс",
  practice: "практика",
  studio: "студия",
};

const topics = [
  {
    id: "cv-masks",
    title: "CV: маски, bbox, resize",
    track: "Компьютерное зрение",
    tag: "cv",
    icon: "CV",
    color: "#7cc8a3",
    copy: "База для Cuties segmentation: PIL/OpenCV, RGB/BGR, resize, бинарные маски, bbox, IoU.",
    rules: ["Изображение resize: bilinear", "Маска resize: nearest", "OpenCV читает BGR, PIL читает RGB"],
    lessons: [
      {
        id: "cv-mask-resize",
        kind: "choice",
        title: "Resize маски",
        prompt: "Какая интерполяция нужна для segmentation mask?",
        options: ["nearest", "bilinear", "bicubic", "lanczos"],
        answer: "nearest",
        hint: "Классы не должны стать дробными.",
        explain: "Bilinear размажет id классов. Для масок нужен nearest-neighbor.",
      },
      {
        id: "cv-open-bgr",
        kind: "order",
        title: "OpenCV → RGB",
        prompt: "Собери загрузку картинки через OpenCV так, чтобы дальше получить RGB tensor.",
        blocks: [
          "img = cv2.imread(path)",
          "img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)",
          "img = img.astype(np.float32) / 255.0",
          "img = torch.from_numpy(img).permute(2, 0, 1)",
        ],
        answer: [
          "img = cv2.imread(path)",
          "img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)",
          "img = img.astype(np.float32) / 255.0",
          "img = torch.from_numpy(img).permute(2, 0, 1)",
        ],
        hint: "OpenCV по умолчанию BGR, а torch обычно ждёт C,H,W.",
        explain: "Это спасает от тихой ошибки: модель видит красный и синий каналы местами.",
      },
      {
        id: "cv-binary-inference",
        kind: "order",
        title: "Binary inference",
        prompt: "Собери порядок действий для получения бинарной маски из logits.",
        blocks: [
          "logits = model(x)",
          "prob = torch.sigmoid(logits)",
          "mask = (prob > threshold).float()",
        ],
        answer: [
          "logits = model(x)",
          "prob = torch.sigmoid(logits)",
          "mask = (prob > threshold).float()",
        ],
        hint: "Модель отдаёт logits, threshold применяешь к вероятностям.",
        explain: "Валидационный IoU считается по thresholded mask, а не по сырым logits.",
      },
      {
        id: "cv-mask-bbox",
        kind: "order",
        title: "Mask → bbox",
        prompt: "Собери функцию, которая получает `[x1, y1, x2, y2]` из бинарной маски.",
        blocks: [
          "ys, xs = np.where(mask > 0)",
          "if len(xs) == 0: return None",
          "return [xs.min(), ys.min(), xs.max(), ys.max()]",
        ],
        answer: [
          "ys, xs = np.where(mask > 0)",
          "if len(xs) == 0: return None",
          "return [xs.min(), ys.min(), xs.max(), ys.max()]",
        ],
        hint: "У 2D-маски `np.where` сначала возвращает y, потом x.",
        explain: "Это база для detection-lite задач и postprocess после connected components.",
      },
      {
        id: "cv-iou-fill",
        kind: "fill",
        title: "IoU руками",
        prompt: "Заполни denominator для IoU.",
        code: "inter = np.logical_and(a, b).sum()\nunion = np.logical_or(a, b).sum()\niou = inter / (____ + 1e-7)",
        blanks: ["union"],
        hint: "Intersection over union.",
        explain: "В Cuties threshold и postprocess могут дать больше, чем замена модели.",
      },
      {
        id: "cv-threshold-sweep",
        kind: "order",
        title: "Sweep threshold",
        prompt: "Собери быстрый перебор threshold на валидации.",
        blocks: [
          "best_t, best_score = 0.5, -1",
          "for t in np.linspace(0.1, 0.9, 17):",
          "    score = mean_iou((val_prob > t), val_masks)",
          "    if score > best_score: best_t, best_score = t, score",
        ],
        answer: [
          "best_t, best_score = 0.5, -1",
          "for t in np.linspace(0.1, 0.9, 17):",
          "    score = mean_iou((val_prob > t), val_masks)",
          "    if score > best_score: best_t, best_score = t, score",
        ],
        hint: "Модель не обязана быть лучше при threshold=0.5.",
        explain: "В segmentation-задачах подбор threshold часто даёт быстрый и честный буст.",
      },
      {
        id: "cv-mask-dtype",
        kind: "bug",
        title: "Dtype маски",
        prompt: "В какой строке ломается `BCEWithLogitsLoss` для бинарной маски?",
        lines: [
          "mask = Image.open(mask_path).convert('L')",
          "mask = np.array(mask) > 0",
          "mask = torch.from_numpy(mask)[None]",
          "loss = nn.BCEWithLogitsLoss()(logits, mask)",
        ],
        answer: 2,
        hint: "BCE ждёт float target.",
        explain: "Нужно `mask.float()`, иначе target останется bool и loss может упасть или вести себя странно.",
      },
      {
        id: "cv-write-mask-to-bbox",
        kind: "write",
        difficulty: 3,
        title: "Напиши mask_to_bbox",
        prompt: "Напиши функцию `mask_to_bbox(mask)`, которая возвращает `[x1, y1, x2, y2]` или `None`, если маска пустая.",
        starter: "def mask_to_bbox(mask):\n    ",
        answer:
          "def mask_to_bbox(mask):\n    ys, xs = np.where(mask > 0)\n    if len(xs) == 0:\n        return None\n    return [xs.min(), ys.min(), xs.max(), ys.max()]",
        testsText: "Проверка: пустая маска -> None; прямоугольник -> min/max координаты.",
        hint: "`np.where` для 2D маски возвращает сначала y, потом x.",
        explain: "Это уже ручной код, который пригодится в Cuties/Radar postprocess.",
      },
      {
        id: "cv-fix-resize-mask",
        kind: "fix",
        difficulty: 4,
        title: "Исправь resize",
        prompt: "Исправь код так, чтобы image resize был bilinear, а mask resize не размазывал class ids.",
        code:
          "img = F.resize(img, (224, 224), interpolation=InterpolationMode.NEAREST)\nmask = F.resize(mask, (224, 224), interpolation=InterpolationMode.BILINEAR)\nimg = F.to_tensor(img)\nmask = torch.from_numpy(np.array(mask))[None].float()",
        answer:
          "img = F.resize(img, (224, 224), interpolation=InterpolationMode.BILINEAR)\nmask = F.resize(mask, (224, 224), interpolation=InterpolationMode.NEAREST)\nimg = F.to_tensor(img)\nmask = torch.from_numpy(np.array(mask))[None].float()",
        hint: "Картинку можно интерполировать плавно, mask нельзя.",
        explain: "Nearest сохраняет дискретные id классов, bilinear подходит для RGB image.",
      },
    ],
  },
  {
    id: "cv-segmentation",
    title: "CV: segmentation contest",
    track: "Cuties / Radar",
    tag: "cv",
    icon: "SG",
    color: "#d79a5f",
    copy: "Практика вокруг Dataset, аугментаций, connected components, Dice/BCE и постпроцесса.",
    rules: ["Spatial transforms одинаковы для image и mask", "Sigmoid только для метрик", "Largest component может убрать шум"],
    lessons: [
      {
        id: "seg-dataset-getitem",
        kind: "order",
        title: "getitem image+mask",
        prompt: "Собери `__getitem__` для пары image/mask.",
        blocks: [
          "img = Image.open(self.img_paths[idx]).convert('RGB')",
          "mask = Image.open(self.mask_paths[idx]).convert('L')",
          "img, mask = self.transforms(img, mask)",
          "return img, mask",
        ],
        answer: [
          "img = Image.open(self.img_paths[idx]).convert('RGB')",
          "mask = Image.open(self.mask_paths[idx]).convert('L')",
          "img, mask = self.transforms(img, mask)",
          "return img, mask",
        ],
        hint: "В segmentation важно вернуть синхронно преобразованные image и mask.",
        explain: "Если аугментация повернула картинку, маска должна повернуться точно так же.",
      },
      {
        id: "seg-dice-loss-fill",
        kind: "fill",
        title: "Dice score",
        prompt: "Заполни числитель Dice.",
        code: "prob = torch.sigmoid(logits)\ninter = (prob * target).sum()\ndice = (2 * ____ + 1) / (prob.sum() + target.sum() + 1)",
        blanks: ["inter"],
        hint: "Dice = 2 * intersection / суммарный размер.",
        explain: "Dice устойчивее, когда объект маленький и фон доминирует.",
      },
      {
        id: "seg-bce-dice-order",
        kind: "order",
        title: "BCE + Dice",
        prompt: "Собери комбинированный loss для binary segmentation.",
        blocks: [
          "bce = F.binary_cross_entropy_with_logits(logits, target)",
          "prob = torch.sigmoid(logits)",
          "dice = 1 - dice_score(prob, target)",
          "loss = bce + dice",
        ],
        answer: [
          "bce = F.binary_cross_entropy_with_logits(logits, target)",
          "prob = torch.sigmoid(logits)",
          "dice = 1 - dice_score(prob, target)",
          "loss = bce + dice",
        ],
        hint: "BCE с logits, Dice с вероятностями.",
        explain: "Комбо часто работает лучше, чем голый BCE на несбалансированных масках.",
      },
      {
        id: "seg-largest-component",
        kind: "order",
        title: "Largest component",
        prompt: "Собери постпроцесс: оставить самую большую connected component.",
        blocks: [
          "num, labels = cv2.connectedComponents(mask.astype('uint8'))",
          "areas = [(labels == i).sum() for i in range(1, num)]",
          "best = 1 + int(np.argmax(areas))",
          "clean = (labels == best).astype('uint8')",
        ],
        answer: [
          "num, labels = cv2.connectedComponents(mask.astype('uint8'))",
          "areas = [(labels == i).sum() for i in range(1, num)]",
          "best = 1 + int(np.argmax(areas))",
          "clean = (labels == best).astype('uint8')",
        ],
        hint: "Компонента 0 обычно фон.",
        explain: "Если в задаче один объект, largest component режет шумовые островки.",
      },
      {
        id: "seg-multiclass-shape",
        kind: "choice",
        title: "Multiclass CE",
        prompt: "`logits.shape == [B, C, H, W]`. Что ждёт `CrossEntropyLoss`?",
        options: ["target [B,H,W] long", "target [B,C,H,W] float", "target [B,1,H,W] bool", "target [C,H,W] long"],
        answer: "target [B,H,W] long",
        hint: "Канал класса есть только у logits.",
        explain: "CE сам выбирает class id по target; one-hot здесь не нужен.",
      },
      {
        id: "seg-aug-bug",
        kind: "bug",
        title: "Аугментация маски",
        prompt: "Какая строка делает image и mask несогласованными?",
        lines: [
          "if random.random() < 0.5:",
          "    img = F.hflip(img)",
          "if random.random() < 0.5:",
          "    mask = F.hflip(mask)",
        ],
        answer: 2,
        hint: "Один random должен управлять обеими ветками.",
        explain: "Нужно один раз сэмплировать `do_flip`, затем применить к image и mask.",
      },
      {
        id: "seg-val-aggregate",
        kind: "order",
        title: "Val IoU loop",
        prompt: "Собери валидационный loop для среднего IoU.",
        blocks: [
          "model.eval()",
          "with torch.no_grad():",
          "    for x, y in val_loader:",
          "        prob = torch.sigmoid(model(x.to(device))).cpu()",
          "        scores.append(iou_score(prob > t, y > 0.5))",
        ],
        answer: [
          "model.eval()",
          "with torch.no_grad():",
          "    for x, y in val_loader:",
          "        prob = torch.sigmoid(model(x.to(device))).cpu()",
          "        scores.append(iou_score(prob > t, y > 0.5))",
        ],
        hint: "Eval, no_grad, вероятности, threshold, метрика.",
        explain: "Без честной валидации ты не поймёшь, помогает ли postprocess.",
      },
      {
        id: "seg-write-dice-score",
        kind: "write",
        difficulty: 4,
        title: "Напиши Dice score",
        prompt: "Напиши функцию `dice_score(prob, target, eps=1.0)` для tensor-масок одинаковой формы.",
        starter: "def dice_score(prob, target, eps=1.0):\n    ",
        answer:
          "def dice_score(prob, target, eps=1.0):\n    inter = (prob * target).sum()\n    return (2 * inter + eps) / (prob.sum() + target.sum() + eps)",
        testsText: "Проверка: одинаковые маски дают score около 1.",
        hint: "Dice = 2 * intersection / (pred area + target area).",
        explain: "Dice руками очень полезен: сразу понимаешь, где sigmoid, где threshold, где target dtype.",
      },
      {
        id: "seg-fix-val-loop",
        kind: "fix",
        difficulty: 5,
        title: "Исправь val loop",
        prompt: "Исправь validation loop: нужен eval, no_grad, device и sigmoid перед threshold.",
        code:
          "for x, y in val_loader:\n    logits = model(x)\n    pred = logits > 0.5\n    scores.append(iou_score(pred, y))",
        answer:
          "model.eval()\nwith torch.no_grad():\n    for x, y in val_loader:\n        x = x.to(device)\n        prob = torch.sigmoid(model(x)).cpu()\n        scores.append(iou_score(prob > 0.5, y > 0.5))",
        hint: "Logits нельзя threshold как вероятности; validation не строит graph.",
        explain: "Это типичный кусок, который должен писаться почти автоматически на соревновании.",
      },
    ],
  },
  {
    id: "cv-detection-count",
    title: "CV: bbox, counting, radar",
    track: "Chicken counting / Radar",
    tag: "cv",
    icon: "BX",
    color: "#c47b6f",
    copy: "Bounding boxes, плотностные карты, подсчёт объектов, простая морфология и NMS.",
    rules: ["Count из density map = сумма", "NMS сортирует по score", "MAE удобен для counting"],
    lessons: [
      {
        id: "count-density-sum",
        kind: "fill",
        title: "Density count",
        prompt: "Заполни формулу предсказанного количества объектов.",
        code: "density = model(img)\npred_count = density.____().item()",
        blanks: ["sum"],
        hint: "Плотностная карта интегрируется в количество.",
        explain: "В counting задачах модель может не находить bbox, а оценивать сумму density map.",
      },
      {
        id: "count-mae",
        kind: "fill",
        title: "MAE",
        prompt: "Заполни метрику для counting.",
        code: "mae = np.mean(np.____(pred_counts - true_counts))",
        blanks: ["abs"],
        hint: "Mean absolute error.",
        explain: "MAE прямо штрафует ошибку в количестве объектов.",
      },
      {
        id: "bbox-area",
        kind: "fill",
        title: "Площадь bbox",
        prompt: "Заполни ширину bbox для формата `[x1,y1,x2,y2]`.",
        code: "w = max(0, x2 - ____)\nh = max(0, y2 - y1)\narea = w * h",
        blanks: ["x1"],
        hint: "Ширина = правая граница минус левая.",
        explain: "Ошибки формата bbox часто ломают IoU и NMS.",
      },
      {
        id: "nms-order",
        kind: "order",
        title: "NMS порядок",
        prompt: "Собери шаги non-maximum suppression.",
        blocks: [
          "boxes = boxes[scores.argsort(descending=True)]",
          "best = boxes[0]; keep.append(best)",
          "boxes = boxes[box_iou(best, boxes) <= threshold]",
          "повторять, пока boxes не закончатся",
        ],
        answer: [
          "boxes = boxes[scores.argsort(descending=True)]",
          "best = boxes[0]; keep.append(best)",
          "boxes = boxes[box_iou(best, boxes) <= threshold]",
          "повторять, пока boxes не закончатся",
        ],
        hint: "Сначала самый уверенный bbox.",
        explain: "Даже простой NMS может резко улучшить detection/counting submission.",
      },
      {
        id: "radar-channels",
        kind: "choice",
        title: "Radar channels",
        prompt: "Если вход radar image имеет shape `[H,W,4]`, что нужно проверить первым?",
        options: ["что модель принимает 4 канала", "что target стал one-hot", "что batch_size равен 4", "что lr меньше 1e-6"],
        answer: "что модель принимает 4 канала",
        hint: "Conv2d первый аргумент `in_channels`.",
        explain: "Частая ошибка CV-контестов: модель ждёт 3 канала, а данные несут другой набор каналов.",
      },
      {
        id: "morph-open",
        kind: "choice",
        title: "Opening",
        prompt: "Какой postprocess обычно убирает мелкий шум в бинарной маске?",
        options: ["morphological opening", "softmax", "dropout", "batch norm"],
        answer: "morphological opening",
        hint: "Это erosion, потом dilation.",
        explain: "Морфология может быть сильнее, чем новый эксперимент с моделью в последние 20 минут.",
      },
    ],
  },
  {
    id: "torch-loops",
    title: "PyTorch: цикл обучения",
    track: "PyTorch",
    tag: "torch",
    icon: "PT",
    color: "#d98570",
    copy: "Пять строк train step, device, dtype, eval/no_grad, losses и shapes.",
    rules: ["CrossEntropy ждёт logits", "BCEWithLogits ждёт logits", "target для CE обычно `.long()`"],
    lessons: [
      {
        id: "torch-step-order",
        kind: "order",
        title: "Train step",
        prompt: "Расставь стандартный PyTorch train step.",
        blocks: [
          "optimizer.zero_grad()",
          "logits = model(x)",
          "loss = criterion(logits, y)",
          "loss.backward()",
          "optimizer.step()",
        ],
        answer: [
          "optimizer.zero_grad()",
          "logits = model(x)",
          "loss = criterion(logits, y)",
          "loss.backward()",
          "optimizer.step()",
        ],
        hint: "Сначала чистим старые gradients, обновляем веса в конце.",
        explain: "Это должно стать рефлексом. Большая часть torch-кода строится вокруг этого скелета.",
      },
      {
        id: "torch-device-order",
        kind: "order",
        title: "Batch на GPU",
        prompt: "Собери перенос батча и модели на device.",
        blocks: ["model = model.to(device)", "x = x.to(device)", "y = y.to(device)", "logits = model(x)"],
        answer: ["model = model.to(device)", "x = x.to(device)", "y = y.to(device)", "logits = model(x)"],
        hint: "Модель и тензоры должны жить на одном device.",
        explain: "Ошибка CPU/GPU device mismatch на контесте съедает время без пользы.",
      },
      {
        id: "torch-ce-shapes",
        kind: "choice",
        title: "CrossEntropy shapes",
        prompt: "`logits.shape == (32, 10)`. Какой target нужен для `nn.CrossEntropyLoss`?",
        options: ["`(32,)`, dtype long, class ids", "`(32, 10)`, float one-hot", "`(32, 1)`, float", "`(10,)`, long"],
        answer: "`(32,)`, dtype long, class ids",
        hint: "CE сам делает log-softmax и NLL.",
        explain: "Не делай softmax перед `CrossEntropyLoss`; передавай сырые logits и integer labels.",
      },
      {
        id: "torch-bce-shapes",
        kind: "choice",
        title: "BCEWithLogits",
        prompt: "Что подавать в `nn.BCEWithLogitsLoss`?",
        options: ["сырые logits и float target", "sigmoid(logits) и long target", "softmax(logits) и class ids", "argmax и target"],
        answer: "сырые logits и float target",
        hint: "Sigmoid уже внутри loss.",
        explain: "Для метрик делай sigmoid отдельно, но loss получает logits.",
      },
      {
        id: "torch-no-grad",
        kind: "fill",
        title: "Inference guard",
        prompt: "Заполни context manager для валидации/inference.",
        code: "model.eval()\nwith torch.____():\n    pred = model(x)",
        blanks: ["no_grad"],
        hint: "Отключает построение графа.",
        explain: "`torch.no_grad()` экономит память и защищает от случайного autograd в inference.",
      },
      {
        id: "torch-zero-grad-bug",
        kind: "bug",
        title: "Градиенты копятся",
        prompt: "Какой строки не хватает перед forward?",
        lines: [
          "for x, y in loader:",
          "    logits = model(x)",
          "    loss = criterion(logits, y)",
          "    loss.backward()",
          "    optimizer.step()",
        ],
        answer: 1,
        hint: "Перед forward обычно чистим старые gradients.",
        explain: "Нужно добавить `optimizer.zero_grad()` до forward/backward.",
      },
      {
        id: "torch-clip-grad",
        kind: "fill",
        title: "Gradient clipping",
        prompt: "Заполни функцию, которая ограничивает норму градиентов.",
        code: "loss.backward()\ntorch.nn.utils.____(model.parameters(), max_norm=1.0)\noptimizer.step()",
        blanks: ["clip_grad_norm_"],
        hint: "В имени есть norm и подчёркивание на конце.",
        explain: "Clipping полезен для RNN/transformer и нестабильного обучения.",
      },
    ],
  },
  {
    id: "dataset-loader",
    title: "Dataset и DataLoader",
    track: "PyTorch",
    tag: "torch",
    icon: "DL",
    color: "#9bc69b",
    copy: "Свои классы Dataset для картинок, масок, текста, таблиц и variable-length batch.",
    rules: ["`__len__` возвращает число объектов", "`__getitem__` возвращает один sample", "Для variable length нужен `collate_fn`"],
    lessons: [
      {
        id: "dataset-methods",
        kind: "order",
        title: "Скелет Dataset",
        prompt: "Расставь методы в минимальном custom Dataset.",
        blocks: [
          "class MyDataset(Dataset):",
          "    def __len__(self): return len(self.items)",
          "    def __getitem__(self, idx): return self.items[idx]",
        ],
        answer: [
          "class MyDataset(Dataset):",
          "    def __len__(self): return len(self.items)",
          "    def __getitem__(self, idx): return self.items[idx]",
        ],
        hint: "Класс, длина, один объект по индексу.",
        explain: "Для CV дальше заменишь `items[idx]` на загрузку `image, mask`.",
      },
      {
        id: "dataset-init",
        kind: "order",
        title: "__init__",
        prompt: "Собери хранение путей и transforms в Dataset.",
        blocks: [
          "def __init__(self, df, img_dir, transforms=None):",
          "    self.df = df.reset_index(drop=True)",
          "    self.img_dir = img_dir",
          "    self.transforms = transforms",
        ],
        answer: [
          "def __init__(self, df, img_dir, transforms=None):",
          "    self.df = df.reset_index(drop=True)",
          "    self.img_dir = img_dir",
          "    self.transforms = transforms",
        ],
        hint: "`reset_index` защищает от странных индексов после split.",
        explain: "Так `idx` в DataLoader точно совпадает с позицией строки.",
      },
      {
        id: "dataset-mask-transform",
        kind: "bug",
        title: "Где ошибка?",
        prompt: "В какой строке ошибка для segmentation mask?",
        lines: [
          "img = F.resize(img, (224, 224), interpolation=InterpolationMode.BILINEAR)",
          "mask = F.resize(mask, (224, 224), interpolation=InterpolationMode.BILINEAR)",
          "img = F.to_tensor(img)",
          "mask = torch.from_numpy((np.array(mask) > 127).astype('float32'))[None]",
        ],
        answer: 1,
        hint: "Маску нельзя размазывать.",
        explain: "Вторая строка должна использовать `InterpolationMode.NEAREST`.",
      },
      {
        id: "loader-shuffle",
        kind: "choice",
        title: "Shuffle",
        prompt: "Где обычно ставим `shuffle=True`?",
        options: ["train_loader", "val_loader", "test_loader", "везде"],
        answer: "train_loader",
        hint: "Validation должен быть стабильным.",
        explain: "Для train перемешивание помогает, для val/test лишняя случайность не нужна.",
      },
      {
        id: "collate-pad",
        kind: "order",
        title: "Pad sequences",
        prompt: "Собери простую идею `collate_fn` для текстов разной длины.",
        blocks: [
          "texts, labels = zip(*batch)",
          "lengths = torch.tensor([len(x) for x in texts])",
          "texts = pad_sequence(texts, batch_first=True, padding_value=0)",
          "return texts, lengths, torch.tensor(labels)",
        ],
        answer: [
          "texts, labels = zip(*batch)",
          "lengths = torch.tensor([len(x) for x in texts])",
          "texts = pad_sequence(texts, batch_first=True, padding_value=0)",
          "return texts, lengths, torch.tensor(labels)",
        ],
        hint: "DataLoader сам не знает, как склеивать разные длины.",
        explain: "Такой `collate_fn` нужен для NLP/RNN и иногда для variable-size targets.",
      },
      {
        id: "dataset-worker",
        kind: "choice",
        title: "num_workers",
        prompt: "Что делает `num_workers` в DataLoader?",
        options: ["параллелит загрузку batch", "увеличивает batch_size", "добавляет GPU", "меняет loss"],
        answer: "параллелит загрузку batch",
        hint: "Это про CPU-процессы загрузки данных.",
        explain: "Если GPU простаивает, иногда помогает поднять `num_workers`.",
      },
    ],
  },
  {
    id: "validation",
    title: "Валидация и leakage",
    track: "Контестное мышление",
    tag: "contest",
    icon: "VA",
    color: "#d7b56d",
    copy: "Holdout, stratify, group/time split, adversarial validation, OOF target encoding.",
    rules: ["fit preprocessing только на train", "OOF encoding для train", "test mapping после full train fit"],
    lessons: [
      {
        id: "validation-scaler-leak",
        kind: "bug",
        title: "Найди leakage",
        prompt: "Какая строка протекает validation information?",
        lines: [
          "scaler = StandardScaler()",
          "X_all = pd.concat([X_train, X_val])",
          "scaler.fit(X_all)",
          "X_train = scaler.transform(X_train)",
          "X_val = scaler.transform(X_val)",
        ],
        answer: 2,
        hint: "Scaler не должен видеть val при fit.",
        explain: "Любой `fit` делается на train. Validation/test только `transform`.",
      },
      {
        id: "validation-stratify",
        kind: "fill",
        title: "Stratified split",
        prompt: "Заполни аргумент, который сохраняет пропорции классов.",
        code: "train_test_split(X, y, test_size=0.2, random_state=42, ____=y)",
        blanks: ["stratify"],
        hint: "Это прямое имя параметра sklearn.",
        explain: "`stratify=y` почти всегда нужен в classification baseline.",
      },
      {
        id: "validation-group-split",
        kind: "choice",
        title: "Group split",
        prompt: "Когда нужен GroupKFold?",
        options: ["когда один user/object встречается много раз", "когда классы сбалансированы", "когда нет категорий", "только для CV"],
        answer: "когда один user/object встречается много раз",
        hint: "Один и тот же объект не должен попасть и в train, и в val.",
        explain: "Group split защищает от запоминания пользователя, пациента, товара или сессии.",
      },
      {
        id: "validation-target-encoding",
        kind: "order",
        title: "Target encoding без leakage",
        prompt: "Собери KFold mean target encoding.",
        blocks: [
          "kf = KFold(n_splits=5, shuffle=True, random_state=42)",
          "for tr_idx, val_idx in kf.split(train):",
          "    mapping = train.iloc[tr_idx].groupby(col)[target].mean()",
          "    oof.iloc[val_idx] = train.iloc[val_idx][col].map(mapping)",
          "test_enc = test[col].map(train.groupby(col)[target].mean())",
        ],
        answer: [
          "kf = KFold(n_splits=5, shuffle=True, random_state=42)",
          "for tr_idx, val_idx in kf.split(train):",
          "    mapping = train.iloc[tr_idx].groupby(col)[target].mean()",
          "    oof.iloc[val_idx] = train.iloc[val_idx][col].map(mapping)",
          "test_enc = test[col].map(train.groupby(col)[target].mean())",
        ],
        hint: "Train получает только OOF encoding.",
        explain: "Иначе строка train увидит свой target через среднее категории.",
      },
      {
        id: "validation-time",
        kind: "choice",
        title: "Time split",
        prompt: "Если test находится позже train по времени, какой split честнее?",
        options: ["последние даты в validation", "случайный stratified split", "перемешать всё", "fold по алфавиту"],
        answer: "последние даты в validation",
        hint: "Validation должна имитировать будущий test.",
        explain: "Time leakage особенно больно бьёт в табличных задачах и recommender systems.",
      },
      {
        id: "validation-adversarial-code",
        kind: "order",
        title: "Adversarial validation",
        prompt: "Собери проверку train/test shift в коде.",
        blocks: [
          "X_adv = pd.concat([X_train, X_test])",
          "y_adv = np.r_[np.ones(len(X_train)), np.zeros(len(X_test))]",
          "clf.fit(X_adv, y_adv)",
          "auc = roc_auc_score(y_adv, clf.predict_proba(X_adv)[:, 1])",
        ],
        answer: [
          "X_adv = pd.concat([X_train, X_test])",
          "y_adv = np.r_[np.ones(len(X_train)), np.zeros(len(X_test))]",
          "clf.fit(X_adv, y_adv)",
          "auc = roc_auc_score(y_adv, clf.predict_proba(X_adv)[:, 1])",
        ],
        hint: "Делаем классификатор: train или test.",
        explain: "Если AUC сильно выше 0.5, распределения отличаются и val надо строить аккуратнее.",
      },
      {
        id: "validation-lb-discipline",
        kind: "choice",
        title: "20 submits",
        prompt: "Что сделать после первого результата выше baseline?",
        options: ["сразу отправить submit", "ждать идеальное решение", "удалить validation", "менять 10 вещей сразу"],
        answer: "сразу отправить submit",
        hint: "Тренер буквально это советовал.",
        explain: "Сабмит фиксирует прогресс и снижает риск, что последний эксперимент всё сломает.",
      },
    ],
  },
  {
    id: "numpy-pandas-boosting",
    title: "NumPy, Pandas, бустинг",
    track: "Табличные baseline",
    tag: "data",
    icon: "NP",
    color: "#9fb38a",
    copy: "Axes, broadcasting, groupby, missing flags, datetime features, CatBoost/LightGBM быстрые baseline.",
    rules: ["channel mean: reduce B/H/W", "boolean mask фильтрует по True", "CatBoost умеет cat_features"],
    lessons: [
      {
        id: "numpy-channel-mean",
        kind: "choice",
        title: "Mean по каналам",
        prompt: "`x.shape == (32, 3, 224, 224)`. Что оставит mean по каждому каналу?",
        options: ["x.mean(axis=(0, 2, 3))", "x.mean(axis=(1, 2, 3))", "x.mean(axis=(0, 1))", "x.mean(axis=3)"],
        answer: "x.mean(axis=(0, 2, 3))",
        hint: "Оставить нужно axis C.",
        explain: "B=0, C=1, H=2, W=3. Убираем 0/2/3, остаётся `(3,)`.",
      },
      {
        id: "numpy-broadcast",
        kind: "fill",
        title: "Normalize image batch",
        prompt: "Заполни reshape для channel mean/std.",
        code: "x = (x - mean[____]) / std[____]  # x: [B,C,H,W], mean: [C]",
        blanks: ["None, :, None, None", "None, :, None, None"],
        hint: "Нужно добавить оси batch, H и W.",
        explain: "Broadcasting экономит циклы и делает нормализацию прозрачной.",
      },
      {
        id: "pandas-groupby-mean",
        kind: "fill",
        title: "Groupby mean",
        prompt: "Заполни агрегацию среднего target по категории.",
        code: "cat_mean = df.groupby('city')['target'].____()",
        blanks: ["mean"],
        hint: "Метод называется ровно как статистика.",
        explain: "Это база для feature engineering и target encoding.",
      },
      {
        id: "pandas-missing-flag",
        kind: "order",
        title: "Missing flag",
        prompt: "Собери признак пропуска и заполнение медианой.",
        blocks: [
          "df['age_isna'] = df['age'].isna().astype(int)",
          "median_age = df['age'].median()",
          "df['age'] = df['age'].fillna(median_age)",
        ],
        answer: [
          "df['age_isna'] = df['age'].isna().astype(int)",
          "median_age = df['age'].median()",
          "df['age'] = df['age'].fillna(median_age)",
        ],
        hint: "Сначала флаг, потом fillna.",
        explain: "Сам факт пропуска часто несёт сигнал.",
      },
      {
        id: "catboost-catfeatures",
        kind: "fill",
        title: "CatBoost categories",
        prompt: "Заполни аргумент с категориальными колонками.",
        code: "model.fit(X_train, y_train, cat_features=____, eval_set=(X_val, y_val))",
        blanks: ["cat_cols"],
        hint: "CatBoost умеет принимать список категориальных признаков.",
        explain: "Это одна из причин, почему CatBoost силён как быстрый baseline.",
      },
      {
        id: "boost-predict-proba",
        kind: "choice",
        title: "Classification proba",
        prompt: "Что обычно отправляют для ROC-AUC/logloss binary classification?",
        options: ["predict_proba(X)[:, 1]", "predict(X)", "argmax(logits)", "feature_importances_"],
        answer: "predict_proba(X)[:, 1]",
        hint: "Метрике нужна вероятность положительного класса.",
        explain: "Жёсткий class label часто хуже вероятности для рейтинговых метрик.",
      },
      {
        id: "blend-average",
        kind: "fill",
        title: "Blend",
        prompt: "Заполни простое усреднение двух предсказаний.",
        code: "final_pred = 0.5 * pred_a + ____ * pred_b",
        blanks: ["0.5"],
        hint: "Сумма весов обычно равна 1.",
        explain: "Усреднение разных подходов часто даёт небольшой, но дешёвый буст.",
      },
    ],
  },
  {
    id: "metrics-losses",
    title: "Метрики и losses",
    track: "Контестная математика",
    tag: "contest",
    icon: "MX",
    color: "#c79a76",
    copy: "Accuracy, F1, ROC-AUC, MAE/RMSE, Dice/IoU, выбор loss под задачу.",
    rules: ["Оптимизируй то, что похоже на метрику", "Порог подбирается на validation", "Loss не всегда равен leaderboard metric"],
    lessons: [
      {
        id: "metric-f1",
        kind: "fill",
        title: "F1",
        prompt: "Заполни формулу F1.",
        code: "f1 = 2 * precision * recall / (precision + ____ + 1e-9)",
        blanks: ["recall"],
        hint: "Гармоническое среднее precision и recall.",
        explain: "F1 чувствителен к threshold, поэтому его часто надо подбирать.",
      },
      {
        id: "metric-rmse",
        kind: "order",
        title: "RMSE",
        prompt: "Собери RMSE из ошибок regression.",
        blocks: ["err = y_pred - y_true", "mse = np.mean(err ** 2)", "rmse = np.sqrt(mse)"],
        answer: ["err = y_pred - y_true", "mse = np.mean(err ** 2)", "rmse = np.sqrt(mse)"],
        hint: "Сначала squared error, потом mean, потом sqrt.",
        explain: "RMSE сильнее штрафует крупные ошибки, чем MAE.",
      },
      {
        id: "metric-auc-input",
        kind: "choice",
        title: "ROC-AUC input",
        prompt: "Что передавать в `roc_auc_score(y_true, y_score)`?",
        options: ["вероятности/скор положительного класса", "class label 0/1", "loss", "feature names"],
        answer: "вероятности/скор положительного класса",
        hint: "AUC ранжирует объекты.",
        explain: "AUC не требует threshold, но требует непрерывный score.",
      },
      {
        id: "metric-precision",
        kind: "fill",
        title: "Precision",
        prompt: "Заполни формулу precision.",
        code: "precision = TP / (TP + ____ + 1e-9)",
        blanks: ["FP"],
        hint: "False positives портят precision.",
        explain: "Precision отвечает: из предсказанных positive сколько настоящих positive.",
      },
      {
        id: "metric-recall",
        kind: "fill",
        title: "Recall",
        prompt: "Заполни формулу recall.",
        code: "recall = TP / (TP + ____ + 1e-9)",
        blanks: ["FN"],
        hint: "False negatives портят recall.",
        explain: "Recall отвечает: сколько настоящих positive мы нашли.",
      },
      {
        id: "metric-threshold",
        kind: "order",
        title: "Threshold для F1",
        prompt: "Собери подбор threshold на validation.",
        blocks: [
          "for t in np.linspace(0.05, 0.95, 19):",
          "    pred = (proba > t).astype(int)",
          "    score = f1_score(y_val, pred)",
          "    best_t = t if score > best_score else best_t",
        ],
        answer: [
          "for t in np.linspace(0.05, 0.95, 19):",
          "    pred = (proba > t).astype(int)",
          "    score = f1_score(y_val, pred)",
          "    best_t = t if score > best_score else best_t",
        ],
        hint: "Threshold не обязан быть 0.5.",
        explain: "На F1/Dice/IoU threshold sweep часто дешевле новой модели.",
      },
    ],
  },
  {
    id: "architectures",
    title: "Архитектуры: conv, attention, recsys",
    track: "Модели",
    tag: "torch",
    icon: "AR",
    color: "#8f9a7a",
    copy: "Свертки, attention, embeddings, diffusion/RL/recsys ровно в объёме, полезном для контестов.",
    rules: ["Conv2d ждёт `[B,C,H,W]`", "Attention softmax по key dimension", "Embedding index dtype long"],
    lessons: [
      {
        id: "conv-shape",
        kind: "choice",
        title: "Conv2d input",
        prompt: "Какой shape ждёт `nn.Conv2d`?",
        options: ["[B,C,H,W]", "[B,H,W,C]", "[C,B,H,W]", "[H,W,C]"],
        answer: "[B,C,H,W]",
        hint: "В torch каналы идут перед высотой и шириной.",
        explain: "Поэтому после numpy/PIL часто нужен `permute(2,0,1)`.",
      },
      {
        id: "conv-output-fill",
        kind: "fill",
        title: "Padding same-ish",
        prompt: "Для `kernel_size=3`, `stride=1` какой padding сохраняет H,W?",
        code: "conv = nn.Conv2d(3, 16, kernel_size=3, stride=1, padding=____)",
        blanks: ["1"],
        hint: "Один пиксель с каждой стороны.",
        explain: "Это базовая арифметика сверток: kernel 3 съедает по 1 с края.",
      },
      {
        id: "attention-core",
        kind: "order",
        title: "Scaled dot attention",
        prompt: "Собери ядро attention.",
        blocks: [
          "scores = Q @ K.transpose(-2, -1) / math.sqrt(d)",
          "weights = scores.softmax(dim=-1)",
          "out = weights @ V",
        ],
        answer: [
          "scores = Q @ K.transpose(-2, -1) / math.sqrt(d)",
          "weights = scores.softmax(dim=-1)",
          "out = weights @ V",
        ],
        hint: "Сравнить токены, нормировать по ключам, смешать values.",
        explain: "В ViT/CLIP attention maps иногда используют как слабую локализацию объекта.",
      },
      {
        id: "attention-shape",
        kind: "choice",
        title: "Shape scores",
        prompt: "`Q,K,V.shape == [B, heads, T, d_head]`. Какая форма у scores?",
        options: ["[B, heads, T, T]", "[B, T, heads, heads]", "[B, heads, d_head, d_head]", "[T, T]"],
        answer: "[B, heads, T, T]",
        hint: "Каждый query token сравнивается с каждым key token.",
        explain: "Последние две оси: query positions × key positions.",
      },
      {
        id: "embedding-long",
        kind: "choice",
        title: "Embedding dtype",
        prompt: "Какой dtype нужен индексам для `nn.Embedding`?",
        options: ["torch.long", "torch.float32", "torch.bool", "torch.float16"],
        answer: "torch.long",
        hint: "Embedding получает ids, а не one-hot.",
        explain: "Это важно для recsys и NLP задач с категориальными id.",
      },
      {
        id: "recsys-dot",
        kind: "order",
        title: "Matrix factorization",
        prompt: "Собери forward для user/item embeddings.",
        blocks: ["u = self.user_emb(user_id)", "i = self.item_emb(item_id)", "score = (u * i).sum(dim=1)", "return score"],
        answer: ["u = self.user_emb(user_id)", "i = self.item_emb(item_id)", "score = (u * i).sum(dim=1)", "return score"],
        hint: "Dot product через elementwise multiply и sum.",
        explain: "Это минимальный recsys baseline, который реально можно написать руками.",
      },
      {
        id: "rl-q-update",
        kind: "fill",
        title: "Q-learning",
        prompt: "Заполни bootstrapped target.",
        code: "target = reward + gamma * ____",
        blanks: ["next_q.max()"],
        hint: "Берём лучшую оценку следующего состояния.",
        explain: "Для олимпиад RL редко глубже этого, но формулу полезно узнавать.",
      },
      {
        id: "diffusion-noise",
        kind: "order",
        title: "Diffusion train step",
        prompt: "Собери идею обучения noise predictor.",
        blocks: [
          "noise = torch.randn_like(x0)",
          "xt = add_noise(x0, noise, t)",
          "pred_noise = model(xt, t)",
          "loss = F.mse_loss(pred_noise, noise)",
        ],
        answer: [
          "noise = torch.randn_like(x0)",
          "xt = add_noise(x0, noise, t)",
          "pred_noise = model(xt, t)",
          "loss = F.mse_loss(pred_noise, noise)",
        ],
        hint: "Модель учится предсказывать добавленный шум.",
        explain: "Даже если pretrained нельзя, понимание diffusion помогает читать CV-задачи с шумом/денойзингом.",
      },
    ],
  },
];

const advancedCvTorchLessons = [
  {
    id: "adv-cv-dataset-long-mask",
    kind: "fix",
    title: "Dataset: mask как LongTensor",
    prompt: "Исправь Dataset для сегментации: image должен быть float CHW в [0,1], mask - LongTensor HW с классами, без канала.",
    code:
      "class SegDataset(torch.utils.data.Dataset):\n    def __getitem__(self, i):\n        img = Image.open(self.imgs[i]).convert('RGB')\n        mask = Image.open(self.masks[i]).convert('L')\n        img = torch.tensor(np.array(img))\n        mask = torch.tensor(np.array(mask)).float().unsqueeze(0)\n        return img, mask",
    answer:
      "class SegDataset(torch.utils.data.Dataset):\n    def __getitem__(self, i):\n        img = Image.open(self.imgs[i]).convert('RGB')\n        mask = Image.open(self.masks[i]).convert('L')\n        img = torch.from_numpy(np.array(img)).permute(2,0,1).float() / 255.0\n        mask = torch.from_numpy(np.array(mask)).long()\n        return img, mask",
    hint: "Для CrossEntropyLoss маска не one-hot и не float.",
    explain: "Изображение переводится в CHW float, а маска остается HW long с индексами классов.",
    difficulty: 3,
  },
  {
    id: "adv-cv-resize-pair",
    kind: "write",
    title: "resize_pair",
    prompt: "Напиши функцию `resize_pair(img, mask, size)`, где img и mask - PIL Image. Для img используй bilinear, для mask nearest.",
    starter: "def resize_pair(img, mask, size):",
    answer:
      "def resize_pair(img, mask, size):\n    img = img.resize(size, Image.BILINEAR)\n    mask = mask.resize(size, Image.NEAREST)\n    return img, mask",
    testsText: "Проверяется, что маска не получает дробных классов после resize.",
    hint: "Для разметки нельзя использовать bilinear.",
    explain: "Nearest сохраняет целочисленные id классов.",
    difficulty: 2,
  },
  {
    id: "adv-torch-bce-logits",
    kind: "fix",
    title: "BCEWithLogits без sigmoid",
    prompt: "Исправь training step для бинарной сегментации. Модель возвращает logits формы Bx1xHxW.",
    code: "logits = model(x)\nprob = torch.sigmoid(logits)\nloss = torch.nn.BCEWithLogitsLoss()(prob, y.float())\nloss.backward()",
    answer: "logits = model(x)\nloss = torch.nn.BCEWithLogitsLoss()(logits, y.float())\nloss.backward()",
    hint: "BCEWithLogitsLoss уже содержит sigmoid внутри.",
    explain: "Передача probability вместо logits ухудшает численную устойчивость и меняет смысл loss.",
    difficulty: 3,
  },
  {
    id: "adv-seg-soft-dice-loss",
    kind: "write",
    title: "Soft Dice loss",
    prompt: "Напиши `dice_loss(logits, target, eps=1e-6)` для бинарной сегментации. logits: Bx1xHxW, target: Bx1xHxW.",
    starter: "def dice_loss(logits, target, eps=1e-6):",
    answer:
      "def dice_loss(logits, target, eps=1e-6):\n    prob = torch.sigmoid(logits)\n    target = target.float()\n    dims = (1,2,3)\n    inter = (prob * target).sum(dims)\n    union = prob.sum(dims) + target.sum(dims)\n    dice = (2 * inter + eps) / (union + eps)\n    return 1 - dice.mean()",
    testsText: "Проверяется perfect prediction, пустые маски и batch size > 1.",
    hint: "Суммируй по C,H,W, но не по batch.",
    explain: "Dice считается отдельно для каждого объекта batch и затем усредняется.",
    difficulty: 4,
  },
  {
    id: "adv-validate-no-grad",
    kind: "fix",
    title: "Validation без graph",
    prompt: "Исправь validation loop: нужно правильно считать средний loss без накопления графа.",
    code:
      "def validate(model, loader, criterion):\n    total = 0\n    for x, y in loader:\n        pred = model(x)\n        loss = criterion(pred, y)\n        total += loss\n    return total / len(loader)",
    answer:
      "def validate(model, loader, criterion):\n    model.eval()\n    total = 0.0\n    with torch.no_grad():\n        for x, y in loader:\n            pred = model(x)\n            loss = criterion(pred, y)\n            total += loss.item()\n    return total / len(loader)",
    hint: "На валидации не нужен autograd.",
    explain: "eval отключает train-поведение слоев, no_grad экономит память, item убирает tensor graph.",
    difficulty: 3,
  },
  {
    id: "adv-torch-mask-to-bbox",
    kind: "write",
    title: "mask_to_bbox на torch",
    prompt: "Напиши `mask_to_bbox(mask)`, где mask - Tensor HxW с 0/1. Верни `(x1,y1,x2,y2)` inclusive или None.",
    starter: "def mask_to_bbox(mask):",
    answer:
      "def mask_to_bbox(mask):\n    ys, xs = torch.where(mask > 0)\n    if xs.numel() == 0:\n        return None\n    return (xs.min().item(), ys.min().item(), xs.max().item(), ys.max().item())",
    testsText: "Проверяются пустая маска, один пиксель, прямоугольник не с нуля.",
    hint: "torch.where вернет координаты y,x.",
    explain: "В изображениях x - столбец, y - строка.",
    difficulty: 3,
  },
  {
    id: "adv-threshold-dice",
    kind: "fix",
    title: "Threshold: максимум Dice",
    prompt: "Исправь поиск лучшего threshold по Dice. probs и masks - Tensor NxHxW.",
    code:
      "best_t, best_d = 0.5, 1.0\nfor t in torch.linspace(0, 1, 21):\n    pred = probs > t\n    d = dice_score(pred, masks)\n    if d < best_d:\n        best_t, best_d = t, d\nreturn best_t",
    answer:
      "best_t, best_d = 0.5, -1.0\nfor t in torch.linspace(0, 1, 21):\n    pred = probs > t\n    d = dice_score(pred, masks)\n    if d > best_d:\n        best_t, best_d = t.item(), d\nreturn best_t",
    hint: "Dice нужно максимизировать.",
    explain: "Инициализируем худшим значением и обновляемся при улучшении метрики.",
    difficulty: 2,
  },
  {
    id: "adv-binary-iou",
    kind: "write",
    title: "binary_iou",
    prompt: "Напиши `binary_iou(pred, target, eps=1e-6)`. pred и target bool или 0/1 Tensor одинаковой формы.",
    starter: "def binary_iou(pred, target, eps=1e-6):",
    answer:
      "def binary_iou(pred, target, eps=1e-6):\n    pred = pred.bool()\n    target = target.bool()\n    inter = (pred & target).sum().float()\n    union = (pred | target).sum().float()\n    return ((inter + eps) / (union + eps)).item()",
    testsText: "Проверяется пересечение, полное совпадение и обе пустые маски.",
    hint: "Используй логические операции, не сложение.",
    explain: "IoU равен intersection / union; eps стабилизирует пустой случай.",
    difficulty: 3,
  },
  {
    id: "adv-count-components",
    kind: "fix",
    title: "Считай объекты, а не пиксели",
    prompt: "Исправь `count_objects` для бинарной numpy-маски HxW. Нужно вернуть число связных компонент foreground.",
    code: "def count_objects(mask):\n    return int(mask.sum())",
    answer:
      "def count_objects(mask):\n    num, labels = cv2.connectedComponents(mask.astype(np.uint8))\n    return num - 1",
    hint: "connectedComponents включает фон как компоненту 0.",
    explain: "Количество объектов равно числу компонент минус фон.",
    difficulty: 3,
  },
  {
    id: "adv-density-count-loss",
    kind: "write",
    title: "Density count loss",
    prompt: "Напиши `count_loss(pred_density, target_points)`: pred_density Bx1xHxW, target_points Bx1xHxW, loss - MSE между суммами.",
    starter: "def count_loss(pred_density, target_points):",
    answer:
      "def count_loss(pred_density, target_points):\n    pred_count = pred_density.sum(dim=(1,2,3))\n    true_count = target_points.float().sum(dim=(1,2,3))\n    return torch.nn.functional.mse_loss(pred_count, true_count)",
    testsText: "Проверяется batch size > 1 и суммирование по пространству.",
    hint: "Считать нужно не попиксельную MSE, а ошибку количества.",
    explain: "Сумма density map интерпретируется как предсказанное число объектов.",
    difficulty: 4,
  },
  {
    id: "adv-conv-linear-shape",
    kind: "fix",
    title: "Conv2d shapes",
    prompt: "После Conv2d(3,16,kernel_size=3,padding=1), MaxPool2d(2), вход Bx3x64x64. Исправь Linear.",
    code:
      "self.conv = nn.Conv2d(3, 16, kernel_size=3, padding=1)\nself.pool = nn.MaxPool2d(2)\nself.fc = nn.Linear(16 * 64 * 64, 10)",
    answer:
      "self.conv = nn.Conv2d(3, 16, kernel_size=3, padding=1)\nself.pool = nn.MaxPool2d(2)\nself.fc = nn.Linear(16 * 32 * 32, 10)",
    hint: "Pooling с kernel 2 уменьшает H и W в 2 раза.",
    explain: "Conv с padding=1 сохраняет 64x64, pool делает 32x32.",
    difficulty: 2,
  },
  {
    id: "adv-forward-flatten",
    kind: "write",
    title: "Forward flatten",
    prompt: "Напиши forward для модели с `self.features` и `self.classifier`. Нужно применить features, flatten с batch dimension, затем classifier.",
    starter: "def forward(self, x):",
    answer:
      "def forward(self, x):\n    x = self.features(x)\n    x = torch.flatten(x, 1)\n    x = self.classifier(x)\n    return x",
    testsText: "Проверяется, что batch dimension не схлопывается.",
    hint: "torch.flatten(x, 1).",
    explain: "start_dim=1 сохраняет размер batch.",
    difficulty: 2,
  },
  {
    id: "adv-sync-flip",
    kind: "fix",
    title: "Синхронный random flip",
    prompt: "Исправь augmentation: image и mask должны флипаться синхронно.",
    code:
      "if random.random() < 0.5:\n    img = TF.hflip(img)\nif random.random() < 0.5:\n    mask = TF.hflip(mask)",
    answer:
      "if random.random() < 0.5:\n    img = TF.hflip(img)\n    mask = TF.hflip(mask)",
    hint: "Один random draw на пару.",
    explain: "Иначе изображение и разметка перестают соответствовать друг другу.",
    difficulty: 2,
  },
  {
    id: "adv-normalize-img",
    kind: "write",
    title: "normalize_img",
    prompt: "Напиши `normalize_img(x, mean, std)`, где x Tensor CxHxW в [0,1], mean/std списки длины C.",
    starter: "def normalize_img(x, mean, std):",
    answer:
      "def normalize_img(x, mean, std):\n    mean = torch.tensor(mean, device=x.device).view(-1,1,1)\n    std = torch.tensor(std, device=x.device).view(-1,1,1)\n    return (x - mean) / std",
    testsText: "Проверяется broadcasting по C,H,W и сохранение device.",
    hint: "mean/std нужно reshape в Cx1x1.",
    explain: "Так нормализация применяется поканально.",
    difficulty: 3,
  },
  {
    id: "adv-ce-no-one-hot",
    kind: "fix",
    title: "CE без one-hot",
    prompt: "Исправь loss для multiclass segmentation. logits: BxCxHxW, mask: BxHxW с class ids.",
    code: "target = torch.nn.functional.one_hot(mask, num_classes=C).float()\nloss = torch.nn.CrossEntropyLoss()(logits, target)",
    answer: "loss = torch.nn.CrossEntropyLoss()(logits, mask.long())",
    hint: "CrossEntropyLoss принимает class indices.",
    explain: "Для dense segmentation target должен быть BxHxW long, а logits BxCxHxW.",
    difficulty: 3,
  },
  {
    id: "adv-best-threshold-f1",
    kind: "write",
    title: "best_threshold_f1",
    prompt: "Напиши `best_threshold_f1(probs, target)`, перебирая thresholds `torch.linspace(0.05,0.95,19)`. Верни float threshold.",
    starter: "def best_threshold_f1(probs, target):",
    answer:
      "def best_threshold_f1(probs, target):\n    best_t, best_f1 = 0.5, -1.0\n    target = target.bool()\n    for t in torch.linspace(0.05, 0.95, 19, device=probs.device):\n        pred = probs >= t\n        tp = (pred & target).sum().float()\n        fp = (pred & ~target).sum().float()\n        fn = (~pred & target).sum().float()\n        f1 = (2 * tp / (2 * tp + fp + fn + 1e-6)).item()\n        if f1 > best_f1:\n            best_t, best_f1 = t.item(), f1\n    return best_t",
    testsText: "Проверяется, что выбирается максимум F1, а threshold возвращается как float.",
    hint: "F1 = 2TP / (2TP + FP + FN).",
    explain: "Сравнение идет по всем пикселям и всем изображениям сразу.",
    difficulty: 5,
  },
  {
    id: "adv-device-target",
    kind: "fix",
    title: "Target на GPU",
    prompt: "Исправь training step: модель и x на device, но target остался на CPU.",
    code: "x = x.to(device)\nlogits = model(x)\nloss = criterion(logits, y.float())",
    answer: "x = x.to(device)\ny = y.to(device)\nlogits = model(x)\nloss = criterion(logits, y.float())",
    hint: "Все tensors в операции loss должны быть на одном device.",
    explain: "CPU target и CUDA logits вызовут runtime error.",
    difficulty: 2,
  },
  {
    id: "adv-remove-small-components",
    kind: "write",
    title: "remove_small_components",
    prompt: "Напиши `remove_small_components(mask, min_area)`. mask - numpy 0/1 HxW. Верни 0/1 mask без компонент меньше min_area.",
    starter: "def remove_small_components(mask, min_area):",
    answer:
      "def remove_small_components(mask, min_area):\n    num, labels = cv2.connectedComponents(mask.astype(np.uint8))\n    out = np.zeros_like(mask, dtype=np.uint8)\n    for i in range(1, num):\n        comp = labels == i\n        if comp.sum() >= min_area:\n            out[comp] = 1\n    return out",
    testsText: "Проверяется удаление шума и сохранение больших объектов.",
    hint: "Компонента 0 - фон.",
    explain: "Каждая foreground-компонента проверяется по площади.",
    difficulty: 4,
  },
  {
    id: "adv-density-no-sigmoid",
    kind: "fix",
    title: "Density без sigmoid",
    prompt: "Исправь forward/loss для density regression. Density map должна быть неограниченной сверху.",
    code: "pred = torch.sigmoid(model(x))\nloss = torch.nn.functional.mse_loss(pred, density)",
    answer: "pred = model(x)\nloss = torch.nn.functional.mse_loss(pred, density)",
    hint: "Density values могут быть больше 1 после сглаживания и суммирования.",
    explain: "Sigmoid ограничивает выход [0,1] и мешает регрессии плотности.",
    difficulty: 4,
  },
  {
    id: "adv-conv2d-out",
    kind: "write",
    title: "conv2d_out",
    prompt: "Напиши `conv2d_out(h, w, kernel, stride=1, padding=0, dilation=1)`, возвращающую `(out_h, out_w)`.",
    starter: "def conv2d_out(h, w, kernel, stride=1, padding=0, dilation=1):",
    answer:
      "def conv2d_out(h, w, kernel, stride=1, padding=0, dilation=1):\n    kh, kw = kernel if isinstance(kernel, tuple) else (kernel, kernel)\n    sh, sw = stride if isinstance(stride, tuple) else (stride, stride)\n    ph, pw = padding if isinstance(padding, tuple) else (padding, padding)\n    dh, dw = dilation if isinstance(dilation, tuple) else (dilation, dilation)\n    oh = (h + 2 * ph - dh * (kh - 1) - 1) // sh + 1\n    ow = (w + 2 * pw - dw * (kw - 1) - 1) // sw + 1\n    return oh, ow",
    testsText: "Проверяется scalar и tuple параметры, stride > 1, padding, dilation.",
    hint: "Формула PyTorch Conv2d есть в документации.",
    explain: "Функция повторяет расчет пространственного размера выхода Conv2d.",
    difficulty: 5,
  },
];

topics.find((topic) => topic.id === "cv-segmentation").lessons.push(...advancedCvTorchLessons.slice(0, 10));
topics.find((topic) => topic.id === "torch-loops").lessons.push(...advancedCvTorchLessons.slice(10, 16));
topics.find((topic) => topic.id === "cv-detection-count").lessons.push(...advancedCvTorchLessons.slice(16));

const advancedValidationLessons = [
  {
    id: "adv-oof-target-encoding",
    kind: "fix",
    title: "OOF target encoding",
    prompt: "Исправь target encoding: сейчас категория кодируется по всему train, включая собственный target строки.",
    code:
      "global_mean = y.mean()\nte = train.groupby('city')['target'].mean()\ntrain['city_te'] = train['city'].map(te).fillna(global_mean)\ntest['city_te'] = test['city'].map(te).fillna(global_mean)",
    answer:
      "from sklearn.model_selection import KFold\n\nglobal_mean = y.mean()\ntrain['city_te'] = global_mean\n\nkf = KFold(n_splits=5, shuffle=True, random_state=42)\nfor tr_idx, val_idx in kf.split(train):\n    means = y.iloc[tr_idx].groupby(train.iloc[tr_idx]['city']).mean()\n    train.loc[train.index[val_idx], 'city_te'] = (\n        train.iloc[val_idx]['city'].map(means).fillna(global_mean).values\n    )\n\nte_full = y.groupby(train['city']).mean()\ntest['city_te'] = test['city'].map(te_full).fillna(global_mean)",
    hint: "Для train кодировки должны считаться только на других фолдах.",
    explain: "Полная groupby-агрегация по train дает строке доступ к собственному target. OOF-схема убирает эту утечку.",
    difficulty: 5,
  },
  {
    id: "adv-oof-target-smoothing",
    kind: "write",
    title: "TE со smoothing",
    prompt: "Напиши `oof_target_encode(train_col, test_col, y)`: KFold OOF target encoding со сглаживанием `(sum + m * global_mean) / (count + m)`.",
    starter: "def oof_target_encode(train_col, test_col, y, n_splits=5, m=20):\n    # return train_encoded, test_encoded",
    answer:
      "import pandas as pd\nfrom sklearn.model_selection import KFold\n\ndef oof_target_encode(train_col, test_col, y, n_splits=5, m=20):\n    train_col = pd.Series(train_col).reset_index(drop=True)\n    test_col = pd.Series(test_col).reset_index(drop=True)\n    y = pd.Series(y).reset_index(drop=True)\n\n    global_mean = y.mean()\n    encoded = pd.Series(global_mean, index=train_col.index, dtype=float)\n    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)\n\n    for tr_idx, val_idx in kf.split(train_col):\n        stats = (\n            pd.DataFrame({'cat': train_col.iloc[tr_idx], 'y': y.iloc[tr_idx]})\n            .groupby('cat')['y']\n            .agg(['sum', 'count'])\n        )\n        stats['enc'] = (stats['sum'] + m * global_mean) / (stats['count'] + m)\n        encoded.iloc[val_idx] = train_col.iloc[val_idx].map(stats['enc']).fillna(global_mean)\n\n    full_stats = (\n        pd.DataFrame({'cat': train_col, 'y': y})\n        .groupby('cat')['y']\n        .agg(['sum', 'count'])\n    )\n    full_stats['enc'] = (full_stats['sum'] + m * global_mean) / (full_stats['count'] + m)\n    test_encoded = test_col.map(full_stats['enc']).fillna(global_mean)\n\n    return encoded, test_encoded",
    testsText: "Проверяется OOF для train, full-train mapping для test и сглаживание редких категорий.",
    hint: "Для test можно обучить кодировку на всем train, но для train нужна OOF-кодировка.",
    explain: "Smoothing защищает редкие категории от экстремальных средних, а OOF защищает от leakage.",
    difficulty: 5,
  },
  {
    id: "adv-groupkfold-users",
    kind: "fix",
    title: "GroupKFold по user_id",
    prompt: "Исправь валидацию: один `user_id` не должен попадать одновременно в train и valid.",
    code:
      "from sklearn.model_selection import KFold\n\nkf = KFold(n_splits=5, shuffle=True, random_state=42)\nfor tr_idx, val_idx in kf.split(X):\n    model.fit(X.iloc[tr_idx], y.iloc[tr_idx])\n    pred = model.predict_proba(X.iloc[val_idx])[:, 1]",
    answer:
      "from sklearn.model_selection import GroupKFold\n\ngkf = GroupKFold(n_splits=5)\nfor tr_idx, val_idx in gkf.split(X, y, groups=X['user_id']):\n    model.fit(X.iloc[tr_idx], y.iloc[tr_idx])\n    pred = model.predict_proba(X.iloc[val_idx])[:, 1]",
    hint: "Если строки одного пользователя похожи, обычный KFold переоценивает качество.",
    explain: "GroupKFold гарантирует, что все строки одной группы остаются в одном фолде.",
    difficulty: 3,
  },
  {
    id: "adv-time-split",
    kind: "write",
    title: "Time split",
    prompt: "Напиши разбиение train/valid: valid должен быть последними 20% строк по `event_time`, без shuffle.",
    starter: "def time_split(df, time_col='event_time', valid_frac=0.2):\n    # return train_idx, valid_idx",
    answer:
      "def time_split(df, time_col='event_time', valid_frac=0.2):\n    ordered = df.sort_values(time_col)\n    split_pos = int(len(ordered) * (1 - valid_frac))\n    train_idx = ordered.index[:split_pos]\n    valid_idx = ordered.index[split_pos:]\n    return train_idx, valid_idx",
    testsText: "Проверяется, что valid - хвост по времени, а исходные индексы сохранены.",
    hint: "Сначала отсортируй по времени, потом режь хвост.",
    explain: "В задачах с временной природой случайный split может дать модели информацию из будущего.",
    difficulty: 3,
  },
  {
    id: "adv-threshold-leakage",
    kind: "fix",
    title: "Threshold leakage",
    prompt: "Исправь код: threshold нельзя выбирать по `y_test`.",
    code:
      "test_proba = model.predict_proba(X_test)[:, 1]\n\nbest_t = 0.5\nbest_f1 = 0\nfor t in np.linspace(0.01, 0.99, 99):\n    f1 = f1_score(y_test, test_proba >= t)\n    if f1 > best_f1:\n        best_f1 = f1\n        best_t = t\n\ntest_pred = (test_proba >= best_t).astype(int)",
    answer:
      "valid_proba = model.predict_proba(X_valid)[:, 1]\n\nbest_t = 0.5\nbest_f1 = -1\nfor t in np.linspace(0.01, 0.99, 99):\n    f1 = f1_score(y_valid, valid_proba >= t)\n    if f1 > best_f1:\n        best_f1 = f1\n        best_t = t\n\ntest_proba = model.predict_proba(X_test)[:, 1]\ntest_pred = (test_proba >= best_t).astype(int)",
    hint: "Test должен оставаться невидимым до финальной оценки.",
    explain: "Выбор threshold по test превращает test в validation и завышает финальную метрику.",
    difficulty: 4,
  },
  {
    id: "adv-oof-predictions",
    kind: "write",
    title: "OOF predictions",
    prompt: "Напиши генерацию OOF `predict_proba` для sklearn-модели: верни `oof_pred` и `test_pred`, где test усредняется по фолдам.",
    starter: "def make_oof_predictions(model_factory, X, y, X_test, cv):\n    # model_factory returns a fresh model",
    answer:
      "import numpy as np\n\ndef make_oof_predictions(model_factory, X, y, X_test, cv):\n    oof_pred = np.zeros(len(X))\n    test_pred = np.zeros(len(X_test))\n\n    for tr_idx, val_idx in cv.split(X, y):\n        model = model_factory()\n        model.fit(X.iloc[tr_idx], y.iloc[tr_idx])\n        oof_pred[val_idx] = model.predict_proba(X.iloc[val_idx])[:, 1]\n        test_pred += model.predict_proba(X_test)[:, 1] / cv.get_n_splits()\n\n    return oof_pred, test_pred",
    testsText: "Проверяется fresh model на каждый fold и усреднение test predictions.",
    hint: "Нужна новая модель на каждый фолд.",
    explain: "OOF-предсказания дают честные мета-признаки для train, а test обычно усредняется по моделям фолдов.",
    difficulty: 5,
  },
  {
    id: "adv-scaler-leakage",
    kind: "fix",
    title: "StandardScaler leakage",
    prompt: "Исправь leakage: scaler обучается на полном датасете до split.",
    code:
      "scaler = StandardScaler()\nX_scaled = scaler.fit_transform(X)\n\nX_train, X_valid, y_train, y_valid = train_test_split(\n    X_scaled, y, test_size=0.2, random_state=42\n)",
    answer:
      "X_train, X_valid, y_train, y_valid = train_test_split(\n    X, y, test_size=0.2, random_state=42\n)\n\nscaler = StandardScaler()\nX_train = scaler.fit_transform(X_train)\nX_valid = scaler.transform(X_valid)",
    hint: "fit только на train, transform на valid.",
    explain: "Scaler хранит средние и дисперсии. Если считать их до split, validation влияет на preprocessing.",
    difficulty: 2,
  },
  {
    id: "adv-rolling-no-current",
    kind: "write",
    title: "Rolling без текущей строки",
    prompt: "Для каждого `user_id` создай `prev_amount_mean_3`: среднее трех предыдущих `amount` по времени. Текущую строку включать нельзя.",
    starter: "# df has user_id, event_time, amount\n# create prev_amount_mean_3",
    answer:
      "df = df.sort_values(['user_id', 'event_time'])\n\ndf['prev_amount_mean_3'] = (\n    df.groupby('user_id')['amount']\n    .transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())\n)",
    testsText: "Проверяется, что первая строка пользователя не видит собственный amount.",
    hint: "`shift(1)` должен быть до `rolling`.",
    explain: "Без shift текущий amount попадет в собственный признак, что особенно опасно при прогнозе будущих событий.",
    difficulty: 4,
  },
  {
    id: "adv-missing-flags",
    kind: "write",
    title: "Missing flags",
    prompt: "Создай missing flags для числовых колонок и затем заполни пропуски медианами train.",
    starter: "num_cols = ['age', 'income', 'score']\n\n# modify train and test",
    answer:
      "num_cols = ['age', 'income', 'score']\n\nfor col in num_cols:\n    train[f'{col}_is_missing'] = train[col].isna().astype('int8')\n    test[f'{col}_is_missing'] = test[col].isna().astype('int8')\n\n    median_value = train[col].median()\n    train[col] = train[col].fillna(median_value)\n    test[col] = test[col].fillna(median_value)",
    testsText: "Проверяется порядок: сначала флаг, затем fillna train-медианой.",
    hint: "Статистики заполнения бери только из train.",
    explain: "Флаг пропуска может быть полезным сигналом, а медиана test не должна влиять на preprocessing.",
    difficulty: 2,
  },
  {
    id: "adv-catboost-cats",
    kind: "fix",
    title: "CatBoost cat_features",
    prompt: "Исправь обучение CatBoost: категориальные признаки передаются неправильно.",
    code:
      "cat_cols = ['city', 'device', 'merchant_id']\n\nmodel = CatBoostClassifier(\n    iterations=500,\n    learning_rate=0.05,\n    verbose=False\n)\n\nmodel.fit(X_train, y_train, eval_set=(X_valid, y_valid))",
    answer:
      "cat_cols = ['city', 'device', 'merchant_id']\ncat_features = [X_train.columns.get_loc(col) for col in cat_cols]\n\nmodel = CatBoostClassifier(\n    iterations=500,\n    learning_rate=0.05,\n    verbose=False,\n    random_seed=42\n)\n\nmodel.fit(\n    X_train,\n    y_train,\n    cat_features=cat_features,\n    eval_set=(X_valid, y_valid)\n)",
    hint: "CatBoost должен знать, какие колонки категориальные.",
    explain: "Без cat_features CatBoost может интерпретировать категории некорректно или упасть на object-типах.",
    difficulty: 3,
  },
  {
    id: "adv-lgbm-early-stopping",
    kind: "write",
    title: "LightGBM early stopping",
    prompt: "Напиши обучение `LGBMClassifier` с ROC-AUC, `eval_set` и early stopping на valid.",
    starter: "model = None\n# fit model",
    answer:
      "from lightgbm import LGBMClassifier, early_stopping, log_evaluation\n\nmodel = LGBMClassifier(\n    n_estimators=5000,\n    learning_rate=0.03,\n    num_leaves=64,\n    subsample=0.8,\n    colsample_bytree=0.8,\n    random_state=42\n)\n\nmodel.fit(\n    X_train,\n    y_train,\n    eval_set=[(X_valid, y_valid)],\n    eval_metric='auc',\n    callbacks=[\n        early_stopping(stopping_rounds=100),\n        log_evaluation(period=100)\n    ]\n)",
    testsText: "Проверяется большой n_estimators и callbacks для early stopping.",
    hint: "Большой `n_estimators` нормально сочетается с early stopping.",
    explain: "Early stopping выбирает число деревьев по validation и снижает риск переобучения.",
    difficulty: 4,
  },
  {
    id: "adv-permutation-importance",
    kind: "write",
    title: "Permutation importance",
    prompt: "Напиши permutation importance по ROC-AUC на validation: перемешай каждую колонку `X_valid` и измерь падение качества.",
    starter: "base_proba = model.predict_proba(X_valid)[:, 1]\nbase_score = roc_auc_score(y_valid, base_proba)\n\n# create importances",
    answer:
      "import numpy as np\nimport pandas as pd\nfrom sklearn.metrics import roc_auc_score\n\nbase_proba = model.predict_proba(X_valid)[:, 1]\nbase_score = roc_auc_score(y_valid, base_proba)\n\nrng = np.random.default_rng(42)\nimportances = []\n\nfor col in X_valid.columns:\n    X_perm = X_valid.copy()\n    X_perm[col] = rng.permutation(X_perm[col].values)\n    perm_proba = model.predict_proba(X_perm)[:, 1]\n    perm_score = roc_auc_score(y_valid, perm_proba)\n    importances.append({'feature': col, 'importance': base_score - perm_score})\n\nimportances = (\n    pd.DataFrame(importances)\n    .sort_values('importance', ascending=False)\n    .reset_index(drop=True)\n)",
    testsText: "Проверяется, что модель не переобучается, меняется только valid-колонка.",
    hint: "Модель не переобучается, меняется только validation-колонка.",
    explain: "Permutation importance честнее считать на holdout/OOF, иначе важности могут отражать переобучение.",
    difficulty: 5,
  },
  {
    id: "adv-best-f1-threshold",
    kind: "write",
    title: "F1 threshold",
    prompt: "Напиши функцию, которая по `y_true` и вероятностям подбирает threshold с максимальным F1 на valid.",
    starter: "def best_f1_threshold(y_true, proba):\n    # return best_threshold, best_score",
    answer:
      "import numpy as np\nfrom sklearn.metrics import f1_score\n\ndef best_f1_threshold(y_true, proba):\n    thresholds = np.linspace(0.01, 0.99, 99)\n    best_threshold = 0.5\n    best_score = -1.0\n\n    for threshold in thresholds:\n        pred = (proba >= threshold).astype(int)\n        score = f1_score(y_true, pred)\n        if score > best_score:\n            best_score = score\n            best_threshold = threshold\n\n    return best_threshold, best_score",
    testsText: "Проверяется, что выбирается максимум F1 и threshold не подбирается на test.",
    hint: "Не подбирай threshold на test.",
    explain: "Порог является гиперпараметром и должен выбираться только на validation/OOF предсказаниях.",
    difficulty: 3,
  },
  {
    id: "adv-mape-zero",
    kind: "fix",
    title: "MAPE без inf",
    prompt: "Исправь метрику MAPE: сейчас возможны `inf` из-за нулевых `y_true`.",
    code: "def mape(y_true, y_pred):\n    return np.mean(np.abs((y_true - y_pred) / y_true))",
    answer:
      "def mape(y_true, y_pred, eps=1e-8):\n    y_true = np.asarray(y_true)\n    y_pred = np.asarray(y_pred)\n    denom = np.maximum(np.abs(y_true), eps)\n    return np.mean(np.abs(y_true - y_pred) / denom)",
    hint: "Нужен eps в знаменателе.",
    explain: "Нулевые target делают MAPE бесконечной или NaN, поэтому знаменатель стабилизируют.",
    difficulty: 3,
  },
];

topics.find((topic) => topic.id === "validation").lessons.push(...advancedValidationLessons.slice(0, 8));
topics.find((topic) => topic.id === "numpy-pandas-boosting").lessons.push(...advancedValidationLessons.slice(8, 12));
topics.find((topic) => topic.id === "metrics-losses").lessons.push(...advancedValidationLessons.slice(12));

const extraLessonPacks = {
  "cv-masks": [
    {
      id: "extra-cv-rle-encode",
      kind: "write",
      title: "RLE encode mask",
      prompt: "Напиши `rle_encode(mask)`: mask - numpy HxW 0/1. Верни строку Kaggle RLE в column-major порядке.",
      starter: "def rle_encode(mask):",
      answer:
        "def rle_encode(mask):\n    pixels = mask.T.flatten().astype(np.uint8)\n    pixels = np.concatenate([[0], pixels, [0]])\n    runs = np.where(pixels[1:] != pixels[:-1])[0] + 1\n    runs[1::2] -= runs[::2]\n    return ' '.join(map(str, runs))",
      testsText: "Проверяется пустая маска, один объект и порядок Fortran/Kaggle.",
      hint: "Kaggle segmentation часто ожидает flatten по колонкам, поэтому нужен `mask.T.flatten()`.",
      explain: "RLE хранит старт и длину подряд идущих foreground-пикселей. Ошибка в порядке flatten полностью ломает submission.",
      difficulty: 4,
    },
    {
      id: "extra-cv-rle-decode",
      kind: "write",
      title: "RLE decode mask",
      prompt: "Напиши `rle_decode(rle, shape)`, который возвращает numpy mask HxW 0/1 из строки RLE.",
      starter: "def rle_decode(rle, shape):",
      answer:
        "def rle_decode(rle, shape):\n    mask = np.zeros(shape[0] * shape[1], dtype=np.uint8)\n    if not rle:\n        return mask.reshape((shape[1], shape[0])).T\n    values = list(map(int, rle.split()))\n    starts = np.array(values[0::2]) - 1\n    lengths = np.array(values[1::2])\n    for start, length in zip(starts, lengths):\n        mask[start:start + length] = 1\n    return mask.reshape((shape[1], shape[0])).T",
      testsText: "Проверяется round-trip encode/decode и пустая строка.",
      hint: "Если encode делал `mask.T.flatten()`, decode должен вернуть обратный reshape.",
      explain: "RLE decode нужен для локальной валидации, визуализации и ансамблей по submission-файлам.",
      difficulty: 5,
    },
    {
      id: "extra-cv-pad-to-square",
      kind: "write",
      title: "Pad image to square",
      prompt: "Напиши `pad_to_square(img, fill=0)` для numpy image HxWxC: дополни до квадрата снизу/справа.",
      starter: "def pad_to_square(img, fill=0):",
      answer:
        "def pad_to_square(img, fill=0):\n    h, w = img.shape[:2]\n    size = max(h, w)\n    out = np.full((size, size, *img.shape[2:]), fill, dtype=img.dtype)\n    out[:h, :w] = img\n    return out",
      testsText: "Проверяется H>W, W>H, grayscale/RGB и сохранение dtype.",
      hint: "Создай новый квадрат и скопируй оригинал в левый верхний угол.",
      explain: "Padding до квадрата часто проще, чем искажать aspect ratio при resize.",
      difficulty: 3,
    },
    {
      id: "extra-cv-crop-bbox-margin",
      kind: "write",
      title: "Crop bbox with margin",
      prompt: "Напиши `crop_bbox(img, bbox, margin)`, где bbox = `[x1,y1,x2,y2]`. Координаты надо обрезать границами изображения.",
      starter: "def crop_bbox(img, bbox, margin=0):",
      answer:
        "def crop_bbox(img, bbox, margin=0):\n    h, w = img.shape[:2]\n    x1, y1, x2, y2 = bbox\n    x1 = max(0, x1 - margin)\n    y1 = max(0, y1 - margin)\n    x2 = min(w - 1, x2 + margin)\n    y2 = min(h - 1, y2 + margin)\n    return img[y1:y2 + 1, x1:x2 + 1]",
      testsText: "Проверяется bbox у края картинки и inclusive формат x2/y2.",
      hint: "В numpy crop сначала y, потом x.",
      explain: "Crop по bbox полезен для second-stage классификации и быстрой визуальной проверки объектов.",
      difficulty: 4,
    },
  ],
  "cv-segmentation": [
    {
      id: "extra-cv-tta-flip-fix",
      kind: "fix",
      title: "TTA flip обратно",
      prompt: "Исправь horizontal flip TTA: предсказание на перевернутом image нужно развернуть обратно перед усреднением.",
      code:
        "prob1 = torch.sigmoid(model(x))\nprob2 = torch.sigmoid(model(torch.flip(x, dims=[3])))\nprob = (prob1 + prob2) / 2",
      answer:
        "prob1 = torch.sigmoid(model(x))\nprob2 = torch.sigmoid(model(torch.flip(x, dims=[3])))\nprob2 = torch.flip(prob2, dims=[3])\nprob = (prob1 + prob2) / 2",
      hint: "Flip по width axis нужно отменить на probability map.",
      explain: "Иначе ты усредняешь маску в разных системах координат, и контуры размываются.",
      difficulty: 4,
    },
    {
      id: "extra-cv-class-pixel-counts",
      kind: "write",
      title: "Pixel class counts",
      prompt: "Напиши `pixel_class_counts(mask, num_classes)`: вернуть количество пикселей каждого класса в mask HxW.",
      starter: "def pixel_class_counts(mask, num_classes):",
      answer:
        "def pixel_class_counts(mask, num_classes):\n    flat = mask.reshape(-1)\n    return np.bincount(flat, minlength=num_classes)[:num_classes]",
      testsText: "Проверяется отсутствие некоторых классов и num_classes больше max id.",
      hint: "`np.bincount` уже считает частоты integer ids.",
      explain: "Так быстро оценивают class imbalance для segmentation loss/weights.",
      difficulty: 3,
    },
    {
      id: "extra-cv-multiclass-dice",
      kind: "write",
      title: "Multiclass Dice",
      prompt: "Напиши `multiclass_dice(logits, target, num_classes)`. logits BxCxHxW, target BxHxW.",
      starter: "def multiclass_dice(logits, target, num_classes, eps=1e-6):",
      answer:
        "def multiclass_dice(logits, target, num_classes, eps=1e-6):\n    pred = logits.argmax(dim=1)\n    scores = []\n    for cls in range(num_classes):\n        p = pred == cls\n        t = target == cls\n        inter = (p & t).sum().float()\n        denom = p.sum().float() + t.sum().float()\n        scores.append((2 * inter + eps) / (denom + eps))\n    return torch.stack(scores).mean().item()",
      testsText: "Проверяется несколько классов, пустой класс и argmax по channel dimension.",
      hint: "Для метрики можно взять `argmax`, для loss обычно нужны soft probabilities.",
      explain: "Multiclass Dice дает более честную картину, чем pixel accuracy при большом фоне.",
      difficulty: 5,
    },
    {
      id: "extra-cv-valid-mean-per-image",
      kind: "fix",
      title: "Mean Dice по images",
      prompt: "Исправь агрегацию Dice: нельзя складывать все пиксели датасета в один общий Dice, если leaderboard считает mean по картинкам.",
      code:
        "inter += (pred & target).sum()\nunion += pred.sum() + target.sum()\nscore = (2 * inter + 1e-6) / (union + 1e-6)",
      answer:
        "scores.append(dice_score(pred, target))\nscore = np.mean(scores)",
      hint: "Сначала score каждого image, потом mean.",
      explain: "Разные задачи усредняют метрику по-разному. Это надо повторять в validation максимально близко к leaderboard.",
      difficulty: 4,
    },
  ],
  "cv-detection-count": [
    {
      id: "extra-count-local-maxima",
      kind: "write",
      title: "Local maxima count",
      prompt: "Напиши подсчет локальных максимумов heatmap через threshold и dilation.",
      starter: "def count_peaks(heatmap, threshold=0.5):",
      answer:
        "def count_peaks(heatmap, threshold=0.5):\n    kernel = np.ones((3, 3), dtype=np.uint8)\n    dilated = cv2.dilate(heatmap, kernel)\n    peaks = (heatmap == dilated) & (heatmap >= threshold)\n    return int(peaks.sum())",
      testsText: "Проверяется одиночный peak, два peak и threshold.",
      hint: "Локальный максимум равен dilated value в своей окрестности.",
      explain: "Для counting heatmaps часто достаточно найти пики, если модель выдает центр объектов.",
      difficulty: 4,
    },
    {
      id: "extra-bbox-nms-write",
      kind: "write",
      title: "NMS руками",
      prompt: "Напиши скелет NMS: сортировка по score, берем лучший bbox, удаляем bbox с IoU выше threshold.",
      starter: "def nms(boxes, scores, iou_thr=0.5):",
      answer:
        "def nms(boxes, scores, iou_thr=0.5):\n    order = np.argsort(scores)[::-1]\n    keep = []\n    while len(order) > 0:\n        i = order[0]\n        keep.append(i)\n        rest = order[1:]\n        rest = np.array([j for j in rest if bbox_iou(boxes[i], boxes[j]) <= iou_thr])\n        order = rest\n    return keep",
      testsText: "Проверяется подавление пересекающихся bbox и сохранение далеких bbox.",
      hint: "Каждый шаг фиксирует самый уверенный bbox.",
      explain: "NMS часто дает быстрый прирост в detection/counting задачах с дубликатами.",
      difficulty: 5,
    },
    {
      id: "extra-count-mae-from-density",
      kind: "fix",
      title: "MAE по count, не по pixels",
      prompt: "Исправь validation для density counting: leaderboard оценивает ошибку количества объектов, не попиксельную MSE.",
      code:
        "pred = model(x)\nloss = F.mse_loss(pred, density)\nmetric += loss.item()",
      answer:
        "pred = model(x)\npred_count = pred.sum(dim=(1, 2, 3))\ntrue_count = density.sum(dim=(1, 2, 3))\nmetric += torch.abs(pred_count - true_count).sum().item()",
      hint: "Сумма density map - это count.",
      explain: "Оптимизировать loss можно по density, но validation metric должна повторять leaderboard.",
      difficulty: 4,
    },
  ],
  "torch-loops": [
    {
      id: "extra-torch-amp-step",
      kind: "order",
      title: "AMP train step",
      prompt: "Собери mixed precision training step с GradScaler.",
      blocks: [
        "optimizer.zero_grad()",
        "with torch.cuda.amp.autocast():",
        "    logits = model(x)",
        "    loss = criterion(logits, y)",
        "scaler.scale(loss).backward()",
        "scaler.step(optimizer)",
        "scaler.update()",
      ],
      answer: [
        "optimizer.zero_grad()",
        "with torch.cuda.amp.autocast():",
        "    logits = model(x)",
        "    loss = criterion(logits, y)",
        "scaler.scale(loss).backward()",
        "scaler.step(optimizer)",
        "scaler.update()",
      ],
      hint: "Backward и step идут через scaler.",
      explain: "AMP ускоряет обучение на GPU и экономит память, но порядок действий важен.",
      difficulty: 4,
    },
    {
      id: "extra-torch-grad-accum-fix",
      kind: "fix",
      title: "Gradient accumulation",
      prompt: "Исправь gradient accumulation на 4 шага: loss надо делить, optimizer.step делать раз в 4 minibatch.",
      code:
        "for i, (x, y) in enumerate(loader):\n    loss = criterion(model(x), y)\n    loss.backward()\n    optimizer.step()\n    optimizer.zero_grad()",
      answer:
        "optimizer.zero_grad()\nfor i, (x, y) in enumerate(loader):\n    loss = criterion(model(x), y) / 4\n    loss.backward()\n    if (i + 1) % 4 == 0:\n        optimizer.step()\n        optimizer.zero_grad()",
      hint: "Accumulation имитирует больший batch.",
      explain: "Если не делить loss, effective gradient станет в 4 раза больше.",
      difficulty: 4,
    },
    {
      id: "extra-torch-seed-all",
      kind: "write",
      title: "seed_everything",
      prompt: "Напиши `seed_everything(seed)`, чтобы зафиксировать random, numpy и torch.",
      starter: "def seed_everything(seed=42):",
      answer:
        "def seed_everything(seed=42):\n    random.seed(seed)\n    np.random.seed(seed)\n    torch.manual_seed(seed)\n    torch.cuda.manual_seed_all(seed)\n    torch.backends.cudnn.deterministic = True\n    torch.backends.cudnn.benchmark = False",
      testsText: "Проверяется наличие random, numpy, torch и cudnn flags.",
      hint: "Один seed в одном месте лучше, чем scattered magic numbers.",
      explain: "Полной детерминированности на GPU не всегда будет, но это снижает шум экспериментов.",
      difficulty: 3,
    },
    {
      id: "extra-torch-freeze-backbone",
      kind: "fix",
      title: "Freeze backbone",
      prompt: "Исправь заморозку backbone: сейчас параметры не замораживаются.",
      code:
        "for p in model.backbone.parameters():\n    p.requires_grad == False\noptimizer = torch.optim.Adam(model.parameters(), lr=1e-3)",
      answer:
        "for p in model.backbone.parameters():\n    p.requires_grad = False\noptimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)",
      hint: "`==` сравнивает, `=` присваивает.",
      explain: "Даже когда pretrained нельзя, freeze/unfreeze полезен для своих staged experiments.",
      difficulty: 3,
    },
    {
      id: "extra-torch-save-best",
      kind: "write",
      title: "Save best model",
      prompt: "Напиши логику сохранения лучшей модели по validation score.",
      starter: "best_score = -1\n# inside epoch loop",
      answer:
        "best_score = -1\n# inside epoch loop\nif val_score > best_score:\n    best_score = val_score\n    torch.save(model.state_dict(), 'best.pt')",
      testsText: "Проверяется обновление best_score только при улучшении.",
      hint: "Сохраняй checkpoint по validation, а не по train loss.",
      explain: "На 6-часовом контесте best checkpoint защищает от последнего переобученного эпохами запуска.",
      difficulty: 2,
    },
  ],
  "dataset-loader": [
    {
      id: "extra-detection-collate",
      kind: "write",
      title: "Detection collate_fn",
      prompt: "Напиши `collate_fn` для detection dataset, где каждое изображение имеет разное число bbox.",
      starter: "def collate_fn(batch):",
      answer:
        "def collate_fn(batch):\n    images, targets = zip(*batch)\n    images = torch.stack(images)\n    return images, list(targets)",
      testsText: "Проверяется, что targets не пытаются stack при разном числе bbox.",
      hint: "Images одинакового размера можно stack, targets лучше оставить списком.",
      explain: "Стандартный DataLoader collate ломается, когда bbox count разный.",
      difficulty: 4,
    },
    {
      id: "extra-worker-init-seed",
      kind: "write",
      title: "worker_init_fn seed",
      prompt: "Напиши `seed_worker(worker_id)`, чтобы numpy/random в DataLoader workers были стабильнее.",
      starter: "def seed_worker(worker_id):",
      answer:
        "def seed_worker(worker_id):\n    worker_seed = torch.initial_seed() % 2**32\n    np.random.seed(worker_seed)\n    random.seed(worker_seed)",
      testsText: "Проверяется использование torch.initial_seed и seed для numpy/random.",
      hint: "Каждый worker получает свой seed от PyTorch.",
      explain: "Это полезно для воспроизводимых аугментаций в DataLoader.",
      difficulty: 3,
    },
  ],
  validation: [
    {
      id: "extra-stratified-kfold-oof",
      kind: "write",
      title: "Stratified OOF loop",
      prompt: "Напиши 5-fold OOF loop для binary classification со StratifiedKFold и ROC-AUC по фолдам.",
      starter: "oof = np.zeros(len(X))\nscores = []\n# loop",
      answer:
        "from sklearn.model_selection import StratifiedKFold\nfrom sklearn.metrics import roc_auc_score\n\noof = np.zeros(len(X))\nscores = []\nskf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)\nfor tr_idx, val_idx in skf.split(X, y):\n    model = make_model()\n    model.fit(X.iloc[tr_idx], y.iloc[tr_idx])\n    oof[val_idx] = model.predict_proba(X.iloc[val_idx])[:, 1]\n    scores.append(roc_auc_score(y.iloc[val_idx], oof[val_idx]))\nprint(np.mean(scores), roc_auc_score(y, oof))",
      testsText: "Проверяется stratified split, fresh model и заполнение oof только на val_idx.",
      hint: "OOF должен покрыть каждую train-строку ровно один раз.",
      explain: "OOF loop - основной каркас честной валидации и stacking.",
      difficulty: 4,
    },
    {
      id: "extra-per-fold-preprocess",
      kind: "fix",
      title: "Preprocess внутри fold",
      prompt: "Исправь leakage: imputer и scaler обучаются до KFold на всем train.",
      code:
        "X_imp = imputer.fit_transform(X)\nX_scaled = scaler.fit_transform(X_imp)\nfor tr_idx, val_idx in cv.split(X_scaled, y):\n    model.fit(X_scaled[tr_idx], y.iloc[tr_idx])\n    pred = model.predict_proba(X_scaled[val_idx])[:, 1]",
      answer:
        "for tr_idx, val_idx in cv.split(X, y):\n    X_tr = imputer.fit_transform(X.iloc[tr_idx])\n    X_val = imputer.transform(X.iloc[val_idx])\n    X_tr = scaler.fit_transform(X_tr)\n    X_val = scaler.transform(X_val)\n    model.fit(X_tr, y.iloc[tr_idx])\n    pred = model.predict_proba(X_val)[:, 1]",
      hint: "Любой fit делается только на train fold.",
      explain: "В KFold preprocessing тоже должен быть fold-aware, иначе validation видит статистики val fold.",
      difficulty: 5,
    },
    {
      id: "extra-submit-budget",
      kind: "choice",
      title: "20 сабмитов",
      prompt: "Ты получил +0.02 на validation после threshold sweep. Что сделать первым?",
      options: ["Сделать submit и зафиксировать улучшение", "Сразу переписать архитектуру", "Удалить validation", "Подобрать threshold на test"],
      answer: "Сделать submit и зафиксировать улучшение",
      hint: "У тренера был прямой совет: получил лучше baseline - отправь.",
      explain: "Сабмиты ограничены, но ранний хороший submit снижает риск остаться с поломанным финальным решением.",
      difficulty: 1,
    },
  ],
  "numpy-pandas-boosting": [
    {
      id: "extra-rare-category-collapse",
      kind: "write",
      title: "Rare category collapse",
      prompt: "Замени редкие категории в `city`, которые встречаются в train меньше 10 раз, на `'__rare__'` в train и test.",
      starter: "col = 'city'\n# modify train and test",
      answer:
        "col = 'city'\ncounts = train[col].value_counts()\nrare = counts[counts < 10].index\ntrain[col] = train[col].where(~train[col].isin(rare), '__rare__')\ntest[col] = test[col].where(~test[col].isin(rare), '__rare__')",
      testsText: "Проверяется, что rare список построен только по train.",
      hint: "Редкость считаем на train, потом применяем тот же список к test.",
      explain: "Схлопывание редких категорий снижает шум в one-hot/target encoding.",
      difficulty: 3,
    },
    {
      id: "extra-train-quantile-clip",
      kind: "write",
      title: "Train quantile clipping",
      prompt: "Обрежь `amount` по 1% и 99% quantile, посчитанным только на train. Примени к train и test.",
      starter: "col = 'amount'\n# clip train and test",
      answer:
        "col = 'amount'\nlo, hi = train[col].quantile([0.01, 0.99])\ntrain[col] = train[col].clip(lo, hi)\ntest[col] = test[col].clip(lo, hi)",
      testsText: "Проверяется, что quantiles не считаются на test.",
      hint: "Даже unsupervised статистики лучше брать из train.",
      explain: "Clipping выбросов часто стабилизирует линейные модели и neural nets.",
      difficulty: 3,
    },
    {
      id: "extra-lgbm-class-weight",
      kind: "fix",
      title: "Imbalanced LightGBM",
      prompt: "Исправь baseline для сильного дисбаланса классов: добавь вес positive класса.",
      code:
        "model = LGBMClassifier(n_estimators=1000, random_state=42)\nmodel.fit(X_train, y_train)",
      answer:
        "pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)\nmodel = LGBMClassifier(n_estimators=1000, scale_pos_weight=pos_weight, random_state=42)\nmodel.fit(X_train, y_train)",
      hint: "`scale_pos_weight` примерно equal negative / positive.",
      explain: "При сильном дисбалансе модель может слишком любить majority class.",
      difficulty: 3,
    },
    {
      id: "extra-pandas-safe-merge",
      kind: "fix",
      title: "Merge без дубликатов",
      prompt: "Исправь feature merge: справочник `merchant_stats` может иметь несколько строк на merchant_id.",
      code:
        "train = train.merge(merchant_stats, on='merchant_id', how='left')\ntest = test.merge(merchant_stats, on='merchant_id', how='left')",
      answer:
        "merchant_stats = merchant_stats.drop_duplicates('merchant_id')\ntrain = train.merge(merchant_stats, on='merchant_id', how='left', validate='m:1')\ntest = test.merge(merchant_stats, on='merchant_id', how='left', validate='m:1')",
      hint: "`validate='m:1'` заставит pandas упасть, если merge размножает строки.",
      explain: "Незаметное размножение строк после merge может испортить и train, и submission.",
      difficulty: 4,
    },
  ],
  "metrics-losses": [
    {
      id: "extra-balanced-accuracy",
      kind: "write",
      title: "Balanced accuracy",
      prompt: "Напиши balanced accuracy для binary classification через recall по каждому классу.",
      starter: "def balanced_accuracy(y_true, y_pred):",
      answer:
        "def balanced_accuracy(y_true, y_pred):\n    y_true = np.asarray(y_true)\n    y_pred = np.asarray(y_pred)\n    recall0 = ((y_true == 0) & (y_pred == 0)).sum() / max((y_true == 0).sum(), 1)\n    recall1 = ((y_true == 1) & (y_pred == 1)).sum() / max((y_true == 1).sum(), 1)\n    return 0.5 * (recall0 + recall1)",
      testsText: "Проверяется дисбаланс классов и отсутствие деления на ноль.",
      hint: "Balanced accuracy - средний recall по классам.",
      explain: "Она полезнее accuracy, когда один класс встречается намного чаще.",
      difficulty: 3,
    },
    {
      id: "extra-macro-f1-choice",
      kind: "choice",
      title: "Macro F1",
      prompt: "Что делает macro F1 в multiclass classification?",
      options: ["Считает F1 каждого класса и усредняет поровну", "Считает accuracy", "Усредняет loss по batch", "Игнорирует редкие классы"],
      answer: "Считает F1 каждого класса и усредняет поровну",
      hint: "Macro значит, что классы равноправны.",
      explain: "Macro F1 заставляет обращать внимание на редкие классы, потому что каждый класс дает одинаковый вес.",
      difficulty: 2,
    },
    {
      id: "extra-logloss-clipping",
      kind: "fix",
      title: "Logloss clipping",
      prompt: "Исправь binary logloss: сейчас `log(0)` может дать inf.",
      code:
        "def logloss(y, p):\n    return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))",
      answer:
        "def logloss(y, p, eps=1e-15):\n    p = np.clip(p, eps, 1 - eps)\n    return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))",
      hint: "Вероятности надо обрезать в `(eps, 1-eps)`.",
      explain: "Один нулевой probability на правильном классе может сделать logloss бесконечным.",
      difficulty: 3,
    },
  ],
  architectures: [
    {
      id: "extra-attention-mask-fix",
      kind: "fix",
      title: "Attention mask до softmax",
      prompt: "Исправь attention: padding mask надо применять к scores до softmax.",
      code:
        "scores = Q @ K.transpose(-2, -1) / math.sqrt(d)\nweights = scores.softmax(dim=-1)\nweights = weights.masked_fill(mask == 0, 0)\nout = weights @ V",
      answer:
        "scores = Q @ K.transpose(-2, -1) / math.sqrt(d)\nscores = scores.masked_fill(mask == 0, -1e9)\nweights = scores.softmax(dim=-1)\nout = weights @ V",
      hint: "Softmax должен не дать probability запрещенным позициям.",
      explain: "Если занулить weights после softmax, сумма вероятностей уже не нормирована.",
      difficulty: 4,
    },
    {
      id: "extra-recsys-bpr-loss",
      kind: "write",
      title: "BPR loss",
      prompt: "Напиши BPR loss для recsys: positive scores должны быть выше negative scores.",
      starter: "def bpr_loss(pos_score, neg_score):",
      answer:
        "def bpr_loss(pos_score, neg_score):\n    return -torch.log(torch.sigmoid(pos_score - neg_score) + 1e-8).mean()",
      testsText: "Проверяется, что loss меньше, когда pos_score намного больше neg_score.",
      hint: "Оптимизируем разницу pos - neg.",
      explain: "BPR - простой pairwise loss для implicit feedback recommender systems.",
      difficulty: 4,
    },
    {
      id: "extra-negative-sampling",
      kind: "write",
      title: "Negative sampling",
      prompt: "Напиши `sample_negative(pos_items, num_items)`: выбрать item id, которого нет в set pos_items.",
      starter: "def sample_negative(pos_items, num_items):",
      answer:
        "def sample_negative(pos_items, num_items):\n    pos_items = set(pos_items)\n    item = random.randrange(num_items)\n    while item in pos_items:\n        item = random.randrange(num_items)\n    return item",
      testsText: "Проверяется, что возвращенный item не positive.",
      hint: "Для простого baseline достаточно rejection sampling.",
      explain: "Implicit recsys почти всегда требует negative samples, потому что явных negative нет.",
      difficulty: 3,
    },
    {
      id: "extra-rl-epsilon-greedy",
      kind: "write",
      title: "Epsilon-greedy action",
      prompt: "Напиши выбор action: с вероятностью epsilon random, иначе argmax Q.",
      starter: "def choose_action(q_values, epsilon):",
      answer:
        "def choose_action(q_values, epsilon):\n    if random.random() < epsilon:\n        return random.randrange(len(q_values))\n    return int(np.argmax(q_values))",
      testsText: "Проверяется epsilon=0 и корректный диапазон random action.",
      hint: "Exploration против exploitation.",
      explain: "Это базовый механизм исследования в Q-learning.",
      difficulty: 3,
    },
    {
      id: "extra-diffusion-linear-beta",
      kind: "write",
      title: "Linear beta schedule",
      prompt: "Напиши `linear_beta_schedule(timesteps, beta_start, beta_end)` через torch.linspace.",
      starter: "def linear_beta_schedule(timesteps, beta_start=1e-4, beta_end=0.02):",
      answer:
        "def linear_beta_schedule(timesteps, beta_start=1e-4, beta_end=0.02):\n    return torch.linspace(beta_start, beta_end, timesteps)",
      testsText: "Проверяется длина schedule и первый/последний beta.",
      hint: "В простом DDPM beta растет линейно.",
      explain: "Schedule задает, сколько шума добавляется на каждом diffusion step.",
      difficulty: 2,
    },
    {
      id: "extra-diffusion-q-sample",
      kind: "order",
      title: "q_sample",
      prompt: "Собери forward diffusion: получить noisy x_t из x0, noise и alpha_bar_t.",
      blocks: [
        "noise = torch.randn_like(x0)",
        "sqrt_ab = alpha_bar_t.sqrt().view(-1, 1, 1, 1)",
        "sqrt_omab = (1 - alpha_bar_t).sqrt().view(-1, 1, 1, 1)",
        "xt = sqrt_ab * x0 + sqrt_omab * noise",
      ],
      answer: [
        "noise = torch.randn_like(x0)",
        "sqrt_ab = alpha_bar_t.sqrt().view(-1, 1, 1, 1)",
        "sqrt_omab = (1 - alpha_bar_t).sqrt().view(-1, 1, 1, 1)",
        "xt = sqrt_ab * x0 + sqrt_omab * noise",
      ],
      hint: "alpha_bar_t надо broadcast по C,H,W.",
      explain: "Это основная формула добавления шума в DDPM.",
      difficulty: 4,
    },
  ],
};

for (const [topicId, lessons] of Object.entries(extraLessonPacks)) {
  topics.find((topic) => topic.id === topicId).lessons.push(...lessons);
}

const practiceSets = [
  { title: "Cuties Mini", copy: "image+mask Dataset, nearest resize, IoU, threshold sweep." },
  { title: "Radar Shapes", copy: "Проверить входные каналы, logits и target для segmentation." },
  { title: "Chicken Count", copy: "Density map, count как сумма, MAE по числу объектов." },
  { title: "OOF Table Sprint", copy: "Stratified split, target encoding без leakage, CatBoost submit." },
];

const libraryCards = [
  { title: "Segmentation CE", text: "`logits: [B,C,H,W]`, `target: [B,H,W]`, target dtype long." },
  { title: "Binary BCE", text: "`logits: [B,1,H,W]`, mask float `[B,1,H,W]`, sigmoid только для метрик." },
  { title: "OOF encoding", text: "Train encoding из folds, test encoding из full train mapping." },
  { title: "Contest loop", text: "Baseline → validation → submit → ablation → blend/postprocess." },
  { title: "CV transforms", text: "Одинаковые spatial augmentations для image и mask." },
  { title: "Torch reflex", text: "`zero_grad → forward → loss → backward → step`; val через `eval + no_grad`." },
];

const lessonLabels = {
  order: "Собери код",
  fill: "Впиши код",
  choice: "Выбери ответ",
  bug: "Найди баг",
  fix: "Исправь код",
  write: "Напиши код",
};

const glossary = [
  {
    key: "dice",
    title: "Dice",
    aliases: ["dice"],
    body: "Метрика похожести двух масок. Она смотрит, насколько сильно пересекаются predicted mask и true mask.",
    formula: "Dice = 2 * intersection / (pred_area + true_area)",
    contest: "Часто полезнее accuracy в segmentation, потому что фон огромный, а объект маленький.",
  },
  {
    key: "iou",
    title: "IoU",
    aliases: ["iou", "intersection over union"],
    body: "Метрика overlap: какую долю объединения двух масок занимает их пересечение.",
    formula: "IoU = intersection / union",
    contest: "В CV threshold и postprocess обычно подбирают именно по IoU/Dice на validation.",
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
    contest: "0.5 не святой. Для F1/Dice/IoU порог часто подбирают на validation.",
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
    contest: "`np.where(mask)` возвращает сначала y, потом x. Это частая ловушка.",
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
let currentTopicId = state.currentTopicId || topics[0].id;
let currentLessonIndex = state.currentLessonIndex || 0;
let currentScreen = state.currentScreen || "roadmap";
const requestedScreen = new URLSearchParams(window.location.search).get("screen");
if (["roadmap", "lesson", "profile", "library"].includes(requestedScreen)) currentScreen = requestedScreen;
let selectedBlocks = [];
let selectedOption = null;
let selectedBugLine = null;
let activeBlockOrder = [];
let typedCode = "";
let els = {};
let currentUser = null;
let syncTimer = null;
let isApplyingRemote = false;

if (!topics.some((topic) => topic.id === currentTopicId)) {
  currentTopicId = topics[0].id;
  currentLessonIndex = 0;
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  applyLayoutMode();
  renderAll();
  bootstrapAccount();
  registerServiceWorker();
});

function cacheElements() {
  [
    "moduleList",
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
    "lessonTerms",
    "challengeHost",
    "hintButton",
    "resetButton",
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
    "libraryGrid",
    "profileXp",
    "profileStreak",
    "profileDone",
    "profileMisses",
    "focusModeButton",
    "dailyButton",
    "layoutModeButton",
    "queueList",
    "accountButton",
    "authModal",
    "authCloseButton",
    "authUsername",
    "authPassword",
    "loginButton",
    "registerButton",
    "logoutButton",
    "authStatus",
    "leaderboardList",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => setScreen(button.dataset.screen));
  });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
      renderTopics(button.dataset.filter);
    });
  });

  els.challengeHost.addEventListener("click", handleChallengeClick);
  els.hintButton.addEventListener("click", showHint);
  els.resetButton.addEventListener("click", renderLesson);
  els.checkButton.addEventListener("click", checkAnswer);
  els.nextButton.addEventListener("click", nextLesson);
  els.dailyButton.addEventListener("click", startDaily);
  els.focusModeButton.addEventListener("click", () => {
    document.body.classList.toggle("focus-mode");
    els.focusModeButton.textContent = document.body.classList.contains("focus-mode") ? "Весь UI" : "Режим фокуса";
  });
  els.layoutModeButton?.addEventListener("click", cycleLayoutMode);
  els.queueList?.addEventListener("click", handleQueueClick);
  els.accountButton?.addEventListener("click", openAuthModal);
  els.authCloseButton?.addEventListener("click", closeAuthModal);
  els.authModal?.addEventListener("click", (event) => {
    if (event.target === els.authModal) closeAuthModal();
  });
  els.loginButton?.addEventListener("click", () => submitAuth("login"));
  els.registerButton?.addEventListener("click", () => submitAuth("register"));
  els.logoutButton?.addEventListener("click", logout);
}

function renderAll() {
  ensureCurrentLessonAvailable();
  renderTopics(document.querySelector(".filter-chip.is-active")?.dataset.filter || "all");
  renderRoadmap();
  renderLesson();
  renderSidebar();
  renderPracticeSets();
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
  document.querySelectorAll(".app-screen").forEach((section) => {
    section.classList.toggle("is-active", section.id === `screen-${screen}`);
  });
  document.querySelectorAll(".nav-button, .mobile-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === screen);
  });
  if (persist) {
    state.currentScreen = screen;
    saveState();
  }
}

function renderTopics(filter = "all") {
  const visible = filter === "all" ? topics : topics.filter((topic) => topic.tag === filter);
  els.moduleList.innerHTML = "";
  visible.forEach((topic) => {
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
    els.moduleList.appendChild(button);
  });
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
    const node = document.createElement("button");
    node.className = `road-node${isDone ? " is-done" : ""}${isCurrent ? " is-current" : ""}${isLocked ? " is-locked" : ""}`;
    node.type = "button";
    node.disabled = isLocked;
    node.style.setProperty("--node-color", topic.color);
    node.innerHTML = `
      <span class="road-node-icon">${isLocked ? "L" : isDone ? "✓" : index + 1}</span>
      <span>
        <strong>${lesson.title}</strong>
        <small>${lessonLabels[lesson.kind]} · сложность ${lesson.difficulty || 1}/5${isLocked ? " · откроется позже" : ""}</small>
      </span>
    `;
    node.addEventListener("click", () => {
      if (isLocked) return;
      currentLessonIndex = index;
      state.currentLessonIndex = index;
      saveState();
      renderAll();
      setScreen("lesson");
    });
    els.roadmapPath.appendChild(node);
  });
}

function renderLesson() {
  selectedBlocks = [];
  selectedOption = null;
  selectedBugLine = null;
  typedCode = "";

  const topic = getCurrentTopic();
  const lesson = getCurrentLesson();
  activeBlockOrder = lesson.kind === "order" ? shuffle(lesson.blocks) : [];
  els.lessonTrack.textContent = topic.title;
  els.lessonTitle.textContent = lesson.title;
  els.lessonType.textContent = lessonLabels[lesson.kind];
  els.lessonPrompt.textContent = lesson.prompt;
  renderLessonTerms(lesson);
  els.feedbackBox.hidden = true;
  els.feedbackBox.className = "feedback";

  if (lesson.kind === "order") renderOrder(lesson);
  if (lesson.kind === "choice") renderChoice(lesson);
  if (lesson.kind === "fill") renderFill(lesson);
  if (lesson.kind === "bug") renderBug(lesson);
  if (lesson.kind === "fix") renderCodeWrite(lesson, "Исправь код здесь");
  if (lesson.kind === "write") renderCodeWrite(lesson, "Напиши решение здесь");
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
  els.challengeHost.innerHTML = `
    <div class="options-grid">
      ${lesson.options
        .map(
          (option) =>
            `<button class="option-card${selectedOption === option ? " is-selected" : ""}" data-action="select-option" data-value="${encodeURIComponent(option)}" type="button">${escapeHtml(option)}</button>`,
        )
        .join("")}
    </div>
  `;
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
      ${lesson.testsText ? `<p class="tests-text">${escapeHtml(lesson.testsText)}</p>` : ""}
    </div>
  `;
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
  if (lesson.hint) pieces.push(`Намек по задаче: ${lesson.hint}`);
  if (terms.length) {
    pieces.push(
      `Мини-словарь:\n${terms
        .slice(0, 4)
        .map((term) => {
          const lines = [`${term.title}: ${term.body}`];
          if (term.formula) lines.push(`Формула/shape: ${term.formula}`);
          if (term.contest) lines.push(`Зачем на контесте: ${term.contest}`);
          return lines.join("\n");
        })
        .join("\n\n")}`,
    );
  }
  pieces.push("Как думать: сначала проверь shape, потом dtype, потом где нужна вероятность, а где logits/классы.");
  return pieces.join("\n\n");
}

function buildMistakeText(lesson) {
  const terms = getLessonTerms(lesson);
  const termNames = terms
    .slice(0, 3)
    .map((term) => term.title)
    .join(", ");
  const base = "Остановись на секунду: проверь порядок строк, shape и dtype. Если есть loss/metric, отдельно подумай, что она принимает: logits, probability или class ids.";
  return termNames ? `${base}\n\nТермины этого урока: ${termNames}. Нажми «Подсказка», там теперь есть мини-разбор.` : base;
}

function getLessonTerms(lesson) {
  const explicit = new Set(lesson.terms || []);
  const text = [
    lesson.title,
    lesson.prompt,
    lesson.code,
    lesson.starter,
    lesson.hint,
    lesson.explain,
    ...(lesson.blocks || []),
    ...(lesson.options || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return glossary.filter((term) => explicit.has(term.key) || term.aliases.some((alias) => text.includes(alias.toLowerCase())));
}

function checkAnswer() {
  const lesson = getCurrentLesson();
  let ok = false;
  if (lesson.kind === "order") ok = arraysEqual(selectedBlocks, lesson.answer);
  if (lesson.kind === "choice") ok = selectedOption === lesson.answer;
  if (lesson.kind === "fill") {
    ok = lesson.blanks.every((answer, index) => {
      const input = document.querySelector(`[data-blank-index="${index}"]`);
      return normalizeCode(input?.value || "") === normalizeCode(answer);
    });
  }
  if (lesson.kind === "bug") ok = selectedBugLine === lesson.answer;
  if (lesson.kind === "fix" || lesson.kind === "write") {
    const input = document.getElementById("codeAnswer");
    typedCode = input?.value || "";
    ok = normalizeCode(typedCode) === normalizeCode(lesson.answer);
  }

  if (ok) {
    const firstPass = !state.completed[lesson.id];
    state.completed[lesson.id] = true;
    state.completedDates[lesson.id] = todayKey();
    if (firstPass) state.xp += 12;
    updateStreak();
    saveState();
    showFeedback("Верно", lesson.explain, true);
    sendEvent(lesson.id, true, firstPass ? 12 : 0);
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
    <div class="quest-row"><span>Не вайбкодить 10 минут</span><strong>ручной режим</strong></div>
  `;
  renderWeakList();
  renderQueueList();
}

function renderPracticeSets() {
  els.bossGrid.innerHTML = practiceSets
    .map((set) => `<div class="boss-card"><strong>${set.title}</strong><small>${set.copy}</small></div>`)
    .join("");
}

function renderLibrary() {
  els.libraryGrid.innerHTML = libraryCards
    .map((card) => `<div class="library-card"><strong>${card.title}</strong><p>${card.text}</p></div>`)
    .join("");
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
  els.feedbackBox.className = `feedback ${good ? "is-good" : "is-bad"}`;
  els.feedbackBox.innerHTML = `<strong>${escapeHtml(label)}.</strong>${formatFeedbackText(text)}`;
}

function openAuthModal() {
  els.authModal.hidden = false;
  renderAuthUi();
  els.authUsername?.focus();
}

function closeAuthModal() {
  els.authModal.hidden = true;
}

function showAuthStatus(text, good = false) {
  els.authStatus.hidden = false;
  els.authStatus.className = `feedback auth-feedback ${good ? "is-good" : "is-bad"}`;
  els.authStatus.textContent = text;
}

async function submitAuth(mode) {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;
  try {
    const data = await apiRequest(`/api/${mode}`, {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    currentUser = data.user;
    mergeRemoteProgress(data.progress);
    renderLeaderboard(data.leaderboard);
    saveState();
    renderAll();
    showAuthStatus(mode === "login" ? "Вошёл. Прогресс синхронизирован." : "Аккаунт создан. Прогресс теперь в базе.", true);
  } catch (error) {
    showAuthStatus(error.message);
  }
}

async function logout() {
  try {
    await apiRequest("/api/logout", { method: "POST" });
  } catch {
    // Token may already be dead; local logout is still useful.
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  currentUser = null;
  renderAuthUi();
  renderLeaderboard([]);
  showAuthStatus("Вышел из аккаунта. Локальный прогресс остался на устройстве.", true);
}

async function bootstrapAccount() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  renderAuthUi();
  if (!token) {
    fetchLeaderboard();
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

function mergeRemoteProgress(progress) {
  if (!progress?.state) return;
  const remote = progress.state;
  isApplyingRemote = true;
  state.completed = { ...(state.completed || {}), ...(remote.completed || {}) };
  state.completedDates = { ...(state.completedDates || {}), ...(remote.completedDates || {}) };
  state.misses = { ...(remote.misses || {}), ...(state.misses || {}) };
  state.xp = Math.max(Number(state.xp || 0), Number(progress.xp || remote.xp || 0));
  state.streak = Math.max(Number(state.streak || 0), Number(progress.streak || remote.streak || 0));
  state.layoutMode = state.layoutMode || remote.layoutMode || "course";
  isApplyingRemote = false;
}

function renderAuthUi() {
  if (!els.accountButton) return;
  els.accountButton.textContent = currentUser ? `@${currentUser.username}` : "Войти";
  if (els.logoutButton) els.logoutButton.hidden = !currentUser;
  if (els.loginButton) els.loginButton.hidden = Boolean(currentUser);
  if (els.registerButton) els.registerButton.hidden = Boolean(currentUser);
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
    // Keep offline/local progress. Next successful action will sync again.
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
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || "API недоступен");
  return data;
}

function cycleLayoutMode() {
  const current = state.layoutMode || LAYOUT_MODES[0];
  const next = LAYOUT_MODES[(LAYOUT_MODES.indexOf(current) + 1) % LAYOUT_MODES.length];
  state.layoutMode = next;
  applyLayoutMode();
  if (next === "practice") setScreen("lesson");
  saveState();
}

function applyLayoutMode() {
  const mode = state.layoutMode || LAYOUT_MODES[0];
  document.body.dataset.layout = mode;
  if (els.layoutModeButton) els.layoutModeButton.textContent = `Макет: ${LAYOUT_LABELS[mode]}`;
}

function getCurrentTopic() {
  return topics.find((topic) => topic.id === currentTopicId) || topics[0];
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
      layoutMode: "course",
      ...parsed,
    };
  } catch {
    return { xp: 0, streak: 0, completed: {}, completedDates: {}, misses: {}, layoutMode: "course" };
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

function normalizeCode(value) {
  return value.replace(/\s+/g, "").trim();
}

function formatFeedbackText(text) {
  return String(text)
    .split("\n\n")
    .map((chunk) => `<p>${escapeHtml(chunk).replaceAll("\n", "<br>")}</p>`)
    .join("");
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
