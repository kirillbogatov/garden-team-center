'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyTaskAssigned, notifyProjectLoadChanges, notifyIssueCreated, notifyLabCreated, ensureCheckinReminder } = require('../server/notifications');

function mockDb({ users = [], preferences = {}, checkins = [], people = [] } = {}) {
  const created = [];
  return {
    created,
    auth: {
      users: { all: () => users },
      preferences: { get: (id) => preferences[id] || {} },
    },
    checkins: { all: () => checkins },
    people: { get: (id) => people.length ? (people.find((person) => person.id === id) || null) : { id, type: 'team' } },
    notifications: {
      create(userId, data) { created.push({ userId, ...data }); return data; },
    },
  };
}

test('teamlead task assignment notifies employees but not another teamlead', () => {
  const db = mockDb({ users: [
    { id: 'u1', personId: 'p1', active: true, roles: ['member'] },
    { id: 'u2', personId: 'p2', active: true, roles: ['teamlead', 'member'] },
  ] });
  notifyTaskAssigned(db, { id: 'lead', roles: ['teamlead'] }, { id: 't1', taskKey: 'ATOM-1', title: 'Сделать макет', assigneeIds: ['p1', 'p2'] });
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].userId, 'u1');
  assert.equal(db.created[0].eventType, 'task_assigned');
});

test('disabled notification preference suppresses the event', () => {
  const db = mockDb({ users: [{ id: 'u1', personId: 'p1', active: true, roles: ['member'] }], preferences: { u1: { notificationEvents: { task_assigned: false } } } });
  notifyTaskAssigned(db, { id: 'lead', roles: ['teamlead'] }, { id: 't1', title: 'Задача', assigneeIds: ['p1'] });
  assert.equal(db.created.length, 0);
});

test('project load change notifies only the affected employee', () => {
  const db = mockDb({ users: [
    { id: 'u1', personId: 'p1', active: true, roles: ['member'] },
    { id: 'u2', personId: 'p2', active: true, roles: ['member'] },
  ] });
  notifyProjectLoadChanges(db, { id: 'lead', roles: ['teamlead'] },
    { id: 'pr1', name: 'ATOM', memberLoads: { p1: 'part', p2: 'full' } },
    { id: 'pr1', name: 'ATOM', memberLoads: { p1: 'full', p2: 'full' }, updatedAt: '2026-09-04T10:00:00.000Z' });
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].userId, 'u1');
  assert.match(db.created[0].body, /Фултайм/);
});

test('Tuesday check-in reminder is created only for an unfilled teamlead check-in', () => {
  const db = mockDb();
  const tuesday = new Date(2026, 8, 8, 9, 0, 0);
  ensureCheckinReminder(db, { id: 'lead', personId: 'pLead', roles: ['teamlead'] }, tuesday);
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].eventType, 'checkin_reminder');

  const filledDb = mockDb({ checkins: [{ personId: 'pLead', weekStart: '2026-09-07', did: 'Готово', willDo: '', blockers: '' }] });
  ensureCheckinReminder(filledDb, { id: 'lead', personId: 'pLead', roles: ['teamlead'] }, tuesday);
  assert.equal(filledDb.created.length, 0);
});


test('employee problem notifies their teamlead', () => {
  const db = mockDb({
    users: [
      { id: 'member', personId: 'p1', active: true, roles: ['member'] },
      { id: 'lead', personId: 'leadPerson', active: true, roles: ['teamlead', 'member'] },
    ],
    people: [{ id: 'p1', type: 'team', teamLeadId: 'leadPerson' }],
  });
  notifyIssueCreated(db, db.auth.users.all()[0], { id: 'issue1', title: 'Не работает отчёт' });
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].userId, 'lead');
  assert.equal(db.created[0].eventType, 'issue_created');
});

test('employee idea and The Labs project use the same teamlead preference event', () => {
  const db = mockDb({
    users: [
      { id: 'member', personId: 'p1', active: true, roles: ['member'] },
      { id: 'lead', personId: 'leadPerson', active: true, roles: ['teamlead'] },
    ],
    people: [{ id: 'p1', type: 'team', teamLeadId: 'leadPerson' }],
  });
  const actor = db.auth.users.all()[0];
  notifyLabCreated(db, actor, { id: 'idea1', entityType: 'idea', title: 'Идея' });
  notifyLabCreated(db, actor, { id: 'lab1', labKey: 'LAB-0001', entityType: 'project', title: 'Проект' });
  assert.equal(db.created.length, 2);
  assert.ok(db.created.every((item) => item.eventType === 'lab_created'));
  assert.match(db.created[0].route, /tab=ideas/);
  assert.match(db.created[1].route, /LAB-0001/);
});

test('teamlead-only notification preference suppresses employee-created events', () => {
  const db = mockDb({
    users: [
      { id: 'member', personId: 'p1', active: true, roles: ['member'] },
      { id: 'lead', personId: 'leadPerson', active: true, roles: ['teamlead'] },
    ],
    preferences: { lead: { notificationEvents: { issue_created: false, lab_created: false } } },
    people: [{ id: 'p1', type: 'team', teamLeadId: 'leadPerson' }],
  });
  const actor = db.auth.users.all()[0];
  notifyIssueCreated(db, actor, { id: 'issue1', title: 'Проблема' });
  notifyLabCreated(db, actor, { id: 'idea1', entityType: 'idea', title: 'Идея' });
  assert.equal(db.created.length, 0);
});
