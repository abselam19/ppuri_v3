// Revised Romanization of Korean, per syllable. Mirrors pipeline/romanize.py;
// both are checked against tests/roman-cases.json.
const S_BASE = 0xac00;
const INITIALS = Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
const VOWELS = Array.from('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ');
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const zip = (keys: string[], vals: string[]) => Object.fromEntries(keys.map((k, i) => [k, vals[i]])) as Record<string, string>;
const INITIAL_RR = zip(INITIALS, ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']);
const VOWEL_RR = zip(VOWELS, ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']);
const FINAL_RR: Record<string, string> = {
  '': '', ㄱ: 'k', ㄲ: 'k', ㅋ: 'k', ㄳ: 'k', ㄺ: 'k', ㄴ: 'n', ㄵ: 'n', ㄶ: 'n', ㄷ: 't', ㅅ: 't', ㅆ: 't', ㅈ: 't', ㅊ: 't',
  ㅌ: 't', ㅎ: 't', ㄹ: 'l', ㄼ: 'l', ㄽ: 'l', ㄾ: 'l', ㅀ: 'l', ㅁ: 'm', ㄻ: 'm', ㅂ: 'p', ㅍ: 'p', ㄿ: 'p', ㅄ: 'p', ㅇ: 'ng',
};
const TENSE_TO_LAX: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };
const NEUTRAL: Record<string, string> = {
  ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㄳ: 'ㄱ', ㄺ: 'ㄱ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅌ: 'ㄷ', ㅎ: 'ㄷ', ㅍ: 'ㅂ', ㄿ: 'ㅂ', ㅄ: 'ㅂ',
  ㄵ: 'ㄴ', ㄶ: 'ㄴ', ㄼ: 'ㄹ', ㄽ: 'ㄹ', ㄾ: 'ㄹ', ㅀ: 'ㄹ', ㄻ: 'ㅁ',
};
const SPLIT: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅄ: ['ㅂ', 'ㅅ'],
};
const ASPIRATE: Record<string, string> = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅂ: 'ㅍ', ㅈ: 'ㅊ' };

type Syl = [string, string, string];
const isSyl = (ch: string) => ch.length === 1 && ch.charCodeAt(0) >= S_BASE && ch.charCodeAt(0) <= 0xd7a3;
function split(ch: string): Syl {
  const c = ch.charCodeAt(0) - S_BASE;
  return [INITIALS[Math.floor(c / 588)], VOWELS[Math.floor(c / 28) % 21], FINALS[c % 28]];
}
const join = ([l, v, t]: Syl) => String.fromCharCode(S_BASE + (INITIALS.indexOf(l) * 21 + VOWELS.indexOf(v)) * 28 + FINALS.indexOf(t));

