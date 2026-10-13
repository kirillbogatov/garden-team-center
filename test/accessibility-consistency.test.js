'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Input, Textarea and SelectTrigger share the same focus-ring opacity as Button', () => {
  const ui = read('src/components/ui.jsx');
  assert.doesNotMatch(ui, /ring-ring\/12/, 'a lingering ring-ring/12 was found — focus ring opacity should be unified to /20');
});

test('icon-only action buttons carry an aria-label', () => {
  const tasks = read('src/pages/tasks.jsx');
  const operations = read('src/pages/operations.jsx');
  assert.match(tasks, /aria-label="Действия"[\s\S]{0,80}MoreHorizontal|MoreHorizontal[\s\S]{0,80}aria-label="Действия"/);
  assert.match(operations, /aria-label="Предыдущий месяц"/);
  assert.match(operations, /aria-label="Следующий месяц"/);
});

test('async status indicators are announced via aria-live', () => {
  assert.match(read('src/components/search-palette.jsx'), /aria-live="polite"[\s\S]{0,40}Ищу|Ищу[\s\S]{0,120}aria-live="polite"/);
});
