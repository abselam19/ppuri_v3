// The vocabulary bundle produced by pipeline/build_data.py and its in-memory indexes.

export type Level = 1 | 2;

export interface WordRec {
  i: number; // dictionary entry id
  w: string; // headword
  p: string[]; // parts of speech (Korean labels)
  l: Level;
  e: [string, string][]; // English [lemma, definition] per sense
  n?: number; // homonym number, present when several target entries share the spelling
  o?: string; // origin as printed in the dictionary (hanja, loanword source)
  s?: [string, string | null][]; // syllable -> hanja
  r?: string[]; // roots (hanja that occur in 2+ target words)
  k?: string; // Korean definition of the first sense
  x?: string[]; // example sentences
  c?: string[][]; // conjugation samples from the dictionary
  b?: [string, string][]; // 하다/되다 verbs built on this noun
  d?: number[]; // derived target words (native families)
  f?: number; // base word this one derives from
  xd?: [string, string][]; // derived words outside the target list
  y?: [string, string][]; // [relation, word] synonyms / antonyms
  rr?: string[]; // romanization per Hangul syllable (from the standard pronunciation)
  pr?: string; // standard pronunciation in Hangul, when it differs from the spelling
}

export interface RootRec {
  c: string; // hanja
  rd: string[]; // readings, most common first
  hun: string[]; // Korean meanings (훈)
  en: string; // full English definition (Unihan)
  rr?: string[]; // romanization of each reading
  g?: string; // short English gloss chosen for Korean usage
  w: number[]; // target words containing it
  adv: [string, string, string][]; // advanced words: [word, hanja, English]
}

export interface SingleRec {
  c: string; // hanja found in only one target word
  rd: string[];
  hun: string[];
  g: string;
  rr?: string[];
}

export type UnitKind = 'root' | 'revisit' | 'fam' | 'batch';

export interface Unit {
  k: UnitKind;
  rt?: string[];
  w: number[];
  st: Level;
  b?: number;
  rv?: number;
}

export interface Bundle {
  meta: {
    version: string;
    snapshot: string | null;
    counts: { words: number; roots: number; units: number; level1: number; level2: number };
    attribution: string;
  };
  words: WordRec[];
  roots: RootRec[];
  singles?: SingleRec[];
  path: Unit[];
}

export interface AppData {
  bundle: Bundle;
  words: Map<number, WordRec>;
  roots: Map<string, RootRec>;
  singles: Map<string, SingleRec>;
  rootOrder: Map<string, number>;
  unitOf: Map<number, number>; // word id -> path unit index
  homographs: Map<string, number[]>;
  search: { id: number; ko: string; en: string; hanja: string; rr: string }[];
}

export const VA_POS = ['동사', '형용사'];

export const isVerbLike = (w: WordRec) => w.p.some((p) => VA_POS.includes(p)) && w.w.endsWith('다');

export async function loadData(): Promise<AppData> {
  const res = await fetch('./data/ppuri-data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`The vocabulary file could not be loaded (HTTP ${res.status}).`);
  const bundle = (await res.json()) as Bundle;
  const words = new Map(bundle.words.map((w) => [w.i, w]));
  const roots = new Map(bundle.roots.map((r) => [r.c, r]));
  const singles = new Map((bundle.singles ?? []).map((s) => [s.c, s]));
  const rootOrder = new Map(bundle.roots.map((r, i) => [r.c, i]));
  const unitOf = new Map<number, number>();
  bundle.path.forEach((u, i) => u.w.forEach((id) => unitOf.set(id, i)));
  const homographs = new Map<string, number[]>();
  for (const w of bundle.words) homographs.set(w.w, [...(homographs.get(w.w) ?? []), w.i]);
  const search = bundle.words.map((w) => ({
    id: w.i,
    ko: w.w,
    en: w.e.map((e) => e[0]).join('; ').toLowerCase(),
    hanja: w.o ?? '',
    rr: (w.rr ?? []).join(''),
  }));
  return { bundle, words, roots, singles, rootOrder, unitOf, homographs, search };
}

const HANJA = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const HANGUL = /[\uac00-\ud7a3]/;

export function searchWords(data: AppData, query: string, limit = 300): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: number[] = [];
  const prefix: number[] = [];
  const rest: number[] = [];
  if (HANJA.test(q)) {
    const chars = Array.from(q).filter((c) => HANJA.test(c));
    for (const s of data.search) if (chars.every((c) => s.hanja.includes(c))) prefix.push(s.id);
  } else if (HANGUL.test(q)) {
    for (const s of data.search) {
      if (s.ko === q || s.ko === q + '다') exact.push(s.id);
      else if (s.ko.startsWith(q)) prefix.push(s.id);
      else if (s.ko.includes(q)) rest.push(s.id);
    }
  } else {
    const re = new RegExp(`(^|[^a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    for (const s of data.search) {
      const parts = s.en.split(/;\s*/);
      const bare = q.replace(/[-\s]/g, '');
      if (parts.some((p) => p === q || p === `to ${q}`) || s.rr === bare) exact.push(s.id);
      else if (re.test(s.en) || (bare.length >= 3 && s.rr.startsWith(bare))) prefix.push(s.id);
    }
  }
  return [...exact, ...prefix, ...rest].slice(0, limit);
}

export function searchRoots(data: AppData, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.bundle.roots
    .filter((r) => r.c === q || r.rd.includes(q) || !!r.rr?.includes(q) || r.hun.some((h) => h.includes(q)) || r.en.toLowerCase().includes(q))
    .map((r) => r.c);
}

/** Short English gloss for a hanja: first clause of the Unihan definition. */
export function rootGloss(r: RootRec): string {
  if (r.g) return r.g;
  const first = r.en.split(';')[0].split(',').slice(0, 2).join(',').trim();
  return first || r.hun[0] || '';
}
