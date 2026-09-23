// Korean verb/adjective conjugation.
// A stem is conjugated by its irregular class; ㄹ-final and ㅡ-final stems follow their
// (regular) sound rules automatically.
import { IEUNG, addFinal, isSyllable, join, lastSyllable, split, withFinal, type Final, type Vowel } from './hangul';

export type ConjClass = 'reg' | 'd' | 'b' | 's' | 'h' | 'reu' | 'reo' | 'u' | 'ha';

export const CLASS_LABEL: Record<ConjClass, string> = {
  reg: 'regular',
  d: 'ㄷ irregular (듣다 → 들어요)',
  b: 'ㅂ irregular (돕다 → 도와요)',
  s: 'ㅅ irregular (짓다 → 지어요)',
  h: 'ㅎ irregular (그렇다 → 그래요)',
  reu: '르 irregular (모르다 → 몰라요)',
  reo: '러 irregular (이르다 → 이르러요)',
  u: '우 irregular (푸다 → 퍼요)',
  ha: '하다 verb (하다 → 해요)',
};

export interface Verb {
  dict: string; // dictionary form, e.g. 먹다
  stem: string; // 먹
  cls: ConjClass;
  adj: boolean; // adjective (descriptive verb)
  exist: boolean; // 있다/없다 family: adnominal takes 는 even as an adjective
}

const YANG: Vowel[] = ['ㅏ', 'ㅑ', 'ㅗ', 'ㅛ'];

function isYang(syl: string | undefined): boolean {
  return !!syl && isSyllable(syl) && YANG.includes(split(syl).v);
}

function stemOf(dict: string): string {
  return dict.replace(/-/g, '').replace(/다$/, '');
}

export function makeVerb(dict: string, cls: ConjClass, adj: boolean): Verb {
  const stem = stemOf(dict);
  return { dict, stem, cls, adj, exist: /(있|없)$/.test(stem) };
}

const lastFinal = (w: string): Final => lastSyllable(w).f;

/** Stem used before 으-type endings ((으)니, (으)면, (으)ㄴ …), without the 으 itself. */
function uBase(v: Verb): { base: string; vowelFinal: boolean; l: boolean } {
  const { stem, cls } = v;
  const f = lastFinal(stem);
  if (cls === 'd' && f === 'ㄷ') return { base: withFinal(stem, 'ㄹ'), vowelFinal: false, l: false };
  if (cls === 'b' && f === 'ㅂ') return { base: withFinal(stem, '') + '우', vowelFinal: true, l: false };
  if (cls === 's' && f === 'ㅅ') return { base: withFinal(stem, ''), vowelFinal: false, l: false };
  if (cls === 'h' && f === 'ㅎ') return { base: withFinal(stem, ''), vowelFinal: true, l: false };
  if (f === 'ㄹ') return { base: stem, vowelFinal: false, l: true };
  return { base: stem, vowelFinal: f === '', l: false };
}

/**
 * Attach a 으-type ending. `jamo` is a final consonant that fuses onto the stem
 * (ㄴ, ㄹ, ㅂ, ㅁ); `rest` is the remaining text.  U('','니까') -> 먹으니까 / 가니까.
 */
export function attachU(v: Verb, jamo: '' | 'ㄴ' | 'ㄹ' | 'ㅂ' | 'ㅁ', rest: string): string {
  const { base, vowelFinal, l } = uBase(v);
  if (l) {
    const bare = withFinal(base, '');
    if (jamo === 'ㄹ') return base + rest; // 살 + ㄹ -> 살
    if (jamo === 'ㅁ') return withFinal(base, 'ㄻ') + rest; // 삶
    if (jamo === 'ㄴ' || jamo === 'ㅂ') return addFinal(bare, jamo) + rest; // 산, 삽시다
    if (/^[니세시셔십]/.test(rest)) return bare + rest; // 사니까, 사세요
    return base + rest; // 살면, 살려고
  }
  if (vowelFinal) return jamo ? addFinal(base, jamo) + rest : base + rest;
  // consonant stems (and ㅅ-irregular 지-, which keeps 으: 지으니)
  return (jamo ? addFinal(base + '으', jamo) : base + '으') + rest;
}

/** Attach a consonant-initial ending (고, 지만, 는 …). */
export function attachC(v: Verb, tail: string): string {
  const { stem } = v;
  if (lastFinal(stem) === 'ㄹ' && /^[ㄴㅂㅅ니네는]/.test(tail)) {
    return withFinal(stem, '') + tail; // 사는, 사네요
  }
  return stem + tail;
}

/** 습니다 / ㅂ니다 */
export function formalStem(v: Verb): string {
  const { stem } = v;
  const f = lastFinal(stem);
  if (f === '') return addFinal(stem, 'ㅂ');
  if (f === 'ㄹ') return addFinal(withFinal(stem, ''), 'ㅂ');
  return stem + '습';
}

