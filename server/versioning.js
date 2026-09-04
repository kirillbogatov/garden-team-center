'use strict';

const VERSION_WINDOW_MS = 10 * 60 * 1000;

const LABELS = {
  tasks: {
    title: 'название', description: 'описание', status: 'статус', taskType: 'тип', projectId: 'проект',
    assigneeIds: 'исполнитель', priority: 'важность', dueDate: 'срок', goalId: 'цель', goalIds: 'цели', issueIds: 'проблемы', archivedAt: 'архив',
  },
  meetings: {
    title: 'название', type: 'тип', date: 'дата', projectId: 'проект', participantIds: 'участников', notes: 'итоги встречи',
    documentLinks: 'документы', actionItems: 'действия по итогам', archivedAt: 'архив',
  },
  labs: {
    title: 'название', description: 'описание', authorId: 'автора', projectType: 'тип', private: 'доступ', status: 'статус', links: 'ссылки', archivedAt: 'архив',
  },
};

const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'createdByUserId', 'taskKey', 'meetingKey', 'labKey', 'taskGroupId', 'taskGroupIndex']);

function sameValue(a, b) {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function changedFields(entityType, before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => !IGNORED.has(key) && !sameValue(before?.[key], after?.[key]));
}

function versionSummary(entityType, before, after) {
  const fields = changedFields(entityType, before, after);
  if (!fields.length) return 'Без заметных изменений';
  const labels = fields.map((field) => LABELS[entityType]?.[field] || field).slice(0, 4);
  const suffix = fields.length > 4 ? `, ещё ${fields.length - 4}` : '';
  if (fields.length > 1) return `Изменено: ${labels.join(', ')}${suffix}`;
  const field = fields[0];
  const single = {
    title: 'Изменено название', description: 'Обновлено описание', status: 'Изменён статус', taskType: 'Изменён тип',
    projectId: 'Изменён проект', assigneeIds: 'Изменён исполнитель', priority: 'Изменена важность', dueDate: 'Изменён срок',
    goalId: 'Изменена цель', goalIds: 'Изменены цели', issueIds: 'Изменены проблемы', archivedAt: 'Изменён архивный статус',
    type: 'Изменён тип', date: 'Изменена дата', participantIds: 'Изменены участники', notes: 'Обновлены итоги встречи',
    documentLinks: 'Изменены документы', actionItems: 'Изменены действия по итогам', authorId: 'Изменён автор',
    projectType: 'Изменён тип', private: 'Изменён доступ', links: 'Изменены ссылки',
  };
  return single[field] || `Изменено: ${labels[0]}`;
}

function creationSummary(entityType) {
  if (entityType === 'tasks') return 'Создана задача';
  if (entityType === 'meetings') return 'Создана встреча';
  if (entityType === 'labs') return 'Создан проект The Labs';
  return 'Создана версия';
}

function isImportantChange(entityType, before, after) {
  const fields = new Set(changedFields(entityType, before, after));
  if (entityType === 'tasks') return fields.has('status') || fields.has('archivedAt');
  if (entityType === 'labs') return fields.has('status') || fields.has('archivedAt');
  if (entityType === 'meetings') return fields.has('archivedAt');
  return false;
}

function recordCreate(db, entityType, item, authorUserId) {
  return db.versions.record(entityType, item.id, item, authorUserId, { summary: creationSummary(entityType), finalized: true });
}

function recordUpdate(db, entityType, before, after, authorUserId) {
  db.versions.ensureInitial(entityType, before.id, before, before.createdByUserId || null, { summary: creationSummary(entityType), finalized: true });
  let latest = db.versions.latest(entityType, after.id);
  const important = isImportantChange(entityType, before, after);

  if (important) {
    if (latest && !latest.finalized) db.versions.finalizeLatest(entityType, after.id);
    return db.versions.record(entityType, after.id, after, authorUserId, { summary: versionSummary(entityType, before, after), finalized: true });
  }

  const age = latest?.createdAt ? Date.now() - new Date(latest.createdAt).getTime() : Infinity;
  const canBatch = latest && latest.version > 1 && !latest.finalized && age >= 0 && age < VERSION_WINDOW_MS;
  if (canBatch) {
    const base = db.versions.get(entityType, after.id, latest.version - 1)?.data || before;
    return db.versions.updateLatest(entityType, after.id, after, authorUserId, versionSummary(entityType, base, after));
  }

  if (latest && !latest.finalized) db.versions.finalizeLatest(entityType, after.id);
  return db.versions.record(entityType, after.id, after, authorUserId, { summary: versionSummary(entityType, before, after), finalized: false });
}

module.exports = { VERSION_WINDOW_MS, changedFields, versionSummary, creationSummary, isImportantChange, recordCreate, recordUpdate };
