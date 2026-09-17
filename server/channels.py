"""Phone channels: a Telegram bot (reminders, lookups, practice cards) and ntfy push notifications.

Everything uses the Python standard library. The bot only answers the chat saved during setup.
"""
from __future__ import annotations

import json
import os
import random
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

from . import core

COMMANDS = [
    ("today", "What is waiting today"),
    ("next", "The next roots and words on your path"),
    ("quiz", "Practice a word (your schedule does not change)"),
    ("word", "Look up a word, e.g. /word 학생"),
    ("root", "A root and its co-parent roots, e.g. /root 학"),
    ("remind", "Reminder times, e.g. /remind 08:30 21:00, or off"),
    ("help", "What I can do"),
]
HELP = (
    "<b>뿌리 on your phone</b>\n"
    "/today  what is waiting today\n"
    "/next  the next roots and words on your path\n"
    "/quiz  practice a word you have met\n"
    "/word 학생  look up a word (or just send the word)\n"
    "/root 학  a root and the roots it builds words with\n"
    "/remind 08:30 21:00  change reminder times (/remind off to pause)\n\n"
    "Practice here does not change your review schedule; do the real reviews in the app."
)
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


class TelegramError(Exception):
    pass


def telegram_api() -> str:
    return os.environ.get("PPURI_TELEGRAM_API", "https://api.telegram.org")


def tg(token: str, method: str, http_timeout: float = 30, **params):
    body = json.dumps({k: v for k, v in params.items() if v is not None}).encode("utf-8")
    req = urllib.request.Request(f"{telegram_api()}/bot{token}/{method}", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=http_timeout) as res:
            data = json.load(res)
    except urllib.error.HTTPError as exc:
        try:
            data = json.load(exc)
        except ValueError:
            raise TelegramError(f"HTTP {exc.code}") from exc
    if not data.get("ok"):
        raise TelegramError(data.get("description", "Telegram error"))
    return data["result"]


