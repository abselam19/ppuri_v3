import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RootMap, WordMap } from '../components/Maps';
import { ConjTable, Examples, Family, Relations, Senses } from '../components/WordDetails';
<<<<<<< HEAD
import { A, Cells, RootGlyph, SameSound, SpeakButton, go } from '../components/ui';
import { checkAnswer, drillFor, verbFor } from '../lib/conjugate';
import { anchorWords, rootGloss, type AppData, type WordRec } from '../lib/data';
=======
import { A, Cells, RootGlyph, SpeakButton, go } from '../components/ui';
import { checkAnswer, drillFor, verbFor } from '../lib/conjugate';
import { rootGloss, type AppData, type WordRec } from '../lib/data';
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
import { hash, interval, levelLabel, posLabel } from '../lib/format';
import { orderSession, planToday, wordDecodable } from '../lib/session';
import {
  newRow,
  parseCard,
  preview,
  rate,
  Rating,
  State,
  type CardRow,
  type Grade,
} from '../lib/srs';
import { romanize } from '../lib/roman';
import { store as progress, useProgress } from '../lib/store';
import { scheduleSync } from '../lib/sync';
import { speak } from '../lib/tts';

const LEARN_AHEAD_MS = 20 * 60 * 1000;

interface Undo {
  logId: number;
  prev: CardRow;
  isNew: boolean;
  id: string;
  queue: string[];
  learning: [string, number][];
}

