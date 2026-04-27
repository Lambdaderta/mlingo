#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import http.cookies
import json
import os
import re
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://mlingo:mlingo@localhost:5432/mlingo")
ALLOWED_ORIGIN = os.environ.get("MLINGO_ALLOWED_ORIGIN", "")
SESSION_TTL = 60 * 60 * 24 * 30
PBKDF2_ITERATIONS = 220_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "").strip()
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "").strip()
GITHUB_OAUTH_REDIRECT_URI = os.environ.get("GITHUB_OAUTH_REDIRECT_URI", "").strip()
GITHUB_OAUTH_SCOPES = os.environ.get("GITHUB_OAUTH_SCOPES", "read:user user:email public_repo").strip()
GITHUB_SOLUTIONS_REPO_NAME = os.environ.get("GITHUB_SOLUTIONS_REPO_NAME", "mlingo-solutions").strip()
GITHUB_STATE_COOKIE = "mlingo_github_state"
GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"
OAUTH_STATE_TTL = 60 * 10
REPO_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


def now_ts():
    return int(time.time())


def json_dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def utc_stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def db_connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db():
    with db_connect() as db:
        db.execute(
            """
            create table if not exists users (
              id bigserial primary key,
              username text not null unique,
              email text,
              password_hash text,
              auth_provider text not null default 'password',
              github_id bigint,
              github_login text,
              github_avatar_url text,
              github_access_token text,
              github_scope text,
              github_repo_name text not null default 'mlingo-solutions',
              github_repo_full_name text,
              github_repo_enabled boolean not null default false,
              github_repo_connected_at bigint,
              created_at bigint not null
            )
            """
        )
        db.execute("alter table users add column if not exists email text")
        db.execute("alter table users alter column password_hash drop not null")
        db.execute("alter table users add column if not exists auth_provider text not null default 'password'")
        db.execute("alter table users add column if not exists github_id bigint")
        db.execute("alter table users add column if not exists github_login text")
        db.execute("alter table users add column if not exists github_avatar_url text")
        db.execute("alter table users add column if not exists github_access_token text")
        db.execute("alter table users add column if not exists github_scope text")
        db.execute("alter table users add column if not exists github_repo_name text not null default 'mlingo-solutions'")
        db.execute("alter table users add column if not exists github_repo_full_name text")
        db.execute("alter table users add column if not exists github_repo_enabled boolean not null default false")
        db.execute("alter table users add column if not exists github_repo_connected_at bigint")
        db.execute(
            """
            create table if not exists sessions (
              token text primary key,
              user_id bigint not null references users(id) on delete cascade,
              created_at bigint not null,
              expires_at bigint not null
            )
            """
        )
        db.execute(
            """
            create table if not exists progress (
              user_id bigint primary key references users(id) on delete cascade,
              state_json jsonb not null,
              xp integer not null default 0,
              streak integer not null default 0,
              completed_count integer not null default 0,
              miss_count integer not null default 0,
              updated_at bigint not null
            )
            """
        )
        db.execute(
            """
            create table if not exists events (
              id bigserial primary key,
              user_id bigint not null references users(id) on delete cascade,
              lesson_id text not null,
              correct boolean not null,
              xp_delta integer not null default 0,
              created_at bigint not null
            )
            """
        )
        db.execute(
            """
            create table if not exists solutions (
              id bigserial primary key,
              user_id bigint not null references users(id) on delete cascade,
              lesson_id text not null,
              lesson_title text not null,
              topic_id text,
              topic_title text,
              kind text not null,
              answer_text text not null,
              github_repo text,
              github_path text,
              github_commit_sha text,
              github_html_url text,
              status text not null default 'queued_for_review',
              created_at bigint not null
            )
            """
        )
        db.execute("create index if not exists sessions_user_id_idx on sessions(user_id)")
        db.execute("create index if not exists sessions_expires_at_idx on sessions(expires_at)")
        db.execute("create index if not exists events_user_created_idx on events(user_id, created_at desc)")
        db.execute("create index if not exists solutions_created_idx on solutions(created_at desc)")
        db.execute("create index if not exists solutions_lesson_idx on solutions(lesson_id, created_at desc)")
        db.execute("create index if not exists progress_leaderboard_idx on progress(xp desc, streak desc, completed_count desc, updated_at asc)")
        db.execute("create unique index if not exists users_email_lower_unique_idx on users (lower(email)) where email is not null")
        db.execute("create unique index if not exists users_github_id_unique_idx on users (github_id) where github_id is not null")


