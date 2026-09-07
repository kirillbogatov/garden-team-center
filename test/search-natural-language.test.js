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

test('@ references are semantic filters for people and projects, not only UI substitutions', () => {
  const byPerson = search('задачи @Дуайт Шрут');
  assert.equal(byPerson.command.group, 'tasks');
  assert.equal(byPerson.command.person.name, 'Дуайт Шрут');
  assert.ok(byPerson.groups.tasks.every((task) => (task.assigneeIds || []).includes(byPerson.command.person.id)));

  const project = demo.projects.find((item) => item.name && item.name.includes('Внедрение Sabre')) || demo.projects[0];
  const byProject = search(`задачи @${project.name}`);
  assert.equal(byProject.command.group, 'tasks');
  assert.equal(byProject.command.project.id, project.id);
  assert.ok(byProject.groups.tasks.every((task) => task.projectId === project.id));
});

test('status words work in singular and conversational forms', () => {
  const overdue = search('просроченная задача Дуайта');
  assert.equal(overdue.command.group, 'tasks');
  assert.ok(overdue.command.modifiers.includes('overdue'));

  const progress = search('задачи Дуайта в процессе');
  assert.ok(progress.command.modifiers.includes('in_progress'));
  assert.ok(progress.groups.tasks.every((task) => task.status === 'in_progress'));

  const missed = search('пропущенная встреча');
  assert.ok(missed.command.modifiers.includes('without_outcomes'));

  const deferredIssue = search('отложенная проблема');
  assert.equal(deferredIssue.command.group, 'issues');
  assert.ok(deferredIssue.command.modifiers.includes('paused'));
});

test('team tasks for the current month are parsed as entity + team context + period', () => {
  const result = search('задачи команды за этот месяц');
  assert.equal(result.command.group, 'tasks');
  assert.ok(result.command.modifiers.includes('current_month'));
  assert.ok(!result.command.person, 'контекст команды не должен превращаться в конкретного сотрудника');
  assert.ok(result.groups.tasks.length > 0);
  const month = new Date().toISOString().slice(0, 7);
  assert.ok(result.groups.tasks.every((task) => String(task.dueDate || '').slice(0, 7) === month));
});

test('an unscoped monthly task query never inherits a person filter', () => {
  const result = search('задачи за месяц');
  assert.equal(result.command.group, 'tasks');
  assert.ok(result.command.modifiers.includes('current_month'));
  assert.equal(result.command.person, null);
  assert.equal(result.command.project, null);
  assert.equal(result.command.selfRequested, false);
  const assignees = new Set(result.groups.tasks.flatMap((task) => task.assigneeIds || []));
  assert.ok(assignees.size > 1, 'месячный запрос без сотрудника должен возвращать командную выдачу, а не одного человека');
});


test('"мои записи журнала" returns the whole personal journal, not only notes mentioning myself', () => {
  const result = search('мои записи журнала');
  assert.equal(result.command.group, 'journal');
  assert.equal(result.command.selfRequested, true);
  assert.equal(result.command.person.id, 'ppl_demo_michael');
  assert.equal(result.groups.journal.length, demo.journal.filter((entry) => !entry.kind || entry.kind === 'note').length);
});

test('"мои заметки" uses the same personal-journal semantics', () => {
  const result = search('мои заметки');
  assert.equal(result.command.group, 'journal');
  assert.equal(result.command.selfRequested, true);
  assert.ok(result.groups.journal.length > 0);
  assert.ok(result.groups.journal.every((entry) => !entry.kind || entry.kind === 'note'));
});

test('development task wording filters by taskType instead of matching title text', () => {
  for (const query of [
    'задачи по развитию', 'задачи развития', 'задачи на развитие', 'development-задачи',
    'задачи по технологизации', 'задачи технологизации', 'задачи техна',
    'открой задачи по развитию', 'открой задачи по технологизации', 'открой задачи техна',
  ]) {
    const result = search(query);
    assert.equal(result.command.group, 'tasks', query);
    assert.equal(result.command.taskType, 'development', query);
    assert.equal(result.command.textRemainder, '', query);
    assert.ok(result.groups.tasks.every((task) => task.taskType === 'development'), query);
  }
});