// 준말 whose 아/어 form is borrowed from the full verb (머물다 < 머무르다, 이러다 < 이러하다)
const SHORT_FROM_FULL: Record<string, string> = {
  머물: '머물러', 서둘: '서둘러',
  이러: '이래', 저러: '저래', 그러: '그래', 어쩌: '어째',
};

/**
 * Forms of stem + 아/어, most natural spelling first (봐 before 보아).
 * Every returned form ends in an open syllable.
 */
export function aeoForms(v: Verb): string[] {
  const { stem, cls } = v;
  const head = stem.slice(0, -1);
  const last = stem.slice(-1);
  const s = split(last);
  const prevSyl = head.slice(-1);
  const compound = head.length >= 2 && (prevSyl === '아' || prevSyl === '어');
  const prevYang = !compound && isYang(prevSyl);

  if (v.dict === '아니다') return ['아니어', '아니라'];
  if (SHORT_FROM_FULL[stem]) return [SHORT_FROM_FULL[stem]];
  if (cls === 'ha' && last === '하') return [head + '해', head + '하여'];
  if (cls === 'd' && s.f === 'ㄷ') {
    const base = withFinal(stem, 'ㄹ');
    return [base + (isYang(last) ? '아' : '어')];
  }
  if (cls === 'b' && s.f === 'ㅂ') {
    const base = withFinal(stem, '');
    const wa = stem === '돕' || stem === '곱';
    return [base + (wa ? '와' : '워')];
  }
  if (cls === 's' && s.f === 'ㅅ') {
    const base = withFinal(stem, '');
    return [base + (isYang(last) ? '아' : '어')];
  }
  if (cls === 'h' && s.f === 'ㅎ') {
    const repl: Vowel = s.v === 'ㅑ' ? 'ㅒ' : 'ㅐ';
    return [head + join({ ...s, v: repl, f: '' })];
  }
  if (cls === 'reu' && last === '르' && head) {
    const yang = isYang(head.slice(-1));
    return [withFinal(head, 'ㄹ') + (yang ? '라' : '러')];
  }
  if (cls === 'reo' && last === '르') return [stem + '러'];
  if (cls === 'u' && s.v === 'ㅜ' && s.f === '') return [head + join({ ...s, v: 'ㅓ' })];

  if (s.f !== '') {
    const regular = stem + (isYang(last) ? '아' : '어');
    return last === '놓' ? [regular, head + '놔'] : [regular];
  }

  // open final syllable: vowel contraction rules
  switch (s.v) {
    case 'ㅏ':
    case 'ㅓ':
    case 'ㅕ':
      return [stem];
    case 'ㅐ':
    case 'ㅔ':
      return [stem, stem + '어'];
    case 'ㅗ':
      if (s.i === IEUNG) return [head + '와']; // 오다, 나오다, 돌아오다
      return [head + join({ ...s, v: 'ㅘ' }), stem + '아'];
    case 'ㅜ':
      return [head + join({ ...s, v: 'ㅝ' }), stem + '어'];
    case 'ㅣ':
      if (s.i === IEUNG && !head) return [stem + '어'];
      return [head + join({ ...s, v: 'ㅕ' }), stem + '어'];
    case 'ㅚ':
      return [head + join({ ...s, v: 'ㅙ' }), stem + '어'];
    case 'ㅡ': {
      // 으 drops: 쓰 -> 써, 바쁘 -> 바빠
      const repl: Vowel = head && prevYang ? 'ㅏ' : 'ㅓ';
      return [head + join({ ...s, v: repl })];
    }
    default:
      return [stem + (isYang(last) ? '아' : '어')];
  }
}

export const aeo = (v: Verb) => aeoForms(v)[0];
export const pastStem = (v: Verb, form = aeo(v)) => withFinal(form, 'ㅆ');


// ---------------------------------------------------------------- form table
export interface FormSpec {
  key: string;
  label: string; // English description
  grammar: string; // Korean grammar pattern
  verbOnly?: boolean;
  adjOnly?: boolean;
  make: (v: Verb) => string[]; // first = preferred, rest = accepted alternatives
}

const alts = (v: Verb, fn: (x: string) => string) => aeoForms(v).map(fn);
const noun = (v: Verb) => (v.adj && !v.exist ? attachU(v, 'ㄴ', '') : attachC(v, '는'));

function plainPresent(v: Verb): string {
  if (v.adj || v.exist) return v.stem + '다';
  const f = lastFinal(v.stem);
  if (f === '') return addFinal(v.stem, 'ㄴ') + '다'; // 간다
  if (f === 'ㄹ') return addFinal(withFinal(v.stem, ''), 'ㄴ') + '다'; // 산다
  return v.stem + '는다'; // 먹는다
}

