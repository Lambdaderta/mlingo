#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import http.cookies
import json
import os
import secrets
import sqlite3
import time
from datetime import date, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("MLINGO_DB", ROOT / "mlingo.db"))
SESSION_TTL = 60 * 60 * 24 * 30
PBKDF2_ITERATIONS = 220_000


def now_ts():
    return int(time.time())


def today_key():
    return date.today().isoformat()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute("pragma journal_mode = wal")
        db.execute(
            """
            create table if not exists users (
              id integer primary key autoincrement,
              username text not null unique,
              password_hash text not null,
              created_at integer not null
            )
            """
        )
        db.execute(
            """
            create table if not exists sessions (
              token text primary key,
              user_id integer not null references users(id) on delete cascade,
              created_at integer not null,
              expires_at integer not null
            )
            """
        )
        db.execute(
            """
            create table if not exists progress (
              user_id integer primary key references users(id) on delete cascade,
              state_json text not null,
              xp integer not null default 0,
              streak integer not null default 0,
              completed_count integer not null default 0,
              miss_count integer not null default 0,
              updated_at integer not null
            )
            """
        )
        db.execute(
            """
            create table if not exists events (
              id integer primary key autoincrement,
              user_id integer not null references users(id) on delete cascade,
              lesson_id text not null,
              correct integer not null,
              xp_delta integer not null default 0,
              created_at integer not null
            )
            """
        )


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def json_dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


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
        "createdAt": row["created_at"],
    }


def get_progress(db, user_id):
    row = db.execute("select * from progress where user_id = ?", (user_id,)).fetchone()
    if not row:
        return {
            "state": {"xp": 0, "streak": 0, "completed": {}, "completedDates": {}, "misses": {}, "layoutMode": "course"},
            "xp": 0,
            "streak": 0,
            "completedCount": 0,
            "missCount": 0,
            "updatedAt": None,
        }
    state = json.loads(row["state_json"])
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
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(user_id) do update set
          state_json = excluded.state_json,
          xp = excluded.xp,
          streak = excluded.streak,
          completed_count = excluded.completed_count,
          miss_count = excluded.miss_count,
          updated_at = excluded.updated_at
        """,
        (user_id, json_dumps(state), xp, streak, completed_count, miss_count, updated_at),
    )
    return get_progress(db, user_id)


def leaderboard(db, limit=20):
    rows = db.execute(
        """
        select u.username, p.xp, p.streak, p.completed_count, p.miss_count, p.updated_at
        from progress p
        join users u on u.id = p.user_id
        order by p.xp desc, p.streak desc, p.completed_count desc, p.updated_at asc
        limit ?
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


class MLingoHandler(SimpleHTTPRequestHandler):
    server_version = "MLingo/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
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
        row = db.execute(
            """
            select u.* from sessions s
            join users u on u.id = s.user_id
            where s.token = ? and s.expires_at > ?
            """,
            (token, now_ts()),
        ).fetchone()
        return row

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
            "insert into sessions (token, user_id, created_at, expires_at) values (?, ?, ?, ?)",
            (token, user_id, current, current + SESSION_TTL),
        )
        return token

    def handle_api(self, method):
        path = urlparse(self.path).path
        try:
            with db_connect() as db:
                if path == "/api/register" and method == "POST":
                    payload = read_json(self)
                    username = normalize_username(str(payload.get("username", "")))
                    password = str(payload.get("password", ""))
                    if len(username) < 3 or len(username) > 24:
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Логин: 3-24 символа, буквы/цифры/_-.")
                        return
                    if len(password) < 6:
                        self.send_error_json(HTTPStatus.BAD_REQUEST, "Пароль должен быть минимум 6 символов")
                        return
                    try:
                        cur = db.execute(
                            "insert into users (username, password_hash, created_at) values (?, ?, ?)",
                            (username, hash_password(password), now_ts()),
                        )
                    except sqlite3.IntegrityError:
                        self.send_error_json(HTTPStatus.CONFLICT, "Такой логин уже занят")
                        return
                    user = db.execute("select * from users where id = ?", (cur.lastrowid,)).fetchone()
                    save_progress(db, user["id"], {"xp": 0, "streak": 0, "completed": {}, "completedDates": {}, "misses": {}, "layoutMode": "course"})
                    token = self.create_session(db, user["id"])
                    self.send_json(HTTPStatus.OK, {"ok": True, "token": token, "user": public_user(user), "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)}, token=token)
                    return

                if path == "/api/login" and method == "POST":
                    payload = read_json(self)
                    username = normalize_username(str(payload.get("username", "")))
                    password = str(payload.get("password", ""))
                    user = db.execute("select * from users where username = ?", (username,)).fetchone()
                    if not user or not verify_password(password, user["password_hash"]):
                        self.send_error_json(HTTPStatus.UNAUTHORIZED, "Неверный логин или пароль")
                        return
                    token = self.create_session(db, user["id"])
                    self.send_json(HTTPStatus.OK, {"ok": True, "token": token, "user": public_user(user), "progress": get_progress(db, user["id"]), "leaderboard": leaderboard(db)}, token=token)
                    return

                if path == "/api/logout" and method == "POST":
                    token = self.auth_token()
                    if token:
                        db.execute("delete from sessions where token = ?", (token,))
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
                        "insert into events (user_id, lesson_id, correct, xp_delta, created_at) values (?, ?, ?, ?, ?)",
                        (user["id"], str(payload.get("lessonId", "")), 1 if payload.get("correct") else 0, int(payload.get("xpDelta") or 0), now_ts()),
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
    server = ThreadingHTTPServer((args.host, args.port), MLingoHandler)
    print(f"MLingo backend on http://{args.host}:{args.port}")
    print(f"SQLite DB: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
