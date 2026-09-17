"""Tests for the phone channels against a fake Telegram / ntfy / GitHub API.

Run from the project folder:  python -m unittest discover -s server/tests -t .
"""
import json
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from server import channels, core

ROOT = core.ROOT


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.updates = []
        self.hold_updates = 0
        self.gist = None
        self.ntfy = []
        api = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, code, obj):
                body = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path.startswith("/gists/"):
                    if api.gist is None:
                        return self.reply(404, {"message": "Not Found"})
                    content = json.dumps(api.gist)
                    return self.reply(200, {"files": {core.SYNC_FILE: {"content": content, "truncated": False}}})
                self.reply(404, {})

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n) or b"{}")
                if self.path == "/":
                    api.ntfy.append(body)
                    return self.reply(200, {"id": "n1"})
                m = re.match(r"^/bot([^/]+)/(\w+)$", self.path)
                if not m:
                    return self.reply(404, {"ok": False})
                token, method = m.groups()
                if token == "bad":
                    return self.reply(401, {"ok": False, "description": "Unauthorized"})
                api.calls.append((method, body))
                ok = lambda result: self.reply(200, {"ok": True, "result": result})
                if method == "getMe":
                    return ok({"id": 1, "is_bot": True, "username": "ppuri_test_bot"})
                if method == "getUpdates":
                    if api.hold_updates > 0 or not api.updates:
                        api.hold_updates = max(0, api.hold_updates - 1)
                        time.sleep(0.2)  # a real long poll waits
                        return ok([])
                    ups, api.updates = api.updates, []
                    return ok(ups)
                if method == "sendMessage":
                    return ok({"message_id": len(api.calls), "chat": {"id": body.get("chat_id")}})
                return ok(True)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.server.handle_error = lambda *args: None  # clients that hang up mid long-poll
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def sent(self, method="sendMessage"):
        return [b for m, b in self.calls if m == method]


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class ChannelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = FakeAPI()
        cls.tmp = tempfile.mkdtemp()
        os.environ.update(
            PPURI_CONFIG=os.path.join(cls.tmp, "config.json"),
            PPURI_PROGRESS_DIR=os.path.join(cls.tmp, "progress"),
            PPURI_TELEGRAM_API=cls.api.url,
            PPURI_GITHUB_API=cls.api.url,
        )
        cls.bundle = core.Bundle()

    @classmethod
    def tearDownClass(cls):
        cls.api.server.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        self.api.calls.clear()
        self.api.ntfy.clear()
        self.api.updates = []
        self.api.hold_updates = 0
        self.api.gist = None
        core.save_config({"telegram": {"token": "T", "chat_id": 42}, "reminders": ["08:30", "21:00"],
                          "app_url": "https://example.github.io/ppuri/"})
        os.makedirs(core.progress_dir(), exist_ok=True)
        now = datetime.now()
        unit = self.bundle.path[0]
        cards = []
        for i, cid in enumerate(core.unit_items(unit)):
            due = now - timedelta(hours=1) if i % 2 == 0 else now + timedelta(days=5)
            cards.append({"id": cid, "kind": cid[0], "created": int((now - timedelta(days=2)).timestamp() * 1000),
                          "fsrs": {"due": iso(due), "stability": 2, "difficulty": 5, "elapsed_days": 0,
                                   "scheduled_days": 2, "reps": 2, "lapses": 0, "state": 2, "learning_steps": 0,
                                   "last_review": iso(now - timedelta(days=1))}})
        self.started = [c["id"] for c in cards]
        logs = [{"card": cards[0]["id"], "at": int(now.timestamp() * 1000), "rating": 3, "state": 2},
                {"card": cards[1]["id"], "at": int((now - timedelta(days=1)).timestamp() * 1000), "rating": 3, "state": 2}]
        export = {"app": "ppuri", "format": 1, "exported": iso(now), "settings": {"newPerDay": 20}, "cards": cards, "logs": logs}
        with open(os.path.join(core.progress_dir(), "latest.json"), "w", encoding="utf-8") as fh:
            json.dump(export, fh)
        state = os.path.join(core.progress_dir(), "bot-state.json")
        if os.path.exists(state):
            os.remove(state)
        self.bot = channels.Bot(self.bundle, core.ProgressSource(), rng=random.Random(3))

    def msg(self, text, chat=42):
        return {"update_id": 1, "message": {"message_id": 5, "chat": {"id": chat, "type": "private"}, "text": text}}

    def last(self):
        return self.api.sent()[-1]["text"]

    def test_today(self):
        self.bot.handle(self.msg("/today"))
        text = self.last()
        self.assertIn("to review", text)
        self.assertIn("Streak 2 days", text)
        self.assertIn("Next on your path", text)
        row = self.api.sent()[-1]["reply_markup"]["inline_keyboard"][0]
        self.assertEqual(row[0]["url"], "https://example.github.io/ppuri/")
        self.assertEqual(row[-1]["callback_data"], "q")

    def test_word_lookup(self):
        self.bot.handle(self.msg("/word 학생"))
        text = self.last()
        for part in ("haksaeng", "[학쌩]", "student", "Roots:", "saeng"):
            self.assertIn(part, text)
        self.bot.handle(self.msg("haksaeng"))
        self.assertIn("<b>학생</b>", self.last())
        self.bot.handle(self.msg("먹"))
        self.assertIn("<b>먹다</b>", self.last())
        self.bot.handle(self.msg("먹어요"))
        self.assertIn("not on your word list", self.last())

    def test_root_and_next(self):
        self.bot.handle(self.msg("/root 학"))
        text = self.last()
        self.assertIn("Co-parent roots", text)
        self.assertIn("saeng", text)
        self.assertRegex(text, r"×\d+")
        self.bot.handle(self.msg("/next"))
        self.assertIn("Next on your path", self.last())
        self.bot.handle(self.msg("/nonsense"))
        self.assertIn("/help", self.last())

    def test_ignores_other_chats(self):
        self.bot.handle(self.msg("/today", chat=99))
        self.bot.handle({"update_id": 3, "callback_query": {"id": "x", "data": "q", "message": {"message_id": 1, "chat": {"id": 99}}}})
        self.assertEqual(self.api.calls, [])

    def test_quiz_flow(self):
        self.bot.handle(self.msg("/quiz"))
        data = self.api.sent()[-1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        self.assertTrue(data.startswith("a:"))
        self.assertIn(f"w:{data[2:]}", self.started)
        word = self.bundle.words[int(data[2:])]
        self.bot.handle({"update_id": 4, "callback_query": {"id": "cb1", "data": data,
                                                            "message": {"message_id": 7, "chat": {"id": 42}}}})
        self.assertEqual(self.api.sent("answerCallbackQuery")[-1]["callback_query_id"], "cb1")
        edit = self.api.sent("editMessageText")[-1]
        self.assertEqual(edit["message_id"], 7)
        self.assertIn(word["w"], edit["text"])
        self.assertIn("Status: known", edit["text"])
        self.assertEqual(edit["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "q")

    def test_reminders_once_per_slot(self):
        day = (datetime.now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        self.assertFalse(self.bot.tick(day.replace(hour=8)))
        self.assertTrue(self.bot.tick(day.replace(hour=9)))
        self.assertFalse(self.bot.tick(day.replace(hour=9, minute=1)))
        self.assertTrue(self.bot.tick(day.replace(hour=21, minute=5)))
        self.assertEqual(len(self.api.sent()), 2)
        late = day + timedelta(days=1)  # laptop asleep until 22:00: one message, not two
        self.assertTrue(self.bot.tick(late.replace(hour=22)))
        self.assertFalse(self.bot.tick(late.replace(hour=22, minute=1)))
        self.assertEqual(len(self.api.sent()), 3)

    def test_failed_send_is_retried(self):
        cfg = core.load_config()
        cfg["telegram"]["token"] = "bad"
        core.save_config(cfg)
        day = (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        self.assertFalse(self.bot.tick(day))
        cfg["telegram"]["token"] = "T"
        core.save_config(cfg)
        self.assertFalse(self.bot.tick(day + timedelta(minutes=2)))  # waiting before the retry
        self.assertTrue(self.bot.tick(day + timedelta(minutes=6)))
        self.assertEqual(len(self.api.sent()), 1)

    def test_ntfy_and_pause(self):
        cfg = core.load_config()
        cfg.pop("telegram")
        cfg["ntfy"] = {"server": self.api.url, "topic": "ppuri-test"}
        core.save_config(cfg)
        day = (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        self.assertTrue(self.bot.tick(day))
        note = self.api.ntfy[-1]
        self.assertEqual(note["topic"], "ppuri-test")
        self.assertEqual(note["click"], "https://example.github.io/ppuri/")
        self.assertNotIn("<b>", note["message"])
        self.assertIn("to review", note["message"])
        cfg["reminders_paused"] = True
        core.save_config(cfg)
        self.assertFalse(self.bot.tick(day.replace(hour=22)))

    def test_remind_command(self):
        self.bot.handle(self.msg("/remind 7:05 22:30"))
        self.assertEqual(core.load_config()["reminders"], ["07:05", "22:30"])
        self.bot.handle(self.msg("/remind off"))
        self.assertTrue(core.load_config()["reminders_paused"])
        self.bot.handle(self.msg("/remind on"))
        self.assertFalse(core.load_config()["reminders_paused"])
        self.bot.handle(self.msg("/remind 25:00"))
        self.assertIn("24-hour", self.last())
        self.bot.handle(self.msg("/remind"))
        self.assertIn("07:05, 22:30", self.last())

    def test_progress_from_sync_file(self):
        now = int(time.time())
        wid = self.bundle.path[3]["w"][0]
        self.api.gist = {"app": "ppuri", "format": 2, "settings": {"newPerDay": 5},
                         "cards": [[f"w:{wid}", now - 60, 1, 5, 1, 1, 0, 2, 0, now - 100, now - 100, 0]],
                         "logs": [[f"w:{wid}", now - 100, 3, 2]]}
        cfg = core.load_config()
        cfg["github"] = {"token": "G", "gist_id": "abc"}
        core.save_config(cfg)
        prog = core.ProgressSource().get()
        self.assertEqual(prog.source, "sync file")
        plan = core.study_plan(self.bundle, prog, datetime.now())
        self.assertEqual(plan["due"], 1)
        self.assertLessEqual(plan["new"], 5)
        self.api.gist = None  # unreachable or missing: fall back to the laptop backup
        self.assertEqual(core.ProgressSource().get().source, "laptop backup")

    def test_setup_telegram_command(self):
        os.remove(core.config_path())
        self.api.hold_updates = 1  # the first call only clears old messages
        self.api.updates = [{"update_id": 10, "message": {"message_id": 1, "text": "/start",
                                                          "chat": {"id": 777, "type": "private", "first_name": "Abraham"}}}]
        out = subprocess.run([sys.executable, "serve.py", "--setup", "telegram"], cwd=ROOT, env=os.environ,
                             input="T2\n8:00 20:00\nhttps://you.github.io/ppuri/\n", capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        cfg = core.load_config()
        self.assertEqual(cfg["telegram"], {"token": "T2", "chat_id": 777})
        self.assertEqual(cfg["reminders"], ["08:00", "20:00"])
        self.assertEqual(cfg["app_url"], "https://you.github.io/ppuri/")
        self.assertIn("setMyCommands", [m for m, _ in self.api.calls])
        self.assertEqual(self.api.sent()[-1]["chat_id"], 777)
        if os.name == "posix":
            self.assertEqual(os.stat(core.config_path()).st_mode & 0o777, 0o600)

    def test_server_starts_the_bot(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        proc = subprocess.Popen([sys.executable, "serve.py", "--no-browser", "--port", str(port)], cwd=ROOT, env=os.environ,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            health = None
            for _ in range(50):
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as res:
                        health = json.load(res)
                        break
                except OSError:
                    time.sleep(0.2)
            self.assertEqual(health, {"ok": True, "phone": ["Telegram"]})
            deadline = time.time() + 10
            while time.time() < deadline and "getUpdates" not in [m for m, _ in self.api.calls]:
                time.sleep(0.2)
            self.assertIn("getUpdates", [m for m, _ in self.api.calls])
        finally:
            proc.terminate()
            output = proc.communicate(timeout=10)[0]
        self.assertIn("Phone reminders via Telegram at 08:30, 21:00", output)


if __name__ == "__main__":
    unittest.main()