test('all forms of «техна» are recognized as development-task wording', () => {
  for (const form of ['техна', 'техну', 'техной', 'техне', 'техны']) {
    for (const query of [`задачи ${form}`, `открой задачи по ${form}`]) {
      const result = search(query);
      assert.equal(result.command.group, 'tasks', query);
      assert.equal(result.command.taskType, 'development', query);
      assert.equal(result.command.textRemainder, '', query);
      assert.ok(result.groups.tasks.every((task) => task.taskType === 'development'), query);
    }
  }
});

test('weekday and adjacent-week phrases become exact calendar date ranges', () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = today.getUTCDay() || 7;
  const monday = new Date(today); monday.setUTCDate(monday.getUTCDate() - weekday + 1);
  const iso = (date) => date.toISOString().slice(0, 10);
  const shifted = (date, days) => { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy; };

  let fridayDelta = 5 - weekday;
  if (fridayDelta < 0) fridayDelta += 7;
  assert.deepEqual(search('задачи на пятницу').command.dateRange, {
    start: iso(shifted(today, fridayDelta)), end: iso(shifted(today, fridayDelta)),
  });
  assert.deepEqual(search('встречи на следующий понедельник').command.dateRange, {
    start: iso(shifted(monday, 7)), end: iso(shifted(monday, 7)),
  });
  assert.deepEqual(search('встречи на предыдущее воскресенье').command.dateRange, {
    start: iso(shifted(monday, -1)), end: iso(shifted(monday, -1)),
  });
  assert.deepEqual(search('задачи на следующую неделю').command.dateRange, {
    start: iso(shifted(monday, 7)), end: iso(shifted(monday, 13)),
  });
  assert.deepEqual(search('задачи на предыдущую неделю').command.dateRange, {
    start: iso(shifted(monday, -7)), end: iso(shifted(monday, -1)),
  });
});

test('calendar phrases filter task results by due date instead of remaining as title text', () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = today.getUTCDay() || 7;
  let fridayDelta = 5 - weekday;
  if (fridayDelta < 0) fridayDelta += 7;
  const friday = new Date(today); friday.setUTCDate(friday.getUTCDate() + fridayDelta);
  const fridayIso = friday.toISOString().slice(0, 10);
  const data = {
    ...demo,
    tasks: [
      ...demo.tasks,
      { id: 'tsk_search_friday_exact', title: 'Тестовая календарная задача', status: 'todo', taskType: 'standard', dueDate: fridayIso, assigneeIds: [], projectId: null },
      { id: 'tsk_search_other_day', title: 'Другая тестовая календарная задача', status: 'todo', taskType: 'standard', dueDate: '2099-01-01', assigneeIds: [], projectId: null },
    ],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('задачи на пятницу', {});
  assert.ok(result.groups.tasks.some((task) => task.id === 'tsk_search_friday_exact'));
  assert.ok(!result.groups.tasks.some((task) => task.id === 'tsk_search_other_day'));
  assert.equal(result.command.textRemainder, '');
});

test('project task wording filters the standard task type symmetrically', () => {
  const result = search('проектные задачи');
  assert.equal(result.command.group, 'tasks');
  assert.equal(result.command.taskType, 'standard');
  assert.ok(result.groups.tasks.length > 0);
  assert.ok(result.groups.tasks.every((task) => (task.taskType || 'standard') === 'standard'));
});

test('NLU exposes one structured query for content intent, entity and filters', () => {
  const db = {};
  for (const [name, rows] of Object.entries(demo)) {
    db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  }
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => demo[name] || [] });
  const parsed = service.parseQuery('покажи мои задачи по развитию за этот месяц', { personId: 'ppl_demo_michael' });
  assert.equal(parsed.kind, 'content');
  assert.equal(parsed.intent, 'show');
  assert.equal(parsed.entity, 'tasks');
  assert.equal(parsed.filters.selfRequested, true);
  assert.equal(parsed.filters.taskType, 'development');
  assert.ok(parsed.filters.modifiers.includes('current_month'));
});

test('runSearch publishes the same NLU structure it actually executes', () => {
  const result = search('покажи мои задачи по развитию');
  assert.equal(result.nlu.kind, 'content');
  assert.equal(result.nlu.intent, 'show');
  assert.equal(result.nlu.entity, result.command.group);
  assert.equal(result.nlu.filters.taskType, 'development');
  assert.equal(result.nlu.filters.selfRequested, true);
});

