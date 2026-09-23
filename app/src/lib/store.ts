// Learner progress: cards, review log and settings, kept in IndexedDB and mirrored in memory.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';
import { reviveRow, type CardRow, type LogRow } from './srs';

export interface Settings {
  newPerDay: number;
  drills: boolean;
  production: boolean;
  autoSpeak: boolean;
  voice: string | null;
  retention: number;
  koreanDefinitions: boolean;
  placementDone: boolean;
  placementPos: [number, number]; // how far the placement check has gone in each level
  under: 'roman' | 'hanja' | 'both'; // what appears above Korean words
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  drills: true,
  production: false,
  autoSpeak: true,
  voice: null,
  retention: 0.9,
  koreanDefinitions: false,
  placementDone: false,
  placementPos: [0, 0],
  under: 'roman',
};

interface PpuriDB extends DBSchema {
  cards: { key: string; value: CardRow };
  logs: { key: number; value: LogRow; indexes: { byAt: number; byCard: string } };
  kv: { key: string; value: unknown };
}

export interface BackupFile {
  app: 'ppuri';
  format: 1;
  exported: string;
  dataVersion?: string;
  settings: Settings;
  cards: CardRow[];
  logs: LogRow[];
}

// The study day rolls over at 4 a.m. local time.
export function dayStart(now = new Date()): Date {
  const d = new Date(now);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  d.setHours(4, 0, 0, 0);
  return d;
}
export const dayEnd = (now = new Date()) => new Date(dayStart(now).getTime() + 86400000);
export function dayKey(t: number | Date): string {
  const d = dayStart(new Date(t));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function checkServer(): Promise<boolean> {
  // only a local serve.py has the backup API; skip the request on GitHub Pages
  if (!/^(127\.|localhost$|\[::1\]$|10\.|192\.168\.)/.test(location.hostname)) return false;
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

class ProgressStore {
  private db!: IDBPDatabase<PpuriDB>;
  cards = new Map<string, CardRow>();
  settings: Settings = { ...DEFAULT_SETTINGS };
  reviewsToday = 0;
  lastBackup: { at: number; ok: boolean } | null = null;
  settingsAt = 0;
  serverAvailable = false;
  onLocalChange: (() => void) | null = null;
  private version = 0;
  private listeners = new Set<() => void>();
  private backupTimer: number | undefined;
  private dirtySince = 0;

  async load() {
    this.db = await openDB<PpuriDB>('ppuri', 1, {
      upgrade(db) {
        db.createObjectStore('cards', { keyPath: 'id' });
        const logs = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        logs.createIndex('byAt', 'at');
        logs.createIndex('byCard', 'card');
        db.createObjectStore('kv');
      },
    });
    const rows = await this.db.getAll('cards');
    this.cards = new Map(rows.map((r) => [r.id, r]));
    const s = (await this.db.get('kv', 'settings')) as Partial<Settings> | undefined;
    this.settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    this.settingsAt = ((await this.db.get('kv', 'settingsAt')) as number | undefined) ?? 0;
    this.serverAvailable = await checkServer();
    this.reviewsToday = await this.db.countFromIndex('logs', 'byAt', IDBKeyRange.lowerBound(dayStart().getTime()));
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  notify() {
    this.emit();
  }

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  get(id: string) {
    return this.cards.get(id);
  }

  async putCards(rows: CardRow[]) {
    if (!rows.length) return;
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
    rows.forEach((r) => this.cards.set(r.id, r));
    this.touch();
  }

  async deleteCards(ids: string[]) {
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    ids.forEach((id) => this.cards.delete(id));
    this.touch();
  }

  async review(row: CardRow, log: LogRow): Promise<number> {
    const { prev: _prev, ...entry } = log; // undo data stays in memory only
    const tx = this.db.transaction(['cards', 'logs'], 'readwrite');
    tx.objectStore('cards').put(row);
    const id = (await tx.objectStore('logs').add(entry)) as number;
    await tx.done;
    this.cards.set(row.id, row);
    this.reviewsToday++;
    this.touch();
    return id;
  }

  async undo(logId: number, prev: CardRow, isNewIntroduction: boolean) {
    const tx = this.db.transaction(['cards', 'logs'], 'readwrite');
    tx.objectStore('logs').delete(logId);
    if (isNewIntroduction) tx.objectStore('cards').delete(prev.id);
    else tx.objectStore('cards').put(prev);
    await tx.done;
    if (isNewIntroduction) this.cards.delete(prev.id);
    else this.cards.set(prev.id, prev);
    this.reviewsToday = Math.max(0, this.reviewsToday - 1);
    this.touch();
  }

  async logsSince(t: number): Promise<LogRow[]> {
    return this.db.getAllFromIndex('logs', 'byAt', IDBKeyRange.lowerBound(t));
  }

  async setSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.settingsAt = Date.now();
    await this.db.put('kv', this.settings, 'settings');
    await this.db.put('kv', this.settingsAt, 'settingsAt');
    this.touch();
  }

  async kvGet<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('kv', key)) as T | undefined;
  }

  async kvSet(key: string, value: unknown) {
    if (value === undefined) await this.db.delete('kv', key);
    else await this.db.put('kv', value, key);
  }

  async logKeys(): Promise<Set<string>> {
    const all = await this.db.getAll('logs');
    return new Set(all.map((l) => `${l.card}|${Math.round(l.at / 1000)}`));
  }

  /** Changes that arrived from another device: stored without triggering another sync. */
  async applyRemote(cards: CardRow[], logs: LogRow[], settings?: Partial<Settings>, settingsAt?: number) {
    if (!cards.length && !logs.length && !settings) return;
    const tx = this.db.transaction(['cards', 'logs', 'kv'], 'readwrite');
    for (const c of cards) tx.objectStore('cards').put(c);
    for (const l of logs) tx.objectStore('logs').add(l);
    if (settings) {
      this.settings = { ...this.settings, ...settings, voice: this.settings.voice };
      this.settingsAt = settingsAt ?? Date.now();
      tx.objectStore('kv').put(this.settings, 'settings');
      tx.objectStore('kv').put(this.settingsAt, 'settingsAt');
    }
    await tx.done;
    cards.forEach((c) => this.cards.set(c.id, c));
    const start = dayStart().getTime();
    this.reviewsToday += logs.filter((l) => l.at >= start).length;
    this.emit();
    this.markDirty();
  }

  async exportAll(dataVersion?: string): Promise<BackupFile> {
    const logs = (await this.db.getAll('logs')).map(({ prev: _prev, ...l }) => l);
    return {
      app: 'ppuri',
      format: 1,
      exported: new Date().toISOString(),
      dataVersion,
      settings: this.settings,
      cards: [...this.cards.values()],
      logs,
    };
  }

  async importAll(file: BackupFile) {
    if (file.app !== 'ppuri' || !Array.isArray(file.cards)) throw new Error('This file is not a 뿌리 backup.');
    const tx = this.db.transaction(['cards', 'logs', 'kv'], 'readwrite');
    await tx.objectStore('cards').clear();
    await tx.objectStore('logs').clear();
    for (const c of file.cards) tx.objectStore('cards').put(reviveRow(c));
    for (const l of file.logs ?? []) {
      const { id: _id, ...rest } = l;
      tx.objectStore('logs').add(rest as LogRow);
    }
    tx.objectStore('kv').put({ ...DEFAULT_SETTINGS, ...file.settings }, 'settings');
    tx.objectStore('kv').put(Date.now(), 'settingsAt');
    await tx.done;
    await this.load();
    this.onLocalChange?.();
  }

  async resetAll() {
    const tx = this.db.transaction(['cards', 'logs', 'kv'], 'readwrite');
    await Promise.all([tx.objectStore('cards').clear(), tx.objectStore('logs').clear(), tx.objectStore('kv').clear(), tx.done]);
    await this.load();
  }

  // ------------------------------------------------------------ laptop backup
  private touch() {
    this.emit();
    this.markDirty();
    this.onLocalChange?.();
  }

  private markDirty() {
    if (!this.serverAvailable) return;
    if (!this.dirtySince) this.dirtySince = Date.now();
    window.clearTimeout(this.backupTimer);
    this.backupTimer = window.setTimeout(() => this.backupToServer(), 90_000);
  }

  async backupToServer(force = false): Promise<boolean> {
    if (!this.serverAvailable) return false;
    if (!this.dirtySince && !force) return true;
    try {
      const body = JSON.stringify(await this.exportAll());
      const res = await fetch('./api/backup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 });
      this.lastBackup = { at: Date.now(), ok: res.ok };
      if (res.ok) this.dirtySince = 0;
      this.emit();
      return res.ok;
    } catch {
      this.lastBackup = { at: Date.now(), ok: false };
      this.emit();
      return false;
    }
  }

  async serverBackupInfo(): Promise<{ saved: string; cards: number } | null> {
    if (!this.serverAvailable) return null;
    try {
      const res = await fetch('./api/backup/info', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async restoreFromServer() {
    const res = await fetch('./api/backup', { cache: 'no-store' });
    if (!res.ok) throw new Error('No backup was found on this laptop.');
    await this.importAll(await res.json());
  }
}

export const store = new ProgressStore();

/** Re-render whenever progress changes. */
export function useProgress() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
