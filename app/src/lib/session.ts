// What to study today: due reviews plus the next units of the study path.
import { isVerbLike, type AppData } from './data';
import { drillCard, isGraduated, isStarted, prodCard, rootCard, State, wordCard, type CardRow } from './srs';
import { dayEnd, dayStart, store } from './store';

export interface Plan {
  due: string[]; // cards due by the end of the study day, oldest first
  chunks: string[][]; // new cards grouped by path unit (roots before their words)
  followUps: string[]; // conjugation drills / English->Korean cards for words already learned
  newToday: number;
  newLimit: number;
  nextUnit: number | null;
}

const isFollowUp = (r: CardRow) => r.kind === 'c' || r.kind === 'p';

export function unitCards(data: AppData, ui: number): string[] {
  const u = data.bundle.path[ui];
  return [...(u.rt ?? []).map(rootCard), ...u.w.map(wordCard)].filter((id) => !store.get(id));
}

/** Cards whose word or root is still in the bundle (ids can vanish when the word list is rebuilt). */
export function cardExists(data: AppData, id: string): boolean {
  const kind = id[0];
  const ref = id.slice(2);
  return kind === 'r' ? data.roots.has(ref) : data.words.has(Number(ref));
}

export function planToday(data: AppData, now = new Date()): Plan {
  const s = store.settings;
  const start = dayStart(now).getTime();
  const end = dayEnd(now).getTime();
  const rows = [...store.cards.values()].filter((r) => cardExists(data, r.id));
  const due = rows
    .filter((r) => r.fsrs.due.getTime() <= end)
    .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime())
    .map((r) => r.id);
  const newToday = rows.filter((r) => !r.known && r.created >= start && !isFollowUp(r)).length;
  const followToday = rows.filter((r) => !r.known && r.created >= start && isFollowUp(r)).length;

  let budget = Math.max(0, s.newPerDay - newToday);
  const chunks: string[][] = [];
  let nextUnit: number | null = null;
  const path = data.bundle.path;
  for (let ui = 0; ui < path.length; ui++) {
    const items = unitCards(data, ui);
    if (!items.length) continue;
    if (nextUnit === null) nextUnit = ui;
    if (budget <= 0) break;
    // keep units whole; allow a small overrun rather than splitting a family
    if (items.length > budget + 3) {
      if (chunks.length) break;
      chunks.push(items.slice(0, budget));
      budget = 0;
      break;
    }
    chunks.push(items);
    budget -= items.length;
  }

  const followUps: string[] = [];
  let fBudget = Math.max(0, Math.ceil(s.newPerDay / 4) - followToday);
  if (fBudget > 0 && (s.drills || s.production)) {
    for (const u of path) {
      for (const id of u.w) {
        if (fBudget <= 0) break;
        const row = store.get(wordCard(id));
        if (!row || !isGraduated(row) || (row.fsrs.reps < 2 && !row.known)) continue;
        const w = data.words.get(id)!;
        if (s.drills && isVerbLike(w) && !store.get(drillCard(id))) {
          followUps.push(drillCard(id));
          fBudget--;
        }
        if (fBudget > 0 && s.production && !store.get(prodCard(id))) {
          followUps.push(prodCard(id));
          fBudget--;
        }
      }
      if (fBudget <= 0) break;
    }
  }
  return { due, chunks, followUps, newToday, newLimit: s.newPerDay, nextUnit };
}

/** Learning cards first, then blocks of reviews alternating with whole new units. */
export function orderSession(plan: Plan): string[] {
  const now = Date.now();
  const learningNow = plan.due.filter((id) => {
    const row = store.get(id);
    return !!row && row.fsrs.due.getTime() <= now && row.fsrs.state !== State.Review;
  });
  const rest = plan.due.filter((id) => !learningNow.includes(id));
  const out = [...learningNow];
  const units = [...plan.chunks];
  let i = 0;
  while (i < rest.length || units.length) {
    out.push(...rest.slice(i, i + 6));
    i += 6;
    const u = units.shift();
    if (u) out.push(...u);
  }
  // follow-ups go in the second half so the words were seen again first
  const mid = Math.floor(out.length / 2);
  return [...out.slice(0, mid), ...plan.followUps, ...out.slice(mid)];
}

export function wordDecodable(data: AppData, wordId: number): boolean {
  const w = data.words.get(wordId);
  if (!w?.r?.length) return false;
  return w.r.every((c) => isStarted(store.get(rootCard(c))));
}

export interface Coverage {
  level1: number;
  level2: number;
  rootsKnown: number;
  rootsStarted: number;
  wordsStarted: number;
  decodableUnseen: number;
  remainingNew: number;
}

export function coverage(data: AppData): Coverage {
  let level1 = 0;
  let level2 = 0;
  let wordsStarted = 0;
  let decodableUnseen = 0;
  const rootKnown = new Set<string>();
  let rootsStarted = 0;
  for (const r of data.bundle.roots) {
    const row = store.get(rootCard(r.c));
    if (isGraduated(row)) rootKnown.add(r.c);
    if (row) rootsStarted++;
  }
  for (const w of data.bundle.words) {
    const row = store.get(wordCard(w.i));
    if (row) wordsStarted++;
    if (isGraduated(row)) {
      if (w.l === 1) level1++;
      else level2++;
    } else if (!row && w.r?.length && w.r.every((c) => rootKnown.has(c))) {
      decodableUnseen++;
    }
  }
  const remainingNew = data.bundle.words.length - wordsStarted + (data.bundle.roots.length - rootsStarted);
  return { level1, level2, rootsKnown: rootKnown.size, rootsStarted, wordsStarted, decodableUnseen, remainingNew };
}
