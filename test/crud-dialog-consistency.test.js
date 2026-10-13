'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('useCrudDialogForm hook exists with the expected exports', () => {
  const hook = read('src/hooks/use-crud-dialog-form.js');
  assert.match(hook, /export function useCrudDialogForm/);
});

test('resource, task, technology, knowledge, workspace, journal and admin CRUD dialogs share useCrudDialogForm', () => {
  const files = ['src/pages/resources.jsx', 'src/pages/tasks.jsx', 'src/pages/technology.jsx', 'src/pages/knowledge-tools.jsx', 'src/pages/misc.jsx', 'src/pages/workspace.jsx', 'src/pages/journal.jsx', 'src/pages/admin.jsx'];
  for (const file of files) {
    assert.match(read(file), /useCrudDialogForm/, `${file} does not use the shared useCrudDialogForm hook`);
  }
});