export function Study({ data, extra }: { data: AppData; extra: number }) {
  const store = useProgress();
  const [queue, setQueue] = useState<string[]>([]);
  const [learning, setLearning] = useState<Map<string, number>>(new Map());
  const [current, setCurrent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [history, setHistory] = useState<Undo[]>([]);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());
  const started = useRef(Date.now());

  useEffect(() => {
    if (extra) {
      const base = progress.settings.newPerDay;
      progress.settings = { ...progress.settings, newPerDay: base + extra };
      const plan = planToday(data);
      progress.settings = { ...progress.settings, newPerDay: base };
      start(orderSession(plan));
    } else {
      start(orderSession(planToday(data)));
    }
    function start(order: string[]) {
      setCurrent(order[0] ?? null);
      setQueue(order.slice(1));
      setReady(true);
      shownAt.current = Date.now();
    }
    return () => {
      progress.backupToServer();
      if (progress.onLocalChange) scheduleSync(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useCallback((q: string[], l: Map<string, number>) => {
    const now = Date.now();
    const nextQueue = [...q];
    const nextLearning = new Map(l);
    let chosen: string | null = null;
    const dueLearning = [...nextLearning].filter(([, t]) => t <= now).sort((a, b) => a[1] - b[1]);
    if (dueLearning.length) chosen = dueLearning[0][0];
    else if (nextQueue.length) chosen = nextQueue.shift()!;
    else {
      const soon = [...nextLearning].sort((a, b) => a[1] - b[1])[0];
      if (soon && soon[1] - now < LEARN_AHEAD_MS) chosen = soon[0];
    }
    if (chosen) nextLearning.delete(chosen);
    setQueue(nextQueue);
    setLearning(nextLearning);
    setCurrent(chosen);
    setRevealed(false);
    setAnswer('');
    shownAt.current = Date.now();
  }, []);

  const onRate = useCallback(
    async (grade: Grade) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const now = new Date();
        const existing = progress.get(current);
        const row = existing ?? newRow(current, now);
        const ms = Math.min(Date.now() - shownAt.current, 120000);
        const res = rate(row, grade, now, progress.settings.retention, ms);
        const logId = await progress.review(res.row, res.log);
        setHistory((h) => [...h.slice(-30), { logId, prev: row, isNew: !existing, id: current, queue, learning: [...learning] }]);
        setReviewed((n) => n + 1);
        const l = new Map(learning);
        const dueIn = res.row.fsrs.due.getTime() - Date.now();
        if (res.row.fsrs.state !== State.Review && dueIn < 6 * 3600 * 1000) l.set(current, res.row.fsrs.due.getTime());
        pick(queue, l);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, queue, learning, pick],
  );

  const onUndo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    await progress.undo(last.logId, last.prev, last.isNew);
    setHistory((h) => h.slice(0, -1));
    setReviewed((n) => Math.max(0, n - 1));
    setQueue(last.queue);
    setLearning(new Map(last.learning));
    setCurrent(last.id);
    setRevealed(false);
    setAnswer('');
  }, [history, busy]);

  const kind = current ? parseCard(current).kind : null;
  const row = current ? store.get(current) : undefined;
  const drill = useMemo(() => {
    if (!current || kind !== 'c') return null;
    const w = data.words.get(Number(parseCard(current).ref))!;
    const verb = verbFor(w.w, w.p, w.c);
    return { word: w, verb, ...drillFor(verb, hash(current) + (row?.fsrs.reps ?? 0)) };
  }, [current, kind, row?.fsrs.reps, data]);
  const drillCorrect = drill ? checkAnswer(answer, drill.answers) : false;
  const suggested: Grade = kind === 'c' ? (drillCorrect ? Rating.Good : Rating.Again) : Rating.Good;

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        go('');
        return;
      }
      if ((e.key === 'z' || e.key === 'Z') && !typing) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (!current) return;
      if (!revealed) {
        if ((e.key === ' ' && !typing) || e.key === 'Enter') {
          e.preventDefault();
          setRevealed(true);
        }
      } else {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onRate(suggested);
        } else if (!typing && ['1', '2', '3', '4'].includes(e.key)) {
          e.preventDefault();
          onRate(Number(e.key) as Grade);
        }
      }
      if ((e.key === 's' || e.key === 'S') && !typing) {
        const text = spokenText(data, current);
        if (text) speak(text, progress.settings.voice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, onRate, onUndo, suggested, data]);

  // pronunciation on reveal (word cards) or on show (drills show the dictionary form)
  useEffect(() => {
    if (!current || !progress.settings.autoSpeak) return;
    const k = parseCard(current).kind;
    if ((k === 'w' && !revealed) || (k === 'p' && revealed)) {
      const text = spokenText(data, current);
      if (text) speak(text, progress.settings.voice);
    }
  }, [current, revealed, data]);

  if (!ready) return null;

  const remaining = queue.length + learning.size + (current ? 1 : 0);

  if (!current) {
    const minutes = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    return (
      <div className="study-done">
        <h1 className="display-ko" lang="ko">
          수고했어요
        </h1>
        <p className="lede">
          {reviewed === 0
            ? 'Nothing is due right now. New cards unlock again tomorrow, or you can add more today.'
            : `You finished ${reviewed} ${reviewed === 1 ? 'card' : 'cards'} in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`}
        </p>
        <div className="actions">
          <A to="" className="button button-primary">
            Back to today
          </A>
          <button
            type="button"
            className="button"
            onClick={() => go(`study/${(extra || 0) + 10}`)}
          >
            Add 10 more new cards
          </button>
        </div>
        {history.length > 0 && (
          <button type="button" className="text-button" onClick={onUndo}>
            Undo last answer (Z)
          </button>
        )}
      </div>
    );
  }

  const isFresh = !row;
  return (
    <div className="study">
      <div className="study-bar">
        <A to="" className="text-button">
          Leave session
        </A>
        <span className="study-count">
          {remaining} left{isFresh && <span className="tag tag-seal">new</span>}
          {row && row.fsrs.state !== State.Review && !isFresh && <span className="tag">learning</span>}
        </span>
        <button type="button" className="text-button" onClick={onUndo} disabled={!history.length}>
          Undo (Z)
        </button>
      </div>

      <div className="stage">
        {kind === 'r' && <RootCardView data={data} id={current} revealed={revealed} />}
        {kind === 'w' && <WordCardView data={data} id={current} revealed={revealed} />}
        {kind === 'p' && <ProdCardView data={data} id={current} revealed={revealed} />}
        {kind === 'c' && drill && (
          <DrillCardView
            word={drill.word}
            label={drill.spec.label}
            grammar={drill.spec.grammar}
            answers={drill.answers}
            answer={answer}
            setAnswer={setAnswer}
            revealed={revealed}
            correct={drillCorrect}
            data={data}
          />
        )}
      </div>

      <div className="answer-bar">
        {!revealed ? (
          <button type="button" className="button button-primary reveal" onClick={() => setRevealed(true)}>
            {kind === 'c' ? 'Check' : 'Show answer'}
            <kbd>{kind === 'c' ? 'Enter' : 'Space'}</kbd>
          </button>
        ) : (
          <Ratings row={row ?? newRow(current, new Date())} suggested={suggested} onRate={onRate} disabled={busy} />
        )}
      </div>
    </div>
  );
}