def read_json(handler):
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        raise ValueError("Некорректный JSON")


def normalize_username(value):
    return "".join(ch for ch in value.strip().lower() if ch.isalnum() or ch in "_-.")


def normalize_email(value):
    return value.strip().lower()


def is_valid_email(value):
    return 5 <= len(value) <= 254 and bool(EMAIL_RE.match(value))


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password, stored):
    try:
        algo, iterations, salt_b64, digest_b64 = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def empty_progress_state():
    return {"xp": 0, "streak": 0, "completed": {}, "completedDates": {}, "misses": {}}


def state_stats(state):
    completed = state.get("completed") or {}
    misses = state.get("misses") or {}
    completed_dates = state.get("completedDates") or {}
    completed_count = sum(1 for value in completed.values() if value)
    miss_count = sum(int(value or 0) for value in misses.values())
    xp = completed_count * 12

    done_days = {value for value in completed_dates.values() if isinstance(value, str)}
    streak = 0
    cursor = date.today()
    if cursor.isoformat() not in done_days:
        cursor = cursor - timedelta(days=1)
    while cursor.isoformat() in done_days:
        streak += 1
        cursor = cursor - timedelta(days=1)

    state["xp"] = xp
    state["streak"] = streak
    return xp, streak, completed_count, miss_count


def public_user(row):
    user = {
        "id": row["id"],
        "username": row["username"],
        "email": row.get("email"),
        "hasPassword": bool(row.get("password_hash")),
        "createdAt": row["created_at"],
    }
    if row.get("github_id"):
        repo_name = row.get("github_repo_name") or GITHUB_SOLUTIONS_REPO_NAME
        repo_full_name = row.get("github_repo_full_name") or (f"{row.get('github_login')}/{repo_name}" if row.get("github_login") else None)
        user["github"] = {
            "id": row.get("github_id"),
            "login": row.get("github_login"),
            "avatarUrl": row.get("github_avatar_url"),
            "canWriteRepo": github_has_repo_scope(row.get("github_scope")),
            "repo": {
                "enabled": bool(row.get("github_repo_enabled")),
                "name": repo_name,
                "fullName": repo_full_name,
                "url": f"https://github.com/{repo_full_name}" if repo_full_name else None,
            },
        }
    return user


def parse_state_json(value):
    if isinstance(value, str):
        return json.loads(value)
    if isinstance(value, dict):
        return value
    return empty_progress_state()


def get_progress(db, user_id):
    row = db.execute("select * from progress where user_id = %s", (user_id,)).fetchone()
    if not row:
        return {
            "state": empty_progress_state(),
            "xp": 0,
            "streak": 0,
            "completedCount": 0,
            "missCount": 0,
            "updatedAt": None,
        }
    state = parse_state_json(row["state_json"])
    return {
        "state": state,
        "xp": row["xp"],
        "streak": row["streak"],
        "completedCount": row["completed_count"],
        "missCount": row["miss_count"],
        "updatedAt": row["updated_at"],
    }


def save_progress(db, user_id, state):
    if not isinstance(state, dict):
        raise ValueError("state должен быть объектом")
    state.setdefault("completed", {})
    state.setdefault("completedDates", {})
    state.setdefault("misses", {})
    xp, streak, completed_count, miss_count = state_stats(state)
    updated_at = now_ts()
    db.execute(
        """
        insert into progress (user_id, state_json, xp, streak, completed_count, miss_count, updated_at)
        values (%s, %s, %s, %s, %s, %s, %s)
        on conflict(user_id) do update set
          state_json = excluded.state_json,
          xp = excluded.xp,
          streak = excluded.streak,
          completed_count = excluded.completed_count,
          miss_count = excluded.miss_count,
          updated_at = excluded.updated_at
        """,
        (user_id, Jsonb(state), xp, streak, completed_count, miss_count, updated_at),
    )
    return get_progress(db, user_id)


