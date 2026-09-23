import { useMemo, useState } from 'react';
import { WordDetails } from '../components/WordDetails';
import { A, Cells, Empty, SpeakButton, StatusMark, StatusText } from '../components/ui';
import { searchWords, type AppData, type WordRec } from '../lib/data';
import { interval, levelLabel, nf } from '../lib/format';
import { knownRow, newRow, statusOf, wordCard, type Status } from '../lib/srs';
import { useProgress } from '../lib/store';

type LevelFilter = 0 | 1 | 2;
type LayerFilter = 'all' | 'sino' | 'native';

export function Words({ data }: { data: AppData }) {
  const store = useProgress();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<LevelFilter>(0);
  const [layer, setLayer] = useState<LayerFilter>('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [limit, setLimit] = useState(150);

  const base = useMemo<WordRec[]>(() => {
    if (q.trim()) return searchWords(data, q, 2000).map((i) => data.words.get(i)!);
    return data.bundle.path.flatMap((u) => u.w.map((i) => data.words.get(i)!));
  }, [q, data]);

  const list = base.filter(
    (w) =>
      (level === 0 || w.l === level) &&
      (layer === 'all' || (layer === 'sino' ? !!w.r : !w.r)) &&
      (status === 'all' || statusOf(store.get(wordCard(w.i))) === status),
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Words</h1>
        <p className="lede">Search in Korean, English or hanja. Without a search, words are listed in study-path order.</p>
      </header>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="학생, student, 學"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(150);
          }}
          aria-label="Search words"
          autoFocus
        />
        <select value={level} onChange={(e) => setLevel(Number(e.target.value) as LevelFilter)} aria-label="Level">
          <option value={0}>Both levels</option>
          <option value={1}>초급 only</option>
          <option value={2}>중급 only</option>
        </select>
        <select value={layer} onChange={(e) => setLayer(e.target.value as LayerFilter)} aria-label="Word type">
          <option value="all">Hanja and native</option>
          <option value="sino">With hanja roots</option>
          <option value="native">Native and loanwords</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="known">Known</option>
          <option value="learning">Learning</option>
          <option value="new">Not studied</option>
        </select>
      </div>
      <p className="note">{nf.format(list.length)} words</p>
      {list.length === 0 ? (
        <Empty title="No words match">
          <p>Check the spelling, or search for the dictionary form of a verb (먹다 rather than 먹어요).</p>
        </Empty>
      ) : (
        <>
          <ul className="word-rows">
            {list.slice(0, limit).map((w) => (
              <li key={w.i}>
                <A to={`word/${w.i}`} className="word-row">
                  <StatusMark status={statusOf(store.get(wordCard(w.i)))} />
                  <Cells word={w} size="sm" hanja={!!w.s} data={data} />
                  <span className="word-row-en">{w.e[0]?.[0]}</span>
                  <span className={`level level-${w.l}`}>{levelLabel(w.l)}</span>
                </A>
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <button type="button" className="button" onClick={() => setLimit(limit + 300)}>
              Show more words
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function WordPage({ data, id }: { data: AppData; id: number }) {
  const store = useProgress();
  const w = data.words.get(id);
  if (!w) {
    return (
      <Empty title="This word is not on your list">
        <p>
          <A to="words">Search the word list</A>
        </p>
      </Empty>
    );
  }
  const row = store.get(wordCard(w.i));
  const unit = data.unitOf.get(w.i);
  const now = new Date();
  return (
    <div className="page word-page">
      <header className="word-hero">
        <div className="word-head">
          <Cells word={w} size="xl" hanja data={data} />
          <SpeakButton text={w.w.replace(/-/g, '')} />
        </div>
        <p className="meta-line">
          <StatusText status={statusOf(row)} />
          {row && row.fsrs.reps > 0 && <span>Next review in {interval(now, row.fsrs.due)}</span>}
          {unit !== undefined && (
            <span>
              Path unit {nf.format(unit + 1)} of {nf.format(data.bundle.path.length)}
            </span>
          )}
        </p>
        <div className="actions">
          {!row && (
            <>
              <button type="button" className="button" onClick={() => store.putCards([newRow(wordCard(w.i), now)])}>
                Add to today's study
              </button>
              <button type="button" className="button" onClick={() => store.putCards([knownRow(wordCard(w.i), now)])}>
                I already know this
              </button>
            </>
          )}
          {row && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (confirm(`Forget your progress on ${w.w}? It will come back as a new card.`)) store.deleteCards([row.id]);
              }}
            >
              Reset this word
            </button>
          )}
        </div>
      </header>
      <WordDetails word={w} data={data} conjFull />
    </div>
  );
}
