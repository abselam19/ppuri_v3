import { useEffect, useRef, useState } from 'react';
import { createSyncGist, getSyncConfig, setSyncConfig, startAutoSync, stopAutoSync, syncNow, type SyncConfig } from '../lib/sync';
import type { AppData } from '../lib/data';
import { nf } from '../lib/format';
import { useProgress, type BackupFile } from '../lib/store';
import { koreanVoices, speak, ttsSupported } from '../lib/tts';

export function Settings({ data }: { data: AppData }) {
  const store = useProgress();
  const s = store.settings;
  const [voices, setVoices] = useState(() => koreanVoices());
  const [message, setMessage] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<{ saved: string; cards: number } | null | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setVoices(koreanVoices()), 400);
    store.serverBackupInfo().then(setServerInfo);
    return () => window.clearTimeout(t);
  }, [store, store.lastBackup]);

  async function download() {
    const file = await store.exportAll(data.bundle.meta.version);
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ppuri-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (!confirm(`Replace your current progress with this backup (${nf.format(parsed.cards?.length ?? 0)} cards)?`)) return;
      await store.importAll(parsed);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The backup could not be read.');
    }
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="display">Settings</h1>
      </header>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      <section className="setting-group">
        <h2 className="section-title">Display</h2>
        <div className="field">
          <span className="field-label">Above Korean words</span>
          <div className="segmented" role="radiogroup" aria-label="Above Korean words">
            {(
              [
                ['roman', 'Romanization'],
                ['hanja', 'Hanja'],
                ['both', 'Both'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={s.under === k} className={s.under === k ? 'is-on' : ''} onClick={() => store.setSettings({ under: k })}>
                {label}
              </button>
            ))}
          </div>
          <span className="field-help">
            Romanization follows the dictionary's standard pronunciation, so 학생 [학쌩] is written haksaeng. Word pages also show the
            pronunciation in Hangul when it differs from the spelling.
          </span>
        </div>
      </section>

      <section className="setting-group">
        <h2 className="section-title">Study load</h2>
        <label className="field">
          <span className="field-label">New cards per day</span>
          <input
            type="number"
            min={0}
            max={150}
            value={s.newPerDay}
            onChange={(e) => store.setSettings({ newPerDay: Math.max(0, Math.min(150, Number(e.target.value) || 0)) })}
          />
          <span className="field-help">
            Roots and words both count. At {s.newPerDay} a day, the full path takes about{' '}
            {nf.format(Math.ceil((data.bundle.words.length + data.bundle.roots.length) / Math.max(1, s.newPerDay)))} days before the
            placement check removes words you know.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Memory target</span>
          <select value={s.retention} onChange={(e) => store.setSettings({ retention: Number(e.target.value) })}>
            <option value={0.85}>85%: fewer reviews</option>
            <option value={0.9}>90%: recommended</option>
            <option value={0.93}>93%</option>
            <option value={0.95}>95%: many more reviews</option>
          </select>
          <span className="field-help">The share of reviews you should get right. Higher targets schedule reviews sooner.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.drills} onChange={(e) => store.setSettings({ drills: e.target.checked })} />
          <span>
            Conjugation practice
            <span className="field-help">After you learn a verb or adjective, type one of its forms on later reviews.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.production} onChange={(e) => store.setSettings({ production: e.target.checked })} />
          <span>
            English to Korean cards
            <span className="field-help">Adds a recall card for each learned word. Doubles the review load; useful for writing and speaking.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.koreanDefinitions} onChange={(e) => store.setSettings({ koreanDefinitions: e.target.checked })} />
          <span>
            Show Korean definitions
            <span className="field-help">The dictionary's own learner-level definition under the English meaning.</span>
          </span>
        </label>
      </section>

      <section className="setting-group">
        <h2 className="section-title">Pronunciation</h2>
        {!ttsSupported() || voices.length === 0 ? (
          <p className="field-help">
            No Korean voice is installed in this browser. On Windows, add Korean under Settings, Time and language, Speech. On macOS,
            add the Yuna voice under System Settings, Accessibility, Spoken content. Then reload this page.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Voice</span>
              <select value={s.voice ?? ''} onChange={(e) => store.setSettings({ voice: e.target.value || null })}>
                <option value="">Default Korean voice</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button type="button" className="text-button" onClick={() => speak('안녕하세요, 학생 여러분.', s.voice)}>
                Play a sample
              </button>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.autoSpeak} onChange={(e) => store.setSettings({ autoSpeak: e.target.checked })} />
              <span>Play each word automatically</span>
            </label>
          </>
        )}
      </section>

      <SyncSettings />

      {store.serverAvailable && (
      <section className="setting-group">
        <h2 className="section-title">Backups</h2>
        <p className="field-help">
          Progress lives in this browser. While the 뿌리 server is running, a copy is also saved on this laptop a minute or two after you
          study, in the <code>progress</code> folder next to <code>serve.py</code>.
        </p>
        <p className="field-help">
          {serverInfo === undefined
            ? 'Checking the laptop backup…'
            : serverInfo
              ? `Latest laptop backup: ${new Date(serverInfo.saved).toLocaleString()}, ${nf.format(serverInfo.cards)} cards.`
              : 'No laptop backup yet, or the server is not running.'}
        </p>
        <div className="actions">
          <button
            type="button"
            className="button"
            onClick={async () => {
              const ok = await store.backupToServer(true);
              setMessage(ok ? 'Saved a backup on this laptop.' : 'The laptop backup failed. Is serve.py running?');
            }}
          >
            Back up to this laptop now
          </button>
          <button type="button" className="button" onClick={download}>
            Download a backup file
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Restore from a file
          </button>
          {serverInfo && (
            <button
              type="button"
              className="button"
              onClick={async () => {
                if (!confirm('Replace your current progress with the latest laptop backup?')) return;
                await store.restoreFromServer();
                setMessage('Laptop backup restored.');
              }}
            >
              Restore laptop backup
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = '';
            }}
          />
        </div>
      </section>
      )}

      <section className="setting-group">
        <h2 className="section-title">Start over</h2>
        <button
          type="button"
          className="button button-danger"
          onClick={async () => {
            if (!confirm('Delete all progress and settings in this browser? Download a backup first if you might want it back. If sync is on, stop it first, or your progress will come back from the sync file.')) return;
            await store.resetAll();
            setMessage('All progress was deleted.');
          }}
        >
          Delete all progress
        </button>
      </section>

      <section className="setting-group about">
        <h2 className="section-title">About the word list</h2>
        <p className="field-help">
          {nf.format(data.bundle.meta.counts.words)} words ({nf.format(data.bundle.meta.counts.level1)} 초급,{' '}
          {nf.format(data.bundle.meta.counts.level2)} 중급), {nf.format(data.bundle.meta.counts.roots)} roots, dictionary snapshot{' '}
          {data.bundle.meta.snapshot ?? 'unknown'}, built {data.bundle.meta.version.slice(0, 8)}.
        </p>
        <p className="field-help">{data.bundle.meta.attribution}</p>
      </section>
    </div>
  );
}