const HONORIFIC: Record<string, string> = {
  먹다: '드세요',
  마시다: '드세요',
  자다: '주무세요',
  있다: '계세요',
  말하다: '말씀하세요',
  죽다: '돌아가세요',
};

export const FORMS: FormSpec[] = [
  { key: 'pres', label: 'Present, polite', grammar: '-아/어요', make: (v) => (v.dict === '아니다' ? ['아니에요', '아니어요'] : alts(v, (a) => a + '요')) },
  { key: 'past', label: 'Past, polite', grammar: '-았/었어요', make: (v) => (v.dict === '아니다' ? ['아니었어요'] : alts(v, (a) => pastStem(v, a) + '어요')) },
  { key: 'fut', label: 'Future or guess, polite', grammar: '-(으)ㄹ 거예요', make: (v) => [attachU(v, 'ㄹ', ' 거예요')] },
  { key: 'formal', label: 'Present, formal', grammar: '-(스)ㅂ니다', make: (v) => [formalStem(v) + '니다'] },
  { key: 'pastformal', label: 'Past, formal', grammar: '-았/었습니다', make: (v) => (v.dict === '아니다' ? ['아니었습니다'] : alts(v, (a) => pastStem(v, a) + '습니다')) },
  { key: 'plain', label: 'Present, plain (writing)', grammar: '-(는)다', make: (v) => [plainPresent(v)] },
  { key: 'honor', label: 'Honorific polite / polite request', grammar: '-(으)세요', make: (v) => [HONORIFIC[v.dict] ?? attachU(v, '', '세요'), ...(HONORIFIC[v.dict] ? [attachU(v, '', '세요')] : [])] },
  { key: 'and', label: 'And / then', grammar: '-고', make: (v) => [attachC(v, '고')] },
  { key: 'so', label: 'So / because (sequence)', grammar: '-아/어서', make: (v) => alts(v, (a) => a + '서') },
  { key: 'if', label: 'If', grammar: '-(으)면', make: (v) => [attachU(v, '', '면')] },
  { key: 'because', label: 'Because', grammar: '-(으)니까', make: (v) => [attachU(v, '', '니까')] },
  { key: 'but', label: 'But', grammar: '-지만', make: (v) => [attachC(v, '지만')] },
  { key: 'bg', label: 'Background (and, but…)', grammar: '-는데 / -(으)ㄴ데', make: (v) => [v.adj && !v.exist ? attachU(v, 'ㄴ', '데') : attachC(v, '는데')] },
  { key: 'adn', label: 'Before a noun, present', grammar: '-는 / -(으)ㄴ', make: (v) => [noun(v)] },
  { key: 'adnpast', label: 'Before a noun, past', grammar: '-(으)ㄴ', verbOnly: true, make: (v) => [attachU(v, 'ㄴ', '')] },
  { key: 'adnfut', label: 'Before a noun, future', grammar: '-(으)ㄹ', make: (v) => [attachU(v, 'ㄹ', '')] },
  { key: 'neg', label: 'Negative, polite', grammar: '-지 않아요', make: (v) => [attachC(v, '지 않아요')] },
  { key: 'want', label: 'Want to', grammar: '-고 싶어요', verbOnly: true, make: (v) => [attachC(v, '고 싶어요')] },
  { key: 'prog', label: 'Doing right now', grammar: '-고 있어요', verbOnly: true, make: (v) => [attachC(v, '고 있어요')] },
  { key: 'can', label: 'Can', grammar: '-(으)ㄹ 수 있어요', verbOnly: true, make: (v) => [attachU(v, 'ㄹ', ' 수 있어요')] },
  { key: 'lets', label: "Let's (casual)", grammar: '-자', verbOnly: true, make: (v) => [attachC(v, '자')] },
  { key: 'become', label: 'Becomes', grammar: '-아/어져요', adjOnly: true, make: (v) => alts(v, (a) => a + '져요') },
  { key: 'noun', label: 'Noun form', grammar: '-기', make: (v) => [attachC(v, '기')] },
];

export function formTable(v: Verb): { spec: FormSpec; forms: string[] }[] {
  return FORMS.filter((f) => !(f.verbOnly && v.adj) && !(f.adjOnly && !v.adj)).map((spec) => ({ spec, forms: unique(spec.make(v)) }));
}

export const CORE_KEYS = ['pres', 'past', 'fut', 'formal', 'and', 'so', 'if', 'adn'];

