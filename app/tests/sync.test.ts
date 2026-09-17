import { createEmptyCard, State } from 'ts-fsrs';
import { expect, it } from 'vitest';
import type { CardRow } from '../src/lib/srs';
import { compareRows, fromCompact, mergeCards, mergeLogs, toCompact } from '../src/lib/sync';

const row = (id: string, reps: number, last?: number): CardRow => ({
  id,
  kind: id[0] as CardRow['kind'],
  created: 1_700_000_000_000,
  fsrs: {
    ...createEmptyCard(new Date(1_700_000_000_000)),
    reps,
    state: reps ? State.Review : State.New,
    stability: 3.14159,
    difficulty: 5.5,
    scheduled_days: 3,
    due: new Date(1_800_000_000_000),
    last_review: last ? new Date(last) : undefined,
  },
});

it('round-trips the compact card format', () => {
  const r = { ...row('w:1', 2, 1_750_000_000_000), known: true };
  const back = fromCompact(toCompact(r));
  expect(back.id).toBe('w:1');
  expect(back.kind).toBe('w');
  expect(back.known).toBe(true);
  expect(back.fsrs.due.getTime()).toBe(r.fsrs.due.getTime());
  expect(back.fsrs.last_review?.getTime()).toBe(1_750_000_000_000);
  expect(back.fsrs.stability).toBeCloseTo(3.142, 3);
  expect(back.fsrs.state).toBe(State.Review);
  expect(fromCompact(toCompact(row('r:學', 0))).fsrs.last_review).toBeUndefined();
});

it('keeps the most recently reviewed version of each card', () => {
  const local = new Map([
    ['w:1', row('w:1', 3, 2_000_000)],
    ['w:2', row('w:2', 1, 1_000_000)],
    ['w:3', row('w:3', 1, 1_000_000)],
  ]);
  const remote = [row('w:1', 2, 1_000_000), row('w:2', 2, 3_000_000), row('w:4', 1, 500_000), row('w:3', 1, 1_000_000)];
  const { toLocal, remoteStale } = mergeCards(local, remote);
  expect(toLocal.map((r) => r.id).sort()).toEqual(['w:2', 'w:4']);
  expect(remoteStale).toBe(true);
  expect(compareRows(row('a', 1, 5), row('a', 2, 5))).toBeLessThan(0);
});

it('has nothing to do when both sides match', () => {
  const a = row('w:1', 1, 1_000_000);
  expect(mergeCards(new Map([['w:1', a]]), [a])).toEqual({ toLocal: [], remoteStale: false });
});

it('merges review logs by card and second', () => {
  const recent = [{ card: 'w:9', at: 300_000, rating: 3, state: 2, due: 0, stability: 0, difficulty: 0, ms: 0 }];
  const { toLocal, remoteStale } = mergeLogs(new Set(['w:1|100']), [['w:1', 100, 3, 2], ['w:2', 200, 1, 1]], recent);
  expect(toLocal.map((l) => l.card)).toEqual(['w:2']);
  expect(toLocal[0].at).toBe(200_000);
  expect(remoteStale).toBe(true);
});
