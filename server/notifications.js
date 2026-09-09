'use strict';

const EVENT_TYPES = Object.freeze({
  TASK_ASSIGNED: 'task_assigned',
  PROJECT_LOAD_CHANGED: 'project_load_changed',
  CHECKIN_REMINDER: 'checkin_reminder',
  ISSUE_CREATED: 'issue_created',
  LAB_CREATED: 'lab_created',
});

const DEFAULT_NOTIFICATION_EVENTS = Object.freeze({
  [EVENT_TYPES.TASK_ASSIGNED]: true,
  [EVENT_TYPES.PROJECT_LOAD_CHANGED]: true,
  [EVENT_TYPES.CHECKIN_REMINDER]: true,
  [EVENT_TYPES.ISSUE_CREATED]: true,
  [EVENT_TYPES.LAB_CREATED]: true,
});

function normalizedRoles(user) {
  return Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role || 'member'];
}

function isEmployeeUser(user) {
  const roles = normalizedRoles(user);
  return roles.includes('member') && !roles.includes('teamlead') && !roles.includes('admin');
}

function isTeamleadUser(user) {
  return normalizedRoles(user).includes('teamlead');
}

// Every known event type defaults to enabled; only an explicit `false` in the
// user's saved preferences turns one off.
function notificationPreferences(db, userId) {
  const raw = db.auth.preferences.get(userId) || {};
  const source = raw.notificationEvents && typeof raw.notificationEvents === 'object' ? raw.notificationEvents : {};
  return Object.fromEntries(
    Object.keys(DEFAULT_NOTIFICATION_EVENTS).map((key) => [key, source[key] !== false]),
  );
}

function notificationEnabled(db, userId, eventType) {
  return notificationPreferences(db, userId)[eventType] !== false;
}

function userForPerson(db, personId) {
  if (!personId) return null;
  return db.auth.users.all().find((user) => user.active && user.personId === personId) || null;
}

function createNotification(db, userId, data) {
  if (!userId || !notificationEnabled(db, userId, data.eventType)) return null;
  return db.notifications.create(userId, data);
}

/** Resolves the active team-member recipient for `personId`, or null when the
 * notification should be skipped: not a team person, no active user account,
 * not an "employee"-role account, or the recipient is the actor themself. */
function activeTeamRecipient(db, personId, actor) {
  const person = db.people?.get ? db.people.get(personId) : { type: 'team' };
  if (!person || person.type !== 'team') return null;
  const recipient = userForPerson(db, personId);
  if (!recipient || !isEmployeeUser(recipient) || recipient.id === actor.id) return null;
  return recipient;
}

function notifyTaskAssigned(db, actor, task) {
  if (!isTeamleadUser(actor) || !task) return;
  const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  assigneeIds.forEach((personId) => {
    const recipient = activeTeamRecipient(db, personId, actor);
    if (!recipient) return;
    createNotification(db, recipient.id, {
      eventType: EVENT_TYPES.TASK_ASSIGNED,
      title: 'Новая задача',
      body: task.title || 'Тимлид поставил новую задачу',
      route: task.taskKey ? `/tasks/${encodeURIComponent(task.taskKey)}` : `/tasks/${encodeURIComponent(task.id)}`,
      dedupeKey: `task-assigned:${task.id}:${recipient.id}`,
    });
  });
}

function normalizeLoadValue(value) {
  if (value && typeof value === 'object') return String(value.mode || '');
  return String(value || '');
}

function loadLabel(value) {
  return ({ full: 'Фултайм', part: 'Парт-тайм', support: 'Саппорт' })[normalizeLoadValue(value)] || normalizeLoadValue(value) || 'Не указано';
}

