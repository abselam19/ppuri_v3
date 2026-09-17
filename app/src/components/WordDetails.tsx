import { useMemo, useState } from 'react';
import { CLASS_LABEL, CORE_KEYS, formTable, verbFor } from '../lib/conjugate';
import { isVerbLike, rootGloss, type AppData, type WordRec } from '../lib/data';
import { highlightParts, levelLabel, posLabel } from '../lib/format';
import { rootCard, statusOf, wordCard } from '../lib/srs';
import { joinSyllables, romanize } from '../lib/roman';
import { useProgress, type Settings } from '../lib/store';
import { WordMap } from './Maps';
import { A, Cells, StatusMark } from './ui';

export function Senses({ word, max = 3 }: { word: WordRec; max?: number }) {
  return (
    <ol className="senses">
      {word.e.slice(0, max).map(([lemma, def], i) => (
        <li key={i}>
          <span className="sense-lemma">{lemma}</span>
          {def && <span className="sense-def">{def}</span>}
        </li>
      ))}
    </ol>
  );
}

function Sub({ h, rr, under }: { h?: string | null; rr?: string; under: Settings['under'] }) {
  const han = under !== 'roman' && h;
  const rom = under !== 'hanja' && rr;
  if (!han && !rom) return null;
  return (
    <span className="breakdown-sub">
      {han && (
        <span className="breakdown-hanja" lang="ko">
          {h}
        </span>
      )}
      {rom && <span className="breakdown-rr">{rr}</span>}
    </span>
  );
}

