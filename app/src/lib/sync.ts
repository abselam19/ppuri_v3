// Progress sync between devices (laptop, phone) through a secret GitHub Gist.
// Each device merges card by card: the version reviewed most recently wins.
import type { State } from 'ts-fsrs';
import type { CardRow, LogRow } from './srs';
import { store, type Settings } from './store';

export const SYNC_FILE = 'ppuri-progress.json';
const API = 'https://api.github.com';
const LOG_DAYS = 120;

export interface SyncConfig {
  token: string;
  gistId: string;
  lastSync?: number;
  lastError?: string;
}

// id, due, stability, difficulty, scheduled days, reps, lapses, state, learning step, last review, created, known
export type CompactCard = [string, number, number, number, number, number, number, number, number, number, number, number];
// card, time, rating, state
export type CompactLog = [string, number, number, number];

export interface SyncFile {
  app: 'ppuri';
  format: 2;
  updated: string;
  settings?: Partial<Settings>;
  settingsAt?: number;
  cards: CompactCard[];
  logs: CompactLog[];
}

const sec = (d: Date | number | undefined) => (d ? Math.round((typeof d === 'number' ? d : d.getTime()) / 1000) : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function toCompact(row: CardRow): CompactCard {
  const c = row.fsrs;
  return [row.id, sec(c.due), r3(c.stability), r3(c.difficulty), c.scheduled_days, c.reps, c.lapses, c.state, c.learning_steps ?? 0,
    sec(c.last_review), sec(row.created), row.known ? 1 : 0];
}

export function fromCompact(c: CompactCard): CardRow {
  const [id, due, stability, difficulty, scheduled_days, reps, lapses, state, learning_steps, last, created, known] = c;
  const row: CardRow = {
    id,
    kind: id[0] as CardRow['kind'],
    fsrs: {
      due: new Date(due * 1000),
      stability,
      difficulty,
      elapsed_days: 0,
      scheduled_days,
      reps,
      lapses,
      state: state as State,
      learning_steps,
      last_review: last ? new Date(last * 1000) : undefined,
    },
    created: created * 1000,
  };
  if (known) row.known = true;
  return row;
}

const stamp = (r: CardRow) => (r.fsrs.last_review ? r.fsrs.last_review.getTime() : 0);

/** Positive when `a` holds the more recent learning state. */
export function compareRows(a: CardRow, b: CardRow): number {
  return stamp(a) - stamp(b) || a.fsrs.reps - b.fsrs.reps;
}

export function mergeCards(local: Map<string, CardRow>, remote: CardRow[]) {
  const toLocal: CardRow[] = [];
  let remoteStale = false;
  const seen = new Set<string>();
  for (const r of remote) {
    seen.add(r.id);
    const l = local.get(r.id);
    if (!l) toLocal.push(r);
    else {
      const d = compareRows(r, l);
      if (d > 0) toLocal.push(r);
      else if (d < 0) remoteStale = true;
    }
  }
  for (const id of local.keys()) if (!seen.has(id)) remoteStale = true;
  return { toLocal, remoteStale };
}

export const logKey = (card: string, atMs: number) => `${card}|${Math.round(atMs / 1000)}`;

export function mergeLogs(localKeys: Set<string>, remote: CompactLog[], localRecent: LogRow[]) {
  const remoteKeys = new Set(remote.map((l) => `${l[0]}|${l[1]}`));
  const toLocal: LogRow[] = remote
    .filter(([card, at]) => !localKeys.has(`${card}|${at}`))
    .map(([card, at, rating, state]) => ({ card, at: at * 1000, rating, state, due: 0, stability: 0, difficulty: 0, ms: 0 }));
  const remoteStale = localRecent.some((l) => !remoteKeys.has(logKey(l.card, l.at)));
  return { toLocal, remoteStale };
}

function sharedSettings(s: Settings): Partial<Settings> {
  const { voice: _voice, ...rest } = s; // voices differ per device
  return rest;
}

// ---------------------------------------------------------------- GitHub API
async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('GitHub rejected the token. Check that it is valid and has the gist scope.');
  if (res.status === 404) throw new Error('The sync file was not found. Check the sync code, and that the token belongs to the same GitHub account.');
  if (!res.ok) throw new Error(`GitHub answered with status ${res.status}.`);
  return res.json();
}

