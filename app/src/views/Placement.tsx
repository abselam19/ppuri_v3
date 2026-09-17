import { useMemo, useState } from 'react';
import { A, go } from '../components/ui';
import type { AppData, Level } from '../lib/data';
import { levelLabel, nf } from '../lib/format';
import { knownRow, wordCard } from '../lib/srs';
import { useProgress } from '../lib/store';

const PAGE = 30;

export function Placement({ data }: { data: AppData }) {
  const store = useProgress();
  const [level, setLevel] = useState<Level>(store.settings.placementPos[0] >= 1e9 ? 2 : 1);
  const [marked, setMarked] = useState<Set<number>>(new Set());

  const ordered = useMemo(
    () => data.bundle.path.flatMap((u) => u.w).filter((i) => data.words.get(i)!.l === level),
    [data, level],
  );
  const pos = store.settings.placementPos[level - 1];
  const page = useMemo(() => {
    const out: number[] = [];
    let i = Math.min(pos, ordered.length);
    for (; i < ordered.length && out.length < PAGE; i++) {
      if (!store.get(wordCard(ordered[i]))) out.push(ordered[i]);
    }
    return { ids: out, end: i };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, pos, store.getVersion()]);
  const done = Math.min(pos, ordered.length);

  async function save(next: 'page' | 'finish', all = false) {
    const now = new Date();
    const ids = all ? page.ids : page.ids.filter((i) => marked.has(i));
    await store.putCards(ids.map((i) => knownRow(wordCard(i), now)));
    const placementPos: [number, number] = [...store.settings.placementPos];
    placementPos[level - 1] = page.end >= ordered.length ? 1e9 : page.end;
    await store.setSettings({ placementPos, placementDone: next === 'finish' || store.settings.placementDone });
    setMarked(new Set());
    window.scrollTo(0, 0);
    if (next === 'finish') go('');
  }

  const finishedLevel = page.ids.length === 0;
  return (
    <div className="page placement">
      <header className="page-head">
        <h1 className="display">What do you already know?</h1>
        <p className="lede">
          Mark every word whose meaning you recall instantly. Marked words skip the learning steps and come back for a
          check in two to eight weeks. When a page has fewer than five words you know, you can stop: the path will teach the rest.
        </p>
      </header>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Level">
          {([1, 2] as Level[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)}>
              <span lang="ko">{levelLabel(l)}</span>
            </button>
          ))}
        </div>
        <span className="note">
          {nf.format(Math.min(done, ordered.length))} of {nf.format(ordered.length)} {levelLabel(level)} words checked
        </span>
      </div>

      {finishedLevel ? (
        <div className="empty">
          <p className="empty-title">You have checked every {levelLabel(level)} word.</p>
          <div className="actions">
            {level === 1 && (
              <button type="button" className="button" onClick={() => setLevel(2)}>
                Continue with 중급
              </button>
            )}
            <button type="button" className="button button-primary" onClick={async () => { await store.setSettings({ placementDone: true }); go(''); }}>
              Finish and go to today
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="chips" aria-label="Words to check">
            {page.ids.map((i) => {
              const w = data.words.get(i)!;
              const on = marked.has(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`chip ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const s = new Set(marked);
                      if (on) s.delete(i);
                      else s.add(i);
                      setMarked(s);
                    }}
                  >
                    <span lang="ko">{w.w}</span>
                    {(data.homographs.get(w.w)?.length ?? 0) > 1 && <span className="chip-hint">{w.e[0]?.[0].split(/[;,]/)[0]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button type="button" className="button button-primary" onClick={() => save('page')}>
              {marked.size ? `Save ${marked.size} known, next page` : 'I know none of these, next page'}
            </button>
            <button type="button" className="button" onClick={() => save('page', true)}>
              I know all of these
            </button>
            <button type="button" className="text-button" onClick={() => save('finish')}>
              Save and stop checking
            </button>
          </div>
          <p className="note">
            Homographs show a short hint so you know which word is meant. <A to="">Back to today</A>
          </p>
        </>
      )}
    </div>
  );
}
