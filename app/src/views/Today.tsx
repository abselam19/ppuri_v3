import { useEffect, useMemo, useState } from 'react';
import { A, Cells, RootGlyph, go } from '../components/ui';
import { rootGloss, type AppData } from '../lib/data';
import { koreanDate, levelTitle, nf } from '../lib/format';
import { coverage, planToday } from '../lib/session';
import { wordCard } from '../lib/srs';
import { dayKey, dayStart, useProgress } from '../lib/store';

export function Today({ data }: { data: AppData }) {
  const store = useProgress();
  const plan = useMemo(() => planToday(data), [data, store.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const cov = useMemo(() => coverage(data), [data, store.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [history, setHistory] = useState<{ key: string; n: number }[]>([]);
  const [serverBackup, setServerBackup] = useState<{ saved: string; cards: number } | null>(null);
  const fresh = plan.chunks.reduce((n, c) => n + c.length, 0) + plan.followUps.length;
  const firstRun = store.cards.size === 0;

  useEffect(() => {
    const since = dayStart().getTime() - 13 * 86400000;
    store.logsSince(since).then((logs) => {
      const counts = new Map<string, number>();
      for (const l of logs) counts.set(dayKey(l.at), (counts.get(dayKey(l.at)) ?? 0) + 1);
      const days = Array.from({ length: 14 }, (_, i) => dayKey(since + i * 86400000 + 3600000));
      setHistory(days.map((key) => ({ key, n: counts.get(key) ?? 0 })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.reviewsToday]);

  useEffect(() => {
    if (firstRun) store.serverBackupInfo().then(setServerBackup);
  }, [firstRun, store]);

  const unit = plan.nextUnit !== null ? data.bundle.path[plan.nextUnit] : null;
  const daysLeft = Math.ceil(cov.remainingNew / Math.max(1, store.settings.newPerDay));
  const maxHist = Math.max(10, ...history.map((h) => h.n));

  return (
    <div className="today">
      <section className="today-main">
        <p className="date" lang="ko">
          {koreanDate()}
        </p>
        {firstRun ? (
          <div className="first-run">
            <h1 className="display">Learn Korean one root at a time</h1>
            <p className="lede">
              The path covers the {nf.format(data.bundle.meta.counts.words)} words graded 초급 and 중급 by the National Institute of Korean
              Language. Hanja roots come first, then every word they unlock; native verbs come with their family and
              their conjugations.
            </p>
            <div className="actions">
              <A to="placement" className="button button-primary">
                Check which words I already know
              </A>
              <A to="study" className="button">
                Start from the first root
              </A>
            </div>
            {serverBackup && serverBackup.cards > 0 && (
              <p className="note">
                This laptop has a saved backup with {nf.format(serverBackup.cards)} cards from{' '}
                {new Date(serverBackup.saved).toLocaleString()}.{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    await store.restoreFromServer();
                  }}
                >
                  Restore it
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="session-start">
            <h1 className="display">
              {plan.due.length + fresh === 0 ? 'All done for today' : `${plan.due.length + fresh} cards today`}
            </h1>
            <p className="lede">
              {plan.due.length} to review, {fresh} new
              {plan.followUps.length > 0 && ` (including ${plan.followUps.length} practice ${plan.followUps.length === 1 ? 'card' : 'cards'})`}.
              {store.reviewsToday > 0 && ` ${store.reviewsToday} answered so far.`}
            </p>
            <div className="actions">
              {plan.due.length + fresh > 0 ? (
                <A to="study" className="button button-primary">
                  Start session
                </A>
              ) : (
                <button type="button" className="button button-primary" onClick={() => go('study/10')}>
                  Learn 10 more new cards
                </button>
              )}
              {!store.settings.placementDone && (
                <A to="placement" className="button">
                  Check what I already know
                </A>
              )}
            </div>
          </div>
        )}

        {unit && (
          <section className="next-up">
            <h2 className="section-title">Next on your path</h2>
            <NextUnit data={data} index={plan.nextUnit!} />
          </section>
        )}
        {!unit && <p className="lede">You have started every word on the path.</p>}
      </section>

      <aside className="today-side">
        <h2 className="section-title">Toward level 4</h2>
        <Meter label="초급" title={levelTitle(1)} value={cov.level1} total={data.bundle.meta.counts.level1} />
        <Meter label="중급" title={levelTitle(2)} value={cov.level2} total={data.bundle.meta.counts.level2} />
        <Meter label="Roots" title="Hanja roots" value={cov.rootsKnown} total={data.bundle.meta.counts.roots} tone="seal" />
        <dl className="facts">
          <div>
            <dt>Ready to decode</dt>
            <dd>
              {nf.format(cov.decodableUnseen)}
              <span className="fact-note">words whose roots you already know</span>
            </dd>
          </div>
          <div>
            <dt>Still to start</dt>
            <dd>
              {nf.format(cov.remainingNew)}
              <span className="fact-note">
                cards, about {nf.format(daysLeft)} days at {store.settings.newPerDay} a day
              </span>
            </dd>
          </div>
        </dl>
        {history.some((h) => h.n > 0) && (
          <figure className="history">
            <figcaption>Answers, last 14 days</figcaption>
            <div className="bars" role="img" aria-label={history.map((h) => `${h.key}: ${h.n}`).join(', ')}>
              {history.map((h) => (
                <span key={h.key} className="bar" style={{ height: `${Math.max(2, (h.n / maxHist) * 100)}%` }} title={`${h.key}: ${h.n}`} />
              ))}
            </div>
          </figure>
        )}
      </aside>
    </div>
  );
}

function Meter({ label, title, value, total, tone }: { label: string; title: string; value: number; total: number; tone?: 'seal' }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div className="meter" title={title}>
      <div className="meter-head">
        <span className="meter-label" lang="ko">
          {label}
        </span>
        <span className="meter-value">
          {nf.format(value)} <span className="meter-total">/ {nf.format(total)}</span>
        </span>
      </div>
      <div className={`meter-track ${tone ? `meter-${tone}` : ''}`}>
        <span className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function NextUnit({ data, index }: { data: AppData; index: number }) {
  const store = useProgress();
  const unit = data.bundle.path[index];
  const all = unit.w.map((i) => data.words.get(i)!);
  const words = all.filter((w) => !store.get(wordCard(w.i)));
  const partial = words.length < all.length;
  const roots = unit.k === 'root' ? (unit.rt ?? []).map((c) => data.roots.get(c)!) : [];
  const base = unit.b ? data.words.get(unit.b) : undefined;
  let caption = '';
  if (partial) caption = `${words.length} more ${words.length === 1 ? 'word' : 'words'} in the unit you started`;
  else if (unit.k === 'root') caption = roots.length ? 'New roots and the words they complete' : 'More words from the roots above';
  else if (unit.k === 'revisit') caption = 'New words built from a root you already know';
  else if (unit.k === 'fam') caption = unit.rv ? `More from ${base?.w ?? 'a word you know'}` : `A word family around ${base?.w}`;
  else caption = 'Everyday native words';
  return (
    <div className="unit">
      <p className="unit-caption">{caption}</p>
      <div className="unit-body">
        {roots.length > 0 && (
          <div className="unit-roots">
            {roots.map((r) => (
              <A key={r.c} to={`root/${r.c}`} className="unit-root">
                <RootGlyph root={r} size="sm" />
                <span className="unit-root-gloss">{rootGloss(r)}</span>
              </A>
            ))}
          </div>
        )}
        {unit.k === 'revisit' && unit.rt && (
          <div className="unit-roots">
            {unit.rt.map((c) => (
              <A key={c} to={`root/${c}`} className="unit-root">
                <RootGlyph root={data.roots.get(c)!} size="sm" />
              </A>
            ))}
          </div>
        )}
        <ul className="unit-words">
          {words.map((w) => (
            <li key={w.i}>
              <A to={`word/${w.i}`}>
                <Cells word={w} size="md" hanja={!!w.s} data={data} />
              </A>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
