import { useMemo, useState } from 'react';
import { RootMap } from '../components/Maps';
<<<<<<< HEAD
import { A, Cells, Empty, RootGlyph, SameSound, StatusMark, StatusText } from '../components/ui';
=======
import { A, Cells, Empty, RootGlyph, StatusMark, StatusText } from '../components/ui';
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
import { rootGloss, searchRoots, type AppData } from '../lib/data';
import { levelLabel, nf } from '../lib/format';
import { newRow, rootCard, statusOf, wordCard, type Status } from '../lib/srs';
import { useProgress } from '../lib/store';

type Filter = 'all' | Status;

export function Roots({ data }: { data: AppData }) {
  const store = useProgress();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const matches = useMemo(() => (q.trim() ? new Set(searchRoots(data, q)) : null), [q, data]);
  const roots = data.bundle.roots.filter((r) => {
    if (matches && !matches.has(r.c)) return false;
    return filter === 'all' || statusOf(store.get(rootCard(r.c))) === filter;
  });
  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, known: 0 };
    for (const r of data.bundle.roots) c[statusOf(store.get(rootCard(r.c)))]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, store.getVersion()]);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Roots</h1>
        <p className="lede">
          {nf.format(data.bundle.roots.length)} roots that appear in two or more words on your list, shown by their Hangul reading in the
          order the path teaches them.
        </p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search by Hangul, romanization, meaning or hanja"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search roots"
        />
        <div className="segmented" role="radiogroup" aria-label="Filter by status">
          {(
            [
              ['all', `All ${nf.format(data.bundle.roots.length)}`],
              ['known', `Known ${nf.format(counts.known)}`],
              ['learning', `Learning ${nf.format(counts.learning)}`],
              ['new', `Not studied ${nf.format(counts.new)}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {roots.length === 0 ? (
        <Empty title="No roots match">
          <p>Try a hanja such as 學, a reading such as 학, or an English word such as learn.</p>
        </Empty>
      ) : (
        <ul className="root-grid">
          {roots.map((r) => (
            <li key={r.c}>
              <A to={`root/${r.c}`} className={`root-tile status-${statusOf(store.get(rootCard(r.c)))}`}>
                <span className="root-tile-reading" lang="ko">
                  {r.rd[0]}
                </span>
                <span className="root-tile-sub">
                  {store.settings.under !== 'roman' && (
                    <span className="root-tile-char" lang="ko">
                      {r.c}
                    </span>
                  )}
                  {store.settings.under !== 'hanja' && r.rr && <span className="root-tile-rr">{r.rr[0]}</span>}
                </span>
                <span className="root-tile-gloss">{rootGloss(r).split(',')[0]}</span>
              </A>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RootPage({ data, char }: { data: AppData; char: string }) {
  const store = useProgress();
  const [view, setView] = useState<'map' | 'list'>('map');
  const root = data.roots.get(char);
  if (!root) {
    return (
      <Empty title={`${char} is not one of the roots on your path`}>
        <p>
          It may appear in only one word. <A to="roots">Browse all roots</A>
        </p>
      </Empty>
    );
  }
  const row = store.get(rootCard(root.c));
  const words = root.w.map((i) => data.words.get(i)!);
  const order = (data.rootOrder.get(root.c) ?? 0) + 1;
  return (
    <div className="page root-page">
      <header className="root-hero">
        <RootGlyph root={root} />
        <div className="root-hero-text">
          <p className="root-hun" lang="ko">
            {root.hun.join(', ') || root.rd[0]}
          </p>
          <p className="root-en">{rootGloss(root)}</p>
<<<<<<< HEAD
          {root.en && root.en !== rootGloss(root) && <p className="root-def">In Chinese dictionaries: {root.en}</p>}
=======
          {root.en && root.en !== rootGloss(root) && <p className="root-def">Full dictionary sense: {root.en}</p>}
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
          <p className="meta-line">
            <StatusText status={statusOf(row)} />
            <span>
              Root {nf.format(order)} of {nf.format(data.bundle.roots.length)}
            </span>
            {root.rd.length > 1 && (
              <span lang="ko">
                Read {root.rd[0]}, or {root.rd.slice(1).join(', ')} in some words
              </span>
            )}
          </p>
          {!row && (
            <button type="button" className="button" onClick={() => store.putCards([newRow(rootCard(root.c), new Date())])}>
              Add this root to today's study
            </button>
          )}
        </div>
      </header>

<<<<<<< HEAD
      <SameSound data={data} root={root} />

=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
      <section>
        <div className="section-head">
          <h2 className="section-title">{nf.format(words.length)} words on your list</h2>
          <div className="segmented" role="radiogroup" aria-label="View">
            {(['map', 'list'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                {v === 'map' ? 'Map' : 'List'}
              </button>
            ))}
          </div>
        </div>
        {view === 'map' ? (
          <RootMap key={root.c} data={data} char={root.c} />
        ) : (
          <ul className="word-rows">
            {words.map((w) => (
              <li key={w.i}>
                <A to={`word/${w.i}`} className="word-row">
                  <StatusMark status={statusOf(store.get(wordCard(w.i)))} />
                  <Cells word={w} size="sm" hanja data={data} />
                  <span className="word-row-en">{w.e[0]?.[0]}</span>
                  <span className={`level level-${w.l}`}>{levelLabel(w.l)}</span>
                </A>
              </li>
            ))}
          </ul>
        )}
      </section>

      {root.adv.length > 0 && (
        <section>
          <h2 className="section-title">Later, at the advanced level</h2>
          <ul className="adv-list">
            {root.adv.map(([w, h, en]) => (
              <li key={w + h}>
                <span lang="ko" className="adv-word">
                  {w}
                </span>
                <span lang="ko" className="adv-hanja">
                  {h}
                </span>
                <span className="adv-en">{en}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
