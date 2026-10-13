import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tasks = fs.readFileSync(path.join(root, 'src/pages/tasks.jsx'), 'utf8');
const patterns = fs.readFileSync(path.join(root, 'src/patterns.css'), 'utf8');
const patternComponents = fs.readFileSync(path.join(root, 'src/components/patterns.jsx'), 'utf8');

test('task detail uses shared section headers and tabs', () => {
  assert.match(tasks, /<SectionHeader title="Описание" compact/);
  assert.match(tasks, /<SectionHeader title="Контекст" compact/);
  assert.match(tasks, /<SectionHeader title="Свойства" compact/);
  assert.match(tasks, /<Tabs[\s\S]*?ariaLabel="Разделы задачи"/);
  assert.match(patternComponents, /Number\(count\) > 0/);
});

test('task detail responsiveness has one authoritative breakpoint contract', () => {
  assert.match(patterns, /@media \(max-width: 1040px\)[\s\S]*?task-detail-workspace-grid[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(patterns, /task-properties-column[\s\S]*?order:\s*-1/);
  assert.match(patterns, /@media \(max-width: 640px\)[\s\S]*?task-properties-list[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(patterns, /@media \(min-width: 901px\) and \(max-width: 1540px\)/);
});
