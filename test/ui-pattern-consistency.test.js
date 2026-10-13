'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared Tabs is the only tab implementation on task, person and meetings pages', () => {
  const tasks = read('src/pages/tasks.jsx');
  const resources = read('src/pages/resources.jsx');
  const operations = read('src/pages/operations.jsx');
  const patterns = read('src/components/patterns.jsx');
  assert.match(patterns, /export function Tabs/);
  assert.match(tasks, /<Tabs[\s\S]*?ariaLabel="Разделы задачи"/);
  // "Развитие" dropped its own Tabs (1:1/PR folded into cadence items, Технологизация removed from
  // this section) when workload scoring switched to flat weights — only "Связи" still uses Tabs here.
  assert.match(resources, /<Tabs[\s\S]*?ariaLabel="Связи сотрудника"/);
  assert.match(operations, /<Tabs[\s\S]*?ariaLabel="Период встреч"/);
  for (const legacy of ['task-detail-tab"', 'person-development-tab"', 'person-relations-tab"']) {
    assert.ok(!(tasks + resources).includes(`className="${legacy}`));
  }
  assert.doesNotMatch(operations, /entity-tabs|entity-tab\b/);
});

test('legacy .entity-tabs/.entity-tab selectors are gone from styles.css', () => {
  const css = read('src/styles.css');
  assert.ok(!css.includes('.entity-tabs'));
  assert.ok(!css.includes('.entity-tab '));
  assert.ok(!css.includes('.entity-tab.'));
  assert.ok(!css.includes('.entity-tab:'));
});

test('shared SectionHeader is used for section titles instead of local heading classes', () => {
  const tasks = read('src/pages/tasks.jsx');
  const resources = read('src/pages/resources.jsx');
  const page = read('src/components/page.jsx');
  assert.match(page, /<SectionHeader title=\{title\}/);
  for (const title of ['Описание','Контекст','Свойства']) assert.ok(tasks.includes(`<SectionHeader title="${title}"`));
  for (const title of ['О сотруднике','Загрузка','Развитие','Связи']) assert.ok(resources.includes(`<SectionHeader title="${title}"`));
});

test('reusable patterns have one authoritative stylesheet and legacy tab selectors are gone', () => {
  const css = read('src/styles.css');
  const patterns = read('src/patterns.css');
  const main = read('src/main.jsx');
  assert.match(main, /import '\.\/patterns\.css'/);
  for (const selector of ['.ui-tabs','.ui-tab','.ui-section-header','.task-detail-workspace-grid']) assert.ok(patterns.includes(selector));
  for (const legacy of ['.task-detail-tabs','.task-detail-tab','.person-development-tabs','.person-development-tab','.person-relations-tabs','.person-relations-tab']) assert.ok(!css.includes(legacy), `${legacy} remains layered in styles.css`);
});

test('only Garden Light and Garden Dark are selectable appearance themes', () => {
  const appearance = read('src/lib/appearance.js');
  for (const theme of ['disk-light','noch']) assert.ok(appearance.includes(`value: '${theme}'`));
  for (const legacy of ['anuppuccin-latte','anuppuccin-mocha']) {
    assert.ok(!appearance.includes(`{ value: '${legacy}'`), `${legacy} should not be selectable`);
    assert.ok(appearance.includes(`'${legacy}':`), `${legacy} should keep a migration alias`);
  }
});