def leaderboard(db, limit=20):
    rows = db.execute(
        """
        select u.username, p.xp, p.streak, p.completed_count, p.miss_count, p.updated_at
        from progress p
        join users u on u.id = p.user_id
        order by p.xp desc, p.streak desc, p.completed_count desc, p.updated_at asc
        limit %s
        """,
        (limit,),
    ).fetchall()
    return [
        {
            "rank": index + 1,
            "username": row["username"],
            "xp": row["xp"],
            "streak": row["streak"],
            "completedCount": row["completed_count"],
            "missCount": row["miss_count"],
            "updatedAt": row["updated_at"],
        }
        for index, row in enumerate(rows)
    ]


def cleanup_sessions(db):
    db.execute("delete from sessions where expires_at <= %s", (now_ts(),))


def github_oauth_configured():
    return bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)


def github_has_repo_scope(scope_text):
    scopes = {item for item in re.split(r"[\s,]+", str(scope_text or "")) if item}
    return "repo" in scopes or "public_repo" in scopes


def github_repo_write_configured():
    return github_has_repo_scope(GITHUB_OAUTH_SCOPES)


def normalize_repo_name(value):
    repo_name = str(value or GITHUB_SOLUTIONS_REPO_NAME or "mlingo-solutions").strip()
    if not REPO_NAME_RE.match(repo_name):
        raise ValueError("Название GitHub repo должно содержать только буквы, цифры, точку, _ или -")
    return repo_name


def github_json_request(url, token=None, data=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "MLingo",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    raw_data = None
    if data is not None:
        raw_data = urlencode(data).encode("utf-8")
        headers["Accept"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=raw_data, headers=headers)
    try:
        with urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub вернул {exc.code}: {detail[:180]}") from exc
    except URLError as exc:
        raise RuntimeError(f"GitHub недоступен: {exc.reason}") from exc


def github_api_request(method, api_path, token, payload=None, allow_404=False):
    url = api_path if api_path.startswith("http") else f"{GITHUB_API_URL}{api_path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "MLingo",
        "X-GitHub-Api-Version": "2022-11-28",
        "Authorization": f"Bearer {token}",
    }
    raw_data = None
    if payload is not None:
        raw_data = json_dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=raw_data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=18) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if allow_404 and exc.code == 404:
            return None
        raise RuntimeError(f"GitHub вернул {exc.code}: {detail[:180]}") from exc
    except URLError as exc:
        raise RuntimeError(f"GitHub недоступен: {exc.reason}") from exc


def ensure_github_repo(user, repo_name):
    access_token = user.get("github_access_token")
    if not user.get("github_login") or not access_token:
        raise ValueError("GitHub подключен без write-token. Переподключи GitHub с правом public_repo")
    if not github_has_repo_scope(user.get("github_scope")):
        raise ValueError("Для repo mode нужен scope public_repo или repo")
    repo_name = normalize_repo_name(repo_name)
    owner = user["github_login"]
    existing = github_api_request("GET", f"/repos/{quote(owner)}/{quote(repo_name)}", access_token, allow_404=True)
    if existing:
        return existing
    return github_api_request(
        "POST",
        "/user/repos",
        access_token,
        {
            "name": repo_name,
            "description": "MLingo solutions exported from practice sessions.",
            "private": False,
            "auto_init": True,
        },
    )


def put_github_solution_file(user, repo_full_name, path, content, message):
    access_token = user.get("github_access_token")
    if not access_token:
        raise ValueError("GitHub write-token не найден")
    encoded_path = quote(path)
    current = github_api_request("GET", f"/repos/{repo_full_name}/contents/{encoded_path}", access_token, allow_404=True)
    payload = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
    }
    if current and current.get("sha"):
        payload["sha"] = current["sha"]
    return github_api_request("PUT", f"/repos/{repo_full_name}/contents/{encoded_path}", access_token, payload)


def slugify(value, fallback="item"):
    slug = re.sub(r"[^a-z0-9._-]+", "-", str(value or "").lower()).strip("-._")
    return slug[:80] or fallback


