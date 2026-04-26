import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function safeResolve(requestPath) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.resolve(root, `.${decodeURIComponent(normalized)}`);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const filePath = safeResolve(url.pathname);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not Found");
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
} catch (error) {
  if (error?.code === "EPERM" && !process.env.CI) {
    console.warn("HTTP smoke tests skipped: local socket binding is blocked in this environment.");
    process.exit(0);
  }
  throw error;
}
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200, "index should return 200");
  assert.ok((await index.text()).includes("MLingo"), "index should contain app name");

  const app = await fetch(`${baseUrl}/app.js?v=clean8`);
  assert.equal(app.status, 200, "app.js should return 200 even with cache query");
  assert.ok((await app.text()).includes("loadLessonPacks"), "app.js should contain lesson pack loader");

  const packIndex = await fetch(`${baseUrl}/lesson-packs/index.json`);
  assert.equal(packIndex.status, 200, "lesson pack index should return 200");
  assert.ok(Array.isArray((await packIndex.json()).packs), "lesson pack index should parse as JSON");

  const missing = await fetch(`${baseUrl}/missing-file.txt`);
  assert.equal(missing.status, 404, "missing file should return 404");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("HTTP smoke tests passed.");
