'use strict';

// Демо-данные написаны «вокруг» недели, которая начинается в этот понедельник.
// При каждом входе в демо сдвигаем даты на целое число недель, чтобы эта неделя
// совпала с текущей: дедлайны не уходят в просрочку, дни недели не меняются.
const DEMO_ANCHOR_MONDAY = '2026-10-12';

// Поля, у которых дата привязана к «сегодня». birthday/hireDate не трогаем.
const SHIFTED_FIELDS = {
  goals: ['dueDate'],
  tasks: ['dueDate', 'completedAt'],
  meetings: ['date'],
  journal: ['createdAt', 'updatedAt'],
  agreements: ['date', 'dueDate'],
  vacations: ['startDate', 'endDate'],
  checkins: ['weekStart'],
  technologyEvents: ['plannedDate'],
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(.*)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(year, month, day) {
  return Date.UTC(year, month, day) / DAY_MS;
}

function localMondayDay(now) {
  const dow = now.getDay() || 7;
  return utcDay(now.getFullYear(), now.getMonth(), now.getDate() - dow + 1);
}

function demoShiftDays(now = new Date()) {
  const [y, m, d] = DEMO_ANCHOR_MONDAY.split('-').map(Number);
  return localMondayDay(now) - utcDay(y, m - 1, d);
}

function shiftValue(value, days) {
  const match = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!match) return value;
  const shifted = new Date((utcDay(+match[1], +match[2] - 1, +match[3]) + days) * DAY_MS);
  const date = [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return date + match[4];
}

function shiftDemoDates(seed, now = new Date()) {
  const days = demoShiftDays(now);
  if (!days) return seed;
  const result = { ...seed };
  for (const [collection, fields] of Object.entries(SHIFTED_FIELDS)) {
    if (!Array.isArray(seed[collection])) continue;
    result[collection] = seed[collection].map((item) => {
      const next = { ...item };
      for (const field of fields) if (field in next) next[field] = shiftValue(next[field], days);
      return next;
    });
  }
  return result;
}

module.exports = { DEMO_ANCHOR_MONDAY, demoShiftDays, shiftDemoDates };
