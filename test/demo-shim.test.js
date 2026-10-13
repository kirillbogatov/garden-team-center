'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Демо-бэкенд: настоящий серверный код Garden, собранный esbuild-ом для браузера
// (node:sqlite → sql.js, express → мини-роутер). Тест собирает бандл во временную
// папку и проходит по тем же эндпоинтам, что использует клиент.
const root = path.join(__dirname, '..');

let app;
let cookie = '';

async function call(method, url, body) {
  const result = await app.request({ method, url, headers: { cookie }, body });
  const setCookie = result.headers['set-cookie'];
  if (setCookie) {
    const match = /^([^=]+)=([^;]*)/.exec(setCookie);
    if (match) cookie = match[2] ? `${match[1]}=${match[2]}` : '';
  }
  let json = null;
  try { json = JSON.parse(result.body); } catch { /* пустое тело */ }
  return { status: result.status, json };
}

test.before(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-demo-test-'));
  const bundle = path.join(outDir, 'server-bundle.mjs');
  const { buildDemoServer } = await import(pathToFileURL(path.join(root, 'scripts/build-demo-server.mjs')).href);
  await buildDemoServer({ outfile: bundle, logLevel: 'silent' });

  const initSqlJs = require('sql.js');
  globalThis.__GARDEN_SQL__ = await initSqlJs();
  globalThis.__GARDEN_SAVED_DB__ = null;
  ({ app } = await import(pathToFileURL(bundle).href));
});

test('API requires a session until the demo workspace is opened', async () => {
  assert.equal((await call('GET', '/api/people')).status, 401);
  const demo = await call('POST', '/api/auth/demo', {});
  assert.equal(demo.status, 200);
  assert.equal(demo.json.user.demo, true);
  assert.ok(cookie, 'session cookie must be captured from Set-Cookie');
  assert.equal((await call('GET', '/api/auth/me')).status, 200);
});

test('demo data is served by the real routes', async () => {
  for (const resource of ['people', 'projects', 'tasks', 'issues', 'meetings', 'journal', 'goals', 'kbDocs']) {
    const res = await call('GET', `/api/${resource}`);
    assert.equal(res.status, 200, resource);
    assert.ok(Array.isArray(res.json) && res.json.length > 0, `${resource} must not be empty`);
  }
  assert.ok((await call('GET', '/api/search?q=Dwight')).json, 'search works');
  assert.equal((await call('GET', '/api/calendar/month?year=2026&month=10')).status, 200);
});

test('create, update, version history and delete round-trip through SQLite', async () => {
  const created = await call('POST', '/api/tasks', { title: 'Демо-задача', status: 'todo' });
  assert.equal(created.status, 201);
  const id = created.json.id;

  const updated = await call('PUT', `/api/tasks/${id}`, { title: 'Переименована' });
  assert.equal(updated.json.title, 'Переименована');
  assert.equal((await call('GET', `/api/versions/tasks/${id}`)).status, 200);

  assert.equal((await call('DELETE', `/api/tasks/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/tasks/${id}`)).status, 404);
});

test('snapshot() keeps the database and prepared statements usable', async () => {
  const sqlite = globalThis.__GARDEN_SQLITE__;
  const before = (await call('GET', '/api/tasks')).json.length;
  const snapshot = sqlite.snapshot();
  assert.ok(snapshot.length > 0);
  assert.equal((await call('GET', '/api/tasks')).json.length, before);
  assert.equal((await call('POST', '/api/tasks', { title: 'После снимка', status: 'todo' })).status, 201);
  assert.equal((await call('GET', '/api/tasks')).json.length, before + 1);
});

test('a snapshot restores into a fresh database with the same data', async () => {
  const snapshot = globalThis.__GARDEN_SQLITE__.snapshot();
  const SQL = globalThis.__GARDEN_SQL__;
  const restored = new SQL.Database(snapshot);
  const rows = restored.exec("SELECT COUNT(*) FROM records WHERE workspace = 'demo' AND collection = 'tasks'");
  assert.ok(rows[0].values[0][0] > 0);
  restored.close();
});

test('unknown routes answer 404 JSON', async () => {
  const missing = await call('GET', '/api/nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'not_found');
});
