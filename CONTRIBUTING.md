# Как контрибьютить в MLingo

MLingo устроен так, чтобы новые упражнения можно было добавлять без сборки и тяжелого toolchain.

## Локальный запуск

```bash
python3 server.py --port 4180
```

Открой `http://127.0.0.1:4180/`.

## Формат урока

Уроки лежат в `app.js` внутри `topics` или в дополнительных массивах вроде `advancedCvTorchLessons`.

Минимальный урок с блоками:

```js
{
  id: "unique-id",
  kind: "order",
  difficulty: 2,
  title: "Название",
  prompt: "Что надо сделать?",
  blocks: ["line_1", "line_2"],
  answer: ["line_1", "line_2"],
  hint: "Намек без полного ответа.",
  explain: "Почему это важно."
}
```

Поддерживаемые типы:

- `choice` — выбрать один вариант.
- `order` — собрать код из строк.
- `fill` — вписать пропуски.
- `bug` — найти строку с ошибкой.
- `fix` — исправить готовый код.
- `write` — написать решение руками.

## Хороший урок

- Проверяет один конкретный навык.
- Имеет контестный смысл: shape, dtype, leakage, validation, postprocess, loss, metric.
- Не требует pretrained models и интернета.
- Укладывается в короткий игровой блок.
- Сложность растет от 1 до 5: сначала распознавание, потом правка, потом ручное написание.

## Словарь терминов

Если в уроке есть термин вроде `Dice`, `OOF`, `logits` или `GroupKFold`, добавь или проверь запись в `glossary` в `app.js`. Подсказки автоматически подтянут мини-разбор термина.

## Перед PR

Проверь:

```bash
node --check app.js
python3 -m py_compile server.py
```

Для `py_compile` в sandbox можно использовать:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile server.py
```
