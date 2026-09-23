// Display helpers.
const POS_EN: Record<string, string> = {
  명사: 'noun',
  동사: 'verb',
  형용사: 'adjective',
  부사: 'adverb',
  관형사: 'determiner',
  '의존 명사': 'bound noun',
  수사: 'numeral',
  접사: 'affix',
  대명사: 'pronoun',
  감탄사: 'interjection',
  조사: 'particle',
  '품사 없음': 'expression',
};

export const posLabel = (p: string[]) => p.map((x) => POS_EN[x] ?? x).join(' / ');
export const levelLabel = (l: number) => (l === 1 ? '초급' : '중급');
export const levelTitle = (l: number) => (l === 1 ? 'Beginner (TOPIK 1–2)' : 'Intermediate (TOPIK 3–4)');

export function interval(from: Date, to: Date): string {
  const m = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const mo = d / 30.4;
  if (mo < 12) return `${mo < 10 ? mo.toFixed(1).replace(/\.0$/, '') : Math.round(mo)} mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')} y`;
}

export const nf = new Intl.NumberFormat('en-US');

export function koreanDate(d = new Date()): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Wrap occurrences of a word (or a verb's stem) in an example sentence. */
export function highlightParts(sentence: string, word: string): { text: string; hit: boolean }[] {
  const core = word.replace(/-/g, '').replace(/다$/, '');
  const needle = core.length >= 1 ? core : word;
  const idx = sentence.indexOf(needle);
  if (idx < 0 || !needle) return [{ text: sentence, hit: false }];
  return [
    { text: sentence.slice(0, idx), hit: false },
    { text: sentence.slice(idx, idx + needle.length), hit: true },
    { text: sentence.slice(idx + needle.length), hit: false },
  ];
}
