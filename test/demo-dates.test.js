const test = require('node:test');
const assert = require('node:assert/strict');
const demo = require('../server/demo-data');
const { shiftDemoDates, demoShiftDays } = require('../server/domain/demo-dates');

test('demo dates are unchanged during the authored week', () => {
  assert.equal(demoShiftDays(new Date(2026, 9, 14)), 0);
  assert.equal(shiftDemoDates(demo, new Date(2026, 9, 14)), demo);
});

test('demo dates shift by whole weeks and keep weekdays and time suffixes', () => {
  const now = new Date(2027, 0, 20, 12);
  const days = demoShiftDays(now);
  assert.equal(days % 7, 0);
  const shifted = shiftDemoDates(demo, now);
  const task = demo.tasks.find((t) => t.dueDate);
  const moved = shifted.tasks.find((t) => t.id === task.id);
  assert.equal(new Date(`${moved.dueDate}T00:00:00Z`).getUTCDay(), new Date(`${task.dueDate}T00:00:00Z`).getUTCDay());
  assert.match(shifted.meetings[0].date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.equal(shifted.people[0].birthday, demo.people[0].birthday);
  assert.equal(new Date(`${shifted.checkins[0].weekStart}T00:00:00Z`).getUTCDay(), 1);
  assert.equal(demo.tasks.find((t) => t.id === task.id).dueDate, task.dueDate);
});
