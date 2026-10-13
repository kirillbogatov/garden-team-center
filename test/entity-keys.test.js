'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextNumericKey, alphaSuffix } = require('../server/entity-keys');

test('public key generator uses numeric identifiers first', () => {
  const items = [{ key: 'NOTE-0001' }, { key: 'NOTE-0002' }];
  assert.equal(nextNumericKey(items, { prefix: 'NOTE', readKey: (item) => item.key }), 'NOTE-0003');
});

test('public key generator switches to latin-letter suffixes after numeric space is exhausted', () => {
  const items = [{ key: 'NOTE-9999' }];
  assert.equal(nextNumericKey(items, { prefix: 'NOTE', readKey: (item) => item.key }), 'NOTE-000A');
  items.push({ key: 'NOTE-000A' });
  assert.equal(nextNumericKey(items, { prefix: 'NOTE', readKey: (item) => item.key }), 'NOTE-000B');
  assert.equal(alphaSuffix(27), '00AA');
});

test('sequence cursor prevents reuse of a deleted latest public identifier', () => {
  const createEntityIdentifiers = require('../server/entity-identifiers');
  const state = { noteCursor: 'NOTE-0003' };
  const db = {
    journal: { all: () => [{ id: 'n1', noteKey: 'NOTE-0001' }, { id: 'n2', noteKey: 'NOTE-0002' }] },
    issues: { all: () => [] }, processes: { all: () => [] }, agreements: { all: () => [] }, goals: { all: () => [] }, tools: { all: () => [] }, meetings: { all: () => [] },
    tasks: { all: () => [], get: () => null }, projects: { all: () => [], get: () => null }, labs: { all: () => [], get: () => null }, people: { all: () => [], get: () => null }, kbDocs: { all: () => [], get: () => null },
    meta: {
      get(key, fallback) { return key === 'public-key-sequence:NOTE' ? state.noteCursor : fallback; },
      set(key, value) { if (key === 'public-key-sequence:NOTE') state.noteCursor = value; return value; },
    },
  };
  const identifiers = createEntityIdentifiers({ db, nextNumericKey });
  assert.equal(identifiers.nextCollectionKey('journal'), 'NOTE-0004');
  assert.equal(state.noteCursor, 'NOTE-0004');
});

test('alphabetic sequence never falls back to deleted numeric identifiers', () => {
  const items = [{ key: 'NOTE-9998' }, { key: 'NOTE-000A' }];
  assert.equal(nextNumericKey(items, { prefix: 'NOTE', readKey: (item) => item.key }), 'NOTE-000B');
});

test('latestPublicKey orders alphabetic continuation after 9999', () => {
  const { latestPublicKey } = require('../server/entity-keys');
  const items = [{ key: 'NOTE-9999' }, { key: 'NOTE-000A' }, { key: 'NOTE-000Z' }, { key: 'NOTE-00AA' }];
  assert.equal(latestPublicKey(items, { prefix: 'NOTE', readKey: (item) => item.key }), 'NOTE-00AA');
});

test('seed initialization stores sequence cursors without rewriting records', () => {
  const { seedPublicKeyCursors } = require('../server/seed');
  const values = new Map();
  const empty = { all: () => [] };
  const db = {
    issues: { all: () => [{ issueKey: 'ISSUE-0004' }] },
    meetings: { all: () => [{ meetingKey: 'MEET-0012' }] },
    journal: { all: () => [{ noteKey: 'NOTE-000A' }] },
    goals: empty, agreements: empty, tools: empty, processes: empty,
    labs: { all: () => [{ entityType: 'idea', ideaKey: 'IDEA-0002' }, { entityType: 'project', blueprintKey: 'BLUEPRINT-0007' }] },
    meta: { set(key, value) { values.set(key, value); } },
  };
  seedPublicKeyCursors(db);
  assert.equal(values.get('public-key-sequence:ISSUE'), 'ISSUE-0004');
  assert.equal(values.get('public-key-sequence:MEET'), 'MEET-0012');
  assert.equal(values.get('public-key-sequence:NOTE'), 'NOTE-000A');
  assert.equal(values.get('public-key-sequence:IDEA'), 'IDEA-0002');
  assert.equal(values.get('public-key-sequence:BLUEPRINT'), 'BLUEPRINT-0007');
});
