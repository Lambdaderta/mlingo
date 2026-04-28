import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packDir = path.join(root, "lesson-packs");
const allowedKinds = new Set(["order", "fill", "choice", "bug", "fix", "write", "idea"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function validateCommonLesson(lesson, topicId, seenLessonIds) {
  assertString(lesson.id, `${topicId}.lesson.id`);
  assert.match(lesson.id, /^[a-z0-9][a-z0-9-]*$/, `${lesson.id}: lesson id should be kebab-case`);
  assert.ok(!seenLessonIds.has(lesson.id), `duplicate lesson id: ${lesson.id}`);
  seenLessonIds.add(lesson.id);

  assert.ok(allowedKinds.has(lesson.kind), `${lesson.id}: unsupported kind ${lesson.kind}`);
  assertString(lesson.title, `${lesson.id}.title`);
  assertString(lesson.prompt, `${lesson.id}.prompt`);
  assertString(lesson.hint, `${lesson.id}.hint`);
  assertString(lesson.explain, `${lesson.id}.explain`);

  for (const field of ["input", "output", "example", "check"]) {
    if (lesson[field] !== undefined) assertString(lesson[field], `${lesson.id}.${field}`);
  }

  if (lesson.difficulty !== undefined) {
    assert.ok(Number.isInteger(lesson.difficulty), `${lesson.id}: difficulty must be integer`);
    assert.ok(lesson.difficulty >= 1 && lesson.difficulty <= 5, `${lesson.id}: difficulty must be 1..5`);
  }

  if (lesson.terms !== undefined) {
    assert.ok(Array.isArray(lesson.terms), `${lesson.id}: terms must be an array`);
    lesson.terms.forEach((term, index) => assertString(term, `${lesson.id}.terms[${index}]`));
  }
}

function validateLessonKind(lesson) {
  if (lesson.kind === "choice") {
    assert.ok(Array.isArray(lesson.options) && lesson.options.length >= 2, `${lesson.id}: choice needs options`);
    assert.ok(lesson.options.includes(lesson.answer), `${lesson.id}: answer must be one of options`);
  }

  if (lesson.kind === "order") {
    assert.ok(Array.isArray(lesson.blocks) && lesson.blocks.length >= 2, `${lesson.id}: order needs blocks`);
    assert.ok(Array.isArray(lesson.answer) && lesson.answer.length === lesson.blocks.length, `${lesson.id}: answer must match blocks length`);
    for (const line of lesson.answer) {
      assert.ok(lesson.blocks.includes(line), `${lesson.id}: answer line is not present in blocks`);
    }
    if (lesson.answers !== undefined) {
      assert.ok(Array.isArray(lesson.answers), `${lesson.id}: answers must be an array`);
      for (const answer of lesson.answers) {
        assert.ok(Array.isArray(answer) && answer.length === lesson.blocks.length, `${lesson.id}: every alternate answer must match blocks length`);
      }
    }
  }

  if (lesson.kind === "fill") {
    assertString(lesson.code, `${lesson.id}.code`);
    assert.ok(lesson.code.includes("____"), `${lesson.id}: fill code should include blank marker`);
    assert.ok(Array.isArray(lesson.blanks) && lesson.blanks.length > 0, `${lesson.id}: fill needs blanks`);
  }

  if (lesson.kind === "bug") {
    assert.ok(Array.isArray(lesson.lines) && lesson.lines.length >= 2, `${lesson.id}: bug needs lines`);
    assert.ok(Number.isInteger(lesson.answer), `${lesson.id}: bug answer must be line index`);
    assert.ok(lesson.answer >= 0 && lesson.answer < lesson.lines.length, `${lesson.id}: bug answer out of range`);
  }

  if (lesson.kind === "fix") {
    assertString(lesson.code, `${lesson.id}.code`);
    assertString(lesson.answer, `${lesson.id}.answer`);
    assert.notEqual(lesson.code.trim(), lesson.answer.trim(), `${lesson.id}: fix answer should change the code`);
  }

  if (lesson.kind === "write") {
    assertString(lesson.starter, `${lesson.id}.starter`);
    assertString(lesson.answer, `${lesson.id}.answer`);
  }

  if (lesson.kind === "idea") {
    assertString(lesson.context, `${lesson.id}.context`);
    assertString(lesson.reference, `${lesson.id}.reference`);
    assert.ok(Array.isArray(lesson.rubric) && lesson.rubric.length > 0, `${lesson.id}: idea needs rubric`);
    const minRubric = lesson.minRubric ?? 1;
    assert.ok(Number.isInteger(minRubric) && minRubric >= 1, `${lesson.id}: minRubric must be positive integer`);
    assert.ok(minRubric <= lesson.rubric.length, `${lesson.id}: minRubric cannot exceed rubric length`);
    for (const [index, item] of lesson.rubric.entries()) {
      assertString(item.label, `${lesson.id}.rubric[${index}].label`);
      assert.ok(Array.isArray(item.keywords) && item.keywords.length > 0, `${lesson.id}: rubric item needs keywords`);
      item.keywords.forEach((keyword, keywordIndex) => assertString(keyword, `${lesson.id}.rubric[${index}].keywords[${keywordIndex}]`));
    }
  }
}

const indexPath = path.join(packDir, "index.json");
const index = readJson(indexPath);
assert.equal(index.schemaVersion, 1, "index schemaVersion must be 1");
assertString(index.id, "index.id");
assertString(index.title, "index.title");
assert.ok(Array.isArray(index.packs) && index.packs.length > 0, "index.packs must be non-empty");

const referencedPackFiles = new Set();
const packIds = new Set();
for (const item of index.packs) {
  assertString(item.id, "pack index id");
  assertString(item.title, `${item.id}.title`);
  assertString(item.url, `${item.id}.url`);
  assert.ok(!packIds.has(item.id), `duplicate pack id in index: ${item.id}`);
  packIds.add(item.id);

  const fileName = path.basename(item.url);
  const filePath = path.join(packDir, fileName);
  assert.ok(fs.existsSync(filePath), `${item.id}: referenced pack file does not exist: ${fileName}`);
  referencedPackFiles.add(fileName);
}

const allPackFiles = fs.readdirSync(packDir).filter((file) => file.endsWith(".json") && file !== "index.json");
for (const file of allPackFiles) {
  assert.ok(referencedPackFiles.has(file), `${file} must be referenced from lesson-packs/index.json`);
}

const seenTopicIds = new Set();
const seenLessonIds = new Set();
const counters = { total: 0, idea: 0, cv: 0, recsys: 0 };

for (const file of allPackFiles) {
  const pack = readJson(path.join(packDir, file));
  assert.equal(pack.schemaVersion, 1, `${file}: schemaVersion must be 1`);
  assertString(pack.id, `${file}.id`);
  assertString(pack.title, `${file}.title`);
  assert.ok(Array.isArray(pack.topics) && pack.topics.length > 0, `${file}: topics must be non-empty`);

  for (const topic of pack.topics) {
    assertString(topic.id, `${file}.topic.id`);
    assert.match(topic.id, /^[a-z0-9][a-z0-9-]*$/, `${topic.id}: topic id should be kebab-case`);
    assert.ok(!seenTopicIds.has(topic.id), `duplicate topic id across packs: ${topic.id}`);
    seenTopicIds.add(topic.id);
    assertString(topic.title, `${topic.id}.title`);
    assertString(topic.track, `${topic.id}.track`);
    assertString(topic.tag, `${topic.id}.tag`);
    assertString(topic.copy, `${topic.id}.copy`);
    assert.ok(Array.isArray(topic.lessons) && topic.lessons.length > 0, `${topic.id}: lessons must be non-empty`);

    for (const lesson of topic.lessons) {
      validateCommonLesson(lesson, topic.id, seenLessonIds);
      validateLessonKind(lesson);
      counters.total += 1;
      if (lesson.kind === "idea") counters.idea += 1;
      if (topic.tag === "cv") counters.cv += 1;
      if (topic.tag === "recsys" || topic.id.includes("recsys") || topic.id.includes("ranking")) counters.recsys += 1;
    }
  }
}

assert.ok(counters.total >= 40, `expected at least 40 external lessons, got ${counters.total}`);
assert.ok(counters.cv >= 25, `expected at least 25 CV lessons, got ${counters.cv}`);
assert.ok(counters.recsys >= 10, `expected at least 10 recsys/ranking lessons, got ${counters.recsys}`);
assert.ok(counters.idea >= 5, `expected at least 5 idea lessons, got ${counters.idea}`);

console.log(`Lesson pack tests passed: ${counters.total} lessons, ${counters.cv} CV, ${counters.recsys} recsys/ranking, ${counters.idea} idea.`);
