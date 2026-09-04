'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registerSearchRoutes = require('../server/routes/search');
const demo = require('../server/demo-data');

function makeHandler() {
  const db = {};
  for (const [name, rows] of Object.entries(demo)) {
    db[name] = {
      all: () => rows,
      get: (id) => rows.find((row) => row.id === id),
    };
  }
  let handler = null;
  registerSearchRoutes({ get(path, fn) { if (path === '/api/search') handler = fn; } }, {
    db,
    visibleItems: (name) => demo[name] || [],
  });
  return (query) => {
    let payload;
    handler({ query: { q: query }, auth: { user: { personId: 'ppl_demo_michael' } } }, { json(value) { payload = value; } });
    return payload;
  };
}

const search = makeHandler();

test('natural-language search understands meetings without outcomes', () => {
  const result = search('встречи без итогов 1:1 Дуайта');
  assert.equal(result.command.group, 'meetings');
  assert.equal(result.command.person.name, 'Дуайт Шрут');
  assert.ok(result.command.modifiers.includes('without_outcomes'));
  assert.ok(result.groups.meetings.length > 0);
  assert.ok(result.groups.meetings.every((meeting) => String(meeting.type).toLowerCase() === '1:1'));
});

test('missed and overdue meetings are synonyms for meetings without outcomes', () => {
  const missed = search('пропущенные встречи');
  const overdue = search('просроченные встречи');
  assert.ok(missed.command.modifiers.includes('without_outcomes'));
  assert.ok(overdue.command.modifiers.includes('overdue'));
  assert.deepEqual(missed.groups.meetings.map((m) => m.id).sort(), overdue.groups.meetings.map((m) => m.id).sort());
});

test('meeting search combines project and person context', () => {
  const result = search('встречи без итогов Джима Филиал Скрэнтона');
  assert.equal(result.command.person.name, 'Джим Халперт');
  assert.match(result.command.project.name, /Филиал Скрэнтона/);
  assert.ok(result.groups.meetings.every((meeting) => meeting.projectId === result.command.project.id));
  assert.ok(result.groups.meetings.every((meeting) => meeting.participantIds.includes(result.command.person.id)));
});

test('natural-language task search understands importance, overdue state and people', () => {
  const important = search('важные задачи Майкла');
  assert.equal(important.command.group, 'tasks');
  assert.equal(important.command.person.name, 'Майкл Скотт');
  assert.ok(important.groups.tasks.every((task) => task.priority === 'high'));

  const overdue = search('просроченные задачи Дуайта');
  assert.equal(overdue.command.person.name, 'Дуайт Шрут');
  assert.ok(overdue.groups.tasks.every((task) => task.status !== 'done' && task.dueDate));
});

test('natural-language search covers processes and check-ins', () => {
  const processes = search('процессы с проблемами');
  assert.equal(processes.command.group, 'processes');
  assert.ok(processes.groups.processes.every((process) => ['attention', 'broken'].includes(process.status)));

  const checkins = search('check-in Майкла с блокерами');
  assert.equal(checkins.command.group, 'checkins');
  assert.equal(checkins.command.person.name, 'Майкл Скотт');
  assert.ok(checkins.groups.checkins.every((checkin) => String(checkin.blockers || '').trim()));
});

test('ideas are searched in The Labs rather than legacy journal ideas', () => {
  const result = search('идеи');
  assert.equal(result.command.group, 'labs');
  assert.ok(result.groups.labs.every((item) => item.entityType === 'idea'));
});