function spokenText(data: AppData, id: string): string | null {
  const { kind, ref } = parseCard(id);
  if (kind === 'r') return null;
  const w = data.words.get(Number(ref));
  return w ? w.w.replace(/-/g, '') : null;
}

function Ratings({ row, suggested, onRate, disabled }: { row: CardRow; suggested: Grade; onRate: (g: Grade) => void; disabled: boolean }) {
  const now = new Date();
  const p = preview(row, now, progress.settings.retention);
  const items: [Grade, string, string][] = [
    [Rating.Again, 'Again', 'again'],
    [Rating.Hard, 'Hard', 'hard'],
    [Rating.Good, 'Good', 'good'],
    [Rating.Easy, 'Easy', 'easy'],
  ];
  return (
    <div className="ratings" role="group" aria-label="How well did you remember?">
      {items.map(([g, label, cls], i) => (
        <button
          key={g}
          type="button"
          className={`rating rating-${cls} ${g === suggested ? 'rating-suggested' : ''}`}
          onClick={() => onRate(g)}
          disabled={disabled}
        >
          <span className="rating-label">{label}</span>
          <span className="rating-when">{interval(now, p[g])}</span>
          <kbd>{i + 1}</kbd>
        </button>
      ))}
    </div>
  );
}

function RootCardView({ data, id, revealed }: { data: AppData; id: string; revealed: boolean }) {
  const root = data.roots.get(parseCard(id).ref)!;
<<<<<<< HEAD
  // several roots share one reading (ten are read 시), so the card names this one by its words
  const anchors = anchorWords(data, root, 2);
=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
  return (
    <div className="card card-root">
      <p className="prompt">What does this root mean?</p>
      <RootGlyph root={root} />
<<<<<<< HEAD
      {anchors.length > 0 && (
        <p className="root-anchor">
          as in{' '}
          {anchors.map((w, i) => (
            <span key={w.i}>
              {i > 0 && ', '}
              <span lang="ko">{w.w}</span>
            </span>
          ))}
        </p>
      )}
=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
      {revealed && (
        <div className="reveal-panel">
          <p className="root-meaning">
            <span className="root-hun" lang="ko">
              {root.hun.join(', ')}
            </span>
            <span className="root-en">{rootGloss(root)}</span>
          </p>
<<<<<<< HEAD
          <SameSound data={data} root={root} limit={3} />
=======
>>>>>>> 611ea1801de19e22502a4f1426336ebcc88f000e
          <p className="minor">Words from this root and their co-parent roots</p>
          <RootMap key={root.c} data={data} char={root.c} limit={8} compact caption={false} />
          <A to={`root/${root.c}`} className="text-button">
            Open the full root map
          </A>
        </div>
      )}
    </div>
  );
}

function homographNote(data: AppData, w: WordRec): string | null {
  const ids = data.homographs.get(w.w) ?? [];
  if (ids.length < 2) return null;
  return `${ids.indexOf(w.i) + 1} of ${ids.length} words spelled ${w.w}`;
}