/** Standard-pronunciation approximation for forms the dictionary does not list (conjugations). */
export function pronounce(text: string): string {
  const chars = Array.from(text);
  const syl = chars.map((c) => (isSyl(c) ? split(c) : null));
  for (let i = 0; i < syl.length; i++) {
    const cur = syl[i];
    if (!cur) continue;
    const nxt = syl[i + 1] ?? null;
    let t = cur[2];
    if (!nxt) {
      cur[2] = NEUTRAL[t] ?? t;
      continue;
    }
    let l2 = nxt[0];
    if (l2 === 'ㅇ') {
      if (t === '' || t === 'ㅇ') continue;
      if (t === 'ㅎ') cur[2] = '';
      else if (t === 'ㄶ' || t === 'ㅀ') [cur[2], nxt[0]] = ['', t === 'ㄶ' ? 'ㄴ' : 'ㄹ'];
      else if (SPLIT[t]) [cur[2], nxt[0]] = SPLIT[t];
      else if ((t === 'ㄷ' || t === 'ㅌ') && nxt[1] === 'ㅣ' && nxt[2] === '') [cur[2], nxt[0]] = ['', t === 'ㄷ' ? 'ㅈ' : 'ㅊ'];
      else [cur[2], nxt[0]] = ['', t];
      continue;
    }
    if (t === 'ㅎ' || t === 'ㄶ' || t === 'ㅀ') {
      const rest = { ㅎ: '', ㄶ: 'ㄴ', ㅀ: 'ㄹ' }[t];
      if (l2 === 'ㄱ' || l2 === 'ㄷ' || l2 === 'ㅈ') [cur[2], nxt[0]] = [rest, ASPIRATE[l2]];
      else if (l2 === 'ㅅ') [cur[2], nxt[0]] = [rest, 'ㅆ'];
      else if (l2 === 'ㄴ') cur[2] = rest || 'ㄴ';
      else cur[2] = NEUTRAL[t];
      t = cur[2];
    } else if (l2 === 'ㅎ' && (ASPIRATE[t] || t === 'ㄺ' || t === 'ㄼ' || t === 'ㄵ' || NEUTRAL[t] === 'ㄷ')) {
      const [keep, base] = t === 'ㄺ' || t === 'ㄼ' || t === 'ㄵ' ? SPLIT[t] : ['', NEUTRAL[t] ?? t];
      [cur[2], nxt[0]] = [keep, ASPIRATE[base]];
      continue;
    }
    t = t === 'ㄺ' && l2 === 'ㄱ' ? 'ㄹ' : (NEUTRAL[t] ?? t);
    if (l2 === 'ㄹ' && ['ㄱ', 'ㄷ', 'ㅂ', 'ㅁ', 'ㅇ'].includes(t)) nxt[0] = l2 = 'ㄴ';
    else if (l2 === 'ㄹ' && t === 'ㄴ') t = 'ㄹ';
    else if (l2 === 'ㄴ' && t === 'ㄹ') nxt[0] = l2 = 'ㄹ';
    if ((t === 'ㄱ' || t === 'ㄷ' || t === 'ㅂ') && (l2 === 'ㄴ' || l2 === 'ㅁ')) t = { ㄱ: 'ㅇ', ㄷ: 'ㄴ', ㅂ: 'ㅁ' }[t];
    cur[2] = t;
  }
  return chars.map((c, i) => (syl[i] ? join(syl[i]!) : c)).join('');
}

/** One romanized string per Hangul syllable of `pron`. */
export function romanizeSyllables(pron: string, spelled?: string, noun = false): string[] {
  const p = Array.from(pron).filter(isSyl).map(split);
  const s = Array.from(spelled ?? '').filter(isSyl).map(split);
  const aligned = s.length === p.length;
  const out: string[] = [];
  p.forEach(([l0, v0, t], i) => {
    let l = l0;
    let v = v0;
    if (aligned) {
      const [sl, sv] = s[i];
      const fused = sl === 'ㅅ' && i > 0 && ['ㅎ', 'ㄶ', 'ㅀ'].includes(s[i - 1][2]);
      if (TENSE_TO_LAX[l] === sl && !fused) l = sl;
      v = sv;
    }
    const init = l === 'ㄹ' && i > 0 && p[i - 1][2] === 'ㄹ' ? 'l' : INITIAL_RR[l];
    out.push(init + VOWEL_RR[v] + FINAL_RR[t]);
    if (noun && aligned && i > 0 && s[i][0] === 'ㅎ' && ['ㄱ', 'ㄷ', 'ㅂ'].includes(s[i - 1][2])) {
      let pl = p[i - 1][0];
      if (TENSE_TO_LAX[pl] === s[i - 1][0]) pl = s[i - 1][0];
      out[i - 1] = INITIAL_RR[pl] + VOWEL_RR[s[i - 1][1]] + FINAL_RR[s[i - 1][2]];
      out[i] = 'h' + VOWEL_RR[v] + FINAL_RR[t];
    }
  });
  return out;
}

export function joinSyllables(parts: string[]): string {
  let text = '';
  for (const part of parts) {
    if (text && part && 'aeiouwy'.includes(part[0]) && (text.endsWith('n') || text.endsWith('ng'))) text += '-';
    text += part;
  }
  return text;
}

/** Romanize a word or phrase (spaces kept). `pron` is the dictionary pronunciation when known. */
export function romanize(text: string, pron?: string, noun = false): string {
  const words = text.split(' ');
  const prons = pron && pron.split(' ').length === words.length ? pron.split(' ') : [];
  return words.map((w, i) => joinSyllables(romanizeSyllables(prons[i] || pronounce(w), w, noun))).join(' ');
}
