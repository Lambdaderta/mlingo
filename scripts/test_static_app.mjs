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
const pythonRunnerWorker = read("python-runner-worker.js");
const mainActivity = read("android/app/src/main/java/io/mlingo/app/MainActivity.java");
const macosApp = read("macos/MLingoApp.m");
const macosBuildScript = read("scripts/build_macos_app.sh");
const packageJson = readJson("package.json");
const capacitorConfig = readJson("capacitor.config.json");
const packIndex = readJson("lesson-packs/index.json");

assert.ok(html.includes('lang="ru"'), "index.html should declare Russian UI language");
assert.ok(html.includes('id="packSourceInput"'), "index.html should include GitHub pack source input");
assert.ok(html.includes('id="packSyncButton"'), "index.html should include GitHub pack sync button");
assert.ok(html.includes('id="packSyncShortcutButton"'), "index.html should include profile pack sync shortcut");
assert.ok(html.includes('id="packExportButton"'), "index.html should include pack export button");
assert.ok(html.includes('id="packImportButton"'), "index.html should include pack import button");
assert.ok(html.includes('id="githubLoginButton"'), "index.html should include GitHub login button");
assert.ok(html.includes('id="githubAuthHint"'), "index.html should explain GitHub auth availability");
assert.ok(!html.includes('id="authUsername"'), "index.html should not include local username auth");
assert.ok(!html.includes('id="authPassword"'), "index.html should not include password auth");
assert.ok(!html.includes('id="registerButton"'), "index.html should not include local registration button");
assert.ok(html.includes('id="githubIntegrationPanel"'), "index.html should include GitHub integrations panel");
assert.ok(html.includes('id="githubRepoEnableButton"'), "index.html should include GitHub repo mode button");
assert.ok(html.includes('id="githubTokenInput"'), "index.html should include serverless GitHub token input");
assert.ok(html.includes('id="checkUpdatesButton"'), "index.html should include update checker button");
assert.ok(html.includes('id="guideModal"'), "index.html should include welcome guide modal");
assert.ok(html.includes('id="guideButton"'), "index.html should include guide reopen button");
assert.ok(html.includes('id="reportLessonButton"'), "index.html should include lesson issue report button");
assert.ok(html.includes('id="reportAppButton"'), "index.html should include global issue report button");
assert.ok(html.includes('id="screen-review"'), "index.html should include review/discussion screen");
assert.ok(html.includes('id="reviewSolutionList"'), "index.html should include review solution list");
assert.ok(html.includes('id="theoryGrid"'), "index.html should include theory reading grid");
assert.ok(html.includes('id="lessonBrief"'), "index.html should include lesson input/output brief");
assert.ok(html.includes('id="prevButton"'), "index.html should include previous lesson button");
assert.ok(html.includes('class="settings-panel"'), "index.html should include profile settings panel");
assert.ok(html.indexOf('class="settings-panel"') < html.indexOf('id="guideButton"'), "guide reopen button should live in settings/profile, not topbar");
assert.ok(html.includes("./assets/brand/mlingo-cat-logo-512.png"), "index.html should use the MLingo cat logo in the app shell");
assert.ok(fs.existsSync(path.join(root, "assets/brand/mlingo-readme-card.png")), "README card image should exist");
assert.ok(fs.existsSync(path.join(root, "assets/brand/mlingo-cat-logo-512.png")), "app logo image should exist");

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
assert.ok(app.includes("const AUTH_REQUIRED = false"), "app should allow practice without registration in local/offline mode");
assert.ok(app.includes("function enforceAuthGate"), "app should enforce the auth gate");
assert.ok(app.includes("async function disconnectGithub"), "app should include GitHub disconnect flow");
assert.ok(app.includes("async function enableGithubRepoMode"), "app should include GitHub repo mode enable flow");
assert.ok(app.includes("async function syncSolutionIfEnabled"), "app should sync eligible solutions");
assert.ok(app.includes("async function pushProgressToGithubDirect"), "app should push progress to GitHub without backend");
assert.ok(app.includes("async function checkForUpdates"), "app should check GitHub Releases for updates");
assert.ok(app.includes("function renderGithubIntegration"), "app should render GitHub integration status");
assert.ok(app.includes("const GUIDE_SEEN_KEY"), "app should remember whether welcome guide was seen");
assert.ok(app.includes("function maybeOpenGuide"), "app should open the welcome guide on first run");
assert.ok(app.includes("const theoryChapters"), "app should include a structured built-in theory section");
assert.ok(app.includes("function renderTheoryArticle"), "app should render selected theory articles");
assert.ok(app.includes("function handleTheoryClick"), "app should switch theory topics and subtopics");
assert.ok(app.includes("function renderLessonBrief"), "app should render task input/output/example/check brief");
assert.ok(app.includes("function previousLesson"), "app should navigate to previous lessons");
assert.ok(app.includes("theory-code"), "theory section should include implementation code examples");
assert.ok(app.includes("async function bootstrapCookieAccount"), "app should restore cookie-backed sessions");
assert.ok(app.includes("function renderIdea"), "app should include idea lesson renderer");
assert.ok(app.includes("function openIssueReport"), "app should include GitHub issue reporting");
assert.ok(app.includes("async function fetchReviewSolutions"), "app should include public solution review list");
assert.ok(app.includes("async function postReviewComment"), "app should include review comments");
assert.ok(app.includes("Скрытые тесты"), "lesson brief should expose hidden-test language for runner tasks");
assert.ok(app.includes("function isCodeBriefLesson"), "lesson brief should only use LeetCode-style rows for code tasks");
assert.ok(app.includes("Для задач с запуском кода нужен GitHub-вход"), "runner tasks should require GitHub login before execution");
assert.ok(app.includes("PYODIDE_LOCAL_SCRIPT"), "app should define a local Pyodide source");
assert.ok(app.includes("function runPythonLessonTests"), "app should include browser Python test runner support");
assert.ok(app.includes("trustedRunner"), "app should mark trusted bundled lessons for runner tests");
assert.ok(pythonRunnerWorker.includes("loadPyodide"), "python-runner-worker should load Pyodide");
assert.ok(pythonRunnerWorker.includes("__mlingo_setup_code"), "python-runner-worker should execute lesson setup code");
assert.ok(pythonRunnerWorker.includes("__mlingo_test_code"), "python-runner-worker should execute lesson tests");
assert.ok(serviceWorkerAssets.has("./python-runner-worker.js"), "service worker should cache python-runner-worker.js");
assert.ok(!app.includes("async function submitLocalAuth"), "app should not include local auth fallback");
assert.ok(!app.includes("LOCAL_USERS_KEY"), "app should not persist local password accounts");
assert.ok(server.includes("/api/auth/github/start"), "server should expose GitHub OAuth start endpoint");
assert.ok(server.includes("/api/auth/github/callback"), "server should expose GitHub OAuth callback endpoint");
assert.ok(server.includes("/api/auth/github/disconnect"), "server should expose GitHub OAuth disconnect endpoint");
assert.ok(server.includes("Локальная регистрация отключена"), "server should disable password registration");
assert.ok(server.includes("Вход по паролю отключен"), "server should disable password login");
assert.ok(server.includes("/api/github/repo/enable"), "server should expose GitHub repo mode endpoint");
assert.ok(server.includes("/api/github/solutions"), "server should expose GitHub solution sync endpoint");
assert.ok(server.includes("create table if not exists solutions"), "server should persist review queue solutions");
assert.ok(server.includes("create table if not exists solution_comments"), "server should persist review comments");
assert.ok(server.includes("/api/review/solutions"), "server should expose public solution review endpoints");
assert.ok(server.includes("/api/config"), "server should expose runtime config endpoint");
assert.ok(mainActivity.includes("SYSTEM_UI_FLAG_IMMERSIVE_STICKY"), "Android app should hide navigation bars on older devices");
assert.ok(mainActivity.includes("WindowInsets.Type.navigationBars"), "Android app should hide navigation bars on modern devices");
assert.ok(macosApp.includes("WKWebView"), "macOS app should embed the web app in WKWebView");
assert.ok(macosApp.includes("setMainMenu"), "macOS app should install a native menu bar");
assert.ok(macosApp.includes("applicationShouldHandleReopen"), "macOS app should reopen from Dock like a native app");
assert.ok(macosApp.includes("setFrameAutosaveName"), "macOS app should remember its window frame");
assert.ok(macosBuildScript.includes("CFBundleShortVersionString $APP_VERSION"), "macOS bundle version should follow package.json");
assert.ok(macosBuildScript.includes("MLingo.icns"), "macOS build should copy the app icon");
assert.ok(macosBuildScript.includes("codesign --force --deep --sign -"), "macOS build should ad-hoc sign the app");
assert.ok(macosBuildScript.includes("hdiutil create"), "macOS build should produce a DMG artifact");
assert.ok(fs.existsSync(path.join(root, "macos/MLingo.icns")), "macOS icns icon should exist");
assert.ok(server.includes("users_github_id_unique_idx"), "server should keep GitHub ids unique");

assert.equal(capacitorConfig.appId, "io.mlingo.app", "Capacitor appId should be stable");
assert.equal(capacitorConfig.appName, "MLingo", "Capacitor appName should be stable");
assert.equal(capacitorConfig.webDir, "web", "Capacitor webDir should be web");
assert.equal(capacitorConfig.server?.androidScheme, "https", "Capacitor Android scheme should be https");

for (const script of ["test", "test:server", "test:auth", "test:lessons", "test:static", "test:web", "test:site", "check", "android:debug", "android:test", "macos:build", "cap:prepare"]) {
  assert.ok(packageJson.scripts?.[script], `package.json should define ${script}`);
}

for (const doc of ["docs/apps.md", "docs/lesson-packs.md", "docs/deploy.md", "docs/allowed-libraries.md", "docs/github-sync.md"]) {
  assert.ok(fs.existsSync(path.join(root, doc)), `${doc} should exist`);
}

console.log("Static app tests passed.");
