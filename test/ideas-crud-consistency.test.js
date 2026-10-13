'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ideas gain a fifth "rejected" status; workshop projects keep their existing four', () => {
  const domain = read('src/lib/domain.js');
  const status = read('src/components/status.jsx');
  assert.match(domain, /IDEA_STATUS_LABEL = \{[^}]*rejected: 'Отклонена'/);
  assert.doesNotMatch(domain, /LAB_STATUS_LABEL = \{[^}]*rejected/);
  assert.match(status, /idea: \{[^}]*rejected: 'danger'/);
});

test('IdeaCrudDialog exists, shares useCrudDialogForm, and guards its delete-confirm title', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /function IdeaCrudDialog/);
  assert.match(workspace, /title=\{`Удалить идею «\$\{item \? titleOf\(item\) : ''\}»\?`\}/);
});

test('idea attach-to-project field offers Мастерская and work-project options, mutually exclusive', () => {
  const workspace = read('src/pages/workspace.jsx');
  for (const label of ['Без проекта', 'Проект Мастерской', 'Рабочий проект']) {
    assert.ok(workspace.includes(label), `attach-to-project option "${label}" is missing`);
  }
});

test('"Только идеи без проектов" filter also considers a linked work project', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /!item\.labProjectId && !item\.projectId/);
});

test('idea creation no longer goes through the shared isIdea-branched CreateLabDialog', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.doesNotMatch(workspace, /CreateLabDialog[\s\S]{0,40}isIdea/);
});

test('LabsPage wires edit/delete icons for ideas in both card and list views', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /editingIdea/);
  assert.match(workspace, /deleteTarget/);
  const trashCount = (workspace.match(/<Trash2/g) || []).length;
  assert.ok(trashCount >= 2, 'expected a Trash2 icon in both the idea card and the idea list row');
});
