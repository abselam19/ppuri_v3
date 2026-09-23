import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { anchorWord, anchorWords, indexRootsByReading, sameSound, type AppData, type Bundle, type RootRec, type WordRec } from '../src/lib/data';

const bundle = JSON.parse(readFileSync(new URL('../public/data/ppuri-data.json', import.meta.url), 'utf-8')) as Bundle;
const roots = bundle.roots;
const index = indexRootsByReading(roots);
const data = { rootsByReading: index, words: new Map(bundle.words.map((w) => [w.i, w])) } as unknown as AppData;
const root = (c: string) => roots.find((r) => r.c === c)!;

it('gives every root an English meaning', () => {
  expect(roots.filter((r: RootRec) => !r.g?.trim()).map((r) => r.c)).toEqual([]);
  expect((bundle.singles ?? []).filter((s) => !s.g?.trim() && !s.hun.length).map((s) => s.c)).toEqual([]);
});

it('groups roots that share a reading', () => {
  expect(index.get('이')!.map((r) => r.c)).toEqual(expect.arrayContaining(['以', '二', '異', '移', '理', '利', '離']));
  expect(index.get('대')!.length).toBeGreaterThan(5);
  expect(sameSound(data, root('以')).map((r) => r.c)).not.toContain('以');
  expect(sameSound(data, root('大'))[0].w.length).toBeGreaterThan(1); // most productive first
});

it('names a same-sounding root by one of its words', () => {
  const w = anchorWord(data, root('理'), '이') as WordRec;
  expect(w.w.startsWith('이')).toBe(true);
  expect(anchorWord(data, root('大'), '대')!.s!.some(([syl, h]) => syl === '대' && h === '大')).toBe(true);
});

it('names a root by the words it builds, for the card front', () => {
  expect(anchorWords(data, root('是'), 2).map((w) => w.w)).toEqual(['역시', '혹시']);
  expect(anchorWords(data, root('大'), 2).map((w) => w.w)).toEqual(['대학', '대부분']);
  const small = roots.find((r) => r.w.length === 2)!; // never returns more words than the root has
  expect(anchorWords(data, small, 5).length).toBe(2);
});

it('keeps the corrected root meanings', () => {
  expect(root('以').g).toMatch(/from a point/);
  expect(root('空').g).toMatch(/sky/);
  expect(root('代').g).toMatch(/era/);
});

it('finds words spelled alike but built from different roots', () => {
  const same = bundle.words.filter((w) => w.w === '시장');
  expect(same.length).toBe(2);
  expect(new Set(same.map((w) => w.o)).size).toBe(2);
});