def publish_ntfy(server: str, topic: str, title: str, message: str, click: str | None = None) -> None:
    payload = {"topic": topic, "title": title, "message": message, "tags": ["books"]}
    if click:
        payload["click"] = click
    req = urllib.request.Request(server.rstrip("/") + "/", data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        res.read()


def parse_times(words: list) -> list | None:
    out = []
    for w in words:
        m = TIME_RE.match(w.strip())
        if not m:
            return None
        out.append(f"{int(m.group(1)):02d}:{m.group(2)}")
    return sorted(set(out))


class Bot:
    def __init__(self, bundle: core.Bundle, source: core.ProgressSource, rng: random.Random | None = None):
        self.bundle = bundle
        self.source = source
        self.rng = rng or random.Random()
        self.stop = threading.Event()
        self.lock = threading.Lock()

    # ------------------------------------------------------------ plumbing
    @staticmethod
    def telegram() -> dict | None:
        t = core.load_config().get("telegram") or {}
        return t if t.get("token") and t.get("chat_id") else None

    @staticmethod
    def ntfy() -> dict | None:
        n = core.load_config().get("ntfy") or {}
        return n if n.get("topic") else None

    def enabled(self) -> bool:
        return bool(self.telegram() or self.ntfy())

    def send(self, text: str, buttons: list | None = None):
        t = self.telegram()
        if not t:
            return None
        markup = {"inline_keyboard": buttons} if buttons else None
        return tg(t["token"], "sendMessage", chat_id=t["chat_id"], text=text, parse_mode="HTML",
                  disable_web_page_preview=True, reply_markup=markup)

    @staticmethod
    def app_button() -> list:
        url = core.load_config().get("app_url")
        return [{"text": "Open 뿌리", "url": url}] if url else []

    def state_path(self) -> str:
        return os.path.join(core.progress_dir(), "bot-state.json")

    def load_state(self) -> dict:
        try:
            with open(self.state_path(), encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return {}

    def save_state(self, st: dict) -> None:
        os.makedirs(core.progress_dir(), exist_ok=True)
        tmp = self.state_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(st, fh)
        os.replace(tmp, self.state_path())

    # ------------------------------------------------------------ reminders
    def reminder(self, now: datetime | None = None) -> bool:
        now = now or datetime.now()
        self.source.invalidate()
        text = core.today_text(self.bundle, self.source.get(), now)
        sent = False
        if self.telegram():
            self.send(text, [self.app_button() + [{"text": "Practice a word", "callback_data": "q"}]])
            sent = True
        n = self.ntfy()
        if n:
            publish_ntfy(n.get("server") or "https://ntfy.sh", n["topic"], "뿌리", core.plain(text),
                         core.load_config().get("app_url"))
            sent = True
        return sent

    def tick(self, now: datetime | None = None) -> bool:
        """Send the latest reminder time that has passed today, once."""
        now = now or datetime.now()
        cfg = core.load_config()
        times = cfg.get("reminders") or []
        if cfg.get("reminders_paused") or not times or not self.enabled():
            return False
        with self.lock:
            st = self.load_state()
            if st.get("retry_at", 0) > now.timestamp():
                return False
            today = now.date().isoformat()
            done = set(st.get("sent", {}).get(today, []))
            passed = []
            for t in times:
                hh, mm = map(int, t.split(":"))
                if t not in done and now >= now.replace(hour=hh, minute=mm, second=0, microsecond=0):
                    passed.append(t)
            if not passed:
                return False
            try:
                ok = self.reminder(now)
            except Exception as exc:  # offline: try again in five minutes
                core.log(f"reminder failed: {exc}")
                st["retry_at"] = now.timestamp() + 300
                self.save_state(st)
                return False
            keep = (now.date() - timedelta(days=7)).isoformat()
            sent = {d: v for d, v in st.get("sent", {}).items() if d >= keep}
            sent[today] = sorted(done | set(passed))  # missed earlier slots are skipped, not sent twice
            self.save_state({"sent": sent})
            return ok

    def run_reminders(self) -> None:
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as exc:
                core.log(f"reminder loop: {exc}")
            self.stop.wait(30)

    # ------------------------------------------------------------ conversation
    def run_polling(self) -> None:
        offset = None
        backoff = 5
        while not self.stop.is_set():
            t = self.telegram()
            if not t:
                self.stop.wait(30)
                continue
            try:
                updates = tg(t["token"], "getUpdates", http_timeout=70, offset=offset, timeout=50,
                             allowed_updates=["message", "callback_query"])
                backoff = 5
            except (TelegramError, OSError) as exc:
                core.log(f"telegram: {exc}; retrying in {backoff}s")
                self.stop.wait(backoff)
                backoff = min(backoff * 2, 300)
                continue
            for u in updates:
                offset = u["update_id"] + 1
                try:
                    self.handle(u)
                except Exception as exc:
                    core.log(f"telegram update failed: {exc}")

    def handle(self, update: dict) -> None:
        t = self.telegram()
        if not t:
            return
        if "callback_query" in update:
            cq = update["callback_query"]
            if (cq.get("message") or {}).get("chat", {}).get("id") == t["chat_id"]:
                self.on_callback(cq)
            return
        msg = update.get("message") or {}
        if msg.get("chat", {}).get("id") != t["chat_id"]:
            return  # a private bot: ignore everyone else
        text = (msg.get("text") or "").strip()
        if not text:
            return
        if not text.startswith("/"):
            self.cmd_word(text)
            return
        cmd, _, arg = text.partition(" ")
        cmd = cmd[1:].split("@")[0].lower()
        handler = {"start": self.cmd_help, "help": self.cmd_help, "today": self.cmd_today, "next": self.cmd_next,
                   "quiz": self.cmd_quiz, "word": self.cmd_word, "root": self.cmd_root,
                   "remind": self.cmd_remind}.get(cmd)
        if handler:
            handler(arg.strip())
        else:
            self.send("I don't know that command. Send /help to see what I can do.")

    def cmd_help(self, _arg: str = "") -> None:
        self.send(HELP, [self.app_button()] if self.app_button() else None)

    def cmd_today(self, _arg: str = "") -> None:
        self.source.invalidate()
        text = core.today_text(self.bundle, self.source.get(), datetime.now())
        self.send(text, [self.app_button() + [{"text": "Practice a word", "callback_data": "q"}]])

    def cmd_next(self, _arg: str = "") -> None:
        prog = self.source.get()
        plan = core.study_plan(self.bundle, prog, datetime.now())
        if plan["next_unit"] is None:
            self.send("You have started every word on the path.")
            return
        self.send("<b>Next on your path</b>\n" + core.unit_text(self.bundle, prog, plan["next_unit"], limit=10))

    def cmd_word(self, arg: str) -> None:
        if not arg:
            self.send("Send a word after the command, for example /word 학생")
            return
        hits = self.bundle.search(arg, limit=3)
        if not hits:
            self.send(f"{core.esc(arg)} is not on your word list. Try the dictionary form (먹다 rather than 먹어요).")
            return
        prog = self.source.get()
        now = datetime.now()
        self.send("\n\n".join(core.word_text(self.bundle, prog, w, now) for w in hits))

    def cmd_root(self, arg: str) -> None:
        q = arg.strip()
        if not q:
            self.send("Send a root after the command, for example /root 학")
            return
        roots = self.bundle.roots_by_reading.get(q) or ([self.bundle.roots[q]] if q in self.bundle.roots else [])
        if not roots and not re.search(r"[\uac00-\ud7a3]", q):
            low = q.lower()
            roots = [r for r in self.bundle.roots.values() if low in (r.get("rr") or []) or low in (r.get("g") or "").lower()]
        if not roots:
            self.send(f"No root {core.esc(q)} on your path.")
            return
        roots = sorted(roots, key=lambda r: -len(r["w"]))[:3]
        prog = self.source.get()
        self.send("\n\n".join(core.root_text(self.bundle, prog, r["c"]) for r in roots))

    def cmd_remind(self, arg: str) -> None:
        cfg = core.load_config()
        words = arg.split()
        if not words:
            times = cfg.get("reminders") or []
            state = "paused" if cfg.get("reminders_paused") else "on"
            self.send(f"Reminders are {state}: {', '.join(times) or 'no times set'}.\n"
                      "Change them with /remind 08:30 21:00, or pause with /remind off.")
            return
        if words[0].lower() in ("off", "pause", "stop"):
            cfg["reminders_paused"] = True
            core.save_config(cfg)
            self.send("Reminders paused. Send /remind on to start them again.")
            return
        if words[0].lower() in ("on", "resume", "start"):
            cfg["reminders_paused"] = False
            core.save_config(cfg)
            self.send(f"Reminders are on: {', '.join(cfg.get('reminders') or [])}.")
            return
        times = parse_times(words)
        if not times:
            self.send("Use 24-hour times, for example /remind 07:30 12:00 21:00")
            return
        cfg["reminders"] = times
        cfg["reminders_paused"] = False
        core.save_config(cfg)
        st = self.load_state()
        st.setdefault("sent", {})[datetime.now().date().isoformat()] = [
            t for t in times if datetime.now().strftime("%H:%M") >= t]  # don't fire the new times retroactively
        self.save_state(st)
        self.send(f"Done. I'll remind you at {', '.join(times)}.")

    # ------------------------------------------------------------ practice
    def pick_word(self) -> dict:
        prog = self.source.get()
        cards = prog.cards if prog else {}
        now = time.time()
        started = [int(cid[2:]) for cid in cards if cid.startswith("w:") and int(cid[2:]) in self.bundle.words]
        soon = [i for i in started if cards[f"w:{i}"]["due"] <= now + 3 * 86400]
        pool = soon or started
        if not pool:
            plan = core.study_plan(self.bundle, prog, datetime.now())
            unit = self.bundle.path[plan["next_unit"] or 0]
            pool = unit["w"]
        return self.bundle.words[self.rng.choice(pool)]

    def cmd_quiz(self, _arg: str = "") -> None:
        w = self.pick_word()
        text = f"<b>{core.esc(w['w'])}</b>  <i>{core.esc(self.bundle.rr(w))}</i>\nWhat does it mean?"
        self.send(text, [[{"text": "Show answer", "callback_data": f"a:{w['i']}"}]])

    def on_callback(self, cq: dict) -> None:
        t = self.telegram()
        data = cq.get("data") or ""
        try:
            tg(t["token"], "answerCallbackQuery", callback_query_id=cq["id"])
        except (TelegramError, OSError):
            pass
        if data == "q":
            self.cmd_quiz()
            return
        if data.startswith("a:") and data[2:].isdigit() and int(data[2:]) in self.bundle.words:
            w = self.bundle.words[int(data[2:])]
            text = core.word_text(self.bundle, self.source.get(), w, datetime.now())
            buttons = [[{"text": "Next word", "callback_data": "q"}] + self.app_button()]
            msg = cq["message"]
            tg(t["token"], "editMessageText", chat_id=msg["chat"]["id"], message_id=msg["message_id"], text=text,
               parse_mode="HTML", disable_web_page_preview=True, reply_markup={"inline_keyboard": buttons})

    # ------------------------------------------------------------ lifecycle
    def start(self) -> list:
        threads = [threading.Thread(target=self.run_reminders, name="reminders", daemon=True)]
        if self.telegram():
            threads.append(threading.Thread(target=self.run_polling, name="telegram", daemon=True))
        for th in threads:
            th.start()
        return threads


# ---------------------------------------------------------------- guided setup (command line)
def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        value = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        value = ""
    return value or default


def ask_times(cfg: dict) -> list:
    current = " ".join(cfg.get("reminders") or ["08:30", "21:00"])
    while True:
        times = parse_times(ask("Reminder times (24-hour, separated by spaces)", current).split())
        if times:
            return times
        print("Please use times like 08:30 21:00.")


def setup_telegram() -> None:
    print("1. In Telegram, open @BotFather, send /newbot and follow the steps.")
    print("   BotFather replies with a token like 123456789:AA...\n")
    token = ask("Bot token")
    if not token:
        sys.exit("No token given.")
    try:
        me = tg(token, "getMe")
    except (TelegramError, OSError) as exc:
        sys.exit(f"Telegram did not accept the token: {exc}")
    pending = tg(token, "getUpdates", http_timeout=20, timeout=0)
    offset = pending[-1]["update_id"] + 1 if pending else None
    print(f"\n2. On your phone, open https://t.me/{me['username']} and press Start. Waiting up to 5 minutes…")
    chat = None
    deadline = time.time() + 300
    while time.time() < deadline and not chat:
        for u in tg(token, "getUpdates", http_timeout=40, offset=offset, timeout=25):
            offset = u["update_id"] + 1
            m = u.get("message") or {}
            if (m.get("chat") or {}).get("type") == "private":
                chat = m["chat"]
                break
    if not chat:
        sys.exit("No message arrived. Run the setup again and press Start in the chat with your bot.")
    tg(token, "getUpdates", http_timeout=20, offset=offset, timeout=0)  # mark it as read
    print(f"   Found your chat ({chat.get('first_name', 'you')}).\n")
    cfg = core.load_config()
    times = ask_times(cfg)
    app_url = ask("Address of the app for your phone, e.g. https://you.github.io/ppuri/ (optional)", cfg.get("app_url", ""))
    cfg["telegram"] = {"token": token, "chat_id": chat["id"]}
    cfg["reminders"] = times
    cfg.pop("reminders_paused", None)
    if app_url:
        cfg["app_url"] = app_url
    core.save_config(cfg)
    try:
        tg(token, "setMyCommands", commands=[{"command": c, "description": d} for c, d in COMMANDS])
    except TelegramError:
        pass
    tg(token, "sendMessage", chat_id=chat["id"], parse_mode="HTML",
       text=f"Connected to <b>뿌리</b>. I'll remind you at {', '.join(times)}. Send /help to see what I can do.")
    print(f"Done. Settings are in {core.config_path()}.")
    print("Keep `python serve.py` running (the reminders and replies come from it).")


def setup_ntfy() -> None:
    print("ntfy sends plain push notifications. Install the ntfy app on your phone first (Android or iOS).")
    print("Anyone who knows the topic name can read it, so keep the suggested random name.\n")
    cfg = core.load_config()
    current = (cfg.get("ntfy") or {})
    topic = ask("Topic name", current.get("topic") or f"ppuri-{secrets.token_hex(5)}")
    server = ask("ntfy server", current.get("server") or "https://ntfy.sh")
    times = ask_times(cfg)
    app_url = ask("Address of the app for your phone (optional)", cfg.get("app_url", ""))
    cfg["ntfy"] = {"server": server, "topic": topic}
    cfg["reminders"] = times
    if app_url:
        cfg["app_url"] = app_url
    core.save_config(cfg)
    try:
        publish_ntfy(server, topic, "뿌리", "Notifications are working. Reminders at " + ", ".join(times) + ".", app_url or None)
    except OSError as exc:
        sys.exit(f"Saved, but the test notification failed: {exc}")
    print(f"\nSent a test notification. In the ntfy app, subscribe to the topic: {topic}")


def setup_sync() -> None:
    print("Lets the reminders count reviews you do on your phone. Use the same GitHub token and")
    print("sync code as in the app (Settings, Sync between phone and laptop).\n")
    cfg = core.load_config()
    token = ask("GitHub token")
    gist = ask("Sync code", (cfg.get("github") or {}).get("gist_id", ""))
    if not token or not gist:
        sys.exit("Both the token and the sync code are needed.")
    try:
        prog = core.load_gist(token, gist)
    except Exception as exc:
        sys.exit(f"Could not read the sync file: {exc}")
    if prog is None:
        sys.exit("That gist is not a 뿌리 sync file.")
    cfg["github"] = {"token": token, "gist_id": gist}
    core.save_config(cfg)
    print(f"Done. The sync file has {len(prog.cards)} cards.")
