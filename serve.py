#!/usr/bin/env python3
"""Run 뿌리 on this laptop.

    python serve.py              # opens http://127.0.0.1:8765
    python serve.py --port 9000  # another port
    python serve.py --no-browser

Only the Python standard library is needed. The server serves the built app from
app/dist and keeps copies of your study progress in ./progress.
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import re
import sys
import threading
import webbrowser
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(ROOT, "app", "dist")
PROGRESS_DIR = os.path.join(ROOT, "progress")
LATEST = os.path.join(PROGRESS_DIR, "latest.json")
LATEST_INFO = os.path.join(PROGRESS_DIR, "latest-info.json")
KEEP_RECENT = 20          # newest backups kept as they are
KEEP_DAILY_DAYS = 60      # plus the last backup of each day for this many days
MAX_BODY = 200 * 1024 * 1024
STAMP = re.compile(r"^backup-(\d{8})-(\d{6})\.json$")


def write_atomic(path: str, data: bytes) -> None:
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def prune_backups() -> None:
    files = sorted((f for f in os.listdir(PROGRESS_DIR) if STAMP.match(f)), reverse=True)
    keep = set(files[:KEEP_RECENT])
    days_seen: set[str] = set()
    for f in files:
        day = STAMP.match(f).group(1)
        if day not in days_seen and len(days_seen) < KEEP_DAILY_DAYS:
            days_seen.add(day)
            keep.add(f)
    for f in files:
        if f not in keep:
            try:
                os.remove(os.path.join(PROGRESS_DIR, f))
            except OSError:
                pass


class Handler(http.server.SimpleHTTPRequestHandler):
    phone: list = []
    allowed_hosts: set[str] = set()

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".png": "image/png",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    # ---- safety: only answer requests addressed to this machine (blocks DNS rebinding)
    def host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").lower()
        if host in self.allowed_hosts:
            return True
        self.send_error(421, "Unknown host")
        return False

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if "/assets/" in path:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def send_json(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.host_ok():
            return
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "phone": Handler.phone})
        if path == "/api/backup/info":
            if not os.path.exists(LATEST_INFO):
                return self.send_json(200, None)  # no backup yet
            with open(LATEST_INFO, encoding="utf-8") as fh:
                return self.send_json(200, json.load(fh))
        if path == "/api/backup":
            if not os.path.exists(LATEST):
                return self.send_json(404, {"error": "no backup yet"})
            with open(LATEST, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_HEAD(self):
        if self.host_ok():
            super().do_HEAD()

    def do_PUT(self):
        if not self.host_ok():
            return
        if self.path.split("?", 1)[0] != "/api/backup":
            return self.send_json(405, {"error": "not allowed"})
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.send_json(415, {"error": "send JSON"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {"error": "backup is empty or too large"})
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except ValueError:
            return self.send_json(400, {"error": "backup is not valid JSON"})
        if not isinstance(data, dict) or data.get("app") != "ppuri" or not isinstance(data.get("cards"), list):
            return self.send_json(400, {"error": "not a 뿌리 backup"})
        os.makedirs(PROGRESS_DIR, exist_ok=True)
        now = datetime.now()
        write_atomic(os.path.join(PROGRESS_DIR, f"backup-{now:%Y%m%d-%H%M%S}.json"), body)
        write_atomic(LATEST, body)
        info = {"saved": now.astimezone().isoformat(timespec="seconds"), "cards": len(data["cards"]),
                "reviews": len(data.get("logs") or [])}
        write_atomic(LATEST_INFO, json.dumps(info).encode("utf-8"))
        prune_backups()
        return self.send_json(200, info)

    def log_message(self, fmt, *args):
        # keep the console quiet: show API calls and errors only
        line = fmt % args
        if "/api/" in line or re.search(r'" [45]\d\d ', line):
            sys.stderr.write(f"{datetime.now():%H:%M:%S} {line}\n")


def start_phone_channels() -> None:
    """Start the Telegram bot and the reminder clock when a phone channel is configured."""
    try:
        from server import channels, core
        bot = channels.Bot(core.Bundle(os.path.join(APP_DIR, "data", "ppuri-data.json")), core.ProgressSource())
    except Exception as exc:  # never keep the app from starting
        print(f"Phone reminders are off: {exc}")
        return
    if not bot.enabled():
        print("Phone reminders are not set up (see README: python serve.py --setup telegram).")
        return
    bot.start()
    cfg = core.load_config()
    Handler.phone = [name for name, on in (("Telegram", bot.telegram()), ("ntfy", bot.ntfy())) if on]
    times = ", ".join(cfg.get("reminders") or []) or "no times set"
    paused = " (paused)" if cfg.get("reminders_paused") else ""
    print(f"Phone reminders via {' and '.join(Handler.phone)} at {times}{paused}. Keep this window open.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve 뿌리 locally.")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1",
                    help="address to listen on (default: this laptop only)")
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    ap.add_argument("--setup", choices=["telegram", "ntfy", "sync"],
                    help="connect phone reminders (telegram or ntfy), or read phone progress from the sync file")
    ap.add_argument("--send-reminder", action="store_true", help="send today's reminder to your phone now and exit")
    ap.add_argument("--no-reminders", action="store_true", help="do not start the Telegram bot and reminders")
    args = ap.parse_args()
    os.environ.setdefault("PPURI_PROGRESS_DIR", PROGRESS_DIR)

    if args.setup or args.send_reminder:
        from server import channels, core
        if args.setup:
            {"telegram": channels.setup_telegram, "ntfy": channels.setup_ntfy, "sync": channels.setup_sync}[args.setup]()
            return
        bot = channels.Bot(core.Bundle(), core.ProgressSource())
        if not bot.enabled():
            sys.exit("No phone channel is set up yet. Run: python serve.py --setup telegram")
        bot.reminder()
        print("Sent.")
        return

    if not os.path.exists(os.path.join(APP_DIR, "index.html")):
        sys.exit("app/dist is missing. Build the app first: cd app && npm install && npm run build")
    if not os.path.exists(os.path.join(APP_DIR, "data", "ppuri-data.json")):
        sys.exit("app/dist/data/ppuri-data.json is missing. Run the pipeline (see README.md).")

    Handler.allowed_hosts = {f"{h}:{args.port}" for h in ("127.0.0.1", "localhost", "[::1]", args.host)}
    server = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '::') else args.host}:{args.port}/"
    print(f"뿌리 is running at {url}")
    print(f"Progress backups go to {PROGRESS_DIR}")
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("Warning: the server is reachable from other devices and has no password.")
    print("Press Ctrl+C to stop.")
    if not args.no_reminders:
        start_phone_channels()
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
