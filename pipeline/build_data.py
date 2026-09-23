#!/usr/bin/env python3
"""Build the 뿌리 data bundle from NIKL's 한국어기초사전 (Basic Korean Dictionary).

Inputs
  --krdict DIR     folder with the dictionary's LMF XML files (full download from
                   https://krdict.korean.go.kr -> 사전 내려받기, or the GitHub mirror)
  --hanja FILE     libhangul data/hanja/hanja.txt (Korean 훈음 per character, BSD-3)
  --unihan FILE    Unihan kDefinition.txt (English gloss per character, Unicode License v3)
Optional
  wordfreq (pip)   Korean word frequencies, used only to order the study path

Output
  --out FILE       JSON bundle read by the app (default ../app/public/data/ppuri-data.json)
  --report FILE    human-readable build report (default report.txt next to this script)
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import glob
import json
import math
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

from romanize import pronounce, romanize_syllables

HERE = os.path.dirname(os.path.abspath(__file__))
HANJA_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
HANGUL_RE = re.compile(r"[\uac00-\ud7a3]")
LEVELS = {"초급": 1, "중급": 2, "고급": 3}
TARGET_LEVELS = (1, 2)
DEFAULT_OUT = os.path.join(HERE, "..", "app", "public", "data", "ppuri-data.json")
VA = ("동사", "형용사")

# ---------------------------------------------------------------- hangul utils
S_BASE, L_COUNT, V_COUNT, T_COUNT = 0xAC00, 19, 21, 28
T_LIST = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
          "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]


def split_syl(ch: str):
    code = ord(ch) - S_BASE
    return code // (V_COUNT * T_COUNT), (code // T_COUNT) % V_COUNT, code % T_COUNT


def join_syl(l: int, v: int, t: int) -> str:
    return chr(S_BASE + (l * V_COUNT + v) * T_COUNT + t)


def is_syl(ch: str) -> bool:
    return len(ch) == 1 and 0xAC00 <= ord(ch) <= 0xD7A3


def final_of(ch: str) -> str:
    return T_LIST[split_syl(ch)[2]] if is_syl(ch) else ""


def add_final(ch: str, jamo: str) -> str:
    l, v, t = split_syl(ch)
    if t == 0:
        return join_syl(l, v, T_LIST.index(jamo))
    if T_LIST[t] == "ㄹ" and jamo == "ㅁ":
        return join_syl(l, v, T_LIST.index("ㄻ"))
    return ""


# ---------------------------------------------------------------- dictionary
_FIX = re.compile(r'val="(.*?)" />')


def _fix_attr(m):
    return 'val="' + m.group(1).replace("<", "&lt;").replace(">", "&gt;") + '" />'


def feats(el):
    return {x.get("att"): x.get("val") for x in el.findall("feat")}


def load_krdict(folder: str):
    files = sorted(glob.glob(os.path.join(folder, "*.xml")))
    if not files:
        sys.exit(f"No XML files found in {folder}")
    out, created = [], None
    for fn in files:
        with open(fn, encoding="utf-8") as fh:
            txt = _FIX.sub(_fix_attr, fh.read())  # a few dumps carry raw '<' inside values
        root = ET.fromstring(txt.encode("utf-8"))
        gi = root.find("GlobalInformation")
        if gi is not None and created is None:
            created = feats(gi).get("creationDate")
        for el in root.iter("LexicalEntry"):
            f = feats(el)
            lemma = el.find("Lemma")
            word = feats(lemma).get("writtenForm") if lemma is not None else None
            if not word:
                continue
            e = {
                "id": int(el.get("val")),
                "word": word.strip(),
                "hom": int(f.get("homonym_number") or 0),
                "unit": f.get("lexicalUnit"),
                "pos": f.get("partOfSpeech") or "",
                "level": LEVELS.get(f.get("vocabularyLevel"), 0),
                "origin": unicodedata.normalize("NFC", f["origin"]) if f.get("origin") else None,
                "conj": [],
                "rel": [],
                "senses": [],
                "pron": None,
            }
            for w in el.findall("WordForm"):
                wf = feats(w)
                if wf.get("type") == "발음" and wf.get("pronunciation") and e["pron"] is None:
                    e["pron"] = wf["pronunciation"]
                if wf.get("type") == "활용" and wf.get("writtenForm"):
                    alts = [feats(r).get("writtenForm") for r in w.findall("FormRepresentation")
                            if feats(r).get("type") == "준말"]
                    e["conj"].append([wf["writtenForm"]] + [a for a in alts if a])
            for r in el.findall("RelatedForm"):
                rf = feats(r)
                if rf.get("id"):
                    e["rel"].append((rf.get("type"), re.sub(r"\d+$", "", rf.get("writtenForm") or ""), int(rf["id"])))
            for s in el.findall("Sense"):
                sf = feats(s)
                en = None
                for q in s.findall("Equivalent"):
                    qf = feats(q)
                    if qf.get("language") == "영어":
                        en = [(qf.get("lemma") or "").strip(), (qf.get("definition") or "").strip()]
                exs = []
                for x in s.findall("SenseExample"):
                    xf = x.findall("feat")
                    kind = next((a.get("val") for a in xf if a.get("att") == "type"), None)
                    vals = [a.get("val") for a in xf if a.get("att") == "example" and a.get("val")]
                    if kind in ("문장", "대화") and vals:
                        exs.append((kind, vals))
                rels = [(feats(r).get("type"), feats(r).get("lemma")) for r in s.findall("SenseRelation")]
                e["senses"].append({"def": sf.get("definition") or "", "en": en, "ex": exs, "rel": rels})
            out.append(e)
    return out, created


# ---------------------------------------------------------------- hanja data
def load_hanja(path: str):
    """libhangul hanja.txt -> {char: {'readings': set, 'hun': {reading: [훈,...]}}}"""
    info = collections.defaultdict(lambda: {"readings": set(), "hun": collections.defaultdict(list)})
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or line.count(":") < 2:
                continue
            reading, hanja, gloss = line.rstrip("\n").split(":", 2)
            if len(hanja) != 1 or len(reading) != 1:
                continue
            ch = unicodedata.normalize("NFC", hanja)
            info[ch]["readings"].add(reading)
            for part in gloss.split(","):
                part = part.strip()
                m = re.match(r"^(.*\S)\s+(\S)$", part)
                if m and m.group(1) not in info[ch]["hun"][m.group(2)]:
                    info[ch]["hun"][m.group(2)].append(m.group(1))
    return info


def load_unihan(path: str):
    defs = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("U+"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3 and parts[1] == "kDefinition":
                ch = chr(int(parts[0][2:].split()[0], 16))
                text = re.sub(r";?\s*Kangxi radical \d+", "", parts[2]).strip(" ;")
                defs[unicodedata.normalize("NFC", ch)] = text
    return defs


def load_freq():
    try:
        from wordfreq import get_frequency_dict  # type: ignore
        return get_frequency_dict("ko", wordlist="best")
    except Exception:  # wordfreq is optional
        return {}


# ---------------------------------------------------------------- alignment
def align(word: str, origin: str | None, hanja_info, warnings):
    """Pair each syllable of the headword with its hanja (or None)."""
    if not origin or not HANJA_RE.search(origin):
        return None
    o = origin.split("/")[0]
    o_chars = [c for c in o if HANJA_RE.match(c) or HANGUL_RE.match(c)]
    w_chars = [c for c in word if HANGUL_RE.match(c)]
    if len(o_chars) != len(w_chars):
        # common case: the origin omits a native tail such as 하다/히/스럽다
        if len(o_chars) < len(w_chars) and all(HANJA_RE.match(c) for c in o_chars):
            # a loanword part written in Latin letters: "tennis場" (테니스장) ends with the hanja,
            # "高速bus" (고속버스) starts with them; bracketed notes such as "ton[豚]kasu" follow the start
            bare = re.sub(r"\[[^\]]*\]", "", o)
            if re.match(r"^[←\s]*[A-Za-z]", bare) and HANJA_RE.search(bare):
                o_chars = w_chars[: len(w_chars) - len(o_chars)] + o_chars
            else:
                o_chars = o_chars + w_chars[len(o_chars):]
        else:
            warnings.append(f"length mismatch: {word} {origin}")
            return None
    seg, bad = [], False
    for syl, oc in zip(w_chars, o_chars):
        if HANGUL_RE.match(oc):
            if oc != syl:
                bad = True
            seg.append([syl, None])
        else:
            readings = hanja_info.get(oc, {}).get("readings", set())
            if readings and syl not in readings:
                warnings.append(f"reading {oc}={sorted(readings)} but {syl} in {word}")
            seg.append([syl, oc])
    if bad:
        warnings.append(f"hangul mismatch: {word} {origin}")
        return None
    return seg


# rule-based pairs that look derived but are not (checked by hand against the dictionary)
BLOCK = {("안다", "안개"), ("줄다", "줄기"), ("바라다", "바람"), ("틀다", "틀리다"), ("틀다", "틈"),
         ("빌다", "빌리다"), ("벌다", "벌어지다"), ("벌다", "벌이다"), ("벌다", "벌리다"),
         ("푸다", "퍼지다"), ("구르다", "구름"), ("기르다", "기름"), ("이르다", "이름")}

# ---------------------------------------------------------------- root glosses
GLOSS_STOP = {"a", "an", "the", "of", "to", "be", "or", "and", "in", "on", "for", "with", "as", "by", "one",
              "someone", "something", "person", "thing", "act", "being", "state"}


def _gloss_tokens(text):
    return [t for t in re.findall(r"[a-z]+", text.lower()) if t not in GLOSS_STOP and len(t) > 2]


# Hand-written English glosses for frequent roots whose first Unihan senses mislead in Korean
# (Unihan describes Chinese usage: 人 "man", 韓 "fence", 曜 "glorious").
<<<<<<< HEAD
# origins the dictionary records that are not Sino-Korean word formation:
# 얼음 is native (얼다 + -음); 乻音 is only an old phonetic spelling of it
BOGUS_ORIGIN = {("얼음", "乻音")}

=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
GLOSS_OVERRIDES = {
    "的": "-ic, -al (makes descriptive words)", "人": "person, people", "學": "learning, study",
    "者": "person who (suffix)", "場": "place, venue", "事": "matter, affair", "行": "go, act; travel",
    "間": "between, interval", "會": "meet; meeting, society", "入": "enter", "物": "thing, object",
    "對": "face, oppose; pair", "數": "number, count", "自": "self", "地": "land, ground", "室": "room",
    "氣": "energy, air, spirit", "內": "inside", "料": "fee; material", "當": "suitable; this very",
    "運": "move, carry; luck", "員": "member, staff", "性": "nature, quality; sex",
    "成": "become, accomplish", "全": "whole, all, complete", "番": "turn, number",
    "方": "direction, way; side", "交": "cross, exchange", "豫": "beforehand",
    "意": "meaning, intention", "發": "emit, start, depart", "主": "master, main", "觀": "view, observe",
    "處": "place; deal with", "本": "origin, basis; book", "務": "duty, work", "無": "no, without",
    "然": "so, thus (suffix)", "等": "rank, grade; equal", "音": "sound", "解": "untie, solve",
    "器": "vessel, device", "接": "connect, receive", "院": "institution, hall", "度": "degree; times",
    "節": "season, festival; joint", "産": "produce, give birth", "映": "reflect, project (film)",
    "案": "plan, proposal", "能": "ability, can", "經": "pass through, manage", "率": "rate, ratio",
    "傳": "pass on, transmit", "專": "specialize, exclusive", "適": "suitable", "調": "adjust, tune",
    "應": "respond", "曜": "shining; day of the week (요일)", "使": "use; send", "格": "standard, grade",
    "士": "scholar, specialist", "係": "relation, in charge", "質": "quality, substance",
    "乘": "ride", "勤": "work, diligent", "直": "straight, direct", "大": "big, great",
    "留": "stay, remain", "褐": "brown",
<<<<<<< HEAD
    # reviewed by hand against the words on the path: the automatic sense misleads for Korean usage
    "以": "from a point: above, below, before, after", "空": "empty; sky, air", "親": "close, intimate; relative",
    "故": "old, former; cause, incident", "張": "stretch; sheet (counter)", "夫": "husband; man, worker",
    "靑": "blue, green; young", "館": "hall, building", "鐵": "iron; railway", "個": "piece (counter); individual",
    "授": "confer, teach", "英": "England; outstanding, hero", "午": "noon", "歲": "year, age",
    "容": "contain, allow; looks", "溫": "warm; temperature", "輩": "peer group (senior, junior)",
    "醬": "sauce, paste", "駐": "park, be stationed", "卓": "table", "育": "raise, educate", "欌": "cabinet, chest",
    "注": "pour; focus attention", "巾": "cloth, towel", "臺": "stand, platform", "目": "eye; aim, item",
    "現": "present, current; appear", "周": "around, circumference", "州": "province (in place names)",
    "消": "vanish; consume, digest", "絡": "connect, contact", "湯": "hot water; soup",
    "配": "distribute, deliver; pair", "甁": "bottle", "待": "wait; treat a guest", "帶": "carry; belt, zone",
    "代": "replace; era",
=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
}


def pick_gloss(definition, lemmas):
    """Choose the Unihan sense that matches how the root is used in Korean words."""
    cands = []
    for gi, group in enumerate(definition.split(";")):
        group = re.sub(r"\(.*?\)", "", group)
        for ci, c in enumerate(x.strip() for x in group.split(",")):
            low = c.lower()
            if c and "surname" not in low and "radical" not in low and not low.startswith("used "):
                cands.append((gi, ci, c))
    if not cands:
        return ""
    bag = collections.Counter(t for lemma in lemmas for t in set(_gloss_tokens(lemma)))

    def overlap(c):
        total = 0
        for t in set(_gloss_tokens(c)):
            for u, n in bag.items():
                if u == t or (len(t) >= 4 and len(u) >= 4 and (u.startswith(t) or t.startswith(u))):
                    total += n
        return total

    best = max(cands, key=lambda x: (overlap(x[2]) + (1.5 if x[0] == 0 else 0), -x[0], -x[1]))
    group = [c for gi, ci, c in cands if gi == best[0]]
    k = group.index(best[2])
    return ", ".join(group[k:k + 2]) if len(group[k]) < 10 and len(group) > k + 1 else group[k]


# ---------------------------------------------------------------- helpers
def english(e, n=3):
    out = []
    for s in e["senses"]:
        if s["en"] and s["en"][0]:
            out.append([s["en"][0], s["en"][1]])
        if len(out) >= n:
            break
    return out


def examples(e, n=2):
    out = []
    for s in e["senses"][:1]:
        for kind, vals in s["ex"]:
            if kind == "문장":
                out.append(vals[0])
            elif kind == "대화" and len(vals) >= 2:
                out.append(" / ".join(vals[:2]))
            if len(out) >= n:
                return out
    return out


def freq_of(e, fd):
    if not fd:
        return 0.0
    w = e["word"].replace("-", "")
    cands = [w]
    if e["pos"] in VA and w.endswith("다"):
        stem = w[:-1]
        cands = [stem[:-1], stem] if stem.endswith("하") and len(stem) > 1 else [stem]
    elif w.endswith("님") and len(w) > 1:
        cands.append(w[:-1])
    return max((fd.get(c, 0.0) for c in cands), default=0.0)


# ---------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--krdict", required=True)
    ap.add_argument("--hanja", required=True)
    ap.add_argument("--unihan", required=True)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--report", default=os.path.join(HERE, "report.txt"))
    args = ap.parse_args()

    entries, created = load_krdict(args.krdict)
    hanja_info = load_hanja(args.hanja)
    unihan = load_unihan(args.unihan)
    fd = load_freq()
    by_id = {e["id"]: e for e in entries}
    by_word = collections.defaultdict(list)
    for e in entries:
        by_word[e["word"]].append(e)
    rep, warnings = [], []
    rep.append(f"dictionary entries: {len(entries)} (snapshot {created})")
    rep.append(f"frequency list: {'wordfreq ' + str(len(fd)) + ' tokens' if fd else 'not installed (path uses fallback order)'}")

    # ---- target selection, merging same-spelling Sino entries that differ only in POS
    target = [e for e in entries if e["level"] in TARGET_LEVELS and e["unit"] == "단어"]
<<<<<<< HEAD
    for e in target:
        if (e["word"], (e["origin"] or "").split("/")[0].replace(" ", "")) in BOGUS_ORIGIN:
            e["origin"] = None
=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
    def lemma_tokens(e):
        en = english(e, 1)
        return set(re.findall(r"[a-z]+", en[0][0].lower())) - {"a", "an", "the", "to", "be", "of"} if en else set()

    merged, seen = [], {}
    for e in sorted(target, key=lambda x: (x["level"], x["id"])):
        key = (e["word"], e["origin"])
        base = seen.get(key)
        is_sino = bool(e["origin"] and HANJA_RE.search(e["origin"]))
        # same spelling, different part of speech, same meaning (교육적 명사/관형사, 오늘 명사/부사)
        if base and base["pos"] != e["pos"] and (is_sino or lemma_tokens(base) & lemma_tokens(e)):
            if e["pos"] not in base["pos_all"]:
                base["pos_all"].append(e["pos"])
            base["alias_ids"].append(e["id"])
            continue
        e["pos_all"], e["alias_ids"] = [e["pos"]], []
        seen.setdefault(key, e)
        merged.append(e)
    target = merged
    tid = {e["id"]: e for e in target}
    alias = {a: e["id"] for e in target for a in e["alias_ids"]}
    rep.append(f"target entries after merging POS duplicates: {len(target)} "
               f"(초급 {sum(e['level'] == 1 for e in target)}, 중급 {sum(e['level'] == 2 for e in target)})")

    for e in target:
        e["seg"] = align(e["word"], e["origin"], hanja_info, warnings)
        e["freq"] = freq_of(e, fd)
        core = e["word"].replace("-", "")
        core = core[:-1] if e["pos"] in VA and core.endswith("다") else core
        if len(core) == 1:  # single syllables collide with particles in corpus counts
            e["freq"] = min(e["freq"], 3e-4)
    homo = collections.Counter(e["word"] for e in target)
    for e in target:
        e["freq"] /= homo[e["word"]]
        e["hanja"] = [h for _, h in (e["seg"] or []) if h]

    # ---- roots: hanja that occur in two or more distinct target words
    occ = collections.defaultdict(set)
    for e in target:
        for h in set(e["hanja"]):
            occ[h].add(e["id"])
    roots = {h for h, ids in occ.items() if len({tid[i]["word"] for i in ids}) >= 2}
    for e in target:
        e["roots"] = sorted({h for h in e["hanja"] if h in roots}, key=e["hanja"].index)
    sino = [e for e in target if e["roots"]]
    native = [e for e in target if not e["roots"]]
    rep.append(f"hanja in target words: {len(occ)}; roots (in 2+ words): {len(roots)}; "
               f"Sino-Korean study items: {len(sino)}; native-track items: {len(native)}")

    # ---- native families -------------------------------------------------
    native_ids = {e["id"] for e in native}
    target_by_word = collections.defaultdict(list)
    for e in target:
        target_by_word[e["word"]].append(e)

    def find_target(word, pos=None):
        """Rule matches must be unambiguous, purely native target words."""
        cands = target_by_word.get(word, [])
        if len(cands) != 1:
            return None
        c = cands[0]
        if c["id"] not in native_ids or (c["origin"] and HANJA_RE.search(c["origin"])):
            return None
        return c if pos is None or c["pos"] in pos else None

    derived = collections.defaultdict(set)   # base id -> member ids
    parent = {}
    link_count = rule_count = 0

    def link(base, member, via):
        nonlocal link_count, rule_count
        if base["id"] == member["id"] or member["id"] in parent:
            return
        if via == "rule" and (base["word"], member["word"]) in BLOCK:
            return
        parent[member["id"]] = base["id"]
        derived[base["id"]].add(member["id"])
        if via == "link":
            link_count += 1
        else:
            rule_count += 1

    # dictionary links first
    for e in native:
        for typ, _w, rid in e["rel"]:
            rid = alias.get(rid, rid)
            other = tid.get(rid)
            if not other or other["id"] not in native_ids:
                continue
            if typ == "파생어":
                link(e, other, "link")
            elif typ == "가봐라" and other["pos"] in VA + ("명사",):
                link(other, e, "link")

    # rule-based derivations (high-precision patterns only)
    CAUS = {"이": set("ㄱㄹㅎ") | {"ㄿ", ""}, "히": set("ㄱㄷㅂㅈ") | {"ㄺ", "ㄼ", "ㄵ"},
            "리": {"ㄹ"}, "기": set("ㄴㅁㅅㅌㅊ"), "추": set("ㅈㅊ") | {"ㅈ"}}
    ALLOWED_SINGLE_M = {"자다": "잠", "추다": "춤", "꾸다": "꿈", "살다": "삶", "알다": "앎", "흐르다": "흐름"}
    for e in native:
        if e["pos"] not in VA or not e["word"].endswith("다") or len(e["word"]) < 2:
            continue
        stem = e["word"][:-1]
        last = stem[-1]
        fin = final_of(last)
        samples = [f for forms in e["conj"] for f in forms]
        aeo = [f for f in samples if f and f[-1] in "아어여해와워래얘때러라져워봐줘돼셔켜서가내세써뻐빠파퍼"]
        # causative / passive verbs
        for suf, finals in CAUS.items():
            if fin in finals:
                cand = find_target(stem + suf + "다", ("동사",))
                if cand:
                    link(e, cand, "rule")
        # 아/어하다 (feel), 아/어지다 (become)
        for f in aeo:
            if f == stem:
                continue  # 가 (가다) + 지다 is 가지다, an unrelated verb
            for tail, pos in (("하다", ("동사",)), ("지다", ("동사",))):
                cand = find_target(f + tail, pos)
                if cand:
                    link(e, cand, "rule")
        # nouns: -기, -음/-ㅁ, -이 (consonant stems), -개
        for cand_word in (stem + "기", stem + "개"):
            cand = find_target(cand_word, ("명사",))
            if cand:
                link(e, cand, "rule")
        if fin:
            for cand_word in ((stem + "음",) if fin != "ㄹ" else ()) + (stem + "이",):
                cand = find_target(cand_word, ("명사", "부사"))
                if cand:
                    link(e, cand, "rule")
        uni = [f[:-1] for f in samples if f and f.endswith("니") and len(f) >= 2]
        for u in uni:
            if fin == "ㄹ" or stem.endswith("르") or (len(stem) == 1 and not fin):
                continue  # 갈다->감, 기르다->기름 and 차다->참 are false friends
            m = u[:-1] + add_final(u[-1], "ㅁ") if add_final(u[-1], "ㅁ") else ""
            if m:
                cand = find_target(m, ("명사",))
                if cand:
                    link(e, cand, "rule")
        if e["word"] in ALLOWED_SINGLE_M:
            cand = find_target(ALLOWED_SINGLE_M[e["word"]], ("명사",))
            if cand:
                link(e, cand, "rule")
        # X하다 adjectives -> X히 / X이 adverbs
        if stem.endswith("하") and len(stem) >= 2:
            for cand_word in (stem[:-1] + "히", stem[:-1] + "이"):
                cand = find_target(cand_word, ("부사",))
                if cand:
                    link(e, cand, "rule")
    # native nouns -> 하다/되다/스럽다 verbs and adjectives
    for e in native:
        if e["pos"] != "명사":
            continue
        for tail in ("하다", "되다", "스럽다", "답다", "롭다", "시키다"):
            cand = find_target(e["word"] + tail, VA)
            if cand:
                link(e, cand, "rule")
    rep.append(f"native derivation links: {link_count} from dictionary, {rule_count} from rules")

    # ---- bridge: 하다/되다/시키다 verbs listed under each noun (any level)
    for e in target:
        bridge = []
        if e["pos"] in ("명사", "의존 명사") or "명사" in e["pos_all"]:
            for typ, w, rid in e["rel"]:
                other = by_id.get(rid)
                if typ == "파생어" and other and other["word"].startswith(e["word"]) and other["pos"] in VA \
                        and other["id"] not in tid and other["id"] not in alias:
                    en = english(other, 1)
                    bridge.append([other["word"], en[0][0] if en else "", other["id"]])
        e["bridge"] = bridge[:4]
    rep.append(f"nouns with 하다/되다 bridge verbs: {sum(1 for e in target if e['bridge'])}")

    # ---- extra (non-target) derivatives for native bases
    for e in native:
        extra = []
        for typ, w, rid in e["rel"]:
            other = by_id.get(rid)
            if typ == "파생어" and other and other["id"] not in tid and other["id"] not in alias:
                en = english(other, 1)
                extra.append([other["word"], en[0][0] if en else "", other["id"]])
        e["extra"] = extra[:5]

    # ---- study path ------------------------------------------------------
    def weight(e):
        return 1.0 + (math.log10(e["freq"] * 1e8) if e["freq"] > 0 else 0.0)

    def greedy_units(words, known, stage):
        """Pick roots one at a time; each unit holds the words that root completes.
        A root that completes nothing yet waits and is shown with the first unit that uses it."""
        units, pending = [], []
        remaining = {e["id"]: e for e in words}
        idx = collections.defaultdict(list)
        for e in words:
            for r in e["roots"]:
                idx[r].append(e)
        ready = [e for e in words if set(e["roots"]) <= known]
        for e in ready:
            remaining.pop(e["id"], None)
        while remaining:
            cands = {r for e in remaining.values() for r in e["roots"] if r not in known}
            if not cands:
                break
            best = max(sorted(cands), key=lambda r: (
                sum(weight(e) / len(set(e["roots"]) - known) for e in idx[r] if e["id"] in remaining),
                len(idx[r])))
            known.add(best)
            pending.append(best)
            done = [e for e in list(remaining.values()) if set(e["roots"]) <= known]
            if not done:
                continue
            for e in done:
                remaining.pop(e["id"])
            done.sort(key=lambda e: -e["freq"])
            used = {r for e in done for r in e["roots"]}
            show = [r for r in pending if r in used]
            pending = [r for r in pending if r not in used]
            for i in range(0, len(done), 8):  # keep units bite-sized
                units.append({"k": "root", "rt": show if i == 0 else [], "w": [e["id"] for e in done[i:i + 8]], "st": stage})
        if pending and units:
            units[-1]["rt"] = units[-1]["rt"] + pending
        return units, ready

    def revisit_units(ready, order, stage):
        """Group already-decodable words under their best-known root."""
        groups = collections.defaultdict(list)
        count = collections.Counter(r for e in ready for r in e["roots"])
        for e in ready:
            anchor = max(e["roots"], key=lambda r: (count[r], -order.get(r, 0)))
            groups[anchor].append(e)
        out = []
        for r in sorted(groups, key=lambda r: order.get(r, 1e9)):
            ws = sorted(groups[r], key=lambda e: -e["freq"])
            for i in range(0, len(ws), 8):
                out.append({"k": "revisit", "rt": [r], "w": [e["id"] for e in ws[i:i + 8]], "st": stage})
        return out

    def native_units(words, stage, placed):
        units = []
        items = sorted(words, key=lambda e: -e["freq"])
        batches = []  # open batches; homographs never share a batch

        def add_single(e):
            for b in batches:
                if len(b) < 6 and all(x["word"] != e["word"] for x in b):
                    b.append(e)
                    break
            else:
                batches.append([e])
            while batches and len(batches[0]) == 6:
                units.append({"k": "batch", "w": [x["id"] for x in batches.pop(0)], "st": stage})

        for e in items:
            if e["id"] in placed:
                continue
            fam = [tid[m] for m in sorted(derived.get(e["id"], ())) if m not in placed and tid[m]["level"] == stage]
            base_placed = e["id"] in parent and parent[e["id"]] in placed
            if fam:
                placed.update([e["id"]] + [m["id"] for m in fam])
                fam.sort(key=lambda m: -m["freq"])
                units.append({"k": "fam", "b": e["id"], "w": [e["id"]] + [m["id"] for m in fam], "st": stage})
            elif e["id"] in parent and not base_placed and tid[parent[e["id"]]]["level"] == stage:
                continue  # will be placed with its base
            else:
                placed.add(e["id"])
                if base_placed:
                    units.append({"k": "fam", "b": parent[e["id"]], "w": [e["id"]], "st": stage, "rv": 1})
                else:
                    add_single(e)
        # anything left (members whose base sat in a later position)
        for e in items:
            if e["id"] not in placed:
                placed.add(e["id"])
                add_single(e)
        for b in [b for b in batches if b]:
            units.append({"k": "batch", "w": [x["id"] for x in b], "st": stage})
        return units

    def interleave(a, b):
        wa = sum(len(u["w"]) for u in a) or 1
        wb = sum(len(u["w"]) for u in b) or 1
        out, i, j, ca, cb = [], 0, 0, 0, 0
        while i < len(a) or j < len(b):
            if j >= len(b) or (i < len(a) and ca / wa <= cb / wb):
                out.append(a[i]); ca += len(a[i]["w"]); i += 1
            else:
                out.append(b[j]); cb += len(b[j]["w"]); j += 1
        return out

    known, root_order, placed_native = set(), {}, set()
    path = []
    for stage in TARGET_LEVELS:
        s_words = [e for e in sino if e["level"] == stage]
        n_words = [e for e in native if e["level"] == stage]
        before = set(known)
        units, ready = greedy_units(s_words, known, stage)
        for u in units:
            for r in u["rt"]:
                root_order.setdefault(r, len(root_order))
        if stage == 1 and ready:  # cannot happen with an empty start, kept for safety
            units = revisit_units(ready, root_order, stage) + units
        elif ready:
            rv = revisit_units(ready, root_order, stage)
            units = interleave(units, rv) if units else rv
        path += interleave(units, native_units(n_words, stage, placed_native))
        rep.append(f"stage {stage}: {len(s_words)} Sino items, {len(known - before)} new roots, "
                   f"{len(ready)} words decodable from earlier roots, {len(n_words)} native items")
    # roots that only occur in words introduced later still need an order
    for r in sorted(roots):
        root_order.setdefault(r, len(root_order))
    in_path = [i for u in path for i in u["w"]]
    assert len(in_path) == len(set(in_path)) == len(target), (len(in_path), len(set(in_path)), len(target))
    rep.append(f"path units: {len(path)}; items: {len(in_path)}; roots introduced: {len(root_order)}")

    # ---- advanced words per root (shown as a preview, not studied)
    adv = collections.defaultdict(list)
    for e in entries:
        if e["level"] == 3 and e["unit"] == "단어" and e["origin"] and HANJA_RE.search(e["origin"]):
            chars = set(unicodedata.normalize("NFC", e["origin"].split("/")[0]))
            en = english(e, 1)
            for h in chars & roots:
                if len(adv[h]) < 6 and en:
                    adv[h].append([e["word"], e["origin"].split("/")[0].replace(" ", ""), en[0][0]])

    # ---- output ----------------------------------------------------------
    def reading_of(h):
        c = collections.Counter(s for e in target for s, x in (e["seg"] or []) if x == h)
        return [s for s, _ in c.most_common(2)]

    words_out = []
    pron_stats = collections.Counter()
    for e in target:
        homs = len(target_by_word[e["word"]])
        rec = {"i": e["id"], "w": e["word"], "p": e["pos_all"], "l": e["level"], "e": english(e)}
        if homs > 1:
            rec["n"] = e["hom"]
        if e["origin"]:
            rec["o"] = e["origin"].split("/")[0].replace(" ", "")
        if e["seg"]:
            rec["s"] = e["seg"]
        if e["roots"]:
            rec["r"] = e["roots"]
        if e["senses"] and e["senses"][0]["def"]:
            rec["k"] = e["senses"][0]["def"]
        ex = examples(e)
        if ex:
            rec["x"] = ex
        if e["pos"] in VA and e["conj"]:
            rec["c"] = e["conj"]
        if e.get("bridge"):
            rec["b"] = [b[:2] for b in e["bridge"]]
        if e["id"] in derived:
            rec["d"] = sorted(derived[e["id"]])
        if e["id"] in parent:
            rec["f"] = parent[e["id"]]
        if e.get("extra"):
            rec["xd"] = [x[:2] for x in e["extra"]]
        # pronunciation and romanization (dictionary pronunciation when it lines up with the spelling)
        core = re.sub(r"[^\uac00-\ud7a3]", "", e["word"])
        pr = re.sub(r"[^\uac00-\ud7a3]", "", (e["pron"] or "").split("/")[0])
        if len(pr) == len(core) and core:
            pron_stats["dictionary"] += 1
        else:
            pr = pronounce(core)
            pron_stats["rules"] += 1
        rec["rr"] = romanize_syllables(pr, core, noun="명사" in e["pos_all"])
        if pr != core:
            rec["pr"] = pr
        rels = [[t, l] for s in e["senses"][:1] for t, l in s["rel"] if t in ("유의어", "반대말") and l][:4]
        if rels:
            rec["y"] = rels
        words_out.append(rec)

    roots_out = []
    for h in sorted(roots, key=lambda r: root_order[r]):
        rd = reading_of(h)
        hun = []
        for r in rd:
            for g in hanja_info.get(h, {}).get("hun", {}).get(r, []):
                if g not in hun:
                    hun.append(g)
        lemmas = [s["en"][0] for i in occ[h] for s in tid[i]["senses"][:1] if s["en"]]
        roots_out.append({"c": h, "rd": rd, "rr": [romanize_syllables(pronounce(r), r)[0] for r in rd], "hun": hun[:3], "en": unihan.get(h, ""), "g": GLOSS_OVERRIDES.get(h) or pick_gloss(unihan.get(h, ""), lemmas),
                          "w": sorted(occ[h], key=lambda i: (tid[i]["level"], -tid[i]["freq"])),
                          "adv": adv.get(h, [])})

    # hanja that occur in a single target word: no root card, but the maps still name them
    singles_out = []
    for h in sorted(set(occ) - roots, key=lambda x: min(occ[x])):
        rd = reading_of(h)
        hun = []
        for r in rd:
            for g in hanja_info.get(h, {}).get("hun", {}).get(r, []):
                if g not in hun:
                    hun.append(g)
        lemmas = [s["en"][0] for i in occ[h] for s in tid[i]["senses"][:1] if s["en"]]
        singles_out.append({"c": h, "rd": rd, "rr": [romanize_syllables(pronounce(r), r)[0] for r in rd], "hun": hun[:2],
                            "g": GLOSS_OVERRIDES.get(h) or pick_gloss(unihan.get(h, ""), lemmas)})

    bundle = {
        "meta": {
            "version": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S"),
            "snapshot": created,
            "counts": {"words": len(words_out), "roots": len(roots_out), "units": len(path),
                       "level1": sum(e["level"] == 1 for e in target), "level2": sum(e["level"] == 2 for e in target)},
            "attribution": "Vocabulary: 국립국어원 한국어기초사전 (CC BY-SA 2.0 KR). Hanja readings: libhangul "
                           "(BSD-3-Clause). English hanja glosses: Unicode Unihan (Unicode License v3). "
                           "Word frequencies: wordfreq (CC BY-SA 4.0).",
        },
        "words": words_out,
        "roots": roots_out,
        "singles": singles_out,
        "path": path,
    }
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    targets = [os.path.abspath(args.out)]
    dist = os.path.join(HERE, "..", "app", "dist")
    if os.path.isdir(dist) and args.out == DEFAULT_OUT:
        targets.append(os.path.abspath(os.path.join(dist, "data", "ppuri-data.json")))  # live without rebuilding the app
    for target in targets:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(payload)
    rep.append(f"pronunciations: {pron_stats['dictionary']} from the dictionary, {pron_stats['rules']} derived by rule")
    rep.append(f"alignment warnings: {len(warnings)}")
    rep.append(f"wrote {', '.join(os.path.relpath(t, HERE) for t in targets)} ({len(payload.encode()) / 1e6:.1f} MB)")
    with open(args.report, "w", encoding="utf-8") as fh:
        fh.write("\n".join(rep) + "\n\n# alignment warnings\n" + "\n".join(warnings) + "\n")
        fh.write("\n# native families (base: members)\n")
        for b, ms in sorted(derived.items(), key=lambda kv: tid[kv[0]]["word"]):
            fh.write(f"{tid[b]['word']}: {' '.join(tid[m]['word'] for m in sorted(ms))}\n")
    print("\n".join(rep))


if __name__ == "__main__":
    main()
