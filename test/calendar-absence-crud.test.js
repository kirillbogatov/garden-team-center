'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('CalendarPage derives vacation permission levels and exposes an absence-create button', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /const me\s*=\s*useEndpoint\('\/api\/auth\/me'\)/);
  assert.match(operations, /canManageOwnAbsences\s*=\s*\['own_manage','all_own_manage','all_manage'\]\.includes\(vacAccess\)/);
  assert.match(operations, /canManageAllAbsences\s*=\s*vacAccess\s*===\s*'all_manage'/);
  assert.match(operations, /const canEditAbsence\s*=\s*\(item\)\s*=>/);
  assert.ok(operations.includes('Добавить отсутствие'), 'create-absence button label missing');
});

test('AbsenceDialog exists, uses useCrudDialogForm against the vacations resource, and offers all three absence types', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /function AbsenceDialog\(/);
  const dialogSource = operations.slice(operations.indexOf('const ABSENCE_TYPE_OPTIONS'));
  assert.match(dialogSource, /useCrudDialogForm\(\{\s*\n?\s*resource:\s*'vacations'/);
  for (const label of ['Отпуск', 'Больничный', 'Отгул']) {
    assert.ok(dialogSource.includes(`label: '${label}'`), `${label} option missing from AbsenceDialog`);
  }
  assert.match(dialogSource, /d\.endDate\s*<\s*d\.startDate/, 'missing end-before-start validation');
  assert.match(dialogSource, /<AlertDialog/, 'AbsenceDialog should confirm deletion via the shared AlertDialog');
});

test('absence bars open the edit dialog when the viewer can manage them, and fall back to the profile link otherwise', () => {
  const operations = read('src/pages/operations.jsx');
  const barItemsSource = operations.slice(operations.indexOf('const barItems=React.useMemo'), operations.indexOf('const weeks=[]'));
  assert.match(barItemsSource, /onClick:\s*canEditAbsence\(item\)\s*\?\s*\(\)\s*=>\s*openEditAbsence\(item\)\s*:\s*\(\)\s*=>\s*navigate/);
});
