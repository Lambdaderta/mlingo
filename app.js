const STORAGE_KEY = "mlingo.antivibe.progress.v6";
const AUTH_TOKEN_KEY = "mlingo.auth.token";
const API_BASE = window.MLINGO_API_BASE || "";

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
        answers: [
          ["model = model.to(device)", "x = x.to(device)", "y = y.to(device)", "logits = model(x)"],
          ["model = model.to(device)", "y = y.to(device)", "x = x.to(device)", "logits = model(x)"],
        ],
        hint: "Модель и тензоры должны жить на одном device.",
        explain: "Ошибка CPU/GPU device mismatch на контесте съедает время без пользы. `x` и `y` можно переносить в любом порядке, главное - до forward.",
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
        kind: "fix",
        title: "Градиенты копятся",
        prompt: "Исправь train loop: добавь одну строку так, чтобы градиенты прошлого батча не копились.",
        code: "for x, y in loader:\n    logits = model(x)\n    loss = criterion(logits, y)\n    loss.backward()\n    optimizer.step()",
        answer: "for x, y in loader:\n    optimizer.zero_grad()\n    logits = model(x)\n    loss = criterion(logits, y)\n    loss.backward()\n    optimizer.step()",
        testsText: "Проверь себя: zero_grad должен быть внутри цикла до forward/backward.",
        hint: "В PyTorch `.grad` накапливается. В этом упражнении надо именно дописать строку в код.",
        explain: "`optimizer.zero_grad()` стоит внутри цикла перед forward: следующий `backward()` считает градиенты текущего батча без накопленных старых.",
        difficulty: 2,
        strictLines: true,
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
      {
        id: "torch-train-step-write",
        kind: "write",
        title: "Train step руками",
        prompt: "Напиши тело одной train-итерации: очистка градиентов, forward, loss, backward, step.",
        starter: "for x, y in loader:\n    ",
        answer: "for x, y in loader:\n    optimizer.zero_grad()\n    logits = model(x)\n    loss = criterion(logits, y)\n    loss.backward()\n    optimizer.step()",
        testsText: "Синтаксис должен быть полноценным Python: отступы, скобки, порядок строк.",
        hint: "Это тот же скелет, но теперь без блоков-подсказок.",
        explain: "Такой train step должен писаться почти автоматически: `zero_grad → forward → loss → backward → step`.",
        difficulty: 3,
        strictLines: true,
      },
      {
        id: "torch-val-loop-fix",
        kind: "fix",
        title: "Validation loop",
        prompt: "Исправь validation loop: модель должна быть в eval-режиме, а граф autograd не должен строиться.",
        code: "model.train()\nfor x, y in valid_loader:\n    logits = model(x)\n    loss = criterion(logits, y)\n    val_loss += loss.item()",
        answer: "model.eval()\nwith torch.no_grad():\n    for x, y in valid_loader:\n        logits = model(x)\n        loss = criterion(logits, y)\n        val_loss += loss.item()",
        testsText: "Нужны `model.eval()` и `with torch.no_grad():`; цикл должен быть внутри context manager.",
        hint: "Валидация не обновляет веса и не копит graph.",
        explain: "`eval()` переключает dropout/batchnorm, `no_grad()` экономит память и защищает от случайного backward.",
        difficulty: 3,
        strictLines: true,
      },
      {
        id: "torch-grad-accum-write",
        kind: "write",
        title: "Accumulation x4",
        prompt: "Напиши gradient accumulation на 4 mini-batch: loss делим на 4, step делаем только каждый четвертый batch.",
        starter: "optimizer.zero_grad()\nfor i, (x, y) in enumerate(loader):\n    ",
        answer: "optimizer.zero_grad()\nfor i, (x, y) in enumerate(loader):\n    loss = criterion(model(x), y) / 4\n    loss.backward()\n    if (i + 1) % 4 == 0:\n        optimizer.step()\n        optimizer.zero_grad()",
        testsText: "Обязательные элементы: `/ 4`, `loss.backward()`, `if (i + 1) % 4 == 0`, `step`, `zero_grad`.",
        hint: "Если не делить loss, градиент станет примерно в 4 раза больше.",
        explain: "Accumulation имитирует больший batch, но требует аккуратного порядка `backward` и редкого `step`.",
        difficulty: 4,
        strictLines: true,
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

const recsysRerankerLessonPack = {
  architectures: [
    {
      id: "recsys-mf-module-write",
      kind: "write",
      title: "MatrixFactorization",
      prompt: "Напиши `forward` для matrix factorization: user/item embeddings, dot product и bias item.",
      starter: "def forward(self, user_id, item_id):",
      answer:
        "def forward(self, user_id, item_id):\n    u = self.user_emb(user_id)\n    i = self.item_emb(item_id)\n    b = self.item_bias(item_id).squeeze(-1)\n    return (u * i).sum(dim=1) + b",
      testsText: "Проверяется shape `[B]`, dot product и item bias.",
      hint: "Embedding вернет `[B, dim]`; score - сумма по dim.",
      explain: "Это минимальный scoring block для candidate generation и implicit feedback baseline.",
      difficulty: 3,
    },
    {
      id: "recsys-pointwise-bce-fix",
      kind: "fix",
      title: "Pointwise BCE logits",
      prompt: "Исправь pointwise recsys loss: модель возвращает score/logits, а label 0/1.",
      code:
        "score = model(user_id, item_id)\nprob = torch.sigmoid(score)\nloss = torch.nn.BCEWithLogitsLoss()(prob, label.float())",
      answer:
        "score = model(user_id, item_id)\nloss = torch.nn.BCEWithLogitsLoss()(score, label.float())",
      hint: "BCEWithLogitsLoss уже содержит sigmoid.",
      explain: "Для ранжирования score можно потом сортировать напрямую, а loss получает сырые logits.",
      difficulty: 3,
    },
    {
      id: "recsys-bpr-batch-write",
      kind: "write",
      title: "BPR batch loss",
      prompt: "Напиши BPR loss для batch: `user`, `pos_item`, `neg_item`, модель возвращает score.",
      starter: "def bpr_batch_loss(model, user, pos_item, neg_item):",
      answer:
        "def bpr_batch_loss(model, user, pos_item, neg_item):\n    pos_score = model(user, pos_item)\n    neg_score = model(user, neg_item)\n    return -torch.log(torch.sigmoid(pos_score - neg_score) + 1e-8).mean()",
      testsText: "Проверяется, что positive выше negative дает меньший loss.",
      hint: "BPR оптимизирует разницу `pos_score - neg_score`.",
      explain: "Pairwise loss часто лучше pointwise BCE, когда важен порядок рекомендаций.",
      difficulty: 4,
    },
    {
      id: "recsys-mask-seen-before-topk",
      kind: "fix",
      title: "Mask seen items",
      prompt: "Исправь рекомендацию: уже просмотренные/купленные items нельзя рекомендовать снова.",
      code:
        "scores = model.score_all_items(user_id)\nfor item in seen_items[user_id]:\n    scores[item] = 0\ntop_items = torch.topk(scores, k=10).indices",
      answer:
        "scores = model.score_all_items(user_id)\nfor item in seen_items[user_id]:\n    scores[item] = -float('inf')\ntop_items = torch.topk(scores, k=10).indices",
      hint: "Нулевой score может всё еще попасть в top-K.",
      explain: "Seen items надо убирать значением ниже любых реальных score, обычно `-inf`.",
      difficulty: 3,
    },
    {
      id: "recsys-topk-recommend-write",
      kind: "write",
      title: "recommend_topk",
      prompt: "Напиши `recommend_topk(scores, seen, k)`: scores numpy по всем items, seen - set item ids.",
      starter: "def recommend_topk(scores, seen, k=10):",
      answer:
        "def recommend_topk(scores, seen, k=10):\n    scores = scores.copy()\n    if seen:\n        scores[list(seen)] = -np.inf\n    return np.argsort(scores)[::-1][:k].tolist()",
      testsText: "Проверяется исключение seen items и ровно k рекомендаций.",
      hint: "Сначала mask, потом sort descending.",
      explain: "Это базовый inference для user-item scoring model.",
      difficulty: 3,
    },
    {
      id: "recsys-two-tower-order",
      kind: "order",
      title: "Two-tower scoring",
      prompt: "Собери forward для two-tower модели: user features и item features проходят разные tower, потом dot product.",
      blocks: [
        "u = self.user_tower(user_features)",
        "i = self.item_tower(item_features)",
        "u = F.normalize(u, dim=1)",
        "i = F.normalize(i, dim=1)",
        "score = (u * i).sum(dim=1)",
        "return score",
      ],
      answer: [
        "u = self.user_tower(user_features)",
        "i = self.item_tower(item_features)",
        "u = F.normalize(u, dim=1)",
        "i = F.normalize(i, dim=1)",
        "score = (u * i).sum(dim=1)",
        "return score",
      ],
      hint: "После normalize dot product становится cosine similarity.",
      explain: "Two-tower удобен для candidate generation: item vectors можно заранее посчитать.",
      difficulty: 4,
    },
    {
      id: "recsys-item-cosine-write",
      kind: "write",
      title: "Item cosine scores",
      prompt: "Напиши `cosine_scores(query_vec, item_matrix)`, где item_matrix NxD, query_vec D.",
      starter: "def cosine_scores(query_vec, item_matrix, eps=1e-8):",
      answer:
        "def cosine_scores(query_vec, item_matrix, eps=1e-8):\n    query = query_vec / (np.linalg.norm(query_vec) + eps)\n    items = item_matrix / (np.linalg.norm(item_matrix, axis=1, keepdims=True) + eps)\n    return items @ query",
      testsText: "Проверяется shape `[N]` и нормализация.",
      hint: "Нормализуй query и все item vectors.",
      explain: "Так можно быстро получить похожие items/user-history centroid recommendations.",
      difficulty: 4,
    },
    {
      id: "recsys-batch-negative-sampling",
      kind: "write",
      title: "Batch negative samples",
      prompt: "Напиши `sample_negatives(user_pos, users, num_items)`: вернуть negative item для каждого user.",
      starter: "def sample_negatives(user_pos, users, num_items):",
      answer:
        "def sample_negatives(user_pos, users, num_items):\n    negatives = []\n    for user in users:\n        seen = user_pos.get(user, set())\n        item = random.randrange(num_items)\n        while item in seen:\n            item = random.randrange(num_items)\n        negatives.append(item)\n    return negatives",
      testsText: "Проверяется, что negative не лежит в positives конкретного user.",
      hint: "У каждого user свой set seen/positive items.",
      explain: "Negative sampling должен учитывать историю пользователя, иначе можно дать positive как negative.",
      difficulty: 4,
    },
    {
      id: "recsys-reranker-mlp-forward",
      kind: "write",
      title: "Reranker MLP forward",
      prompt: "Напиши forward для reranker MLP: user embedding, item embedding и dense features надо склеить.",
      starter: "def forward(self, user_id, item_id, dense_features):",
      answer:
        "def forward(self, user_id, item_id, dense_features):\n    u = self.user_emb(user_id)\n    i = self.item_emb(item_id)\n    x = torch.cat([u, i, dense_features], dim=1)\n    return self.mlp(x).squeeze(-1)",
      testsText: "Проверяется concat по feature dimension и output `[B]`.",
      hint: "Batch dimension сохраняется, склейка по `dim=1`.",
      explain: "Reranker обычно получает candidate pair и богатые признаки, а не все items сразу.",
      difficulty: 4,
    },
    {
      id: "recsys-user-history-mean",
      kind: "write",
      title: "User history embedding",
      prompt: "Напиши средний embedding истории пользователя: `item_emb(history_item_ids).mean(dim=0)`.",
      starter: "def user_history_embedding(item_emb, history_item_ids):",
      answer:
        "def user_history_embedding(item_emb, history_item_ids):\n    vectors = item_emb(history_item_ids)\n    return vectors.mean(dim=0)",
      testsText: "Проверяется output `[dim]`.",
      hint: "Для простого baseline mean pooling уже полезен.",
      explain: "History centroid можно использовать для candidate generation или как feature для reranker.",
      difficulty: 2,
    },
  ],
  "metrics-losses": [
    {
      id: "recsys-recall-at-k",
      kind: "write",
      title: "Recall@K",
      prompt: "Напиши `recall_at_k(recommended, relevant, k)`. relevant - set истинных items.",
      starter: "def recall_at_k(recommended, relevant, k):",
      answer:
        "def recall_at_k(recommended, relevant, k):\n    relevant = set(relevant)\n    if not relevant:\n        return 0.0\n    hits = len(set(recommended[:k]) & relevant)\n    return hits / len(relevant)",
      testsText: "Проверяется пустой relevant, один hit и несколько relevant.",
      hint: "Recall: какую долю relevant items нашли.",
      explain: "Candidate generation часто оценивают именно Recall@K.",
      difficulty: 3,
    },
    {
      id: "recsys-precision-at-k",
      kind: "write",
      title: "Precision@K",
      prompt: "Напиши `precision_at_k(recommended, relevant, k)`.",
      starter: "def precision_at_k(recommended, relevant, k):",
      answer:
        "def precision_at_k(recommended, relevant, k):\n    if k == 0:\n        return 0.0\n    relevant = set(relevant)\n    hits = len(set(recommended[:k]) & relevant)\n    return hits / k",
      testsText: "Проверяется top-k с дубликатами и k=0.",
      hint: "Precision: какая доля рекомендованных оказалась relevant.",
      explain: "Precision@K важен, когда пользователь видит только первые K позиций.",
      difficulty: 2,
    },
    {
      id: "recsys-hit-rate-at-k",
      kind: "write",
      title: "HitRate@K",
      prompt: "Напиши `hit_rate_at_k(recommended, relevant, k)`: 1, если есть хотя бы один hit в top-K.",
      starter: "def hit_rate_at_k(recommended, relevant, k):",
      answer:
        "def hit_rate_at_k(recommended, relevant, k):\n    return float(len(set(recommended[:k]) & set(relevant)) > 0)",
      testsText: "Проверяется hit/no-hit.",
      hint: "HitRate не считает сколько hits, только факт попадания.",
      explain: "В leave-one-out validation HitRate@K почти совпадает с Recall@K.",
      difficulty: 2,
    },
    {
      id: "recsys-mrr-at-k",
      kind: "write",
      title: "MRR@K",
      prompt: "Напиши reciprocal rank: если первый relevant item на позиции rank, score = 1/rank.",
      starter: "def mrr_at_k(recommended, relevant, k):",
      answer:
        "def mrr_at_k(recommended, relevant, k):\n    relevant = set(relevant)\n    for rank, item in enumerate(recommended[:k], start=1):\n        if item in relevant:\n            return 1.0 / rank\n    return 0.0",
      testsText: "Проверяется hit на первой/третьей позиции и no-hit.",
      hint: "Rank начинается с 1.",
      explain: "MRR сильно ценит ранние попадания.",
      difficulty: 3,
    },
    {
      id: "recsys-dcg-at-k",
      kind: "write",
      title: "DCG@K",
      prompt: "Напиши DCG@K для binary relevance: hit на позиции i дает `1 / log2(i + 1)`.",
      starter: "def dcg_at_k(recommended, relevant, k):",
      answer:
        "def dcg_at_k(recommended, relevant, k):\n    relevant = set(relevant)\n    score = 0.0\n    for rank, item in enumerate(recommended[:k], start=1):\n        if item in relevant:\n            score += 1.0 / np.log2(rank + 1)\n    return score",
      testsText: "Проверяется discount по rank.",
      hint: "Первый rank получает discount 1.",
      explain: "DCG/NDCG учитывает порядок: hit выше в списке ценнее.",
      difficulty: 3,
    },
    {
      id: "recsys-ndcg-at-k",
      kind: "write",
      title: "NDCG@K",
      prompt: "Напиши NDCG@K через `dcg_at_k` и идеальный DCG.",
      starter: "def ndcg_at_k(recommended, relevant, k):",
      answer:
        "def ndcg_at_k(recommended, relevant, k):\n    relevant = set(relevant)\n    if not relevant:\n        return 0.0\n    dcg = dcg_at_k(recommended, relevant, k)\n    ideal_hits = min(len(relevant), k)\n    idcg = sum(1.0 / np.log2(rank + 1) for rank in range(1, ideal_hits + 1))\n    return dcg / idcg",
      testsText: "Проверяется perfect ranking и no-hit.",
      hint: "IDCG - DCG идеального ранжирования.",
      explain: "NDCG - одна из самых частых метрик reranking/learning-to-rank.",
      difficulty: 4,
    },
    {
      id: "recsys-apk",
      kind: "write",
      title: "AP@K",
      prompt: "Напиши Average Precision@K для binary relevance.",
      starter: "def apk(recommended, relevant, k):",
      answer:
        "def apk(recommended, relevant, k):\n    relevant = set(relevant)\n    if not relevant:\n        return 0.0\n    hits = 0\n    score = 0.0\n    for i, item in enumerate(recommended[:k], start=1):\n        if item in relevant:\n            hits += 1\n            score += hits / i\n    return score / min(len(relevant), k)",
      testsText: "Проверяется накопление precision на каждой hit-позиции.",
      hint: "Каждый hit добавляет precision@текущая_позиция.",
      explain: "AP@K полезен, когда relevant items несколько и важен порядок.",
      difficulty: 5,
    },
  ],
  validation: [
    {
      id: "recsys-leave-last-out",
      kind: "write",
      title: "Leave-last-out split",
      prompt: "Напиши split: для каждого user последняя по времени строка идет в valid, остальные в train.",
      starter: "def leave_last_out(df, user_col='user_id', time_col='ts'):",
      answer:
        "def leave_last_out(df, user_col='user_id', time_col='ts'):\n    df = df.sort_values([user_col, time_col])\n    last_idx = df.groupby(user_col).tail(1).index\n    valid = df.loc[last_idx]\n    train = df.drop(last_idx)\n    return train, valid",
      testsText: "Проверяется один valid event на user и сортировка по времени.",
      hint: "`groupby(...).tail(1)` после сортировки.",
      explain: "Leave-last-out имитирует рекомендацию следующего действия пользователя.",
      difficulty: 4,
    },
    {
      id: "recsys-history-before-valid-fix",
      kind: "fix",
      title: "History без будущего",
      prompt: "Исправь leakage: история пользователя для valid построена по всем событиям, включая valid event.",
      code:
        "history = interactions.groupby('user_id')['item_id'].apply(set).to_dict()\nvalid['seen_count'] = valid['user_id'].map(lambda u: len(history[u]))",
      answer:
        "train, valid = leave_last_out(interactions, user_col='user_id', time_col='ts')\nhistory = train.groupby('user_id')['item_id'].apply(set).to_dict()\nvalid['seen_count'] = valid['user_id'].map(lambda u: len(history.get(u, set())))",
      hint: "Features для valid строятся только из train history.",
      explain: "Если valid item попадает в историю, модель получает подсказку из будущего.",
      difficulty: 5,
    },
    {
      id: "recsys-candidate-recall-order",
      kind: "order",
      title: "Candidate recall validation",
      prompt: "Собери порядок проверки candidate generator.",
      blocks: [
        "train, valid = leave_last_out(interactions)",
        "candidates = generate_candidates(train, k=100)",
        "valid_items = valid.groupby('user_id')['item_id'].apply(set)",
        "score = mean_recall_at_k(candidates, valid_items, k=100)",
      ],
      answer: [
        "train, valid = leave_last_out(interactions)",
        "candidates = generate_candidates(train, k=100)",
        "valid_items = valid.groupby('user_id')['item_id'].apply(set)",
        "score = mean_recall_at_k(candidates, valid_items, k=100)",
      ],
      hint: "Сначала split, потом генерация кандидатов только на train.",
      explain: "Если generator не находит true item в top-100, reranker уже не спасет.",
      difficulty: 3,
    },
    {
      id: "recsys-negative-val-leak",
      kind: "fix",
      title: "Negative sampling leakage",
      prompt: "Исправь negative sampling: нельзя выбирать negative из valid positives пользователя.",
      code:
        "seen = train.groupby('user_id')['item_id'].apply(set).to_dict()\nneg = sample_negative(seen[user], num_items)",
      answer:
        "train_seen = train.groupby('user_id')['item_id'].apply(set).to_dict()\nvalid_pos = valid.groupby('user_id')['item_id'].apply(set).to_dict()\nforbidden = train_seen.get(user, set()) | valid_pos.get(user, set())\nneg = sample_negative({user: forbidden}, [user], num_items)[0]",
      hint: "Для offline valid negative не должен быть настоящим future positive.",
      explain: "Иначе reranker учится опускать item, который должен быть relevant на validation.",
      difficulty: 5,
    },
    {
      id: "recsys-time-split-global",
      kind: "write",
      title: "Global time split",
      prompt: "Напиши temporal split: valid - последние события после quantile cutoff по времени.",
      starter: "def global_time_split(df, time_col='ts', valid_frac=0.2):",
      answer:
        "def global_time_split(df, time_col='ts', valid_frac=0.2):\n    cutoff = df[time_col].quantile(1 - valid_frac)\n    train = df[df[time_col] <= cutoff]\n    valid = df[df[time_col] > cutoff]\n    return train, valid",
      testsText: "Проверяется, что valid строго позже cutoff.",
      hint: "В рекомендательных задачах random split почти всегда слишком оптимистичен.",
      explain: "Global time split имитирует будущий период, особенно если test тоже будущий.",
      difficulty: 3,
    },
    {
      id: "recsys-reranker-train-valid-groups",
      kind: "fix",
      title: "Reranker group split",
      prompt: "Исправь split для reranker: строки одного user нельзя случайно раскидывать между train и valid.",
      code:
        "tr, val = train_test_split(candidates, test_size=0.2, random_state=42)\nmodel.fit(tr[features], tr['label'])",
      answer:
        "from sklearn.model_selection import GroupShuffleSplit\n\ngss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)\ntr_idx, val_idx = next(gss.split(candidates, groups=candidates['user_id']))\ntr = candidates.iloc[tr_idx]\nval = candidates.iloc[val_idx]\nmodel.fit(tr[features], tr['label'])",
      hint: "Reranker candidates группируются по user.",
      explain: "Случайный row split завышает качество, потому что candidate rows одного user похожи.",
      difficulty: 4,
    },
  ],
  "numpy-pandas-boosting": [
    {
      id: "recsys-popular-baseline",
      kind: "write",
      title: "Popular baseline",
      prompt: "Напиши popular recommender: вернуть top-k самых частых item_id из train.",
      starter: "def popular_items(train, k=10):",
      answer:
        "def popular_items(train, k=10):\n    return train['item_id'].value_counts().head(k).index.tolist()",
      testsText: "Проверяется сортировка по частоте.",
      hint: "`value_counts()` уже сортирует по убыванию.",
      explain: "Popular baseline почти всегда нужен как быстрый sanity-check и fallback для cold users.",
      difficulty: 1,
    },
    {
      id: "recsys-user-candidates-popular",
      kind: "write",
      title: "Candidates for users",
      prompt: "Создай candidates: каждому user из valid_users выдать top-k popular items, которых нет в train history.",
      starter: "def popular_candidates(train, valid_users, k=20):",
      answer:
        "def popular_candidates(train, valid_users, k=20):\n    popular = train['item_id'].value_counts().index.tolist()\n    history = train.groupby('user_id')['item_id'].apply(set).to_dict()\n    rows = []\n    for user in valid_users:\n        seen = history.get(user, set())\n        picked = [item for item in popular if item not in seen][:k]\n        rows += [{'user_id': user, 'item_id': item} for item in picked]\n    return pd.DataFrame(rows)",
      testsText: "Проверяется exclusion seen items и ровно k кандидатов если хватает items.",
      hint: "Candidates - это таблица user_id/item_id пар.",
      explain: "Двухстадийная схема: сначала широкий candidate set, потом reranker.",
      difficulty: 4,
    },
    {
      id: "recsys-topk-per-user",
      kind: "write",
      title: "Top-K per user",
      prompt: "Из candidates со столбцами `user_id`, `item_id`, `score` собери top-k item_id на каждого user.",
      starter: "def topk_per_user(candidates, k=10):",
      answer:
        "def topk_per_user(candidates, k=10):\n    ranked = candidates.sort_values(['user_id', 'score'], ascending=[True, False])\n    ranked = ranked.groupby('user_id').head(k)\n    return ranked.groupby('user_id')['item_id'].apply(list).to_dict()",
      testsText: "Проверяется сортировка внутри каждого user.",
      hint: "sort_values, потом groupby.head(k).",
      explain: "Это финальный шаг reranker inference перед submission.",
      difficulty: 3,
    },
    {
      id: "recsys-rank-column-write",
      kind: "write",
      title: "Rank column",
      prompt: "Добавь в candidates колонку `rank`: место item внутри user по score, начиная с 1.",
      starter: "# candidates has user_id, item_id, score\n# create rank",
      answer:
        "candidates = candidates.sort_values(['user_id', 'score'], ascending=[True, False])\ncandidates['rank'] = candidates.groupby('user_id').cumcount() + 1",
      testsText: "Проверяется rank reset для каждого user.",
      hint: "`cumcount()` после сортировки.",
      explain: "Rank useful как feature для blend/reranker и для debug top-K.",
      difficulty: 2,
    },
    {
      id: "recsys-user-item-count-features",
      kind: "write",
      title: "User/item count features",
      prompt: "Добавь к candidates признаки `user_count` и `item_count`, посчитанные только на train interactions.",
      starter: "# train has user_id,item_id; candidates has user_id,item_id",
      answer:
        "user_count = train['user_id'].value_counts()\nitem_count = train['item_id'].value_counts()\ncandidates['user_count'] = candidates['user_id'].map(user_count).fillna(0).astype('int32')\ncandidates['item_count'] = candidates['item_id'].map(item_count).fillna(0).astype('int32')",
      testsText: "Проверяется unknown user/item и train-only статистики.",
      hint: "Частоты считаются на train, потом map в candidates.",
      explain: "Простые popularity/activity features часто дают сильный reranker baseline.",
      difficulty: 3,
    },
    {
      id: "recsys-item-popularity-leak-fix",
      kind: "fix",
      title: "Popularity leakage",
      prompt: "Исправь leakage: item popularity считается на train+valid.",
      code:
        "all_interactions = pd.concat([train, valid])\nitem_pop = all_interactions['item_id'].value_counts()\ncandidates['item_pop'] = candidates['item_id'].map(item_pop).fillna(0)",
      answer:
        "item_pop = train['item_id'].value_counts()\ncandidates['item_pop'] = candidates['item_id'].map(item_pop).fillna(0)",
      hint: "Validation period должен быть будущим и невидимым.",
      explain: "Popularity из valid подсказывает, какие items станут популярными в будущем.",
      difficulty: 3,
    },
    {
      id: "recsys-recency-feature",
      kind: "write",
      title: "Recency feature",
      prompt: "Добавь `days_since_user_last`: разница между candidate_time и последним событием user в train.",
      starter: "# train has user_id, ts; candidates has user_id, candidate_ts",
      answer:
        "last_ts = train.groupby('user_id')['ts'].max()\ncandidates['user_last_ts'] = candidates['user_id'].map(last_ts)\ncandidates['days_since_user_last'] = (candidates['candidate_ts'] - candidates['user_last_ts']) / 86400",
      testsText: "Проверяется map последнего времени пользователя.",
      hint: "Сначала groupby max по user.",
      explain: "Recency - один из самых сильных сигналов в поведении пользователей.",
      difficulty: 3,
    },
    {
      id: "recsys-category-affinity",
      kind: "write",
      title: "Category affinity",
      prompt: "Посчитай, сколько раз user взаимодействовал с категорией candidate item.",
      starter: "# train has user_id, category; candidates has user_id, category",
      answer:
        "user_cat_count = train.groupby(['user_id', 'category']).size().rename('user_cat_count')\ncandidates = candidates.join(user_cat_count, on=['user_id', 'category'])\ncandidates['user_cat_count'] = candidates['user_cat_count'].fillna(0).astype('int32')",
      testsText: "Проверяется unseen category для user.",
      hint: "MultiIndex groupby можно присоединить через `join(..., on=[...])`.",
      explain: "Affinity features помогают reranker понять персональные предпочтения.",
      difficulty: 4,
    },
    {
      id: "recsys-cooccurrence-pairs",
      kind: "write",
      title: "Item co-occurrence",
      prompt: "Для каждого user собери пары items из его истории и посчитай co-occurrence.",
      starter: "def item_cooccurrence(train):",
      answer:
        "def item_cooccurrence(train):\n    counts = {}\n    for items in train.groupby('user_id')['item_id'].apply(list):\n        unique = list(dict.fromkeys(items))\n        for i, a in enumerate(unique):\n            for b in unique[i + 1:]:\n                key = tuple(sorted((a, b)))\n                counts[key] = counts.get(key, 0) + 1\n    return counts",
      testsText: "Проверяется отсутствие self-pairs и дедуп внутри user.",
      hint: "Для простого baseline хватит dict с sorted tuple key.",
      explain: "Co-occurrence candidate generator часто хорош для похожих items.",
      difficulty: 5,
    },
    {
      id: "recsys-submission-k-fix",
      kind: "fix",
      title: "Submission ровно K",
      prompt: "Исправь submission: у некоторых user меньше 10 items после фильтрации seen.",
      code:
        "items = [item for item in ranked[user] if item not in seen[user]][:10]\nsubmission[user] = items",
      answer:
        "items = [item for item in ranked[user] if item not in seen[user]]\nfor item in popular_items:\n    if item not in seen[user] and item not in items:\n        items.append(item)\nsubmission[user] = items[:10]",
      hint: "Нужен fallback popular items.",
      explain: "Leaderboard часто ожидает ровно K рекомендаций для каждого user.",
      difficulty: 3,
    },
    {
      id: "recsys-lgbm-ranker-groups",
      kind: "write",
      title: "LGBMRanker groups",
      prompt: "Подготовь `group` для LGBMRanker: количество candidate rows на каждого user в train order.",
      starter: "# train_rank has user_id, label and features",
      answer:
        "train_rank = train_rank.sort_values('user_id')\ngroup = train_rank.groupby('user_id').size().to_numpy()\nmodel = LGBMRanker(objective='lambdarank', n_estimators=1000, random_state=42)\nmodel.fit(train_rank[features], train_rank['label'], group=group)",
      testsText: "Проверяется sort by user_id и сумма group == len(train_rank).",
      hint: "Ranker должен знать границы query/user groups.",
      explain: "Learning-to-rank модели оптимизируют порядок внутри группы, а не между всеми строками сразу.",
      difficulty: 5,
    },
    {
      id: "recsys-catboost-ranker-pool",
      kind: "fix",
      title: "CatBoostRanker group_id",
      prompt: "Исправь CatBoostRanker: без `group_id` модель не понимает query/user группы.",
      code:
        "model = CatBoostRanker(iterations=500, verbose=False)\nmodel.fit(train_pool, eval_set=valid_pool)",
      answer:
        "train_pool = Pool(train_rank[features], train_rank['label'], group_id=train_rank['user_id'])\nvalid_pool = Pool(valid_rank[features], valid_rank['label'], group_id=valid_rank['user_id'])\nmodel = CatBoostRanker(iterations=500, verbose=False, random_seed=42)\nmodel.fit(train_pool, eval_set=valid_pool)",
      hint: "Ranker работает внутри group/query.",
      explain: "Для reranking user_id обычно является group_id.",
      difficulty: 5,
    },
  ],
  "dataset-loader": [
    {
      id: "recsys-pair-dataset",
      kind: "write",
      title: "PairwiseDataset",
      prompt: "Напиши `__getitem__` для BPR dataset: вернуть user, positive item и sampled negative item.",
      starter: "def __getitem__(self, idx):",
      answer:
        "def __getitem__(self, idx):\n    user, pos_item = self.pairs[idx]\n    seen = self.user_pos.get(user, set())\n    neg_item = random.randrange(self.num_items)\n    while neg_item in seen:\n        neg_item = random.randrange(self.num_items)\n    return torch.tensor(user).long(), torch.tensor(pos_item).long(), torch.tensor(neg_item).long()",
      testsText: "Проверяется dtype long и negative not in seen.",
      hint: "Embedding indices должны быть long.",
      explain: "Такой Dataset напрямую кормит BPR batch loss.",
      difficulty: 4,
    },
    {
      id: "recsys-pointwise-dataset",
      kind: "write",
      title: "PointwiseDataset item",
      prompt: "Напиши `__getitem__` для pointwise reranker dataset: user_id, item_id, dense features, label.",
      starter: "def __getitem__(self, idx):",
      answer:
        "def __getitem__(self, idx):\n    row = self.df.iloc[idx]\n    dense = torch.tensor(row[self.feature_cols].values.astype('float32'))\n    return (\n        torch.tensor(row['user_id']).long(),\n        torch.tensor(row['item_id']).long(),\n        dense,\n        torch.tensor(row['label']).float(),\n    )",
      testsText: "Проверяется long ids, float dense и float label.",
      hint: "IDs идут в embeddings, dense features - float tensor.",
      explain: "Pointwise reranker dataset похож на обычную табличку, но с embedding ids.",
      difficulty: 4,
    },
    {
      id: "recsys-pad-history",
      kind: "write",
      title: "Pad user history",
      prompt: "Напиши `pad_history(items, max_len, pad_id=0)`: взять последние max_len items и дополнить слева pad_id.",
      starter: "def pad_history(items, max_len, pad_id=0):",
      answer:
        "def pad_history(items, max_len, pad_id=0):\n    items = list(items)[-max_len:]\n    pad = [pad_id] * (max_len - len(items))\n    return pad + items",
      testsText: "Проверяется длинная и короткая история.",
      hint: "Для sequence models важнее последние события.",
      explain: "Так можно готовить user sequence для GRU/Transformer-like модели без внешних библиотек.",
      difficulty: 3,
    },
  ],
  "torch-loops": [
    {
      id: "recsys-pointwise-train-order",
      kind: "order",
      title: "Pointwise train step",
      prompt: "Собери train step для pointwise recsys модели.",
      blocks: [
        "optimizer.zero_grad()",
        "score = model(user_id, item_id, dense)",
        "loss = F.binary_cross_entropy_with_logits(score, label.float())",
        "loss.backward()",
        "optimizer.step()",
      ],
      answer: [
        "optimizer.zero_grad()",
        "score = model(user_id, item_id, dense)",
        "loss = F.binary_cross_entropy_with_logits(score, label.float())",
        "loss.backward()",
        "optimizer.step()",
      ],
      hint: "Опять logits в BCEWithLogits.",
      explain: "Pointwise reranker можно обучать как binary classifier по user-item candidates.",
      difficulty: 3,
    },
    {
      id: "recsys-eval-topk-no-grad",
      kind: "fix",
      title: "Eval top-K без grad",
      prompt: "Исправь top-K inference: не нужно строить graph и нельзя оставлять model в train mode.",
      code:
        "scores = []\nfor batch in loader:\n    scores.append(model(batch).detach().cpu())",
      answer:
        "model.eval()\nscores = []\nwith torch.no_grad():\n    for batch in loader:\n        scores.append(model(batch).cpu())",
      hint: "`eval + no_grad` для inference.",
      explain: "Это экономит память и фиксирует поведение dropout/batchnorm.",
      difficulty: 3,
    },
    {
      id: "recsys-sampled-softmax-shapes",
      kind: "choice",
      title: "Sampled softmax shape",
      prompt: "`logits.shape == [B, 1 + num_neg]`, где первый столбец positive. Какой target для CrossEntropyLoss?",
      options: ["torch.zeros(B).long()", "torch.ones(B).float()", "logits.argmax(dim=1)", "positive_scores"],
      answer: "torch.zeros(B).long()",
      hint: "Target - индекс правильного класса.",
      explain: "Если positive всегда в column 0, target для каждого row равен 0.",
      difficulty: 3,
    },
  ],
};

for (const [topicId, lessons] of Object.entries(recsysRerankerLessonPack)) {
  topics.find((topic) => topic.id === topicId).lessons.push(...lessons);
}

const curatedContestLessonPack = {
  "cv-masks": [
    {
      id: "curated-cv-pil-rgb-array",
      kind: "choice",
      title: "PIL RGB array",
      prompt: "Что получится после `np.array(Image.open(path).convert('RGB'))`?",
      options: ["HxWx3 RGB uint8", "3xHxW float", "HxWx3 BGR uint8", "HxW long"],
      answer: "HxWx3 RGB uint8",
      hint: "PIL хранит RGB, numpy оставляет channels-last.",
      explain: "PIL не делает CHW tensor сам. После чтения это HWC RGB array, и для torch обычно нужен `permute(2,0,1)`.",
      difficulty: 1,
    },
    {
      id: "curated-cv2-imread-guard",
      kind: "fix",
      title: "cv2.imread guard",
      prompt: "Исправь чтение OpenCV: если путь битый, `cv2.cvtColor` не должен падать непонятной ошибкой.",
      code: "img = cv2.imread(path)\nimg = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)\nimg = img.astype(np.float32) / 255.0",
      answer:
        "img = cv2.imread(path)\nif img is None:\n    raise FileNotFoundError(path)\nimg = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)\nimg = img.astype(np.float32) / 255.0",
      testsText: "Проверяется явная защита от `None` перед `cvtColor`.",
      hint: "`cv2.imread` возвращает None, если файл не прочитан.",
      explain: "Явная проверка пути экономит время: ошибка будет про файл, а не про пустой image в `cvtColor`.",
      difficulty: 2,
      strictLines: true,
    },
    {
      id: "curated-cv-nhwc-to-nchw-batch",
      kind: "write",
      title: "NHWC batch -> NCHW",
      prompt: "Напиши `batch_to_tensor(images)`: numpy batch NHWC uint8 перевести в torch tensor NCHW float в [0,1].",
      starter: "def batch_to_tensor(images):",
      answer: "def batch_to_tensor(images):\n    return torch.from_numpy(images).permute(0, 3, 1, 2).float() / 255.0",
      testsText: "Проверяется shape B,C,H,W, dtype float и диапазон [0,1].",
      hint: "Для batch добавляется ось 0, поэтому порядок `0,3,1,2`.",
      explain: "Это частый мост между cv2/numpy preprocessing и PyTorch моделью.",
      difficulty: 3,
    },
    {
      id: "curated-cv-mask-bbox-exclusive",
      kind: "write",
      title: "bbox exclusive",
      prompt: "Напиши `mask_to_bbox_exclusive(mask)`: вернуть `[x1,y1,x2,y2]`, где x2/y2 exclusive, или None для пустой маски.",
      starter: "def mask_to_bbox_exclusive(mask):",
      answer:
        "def mask_to_bbox_exclusive(mask):\n    ys, xs = np.where(mask > 0)\n    if len(xs) == 0:\n        return None\n    return [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]",
      testsText: "Проверяется пустая маска и что правый/нижний край exclusive.",
      hint: "В numpy slice правый край не включается.",
      explain: "Это не повтор inclusive bbox: формат удобен для `img[y1:y2, x1:x2]` без `+1` в месте crop.",
      difficulty: 3,
    },
    {
      id: "curated-cv-box-iou-numpy",
      kind: "write",
      title: "box_iou numpy",
      prompt: "Напиши `box_iou(a, b)` для bbox `[x1,y1,x2,y2]` в exclusive формате.",
      starter: "def box_iou(a, b, eps=1e-7):",
      answer:
        "def box_iou(a, b, eps=1e-7):\n    x1 = max(a[0], b[0])\n    y1 = max(a[1], b[1])\n    x2 = min(a[2], b[2])\n    y2 = min(a[3], b[3])\n    inter = max(0, x2 - x1) * max(0, y2 - y1)\n    area_a = max(0, a[2] - a[0]) * max(0, a[3] - a[1])\n    area_b = max(0, b[2] - b[0]) * max(0, b[3] - b[1])\n    return inter / (area_a + area_b - inter + eps)",
      testsText: "Проверяется нет пересечения, полное совпадение и частичное пересечение.",
      hint: "Union = area_a + area_b - inter.",
      explain: "Это IoU для bbox, а не для mask, поэтому отдельно закрепляет формат координат.",
      difficulty: 4,
    },
  ],
  "cv-segmentation": [
    {
      id: "curated-seg-random-crop-pair",
      kind: "order",
      title: "RandomCrop image+mask",
      prompt: "Собери синхронный RandomCrop через torchvision functional API.",
      blocks: [
        "i, j, h, w = torchvision.transforms.RandomCrop.get_params(img, output_size=(256, 256))",
        "img = TF.crop(img, i, j, h, w)",
        "mask = TF.crop(mask, i, j, h, w)",
      ],
      answer: [
        "i, j, h, w = torchvision.transforms.RandomCrop.get_params(img, output_size=(256, 256))",
        "img = TF.crop(img, i, j, h, w)",
        "mask = TF.crop(mask, i, j, h, w)",
      ],
      answers: [
        [
          "i, j, h, w = torchvision.transforms.RandomCrop.get_params(img, output_size=(256, 256))",
          "img = TF.crop(img, i, j, h, w)",
          "mask = TF.crop(mask, i, j, h, w)",
        ],
        [
          "i, j, h, w = torchvision.transforms.RandomCrop.get_params(img, output_size=(256, 256))",
          "mask = TF.crop(mask, i, j, h, w)",
          "img = TF.crop(img, i, j, h, w)",
        ],
      ],
      hint: "Параметры crop должны быть одни и те же; порядок crop image/mask после этого не важен.",
      explain: "Один набор координат crop сохраняет соответствие картинки и разметки.",
      difficulty: 4,
    },
    {
      id: "curated-seg-batched-dice-per-image",
      kind: "write",
      title: "Batched Dice",
      prompt: "Напиши `batched_dice(pred, target)`: pred/target Bx1xHxW bool или 0/1, вернуть mean Dice по изображениям.",
      starter: "def batched_dice(pred, target, eps=1e-6):",
      answer:
        "def batched_dice(pred, target, eps=1e-6):\n    pred = pred.float()\n    target = target.float()\n    inter = (pred * target).sum(dim=(1, 2, 3))\n    denom = pred.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3))\n    dice = (2 * inter + eps) / (denom + eps)\n    return dice.mean().item()",
      testsText: "Проверяется batch size > 1 и усреднение по images, а не общий Dice по всем пикселям.",
      hint: "Суммируй по C,H,W, но не по B.",
      explain: "Так validation ближе к leaderboard, где часто считают среднее качество по картинкам.",
      difficulty: 4,
    },
    {
      id: "curated-seg-train-one-epoch",
      kind: "write",
      title: "train_one_epoch seg",
      prompt: "Напиши `train_one_epoch` для binary segmentation: device, train mode, BCEWithLogits, backward, step.",
      starter: "def train_one_epoch(model, loader, optimizer, device):",
      answer:
        "def train_one_epoch(model, loader, optimizer, device):\n    model.train()\n    total = 0.0\n    for x, y in loader:\n        x = x.to(device)\n        y = y.to(device).float()\n        optimizer.zero_grad()\n        logits = model(x)\n        loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, y)\n        loss.backward()\n        optimizer.step()\n        total += loss.item() * x.size(0)\n    return total / len(loader.dataset)",
      testsText: "Проверяется train mode, device, logits без sigmoid в loss и weighted average по batch size.",
      hint: "Loss усреднен по batch, поэтому для epoch mean умножай на `x.size(0)`.",
      explain: "Это полноценный минимальный train loop для segmentation без pretrained моделей.",
      difficulty: 4,
      strictLines: true,
    },
    {
      id: "curated-seg-val-iou-per-image",
      kind: "fix",
      title: "Val IoU по картинкам",
      prompt: "Исправь validation: нужен eval/no_grad, device, sigmoid, threshold и отдельный score каждого image.",
      code:
        "def validate(model, loader):\n    scores = []\n    for x, y in loader:\n        pred = model(x) > 0.5\n        scores.append(binary_iou(pred, y))\n    return sum(scores) / len(scores)",
      answer:
        "def validate(model, loader):\n    model.eval()\n    scores = []\n    with torch.no_grad():\n        for x, y in loader:\n            x = x.to(device)\n            prob = torch.sigmoid(model(x)).cpu()\n            pred = prob > 0.5\n            scores.extend([binary_iou(p, t > 0.5) for p, t in zip(pred, y)])\n    return sum(scores) / len(scores)",
      testsText: "Проверяется, что logits не threshold-ятся напрямую, а batch не смешивается в одну маску.",
      hint: "Список scores должен получать score каждого image.",
      explain: "Такой loop не строит graph, не threshold-ит logits и не превращает весь batch в одну большую маску.",
      difficulty: 5,
      strictLines: true,
    },
  ],
  "dataset-loader": [
    {
      id: "curated-tabular-dataset-item",
      kind: "write",
      title: "TabularDataset item",
      prompt: "Напиши `__getitem__` для табличного Dataset: вернуть float features и float target.",
      starter: "def __getitem__(self, idx):",
      answer:
        "def __getitem__(self, idx):\n    x = self.X[idx].astype('float32')\n    y = np.float32(self.y[idx])\n    return torch.from_numpy(x), torch.tensor(y)",
      testsText: "Проверяется dtype float32 у признаков и target.",
      hint: "NumPy float64 часто случайно протекает в torch.",
      explain: "Для MLP/regression/BCE табличные признаки почти всегда должны быть float32.",
      difficulty: 3,
      strictLines: true,
    },
    {
      id: "curated-loader-train-valid",
      kind: "write",
      title: "DataLoaders",
      prompt: "Создай train/valid DataLoader: train перемешивается, valid нет.",
      starter: "# train_ds and valid_ds already exist\nbatch_size = 64",
      answer:
        "train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)\nvalid_loader = DataLoader(valid_ds, batch_size=batch_size, shuffle=False)",
      testsText: "Проверяется shuffle=True только у train_loader.",
      hint: "Validation должен быть стабильным и воспроизводимым.",
      explain: "Это маленькая привычка, которая убирает лишний шум из evaluation.",
      difficulty: 2,
    },
    {
      id: "curated-collate-dict-batch",
      kind: "write",
      title: "collate dict batch",
      prompt: "Напиши `collate_fn` для batch из dict: `x` stack, `y` tensor.",
      starter: "def collate_fn(batch):",
      answer:
        "def collate_fn(batch):\n    x = torch.stack([item['x'] for item in batch])\n    y = torch.tensor([item['y'] for item in batch])\n    return {'x': x, 'y': y}",
      testsText: "Проверяется stack по batch dimension и сохранение ключей.",
      hint: "Список отдельных samples превращается в один batch.",
      explain: "Ручной collate помогает понимать, что DataLoader делает между Dataset и model.",
      difficulty: 3,
    },
  ],
  "torch-loops": [
    {
      id: "curated-torch-float32-tensor",
      kind: "fix",
      title: "Float32 tensor",
      prompt: "Исправь создание tensor из numpy: модель не должна получать float64.",
      code: "x = torch.tensor(features)\nlogits = model(x)",
      answer: "x = torch.tensor(features, dtype=torch.float32)\nlogits = model(x)",
      testsText: "Проверяется явный `dtype=torch.float32`.",
      hint: "pandas/numpy часто дают float64 по умолчанию.",
      explain: "Большинство torch-моделей обучаются в float32; float64 может дать dtype mismatch.",
      difficulty: 1,
    },
    {
      id: "curated-device-batch-dict",
      kind: "write",
      title: "Batch dict to device",
      prompt: "Перенеси dict batch с ключами `x` и `y` на device перед forward/loss.",
      starter: "for batch in loader:\n    ",
      answer:
        "for batch in loader:\n    x = batch['x'].to(device)\n    y = batch['y'].to(device)\n    logits = model(x)\n    loss = criterion(logits, y)",
      answers: [
        "for batch in loader:\n    x = batch['x'].to(device)\n    y = batch['y'].to(device)\n    logits = model(x)\n    loss = criterion(logits, y)",
        "for batch in loader:\n    y = batch['y'].to(device)\n    x = batch['x'].to(device)\n    logits = model(x)\n    loss = criterion(logits, y)",
      ],
      testsText: "Проверяется перенос x и y до criterion; порядок переноса x/y не важен.",
      hint: "Loss тоже операция над tensors, значит target должен быть на том же device.",
      explain: "Device mismatch чаще всего всплывает именно на строке loss.",
      difficulty: 3,
      strictLines: true,
    },
    {
      id: "curated-binary-train-step",
      kind: "write",
      title: "Binary train step",
      prompt: "Напиши train step для binary classifier: logits `[B]`, target 0/1.",
      starter: "for x, y in train_loader:\n    ",
      answer:
        "for x, y in train_loader:\n    x = x.to(device)\n    y = y.to(device).float()\n    optimizer.zero_grad()\n    logits = model(x).squeeze(1)\n    loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, y)\n    loss.backward()\n    optimizer.step()",
      testsText: "Проверяется device, target float, BCEWithLogits по logits и squeeze.",
      hint: "Sigmoid нужен для метрик, не для BCEWithLogitsLoss.",
      explain: "Это уже полноценный ручной training fragment для табличной или простой torch-модели.",
      difficulty: 4,
      strictLines: true,
    },
    {
      id: "curated-valid-proba-collect",
      kind: "write",
      title: "Collect valid proba",
      prompt: "Напиши сбор validation probabilities из binary torch model в numpy array.",
      starter: "probs = []\n# fill validation inference",
      answer:
        "model.eval()\nprobs = []\nwith torch.no_grad():\n    for x, _ in valid_loader:\n        x = x.to(device)\n        prob = torch.sigmoid(model(x)).detach().cpu().numpy()\n        probs.append(prob)\nprobs = np.concatenate(probs)",
      testsText: "Проверяется eval/no_grad, sigmoid для probabilities, cpu/numpy и concatenate.",
      hint: "Для sklearn-метрик обычно нужны numpy probabilities на CPU.",
      explain: "Так удобно делать ROC-AUC, threshold sweep, blend и error analysis.",
      difficulty: 4,
      strictLines: true,
    },
  ],
  "validation": [
    {
      id: "curated-holdout-indices-numpy",
      kind: "write",
      title: "Holdout indices",
      prompt: "Напиши random holdout split индексов через numpy generator и `valid_frac`.",
      starter: "def holdout_indices(n, valid_frac=0.2, seed=42):",
      answer:
        "def holdout_indices(n, valid_frac=0.2, seed=42):\n    rng = np.random.default_rng(seed)\n    idx = rng.permutation(n)\n    n_valid = int(n * valid_frac)\n    valid_idx = idx[:n_valid]\n    train_idx = idx[n_valid:]\n    return train_idx, valid_idx",
      testsText: "Проверяется disjoint индексы, размер valid и воспроизводимость seed.",
      hint: "Сначала permutation, потом разрез.",
      explain: "Это минимальный split без sklearn, полезный когда доступен только numpy.",
      difficulty: 2,
    },
    {
      id: "curated-groupkfold-reranker-oof",
      kind: "write",
      title: "GroupKFold by user",
      prompt: "Напиши OOF split для reranker через GroupKFold, чтобы один user не попадал и в train, и в valid fold.",
      starter: "from sklearn.model_selection import GroupKFold\n# fill oof",
      answer:
        "from sklearn.model_selection import GroupKFold\n\noof = np.zeros(len(df))\ngkf = GroupKFold(n_splits=5)\nfor tr_idx, val_idx in gkf.split(df, df['label'], groups=df['user_id']):\n    model = make_model()\n    model.fit(df.iloc[tr_idx][features], df.iloc[tr_idx]['label'])\n    oof[val_idx] = model.predict_proba(df.iloc[val_idx][features])[:, 1]",
      testsText: "Проверяется `groups=df['user_id']` и fresh model per fold.",
      hint: "Row split почти всегда течет, если у пользователя много candidate rows.",
      explain: "Group split убирает memorization user-level candidate rows и дает более честный reranker score.",
      difficulty: 4,
    },
    {
      id: "curated-time-cutoff-features",
      kind: "fix",
      title: "Feature cutoff time",
      prompt: "Исправь leakage: признаки для valid candidates считаются с событиями после времени кандидата.",
      code:
        "history = interactions.groupby('user_id')['item_id'].apply(list).to_dict()\ncandidates['hist_len'] = candidates['user_id'].map(lambda u: len(history.get(u, [])))",
      answer:
        "rows = []\nfor _, row in candidates.iterrows():\n    past = interactions[(interactions['user_id'] == row['user_id']) & (interactions['ts'] < row['candidate_ts'])]\n    rows.append(len(past))\ncandidates['hist_len'] = rows",
      testsText: "Проверяется, что для каждой candidate row доступны только события строго раньше `candidate_ts`.",
      hint: "Для каждой candidate row нужен свой временной cutoff.",
      explain: "Time-aware признаки должны иметь cutoff; иначе valid получает информацию из будущего.",
      difficulty: 5,
    },
    {
      id: "curated-two-stage-labels",
      kind: "order",
      title: "Two-stage labels",
      prompt: "Собери порядок подготовки train data для reranker в двухстадийной схеме.",
      blocks: [
        "train_events, valid_events = leave_last_out(interactions)",
        "candidate_pairs = generate_candidates(train_events, k=200)",
        "positives = valid_events[['user_id', 'item_id']].assign(label=1)",
        "rank_data = candidate_pairs.merge(positives, on=['user_id', 'item_id'], how='left')",
        "rank_data['label'] = rank_data['label'].fillna(0).astype('int8')",
      ],
      answer: [
        "train_events, valid_events = leave_last_out(interactions)",
        "candidate_pairs = generate_candidates(train_events, k=200)",
        "positives = valid_events[['user_id', 'item_id']].assign(label=1)",
        "rank_data = candidate_pairs.merge(positives, on=['user_id', 'item_id'], how='left')",
        "rank_data['label'] = rank_data['label'].fillna(0).astype('int8')",
      ],
      hint: "Label появляется после генерации candidates и merge с future positives.",
      explain: "Reranker учится сортировать только те пары, которые candidate generator реально принес.",
      difficulty: 3,
    },
    {
      id: "curated-valid-loop-avg-loss",
      kind: "write",
      title: "Average valid loss",
      prompt: "Напиши validation loop, который возвращает средний loss по объектам, а не по batch.",
      starter: "def validate(model, loader, criterion, device):",
      answer:
        "def validate(model, loader, criterion, device):\n    model.eval()\n    total_loss = 0.0\n    total_count = 0\n    with torch.no_grad():\n        for x, y in loader:\n            x = x.to(device)\n            y = y.to(device)\n            logits = model(x)\n            loss = criterion(logits, y)\n            total_loss += loss.item() * x.size(0)\n            total_count += x.size(0)\n    return total_loss / total_count",
      testsText: "Проверяется eval/no_grad, device и weighted average по batch size.",
      hint: "Последний batch может быть меньше остальных.",
      explain: "Среднее по batch loss без учета batch size может чуть искажать validation.",
      difficulty: 5,
      strictLines: true,
    },
  ],
  "numpy-pandas-boosting": [
    {
      id: "curated-np-standardize-train-stats",
      kind: "write",
      title: "Standardize numpy",
      prompt: "Напиши стандартизацию `X_train` и `X_valid`: mean/std считаются только на train, по колонкам.",
      starter: "def standardize_train_valid(X_train, X_valid, eps=1e-8):",
      answer:
        "def standardize_train_valid(X_train, X_valid, eps=1e-8):\n    mean = X_train.mean(axis=0)\n    std = X_train.std(axis=0)\n    X_train = (X_train - mean) / (std + eps)\n    X_valid = (X_valid - mean) / (std + eps)\n    return X_train, X_valid",
      testsText: "Проверяется axis=0, train-only statistics и защита от нулевого std.",
      hint: "Validation трансформируется статистиками train.",
      explain: "Это базовый preprocessing без leakage: `fit` на train, `transform` на valid.",
      difficulty: 2,
    },
    {
      id: "curated-pandas-select-numeric-fill",
      kind: "write",
      title: "Numeric fillna",
      prompt: "Выбери числовые колонки pandas DataFrame и заполни пропуски медианами, посчитанными на train.",
      starter: "num_cols = train.select_dtypes(include='number').columns\n# modify train and valid",
      answer:
        "num_cols = train.select_dtypes(include='number').columns\nmedians = train[num_cols].median()\ntrain[num_cols] = train[num_cols].fillna(medians)\nvalid[num_cols] = valid[num_cols].fillna(medians)",
      testsText: "Проверяется, что медианы не считаются на valid.",
      hint: "`median()` по DataFrame вернет Series по колонкам.",
      explain: "Даже простое заполнение пропусков должно повторять train/valid контракт.",
      difficulty: 2,
    },
    {
      id: "curated-np-one-hot-write",
      kind: "write",
      title: "one_hot numpy",
      prompt: "Напиши `one_hot(y, num_classes)` для integer labels numpy shape `[N]`.",
      starter: "def one_hot(y, num_classes):",
      answer:
        "def one_hot(y, num_classes):\n    y = np.asarray(y).astype(int)\n    out = np.zeros((len(y), num_classes), dtype=np.float32)\n    out[np.arange(len(y)), y] = 1.0\n    return out",
      testsText: "Проверяется shape NxC, dtype float32 и правильные позиции единиц.",
      hint: "Нужна advanced indexing: строки `np.arange(len(y))`, колонки `y`.",
      explain: "Ручной one-hot прокачивает понимание shapes, хотя для CrossEntropy в torch он обычно не нужен.",
      difficulty: 3,
    },
    {
      id: "curated-sklearn-hgb-baseline",
      kind: "write",
      title: "sklearn boosting baseline",
      prompt: "Собери sklearn baseline через `HistGradientBoostingClassifier` без внешних предобученных моделей.",
      starter: "from sklearn.ensemble import HistGradientBoostingClassifier\n# fit model",
      answer:
        "from sklearn.ensemble import HistGradientBoostingClassifier\n\nmodel = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, random_state=42)\nmodel.fit(X_train, y_train)\npred = model.predict_proba(X_valid)[:, 1]",
      testsText: "Проверяется fit на X_train/y_train и probability для positive class.",
      hint: "Это чистый sklearn baseline для табличных числовых признаков.",
      explain: "Когда CatBoost/LightGBM хочется сравнить с чем-то быстрым, sklearn boosting дает честный sanity-check.",
      difficulty: 2,
    },
    {
      id: "curated-recsys-last-item-candidates",
      kind: "write",
      title: "Last-item candidates",
      prompt: "Напиши candidate generator: для каждого user взять последний item из train history и выдать top похожих items из `sim_items`.",
      starter: "def last_item_candidates(train, valid_users, sim_items, k=50):",
      answer:
        "def last_item_candidates(train, valid_users, sim_items, k=50):\n    ordered = train.sort_values(['user_id', 'ts'])\n    last_item = ordered.groupby('user_id')['item_id'].last()\n    rows = []\n    for user in valid_users:\n        item = last_item.get(user)\n        for cand in sim_items.get(item, [])[:k]:\n            rows.append({'user_id': user, 'item_id': cand})\n    return pd.DataFrame(rows)",
      testsText: "Проверяется, что candidates строятся из последнего train item пользователя.",
      hint: "Candidate generation отвечает за широкий Recall@K, а не за точную сортировку.",
      explain: "Last-item similarity часто сильнее global popular, потому что учитывает свежий интерес пользователя.",
      difficulty: 3,
    },
    {
      id: "curated-recsys-hard-negatives",
      kind: "write",
      title: "Hard negatives",
      prompt: "Собери hard negatives: для каждого positive user-item выбрать популярный item, который user не видел и который не равен positive.",
      starter: "def add_hard_negatives(train, positives, k=1):",
      answer:
        "def add_hard_negatives(train, positives, k=1):\n    popular = train['item_id'].value_counts().index.tolist()\n    seen = train.groupby('user_id')['item_id'].apply(set).to_dict()\n    rows = []\n    for _, row in positives.iterrows():\n        user = row['user_id']\n        forbidden = seen.get(user, set()) | {row['item_id']}\n        picked = [item for item in popular if item not in forbidden][:k]\n        rows += [{'user_id': user, 'item_id': item, 'label': 0} for item in picked]\n    return pd.DataFrame(rows)",
      testsText: "Проверяется, что negative не в seen и не равен positive item.",
      hint: "Hard negative похож на правдоподобный кандидат, но label у него 0.",
      explain: "Слишком случайные negatives делают задачу легкой; hard negatives учат reranker различать близкие варианты.",
      difficulty: 4,
    },
    {
      id: "curated-rerank-pairwise-features",
      kind: "write",
      title: "Pairwise features",
      prompt: "Добавь pairwise признаки к candidates: user-item count и долю item в истории пользователя.",
      starter: "# train has user_id,item_id; candidates has user_id,item_id",
      answer:
        "ui_count = train.groupby(['user_id', 'item_id']).size().rename('ui_count')\nuser_count = train.groupby('user_id').size().rename('user_count')\ncandidates = candidates.join(ui_count, on=['user_id', 'item_id'])\ncandidates = candidates.join(user_count, on='user_id')\ncandidates['ui_count'] = candidates['ui_count'].fillna(0).astype('int32')\ncandidates['user_count'] = candidates['user_count'].fillna(0).astype('int32')\ncandidates['ui_share'] = candidates['ui_count'] / candidates['user_count'].clip(lower=1)",
      testsText: "Проверяется unseen user-item pair и отсутствие деления на ноль.",
      hint: "Pairwise feature зависит сразу от user и item.",
      explain: "Reranker обычно выигрывает не от одной популярности item, а от признаков совместимости user-item.",
      difficulty: 4,
    },
    {
      id: "curated-calibrated-classifier",
      kind: "write",
      title: "Calibration wrapper",
      prompt: "Оберни sklearn model в `CalibratedClassifierCV` с sigmoid calibration на folds.",
      starter: "from sklearn.calibration import CalibratedClassifierCV\n# calibrate base_model",
      answer:
        "from sklearn.calibration import CalibratedClassifierCV\n\ncalibrated = CalibratedClassifierCV(base_model, method='sigmoid', cv=3)\ncalibrated.fit(X_train, y_train)\nprob = calibrated.predict_proba(X_valid)[:, 1]",
      testsText: "Проверяется использование CalibratedClassifierCV и predict_proba.",
      hint: "Calibration меняет вероятности, а не саму идею ranking score.",
      explain: "Для logloss, thresholding и business rules качество вероятностей может быть важнее сырого score.",
      difficulty: 4,
    },
  ],
  "metrics-losses": [
    {
      id: "curated-confusion-counts",
      kind: "write",
      title: "TP FP FN TN",
      prompt: "Напиши подсчет TP, FP, FN, TN для binary numpy arrays.",
      starter: "def confusion_counts(y_true, y_pred):",
      answer:
        "def confusion_counts(y_true, y_pred):\n    y_true = np.asarray(y_true).astype(bool)\n    y_pred = np.asarray(y_pred).astype(bool)\n    tp = (y_true & y_pred).sum()\n    fp = (~y_true & y_pred).sum()\n    fn = (y_true & ~y_pred).sum()\n    tn = (~y_true & ~y_pred).sum()\n    return tp, fp, fn, tn",
      testsText: "Проверяется bool casting и все четыре счетчика.",
      hint: "Используй логические маски, не циклы.",
      explain: "Precision, recall, F1 и многие debug-таблицы начинаются с этих четырех чисел.",
      difficulty: 3,
    },
    {
      id: "curated-binary-accuracy-logits",
      kind: "write",
      title: "Accuracy from logits",
      prompt: "Напиши binary accuracy для logits: threshold 0 после logits, без sigmoid.",
      starter: "def binary_accuracy_from_logits(logits, target):",
      answer:
        "def binary_accuracy_from_logits(logits, target):\n    pred = logits >= 0\n    target = target.bool()\n    return (pred == target).float().mean().item()",
      testsText: "Проверяется threshold на logits и scalar float result.",
      hint: "`sigmoid(logit) >= 0.5` эквивалентно `logit >= 0`.",
      explain: "Для accuracy можно не считать sigmoid, если нужен порог 0.5.",
      difficulty: 3,
    },
    {
      id: "curated-mean-recall-at-k",
      kind: "write",
      title: "Mean Recall@K",
      prompt: "Напиши средний Recall@K по пользователям: `pred_by_user` и `true_by_user` - dict user -> list/set items.",
      starter: "def mean_recall_at_k(pred_by_user, true_by_user, k):",
      answer:
        "def mean_recall_at_k(pred_by_user, true_by_user, k):\n    scores = []\n    for user, relevant in true_by_user.items():\n        relevant = set(relevant)\n        if not relevant:\n            continue\n        recommended = pred_by_user.get(user, [])[:k]\n        hits = len(set(recommended) & relevant)\n        scores.append(hits / len(relevant))\n    return float(np.mean(scores)) if scores else 0.0",
      testsText: "Проверяется user без predictions и пропуск пустых relevant.",
      hint: "Сначала metric per user, потом mean.",
      explain: "Offline recsys метрики почти всегда усредняются по пользователям, а не по одной общей куче items.",
      difficulty: 3,
    },
    {
      id: "curated-map-at-k",
      kind: "write",
      title: "MAP@K",
      prompt: "Напиши MAP@K как среднее AP@K по пользователям.",
      starter: "def map_at_k(pred_by_user, true_by_user, k):",
      answer:
        "def map_at_k(pred_by_user, true_by_user, k):\n    scores = []\n    for user, relevant in true_by_user.items():\n        relevant = set(relevant)\n        if not relevant:\n            continue\n        hits = 0\n        score = 0.0\n        for rank, item in enumerate(pred_by_user.get(user, [])[:k], start=1):\n            if item in relevant:\n                hits += 1\n                score += hits / rank\n        scores.append(score / min(len(relevant), k))\n    return float(np.mean(scores)) if scores else 0.0",
      testsText: "Проверяется AP по каждому user и mean.",
      hint: "MAP - это не один AP на всех строках, а mean по группам.",
      explain: "MAP@K наказывает за поздние попадания сильнее, чем Recall@K.",
      difficulty: 4,
    },
    {
      id: "curated-graded-ndcg",
      kind: "write",
      title: "Graded NDCG@K",
      prompt: "Напиши NDCG@K для graded relevance: `rel_by_item` хранит gain item -> 0/1/2/3.",
      starter: "def graded_ndcg_at_k(recommended, rel_by_item, k):",
      answer:
        "def graded_ndcg_at_k(recommended, rel_by_item, k):\n    dcg = 0.0\n    for rank, item in enumerate(recommended[:k], start=1):\n        rel = rel_by_item.get(item, 0)\n        dcg += (2 ** rel - 1) / np.log2(rank + 1)\n    ideal = sorted(rel_by_item.values(), reverse=True)[:k]\n    idcg = sum((2 ** rel - 1) / np.log2(rank + 1) for rank, rel in enumerate(ideal, start=1))\n    return dcg / idcg if idcg > 0 else 0.0",
      testsText: "Проверяется discount, gain `2**rel-1` и idcg=0.",
      hint: "Graded relevance ценит сильные positive выше слабых.",
      explain: "NDCG подходит не только для binary relevance: покупки, клики и добавления в корзину можно задать разными gains.",
      difficulty: 5,
    },
    {
      id: "curated-sampled-recall-bug",
      kind: "bug",
      title: "Sampled Recall bug",
      prompt: "Какая строка делает Recall@K завышенным из-за оценки только на sampled negatives?",
      lines: [
        "items = [true_item] + sampled_negative_items",
        "scores = model.score(user, items)",
        "ranked = [items[i] for i in np.argsort(scores)[::-1]]",
        "recall = float(true_item in ranked[:10])",
      ],
      answer: 0,
      hint: "Настоящий candidate space шире, чем true item плюс несколько negatives.",
      explain: "Sampled Recall может быть полезен для debug, но он обычно оптимистичнее полного Recall по всем доступным candidate items.",
      difficulty: 4,
    },
  ],
  "architectures": [
    {
      id: "curated-conv-block-order",
      kind: "order",
      title: "Conv block",
      prompt: "Собери простой Conv block без pretrained weights.",
      blocks: [
        "nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1)",
        "nn.BatchNorm2d(out_ch)",
        "nn.ReLU(inplace=True)",
      ],
      answer: [
        "nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1)",
        "nn.BatchNorm2d(out_ch)",
        "nn.ReLU(inplace=True)",
      ],
      hint: "Сначала свертка, потом нормализация, потом нелинейность.",
      explain: "Это базовый строительный блок маленькой CNN/U-Net, обучаемой с нуля.",
      difficulty: 1,
    },
    {
      id: "curated-unet-output-logits",
      kind: "choice",
      title: "U-Net logits",
      prompt: "Что должен возвращать последний слой binary U-Net перед `BCEWithLogitsLoss`?",
      options: ["logits Bx1xHxW", "sigmoid probabilities Bx1xHxW", "argmax mask BxHxW", "RGB image Bx3xHxW"],
      answer: "logits Bx1xHxW",
      hint: "`BCEWithLogitsLoss` сам содержит sigmoid.",
      explain: "Финальная свертка обычно `nn.Conv2d(ch, 1, kernel_size=1)`, без sigmoid в `forward`.",
      difficulty: 2,
    },
    {
      id: "curated-simple-cnn-adaptive-pool",
      kind: "write",
      title: "SimpleCNN forward",
      prompt: "Напиши `forward` для CNN: features -> adaptive avg pool 1x1 -> flatten -> classifier.",
      starter: "def forward(self, x):",
      answer:
        "def forward(self, x):\n    x = self.features(x)\n    x = torch.nn.functional.adaptive_avg_pool2d(x, 1)\n    x = torch.flatten(x, 1)\n    x = self.classifier(x)\n    return x",
      testsText: "Проверяется, что модель принимает разные H,W и сохраняет batch dimension.",
      hint: "Adaptive pool убирает зависимость Linear от размера картинки.",
      explain: "Это простой CNN baseline без pretrained backbone и без ручного расчета flatten size.",
      difficulty: 3,
    },
    {
      id: "curated-unet-up-concat",
      kind: "fix",
      title: "U-Net skip concat",
      prompt: "Исправь U-Net up block: после upsample нужно склеить decoder feature со skip по channel dimension.",
      code: "x = self.up(x)\nx = torch.cat([x, skip], dim=0)\nx = self.conv(x)",
      answer: "x = self.up(x)\nx = torch.cat([x, skip], dim=1)\nx = self.conv(x)",
      testsText: "Проверяется concat по channel dimension в BCHW layout.",
      hint: "В torch layout BCHW, каналы имеют dimension 1.",
      explain: "Skip connection в U-Net соединяет feature maps по каналам, а не по batch.",
      difficulty: 4,
    },
    {
      id: "curated-inbatch-negatives-logits",
      kind: "write",
      title: "In-batch negatives",
      prompt: "Напиши logits для in-batch negatives: user_vec BxD, item_vec BxD, positive item стоит на диагонали.",
      starter: "def inbatch_logits(user_vec, item_vec):",
      answer:
        "def inbatch_logits(user_vec, item_vec):\n    logits = user_vec @ item_vec.T\n    target = torch.arange(user_vec.size(0), device=user_vec.device)\n    return logits, target",
      testsText: "Проверяется shape BxB и target [0..B-1].",
      hint: "Каждый item в batch является negative для других users.",
      explain: "In-batch negatives экономят sampling и дают плотный contrastive сигнал без предобученных моделей.",
      difficulty: 4,
    },
  ],
};

for (const [topicId, lessons] of Object.entries(curatedContestLessonPack)) {
  topics.find((topic) => topic.id === topicId).lessons.push(...lessons);
}

const practiceSets = [
  { title: "Cuties Mini", copy: "image+mask Dataset, nearest resize, IoU, threshold sweep." },
  { title: "Radar Shapes", copy: "Проверить входные каналы, logits и target для segmentation." },
  { title: "Chicken Count", copy: "Density map, count как сумма, MAE по числу объектов." },
  { title: "OOF Table Sprint", copy: "Stratified split, target encoding без leakage, CatBoost submit." },
  { title: "Recsys Rerank", copy: "Candidates → features → ranker groups → top-K metrics." },
];

const libraryCards = [
  { title: "Segmentation CE", text: "`logits: [B,C,H,W]`, `target: [B,H,W]`, target dtype long." },
  { title: "Binary BCE", text: "`logits: [B,1,H,W]`, mask float `[B,1,H,W]`, sigmoid только для метрик." },
  { title: "OOF encoding", text: "Train encoding из folds, test encoding из full train mapping." },
  { title: "Contest loop", text: "Baseline → validation → submit → ablation → blend/postprocess." },
  { title: "CV transforms", text: "Одинаковые spatial augmentations для image и mask." },
  { title: "Torch reflex", text: "`zero_grad → forward → loss → backward → step`; val через `eval + no_grad`." },
  { title: "Recsys two-stage", text: "Candidate generator максимизирует Recall@K, reranker сортирует top candidates." },
  { title: "Ranker groups", text: "LGBM/CatBoost ranker получает group/query: обычно все candidate rows одного user." },
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
let authCheckTimer = null;

if (!topics.some((topic) => topic.id === currentTopicId)) {
  currentTopicId = topics[0].id;
  currentLessonIndex = 0;
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
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
    "queueList",
    "accountButton",
    "authModal",
    "authCloseButton",
    "authUsername",
    "authEmail",
    "authUsernameHint",
    "authEmailHint",
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
  els.queueList?.addEventListener("click", handleQueueClick);
  els.accountButton?.addEventListener("click", openAuthModal);
  els.authCloseButton?.addEventListener("click", closeAuthModal);
  els.authModal?.addEventListener("click", (event) => {
    if (event.target === els.authModal) closeAuthModal();
  });
  els.loginButton?.addEventListener("click", () => submitAuth("login"));
  els.registerButton?.addEventListener("click", () => submitAuth("register"));
  els.logoutButton?.addEventListener("click", logout);
  els.authUsername?.addEventListener("input", scheduleAuthChecks);
  els.authEmail?.addEventListener("input", scheduleAuthChecks);
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
  document.getElementById("codeAnswer")?.addEventListener("keydown", handleCodeTextareaKeydown);
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
          if (term.contest) lines.push(`Зачем на контесте: ${term.contest}`);
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
    return selectedOption ? `Ты выбрал: ${selectedOption}.` : "Ты пока не выбрал вариант.";
  }
  if (lesson.kind === "bug") {
    return selectedBugLine === null ? "Ты пока не выбрал строку." : `Ты выбрал строку ${selectedBugLine + 1}.`;
  }
  if (lesson.kind === "order") {
    if (!selectedBlocks.length) return "Ты пока не собрал ни одной строки.";
    return `Сейчас твоя цепочка по смыслу:\n${selectedBlocks.map((line, index) => `${index + 1}. ${lineConcept(line)}`).join("\n")}`;
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
    return lines.length ? `В твоём коде сейчас ${lines.length} непустых строк. Сравниваю по смысловым действиям, а не просто по общей идее.` : "Код пока пустой.";
  }
  return "";
}

function buildMismatchHint(lesson) {
  if (lesson.kind === "order") return buildOrderMismatchHint(lesson);
  if (lesson.kind === "choice") return buildChoiceMismatchHint(lesson);
  if (lesson.kind === "fill") return buildFillMismatchHint(lesson);
  if (lesson.kind === "bug") return buildBugMismatchHint(lesson);
  if (lesson.kind === "fix" || lesson.kind === "write") return buildCodeMismatchHint(lesson);
  return "";
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
  return `Первый разъезд на шаге ${mismatchIndex + 1}: у тебя там «${lineConcept(got)}», а в этой логике сначала нужно «${lineConcept(expected)}».`;
}

function buildChoiceMismatchHint(lesson) {
  if (!selectedOption) return "Сначала выбери вариант, потом смотри, какую сущность реально принимает функция/метрика в условии.";
  const selected = selectedOption.toLowerCase();
  if (selected.includes("sigmoid") || selected.includes("softmax") || selected.includes("argmax")) {
    return "Ты выбрал вариант с преобразованием выхода модели. Проверь, спрашивают ли здесь loss/training или inference/metric: loss часто хочет logits, а probability/class id нужны позже.";
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
  const answer = chooseClosestTextAnswer(lesson);
  const answerLines = splitUsefulLines(answer);
  const userLines = splitUsefulLines(typedCode);
  if (!answerLines.length) return "";

  const missing = answerLines
    .filter((line) => isImportantLine(line) && !userLines.some((candidate) => equivalentCodeLine(candidate, line)))
    .slice(0, 3)
    .map((line) => `не найдено действие: ${lineConcept(line)}`);

  const diffIndex = firstDifferentLineIndex(userLines, answerLines);
  const diff = diffIndex === -1 ? "" : `Первый разъезд примерно на строке ${diffIndex + 1}: у тебя «${lineConcept(userLines[diffIndex] || "пусто")}», а нужно действие «${lineConcept(answerLines[diffIndex])}».`;
  const syntax = lesson.strictLines ? "Для этой задачи важны отступы, двоеточия после `for/if/with` и скобки у вызовов." : "";
  return [diff, missing.join("\n"), syntax].filter(Boolean).join("\n");
}

function buildConceptHint(lesson) {
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
  if (lesson.kind === "order") ok = acceptedAnswers(lesson).some((answer) => arraysEqual(selectedBlocks, answer));
  if (lesson.kind === "choice") ok = acceptedAnswers(lesson).includes(selectedOption);
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
    ok = acceptedAnswers(lesson).some((answer) =>
      lesson.strictLines
        ? normalizeWrittenCode(typedCode) === normalizeWrittenCode(answer)
        : normalizeCode(typedCode) === normalizeCode(answer),
    );
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
  const email = els.authEmail?.value.trim() || "";
  const identity = username || email;
  const password = els.authPassword.value;
  if (mode === "register" && !email) {
    showAuthStatus("Для регистрации нужна почта.");
    els.authEmail?.focus();
    return;
  }
  if (!identity) {
    showAuthStatus("Введи логин или почту.");
    els.authUsername?.focus();
    return;
  }
  try {
    const data = await apiRequest(`/api/${mode}`, {
      method: "POST",
      body: mode === "register" ? { username, email, password } : { username: identity, password },
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

function scheduleAuthChecks() {
  clearTimeout(authCheckTimer);
  authCheckTimer = setTimeout(checkAuthAvailability, 260);
}

function setAuthHint(element, text, state = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `auth-hint ${state ? `is-${state}` : ""}`;
}

async function checkAuthAvailability() {
  const username = els.authUsername?.value.trim() || "";
  const email = els.authEmail?.value.trim() || "";

  if (!username) {
    setAuthHint(els.authUsernameHint, "3-24 символа: буквы, цифры, _-.");
  } else if (username.length < 3) {
    setAuthHint(els.authUsernameHint, "Коротковато: минимум 3 символа.", "bad");
  } else {
    try {
      const data = await apiRequest(`/api/check-username?username=${encodeURIComponent(username)}`, { skipAuth: true });
      setAuthHint(els.authUsernameHint, data.message || (data.available ? "Свободен" : "Уже занят"), data.available ? "good" : "bad");
    } catch {
      setAuthHint(els.authUsernameHint, "Проверю при создании аккаунта.");
    }
  }

  if (!email) {
    setAuthHint(els.authEmailHint, "Нужна при создании аккаунта. Войти можно по логину или почте.");
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    setAuthHint(els.authEmailHint, "Похоже, в почте ошибка.", "bad");
  } else {
    try {
      const data = await apiRequest(`/api/check-email?email=${encodeURIComponent(email)}`, { skipAuth: true });
      setAuthHint(els.authEmailHint, data.message || (data.available ? "Почта свободна" : "Почта уже занята"), data.available ? "good" : "bad");
    } catch {
      setAuthHint(els.authEmailHint, "Проверю при создании аккаунта.");
    }
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
