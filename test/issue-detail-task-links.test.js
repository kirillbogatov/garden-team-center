import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const resources = fs.readFileSync(new URL('../src/pages/resources.jsx', import.meta.url), 'utf8');
const tasks = fs.readFileSync(new URL('../src/pages/tasks.jsx', import.meta.url), 'utf8');

test('issue detail uses inline editing, overflow actions and no description section', () => {
  assert.match(resources, /InlineIssueField/);
  assert.match(resources, /Создать задачу/);
  assert.match(resources, /Удалить проблему\?/);
  assert.doesNotMatch(resources, /resource==='issues'&&<>\s*<Section title="Описание"/);
  assert.match(resources, /\['issues','processes'\]\.includes\(resource\)\?null:aside/);
});

test('task relations support issue links', () => {
  assert.match(tasks, /useResource\('issues'\)/);
  assert.match(tasks, /linkedIssueIds/);
  assert.match(tasks, /value="issue">Проблема/);
  assert.match(tasks, /issueIds:/);
  assert.match(tasks, /Удалить связь с проблемой/);
});
