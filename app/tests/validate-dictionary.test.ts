// Checks the engine against every conjugation sample printed in the dictionary.
import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { sampleForms, verbFor } from '../src/lib/conjugate';

const path = new URL('../public/data/ppuri-data.json', import.meta.url);

it.skipIf(!existsSync(path))('matches the dictionary conjugation samples', () => {
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  let groups = 0;
  let matched = 0;
  let verbs = 0;
  const misses: string[] = [];
  for (const w of data.words) {
    if (!w.c || !(w.p.includes('동사') || w.p.includes('형용사'))) continue;
    verbs++;
    const samples = (w.c as string[][]).map((g) => g.map((x) => x.trim()));
    const v = verbFor(w.w, w.p, samples);
    const forms = sampleForms(v);
    for (const g of samples) {
      groups++;
      if (g.some((x) => forms.has(x))) matched++;
      else misses.push(`${w.w} [${v.cls}] ${g.join('/')} ∉ ${[...forms].slice(0, 5).join(' ')}`);
    }
  }
  const rate = matched / groups;
  console.log(`verbs ${verbs}, sample groups ${groups}, matched ${matched} (${(rate * 100).toFixed(2)}%)`);
  console.log(misses.join('\n'));
  expect(rate).toBeGreaterThan(0.995);
});