// ---------------------------------------------------------------- inference
function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function candidates(stem: string, adj: boolean): ConjClass[] {
  const last = stem.slice(-1);
  if (!isSyllable(last)) return ['reg'];
  const s = split(last);
  if (last === '하') return ['ha'];
  switch (s.f) {
    case 'ㄷ':
      return ['reg', 'd'];
    case 'ㅂ':
      return adj ? ['b', 'reg'] : ['reg', 'b'];
    case 'ㅅ':
      return ['reg', 's'];
    case 'ㅎ':
      return adj && !['좋'].includes(stem.slice(-1)) ? ['h', 'reg'] : ['reg', 'h'];
    case '':
      if (last === '르') return stem.length > 1 ? ['reu', 'reg', 'reo'] : ['reg'];
      if (s.v === 'ㅜ') return ['reg', 'u'];
      return ['reg'];
    default:
      return ['reg'];
  }
}

const KNOWN_D = ['듣', '걷', '묻', '싣', '깨닫', '붇', '긷', '일컫'];
const KNOWN_B_VERB = ['돕', '눕', '굽', '줍', '깁'];
const KNOWN_S = ['짓', '낫', '붓', '잇', '긋', '젓'];
const REG_REU = ['따르', '치르', '들르', '다다르', '우러르'];
const KNOWN_REO = ['푸르', '누르']; // 이르다 depends on meaning; the dictionary sample decides

function defaultClass(stem: string, adj: boolean): ConjClass {
  const c = candidates(stem, adj);
  const ends = (list: string[]) => list.some((x) => stem.endsWith(x));
  if (c.includes('d')) return ends(KNOWN_D) ? 'd' : 'reg';
  if (c.includes('b')) return adj ? (stem.endsWith('좁') || stem.endsWith('굽') ? 'reg' : 'b') : ends(KNOWN_B_VERB) ? 'b' : 'reg';
  if (c.includes('s')) return ends(KNOWN_S) ? 's' : 'reg';
  if (c.includes('reu')) return ends(REG_REU) ? 'reg' : ends(KNOWN_REO) && adj ? 'reo' : 'reu';
  if (c.includes('u')) return stem === '푸' ? 'u' : 'reg';
  return c[0];
}

/** Forms the dictionary lists as conjugation samples, generated for one class. */
export function sampleForms(v: Verb): Set<string> {
  const out = new Set<string>();
  for (const a of aeoForms(v)) out.add(a);
  if (v.cls === 'ha') out.add(v.stem.slice(0, -1) + '하여');
  out.add(attachU(v, '', '니'));
  out.add(attachC(v, '는'));
  out.add(attachU(v, 'ㄴ', ''));
  out.add(formalStem(v) + '니다');
  out.add(attachC(v, '고'));
  out.add(attachC(v, '지'));
  for (const a of aeoForms(v)) {
    out.add(pastStem(v, a) + '습니다');
    out.add(pastStem(v, a) + '어');
  }
  if (v.dict === '서투르다') out.add('서툰');
  out.add(attachC(v, '거라'));
  out.add(attachC(v, '너라'));
  if (v.dict === '아니다') out.add('아니어');
  return out;
}

export function inferClass(dict: string, adj: boolean, samples?: string[][]): ConjClass {
  const stem = stemOf(dict);
  const cands = candidates(stem, adj);
  if (!samples || samples.length === 0 || cands.length === 1) {
    return samples && samples.length ? cands[0] : defaultClass(stem, adj);
  }
  let best = cands[0];
  let bestScore = -1;
  for (const cls of cands) {
    const forms = sampleForms(makeVerb(dict, cls, adj));
    const score = samples.reduce((n, group) => n + (group.some((g) => forms.has(g)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = cls;
      bestScore = score;
    }
  }
  return best;
}

export function verbFor(dict: string, pos: string[], samples?: string[][]): Verb {
  const adj = !pos.includes('동사') && pos.includes('형용사');
  return makeVerb(dict, inferClass(dict, adj, samples), adj);
}

// ---------------------------------------------------------------- drills
export const DRILL_KEYS_VERB = ['pres', 'past', 'fut', 'formal', 'honor', 'so', 'if', 'because', 'but', 'adn', 'adnpast', 'want', 'can'];
export const DRILL_KEYS_ADJ = ['pres', 'past', 'fut', 'formal', 'so', 'if', 'because', 'but', 'adn', 'become'];

export function drillFor(v: Verb, seed: number) {
  const keys = v.adj ? DRILL_KEYS_ADJ : DRILL_KEYS_VERB;
  const key = keys[Math.abs(seed) % keys.length];
  const spec = FORMS.find((f) => f.key === key)!;
  return { spec, answers: unique(spec.make(v)) };
}

export function normalizeAnswer(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]$/, '');
}

export function checkAnswer(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input);
  return answers.some((a) => normalizeAnswer(a) === n);
}
