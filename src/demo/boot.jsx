import * as React from 'react';
import { createRoot } from 'react-dom/client';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { installApiBridge } from './api-bridge';
import { clearState, loadState, saveState } from './persistence';
import { DemoBadge } from './demo-badge';

const BUILD_ID = import.meta.env.VITE_DEMO_BUILD_ID || 'dev';
const SAVE_DELAY_MS = 400;

function showFatal(error) {
  console.error('[garden-demo]', error);
  const root = document.getElementById('root');
  if (root) root.textContent = 'Не удалось запустить демо. Обновите страницу или откройте её в другом браузере.';
}

export async function startDemo() {
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    globalThis.__GARDEN_SQL__ = SQL;

    // Сохранённое состояние от другой сборки не используем: схема или демо-данные могли измениться.
    const stored = await loadState();
    const restored = stored && stored.buildId === BUILD_ID && stored.db ? stored : null;
    globalThis.__GARDEN_SAVED_DB__ = restored ? restored.db : null;

    const { app } = await import('@demo-server');

    let resetting = false;
    let timer = null;
    let bridge;
    const flush = () => {
      timer = null;
      const sqlite = globalThis.__GARDEN_SQLITE__;
      if (resetting || !sqlite) return;
      saveState({ buildId: BUILD_ID, db: sqlite.snapshot(), cookie: bridge.cookie() });
    };
    const scheduleSave = () => {
      if (timer == null) timer = setTimeout(flush, SAVE_DELAY_MS);
    };
    bridge = installApiBridge({ app, initialCookie: restored?.cookie, onWrite: scheduleSave });
    window.addEventListener('pagehide', () => { if (timer != null) { clearTimeout(timer); flush(); } });

    const me = await window.fetch('/api/auth/me');
    if (!me.ok) {
      await window.fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    }

    const reset = async () => {
      resetting = true;
      if (timer != null) clearTimeout(timer);
      await clearState();
      window.location.reload();
    };
    const host = document.createElement('div');
    host.id = 'demo-badge-root';
    document.body.appendChild(host);
    createRoot(host).render(<DemoBadge onReset={reset} />);
  } catch (error) {
    showFatal(error);
    throw error;
  }
}
