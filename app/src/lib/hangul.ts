// Hangul syllable arithmetic (Unicode block AC00–D7A3).
const SBASE = 0xac00;
const VCOUNT = 21;
const TCOUNT = 28;

export const VOWELS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'] as const;
export const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const;
export const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const;

export type Vowel = (typeof VOWELS)[number];
export type Final = (typeof FINALS)[number];

export interface Syllable {
  i: number; // initial index
  v: Vowel;
  f: Final;
}

export function isSyllable(ch: string | undefined): ch is string {
  if (!ch || ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return c >= SBASE && c <= 0xd7a3;
}

export function split(ch: string): Syllable {
  const code = ch.charCodeAt(0) - SBASE;
  return {
    i: Math.floor(code / (VCOUNT * TCOUNT)),
    v: VOWELS[Math.floor(code / TCOUNT) % VCOUNT],
    f: FINALS[code % TCOUNT],
  };
}

export function join(s: Syllable): string {
  return String.fromCharCode(SBASE + (s.i * VCOUNT + VOWELS.indexOf(s.v)) * TCOUNT + FINALS.indexOf(s.f));
}

export const IEUNG = INITIALS.indexOf('ㅇ');

/** Replace the final consonant of the last syllable. */
export function withFinal(word: string, f: Final): string {
  const last = word.slice(-1);
  return word.slice(0, -1) + join({ ...split(last), f });
}

export function lastSyllable(word: string): Syllable {
  return split(word.slice(-1));
}

/** Attach a single final consonant to a vowel-final word (가 + ㄴ -> 간). */
export function addFinal(word: string, f: Final): string {
  const s = lastSyllable(word);
  if (s.f !== '') throw new Error(`addFinal on closed syllable: ${word}`);
  return withFinal(word, f);
}

export function syllables(word: string): string[] {
  return Array.from(word);
}
