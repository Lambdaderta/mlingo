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
from datetime import date, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://mlingo:mlingo@localhost:5432/mlingo")
ALLOWED_ORIGIN = os.environ.get("MLINGO_ALLOWED_ORIGIN", "")
SESSION_TTL = 60 * 60 * 24 * 30
PBKDF2_ITERATIONS = 220_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def now_ts():
    return int(time.time())


def json_dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


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
              password_hash text not null,
              created_at bigint not null
            )
            """
        )
        db.execute("alter table users add column if not exists email text")
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
        db.execute("create index if not exists sessions_user_id_idx on sessions(user_id)")
        db.execute("create index if not exists sessions_expires_at_idx on sessions(expires_at)")
        db.execute("create index if not exists events_user_created_idx on events(user_id, created_at desc)")
        db.execute("create index if not exists progress_leaderboard_idx on progress(xp desc, streak desc, completed_count desc, updated_at asc)")
        db.execute("create unique index if not exists users_email_lower_unique_idx on users (lower(email)) where email is not null")


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
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row.get("email"),
        "createdAt": row["created_at"],
    }


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

    def handle_api(self, method):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        try:
            with db_connect() as db:
                if path == "/api/health" and method == "GET":
                    db.execute("select 1").fetchone()
                    self.send_json(HTTPStatus.OK, {"ok": True, "database": "postgres"})
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
                    if not user or not verify_password(password, user["password_hash"]):
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
