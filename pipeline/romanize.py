"""Revised Romanization of Korean (국어의 로마자 표기법), per syllable.

romanize_syllables(pron, spelled) romanizes a pronounced form (the dictionary's standard
pronunciation, e.g. 학쌩 for 학생) and uses the spelling to apply the RR conventions
that ignore tensification and always write ㅢ as "ui". When no dictionary pronunciation
exists, pronounce() derives one with the core sound-change rules.

The same algorithm lives in app/src/lib/roman.ts; both are checked against
app/tests/roman-cases.json.
"""
from __future__ import annotations

S_BASE = 0xAC00
INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
FINALS = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
          "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]

INITIAL_RR = dict(zip(INITIALS, ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj",
                                  "ch", "k", "t", "p", "h"]))
VOWEL_RR = dict(zip(VOWELS, ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo",
                              "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]))
FINAL_RR = {"": "", "ㄱ": "k", "ㄲ": "k", "ㅋ": "k", "ㄳ": "k", "ㄺ": "k", "ㄴ": "n", "ㄵ": "n", "ㄶ": "n",
            "ㄷ": "t", "ㅅ": "t", "ㅆ": "t", "ㅈ": "t", "ㅊ": "t", "ㅌ": "t", "ㅎ": "t", "ㄹ": "l", "ㄼ": "l",
            "ㄽ": "l", "ㄾ": "l", "ㅀ": "l", "ㅁ": "m", "ㄻ": "m", "ㅂ": "p", "ㅍ": "p", "ㄿ": "p", "ㅄ": "p",
            "ㅇ": "ng"}
TENSE_TO_LAX = {"ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ"}
NEUTRAL = {"ㄲ": "ㄱ", "ㅋ": "ㄱ", "ㄳ": "ㄱ", "ㄺ": "ㄱ", "ㅅ": "ㄷ", "ㅆ": "ㄷ", "ㅈ": "ㄷ", "ㅊ": "ㄷ",
           "ㅌ": "ㄷ", "ㅎ": "ㄷ", "ㅍ": "ㅂ", "ㄿ": "ㅂ", "ㅄ": "ㅂ", "ㄵ": "ㄴ", "ㄶ": "ㄴ", "ㄼ": "ㄹ",
           "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㅀ": "ㄹ", "ㄻ": "ㅁ"}
SPLIT = {"ㄳ": ("ㄱ", "ㅅ"), "ㄵ": ("ㄴ", "ㅈ"), "ㄺ": ("ㄹ", "ㄱ"), "ㄻ": ("ㄹ", "ㅁ"), "ㄼ": ("ㄹ", "ㅂ"),
         "ㄽ": ("ㄹ", "ㅅ"), "ㄾ": ("ㄹ", "ㅌ"), "ㄿ": ("ㄹ", "ㅍ"), "ㅄ": ("ㅂ", "ㅅ")}
ASPIRATE = {"ㄱ": "ㅋ", "ㄷ": "ㅌ", "ㅂ": "ㅍ", "ㅈ": "ㅊ"}


def is_syl(ch: str) -> bool:
    return len(ch) == 1 and 0xAC00 <= ord(ch) <= 0xD7A3


def split(ch: str):
    c = ord(ch) - S_BASE
    return [INITIALS[c // 588], VOWELS[(c // 28) % 21], FINALS[c % 28]]


def join(parts) -> str:
    l, v, t = parts
    return chr(S_BASE + (INITIALS.index(l) * 21 + VOWELS.index(v)) * 28 + FINALS.index(t))


def pronounce(text: str) -> str:
    """Standard-pronunciation approximation: liaison, ㅎ rules, neutralization, nasalization, ㄹ rules."""
    chars = list(text)
    syl = [split(c) if is_syl(c) else None for c in chars]
    for i, cur in enumerate(syl):
        nxt = syl[i + 1] if i + 1 < len(syl) else None
        if cur is None:
            continue
        t = cur[2]
        if nxt is None:
            cur[2] = NEUTRAL.get(t, t)
            continue
        l2 = nxt[0]
        if l2 == "ㅇ":
            if t in ("", "ㅇ"):
                continue
            if t == "ㅎ":
                cur[2] = ""
            elif t in ("ㄶ", "ㅀ"):
                cur[2], nxt[0] = "", "ㄴ" if t == "ㄶ" else "ㄹ"
            elif t in SPLIT:
                cur[2], nxt[0] = SPLIT[t]
            elif t in ("ㄷ", "ㅌ") and nxt[1] == "ㅣ" and nxt[2] == "":
                cur[2], nxt[0] = "", "ㅈ" if t == "ㄷ" else "ㅊ"  # 같이 -> 가치
            else:
                cur[2], nxt[0] = "", t
            continue
        # ㅎ before or after a consonant
        if t in ("ㅎ", "ㄶ", "ㅀ"):
            rest = {"ㅎ": "", "ㄶ": "ㄴ", "ㅀ": "ㄹ"}[t]
            if l2 in ("ㄱ", "ㄷ", "ㅈ"):
                cur[2], nxt[0] = rest, ASPIRATE[l2]
            elif l2 == "ㅅ":
                cur[2], nxt[0] = rest, "ㅆ"
            elif l2 == "ㄴ":
                cur[2] = rest or "ㄴ"
            else:
                cur[2] = NEUTRAL[t]
            t = cur[2]
        elif l2 == "ㅎ" and (t in ASPIRATE or t in ("ㄺ", "ㄼ", "ㄵ") or NEUTRAL.get(t) == "ㄷ"):
            if t in ("ㄺ", "ㄼ", "ㄵ"):
                keep, base = SPLIT[t]
            else:
                keep, base = "", NEUTRAL.get(t, t)
            cur[2], nxt[0] = keep, ASPIRATE[base]
            continue
        # neutralize the final before a consonant (ㄺ before ㄱ keeps ㄹ: 읽고 -> 일꼬)
        if t == "ㄺ" and l2 == "ㄱ":
            t = "ㄹ"
        else:
            t = NEUTRAL.get(t, t)
        # ㄹ after other consonants becomes ㄴ; ㄴ and ㄹ assimilate to ㄹㄹ
        if l2 == "ㄹ" and t in ("ㄱ", "ㄷ", "ㅂ", "ㅁ", "ㅇ"):
            nxt[0] = l2 = "ㄴ"
        elif l2 == "ㄹ" and t == "ㄴ":
            t = "ㄹ"
        elif l2 == "ㄴ" and t == "ㄹ":
            nxt[0] = l2 = "ㄹ"
        # nasalization
        if t in ("ㄱ", "ㄷ", "ㅂ") and l2 in ("ㄴ", "ㅁ"):
            t = {"ㄱ": "ㅇ", "ㄷ": "ㄴ", "ㅂ": "ㅁ"}[t]
        cur[2] = t
    return "".join(join(s) if s is not None else c for s, c in zip(syl, chars))


def romanize_syllables(pron: str, spelled: str | None = None, noun: bool = False) -> list:
    """One romanized string per Hangul syllable of `pron` (non-Hangul characters are skipped)."""
    p = [split(c) for c in pron if is_syl(c)]
    s = [split(c) for c in (spelled or "") if is_syl(c)]
    aligned = len(s) == len(p)
    out = []
    for i, (l, v, t) in enumerate(p):
        if aligned:
            sl, sv, _st = s[i]
            fused = sl == "ㅅ" and i > 0 and s[i - 1][2] in ("ㅎ", "ㄶ", "ㅀ")  # 좋습니다: ㅎ+ㅅ, not tensification
            if l in TENSE_TO_LAX and TENSE_TO_LAX[l] == sl and not fused:
                l = sl  # RR ignores tensification
            v = sv  # vowels follow the spelling (희망 -> huimang)
        init = INITIAL_RR[l]
        if l == "ㄹ" and i > 0 and p[i - 1][2] == "ㄹ":
            init = "l"
        out.append(init + VOWEL_RR[v] + FINAL_RR[t])
        # nouns keep ㄱ/ㄷ/ㅂ + ㅎ apart (입학 -> iphak, 묵호 -> mukho)
        if noun and aligned and i > 0 and s[i][0] == "ㅎ" and s[i - 1][2] in ("ㄱ", "ㄷ", "ㅂ"):
            pl = p[i - 1][0]
            if pl in TENSE_TO_LAX and TENSE_TO_LAX[pl] == s[i - 1][0]:
                pl = s[i - 1][0]
            prev_init = INITIAL_RR[pl]
            out[i - 1] = prev_init + VOWEL_RR[s[i - 1][1]] + FINAL_RR[s[i - 1][2]]
            out[i] = "h" + VOWEL_RR[v] + FINAL_RR[t]
    return out


def join_syllables(parts: list) -> str:
    """Join per-syllable romanization, adding a hyphen where syllables could be misread (jung-ang)."""
    text = ""
    for part in parts:
        if text and part and part[0] in "aeiouwy" and (text.endswith("n") or text.endswith("ng")):
            text += "-"
        text += part
    return text


def romanize(text: str, pron: str | None = None, noun: bool = False) -> str:
    """Word or phrase romanization; spaces are kept."""
    words = text.split(" ")
    prons = (pron or "").split(" ") if pron and len(pron.split(" ")) == len(words) else [None] * len(words)
    out = []
    for w, pw in zip(words, prons):
        out.append(join_syllables(romanize_syllables(pw or pronounce(w), w, noun)))
    return " ".join(out)
