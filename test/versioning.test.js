'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recordCreate, recordUpdate, versionSummary, isImportantChange } = require('../server/versioning');

function fakeDb() {
  const rows = [];
  return {
    rows,
    versions: {
      latest() { return rows.at(-1) || null; },
      get(_type, _id, version) { return rows.find((row) => row.version === version) || null; },
      record(_type, _id, data, authorUserId, options = {}) {
        const row = { version: rows.length + 1, data: structuredClone(data), authorUserId, createdAt: options.createdAt || new Date().toISOString(), summary: options.summary || '', finalized: options.finalized !== false };
        rows.push(row); return row;
      },
      ensureInitial(type, id, data, author, options) { return this.latest(type, id) || this.record(type, id, data, author, options); },
      updateLatest(_type, _id, data, authorUserId, summary) { Object.assign(rows.at(-1), { data: structuredClone(data), authorUserId, summary, finalized: false }); return rows.at(-1); },
      finalizeLatest() { if (rows.length) rows.at(-1).finalized = true; return rows.at(-1) || null; },
    },
  };
}

test('regular autosaves are batched into one open version', () => {
  const db = fakeDb();
  const created = { id: 't1', title: 'A', status: 'todo', priority: 'normal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  recordCreate(db, 'tasks', created, 'u1');
  const first = { ...created, title: 'B', updatedAt: '2026-01-01T00:01:00.000Z' };
  recordUpdate(db, 'tasks', created, first, 'u1');
  const second = { ...first, priority: 'high', updatedAt: '2026-01-01T00:02:00.000Z' };
  recordUpdate(db, 'tasks', first, second, 'u1');
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[1].data.priority, 'high');
  assert.match(db.rows[1].summary, /название/);
  assert.match(db.rows[1].summary, /важность/);
  assert.equal(db.rows[1].finalized, false);
});

test('important status changes create a separate finalized version', () => {
  const db = fakeDb();
  const created = { id: 't1', title: 'A', status: 'todo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  recordCreate(db, 'tasks', created, 'u1');
  const textEdit = { ...created, title: 'B', updatedAt: '2026-01-01T00:01:00.000Z' };
  recordUpdate(db, 'tasks', created, textEdit, 'u1');
  const statusEdit = { ...textEdit, status: 'doing', updatedAt: '2026-01-01T00:02:00.000Z' };
  recordUpdate(db, 'tasks', textEdit, statusEdit, 'u1');
  assert.equal(db.rows.length, 3);
  assert.equal(db.rows[1].finalized, true);
  assert.equal(db.rows[2].finalized, true);
  assert.equal(db.rows[2].summary, 'Изменён статус');
});

test('version summaries are short and entity-aware', () => {
  assert.equal(versionSummary('meetings', { notes: '', documentLinks: [] }, { notes: 'Решили', documentLinks: [] }), 'Обновлены итоги встречи');
  assert.equal(isImportantChange('tasks', { status: 'todo' }, { status: 'doing' }), true);
});
