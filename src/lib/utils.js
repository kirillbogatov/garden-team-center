import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) { return twMerge(clsx(inputs)); }

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '—';
}

export function formatDate(value, options = {}) {
  if (!value) return 'Без срока';
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...options }).format(d);
}

// Wall-clock date/time in the person's timezone; falls back to the browser's zone.
function zonedNow(zone, now = new Date()) {
  let parts;
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

function timeToMinutes(value, fallback) {
  const [h, m] = String(value || fallback).split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : timeToMinutes(fallback, fallback);
}

function zoneOffsetMinutes(zone, date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return (asUTC - date.getTime()) / 60000;
  } catch { return 0; }
}

// Converts an "HH:MM" wall-clock time from one IANA timezone to another (date-agnostic).
// dayShift is -1/0/1 when the converted time lands on the previous/next calendar day.
export function convertClockTime(time, fromZone, toZone, now = new Date()) {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const diff = zoneOffsetMinutes(toZone, now) - zoneOffsetMinutes(fromZone, now);
  let total = h * 60 + (Number.isFinite(m) ? m : 0) + diff;
  let dayShift = 0;
  while (total < 0) { total += 1440; dayShift -= 1; }
  while (total >= 1440) { total -= 1440; dayShift += 1; }
  return { time: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, dayShift };
}

export function teamAvailability(person, vacations = [], now = new Date()) {
  const local = zonedNow(person.timezone || 'Europe/Moscow', now);
  const today = local.dateKey;
  const absence = (vacations || []).find((item) => item.personId === person.id && item.startDate <= today && item.endDate >= today);
  if (absence) {
    const label = absence.type === 'sick' ? 'На больничном' : absence.type === 'dayoff' ? 'Отгул' : 'В отпуске';
    return { key: absence.type === 'sick' ? 'sick' : 'away', label: `${label} до ${formatDate(absence.endDate)}` };
  }
  if (person.status === 'on_leave') return { key: 'away', label: 'В отпуске' };
  if (person.status === 'dismissed') return { key: 'inactive', label: 'Уволен' };
  if (person.status === 'transferred') return { key: 'inactive', label: 'Переведён' };
  if (local.weekday === 'Sat' || local.weekday === 'Sun') return { key: 'off', label: 'Выходной' };
  const start = timeToMinutes(person.workStart, '09:00');
  const end = timeToMinutes(person.workEnd, '18:00');
  const working = start <= end ? local.minutes >= start && local.minutes < end : local.minutes >= start || local.minutes < end;
  if (!working) return { key: 'done', label: local.minutes < start && start <= end ? 'Рабочий день не начался' : 'Рабочий день закончен' };
  return { key: 'active', label: 'Работает' };
}

export function formatShortDate(value) {
  if (!value) return 'Без срока';
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
}

export function formatEventDate(value, { includeTime = false, short = true } = {}) {
  if (!value) return '';
  const source = String(value);
  const d = new Date(source.length === 10 ? `${source}T12:00:00` : source);
  if (Number.isNaN(d.getTime())) return source;

  const now = new Date();
  const start = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((start(d) - start(now)) / 86400000);
  const relative = diffDays === -1 ? 'Вчера' : diffDays === 0 ? 'Сегодня' : diffDays === 1 ? 'Завтра' : '';

  let datePart = relative;
  if (!datePart) {
    datePart = new Intl.DateTimeFormat('ru-RU', short
      ? { day: '2-digit', month: 'short' }
      : { day: 'numeric', month: 'long' }
    ).format(d).replace(/\.$/, '');
  }
  if (!includeTime) return datePart;

  const hasMeaningfulTime = /T\d{2}:\d{2}/.test(source) && !/T00:00(?::00)?(?:\.\d+)?Z?$/.test(source);
  if (!hasMeaningfulTime) return datePart;
  const timePart = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${datePart}, ${timePart}`;
}

export function isOverdue(date, status) {
  if (!date || status === 'done' || status === 'archived') return false;
  return date < new Date().toISOString().slice(0, 10);
}

export function titleOf(item = {}) {
  return item.title || item.name || item.text || item.processKey || item.id || 'Без названия';
}

export function norm(value) {
  return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
}

export function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
