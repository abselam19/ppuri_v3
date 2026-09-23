// Graphical maps: a root with its words and their co-parent roots, and a word between its roots.
// Maps show Hangul and English only; hanja stay in the breakdowns and root pages.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { rootGloss, type AppData, type RootRec, type WordRec } from '../lib/data';
import { joinSyllables, romanize } from '../lib/roman';
import { rootCard, statusOf, wordCard } from '../lib/srs';
import { useProgress } from '../lib/store';
import { StatusMark } from './ui';

export interface HanjaInfo {
  c: string;
  reading: string;
  gloss: string;
  isRoot: boolean;
  count: number;
  rd: string[];
  rr: string[];
}

export function hanjaInfo(data: AppData, c: string): HanjaInfo | null {
  const r = data.roots.get(c);
  if (r) return { c, reading: r.rd[0] ?? '', gloss: rootGloss(r), isRoot: true, count: r.w.length, rd: r.rd, rr: r.rr ?? [] };
  const s = data.singles.get(c);
  if (s) return { c, reading: s.rd[0] ?? '', gloss: s.g || s.hun[0] || '', isRoot: false, count: 1, rd: s.rd, rr: s.rr ?? [] };
  return null;
}

/** How a hanja is spelled in the given words (女 is 여 in 여학생 but 녀 in 남녀). */
function spelledAs(words: WordRec[], h: string, fallback: string): string {
  const seen: string[] = [];
  for (const w of words) for (const [syl, x] of w.s ?? []) if (x === h && !seen.includes(syl)) seen.push(syl);
  return seen.length ? seen.slice(0, 2).join('/') : fallback;
}

const rrFor = (info: HanjaInfo, label: string) =>
  label
    .split('/')
    .map((x) => info.rr[info.rd.indexOf(x)] ?? romanize(x))
    .join('/');

function hanjaOf(w: WordRec): string[] {
  const out: string[] = [];
  for (const [, h] of w.s ?? []) if (h && !out.includes(h)) out.push(h);
  return out;
}

const shortEn = (w: WordRec) => (w.e[0]?.[0] ?? '').split(';')[0].trim();
const wordTitle = (w: WordRec) => `${w.w}${w.rr ? ` (${joinSyllables(w.rr)})` : ''}: ${w.e[0]?.[0] ?? ''}`;