test('search finds an attached meeting link by its title and person context', () => {
  const data = {
    ...demo,
    people: [...demo.people, { id: 'ppl_search_maria', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active' }],
    meetings: [...demo.meetings, {
      id: 'mtg_search_maria', type: '1:1', title: '1:1 с Марией Зубаревой', date: '2026-09-04T10:00:00',
      participantIds: ['ppl_search_maria'], projectId: null, notes: '',
      documentLinks: [{ title: 'Саммари', url: 'https://example.test/summary' }],
    }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('саммари встречи с Машей', { personId: 'ppl_demo_michael' });

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.materialKind, 'summary');
  assert.equal(result.command.sourceType, 'meeting');
  assert.equal(result.command.person.id, 'ppl_search_maria');
  assert.equal(result.command.textRemainder, '');
  assert.equal(result.groups.meetings.length, 0, 'материал встречи не должен подменяться карточкой встречи');
  assert.deepEqual(result.groups.links.map((link) => [link.title, link.url, link.sourceId]), [
    ['Саммари', 'https://example.test/summary', 'mtg_search_maria'],
  ]);
});

test('plain text search includes embedded meeting and Labs links', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings, { id: 'mtg_link_search', title: 'Ретро', date: '2026-09-05T10:00:00', participantIds: [], documentLinks: [{ title: 'Решения квартала', url: 'https://example.test/decisions' }] }],
    labs: [...demo.labs, { id: 'lab_link_search', title: 'Эксперимент', entityType: 'project', links: [{ title: 'Техническая схема', url: 'https://example.test/schema' }] }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });

  assert.ok(service.runSearch('решения квартала', {}).groups.links.some((link) => link.sourceId === 'mtg_link_search'));
  assert.ok(service.runSearch('техническая схема', {}).groups.links.some((link) => link.sourceId === 'lab_link_search'));
});

test('material intent works without explicitly saying meeting when person context is present', () => {
  const data = {
    ...demo,
    people: [...demo.people, { id: 'ppl_search_nastya', name: 'Анастасия Власова', role: 'Аналитик', type: 'team', status: 'active' }],
    meetings: [...demo.meetings, {
      id: 'mtg_search_nastya', type: '1:1', title: '1:1 с Анастасией Власовой', date: '2026-09-03T10:00:00',
      participantIds: ['ppl_search_nastya'], projectId: null, notes: '',
      documentLinks: [{ title: 'Саммари', url: 'https://example.test/nastya-summary' }],
    }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('найди саммари с Настей', { personId: 'ppl_demo_michael' });

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.materialKind, 'summary');
  assert.equal(result.command.person.id, 'ppl_search_nastya');
  assert.deepEqual(result.groups.links.map((link) => link.sourceId), ['mtg_search_nastya']);
});

test('summary, resume and notes are semantic synonyms for attached material titles', () => {
  const data = {
    ...demo,
    people: [...demo.people, { id: 'ppl_search_nastya_syn', name: 'Анастасия Власова', role: 'Аналитик', type: 'team', status: 'active' }],
    meetings: [...demo.meetings, {
      id: 'mtg_search_nastya_syn', type: '1:1', title: '1:1 с Анастасией Власовой', date: '2026-09-03T10:00:00',
      participantIds: ['ppl_search_nastya_syn'], projectId: null, notes: '',
      documentLinks: [{ title: 'Саммари', url: 'https://example.test/nastya-summary-syn' }],
    }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  for (const query of ['резюме с Настей', 'конспект с Настей']) {
    const result = service.runSearch(query, {});
    assert.equal(result.command.materialKind, 'summary', query);
    assert.deepEqual(result.groups.links.map((link) => link.sourceId), ['mtg_search_nastya_syn'], query);
  }
});

test('explicit material intent wins over meeting source in «саммари со встречи»', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings, {
      id: 'mtg_summary_from_meeting', type: 'project', title: 'Планирование', date: '2026-09-02T10:00:00',
      participantIds: [], projectId: null, notes: '',
      documentLinks: [{ title: 'Саммари', url: 'https://example.test/from-meeting-summary' }],
    }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('саммари со встречи', {});

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.materialKind, 'summary');
  assert.equal(result.command.sourceType, 'meeting');
  assert.equal(result.command.textRemainder, '');
  assert.deepEqual(result.groups.links.map((link) => link.sourceId), ['mtg_summary_from_meeting']);
  assert.equal(result.groups.meetings.length, 0);
});

test('material search understands genitive plural meeting scope', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings,
      { id: 'mtg_summary_plural_1', title: 'Планирование', date: '2026-09-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/summary-1' }] },
      { id: 'mtg_summary_plural_2', title: 'Ретро', date: '2026-09-02T10:00:00', participantIds: [], documentLinks: [{ title: 'Конспект', url: 'https://example.test/summary-2' }] },
    ],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('саммари встреч', {});

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.materialKind, 'summary');
  assert.equal(result.command.sourceType, 'meeting');
  assert.equal(result.command.textRemainder, '');
  assert.ok(result.groups.links.some((link) => link.sourceId === 'mtg_summary_plural_1'));
  assert.ok(result.groups.links.some((link) => link.sourceId === 'mtg_summary_plural_2'));
});

