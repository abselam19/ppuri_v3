// Spaced repetition with FSRS (ts-fsrs). One row per study card.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';

export { Rating, State };
export type { Grade };

export type CardKind = 'r' | 'w' | 'p' | 'c'; // root, word, English->Korean, conjugation drill

export interface CardRow {
  id: string;
  kind: CardKind;
  fsrs: Card;
  created: number; // ms timestamp of introduction
  known?: boolean; // marked as known in the placement check
}

export interface LogRow {
  id?: number;
  card: string;
  rating: number;
  at: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  ms: number;
  prev?: CardRow; // row before the review, used for undo
}

export const rootCard = (c: string) => `r:${c}`;
export const wordCard = (i: number) => `w:${i}`;
export const prodCard = (i: number) => `p:${i}`;
export const drillCard = (i: number) => `c:${i}`;

export function parseCard(id: string): { kind: CardKind; ref: string } {
  return { kind: id[0] as CardKind, ref: id.slice(2) };
}

const schedulers = new Map<number, FSRS>();
function scheduler(retention: number): FSRS {
  let f = schedulers.get(retention);
  if (!f) {
    f = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, maximum_interval: 3650 }));
    schedulers.set(retention, f);
  }
  return f;
}

export function newRow(id: string, now: Date): CardRow {
  return { id, kind: id[0] as CardKind, fsrs: createEmptyCard(now), created: now.getTime() };
}

/** A card the learner already knows: scheduled for a first check weeks from now. */
export function knownRow(id: string, now: Date): CardRow {
  const days = 14 + Math.floor(Math.random() * 46);
  const due = new Date(now.getTime() + days * 86400000);
  const card: Card = {
    ...createEmptyCard(now),
    due,
    stability: days,
    difficulty: 3,
    scheduled_days: days,
    reps: 1,
    state: State.Review,
    last_review: now,
  };
  return { id, kind: id[0] as CardKind, fsrs: card, created: now.getTime(), known: true };
}

export function rate(row: CardRow, grade: Grade, now: Date, retention: number, ms: number): { row: CardRow; log: LogRow } {
  const { card, log } = scheduler(retention).next(row.fsrs, now, grade);
  return {
    row: { ...row, fsrs: card },
    log: {
      card: row.id,
      rating: grade,
      at: now.getTime(),
      state: log.state,
      due: card.due.getTime(),
      stability: card.stability,
      difficulty: card.difficulty,
      ms,
      prev: row,
    },
  };
}

export function preview(row: CardRow, now: Date, retention: number): Record<Grade, Date> {
  const f = scheduler(retention);
  const out = {} as Record<Grade, Date>;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = f.next(row.fsrs, now, g).card.due;
  }
  return out;
}

export const isGraduated = (row?: CardRow) => !!row && (row.fsrs.state === State.Review || !!row.known);
export const isStarted = (row?: CardRow) => !!row && (row.fsrs.reps > 0 || !!row.known);
export const isLearning = (row?: CardRow) =>
  !!row && (row.fsrs.state === State.Learning || row.fsrs.state === State.Relearning || row.fsrs.state === State.New);

export type Status = 'new' | 'learning' | 'known';
export function statusOf(row?: CardRow): Status {
  if (!row) return 'new';
  return isGraduated(row) ? 'known' : 'learning';
}

/** Dates in rows restored from JSON arrive as strings. */
export function reviveRow(row: CardRow): CardRow {
  const c = row.fsrs as Card & { due: Date | string; last_review?: Date | string };
  return {
    ...row,
    fsrs: {
      ...c,
      due: new Date(c.due),
      last_review: c.last_review ? new Date(c.last_review) : undefined,
    },
  };
}
