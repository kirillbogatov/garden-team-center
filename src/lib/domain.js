export const TASK_STATUS_LABEL = {
  todo: 'Новая',
  in_progress: 'В работе',
  in_review: 'На ревью',
  paused: 'Приостановлено',
  blocked: 'Заблокировано',
  done: 'Готово',
};
export const TASK_STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'paused', 'blocked', 'done'];
export const TASK_STATUS_OPTIONS = TASK_STATUS_ORDER.map((value) => ({ value, label: TASK_STATUS_LABEL[value] }));
export const TASK_TYPE_LABEL = { standard: 'Проектная', development: 'Технологизация' };
export const TASK_PRIORITY_LABEL = { high: 'Важная', normal: 'Обычный', low: 'Низкий' };

export const PROJECT_STATUS_LABEL = { active: 'Активен', paused: 'На паузе', done: 'Завершён' };
export const ISSUE_STATUS_LABEL = { open: 'Новая', in_progress: 'В работе', paused: 'Отложена', resolved: 'Решена' };
export const ISSUE_IMPORTANCE_LABEL = { high: 'Важная', normal: 'Обычная' };
export const PROCESS_STATUS_LABEL = { ok: 'Работает', attention: 'Есть проблемы', broken: 'Сломан' };
export const GOAL_STATUS_LABEL = { active: 'В работе', done: 'Достигнута', paused: 'Отложена' };
export const AGREEMENT_STATUS_LABEL = { open: 'Открыта', done: 'Выполнена' };
export const PERSON_STATUS_LABEL = { active: 'Активен', on_leave: 'В отпуске', dismissed: 'Уволен', transferred: 'Переведён' };

export const MEETING_TYPE_LABEL = { '1:1': '1:1', pr: 'PR', other: 'Другое' };
export const MEETING_TYPE_ORDER = ['1:1', 'pr', 'other'];
export const MEETING_TYPE_OPTIONS = MEETING_TYPE_ORDER.map((value) => ({ value, label: MEETING_TYPE_LABEL[value] }));
export function normalizeMeetingType(value) { return value === '1:1' || String(value || '').toLowerCase() === 'pr' ? String(value).toLowerCase() === 'pr' ? 'pr' : '1:1' : 'other'; }

export function meetingDisplayTitle(meeting, people = []) {
  const raw = String(meeting?.title || '').trim();
  if (!['1:1', 'pr'].includes(meeting?.type)) return raw || 'Встреча';

  let title = raw
    .replace(/^performance\s+review\s*[:—–-]?\s*/iu, '')
    .replace(/^перформанс(?:\s+ревью)?\s*[:—–-]?\s*/iu, '')
    .replace(/^pr\s*[:—–-]?\s*/iu, '')
    .replace(/^1\s*:\s*1\s*(?:с|with)?\s*[:—–-]?\s*/iu, '')
    .trim();

  if (title) return title;
  const participant = (meeting?.participantIds || [])
    .map((id) => people.find((person) => person.id === id))
    .find(Boolean);
  return participant?.name || raw || 'Встреча';
}

export const LAB_STATUS_LABEL = { idea: 'Идея', in_progress: 'В работе', paused: 'Приостановлено', done: 'Готово' };
export const IDEA_STATUS_LABEL = { idea: 'Новая', in_progress: 'В работе', paused: 'Отложена', done: 'Готово', rejected: 'Отклонена' };
export const LAB_TYPE_LABEL = { pet: 'Пет-проект', tool: 'Инструмент', other: 'Другое' };
export const LAB_VISIBILITY_LABEL = { team: 'Команда', me: 'Только я' };

export const PROJECT_LOAD_OPTIONS = {
  full: { weight: 3, label: 'Фултайм' },
  half: { weight: 2, label: 'Парт-тайм' },
  support: { weight: 1, label: 'Саппорт' },
};

export function normalizeProjectMemberLoad(value) {
  const rawMode = value && typeof value === 'object' ? value.mode : value;
  return { mode: PROJECT_LOAD_OPTIONS[rawMode] ? rawMode : 'full' };
}

// Score = sum of per-project weights + 0.5 per active project beyond the first, a flat
// cost for context-switching that isn't tied to any one project.
export const LOAD_FRAGMENTATION_PENALTY = 0.5;
export const LOAD_LOW_MAX = 1.5;
export const LOAD_MEDIUM_MAX = 3;
export const LOAD_FULL_MAX = 5;

