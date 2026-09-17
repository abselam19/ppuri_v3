import { useEffect, useState } from 'react';
import { A, useRoute } from './components/ui';
import { loadData, type AppData } from './lib/data';
import { store, useProgress } from './lib/store';
import { scheduleSync, startAutoSync, syncNow } from './lib/sync';
import { Placement } from './views/Placement';
import { RootPage, Roots } from './views/Roots';
import { Settings } from './views/Settings';
import { Study } from './views/Study';
import { Today } from './views/Today';
import { WordPage, Words } from './views/Words';

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  useProgress();

  useEffect(() => {
    Promise.all([loadData(), store.load()])
      .then(([d]) => {
        setData(d);
        void startAutoSync();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    const save = () => {
      if (document.visibilityState === 'hidden') {
        store.backupToServer();
        if (store.onLocalChange) scheduleSync(0);
      } else if (store.onLocalChange) {
        void syncNow();
      }
    };
    document.addEventListener('visibilitychange', save);
    return () => document.removeEventListener('visibilitychange', save);
  }, []);

  const [page, param] = route;
  const studying = page === 'study';

  return (
    <div className={`shell ${studying ? 'is-studying' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <A to="" className="brand">
          <span className="brand-mark" lang="ko">
            뿌리
          </span>
          <span className="brand-sub">Korean by roots</span>
        </A>
        {!studying && (
          <nav aria-label="Main">
            <A to="" className={!page ? 'is-here' : ''}>
              Today
            </A>
            <A to="roots" className={page === 'roots' || page === 'root' ? 'is-here' : ''}>
              Roots
            </A>
            <A to="words" className={page === 'words' || page === 'word' ? 'is-here' : ''}>
              Words
            </A>
            <A to="settings" className={page === 'settings' ? 'is-here' : ''}>
              Settings
            </A>
          </nav>
        )}
      </header>
      <main id="main">
        {error ? (
          <div className="empty">
            <p className="empty-title">뿌리 could not start</p>
            <p>{error}</p>
            <p>Start the app with serve.py and open the address it prints, rather than opening index.html directly.</p>
          </div>
        ) : !data ? (
          <p className="loading" aria-live="polite">
            Loading 5,698 words…
          </p>
        ) : page === 'study' ? (
          <Study key={route.join('/')} data={data} extra={Number(param) || 0} />
        ) : page === 'roots' ? (
          <Roots data={data} />
        ) : page === 'root' && param ? (
          <RootPage data={data} char={param} />
        ) : page === 'words' ? (
          <Words data={data} />
        ) : page === 'word' && param ? (
          <WordPage data={data} id={Number(param)} />
        ) : page === 'placement' ? (
          <Placement data={data} />
        ) : page === 'settings' ? (
          <Settings data={data} />
        ) : (
          <Today data={data} />
        )}
      </main>
    </div>
  );
}
