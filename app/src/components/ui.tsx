import { useEffect, useState, type ReactNode } from 'react';
import type { AppData, RootRec, WordRec } from '../lib/data';
import { rootGloss } from '../lib/data';
import type { Status } from '../lib/srs';
import { anchorWord, sameSound } from '../lib/data';
import { isSyllable } from '../lib/hangul';
import { store, useProgress } from '../lib/store';
import { speak, ttsSupported } from '../lib/tts';

// ---------------------------------------------------------------- routing
export function useRoute(): string[] {
  const read = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export const go = (path: string) => {
  location.hash = `#/${path}`;
};

export function A({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a href={`#/${to}`} className={className}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------- cells
type Size = 'xl' | 'lg' | 'md' | 'sm';

/**
 * A word in manuscript cells. Above each syllable: its romanization and/or hanja,
 * following the "Under Korean words" setting. `hanja` says whether hanja may be shown here.
 */
export function Cells({ word, size = 'md', hanja = false, gloss, data, roman = true }: {
  word: WordRec;
  size?: Size;
  hanja?: boolean;
  gloss?: boolean;
  data?: AppData;
  roman?: boolean;
}) {
  const { settings } = useProgress();
  const showRoman = roman && settings.under !== 'hanja' && !!word.rr;
  const showHanja = hanja && settings.under !== 'roman';
  const segs: [string, string | null][] = word.s ?? Array.from(word.w).map((c) => [c, null]);
  const verbEnding = !word.s && word.w.endsWith('다') && word.p.some((p) => p === '동사' || p === '형용사');
  let k = 0;
  return (
    <span className={`cells cells-${size}`} lang="ko" aria-label={word.w}>
      {segs.map(([syl, h], i) => {
        const rr = isSyllable(syl) ? word.rr?.[k++] : undefined;
        const meaning = h && data ? (data.roots.get(h) ? rootGloss(data.roots.get(h)!) : data.singles.get(h)?.g ?? '') : '';
        const isEnding = verbEnding && i === segs.length - 1;
        const cls = ['cell', h ? 'cell-sino' : word.s ? 'cell-native' : '', isEnding ? 'cell-ending' : '', syl === '-' ? 'cell-dash' : '']
          .filter(Boolean)
          .join(' ');
        const top = (showHanja && h) || (showRoman && rr);
        return (
          <span className={cls} key={i}>
            {top && (
              <span className="cell-top" aria-hidden="true">
                {showHanja && h && <span className="cell-hanja">{h}</span>}
                {showRoman && rr && <span className="cell-rr">{rr}</span>}
              </span>
            )}
            <span className="cell-syl">{syl}</span>
            {gloss && hanja && h && (
              <span className="cell-gloss" aria-hidden="true">
                {meaning.split(',')[0]}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Hangul first: the reading fills the square; romanization and/or hanja sit underneath. */
export function RootGlyph({ root, size = 'lg', caption = true }: { root: RootRec; size?: 'lg' | 'sm'; caption?: boolean }) {
  const { settings } = useProgress();
  const roman = settings.under !== 'hanja' && !!root.rr;
  const hanja = settings.under !== 'roman';
  const alt = root.rd.slice(1).map((r, i) => (roman ? `${r} (${root.rr![i + 1]})` : r));
  return (
    <span className={`glyph glyph-${size}`}>
      <span className="glyph-box" lang="ko">
        <span className="glyph-char">{root.rd[0]}</span>
      </span>
      {caption && (
        <span className="glyph-hanja" lang="ko">
          {hanja && <span className="glyph-han">{root.c}</span>}
          {roman && <span className="glyph-rr">{root.rr![0]}</span>}
          {size === 'lg' && alt.length > 0 && <span className="glyph-alt">also read {alt.join(', ')}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Roots that sound the same. Without hanja on screen, 대 (big) and 대 (era) look identical,
 * so each root page and root card names the others by a word you can recognise.
 */
export function SameSound({ data, root, limit = 6 }: { data: AppData; root: RootRec; limit?: number }) {
  const { settings } = useProgress();
  const others = sameSound(data, root);
  if (!others.length) return null;
  const shown = others.slice(0, limit);
  return (
    <div className="same-sound">
      <p className="same-sound-label">
        Same sound, different root: {root.rd[0]} is also the reading of {others.length}{' '}
        {others.length === 1 ? 'other root' : 'other roots'} on your path.
      </p>
      <ul className="same-sound-list">
        {shown.map((r) => {
          const reading = r.rd.find((rd) => root.rd.includes(rd)) ?? r.rd[0];
          const rr = r.rr?.[r.rd.indexOf(reading)];
          const w = anchorWord(data, r, reading);
          return (
            <li key={r.c}>
              <A to={`root/${r.c}`} className="same-sound-item">
                <span className="same-sound-rd" lang="ko">
                  {reading}
                </span>
                {settings.under !== 'roman' && (
                  <span className="same-sound-han" lang="ko">
                    {r.c}
                  </span>
                )}
                {settings.under !== 'hanja' && rr && <span className="same-sound-rr">{rr}</span>}
                <span className="same-sound-gloss">{rootGloss(r)}</span>
                {w && (
                  <span className="same-sound-word">
                    as in <span lang="ko">{w.w}</span>
                  </span>
                )}
              </A>
            </li>
          );
        })}
      </ul>
      {others.length > shown.length && <p className="same-sound-more">and {others.length - shown.length} more</p>}
    </div>
  );
}

export function RootChip({ root, status }: { root: RootRec; status?: Status }) {
  return (
    <A to={`root/${root.c}`} className={`root-chip status-${status ?? 'new'}`}>
      <span className="root-chip-reading" lang="ko">
        {root.rd[0]}
      </span>
      <span className="root-chip-char" lang="ko">
        {root.c}
      </span>
      <span className="root-chip-gloss">{rootGloss(root).split(',')[0]}</span>
    </A>
  );
}

const STATUS_TEXT: Record<Status, string> = { new: 'Not studied', learning: 'Learning', known: 'Known' };

export function StatusMark({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`} title={STATUS_TEXT[status]}>
      <span className="status-dot" aria-hidden="true" />
      <span className="sr-only">{STATUS_TEXT[status]}</span>
    </span>
  );
}

export function StatusText({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_TEXT[status]}
    </span>
  );
}

export function SpeakButton({ text, label = 'Play pronunciation' }: { text: string; label?: string }) {
  if (!ttsSupported()) return null;
  return (
    <button
      type="button"
      className="speak"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, store.settings.voice);
      }}
      aria-label={label}
      title={`${label} (S)`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'seal' | 'celadon' }) {
  return <span className={`tag ${tone ? `tag-${tone}` : ''}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