function WordCardView({ data, id, revealed }: { data: AppData; id: string; revealed: boolean }) {
  const w = data.words.get(Number(parseCard(id).ref))!;
  const decode = wordDecodable(data, w.i);
  const note = homographNote(data, w);
  return (
    <div className="card card-word">
      <p className="prompt">{decode && !revealed ? 'You know every root here. What does the word mean?' : 'What does this mean?'}</p>
      <div className="word-head">
        <Cells word={w} size="xl" hanja={revealed || decode} gloss={decode && !revealed} data={data} />
        <SpeakButton text={w.w.replace(/-/g, '')} />
      </div>
      <p className="meta-line">
        {w.pr && <span lang="ko">[{w.pr}]</span>}
        <span>{posLabel(w.p)}</span>
        <span className={`level level-${w.l}`}>{levelLabel(w.l)}</span>
        {note && <span>{note}</span>}
      </p>
      {revealed && (
        <div className="reveal-panel">
          <Senses word={w} />
          {progress.settings.koreanDefinitions && w.k && (
            <p className="ko-def" lang="ko">
              {w.k}
            </p>
          )}
          <WordMap data={data} word={w} />
          <Examples word={w} />
          {w.p.some((p) => p === '동사' || p === '형용사') && w.w.endsWith('다') && <ConjTable word={w} />}
          <Family word={w} data={data} />
          <Relations word={w} data={data} />
          <A to={`word/${w.i}`} className="text-button">
            Open word page
          </A>
        </div>
      )}
    </div>
  );
}

function ProdCardView({ data, id, revealed }: { data: AppData; id: string; revealed: boolean }) {
  const w = data.words.get(Number(parseCard(id).ref))!;
  const blanks: WordRec = { ...w, s: Array.from(w.w).map(() => ['\u00a0', null]), rr: undefined, pr: undefined };
  return (
    <div className="card card-prod">
      <p className="prompt">Say it in Korean</p>
      <p className="prod-en">{w.e.slice(0, 2).map((e) => e[0]).join('; ')}</p>
      <p className="meta-line">
        <span>{posLabel(w.p)}</span>
        <span>{Array.from(w.w).length} syllables</span>
      </p>
      <div className="word-head">
        {revealed ? <Cells word={w} size="xl" hanja data={data} /> : <Cells word={blanks} size="xl" />}
        {revealed && <SpeakButton text={w.w} />}
      </div>
      {revealed && (
        <div className="reveal-panel">
          <Senses word={w} />
          <Examples word={w} />
        </div>
      )}
    </div>
  );
}

function DrillCardView(props: {
  word: WordRec;
  label: string;
  grammar: string;
  answers: string[];
  answer: string;
  setAnswer: (s: string) => void;
  revealed: boolean;
  correct: boolean;
  data: AppData;
}) {
  const { word, label, grammar, answers, answer, setAnswer, revealed, correct } = props;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (revealed) input.current?.blur();
    else input.current?.focus();
  }, [revealed, word.i]);
  return (
    <div className="card card-drill">
      <p className="prompt">Conjugate</p>
      <div className="word-head">
        <Cells word={word} size="lg" />
        <SpeakButton text={word.w} />
      </div>
      <p className="drill-target">
        {label} <span className="drill-grammar" lang="ko">{grammar}</span>
      </p>
      <input
        ref={input}
        className={`drill-input ${revealed ? (correct ? 'is-right' : 'is-wrong') : ''}`}
        lang="ko"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        readOnly={revealed}
        placeholder="Type the form in Korean"
        aria-label="Your answer"
        autoComplete="off"
        spellCheck={false}
      />
      {revealed && (
        <div className="reveal-panel">
          <p className={`drill-result ${correct ? 'is-right' : 'is-wrong'}`}>
            {correct ? 'Correct.' : answer.trim() ? 'Not quite.' : 'Answer:'}{' '}
            <span lang="ko" className="drill-answer">
              {answers[0]}
            </span>
            {progress.settings.under !== 'hanja' && <span className="drill-rr">{romanize(answers[0])}</span>}
            {answers.length > 1 && (
              <span className="conj-alt" lang="ko">
                also {answers.slice(1).join(', ')}
              </span>
            )}
          </p>
          <p className="note">{word.e[0]?.[0]}</p>
          <ConjTable word={word} />
        </div>
      )}
    </div>
  );
}