/** Shrink romanization labels that do not fit their box (down to 9px); the rest keep their size. */
function useFitLabels(ref: RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const fit = () => {
      ref.current?.querySelectorAll<HTMLElement>('.map-rr').forEach((el) => {
        el.style.fontSize = '';
        for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth + 1; i++) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size <= 9) break;
          el.style.fontSize = `${Math.max(9, Math.floor(size * (el.clientWidth / el.scrollWidth) * 10) / 10 - (i ? 0.5 : 0))}px`;
        }
      });
    };
    fit();
    void document.fonts?.ready.then(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const curveH = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = (x2 - x1) / 2;
  return `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
};

const curveV = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = (y2 - y1) / 2;
  return `M${x1} ${y1}C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function Node(props: {
  box: Box;
  to?: string;
  className: string;
  title?: string;
  children: ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { box, to, className, title, children, onFocus, onBlur } = props;
  const common = {
    className: `map-node ${className}`,
    style: { left: box.x, top: box.y, width: box.w, height: box.h },
    title,
    onMouseEnter: onFocus,
    onMouseLeave: onBlur,
    onFocus,
    onBlur,
  };
  return to ? (
    <a href={`#/${to}`} {...common}>
      {children}
    </a>
  ) : (
    <div {...common}>{children}</div>
  );
}

function WordText({ word, hit, roman }: { word: WordRec; hit?: string; roman?: boolean }) {
  const pre = word.w.startsWith('-') ? '-' : '';
  const post = word.w.endsWith('-') ? '-' : '';
  const body =
    word.s && hit
      ? word.s.map(([syl, h], i) => (
          <span key={i} className={h === hit ? 'map-hit' : undefined}>
            {syl}
          </span>
        ))
      : word.w.replace(/^-|-$/g, '');
  return (
    <span className="map-word-text">
      <span className="map-word-line">
        <span className="map-word-ko" lang="ko">
          {pre}
          {body}
          {post}
        </span>
        {roman && word.rr && (
          <span className={`map-rr${joinSyllables(word.rr).length > 14 ? ' is-long' : ''}`}>{joinSyllables(word.rr)}</span>
        )}
      </span>
      <span className="map-word-en">{shortEn(word)}</span>
    </span>
  );
}

function HubBody({ info, label, roman }: { info: HanjaInfo; label?: string; roman?: boolean }) {
  const text = label ?? info.reading;
  return (
    <>
      <span className="map-hub-line">
        <span className="map-hub-ko" lang="ko">
          {text}
        </span>
        {roman && <span className="map-rr">{rrFor(info, text)}</span>}
      </span>
      <span className="map-hub-en">{info.gloss}</span>
      <span className="map-hub-count">{info.isRoot ? `${info.count} words` : 'only in this word'}</span>
    </>
  );
}

// ---------------------------------------------------------------- root map
interface RootLayout {
  width: number;
  height: number;
  hub: Box;
  hubLabel: string;
  words: { word: WordRec; box: Box }[];
  parts: { info: HanjaInfo; box: Box; n: number; label: string }[];
  partsOf: Map<number, string[]>;
  main: { id: number; d: string }[];
  links: { id: number; p: string; d: string }[];
}

function layoutRootMap(data: AppData, root: RootRec, limit: number, highlight: number | undefined, compact: boolean): RootLayout {
  const HUB_W = compact ? 128 : 150;
  const WORD_W = compact ? 212 : 236;
  const PART_W = compact ? 136 : 156;
  const G1 = compact ? 44 : 60;
  const G2 = compact ? 60 : 80;
  const NODE_H = compact ? 44 : 50;
  const ROW = NODE_H + (compact ? 8 : 10);
  const HUB_H = 100;
  const xWord = HUB_W + G1;
  const xPart = xWord + WORD_W + G2;
  const width = xPart + PART_W;

  let ids = root.w.slice(0, limit);
  if (highlight !== undefined && root.w.includes(highlight) && !ids.includes(highlight)) {
    ids = [...ids.slice(0, Math.max(0, ids.length - 1)), highlight];
  }
  const order = new Map(root.w.map((id, i) => [id, i] as const));
  const words = ids.map((i) => data.words.get(i)).filter((w): w is WordRec => !!w);

  // co-parent roots of each word, and how many of the shown words each one joins
  const partsOf = new Map<number, string[]>();
  const count = new Map<string, number>();
  for (const w of words) {
    const ps = hanjaOf(w).filter((h) => h !== root.c && hanjaInfo(data, h) !== null);
    partsOf.set(w.i, ps);
    for (const p of ps) count.set(p, (count.get(p) ?? 0) + 1);
  }

  // keep words that share a co-parent next to each other so their lines stay short
  const keyOf = new Map<number, string | null>();
  for (const w of words) {
    const ps = partsOf.get(w.i)!;
    keyOf.set(w.i, ps.length ? ps.reduce((a, b) => (count.get(b)! > count.get(a)! ? b : a)) : null);
  }
  const groupFirst = new Map<string, number>();
  for (const w of words) {
    const k = keyOf.get(w.i);
    if (k) groupFirst.set(k, Math.min(groupFirst.get(k) ?? Infinity, order.get(w.i)!));
  }
  words.sort((a, b) => {
    const ka = keyOf.get(a.i);
    const kb = keyOf.get(b.i);
    if (!ka || !kb) {
      if (ka || kb) return ka ? -1 : 1;
      return order.get(a.i)! - order.get(b.i)!;
    }
    if (ka !== kb) return count.get(kb)! - count.get(ka)! || groupFirst.get(ka)! - groupFirst.get(kb)!;
    return order.get(a.i)! - order.get(b.i)!;
  });

  const colH = Math.max(NODE_H, (words.length - 1) * ROW + NODE_H);
  const wordBoxes = words.map((word, i) => ({ word, box: { x: xWord, y: i * ROW, w: WORD_W, h: NODE_H } }));
  const yOf = new Map(wordBoxes.map((b) => [b.word.i, b.box.y] as const));

  // each co-parent sits level with the words it joins, then the column is spread out
  const plist = [...count.keys()];
  const want = new Map<string, number>();
  for (const p of plist) {
    const ys = words.filter((w) => partsOf.get(w.i)!.includes(p)).map((w) => yOf.get(w.i)!);
    want.set(p, ys.reduce((a, b) => a + b, 0) / ys.length);
  }
  plist.sort((a, b) => want.get(a)! - want.get(b)! || count.get(b)! - count.get(a)!);
  const py = plist.map((p) => want.get(p)!);
  for (let i = 0; i < py.length; i++) py[i] = Math.max(py[i], i ? py[i - 1] + ROW : 0);
  const maxY = Math.max(colH - NODE_H, (py.length - 1) * ROW);
  for (let i = py.length - 1; i >= 0; i--) py[i] = Math.min(py[i], i === py.length - 1 ? maxY : py[i + 1] - ROW);
  for (let i = 0; i < py.length; i++) py[i] = Math.max(py[i], i ? py[i - 1] + ROW : 0);
  const pY = new Map(plist.map((p, i) => [p, py[i]] as const));
  const parts = plist.map((p, i) => {
    const info = hanjaInfo(data, p)!;
    const users = words.filter((w) => partsOf.get(w.i)!.includes(p));
    return { info, box: { x: xPart, y: py[i], w: PART_W, h: NODE_H }, n: count.get(p)!, label: spelledAs(users, p, info.reading) };
  });

  const height = Math.max(colH, py.length ? py[py.length - 1] + NODE_H : 0, HUB_H);
  const spine = words.length > 12;
  const hubY = spine ? 0 : Math.max(0, Math.min(colH / 2 - HUB_H / 2, height - HUB_H));
  const hubMid = hubY + HUB_H / 2;
  const sx = xWord - G1 / 2;
  const main = wordBoxes.map(({ word, box }) => {
    const y = box.y + NODE_H / 2;
    return { id: word.i, d: spine ? `M${HUB_W} ${hubMid}H${sx}V${y}H${xWord}` : curveH(HUB_W, hubMid, xWord, y) };
  });
  const links = wordBoxes.flatMap(({ word, box }) =>
    partsOf.get(word.i)!.map((p) => ({
      id: word.i,
      p,
      d: curveH(xWord + WORD_W, box.y + NODE_H / 2, xPart, pY.get(p)! + NODE_H / 2),
    })),
  );
  const hubLabel = spelledAs(words, root.c, root.rd[0] ?? '');
  return { width, height, hub: { x: 0, y: hubY, w: HUB_W, h: HUB_H }, hubLabel, words: wordBoxes, parts, partsOf, main, links };
}

export function RootMap(props: {
  data: AppData;
  char: string;
  limit?: number;
  highlight?: number;
  compact?: boolean;
  caption?: boolean;
}) {
  const { data, char, limit = 20, highlight, compact = false, caption = true } = props;
  const store = useProgress();
  const roman = store.settings.under !== 'hanja';
  const [all, setAll] = useState(false);
  const [focus, setFocus] = useState<{ word?: number; part?: string } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const root = data.roots.get(char);
  const L = useMemo(
    () => (root ? layoutRootMap(data, root, all ? Infinity : limit, highlight, compact) : null),
    [data, root, all, limit, highlight, compact],
  );
  useFitLabels(mapRef, [L, roman]);
  if (!root || !L) return null;
  const info = hanjaInfo(data, root.c)!;
  const inWord = (id: number, p: string) => L.partsOf.get(id)?.includes(p) ?? false;
  const hotWord = (id: number) => !!focus && (focus.word === id || (focus.part !== undefined && inWord(id, focus.part)));
  const hotPart = (p: string) => !!focus && (focus.part === p || (focus.word !== undefined && inWord(focus.word, p)));
  const hotLink = (id: number, p: string) => !!focus && (focus.word === id || focus.part === p);
  const hot = (on: boolean) => (on ? ' is-hot' : '');
  const multi = L.parts.filter((p) => p.n > 1).length;

  return (
    <figure className={`map-figure${compact ? ' is-compact' : ''}`}>
      {caption && (
        <figcaption className="map-caption">
          Words grown from <b lang="ko">{info.reading}</b> ({info.gloss}), with their co-parent roots on the right.
          {multi > 0 && ` ${multi} co-parent ${multi === 1 ? 'root joins' : 'roots join'} more than one of these words.`} Point at a
          word or root to trace its lines.
        </figcaption>
      )}
      <div className="map-scroll">
        <div
          ref={mapRef}
          className={`map${focus ? ' is-focus' : ''}`}
          style={{ width: L.width, height: L.height }}
          role="group"
          aria-label={`Root map for ${info.reading}`}
        >
          <svg className="map-lines" width={L.width} height={L.height} aria-hidden="true">
            {L.main.map((m) => (
              <path key={`m${m.id}`} d={m.d} className={`map-link map-link-main${hot(hotWord(m.id))}`} />
            ))}
            {L.links.map((l) => (
              <path key={`l${l.id}${l.p}`} d={l.d} className={`map-link map-link-part${hot(hotLink(l.id, l.p))}`} />
            ))}
          </svg>
          <Node box={L.hub} className="map-hub" title={`${info.reading}: ${info.gloss}`}>
            <HubBody info={info} label={L.hubLabel} roman={roman} />
          </Node>
          {L.words.map(({ word, box }) => (
            <Node
              key={word.i}
              box={box}
              to={word.i === highlight ? undefined : `word/${word.i}`}
              className={`map-word${word.i === highlight ? ' is-current' : ''}${hot(hotWord(word.i))}`}
              title={wordTitle(word)}
              onFocus={() => setFocus({ word: word.i })}
              onBlur={() => setFocus(null)}
            >
              <StatusMark status={statusOf(store.get(wordCard(word.i)))} />
              <WordText word={word} hit={root.c} roman={roman} />
            </Node>
          ))}
          {L.parts.map(({ info: p, box, n, label }) => (
            <Node
              key={p.c}
              box={box}
              to={p.isRoot ? `root/${p.c}` : undefined}
              className={`map-part status-${p.isRoot ? statusOf(store.get(rootCard(p.c))) : 'new'}${p.isRoot ? '' : ' map-single'}${hot(hotPart(p.c))}`}
              title={p.isRoot ? `${label}: ${p.gloss}. Open its map (${p.count} words).` : `${label}: ${p.gloss}. Appears only in this word.`}
              onFocus={() => setFocus({ part: p.c })}
              onBlur={() => setFocus(null)}
            >
              <span className="map-word-line">
                <span className="map-part-ko" lang="ko">
                  {label}
                </span>
                {roman && <span className="map-rr">{rrFor(p, label)}</span>}
              </span>
              <span className="map-part-en">{p.gloss}</span>
              {n > 1 && (
                <span className="map-part-n" aria-label={`co-parent of ${n} of these words`}>
                  ×{n}
                </span>
              )}
            </Node>
          ))}
        </div>
      </div>
      {root.w.length > L.words.length && (
        <button type="button" className="text-button" onClick={() => setAll(true)}>
          Show all {root.w.length} words
        </button>
      )}
      {all && root.w.length > limit && (
        <button type="button" className="text-button" onClick={() => setAll(false)}>
          Show fewer
        </button>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------- word map
export function WordMap({ data, word }: { data: AppData; word: WordRec }) {
  const store = useProgress();
  const roman = store.settings.under !== 'hanja';
  const mapRef = useRef<HTMLDivElement>(null);
  useFitLabels(mapRef, [word.i, roman, store.getVersion()]);
  const hubs = hanjaOf(word).filter((h) => hanjaInfo(data, h) !== null);
  if (hubs.length === 0) return null;
  if (hubs.length === 1) {
    return data.roots.has(hubs[0]) ? (
      <RootMap key={hubs[0]} data={data} char={hubs[0]} limit={6} highlight={word.i} compact caption={false} />
    ) : null;
  }

  // the two most productive roots face each other; any others hang below the word
  const size = (h: string) => data.roots.get(h)?.w.length ?? 1;
  const [A, B] = [...hubs]
    .sort((x, y) => size(y) - size(x))
    .slice(0, 2)
    .sort((x, y) => hubs.indexOf(x) - hubs.indexOf(y));
  const extras = hubs.filter((h) => h !== A && h !== B);
  const listOf = (h: string) =>
    (data.roots.get(h)?.w ?? [word.i]).map((i) => data.words.get(i)).filter((w): w is WordRec => !!w);
  const has = (w: WordRec, h: string) => !!w.s?.some(([, x]) => x === h);
  const seen = (w: WordRec) => (store.get(wordCard(w.i)) ? 0 : 1);
  const pick = (ws: WordRec[], n: number) =>
    ws
      .map((w, i) => ({ w, i }))
      .sort((a, b) => seen(a.w) - seen(b.w) || a.w.l - b.w.l || a.i - b.i)
      .slice(0, n)
      .map((x) => x.w);
  const siblings = pick(listOf(A).filter((w) => w.i !== word.i && has(w, B)), 2);
  const shared = extras.length ? [...siblings, word] : [word, ...siblings];
  const onlyA = pick(listOf(A).filter((w) => w.i !== word.i && !has(w, B)), 4);
  const onlyB = pick(listOf(B).filter((w) => w.i !== word.i && !has(w, A)), 4);

  const WW = 118;
  const WH = 50;
  const HW = 140;
  const HH = 84;
  const MW = 220;
  const G1 = 14;
  const G2 = 20;
  const VG = 38;
  const EW = 124;
  const EH = 84;
  const xL = [0, WW + G1];
  const xM = xL[1] + WW + G2;
  const xR = [xM + MW + G2, xM + MW + G2 + WW + G1];
  const width = xR[1] + WW;
  const xB = width - HW;
  const hasTop = onlyA.length > 0 || onlyB.length > 0;
  const hasBottom = onlyA.length > 2 || onlyB.length > 2;
  const hubY = hasTop ? WH + VG : 0;
  const hubMid = hubY + HH / 2;
  const stackH = shared.length * WH + (shared.length - 1) * 10;
  const stackY = Math.max(0, hubMid - stackH / 2);
  const botY = hubY + HH + VG;
  const baseH = Math.max(hubY + HH, stackY + stackH, hasBottom ? botY + WH : 0);
  const exY = baseH + VG;
  const height = extras.length ? exY + EH : baseH;

  const side = (i: number, left: boolean): Box => ({ x: (left ? xL : xR)[i % 2], y: i < 2 ? 0 : botY, w: WW, h: WH });
  const sideLink = (b: Box, hubX: number) => {
    const hx = hubX + HW / 2;
    return b.y < hubY ? curveV(hx, hubY, b.x + WW / 2, b.y + WH) : curveV(hx, hubY + HH, b.x + WW / 2, b.y);
  };
  const stackBox = (i: number): Box => ({ x: xM, y: stackY + i * (WH + 10), w: MW, h: WH });
  const cur = stackBox(shared.indexOf(word));
  const exTotal = extras.length * EW + Math.max(0, extras.length - 1) * 16;
  const exBox = (i: number): Box => ({ x: xM + MW / 2 - exTotal / 2 + i * (EW + 16), y: exY, w: EW, h: EH });

  const paths: { d: string; cls: string }[] = [
    ...onlyA.map((_, i) => ({ d: sideLink(side(i, true), 0), cls: 'map-link-a' })),
    ...onlyB.map((_, i) => ({ d: sideLink(side(i, false), xB), cls: 'map-link-b' })),
    ...shared.flatMap((_, i) => {
      const y = stackBox(i).y + WH / 2;
      return [
        { d: curveH(HW, hubMid, xM, y), cls: 'map-link-a' },
        { d: curveH(xM + MW, y, xB, hubMid), cls: 'map-link-b' },
      ];
    }),
    ...extras.map((_, i) => {
      const b = exBox(i);
      return { d: curveV(cur.x + MW / 2, cur.y + WH, b.x + EW / 2, b.y), cls: 'map-link-c' };
    }),
  ];

  const wordNode = (w: WordRec, box: Box) => (
    <Node
      key={`${w.i}-${box.x}-${box.y}`}
      box={box}
      to={w.i === word.i ? undefined : `word/${w.i}`}
      className={`map-word${w.i === word.i ? ' is-current' : ''}`}
      title={wordTitle(w)}
    >
      <StatusMark status={statusOf(store.get(wordCard(w.i)))} />
      <WordText word={w} roman={roman && box.w >= 160} />
    </Node>
  );
  const hubNode = (h: string, box: Box, tone: 'a' | 'b' | 'x') => {
    const info = hanjaInfo(data, h)!;
    return (
      <Node
        key={`${tone}${h}`}
        box={box}
        to={info.isRoot ? `root/${h}` : undefined}
        className={`map-hub map-hub-${tone}${info.isRoot ? '' : ' map-single'}`}
        title={info.isRoot ? `Open the map for ${info.reading}` : `${info.reading} appears only in this word`}
      >
        <HubBody info={info} label={spelledAs([word], h, info.reading)} roman={roman} />
      </Node>
    );
  };

  const parents = hubs.map((h) => {
    const i = hanjaInfo(data, h)!;
    return `${spelledAs([word], h, i.reading)} (${i.gloss})`;
  });
  return (
    <figure className="map-figure">
      <figcaption className="map-caption">
        <b lang="ko">{word.w}</b> has {hubs.length} co-parent roots: {parents.join(' + ')}. Around them are other words each root
        builds.
      </figcaption>
      <div className="map-scroll">
        <div ref={mapRef} className="map" style={{ width, height }} role="group" aria-label={`Word map for ${word.w}`}>
          <svg className="map-lines" width={width} height={height} aria-hidden="true">
            {paths.map((p, i) => (
              <path key={i} d={p.d} className={`map-link ${p.cls}`} />
            ))}
          </svg>
          {hubNode(A, { x: 0, y: hubY, w: HW, h: HH }, 'a')}
          {hubNode(B, { x: xB, y: hubY, w: HW, h: HH }, 'b')}
          {onlyA.map((w, i) => wordNode(w, side(i, true)))}
          {onlyB.map((w, i) => wordNode(w, side(i, false)))}
          {shared.map((w, i) => wordNode(w, stackBox(i)))}
          {extras.map((h, i) => hubNode(h, exBox(i), 'x'))}
        </div>
      </div>
    </figure>
  );
}