export function Breakdown({ word, data }: { word: WordRec; data: AppData }) {
  const store = useProgress();
  const under = store.settings.under;
  if (!word.s) return null;
  const loan = /[A-Za-z]/.test(word.o ?? ''); // e.g. 테니스장 from "tennis場"
  return (
    <div className="breakdown" aria-label="Syllable breakdown">
      {word.s.map(([syl, h], i) => {
        const root = h ? data.roots.get(h) : undefined;
        const single = h && !root ? data.singles.get(h) : undefined;
        return (
          <span className="breakdown-part" key={i}>
            {i > 0 && (
              <span className="breakdown-plus" aria-hidden="true">
                +
              </span>
            )}
            {h && root ? (
              <A to={`root/${h}`} className="breakdown-root">
                <span className="breakdown-syl" lang="ko">{syl}</span>
                <Sub h={h} rr={word.rr?.[i]} under={under} />
                <span className="breakdown-gloss">{rootGloss(root)}</span>
                <StatusMark status={statusOf(store.get(rootCard(h)))} />
              </A>
            ) : h ? (
              <span className="breakdown-root breakdown-single" title="This root appears in no other word on your list">
                <span className="breakdown-syl" lang="ko">{syl}</span>
                <Sub h={h} rr={word.rr?.[i]} under={under} />
                <span className="breakdown-gloss">{single?.g || 'only in this word'}</span>
              </span>
            ) : (
              <span className="breakdown-root breakdown-native">
                <span className="breakdown-syl" lang="ko">{syl}</span>
                <Sub rr={word.rr?.[i]} under={under} />
                <span className="breakdown-gloss">{loan ? 'loanword' : 'native'}</span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function Examples({ word }: { word: WordRec }) {
  if (!word.x?.length) return null;
  return (
    <ul className="examples" lang="ko">
      {word.x.map((x, i) => (
        <li key={i}>
          {highlightParts(x, word.w).map((p, j) => (p.hit ? <mark key={j}>{p.text}</mark> : <span key={j}>{p.text}</span>))}
        </li>
      ))}
    </ul>
  );
}

export function ConjTable({ word, full = false }: { word: WordRec; full?: boolean }) {
  const [open, setOpen] = useState(full);
  const roman = useProgress().settings.under !== 'hanja';
  const verb = useMemo(() => verbFor(word.w, word.p, word.c), [word]);
  const rows = formTable(verb).filter((r) => open || CORE_KEYS.includes(r.spec.key));
  return (
    <section className="conj">
      <h4 className="minor">
        Conjugation <span className="conj-class">{CLASS_LABEL[verb.cls]}</span>
      </h4>
      <table>
        <tbody>
          {rows.map(({ spec, forms }) => (
            <tr key={spec.key}>
              <th scope="row">
                {spec.label}
                <span className="conj-grammar" lang="ko">{spec.grammar}</span>
              </th>
              <td lang="ko">
                <span className="conj-form">{forms[0]}</span>
                {forms.length > 1 && <span className="conj-alt">{forms.slice(1).join(', ')}</span>}
                {roman && <span className="conj-rr">{romanize(forms[0])}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!full && (
        <button type="button" className="text-button" onClick={() => setOpen(!open)}>
          {open ? 'Show fewer forms' : 'Show all forms'}
        </button>
      )}
    </section>
  );
}

export function Family({ word, data }: { word: WordRec; data: AppData }) {
  const store = useProgress();
  const base = word.f ? data.words.get(word.f) : undefined;
  const derived = (word.d ?? []).map((i) => data.words.get(i)!).filter(Boolean);
  if (!base && !derived.length && !word.b?.length && !word.xd?.length) return null;
  return (
    <section className="family">
      <h4 className="minor">Word family</h4>
      {base && (
        <p className="family-line">
          <span className="family-label">Built from</span>
          <WordLink word={base} status={statusOf(store.get(wordCard(base.i)))} />
        </p>
      )}
      {derived.length > 0 && (
        <p className="family-line">
          <span className="family-label">Grows into</span>
          {derived.map((d) => (
            <WordLink key={d.i} word={d} status={statusOf(store.get(wordCard(d.i)))} />
          ))}
        </p>
      )}
      {word.b && word.b.length > 0 && (
        <p className="family-line">
          <span className="family-label">Verbs on this noun</span>
          {word.b.map(([w, en]) => (
            <span className="family-extra" key={w}>
              <span lang="ko">{w}</span> <span className="family-en">{en}</span>
            </span>
          ))}
        </p>
      )}
      {word.xd && word.xd.length > 0 && (
        <p className="family-line">
          <span className="family-label">Also</span>
          {word.xd.map(([w, en]) => (
            <span className="family-extra" key={w}>
              <span lang="ko">{w}</span> <span className="family-en">{en}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

export function WordLink({ word, status }: { word: WordRec; status?: ReturnType<typeof statusOf> }) {
  return (
    <A to={`word/${word.i}`} className="word-link">
      {status && <StatusMark status={status} />}
      <span lang="ko">{word.w}</span>
      <span className="word-link-en">{word.e[0]?.[0].split(';')[0]}</span>
    </A>
  );
}

export function Relations({ word, data }: { word: WordRec; data: AppData }) {
  if (!word.y?.length) return null;
  const label: Record<string, string> = { 유의어: 'Similar', 반대말: 'Opposite' };
  return (
    <p className="relations">
      {word.y.map(([t, w], i) => {
        const ids = data.homographs.get(w);
        return (
          <span key={i} className="relation">
            <span className="family-label">{label[t] ?? t}</span>
            {ids ? <A to={`word/${ids[0]}`}><span lang="ko">{w}</span></A> : <span lang="ko">{w}</span>}
          </span>
        );
      })}
    </p>
  );
}

export function WordDetails({ word, data, conjFull = false }: { word: WordRec; data: AppData; conjFull?: boolean }) {
  const store = useProgress();
  return (
    <div className="details">
      <p className="meta-line">
        {store.settings.under !== 'hanja' && word.rr && <span className="rr-word">{joinSyllables(word.rr)}</span>}
        {word.pr && <span lang="ko">pronounced [{word.pr}]</span>}
        <span>{posLabel(word.p)}</span>
        <span className={`level level-${word.l}`}>{levelLabel(word.l)}</span>
        {word.o && !word.s && <span className="origin">from {word.o.replace(/^←/, '')}</span>}
      </p>
      <Senses word={word} />
      {store.settings.koreanDefinitions && word.k && (
        <p className="ko-def" lang="ko">
          {word.k}
        </p>
      )}
      <Breakdown word={word} data={data} />
      <WordMap data={data} word={word} />
      <Examples word={word} />
      {isVerbLike(word) && <ConjTable word={word} full={conjFull} />}
      <Family word={word} data={data} />
      <Relations word={word} data={data} />
    </div>
  );
}

export { Cells };
