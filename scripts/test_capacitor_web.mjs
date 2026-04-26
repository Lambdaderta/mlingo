import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

assert.ok(fs.existsSync(webDir), "web directory should exist after npm run cap:prepare");

for (const file of ["index.html", "app.js", "styles.css", "service-worker.js", "manifest.webmanifest", "icon.svg"]) {
  const source = path.join(root, file);
  const built = path.join(webDir, file);
  assert.ok(fs.existsSync(built), `web/${file} should exist`);
  assert.equal(read(built), read(source), `web/${file} should match source ${file}`);
}

const sourcePackDir = path.join(root, "lesson-packs");
const builtPackDir = path.join(webDir, "lesson-packs");
assert.ok(fs.existsSync(builtPackDir), "web/lesson-packs should exist");

for (const file of fs.readdirSync(sourcePackDir).filter((item) => item.endsWith(".json"))) {
  const source = path.join(sourcePackDir, file);
  const built = path.join(builtPackDir, file);
  assert.ok(fs.existsSync(built), `web/lesson-packs/${file} should exist`);
  assert.equal(read(built), read(source), `web/lesson-packs/${file} should match source pack`);
}

console.log("Capacitor web bundle tests passed.");