test('documents from a meeting resolves to meeting attachments, not the global Documents section', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings, {
      id: 'mtg_search_docs', type: 'project', title: 'Планирование', date: '2026-09-03T10:00:00',
      participantIds: [], projectId: null, notes: '',
      documentLinks: [{ title: 'План', url: 'https://example.test/plan' }],
    }],
    documents: [...demo.documents, { id: 'doc_global_only', title: 'Глобальный документ', url: 'https://example.test/global' }],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('найди документы с встречи', {});

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.sourceType, 'meeting');
  assert.ok(result.groups.links.some((link) => link.sourceId === 'mtg_search_docs'));
  assert.equal(result.groups.documents.length, 0);
});

test('material type dictionary normalizes minutes, presentation, brief, spec and research synonyms', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings,
      { id: 'mtg_material_minutes', title: 'Ретро', date: '2026-09-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Протокол встречи', url: 'https://example.test/minutes' }] },
      { id: 'mtg_material_slides', title: 'Демо', date: '2026-09-02T10:00:00', participantIds: [], documentLinks: [{ title: 'Презентация продукта', url: 'https://example.test/slides' }] },
      { id: 'mtg_material_brief', title: 'Старт', date: '2026-09-03T10:00:00', participantIds: [], documentLinks: [{ title: 'Brief проекта', url: 'https://example.test/brief' }] },
      { id: 'mtg_material_spec', title: 'Проработка', date: '2026-09-04T10:00:00', participantIds: [], documentLinks: [{ title: 'Техническое задание', url: 'https://example.test/spec' }] },
      { id: 'mtg_material_research', title: 'Исследование', date: '2026-09-05T10:00:00', participantIds: [], documentLinks: [{ title: 'Research аудитории', url: 'https://example.test/research' }] },
    ],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });

  const cases = [
    ['minutes', 'minutes', 'mtg_material_minutes'],
    ['слайды', 'presentation', 'mtg_material_slides'],
    ['дек', 'presentation', 'mtg_material_slides'],
    ['бриф', 'brief', 'mtg_material_brief'],
    ['спека', 'spec', 'mtg_material_spec'],
    ['тз', 'spec', 'mtg_material_spec'],
    ['ресерч', 'research', 'mtg_material_research'],
    ['исследование', 'research', 'mtg_material_research'],
  ];

  for (const [query, kind, sourceId] of cases) {
    const result = service.runSearch(query, {});
    assert.equal(result.command.group, 'links', query);
    assert.equal(result.command.materialKind, kind, query);
    assert.ok(result.groups.links.some((link) => link.sourceId === sourceId), query);
  }
});

test('task search ranking follows the selected task priority strategy', () => {
  const tasks = [
    { id: 'rank_important', title: 'Важная задача', assigneeIds: ['ppl_demo_michael'], status: 'todo', priority: 'high' },
    { id: 'rank_overdue', title: 'Просроченная задача', assigneeIds: ['ppl_demo_michael'], status: 'todo', priority: 'normal', dueDate: '2024-01-01' },
  ];
  const data = { ...demo, tasks };
  const makeRankedSearch = (taskPriorityMode) => {
    const db = {};
    for (const [name, rows] of Object.entries(data)) {
      db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
    }
    db.auth = { preferences: { get: () => ({ taskPriorityMode }) } };
    let handler = null;
    registerSearchRoutes({ get(path, fn) { if (path === '/api/search') handler = fn; } }, {
      db,
      visibleItems: (name) => data[name] || [],
      normalizeUserSettings: (settings) => settings || {},
    });
    return (query) => {
      let payload;
      handler({ query: { q: query }, auth: { user: { id: 'u', personId: 'ppl_demo_michael' } } }, { json(value) { payload = value; } });
      return payload;
    };
  };

  const byImportance = makeRankedSearch('importance')('задачи');
  const byOverdue = makeRankedSearch('overdue')('задачи');
  assert.equal(byImportance.groups.tasks[0].id, 'rank_important');
  assert.equal(byOverdue.groups.tasks[0].id, 'rank_overdue');
});

