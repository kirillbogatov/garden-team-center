'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared PeopleField component exists and implements search + team bulk-add', () => {
  const field = read('src/components/people-field.jsx');
  assert.match(field, /export function PeopleField/);
  assert.match(field, /'Команда'/);
  assert.match(field, /type === 'team'/);
  assert.match(field, /Никого не найдено/);
  assert.doesNotMatch(field, /cmdk|downshift|react-select/);
  assert.match(field, /event\.preventDefault\(\);\s*\n\s*if \(open && suggestions\[active\]\) choose\(suggestions\[active\]\);/);
});

test('operations.jsx uses the shared PeopleField for meeting participants and narrows the Date column', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.match(operations, /<PeopleField label="Участники"/);
  assert.match(operations, /sm:grid-cols-\[1fr_140px\]/);
  assert.doesNotMatch(operations, /togglePerson/);
});

test('technology.jsx uses the shared PeopleField and drops the local PeopleSelector', () => {
  const technology = read('src/pages/technology.jsx');
  assert.match(technology, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.doesNotMatch(technology, /function PeopleSelector/);
  assert.match(technology, /<PeopleField label="Драйвер \/ гость"/);
  assert.match(technology, /<PeopleField label="Участники"/);
});

test('assistant.jsx uses the shared PeopleField and drops the local PeopleChecklist', () => {
  const assistant = read('src/components/assistant.jsx');
  assert.match(assistant, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.doesNotMatch(assistant, /function PeopleChecklist/);
  assert.match(assistant, /<PeopleField label="Участники"/);
  assert.match(assistant, /<PeopleField label="Причастные люди"/);
});
