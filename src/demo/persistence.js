// Состояние демо (снимок SQLite + cookie сессии) лежит в IndexedDB посетителя.
// Любая ошибка хранилища (приватное окно, запрет сайта) не должна ломать демо:
// тогда оно просто стартует с исходных данных при каждом открытии.

const DB_NAME = 'garden-demo';
const STORE = 'kv';
const KEY = 'state';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadState() {
  try { return (await withStore('readonly', (store) => store.get(KEY))) || null; } catch { return null; }
}

export async function saveState(state) {
  try { await withStore('readwrite', (store) => store.put(state, KEY)); } catch { /* демо работает и без сохранения */ }
}

export async function clearState() {
  try { await withStore('readwrite', (store) => store.delete(KEY)); } catch { /* ничего не сохранено */ }
}