def build_solution_markdown(user, payload):
    answer = str(payload.get("answer") or "").strip()
    prompt = str(payload.get("prompt") or "").strip()
    lesson_title = str(payload.get("lessonTitle") or payload.get("lessonId") or "MLingo task").strip()
    topic_title = str(payload.get("topicTitle") or "MLingo").strip()
    kind = str(payload.get("kind") or "solution").strip()
    language = "markdown" if kind == "idea" else "python"
    fence = "````" if "```" in answer else "```"
    review_checklist = payload.get("reviewChecklist") if isinstance(payload.get("reviewChecklist"), list) else []
    checklist = review_checklist or [
        "Проверь корректность validation и отсутствие leakage.",
        "Проверь shape/dtype/device контракты.",
        "Проверь читаемость, разбиение на функции и воспроизводимость.",
    ]
    return f"""# {lesson_title}

- Автор: @{user.get("github_login") or user.get("username")}
- Тема: {topic_title}
- Тип задания: {kind}
- Экспортировано: {datetime.now(timezone.utc).isoformat(timespec="seconds")}

## Условие

{prompt or "Условие не сохранено в payload."}

## Решение

{fence}{language}
{answer}
{fence}

## Review checklist

{chr(10).join(f"- {item}" for item in checklist)}
"""


def pick_verified_github_email(emails):
    primary_verified = [
        item.get("email")
        for item in emails
        if item.get("verified") and item.get("primary") and item.get("email")
    ]
    if primary_verified:
        return normalize_email(primary_verified[0])
    verified = [item.get("email") for item in emails if item.get("verified") and item.get("email")]
    return normalize_email(verified[0]) if verified else None


def unique_github_username(db, login, github_id):
    base = normalize_username(login or "") or f"github-{github_id}"
    base = base[:24].strip(".-_") or f"github-{github_id}"
    candidate = base
    suffix = 0
    while True:
        existing = db.execute("select github_id from users where username = %s", (candidate,)).fetchone()
        if not existing or existing.get("github_id") == github_id:
            return candidate
        suffix += 1
        tail = f"-gh{str(github_id)[-4:]}{suffix if suffix > 1 else ''}"
        candidate = f"{base[:24 - len(tail)]}{tail}"


