import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function extractStringsFromArray(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(match, `Could not find ${constName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const html = read("index.html");
const app = read("app.js");
const server = read("server.py");
const sw = read("service-worker.js");
const packageJson = readJson("package.json");
const capacitorConfig = readJson("capacitor.config.json");
const packIndex = readJson("lesson-packs/index.json");

assert.ok(html.includes('lang="ru"'), "index.html should declare Russian UI language");
assert.ok(html.includes('id="packSourceInput"'), "index.html should include GitHub pack source input");
assert.ok(html.includes('id="packSyncButton"'), "index.html should include GitHub pack sync button");
assert.ok(html.includes('id="packExportButton"'), "index.html should include pack export button");
assert.ok(html.includes('id="packImportButton"'), "index.html should include pack import button");
assert.ok(html.includes('id="githubLoginButton"'), "index.html should include GitHub login button");
assert.ok(html.includes('id="githubIntegrationPanel"'), "index.html should include GitHub integrations panel");

const cacheMatch = sw.match(/CACHE_NAME\s*=\s*"mlingo-clean-v(\d+)"/);
assert.ok(cacheMatch, "service worker cache version should be mlingo-clean-vN");
const cacheVersion = cacheMatch[1];
assert.ok(html.includes(`./styles.css?v=clean${cacheVersion}`), "CSS query version should match service worker cache version");
assert.ok(html.includes(`./app.js?v=clean${cacheVersion}`), "JS query version should match service worker cache version");

const serviceWorkerAssets = new Set(extractStringsFromArray(sw, "ASSETS"));
for (const asset of serviceWorkerAssets) {
  if (asset === "./") continue;
  const cleanAsset = asset.replace(/^\.\//, "");
  assert.ok(fs.existsSync(path.join(root, cleanAsset)), `service worker asset missing on disk: ${asset}`);
}

for (const file of fs.readdirSync(path.join(root, "lesson-packs")).filter((item) => item.endsWith(".json"))) {
  assert.ok(serviceWorkerAssets.has(`./lesson-packs/${file}`), `service worker should cache lesson-packs/${file}`);
}

const defaultPackUrls = extractStringsFromArray(app, "DEFAULT_PACK_URLS");
for (const url of defaultPackUrls) {
  assert.ok(fs.existsSync(path.join(root, url.replace(/^\.\//, ""))), `DEFAULT_PACK_URLS entry missing: ${url}`);
}

for (const pack of packIndex.packs) {
  const expectedUrl = `./lesson-packs/${path.basename(pack.url)}`;
  assert.ok(defaultPackUrls.includes(expectedUrl), `bundled DEFAULT_PACK_URLS should include ${expectedUrl}`);
}

assert.ok(app.includes("async function syncLessonPacksFromGithub"), "app should include GitHub lesson sync");
assert.ok(app.includes("async function loadRuntimeConfig"), "app should load runtime backend config");
assert.ok(app.includes("function startGithubLogin"), "app should include GitHub login flow");
assert.ok(app.includes("async function disconnectGithub"), "app should include GitHub disconnect flow");
assert.ok(app.includes("function renderGithubIntegration"), "app should render GitHub integration status");
assert.ok(app.includes("async function bootstrapCookieAccount"), "app should restore cookie-backed sessions");
assert.ok(app.includes("function renderIdea"), "app should include idea lesson renderer");
assert.ok(app.includes("async function submitLocalAuth"), "app should include offline local auth fallback");
assert.ok(app.includes("function saveLocalProgressForUser"), "app should save local account progress");
assert.ok(server.includes("/api/auth/github/start"), "server should expose GitHub OAuth start endpoint");
assert.ok(server.includes("/api/auth/github/callback"), "server should expose GitHub OAuth callback endpoint");
assert.ok(server.includes("/api/auth/github/disconnect"), "server should expose GitHub OAuth disconnect endpoint");
assert.ok(server.includes("/api/config"), "server should expose runtime config endpoint");
assert.ok(server.includes("users_github_id_unique_idx"), "server should keep GitHub ids unique");

assert.equal(capacitorConfig.appId, "io.mlingo.app", "Capacitor appId should be stable");
assert.equal(capacitorConfig.appName, "MLingo", "Capacitor appName should be stable");
assert.equal(capacitorConfig.webDir, "web", "Capacitor webDir should be web");
assert.equal(capacitorConfig.server?.androidScheme, "https", "Capacitor Android scheme should be https");

for (const script of ["test", "test:server", "test:lessons", "test:static", "test:web", "test:site", "check", "android:debug", "android:test", "cap:prepare"]) {
  assert.ok(packageJson.scripts?.[script], `package.json should define ${script}`);
}

for (const doc of ["docs/apps.md", "docs/lesson-packs.md", "docs/deploy.md", "docs/allowed-libraries.md"]) {
  assert.ok(fs.existsSync(path.join(root, doc)), `${doc} should exist`);
}

console.log("Static app tests passed.");