function SyncSettings() {
  const store = useProgress();
  const [cfg, setCfg] = useState<SyncConfig | null | undefined>(undefined);
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const version = store.getVersion();

  useEffect(() => {
    getSyncConfig().then((c) => setCfg(c ?? null));
  }, [version]);

  async function connect() {
    setBusy(true);
    setNote(null);
    try {
      const t = token.trim();
      const c = code.trim();
      if (!t) throw new Error('Paste a GitHub token first.');
      const gistId = c || (await createSyncGist(t));
      await setSyncConfig({ token: t, gistId });
      const res = await syncNow();
      if (!res.ok) {
        await setSyncConfig(undefined);
        throw new Error(res.message ?? 'Sync failed.');
      }
      await startAutoSync();
      setToken('');
      setCode('');
      setNote(
        c
          ? `Joined the sync file. ${res.pulled ?? 0} cards came from your other device.`
          : 'Sync file created. On your other device, use the same token and the sync code shown here.',
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setCfg((await getSyncConfig()) ?? null);
    }
  }

  return (
    <section className="setting-group">
      <h2 className="section-title">Sync between phone and laptop</h2>
      {cfg === undefined ? null : cfg ? (
        <>
          <p className="field-help">
            Sync is on. Sync code: <code className="sync-code">{cfg.gistId}</code>
          </p>
          <p className="field-help">
            {cfg.lastError
              ? `Last sync failed: ${cfg.lastError}`
              : cfg.lastSync
                ? `Last synced ${new Date(cfg.lastSync).toLocaleString()}.`
                : 'Not synced yet.'}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await syncNow();
                setBusy(false);
                setNote(r.ok ? `Synced. ${r.pulled ?? 0} cards updated from your other device.` : (r.message ?? 'Sync failed.'));
              }}
            >
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                if (!confirm('Stop syncing on this device? Your progress stays here and in the sync file.')) return;
                stopAutoSync();
                await setSyncConfig(undefined);
                setCfg(null);
              }}
            >
              Stop syncing on this device
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="field-help">
            Keeps the same progress on your laptop and your phone, for example when you also use the app from GitHub Pages. Progress is
            kept in a secret gist in your own GitHub account; the token stays in this browser.
          </p>
          <ol className="steps">
            <li>
              On github.com open Settings, Developer settings, Personal access tokens, Tokens (classic), and generate a token with only
              the <b>gist</b> scope.
            </li>
            <li>On the first device, paste the token and leave the sync code empty. A sync file is created.</li>
            <li>On every other device, paste the same token and the sync code shown here afterwards.</li>
          </ol>
          <label className="field">
            <span className="field-label">GitHub token</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            <span className="field-label">Sync code</span>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="empty on the first device" spellCheck={false} />
          </label>
          <div className="actions">
            <button type="button" className="button button-primary" disabled={busy} onClick={connect}>
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </>
      )}
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
