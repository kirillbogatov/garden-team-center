'use strict';

const VERSION_WINDOW_MS = 10 * 60 * 1000;

const LABELS = {
  tasks: {
    title: 'название', description: 'описание', status: 'статус', taskType: 'тип', projectId: 'проект',
    assigneeIds: 'исполнитель', priority: 'важность', dueDate: 'срок', goalKey: 'цель', goalKeys: 'цели', issueIds: 'проблемы', jiraLinks: 'Jira', materials: 'материалы', archivedAt: 'архив',
  },
  meetings: {
    title: 'название', type: 'тип', date: 'дата', projectId: 'проект', participantIds: 'участников', notes: 'итоги встречи',
    documentLinks: 'документы', actionItems: 'действия по итогам', archivedAt: 'архив',
  },
  labs: {
    title: 'название', description: 'описание', authorId: 'автора', projectType: 'тип', visibility: 'видимость', status: 'статус', links: 'ссылки', archivedAt: 'архив',
  },
  projects: {
    name: 'название', description: 'описание', status: 'статус', memberIds: 'участников', memberLoads: 'загрузку', externalLinks: 'ссылки', archivedAt: 'архив',
  },
  processes: {
    title: 'название', status: 'статус', expectedBehavior: 'как должно работать', currentBehavior: 'как работает сейчас', fixOptions: 'варианты улучшения',
  },
};

const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'createdByUserId', 'taskKey', 'meetingKey', 'blueprintKey', 'ideaKey', 'issueKey', 'processKey', 'agreementKey', 'goalKey', 'noteKey', 'toolKey', 'projectKey', 'taskGroupId', 'taskGroupIndex']);

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
    goalKey: 'Изменена цель', goalKeys: 'Изменены цели', issueIds: 'Изменены проблемы', jiraLinks: 'Изменены связи Jira', materials: 'Изменены материалы', archivedAt: 'Изменён архивный статус',
    type: 'Изменён тип', date: 'Изменена дата', participantIds: 'Изменены участники', notes: 'Обновлены итоги встречи',
    documentLinks: 'Изменены документы', actionItems: 'Изменены действия по итогам', authorId: 'Изменён автор',
    projectType: 'Изменён тип', visibility: 'Изменена видимость', links: 'Изменены ссылки',
    expectedBehavior: 'Изменено описание того, как должно работать', currentBehavior: 'Изменено описание того, как работает сейчас', fixOptions: 'Изменены варианты улучшения',
  };
  return single[field] || `Изменено: ${labels[0]}`;
}

function creationSummary(entityType) {
  if (entityType === 'tasks') return 'Создана задача';
  if (entityType === 'meetings') return 'Создана встреча';
  if (entityType === 'labs') return 'Создан проект Мастерской';
  if (entityType === 'processes') return 'Создан процесс';
  if (entityType === 'projects') return 'Создан проект';
  return 'Создана версия';
}

function isImportantChange(entityType, before, after) {
  const fields = new Set(changedFields(entityType, before, after));
  if (entityType === 'tasks') return fields.has('status') || fields.has('archivedAt');
  if (entityType === 'labs') return fields.has('status') || fields.has('archivedAt');
  if (entityType === 'meetings') return fields.has('archivedAt');
  if (entityType === 'processes') return fields.has('status');
  if (entityType === 'projects') return fields.has('status') || fields.has('archivedAt');
  return false;
}

function recordCreate(db, entityType, item, authorUserId) {
  return db.versions.record(entityType, item.id, item, authorUserId, {
    summary: creationSummary(entityType),
    finalized: true,
  });
}

/** Records an update as a new version, batching consecutive autosaves of the
 * same field(s) into one open (non-finalized) version within VERSION_WINDOW_MS,
 * so a burst of small edits doesn't spam the history with one entry each.
 * A status/archive change ("important") always gets its own finalized version. */
function recordUpdate(db, entityType, before, after, authorUserId) {
  db.versions.ensureInitial(entityType, before.id, before, before.createdByUserId || null, {
    summary: creationSummary(entityType),
    finalized: true,
  });
  const latest = db.versions.latest(entityType, after.id);
  const important = isImportantChange(entityType, before, after);

  if (important) {
    if (latest && !latest.finalized) db.versions.finalizeLatest(entityType, after.id);
    return db.versions.record(entityType, after.id, after, authorUserId, {
      summary: versionSummary(entityType, before, after),
      finalized: true,
    });
  }

  const age = latest?.createdAt ? Date.now() - new Date(latest.createdAt).getTime() : Infinity;
  const canBatch = latest && latest.version > 1 && !latest.finalized && age >= 0 && age < VERSION_WINDOW_MS;
  if (canBatch) {
    const base = db.versions.get(entityType, after.id, latest.version - 1)?.data || before;
    return db.versions.updateLatest(entityType, after.id, after, authorUserId, versionSummary(entityType, base, after));
  }

  if (latest && !latest.finalized) db.versions.finalizeLatest(entityType, after.id);
  return db.versions.record(entityType, after.id, after, authorUserId, {
    summary: versionSummary(entityType, before, after),
    finalized: false,
  });
}

module.exports = { VERSION_WINDOW_MS, changedFields, versionSummary, creationSummary, isImportantChange, recordCreate, recordUpdate };