test('text relevance stays ahead of task priority strategy in fallback search', () => {
  const tasks = [
    { id: 'rank_exact', title: 'Подготовить бюджет', assigneeIds: ['ppl_demo_michael'], status: 'todo', priority: 'normal' },
    { id: 'rank_urgent', title: 'Срочная финансовая задача', description: 'Нужно подготовить бюджет позднее', assigneeIds: ['ppl_demo_michael'], status: 'todo', priority: 'high', dueDate: '2024-01-01' },
  ];
  const data = { ...demo, tasks };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  let handler = null;
  registerSearchRoutes({ get(path, fn) { if (path === '/api/search') handler = fn; } }, { db, visibleItems: (name) => data[name] || [] });
  let payload;
  handler({ query: { q: 'подготовить бюджет' }, auth: { user: { id: 'u', personId: 'ppl_demo_michael' } } }, { json(value) { payload = value; } });
  assert.equal(payload.groups.tasks[0].id, 'rank_exact');
});

test('relative weekdays and weeks work without the preposition «на» and understand «прошедшая»', () => {
  const nextFriday = search('задачи следующая пятница').command.dateRange;
  const previousWednesday = search('задачи предыдущая среда').command.dateRange;
  const pastFriday = search('задачи прошедшая пятница').command.dateRange;
  const nextWeek = search('задачи следующая неделя').command.dateRange;
  const pastWeek = search('задачи прошедшая неделя').command.dateRange;

  assert.ok(nextFriday && nextFriday.start === nextFriday.end);
  assert.ok(previousWednesday && previousWednesday.start === previousWednesday.end);
  assert.ok(pastFriday && pastFriday.start === pastFriday.end);
  assert.ok(nextWeek && nextWeek.start < nextWeek.end);
  assert.ok(pastWeek && pastWeek.start < pastWeek.end);
  assert.equal(search('задачи следующая пятница').command.textRemainder, '');
  assert.equal(search('задачи прошедшая неделя').command.textRemainder, '');
});

test('material search understands «саммари с последних PR» as recent PR meeting attachments', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings,
      { id: 'mtg_pr_old_material', type: 'pr', title: 'PR old', date: '2026-08-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/pr-old' }] },
      { id: 'mtg_pr_new_material', type: 'pr', title: 'PR new', date: '2026-09-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/pr-new' }] },
      { id: 'mtg_other_summary_material', type: 'project', title: 'Project', date: '2026-09-02T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/project-summary' }] },
    ],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('саммари с последних PR', {});

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.materialKind, 'summary');
  assert.equal(result.command.sourceType, 'meeting');
  assert.equal(result.command.sourceMeetingType, 'pr');
  assert.equal(result.command.textRemainder, '');
  assert.deepEqual(result.groups.links.slice(0, 2).map((link) => link.sourceId), ['mtg_pr_new_material', 'mtg_pr_old_material']);
  assert.ok(result.groups.links.every((link) => link.sourceMeetingType === 'pr'));
});

test('«документы со встреч» includes explicit attachments and links written in meeting notes', () => {
  const data = {
    ...demo,
    meetings: [...demo.meetings,
      { id: 'mtg_docs_explicit_plural', type: 'project', title: 'Planning', date: '2026-09-03T10:00:00', participantIds: [], documentLinks: [{ title: 'План', url: 'https://example.test/plan-plural' }] },
      { id: 'mtg_docs_notes_plural', type: 'other', title: 'Workshop', date: '2026-09-04T10:00:00', participantIds: [], notes: 'Саммари: https://example.test/summary-in-notes' },
    ],
  };
  const db = {};
  for (const [name, rows] of Object.entries(data)) db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  const service = registerSearchRoutes({ get() {} }, { db, visibleItems: (name) => data[name] || [] });
  const result = service.runSearch('документы со встреч', {});

  assert.equal(result.command.group, 'links');
  assert.equal(result.command.sourceType, 'meeting');
  assert.equal(result.command.textRemainder, '');
  assert.ok(result.groups.links.some((link) => link.sourceId === 'mtg_docs_explicit_plural' && link.title === 'План'));
  assert.ok(result.groups.links.some((link) => link.sourceId === 'mtg_docs_notes_plural' && link.title === 'Саммари'));
});
