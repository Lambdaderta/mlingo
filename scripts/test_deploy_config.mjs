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

const dockerfile = read("Dockerfile");
const compose = read("docker-compose.prod.yml");
const caddyfile = read("deploy/Caddyfile");
const envExample = read(".env.production.example");
const packageJson = readJson("package.json");

assert.ok(dockerfile.includes("ARG PYTHON_IMAGE="), "Dockerfile should allow base image override");
assert.ok(dockerfile.includes("USER mlingo"), "Docker image should not run the app as root");
assert.ok(dockerfile.includes("HEALTHCHECK"), "Docker image should define an app healthcheck");
assert.ok(dockerfile.includes("/api/health"), "Docker healthcheck should hit /api/health");

assert.ok(compose.includes("${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}"), "prod compose should require an explicit DB password");
assert.ok(compose.includes("POSTGRES_IMAGE"), "prod compose should allow overriding the Postgres image");
assert.ok(compose.includes("CADDY_IMAGE"), "prod compose should allow overriding the Caddy image");
assert.ok(compose.includes("PYTHON_IMAGE"), "prod compose should pass the Python image build arg");
assert.ok(compose.includes("MLINGO_ALLOWED_ORIGIN"), "prod compose should configure allowed origin");
assert.ok(compose.includes("GITHUB_OAUTH_REDIRECT_URI"), "prod compose should configure GitHub OAuth callback");
assert.ok(!compose.match(/4180:4180/), "prod compose should not publish the raw app port");
assert.ok(compose.includes('expose:\n      - "4180"'), "prod compose should expose app only to the compose network");
assert.ok(compose.includes("condition: service_healthy"), "Caddy should wait for the app healthcheck");

assert.ok(caddyfile.includes("{$SITE_DOMAIN}"), "Caddyfile should use SITE_DOMAIN from env");
assert.ok(caddyfile.includes("reverse_proxy app:4180"), "Caddy should proxy to the app service");
assert.ok(caddyfile.includes("redir https://{$SITE_DOMAIN}{uri} permanent"), "Caddy should redirect www to apex");

for (const key of ["SITE_DOMAIN", "POSTGRES_PASSWORD", "MLINGO_ALLOWED_ORIGIN", "PYTHON_IMAGE", "POSTGRES_IMAGE", "CADDY_IMAGE"]) {
  assert.ok(envExample.includes(`${key}=`), `.env.production.example should include ${key}`);
}

assert.ok(packageJson.scripts?.["test:deploy"], "package.json should define test:deploy");

console.log("Deploy config tests passed.");
