import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { romanize } from '../src/lib/roman';

const { cases } = JSON.parse(readFileSync(new URL('./roman-cases.json', import.meta.url), 'utf-8')) as {
  cases: { text: string; pron?: string; noun?: boolean; rr: string }[];
};

it.each(cases.map((c) => [c.text, c.pron ?? '', c.rr, c.noun ?? false] as const))('%s [%s] -> %s', (text, pron, rr, noun) => {
  expect(romanize(text, pron.replace(/ː/g, '') || undefined, noun)).toBe(rr);
});
