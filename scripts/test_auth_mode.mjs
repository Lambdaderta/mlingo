import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

const html = read("index.html");
const app = read("app.js");
const server = read("server.py");
const syncStart = app.indexOf("async function syncLessonPacksFromGithub");
const syncEnd = app.indexOf("async function fetchJson", syncStart);
assert.notEqual(syncStart, -1, "GitHub lesson pack sync function should exist");
assert.notEqual(syncEnd, -1, "fetchJson should follow GitHub lesson pack sync");
const syncSource = app.slice(syncStart, syncEnd);

assert.ok(app.includes("const AUTH_REQUIRED = false"), "practice should be available without registration for local/offline builds");
assert.ok(app.includes("function enforceAuthGate"), "auth gate function should stay in place for easy hosted-mode re-enable");
assert.ok(!html.includes("Вход обязателен"), "auth copy should not claim GitHub login is mandatory");
assert.ok(html.includes("GitHub-вход можно подключить позже."), "auth modal should explain optional GitHub login");
assert.ok(html.includes('id="githubLoginButton"'), "optional GitHub login button should remain available");
assert.ok(app.includes('if (authResult === "github-error")'), "GitHub callback error branch should be handled");
assert.ok(app.includes('showAuthStatus("GitHub не смог авторизовать вход. Попробуй еще раз.")'), "GitHub callback errors should show a user-facing message");
assert.ok(syncSource.includes("fetchJson(indexUrl)"), "GitHub lesson pack sync should fetch raw index.json directly");
assert.ok(!syncSource.includes("apiRequest"), "GitHub lesson pack sync should not require backend auth");
assert.ok(!syncSource.includes("currentUser"), "GitHub lesson pack sync should not require registration");
assert.ok(!html.includes('id="authUsername"'), "local username registration should stay removed");
assert.ok(!html.includes('id="authPassword"'), "password registration should stay removed");
assert.ok(!app.includes("async function submitLocalAuth"), "client should not revive local password auth");
assert.ok(server.includes("Локальная регистрация отключена"), "backend password registration should stay disabled");
assert.ok(server.includes("Вход по паролю отключен"), "backend password login should stay disabled");

console.log("Auth mode tests passed.");