async function readRemote(cfg: SyncConfig): Promise<SyncFile | null> {
  const json = await gh(cfg.token, `/gists/${encodeURIComponent(cfg.gistId)}`);
  const file = json.files?.[SYNC_FILE];
  if (!file) throw new Error('That gist is not a 뿌리 sync file.');
  let text: string = file.content ?? '';
  if (file.truncated && file.raw_url) text = await (await fetch(file.raw_url)).text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.app === 'ppuri' && Array.isArray(parsed.cards) ? (parsed as SyncFile) : null;
  } catch {
    return null;
  }
}

async function writeRemote(cfg: SyncConfig, file: SyncFile) {
  await gh(cfg.token, `/gists/${encodeURIComponent(cfg.gistId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(file) } } }),
  });
}

export async function buildSyncFile(): Promise<SyncFile> {
  const logs = await store.logsSince(Date.now() - LOG_DAYS * 86400000);
  return {
    app: 'ppuri',
    format: 2,
    updated: new Date().toISOString(),
    settings: sharedSettings(store.settings),
    settingsAt: store.settingsAt,
    cards: [...store.cards.values()].map(toCompact),
    logs: logs.map((l) => [l.card, Math.round(l.at / 1000), l.rating, l.state]),
  };
}

export async function createSyncGist(token: string): Promise<string> {
  const json = await gh(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: '뿌리 study progress (sync file, do not edit)',
      public: false,
      files: { [SYNC_FILE]: { content: JSON.stringify(await buildSyncFile()) } },
    }),
  });
  return json.id as string;
}

// ---------------------------------------------------------------- config and runs
export const getSyncConfig = () => store.kvGet<SyncConfig>('sync');
export const setSyncConfig = (cfg: SyncConfig | undefined) => store.kvSet('sync', cfg);

export interface SyncResult {
  ok: boolean;
  pulled?: number;
  pushed?: boolean;
  message?: string;
}

let running: Promise<SyncResult> | null = null;

export function syncNow(): Promise<SyncResult> {
  if (running) return running;
  running = (async (): Promise<SyncResult> => {
    const cfg = await getSyncConfig();
    if (!cfg) return { ok: false, message: 'Sync is not set up.' };
    try {
      const remote = await readRemote(cfg);
      let pulled = 0;
      let push = !remote;
      if (remote) {
        const cards = mergeCards(store.cards, remote.cards.map(fromCompact));
        const localRecent = await store.logsSince(Date.now() - LOG_DAYS * 86400000);
        const logs = mergeLogs(await store.logKeys(), remote.logs ?? [], localRecent);
        const remoteSettingsNewer = (remote.settingsAt ?? 0) > store.settingsAt;
        await store.applyRemote(cards.toLocal, logs.toLocal, remoteSettingsNewer ? remote.settings : undefined, remote.settingsAt);
        pulled = cards.toLocal.length;
        push = cards.remoteStale || logs.remoteStale || store.settingsAt > (remote.settingsAt ?? 0);
      }
      if (push) await writeRemote(cfg, await buildSyncFile());
      await setSyncConfig({ ...cfg, lastSync: Date.now(), lastError: undefined });
      store.notify();
      return { ok: true, pulled, pushed: push };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await setSyncConfig({ ...cfg, lastError: message });
      store.notify();
      return { ok: false, message };
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delayMs = 60_000) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void syncNow();
  }, delayMs);
}

/** Sync a minute after local changes, and whenever the app comes back to the foreground. */
export async function startAutoSync() {
  if (!(await getSyncConfig())) return false;
  store.onLocalChange = () => scheduleSync();
  void syncNow();
  return true;
}

export function stopAutoSync() {
  store.onLocalChange = null;
  clearTimeout(timer);
}