function notifyProjectLoadChanges(db, actor, before, after) {
  if (!isTeamleadUser(actor) || !before || !after) return;
  const beforeLoads = before.memberLoads && typeof before.memberLoads === 'object' ? before.memberLoads : {};
  const afterLoads = after.memberLoads && typeof after.memberLoads === 'object' ? after.memberLoads : {};
  const personIds = new Set([...Object.keys(beforeLoads), ...Object.keys(afterLoads)]);
  personIds.forEach((personId) => {
    const oldValue = normalizeLoadValue(beforeLoads[personId]);
    const newValue = normalizeLoadValue(afterLoads[personId]);
    if (oldValue === newValue) return;
    const recipient = activeTeamRecipient(db, personId, actor);
    if (!recipient) return;
    createNotification(db, recipient.id, {
      eventType: EVENT_TYPES.PROJECT_LOAD_CHANGED,
      title: 'Изменилась загрузка на проекте',
      body: `${after.name || 'Проект'} · ${loadLabel(afterLoads[personId])}`,
      route: `/projects/${encodeURIComponent(after.slug || after.id)}`,
      dedupeKey: `project-load:${after.id}:${personId}:${after.updatedAt || Date.now()}`,
    });
  });
}

function teamleadForEmployee(db, actor) {
  if (!isEmployeeUser(actor) || !actor?.personId) return null;
  const person = db.people?.get ? db.people.get(actor.personId) : null;
  const leadPersonId = person?.teamLeadId;
  if (!leadPersonId || leadPersonId === actor.personId) return null;
  const recipient = userForPerson(db, leadPersonId);
  return recipient && isTeamleadUser(recipient) ? recipient : null;
}

function notifyIssueCreated(db, actor, issue) {
  if (!issue) return null;
  const recipient = teamleadForEmployee(db, actor);
  if (!recipient || recipient.id === actor.id) return null;
  return createNotification(db, recipient.id, {
    eventType: EVENT_TYPES.ISSUE_CREATED,
    title: 'Новая проблема от сотрудника',
    body: issue.title || issue.name || issue.description || 'Сотрудник добавил новую проблему',
    route: '/issues',
    dedupeKey: `issue-created:${issue.id}:${recipient.id}`,
  });
}

function notifyLabCreated(db, actor, lab) {
  if (!lab) return null;
  const recipient = teamleadForEmployee(db, actor);
  if (!recipient || recipient.id === actor.id) return null;
  const isIdea = lab.entityType === 'idea';
  return createNotification(db, recipient.id, {
    eventType: EVENT_TYPES.LAB_CREATED,
    title: isIdea ? 'Новая идея The Labs' : 'Новый проект The Labs',
    body: lab.title || lab.description || (isIdea ? 'Сотрудник добавил новую идею' : 'Сотрудник создал новый проект The Labs'),
    route: isIdea ? '/labs?tab=ideas' : `/labs/${encodeURIComponent(lab.labKey || lab.id)}`,
    dedupeKey: `lab-created:${lab.id}:${recipient.id}`,
  });
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mondayKey(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return localDateKey(d);
}

function ensureCheckinReminder(db, user, now = new Date()) {
  if (!isTeamleadUser(user) || !user.personId || now.getDay() !== 2) return null;
  if (!notificationEnabled(db, user.id, EVENT_TYPES.CHECKIN_REMINDER)) return null;
  const weekStart = mondayKey(now);
  const checkin = db.checkins.all().find((item) => item.personId === user.personId && item.weekStart === weekStart);
  const filled = Boolean(checkin && [checkin.did, checkin.willDo, checkin.blockers].some((value) => String(value || '').trim()));
  if (filled) return null;
  return db.notifications.create(user.id, {
    eventType: EVENT_TYPES.CHECKIN_REMINDER,
    title: 'Пора провести чек-ап',
    body: 'В понедельник Check-in не был заполнен. Заполните его сегодня.',
    route: '/checkins',
    dedupeKey: `checkin-reminder:${weekStart}:${user.id}`,
  });
}

module.exports = {
  EVENT_TYPES,
  DEFAULT_NOTIFICATION_EVENTS,
  notificationPreferences,
  notificationEnabled,
  notifyTaskAssigned,
  notifyProjectLoadChanges,
  notifyIssueCreated,
  notifyLabCreated,
  ensureCheckinReminder,
};
