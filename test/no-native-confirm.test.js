'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('no destructive-delete action uses the native window.confirm', () => {
  const admin = read('src/pages/admin.jsx');
  const misc = read('src/pages/misc.jsx');
  const knowledgeTools = read('src/pages/knowledge-tools.jsx');
  const resources = read('src/pages/resources.jsx');
  const technology = read('src/pages/technology.jsx');
  // Every one of these files still has zero window.confirm-based delete flows.
  // knowledge-tools.jsx intentionally keeps ONE window.confirm — a "restore local
  // draft?" prompt on mount, which is not a destructive action and has different
  // (synchronous, pre-render) timing semantics that an AlertDialog can't replicate
  // without a real behavior change; only that one exception is allowed here.
  assert.doesNotMatch(admin, /window\.confirm\(/);
  assert.doesNotMatch(misc, /window\.confirm\(/);
  assert.doesNotMatch(resources, /window\.confirm\(/);
  assert.doesNotMatch(technology, /window\.confirm\(/);
  const knowledgeToolsConfirms = (knowledgeTools.match(/window\.confirm\(/g) || []).length;
  assert.equal(knowledgeToolsConfirms, 1, 'expected exactly the one non-destructive draft-restore window.confirm to remain in knowledge-tools.jsx');
  assert.match(knowledgeTools, /Найден локальный черновик\. Восстановить его\?/);
});

test('ui.jsx exports a themed AlertDialog built on the shared Dialog primitive', () => {
  const ui = read('src/components/ui.jsx');
  assert.match(ui, /export function AlertDialog\(/);
});

test('AlertDialog title strings null-guard the item they describe (item is null when creating)', () => {
  const admin = read('src/pages/admin.jsx');
  // UserDialog renders unconditionally with user=null when creating a new account,
  // so its AlertDialog's title (evaluated on every render, not just when open) must
  // not dereference user.displayName without optional chaining.
  assert.doesNotMatch(admin, /\$\{user\.displayName\}/);
  assert.match(admin, /\$\{user\?\.displayName\}/);
});

test('ResourceCrudDialog\'s AlertDialog title does not call titleOf(item) unguarded (item is null when creating)', () => {
  const resources = read('src/pages/resources.jsx');
  // ResourcePage always mounts a second ResourceCrudDialog instance with item={null}
  // for the "create" garden, so the dialog's <AlertDialog> title (evaluated on every
  // render, not just when open) must not call titleOf(null) — titleOf's own default
  // parameter only covers item === undefined, not an explicit null.
  assert.doesNotMatch(resources, /title=\{`Удалить «\$\{titleOf\(item\)\}»\?`\}/);
});