export function projectLoadLevel(score) {
  if (score > LOAD_FULL_MAX) return { label: 'Перегруз', tone: 'danger' };
  if (score >= LOAD_MEDIUM_MAX) return { label: 'Полная', tone: 'success' };
  if (score >= LOAD_LOW_MAX) return { label: 'Средняя', tone: 'warning' };
  if (score > 0) return { label: 'Низкая', tone: 'muted' };
  return { label: 'Нет загрузки', tone: 'muted' };
}

export function personProjectLoadSummary(personId, projects = []) {
  const active = projects.filter((project) => project.status === 'active' && (project.memberIds || []).includes(personId));
  const weights = active.map((project) => PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((project.memberLoads || {})[personId]).mode].weight);
  const score = weights.reduce((sum, weight) => sum + weight, 0) + (active.length > 1 ? LOAD_FRAGMENTATION_PENALTY * (active.length - 1) : 0);
  return { projects: active, score, level: projectLoadLevel(score) };
}

function addMonthsKey(dateKey, months) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

export function daysBetweenKeys(fromKey, toKey) {
  return Math.round((new Date(`${toKey}T00:00:00`) - new Date(`${fromKey}T00:00:00`)) / 86400000);
}

// Where a recurring 1:1 / PR stands: `off` (no cadence), `scheduled` (a meeting is booked from today on),
// `never` (cadence set, no meeting yet), `due` (next one expected by `due`), `overdue` (expected date has passed).
export function personMeetingCadence(meetings = [], type, everyMonths, todayKey = localTodayKey()) {
  const dates = meetings
    .filter((meeting) => String(meeting.type || '').toLocaleLowerCase('ru') === type && meeting.date)
    .map((meeting) => String(meeting.date).slice(0, 10))
    .sort();
  const last = [...dates].reverse().find((date) => date < todayKey) || null;
  const next = dates.find((date) => date >= todayKey) || null;
  const months = Number(everyMonths) || 0;
  if (!months) return { state: 'off', last, next, months };
  if (next) return { state: 'scheduled', last, next, months };
  if (!last) return { state: 'never', last, next, months };
  const due = addMonthsKey(last, months);
  if (due < todayKey) return { state: 'overdue', last, next, months, due, overdueDays: daysBetweenKeys(due, todayKey) };
  return { state: 'due', last, next, months, due };
}

export function isTeamlead(user) {
  return user?.role === 'teamlead' || user?.role === 'admin' || user?.roles?.includes?.('teamlead') || user?.roles?.includes?.('admin');
}

export function localTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function personUpcomingVacation(personId, vacations = [], todayKey = localTodayKey(), withinDays = 7) {
  const today = new Date(`${todayKey}T00:00:00`);
  return (vacations || []).find((item) => {
    if (item.personId !== personId || item.type !== 'vacation') return false;
    const startKey = String(item.startDate || '').slice(0, 10);
    if (!startKey || startKey <= todayKey) return false;
    const diffDays = Math.round((new Date(`${startKey}T00:00:00`) - today) / 86400000);
    return diffDays > 0 && diffDays <= withinDays;
  }) || null;
}

export function meetingHasOutcomeRecords(meeting) {
  const hasNotes = String(meeting?.notes || '').trim().length > 0;
  const hasDocuments = Array.isArray(meeting?.documentLinks)
    && meeting.documentLinks.some((doc) => String(doc?.title || doc?.url || '').trim());
  return hasNotes || hasDocuments;
}

export function meetingIsPast(meeting, todayKey = localTodayKey()) {
  const dateKey = String(meeting?.date || '').slice(0, 10);
  return Boolean(dateKey && dateKey < todayKey);
}

export function meetingIsMissed(meeting, todayKey = localTodayKey()) {
  return meetingIsPast(meeting, todayKey) && !meetingHasOutcomeRecords(meeting);
}

export function meetingLifecycle(meeting, todayKey = localTodayKey()) {
  if (!meetingIsPast(meeting, todayKey)) return 'upcoming';
  return meetingHasOutcomeRecords(meeting) ? 'completed' : 'missed';
}

export function compareMeetingsByLifecycle(a, b, todayKey = localTodayKey()) {
  const aDate = String(a?.date || '').slice(0, 10);
  const bDate = String(b?.date || '').slice(0, 10);
  const aFuture = aDate >= todayKey;
  const bFuture = bDate >= todayKey;
  if (aFuture !== bFuture) return aFuture ? -1 : 1;
  return aFuture ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
}