def upsert_github_user(db, profile, email, access_token=None, scope_text=""):
    github_id = int(profile["id"])
    github_login = str(profile.get("login") or f"github-{github_id}")
    avatar_url = profile.get("avatar_url")
    current = now_ts()
    write_token = access_token if github_has_repo_scope(scope_text) else None
    stored_scope = scope_text if write_token else None
    existing = db.execute("select * from users where github_id = %s", (github_id,)).fetchone()
    if existing:
        row = db.execute(
            """
            update users
            set email = coalesce(%s, email),
                github_login = %s,
                github_avatar_url = %s,
                github_access_token = coalesce(%s, github_access_token),
                github_scope = coalesce(%s, github_scope),
                auth_provider = case when password_hash is null then 'github' else auth_provider end
            where id = %s
            returning *
            """,
            (email, github_login, avatar_url, write_token, stored_scope, existing["id"]),
        ).fetchone()
        return row

    linked = None
    if email:
        linked = db.execute("select * from users where lower(email) = lower(%s)", (email,)).fetchone()
    if linked and not linked.get("github_id"):
        return db.execute(
            """
            update users
            set github_id = %s,
                github_login = %s,
                github_avatar_url = %s,
                github_access_token = %s,
                github_scope = %s,
                auth_provider = case when password_hash is null then 'github' else auth_provider end
            where id = %s
            returning *
            """,
            (github_id, github_login, avatar_url, write_token, stored_scope, linked["id"]),
        ).fetchone()
    if linked and linked.get("github_id") != github_id:
        email = None

    username = unique_github_username(db, github_login, github_id)
    return db.execute(
        """
        insert into users (username, email, password_hash, auth_provider, github_id, github_login, github_avatar_url, github_access_token, github_scope, github_repo_name, created_at)
        values (%s, %s, null, 'github', %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (username, email, github_id, github_login, avatar_url, write_token, stored_scope, GITHUB_SOLUTIONS_REPO_NAME, current),
    ).fetchone()


class MLingoHandler(SimpleHTTPRequestHandler):
    server_version = "MLingo/0.2"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        origin = self.headers.get("Origin")
        allowed_origin = ALLOWED_ORIGIN or origin or "*"
        if ALLOWED_ORIGIN and ALLOWED_ORIGIN != "*" and origin and origin != ALLOWED_ORIGIN:
            allowed_origin = ALLOWED_ORIGIN
        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Credentials", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api("GET")
            return
        static_path = urlparse(self.path).path
        if static_path == "/app":
            original_path = self.path
            self.path = "/index.html"
            try:
                super().do_GET()
            finally:
                self.path = original_path
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.handle_api("POST")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.handle_api("PUT")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def send_json(self, status, payload, token=None, clear_cookie=False):
        raw = json_dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        if token:
            self.send_header("Set-Cookie", f"mlingo_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}")
        if clear_cookie:
            self.send_header("Set-Cookie", "mlingo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        self.end_headers()
        self.wfile.write(raw)

    def send_error_json(self, status, message):
        self.send_json(status, {"ok": False, "error": message})

    def send_redirect(self, location, token=None, state=None, clear_state=False):
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Location", location)
        if token:
            self.send_header("Set-Cookie", f"mlingo_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}")
        if state:
            self.send_header("Set-Cookie", f"{GITHUB_STATE_COOKIE}={state}; Path=/; HttpOnly; SameSite=Lax; Max-Age={OAUTH_STATE_TTL}")
        if clear_state:
            self.send_header("Set-Cookie", f"{GITHUB_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        self.end_headers()

    def auth_token(self):
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        cookie = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        if "mlingo_session" in cookie:
            return cookie["mlingo_session"].value
        return None

    def current_user(self, db):
        token = self.auth_token()
        if not token:
            return None
        return db.execute(
            """
            select u.* from sessions s
            join users u on u.id = s.user_id
            where s.token = %s and s.expires_at > %s
            """,
            (token, now_ts()),
        ).fetchone()

    def require_user(self, db):
        user = self.current_user(db)
        if not user:
            self.send_error_json(HTTPStatus.UNAUTHORIZED, "Нужно войти в аккаунт")
            return None
        return user

    def create_session(self, db, user_id):
        token = secrets.token_urlsafe(32)
        current = now_ts()
        db.execute(
            "insert into sessions (token, user_id, created_at, expires_at) values (%s, %s, %s, %s)",
            (token, user_id, current, current + SESSION_TTL),
        )
        return token

    def cookie_value(self, name):
        cookie = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        if name in cookie:
            return cookie[name].value
        return None

    def external_url(self, path):
        if path == "/api/auth/github/callback" and GITHUB_OAUTH_REDIRECT_URI:
            return GITHUB_OAUTH_REDIRECT_URI
        proto = self.headers.get("X-Forwarded-Proto") or "http"
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or f"localhost:{self.server.server_port}"
        return f"{proto}://{host}{path}"

    def handle_github_start(self):
        if not github_oauth_configured():
            self.send_error_json(HTTPStatus.SERVICE_UNAVAILABLE, "GitHub OAuth не настроен на сервере")
            return
        state = secrets.token_urlsafe(32)
        params = {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": self.external_url("/api/auth/github/callback"),
            "scope": GITHUB_OAUTH_SCOPES,
            "state": state,
        }
        self.send_redirect(f"{GITHUB_AUTH_URL}?{urlencode(params)}", state=state)

    def handle_github_callback(self, db, parsed_url):
        if not github_oauth_configured():
            self.send_error_json(HTTPStatus.SERVICE_UNAVAILABLE, "GitHub OAuth не настроен на сервере")
            return
        query = parse_qs(parsed_url.query)
        code = str((query.get("code") or [""])[0])
        state = str((query.get("state") or [""])[0])
        expected_state = self.cookie_value(GITHUB_STATE_COOKIE)
        if not code or not state or not expected_state or not hmac.compare_digest(state, expected_state):
            self.send_redirect("/app?auth=github-error", clear_state=True)
            return

        token_payload = github_json_request(
            GITHUB_TOKEN_URL,
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": self.external_url("/api/auth/github/callback"),
            },
        )
        access_token = token_payload.get("access_token")
        if not access_token:
            self.send_redirect("/app?auth=github-error", clear_state=True)
            return
        scope_text = str(token_payload.get("scope") or "")

        profile = github_json_request(f"{GITHUB_API_URL}/user", token=access_token)
        email = normalize_email(str(profile.get("email") or "")) or None
        if not email:
            emails = github_json_request(f"{GITHUB_API_URL}/user/emails", token=access_token)
            email = pick_verified_github_email(emails if isinstance(emails, list) else [])
        user = upsert_github_user(db, profile, email, access_token, scope_text)
        save_progress(db, user["id"], get_progress(db, user["id"])["state"])
        token = self.create_session(db, user["id"])
        self.send_redirect("/app?auth=github", token=token, clear_state=True)

    def handle_api(self, method):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        try:
            with db_connect() as db:
                if path == "/api/auth/github/start" and method == "GET":
                    self.handle_github_start()
                    return

                if path == "/api/auth/github/callback" and method == "GET":
                    self.handle_github_callback(db, parsed_url)
                    return

                if path == "/api/auth/github/disconnect" and method == "POST":
                    user = self.require_user(db)
                    if not user:
                        return
                    if not user.get("github_id"):
                        self.send_json(HTTPStatus.OK, {"ok": True, "user": public_user(user)})
                        return
                    if not user.get("password_hash"):
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Сначала нужен вход по паролю, иначе аккаунт потеряет единственный способ входа")
                        return
                    user = db.execute(
                        """
                        update users
                        set github_id = null,
                            github_login = null,
                            github_avatar_url = null,
                            github_access_token = null,
                            github_scope = null,
                            github_repo_full_name = null,
                            github_repo_enabled = false,
                            github_repo_connected_at = null,
                            auth_provider = 'password'
                        where id = %s
                        returning *
                        """,
                        (user["id"],),
                    ).fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "user": public_user(user)})
                    return

                if path == "/api/github/repo/enable" and method == "POST":
                    user = self.require_user(db)
                    if not user:
                        return
                    payload = read_json(self)
                    repo_name = normalize_repo_name(payload.get("repoName") or user.get("github_repo_name") or GITHUB_SOLUTIONS_REPO_NAME)
                    repo = ensure_github_repo(user, repo_name)
                    user = db.execute(
                        """
                        update users
                        set github_repo_name = %s,
                            github_repo_full_name = %s,
                            github_repo_enabled = true,
                            github_repo_connected_at = %s
                        where id = %s
                        returning *
                        """,
                        (repo["name"], repo["full_name"], now_ts(), user["id"]),
                    ).fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "user": public_user(user), "repo": public_user(user)["github"]["repo"]})
                    return

                if path == "/api/github/repo/disable" and method == "POST":
                    user = self.require_user(db)
                    if not user:
                        return
                    user = db.execute(
                        """
                        update users
                        set github_repo_enabled = false
                        where id = %s
                        returning *
                        """,
                        (user["id"],),
                    ).fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "user": public_user(user)})
                    return

                if path == "/api/github/solutions" and method == "POST":
                    user = self.require_user(db)
                    if not user:
                        return
                    if not user.get("github_repo_enabled"):
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Сначала включи GitHub repo mode в профиле")
                        return
                    payload = read_json(self)
                    answer = str(payload.get("answer") or "").strip()
                    lesson_id = str(payload.get("lessonId") or "").strip()
                    lesson_title = str(payload.get("lessonTitle") or lesson_id or "MLingo task").strip()
                    kind = str(payload.get("kind") or "solution").strip()
                    if not lesson_id or not answer:
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Нужны lessonId и answer")
                        return
                    repo_full_name = user.get("github_repo_full_name") or f"{user.get('github_login')}/{user.get('github_repo_name') or GITHUB_SOLUTIONS_REPO_NAME}"
                    path_slug = slugify(lesson_id, "lesson")
                    file_path = f"solutions/{path_slug}/{utc_stamp()}-{secrets.token_hex(3)}.md"
                    markdown = build_solution_markdown(user, payload)
                    result = put_github_solution_file(
                        user,
                        repo_full_name,
                        file_path,
                        markdown,
                        f"Add MLingo solution for {lesson_id}",
                    )
                    content = result.get("content") or {}
                    commit = result.get("commit") or {}
                    row = db.execute(
                        """
                        insert into solutions (
                          user_id, lesson_id, lesson_title, topic_id, topic_title, kind,
                          answer_text, github_repo, github_path, github_commit_sha, github_html_url, status, created_at
                        )
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'queued_for_review', %s)
                        returning *
                        """,
                        (
                            user["id"],
                            lesson_id,
                            lesson_title,
                            str(payload.get("topicId") or ""),
                            str(payload.get("topicTitle") or ""),
                            kind,
                            answer,
                            repo_full_name,
                            file_path,
                            commit.get("sha"),
                            content.get("html_url"),
                            now_ts(),
                        ),
                    ).fetchone()
                    self.send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "solution": {
                                "id": row["id"],
                                "lessonId": row["lesson_id"],
                                "githubRepo": row["github_repo"],
                                "githubPath": row["github_path"],
                                "githubUrl": row["github_html_url"],
                                "status": row["status"],
                            },
                        },
                    )
                    return

                if path == "/api/health" and method == "GET":
                    db.execute("select 1").fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "database": "postgres"})
                    return

                if path == "/api/config" and method == "GET":
                    self.send_json(HTTPStatus.OK, {"ok": True, "githubOAuth": github_oauth_configured(), "githubRepoWrite": github_repo_write_configured()})
                    return

                if path == "/api/check-username" and method == "GET":
                    query = parse_qs(parsed_url.query)
                    username = normalize_username(str((query.get("username") or [""])[0]))
                    if len(username) < 3 or len(username) > 24:
                        self.send_json(HTTPStatus.OK, {"ok": True, "username": username, "available": False, "message": "3-24 символа: буквы, цифры, _-."})
                        return
                    exists = db.execute("select 1 from users where username = %s", (username,)).fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "username": username, "available": not bool(exists), "message": "Свободен" if not exists else "Уже занят"})
                    return

                if path == "/api/check-email" and method == "GET":
                    query = parse_qs(parsed_url.query)
                    email = normalize_email(str((query.get("email") or [""])[0]))
                    if not is_valid_email(email):
                        self.send_json(HTTPStatus.OK, {"ok": True, "email": email, "available": False, "message": "Нужна рабочая почта"})
                        return
                    exists = db.execute("select 1 from users where lower(email) = lower(%s)", (email,)).fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "email": email, "available": not bool(exists), "message": "Почта свободна" if not exists else "Почта уже занята"})
                    return

                if path == "/api/register" and method == "POST":
                    payload = read_json(self)
                    username = normalize_username(str(payload.get("username", "")))
                    email = normalize_email(str(payload.get("email", "")))
                    password = str(payload.get("password", ""))
                    if len(username) < 3 or len(username) > 24:
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Логин: 3-24 символа, буквы/цифры/_-.")
                        return
                    if not is_valid_email(email):
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Введи нормальную почту для восстановления и синхронизации")
                        return
                    if len(password) < 6:
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Пароль должен быть минимум 6 символов")
                        return
                    existing = db.execute(
                        "select username, email from users where username = %s or lower(email) = lower(%s)",
                        (username, email),
                    ).fetchone()
                    if existing:
                        if existing["username"] == username:
                            self.send_error_json(HTTPStatus.CONFLICT, "Такой логин уже занят")
                            return
                        self.send_error_json(HTTPStatus.CONFLICT, "Такая почта уже занята")
                        return
                    user = db.execute(
                        """
                        insert into users (username, email, password_hash, created_at)
                        values (%s, %s, %s, %s)
                        returning *
                        """,
                        (username, email, hash_password(password), now_ts()),
                    ).fetchone()
                    save_progress(db, user["id"], empty_progress_state())
                    token = self.create_session(db, user["id"])
                    self.send_json(HTTPStatus.OK, {"ok": True, "token": token, "user": public_user(user), "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)}, token=token)
                    return

                if path == "/api/login" and method == "POST":
                    payload = read_json(self)
                    identity = str(payload.get("username", "")).strip()
                    password = str(payload.get("password", ""))
                    if "@" in identity:
                        email = normalize_email(identity)
                        user = db.execute("select * from users where lower(email) = lower(%s)", (email,)).fetchone()
                    else:
                        username = normalize_username(identity)
                        user = db.execute("select * from users where username = %s", (username,)).fetchone()
                    if not user or not user.get("password_hash") or not verify_password(password, user["password_hash"]):
                        self.send_error_json(HTTPStatus.UNAUTHORIZED, "Неверный логин или пароль")
                        return
                    token = self.create_session(db, user["id"])
                    self.send_json(HTTPStatus.OK, {"ok": True, "token": token, "user": public_user(user), "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)}, token=token)
                    return

                if path == "/api/logout" and method == "POST":
                    token = self.auth_token()
                    if token:
                        db.execute("delete from sessions where token = %s", (token,))
                    self.send_json(HTTPStatus.OK, {"ok": True}, clear_cookie=True)
                    return

                if path == "/api/me" and method == "GET":
                    user = self.require_user(db)
                    if not user:
                        return
                    self.send_json(HTTPStatus.OK, {"ok": True, "user": public_user(user), "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)})
                    return

                if path == "/api/progress" and method in {"GET", "PUT"}:
                    user = self.require_user(db)
                    if not user:
                        return
                    if method == "GET":
                        self.send_json(HTTPStatus.OK, {"ok": True, "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)})
                        return
                    payload = read_json(self)
                    progress = save_progress(db, user["id"], payload.get("state") or {})
                    self.send_json(HTTPStatus.OK, {"ok": True, "progress": progress, "leaderboard": leaderboard(db)})
                    return

                if path == "/api/event" and method == "POST":
                    user = self.require_user(db)
                    if not user:
                        return
                    payload = read_json(self)
                    db.execute(
                        "insert into events (user_id, lesson_id, correct, xp_delta, created_at) values (%s, %s, %s, %s, %s)",
                        (user["id"], str(payload.get("lessonId", "")), bool(payload.get("correct")), int(payload.get("xpDelta") or 0), now_ts()),
                    )
                    self.send_json(HTTPStatus.OK, {"ok": True})
                    return

                if path == "/api/leaderboard" and method == "GET":
                    self.send_json(HTTPStatus.OK, {"ok": True, "leaderboard": leaderboard(db)})
                    return

                if path == "/api/review/solutions" and method == "GET":
                    rows = db.execute(
                        """
                        select s.id, s.lesson_id, s.lesson_title, s.topic_title, s.kind, s.github_html_url,
                               s.status, s.created_at, u.username, u.github_login
                        from solutions s
                        join users u on u.id = s.user_id
                        order by s.created_at desc
                        limit 50
                        """
                    ).fetchall()
                    self.send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "solutions": [
                                {
                                    "id": row["id"],
                                    "lessonId": row["lesson_id"],
                                    "lessonTitle": row["lesson_title"],
                                    "topicTitle": row["topic_title"],
                                    "kind": row["kind"],
                                    "githubUrl": row["github_html_url"],
                                    "status": row["status"],
                                    "createdAt": row["created_at"],
                                    "author": row["github_login"] or row["username"],
                                }
                                for row in rows
                            ],
                        },
                    )
                    return

            self.send_error_json(HTTPStatus.NOT_FOUND, "API endpoint не найден")
        except ValueError as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"Ошибка сервера: {exc}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 4180)))
    args = parser.parse_args()
    init_db()
    with db_connect() as db:
        cleanup_sessions(db)
    server = ThreadingHTTPServer((args.host, args.port), MLingoHandler)
    print(f"MLingo backend on http://{args.host}:{args.port}")
    print("Database: PostgreSQL")
    server.serve_forever()


if __name__ == "__main__":
    main()
