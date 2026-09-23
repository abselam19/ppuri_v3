"""Shared server logic: configuration, the word list, progress snapshots, the daily plan and message texts."""
from __future__ import annotations

import html
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC_FILE = "ppuri-progress.json"
POS_EN = {"명사": "noun", "동사": "verb", "형용사": "adjective", "부사": "adverb", "관형사": "determiner",
          "의존 명사": "bound noun", "수사": "numeral", "접사": "affix", "대명사": "pronoun", "감탄사": "interjection"}
STATE = {0: "new", 1: "learning", 2: "known", 3: "relearning"}


def config_path() -> str:
    return os.environ.get("PPURI_CONFIG", os.path.join(ROOT, "config.json"))


def progress_dir() -> str:
    return os.environ.get("PPURI_PROGRESS_DIR", os.path.join(ROOT, "progress"))


def github_api() -> str:
    return os.environ.get("PPURI_GITHUB_API", "https://api.github.com")


def log(msg: str) -> None:
    print(f"{datetime.now():%H:%M:%S} {msg}", flush=True)


# ---------------------------------------------------------------- config
def load_config() -> dict:
    try:
        with open(config_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_config(cfg: dict) -> None:
    path = config_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
    try:
        os.chmod(tmp, 0o600)  # holds tokens
    except OSError:
        pass
    os.replace(tmp, path)


# ---------------------------------------------------------------- time
def day_start(now: datetime) -> datetime:
    d = now if now.hour >= 4 else now - timedelta(days=1)
    return d.replace(hour=4, minute=0, second=0, microsecond=0)


def study_day(ts: float):
    return (datetime.fromtimestamp(ts) - timedelta(hours=4)).date()


def in_words(seconds: float) -> str:
    if seconds <= 0:
        return "now"
    minutes = seconds / 60
    if minutes < 60:
        return f"{round(minutes)} min"
    hours = minutes / 60
    if hours < 24:
        return f"{round(hours)} h"
    days = round(hours / 24)
    return f"{days} day" if days == 1 else f"{days} days"


# ---------------------------------------------------------------- word list
def join_rr(parts: list) -> str:
    text = ""
    for part in parts:
        if text and part and part[0] in "aeiouwy" and (text.endswith("n") or text.endswith("ng")):
            text += "-"
        text += part
    return text


class Bundle:
    def __init__(self, path: str | None = None):
        candidates = [path] if path else [os.path.join(ROOT, "app", "dist", "data", "ppuri-data.json"),
                                          os.path.join(ROOT, "app", "public", "data", "ppuri-data.json")]
        found = next((p for p in candidates if p and os.path.exists(p)), None)
        if not found:
            raise FileNotFoundError("ppuri-data.json was not found; run the pipeline first")
        with open(found, encoding="utf-8") as fh:
            b = json.load(fh)
        self.words = {w["i"]: w for w in b["words"]}
        self.roots = {r["c"]: r for r in b["roots"]}
        self.singles = {s["c"]: s for s in b.get("singles", [])}
        self.path = b["path"]
        self.by_spelling: dict = {}
        for w in b["words"]:
            self.by_spelling.setdefault(w["w"], []).append(w)
        self.roots_by_reading: dict = {}
        for r in b["roots"]:
            for rd in r["rd"]:
                self.roots_by_reading.setdefault(rd, []).append(r)
        self.level_total = {lv: sum(1 for w in b["words"] if w["l"] == lv) for lv in (1, 2)}

    def rr(self, w: dict) -> str:
        return join_rr(w.get("rr") or [])

    def en(self, w: dict) -> str:
        return (w["e"][0][0] if w.get("e") else "").split(";")[0].strip()

    def hanja(self, c: str):
        return self.roots.get(c) or self.singles.get(c)

    def gloss(self, c: str) -> str:
        r = self.hanja(c)
        if not r:
            return ""
        return r.get("g") or ", ".join((r.get("en") or "").split(";")[0].split(",")[:2]).strip()

    def reading(self, c: str, spelled: str | None = None):
        r = self.hanja(c) or {"rd": [spelled or "?"], "rr": [""]}
        rd = spelled if spelled in r["rd"] else r["rd"][0]
        rrs = r.get("rr") or []
        idx = r["rd"].index(rd) if rd in r["rd"] else 0
        return rd, (rrs[idx] if idx < len(rrs) else "")

    def search(self, query: str, limit: int = 5) -> list:
        q = query.strip()
        if not q:
            return []
        if re.search(r"[\uac00-\ud7a3]", q):
            hits = self.by_spelling.get(q, []) + self.by_spelling.get(q + "다", [])
            return hits[:limit]
        low = q.lower()
        bare = re.sub(r"[\s-]", "", low)
        exact, loose = [], []
        for w in self.words.values():
            lemmas = [x.strip().lower() for e in w.get("e", []) for x in e[0].split(";")]
            if "".join(w.get("rr") or []) == bare or low in lemmas or f"to {low}" in lemmas:
                exact.append(w)
            elif any(re.search(rf"\b{re.escape(low)}\b", x) for x in lemmas):
                loose.append(w)
        key = lambda w: (w["l"], w["i"])
        return (sorted(exact, key=key) + sorted(loose, key=key))[:limit]


# ---------------------------------------------------------------- progress snapshots
class Progress:
    def __init__(self, cards: dict, logs: list, settings: dict, source: str):
        self.cards = cards  # id -> {due, state, reps, created, known, last} (seconds)
        self.logs = logs  # [(card, seconds)]
        self.settings = {"newPerDay": 20, **(settings or {})}
        self.source = source


def _ts(v) -> float:
    if v in (None, "", 0):
        return 0.0
    if isinstance(v, (int, float)):
        return v / 1000 if v > 1e11 else float(v)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()


def progress_from_export(data: dict) -> Progress:
    """The laptop backup written by the app (progress/latest.json)."""
    cards = {}
    for r in data.get("cards", []):
        f = r.get("fsrs", {})
        cards[r["id"]] = {"due": _ts(f.get("due")), "state": f.get("state", 0), "reps": f.get("reps", 0),
                          "created": _ts(r.get("created")), "known": bool(r.get("known")), "last": _ts(f.get("last_review"))}
    logs = [(l["card"], _ts(l["at"])) for l in data.get("logs", []) if l.get("card")]
    return Progress(cards, logs, data.get("settings") or {}, "laptop backup")


def progress_from_sync(data: dict) -> Progress:
    """The compact sync file shared through a GitHub gist."""
    cards = {}
    for c in data.get("cards", []):
        cid, due, _stab, _diff, _sched, reps, _lapses, state, _steps, last, created, known = c
        cards[cid] = {"due": float(due), "state": state, "reps": reps, "created": float(created), "known": bool(known), "last": float(last)}
    logs = [(l[0], float(l[1])) for l in data.get("logs", [])]
    return Progress(cards, logs, data.get("settings") or {}, "sync file")


def load_local() -> Progress | None:
    try:
        with open(os.path.join(progress_dir(), "latest.json"), encoding="utf-8") as fh:
            return progress_from_export(json.load(fh))
    except (OSError, ValueError, KeyError):
        return None


def github_get(token: str, path: str) -> dict:
    req = urllib.request.Request(github_api() + path, headers={"Authorization": f"Bearer {token}",
                                                               "Accept": "application/vnd.github+json",
                                                               "User-Agent": "ppuri-server"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def load_gist(token: str, gist_id: str) -> Progress | None:
    data = github_get(token, f"/gists/{gist_id}")
    f = (data.get("files") or {}).get(SYNC_FILE)
    if not f:
        return None
    text = f.get("content") or ""
    if f.get("truncated") and f.get("raw_url"):
        with urllib.request.urlopen(f["raw_url"], timeout=30) as res:
            text = res.read().decode("utf-8")
    return progress_from_sync(json.loads(text))


class ProgressSource:
    """Progress from the sync gist when configured (it includes the phone), else the laptop backup."""

    def __init__(self, ttl: float = 300):
        self.ttl = ttl
        self._cache: tuple | None = None

    def get(self) -> Progress | None:
        gh = load_config().get("github") or {}
        if gh.get("token") and gh.get("gist_id"):
            if self._cache and time.time() - self._cache[0] < self.ttl:
                return self._cache[1]
            try:
                prog = load_gist(gh["token"], gh["gist_id"])
                if prog:
                    self._cache = (time.time(), prog)
                    return prog
            except Exception as exc:  # network trouble: fall back to the laptop copy
                log(f"sync file unavailable ({exc}); using the laptop backup")
        return load_local()

    def invalidate(self) -> None:
        self._cache = None


# ---------------------------------------------------------------- the daily plan
def unit_items(unit: dict) -> list:
    return [f"r:{c}" for c in unit.get("rt", [])] + [f"w:{i}" for i in unit["w"]]


def study_plan(bundle: Bundle, prog: Progress | None, now: datetime) -> dict:
    cards = prog.cards if prog else {}
    start = day_start(now).timestamp()
    end = start + 86400
    due = sum(1 for c in cards.values() if c["due"] <= end)
    new_today = sum(1 for cid, c in cards.items() if cid[:1] in "rw" and not c["known"] and c["created"] >= start)
    budget = max(0, int((prog.settings if prog else {}).get("newPerDay", 20)) - new_today)
    chunks, next_unit = [], None
    for ui, unit in enumerate(bundle.path):
        items = [x for x in unit_items(unit) if x not in cards]
        if not items:
            continue
        if next_unit is None:
            next_unit = ui
        if budget <= 0:
            break
        if len(items) > budget + 3:
            if not chunks:
                chunks.append(items[:budget])
            break
        chunks.append(items)
        budget -= len(items)
    logs = prog.logs if prog else []
    days = {study_day(at) for _, at in logs}
    d = study_day(now.timestamp())
    if d not in days:
        d -= timedelta(days=1)
    streak = 0
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    known = {1: 0, 2: 0}
    roots_known = 0
    for cid, c in cards.items():
        done = c["state"] == 2 or c["known"]
        if not done:
            continue
        if cid.startswith("w:"):
            w = bundle.words.get(int(cid[2:]))
            if w:
                known[w["l"]] += 1
        elif cid.startswith("r:"):
            roots_known += 1
    return {"due": due, "new": sum(len(c) for c in chunks), "answered": sum(1 for _, at in logs if at >= start),
            "streak": streak, "next_unit": next_unit, "known": known, "roots_known": roots_known, "started": bool(cards)}


# ---------------------------------------------------------------- message texts (Telegram HTML)
def esc(s) -> str:
    return html.escape(str(s), quote=False)


def plain(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def root_label(bundle: Bundle, c: str, spelled: str | None = None) -> str:
    rd, rr = bundle.reading(c, spelled)
    return f"<b>{esc(rd)}</b> <i>{esc(rr)}</i> {esc(bundle.gloss(c))}"


def word_line(bundle: Bundle, w: dict) -> str:
    return f"<b>{esc(w['w'])}</b> <i>{esc(bundle.rr(w))}</i>  {esc(bundle.en(w))}"


def unit_text(bundle: Bundle, prog: Progress | None, ui: int, limit: int = 6) -> str:
    unit = bundle.path[ui]
    cards = prog.cards if prog else {}
    fresh = [bundle.words[i] for i in unit["w"] if f"w:{i}" not in cards]
    words = (fresh or [bundle.words[i] for i in unit["w"]])[:limit]
    if unit["k"] == "root" and unit.get("rt"):
        head = "New roots: " + " + ".join(root_label(bundle, c) for c in unit["rt"])
    elif unit["k"] in ("root", "revisit") and unit.get("rt"):
        head = "From a root you know: " + root_label(bundle, unit["rt"][0])
    elif unit["k"] == "root":
        head = "More words from the roots you just met"
    elif unit["k"] == "fam" and unit.get("b"):
        head = f"The word family of <b>{esc(bundle.words[unit['b']]['w'])}</b>"
    else:
        head = "Everyday words"
    return "\n".join([head] + [word_line(bundle, w) for w in words])


def today_text(bundle: Bundle, prog: Progress | None, now: datetime) -> str:
    p = study_plan(bundle, prog, now)
    lines = [f"<b>뿌리</b>  {now.month}월 {now.day}일"]
    if prog is None:
        lines.append("No progress found yet. Open 뿌리 on the laptop once (it saves a backup), or set up sync.")
    elif p["due"] + p["new"] == 0:
        lines.append(f"All done for today: {p['answered']} answered.")
    else:
        lines.append(f"<b>{p['due']}</b> to review and <b>{p['new']}</b> new cards are waiting.")
    if prog is not None:
        days = "day" if p["streak"] == 1 else "days"
        lines.append(f"Streak {p['streak']} {days}, {p['answered']} answered today.")
        lines.append(f"Known: 초급 {p['known'][1]}/{bundle.level_total[1]}, 중급 {p['known'][2]}/{bundle.level_total[2]}, "
                     f"roots {p['roots_known']}/{len(bundle.roots)}")
    if p["next_unit"] is not None:
        lines += ["", "<b>Next on your path</b>", unit_text(bundle, prog, p["next_unit"])]
    return "\n".join(lines)


def word_text(bundle: Bundle, prog: Progress | None, w: dict, now: datetime) -> str:
    head = f"<b>{esc(w['w'])}</b>  <i>{esc(bundle.rr(w))}</i>"
    if w.get("pr"):
        head += f"  [{esc(w['pr'])}]"
    pos = ", ".join(POS_EN.get(p, p) for p in w["p"])
    lines = [head, f"{pos}, {'초급' if w['l'] == 1 else '중급'}"]
    for n, (lemma, _d) in enumerate(w.get("e", [])[:3], 1):
        lines.append(f"{n}. {esc(lemma)}")
    parts = [(syl, h) for syl, h in (w.get("s") or []) if h and bundle.hanja(h)]
    if parts:
        lines.append("Roots: " + " + ".join(root_label(bundle, h, syl) for syl, h in parts))
    if w.get("x"):
        lines.append(f"예: {esc(w['x'][0])}")
    card = (prog.cards if prog else {}).get(f"w:{w['i']}")
    if card:
        lines.append(f"Status: {STATE.get(card['state'], 'learning')}, next review in {in_words(card['due'] - now.timestamp())}")
    else:
        lines.append("Status: not studied yet")
    return "\n".join(lines)


def coparents(bundle: Bundle, c: str) -> list:
    """[(hanja, [words])] for the roots that build words together with `c`, most shared first."""
    shared: dict = {}
    for i in bundle.roots[c]["w"]:
        w = bundle.words[i]
        seen = set()
        for syl, h in w.get("s") or []:
            if h and h != c and h not in seen and bundle.hanja(h):
                seen.add(h)
                shared.setdefault(h, []).append(w)
    return sorted(shared.items(), key=lambda kv: (-len(kv[1]), kv[0]))


def root_text(bundle: Bundle, prog: Progress | None, c: str) -> str:
    r = bundle.roots[c]
    rd, rr = bundle.reading(c)
    card = (prog.cards if prog else {}).get(f"r:{c}")
    status = STATE.get(card["state"], "learning") if card else "not studied yet"
    lines = [f"<b>{esc(rd)}</b>  <i>{esc(rr)}</i>  {esc(bundle.gloss(c))}",
             f"{len(r['w'])} words, {status}", "", "<b>Co-parent roots</b>"]
    for h, words in coparents(bundle, c)[:8]:
        spelled = next((syl for syl, x in (words[0].get("s") or []) if x == h), None)
        names = ", ".join(esc(w["w"]) for w in words[:5]) + (" …" if len(words) > 5 else "")
        mark = f" ×{len(words)}" if len(words) > 1 else ""
        lines.append(f"{root_label(bundle, h, spelled)}{mark}: {names}")
    return "\n".join(lines)
