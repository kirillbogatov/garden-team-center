'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registerSearchRoutes = require('../server/routes/search');
const createSmartSearch = require('../server/domain/smart-search');
const demo = require('../server/demo-data');

const ME = 'ppl_demo_michael';

function makeEngine(overrides = {}, options = {}) {
  const data = { ...demo, ...overrides };
  const db = {};
  for (const [name, rows] of Object.entries(data)) {
    db[name] = { all: () => rows, get: (id) => rows.find((row) => row.id === id) };
  }
  const visibleItems = (name) => data[name] || [];
  const search = registerSearchRoutes({ get() {} }, { db, visibleItems });
  return createSmartSearch({ db, visibleItems, search, isTeamlead: () => options.isTeamlead !== false });
}

function ask(engine, query, options = {}) {
  return engine.smartSearch(query, { id: 'usr_demo', personId: options.personId === null ? null : (options.personId || ME) }, options);
}

// --- Намерение «создать» -------------------------------------------------

test('smart search recognizes create commands and passes a clean title through', () => {
  const engine = makeEngine();
  const task = ask(engine, 'создай задачу собрать отчёт по продажам');
  assert.equal(task.kind, 'create');
  assert.equal(task.create.target, 'tasks');
  assert.equal(task.create.title, 'собрать отчёт по продажам');

  const meeting = ask(engine, 'добавь встречу ретро по кварталу');
  assert.equal(meeting.create.target, 'meetings');

  const issue = ask(engine, 'новая проблема принтер снова горит');
  assert.equal(issue.create.target, 'issues');
  assert.equal(issue.create.title, 'принтер снова горит');

  const note = ask(engine, 'запиши в журнал обсудили сроки с Дуайтом');
  assert.equal(note.create.target, 'note');

  const idea = ask(engine, 'создай идею: клуб продаж по пятницам');
  assert.equal(idea.create.target, 'idea');
  assert.equal(idea.create.title, 'клуб продаж по пятницам');
});

test('a search query that merely mentions creation-like words is not treated as a command', () => {
  const engine = makeEngine();
  const result = ask(engine, 'задачи Дуайта');
  assert.equal(result.kind, 'search');
  assert.equal(result.search.command.group, 'tasks');
});

const TWO_MARIAS = [
  ...demo.people,
  { id: 'ppl_maria_a', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active' },
  { id: 'ppl_maria_b', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' },
];

// --- Обзорные сводки -----------------------------------------------------

test('"чем заняться сегодня" returns the today action digest', () => {
  const engine = makeEngine();
  const result = ask(engine, 'Чем заняться сегодня');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'today');
  assert.equal(result.digest.title, 'Чем заняться сегодня');
  assert.ok(Array.isArray(result.digest.sections));
});

test('"как дела у <человека>" returns a person digest with check-in, tasks and signals', () => {
  const engine = makeEngine();
  const result = ask(engine, 'Как дела у Дуайта');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'person');
  assert.equal(result.digest.person.name, 'Дуайт Шрут');
  assert.deepEqual(result.digest.signals, []);
  assert.ok(result.digest.sections.some((section) => section.title.startsWith('Weekly за ')));
});

test('\"как дела у команды\" returns a team digest instead of accidental text-search matches', () => {
  const engine = makeEngine();
  const result = ask(engine, 'как дела у команды');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'team');
  assert.equal(result.digest.title, 'Как дела у команды');
  assert.ok(result.digest.sections.some((section) => section.title === 'Загрузка команды'));
  assert.ok(!result.search, 'командная сводка не должна падать в обычный поиск');
});

test('a project question answers about the project, not about a person with a similar name', () => {
  const engine = makeEngine();
  const result = ask(engine, 'как дела с проектом Sabre');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'project');
  assert.equal(result.digest.title, 'Sabre');
});


test('project digest understands conversational project status questions', () => {
  const projects = [...demo.projects, { id: 'prj_atom_digest', name: 'ATOM', status: 'active', memberIds: [] }];
  const engine = makeEngine({ projects });
  for (const query of ['что нового на проекте ATOM', 'что происходит на проекте ATOM', 'как дела на проекте ATOM']) {
    const result = ask(engine, query);
    assert.equal(result.kind, 'digest', query);
    assert.equal(result.digest.type, 'project', query);
    assert.match(result.digest.title, /ATOM/i, query);
  }
});

test('an unknown name falls back to regular search instead of inventing a digest', () => {
  const engine = makeEngine();
  const result = ask(engine, 'как дела у Здислава Незнакомого');
  assert.equal(result.kind, 'search');
});

test('"обзор недели" answers with the week digest, not with today', () => {
  const engine = makeEngine();
  const result = ask(engine, 'Обзор недели');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'week');
  assert.ok(result.digest.signals.length);
  const today = ask(engine, 'на что обратить внимание сегодня');
  assert.equal(today.digest.type, 'today', 'формулировки про день и неделю не должны путаться');
});

test('week digest has a clear empty-state message when nothing is planned', () => {
  const engine = makeEngine({ meetings: [], technologyEvents: [], tasks: [], agreements: [], vacations: [], people: [] });
  const result = ask(engine, 'Обзор недели');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'week');
  assert.equal(result.digest.emptyText, 'На этой неделе мероприятий не запланировано');
  assert.ok(result.digest.sections.every((section) => !(section.items || []).length && !(section.groups || []).some((group) => (group.items || []).length)));
});

test('"запиши в журнал …" creates a journal note rather than a search', () => {
  const engine = makeEngine();
  const result = ask(engine, 'Запиши в журнал обсудили с командой план на квартал');
  assert.equal(result.kind, 'create');
  assert.equal(result.create.target, 'note');
  assert.equal(result.create.title, 'обсудили с командой план на квартал');
});

test('digests can be asked about a specific person, not only about myself', () => {
  const engine = makeEngine();
  const today = ask(engine, 'на что обратить внимание сегодня по Дуайту');
  assert.equal(today.kind, 'digest');
  assert.equal(today.digest.type, 'today');
  assert.equal(today.digest.person.name, 'Дуайт Шрут');
  assert.match(today.digest.title, /Дуайт Шрут/);

  const week = ask(engine, 'обзор недели у Дуайта');
  assert.equal(week.digest.type, 'week');
  assert.equal(week.digest.person.name, 'Дуайт Шрут');

  const mine = ask(engine, 'на что мне обратить внимание сегодня');
  assert.equal(mine.digest.type, 'today');
  assert.equal(mine.digest.person, undefined, 'без указания человека сводка остаётся про себя');
});

test('an ambiguous name inside a digest question is asked about, not guessed', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'на что обратить внимание сегодня по Маше');
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.ambiguous.candidates.length, 2);
});

test('a task command fills in assignee, project, priority and due date from the phrase', () => {
  const people = [...demo.people, { id: 'p_maria', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' }];
  const projects = [...demo.projects, { id: 'prj_atom', name: 'ATOM', status: 'active', memberIds: [] }];
  const engine = makeEngine({ people, projects });

  const full = ask(engine, 'Создай задачу для Марии по проекту ATOM подготовить отчёт');
  assert.equal(full.kind, 'create');
  assert.equal(full.create.title, 'подготовить отчёт', 'служебные обороты не должны попадать в название');
  assert.equal(full.create.assignee.name, 'Мария Соколова');
  assert.equal(full.create.project.name, 'ATOM');

  const urgent = ask(engine, 'создай задачу срочная для Марии завтра проверить макеты');
  assert.equal(urgent.create.priority, 'high');
  assert.ok(urgent.create.dueDate, 'срок «завтра» должен превратиться в дату');
  assert.equal(urgent.create.title, 'проверить макеты');

  const plain = ask(engine, 'создай задачу написать письмо клиенту');
  assert.equal(plain.create.title, 'написать письмо клиенту');
  assert.equal(plain.create.assignee, null);
});

test('an ambiguous assignee in a task command is asked about instead of picking someone', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'создай задачу для Маши обновить макеты');
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.ambiguous.candidates.length, 2);
  assert.equal(result.ambiguous.hintKey, 'маши', 'в запомненный выбор не должно попасть слово из названия задачи');

  const full = ask(engine, 'создай задачу для Марии Соколовой обновить макеты');
  assert.equal(full.kind, 'create');
  assert.equal(full.create.assignee.name, 'Мария Соколова');
  assert.equal(full.create.title, 'обновить макеты');
});

test('create commands accept synonyms of the verb and of the entity word', () => {
  const engine = makeEngine();
  for (const query of ['поставь задачу проверить бэкапы', 'подставь задачу проверить бэкапы', 'оформи задачу проверить бэкапы', 'заведи задачку проверить бэкапы']) {
    const result = ask(engine, query);
    assert.equal(result.kind, 'create', `«${query}» должно распознаваться как создание`);
    assert.equal(result.create.target, 'tasks');
    assert.equal(result.create.title, 'проверить бэкапы');
  }
  assert.equal(ask(engine, 'назначь встречу ретро квартала').create.target, 'meetings');
  assert.equal(ask(engine, 'запланируй встречу с командой').create.target, 'meetings');
  assert.equal(ask(engine, 'зафиксируй договорённость сроки по релизу').create.target, 'agreements');
});

test('schedule commands only allow 1:1, PR and meetings', () => {
  const engine = makeEngine();

  const oneOnOne = ask(engine, 'запланируй 1:1 с Дуайтом');
  assert.equal(oneOnOne.kind, 'create');
  assert.equal(oneOnOne.create.target, 'meetings');
  assert.equal(oneOnOne.create.meetingType, '1:1');

  const pr = ask(engine, 'запланируй PR с Дуайтом');
  assert.equal(pr.kind, 'create');
  assert.equal(pr.create.target, 'meetings');
  assert.equal(pr.create.meetingType, 'pr');

  assert.equal(ask(engine, 'запланируй встречу по итогам квартала').create.target, 'meetings');
  for (const query of ['запланируй задачу проверить отчёт', 'запланируй проблему с релизом', 'запланируй созвон команды']) {
    assert.notEqual(ask(engine, query).kind, 'create', `«${query}» не должно создавать сущность через «запланируй»`);
  }
});

test('people and projects are recognized for every kind of record, not just tasks', () => {
  const people = [...demo.people, { id: 'p_maria', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' }];
  const projects = [...demo.projects, { id: 'prj_atom', name: 'ATOM', status: 'active', memberIds: [] }];
  const engine = makeEngine({ people, projects });

  const meeting = ask(engine, 'назначь встречу с Марией по проекту ATOM ретро квартала');
  assert.equal(meeting.create.target, 'meetings');
  assert.equal(meeting.create.assignee.name, 'Мария Соколова');
  assert.equal(meeting.create.project.name, 'ATOM');
  assert.equal(meeting.create.title, 'ретро квартала');

  const agreement = ask(engine, 'оформи договорённость с Марией фиксируем сроки');
  assert.equal(agreement.create.assignee.name, 'Мария Соколова');
  assert.equal(agreement.create.title, 'фиксируем сроки');

  const issue = ask(engine, 'заведи проблему у Марии не приходят уведомления');
  assert.equal(issue.create.assignee.name, 'Мария Соколова');
  assert.equal(issue.create.title, 'не приходят уведомления');

  const note = ask(engine, 'запиши в журнал Мария предложила менять процесс');
  assert.equal(note.create.target, 'note');
  assert.equal(note.create.title, 'Мария предложила менять процесс', 'текст заметки нельзя разбирать на слоты');
});

test('"чем заняться сегодня" shows all meetings for today and tomorrow and keeps the other requested limits', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const tasks = [
    ...demo.tasks,
    ...Array.from({ length: 6 }, (_, i) => ({ id: `t_focus_${i}`, title: `Фокус ${i}`, assigneeIds: [ME], status: 'todo', priority: 'high', dueDate: today })),
  ];
  const meetings = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `m_today_${i}`, title: `Сегодня ${i}`, date: `${today}T1${i}:00:00`, participantIds: [] })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `m_tomorrow_${i}`, title: `Завтра ${i}`, date: `${tomorrowDate}T1${i}:00:00`, participantIds: [] })),
    { id: 'm_later', title: 'Послезавтра', date: `${dayAfter}T10:00:00`, participantIds: [] },
  ];
  const journal = Array.from({ length: 12 }, (_, i) => ({ id: `j_${i}`, kind: 'note', text: `Заметка ${i}`, attentionPinned: true, createdAt: `2026-09-0${Math.min(9, i + 1)}T10:00:00Z` }));
  const issues = Array.from({ length: 5 }, (_, i) => ({ id: `i_${i}`, title: `Проблема ${i}`, status: 'open', severity: i === 4 ? 'high' : 'medium' }));
  const agreements = Array.from({ length: 5 }, (_, i) => ({ id: `a_${i}`, text: `Договорённость ${i}`, status: 'open', dueDate: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10) }));

  const engine = makeEngine({ tasks, meetings, journal, issues, agreements });
  const result = ask(engine, 'чем заняться сегодня');
  assert.equal(result.digest.type, 'today');
  assert.deepEqual(result.digest.sections.map((section) => section.title), [
    'Поработать над задачами',
    'Подготовиться к встречам',
    'Проверить заметки',
    'Разобраться с проблемами',
    'Актуализировать договорённости',
  ]);
  const [taskCard, meetingCard, noteCard, issueCard, agreementCard] = result.digest.sections;
  assert.ok(Array.isArray(taskCard.groups));
  assert.ok(taskCard.groups.every((group) => group.items.length <= 3));
  assert.equal(meetingCard.items.length, 8);
  assert.equal(meetingCard.more, 0);
  assert.ok(meetingCard.items.every((item) => String(item.date).slice(0, 10) === today || String(item.date).slice(0, 10) === tomorrowDate));
  assert.ok(noteCard.items.length <= 10);
  assert.ok(issueCard.items.length <= 3);
  assert.ok(agreementCard.items.length <= 3);
  assert.ok(!meetingCard.items.some((item) => item.title === 'Послезавтра'));
});

test('today task card groups work by project and keeps no more than three tasks per project', () => {
  const projects = [
    { id: 'p1', name: 'Проект Один', slug: 'one' },
    { id: 'p2', name: 'Проект Два', slug: 'two' },
  ];
  const tasks = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `p1_${i}`, title: `Один ${i}`, projectId: 'p1', assigneeIds: [ME], status: 'todo', priority: 'high' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `p2_${i}`, title: `Два ${i}`, projectId: 'p2', assigneeIds: [ME], status: 'todo', priority: 'high' })),
    { id: 'none_1', title: 'Без проекта', projectId: null, assigneeIds: [ME], status: 'todo', priority: 'high' },
  ];
  const result = ask(makeEngine({ tasks, projects }), 'чем заняться сегодня');
  const card = result.digest.sections.find((section) => section.title === 'Поработать над задачами');
  assert.deepEqual(new Set(card.groups.map((group) => group.title)), new Set(['Проект Один', 'Проект Два', 'Без проекта']));
  assert.deepEqual(card.groups.map((group) => group.title), ['Проект Два', 'Проект Один', 'Без проекта']);
  assert.ok(card.groups.every((group) => group.items.length <= 3));
  assert.equal(card.groups.find((group) => group.title === 'Проект Один').more, 2);
  assert.equal(card.groups.find((group) => group.title === 'Проект Два').more, 1);
});

test('the chosen priority strategy changes which tasks lead "чем заняться сегодня"', () => {
  const tasks = [
    { id: 't_important', title: 'Важная без срока', assigneeIds: [ME], status: 'todo', priority: 'high' },
    { id: 't_overdue', title: 'Просроченная обычная', assigneeIds: [ME], status: 'todo', priority: 'normal', dueDate: '2024-01-01' },
  ];
  const engine = makeEngine({ tasks });
  const byImportance = engine.smartSearch('чем заняться сегодня', { id: 'u', personId: ME }, { taskPriorityMode: 'importance' });
  const byOverdue = engine.smartSearch('чем заняться сегодня', { id: 'u', personId: ME }, { taskPriorityMode: 'overdue' });
  const first = (result) => result.digest.sections.find((section) => section.title === 'Поработать над задачами').items[0].title;
  assert.equal(first(byImportance), 'Важная без срока');
  assert.equal(first(byOverdue), 'Просроченная обычная');
});

test('the week digest only looks forward — nothing that has already happened', () => {
  const engine = makeEngine();
  const week = ask(engine, 'обзор недели');
  const titles = week.digest.sections.map((section) => section.title);
  assert.ok(!titles.includes('Встречи без итогов'), 'прошедшие встречи живут в сводке дня');
  assert.ok(!titles.includes('Блокеры в check-in'));
  const today = new Date().toISOString().slice(0, 10);
  week.digest.sections.forEach((section) => section.items.forEach((item) => {
    if (item.date && !item.dateEnd) assert.ok(String(item.date).slice(0, 10) >= today, `«${item.title}» уже прошло`);
  }));
});

test('a person digest reads as check-in, work in progress, upcoming meetings and notes', () => {
  // Демо-данные имеют фиксированные даты, поэтому добавляем гарантированно будущую
  // встречу: тест не должен начать падать просто из-за наступления новой даты.
  const future = new Date();
  future.setDate(future.getDate() + 1);
  const futureMeetings = [...demo.meetings, {
    id: 'mtg_test_dwight_future',
    type: '1:1',
    title: 'Будущий 1:1 с Дуайтом',
    date: future.toISOString(),
    participantIds: ['ppl_demo_dwight'],
    projectId: null,
    prepNotes: '', notes: '', actionItems: [], nextSteps: '',
  }];
  const engine = makeEngine({ meetings: futureMeetings });
  const result = ask(engine, 'как дела у Дуайта');
  const sections = result.digest.sections;
  assert.ok(sections.some((section) => section.title === 'Загрузка'));
  assert.ok(sections.some((section) => section.title.startsWith('Weekly за ')));
  assert.ok(sections.some((section) => section.title === 'Задачи в работе'));
  assert.ok(sections.some((section) => section.title === 'Ближайшие встречи'));

  const checkin = sections.find((section) => section.title.startsWith('Weekly за '));
  assert.deepEqual(checkin.items.map((item) => item.label), ['На прошлой неделе', 'На этой неделе', 'Блокеры']);
  assert.ok(checkin.items.every((item) => item.wrapText), 'текст текущего Weekly должен показываться полностью');

  const inProgress = sections.find((section) => section.title === 'Задачи в работе');
  if (inProgress) assert.ok(inProgress.items.length, 'в блоке только задачи в работе');

  const meetings = sections.find((section) => section.title === 'Ближайшие встречи');
  assert.ok(meetings.items.every((item) => item.date), 'у встречи должна быть дата');
  const personName = result.digest.title;
  assert.ok(meetings.items.every((item) => item.title && item.title !== personName), 'имя сотрудника не повторяется в заголовке встречи');
});

// --- Конфликты имён ------------------------------------------------------

test('two equally plausible Marias produce an explicit disambiguation instead of a guess', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'как дела у Маши');
  assert.equal(result.kind, 'ambiguous', 'нельзя молча выбирать одну из двух Марий');
  assert.equal(result.ambiguous.candidates.length, 2);
  assert.deepEqual(result.ambiguous.candidates.map((c) => c.name).sort(), ['Мария Зубарева', 'Мария Соколова']);
  assert.equal(result.ambiguous.hintKey, 'маши');
});

test('the full name resolves even while the short name stays ambiguous', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'как дела у Марии Соколовой');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Соколова');
});

test('a direct report wins over a namesake, and the card explains why', () => {
  const people = [
    ...demo.people,
    { id: 'ppl_maria_a', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active', teamLeadId: ME },
    { id: 'ppl_maria_b', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' },
  ];
  const engine = makeEngine({ people });
  const result = ask(engine, 'как дела у Маши');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Зубарева');
  assert.equal(result.resolution.via, 'score');
  const alternative = result.resolution.alternatives.find((item) => item.name === 'Мария Соколова');
  assert.ok(alternative, 'второй кандидат остаётся доступен для переключения');
});

test('a dismissed namesake does not compete with an active person', () => {
  const people = [
    ...demo.people,
    { id: 'ppl_maria_a', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active' },
    { id: 'ppl_maria_b', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'dismissed' },
  ];
  const engine = makeEngine({ people });
  const result = ask(engine, 'как дела у Маши');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Зубарева');
});

test('a remembered choice resolves the same short name silently next time', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'как дела у Маши', { hints: { 'маши': 'ppl_maria_b' } });
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Соколова');
  assert.equal(result.resolution.via, 'hint');
});

test('a stale hint pointing at someone who no longer matches is ignored, not obeyed', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'как дела у Маши', { hints: { 'маши': 'ppl_demo_dwight' } });
  assert.equal(result.kind, 'ambiguous', 'подсказка на неподходящего человека не должна подменять ответ');
});

test('an explicit choice from the disambiguation card wins over everything else', () => {
  const engine = makeEngine({ people: TWO_MARIAS });
  const result = ask(engine, 'как дела у Маши', { personId: 'ppl_maria_a', hints: { 'маши': 'ppl_maria_b' } });
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Зубарева');
  assert.equal(result.resolution.via, 'explicit');
});

test('shared project and a recent 1:1 break a tie between namesakes', () => {
  const people = [
    ...demo.people,
    { id: 'ppl_maria_a', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active' },
    { id: 'ppl_maria_b', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' },
  ];
  const projects = [
    ...demo.projects,
    { id: 'prj_shared', name: 'Общий проект', status: 'active', memberIds: [ME, 'ppl_maria_b'] },
  ];
  const engine = makeEngine({ people, projects });
  const result = ask(engine, 'как дела у Маши');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.person.name, 'Мария Соколова');
  const chosen = (result.resolution.alternatives || []).length;
  assert.equal(chosen, 1);
});

test('smart-search understands @ references in create and digest commands', () => {
  const people = [...demo.people, { id: 'p_maria_at', name: 'Мария Соколова', role: 'Аналитик', type: 'team', status: 'active' }];
  const projects = [...demo.projects, { id: 'prj_atom_at', name: 'ATOM', status: 'active', memberIds: [] }];
  const engine = makeEngine({ people, projects });

  const created = ask(engine, 'создай задачу для @Мария Соколова по проекту @ATOM проверить макеты');
  assert.equal(created.kind, 'create');
  assert.equal(created.create.assignee.id, 'p_maria_at');
  assert.equal(created.create.project.id, 'prj_atom_at');
  assert.equal(created.create.title, 'проверить макеты');

  const digest = ask(engine, 'как дела у @Дуайт Шрут');
  assert.equal(digest.kind, 'digest');
  assert.equal(digest.digest.person.name, 'Дуайт Шрут');
});

test('today task card keeps projects whose tasks have no due date or important flag', () => {
  const projects = [
    { id: 'p_plain_1', name: 'Первый проект', slug: 'plain-one' },
    { id: 'p_plain_2', name: 'Второй проект', slug: 'plain-two' },
  ];
  const tasks = [
    { id: 'plain_1', title: 'Обычная задача 1', projectId: 'p_plain_1', assigneeIds: [ME], status: 'todo', priority: 'normal' },
    { id: 'plain_2', title: 'Обычная задача 2', projectId: 'p_plain_2', assigneeIds: [ME], status: 'todo', priority: 'normal' },
  ];
  const result = ask(makeEngine({ tasks, projects }), 'чем заняться сегодня');
  const card = result.digest.sections.find((section) => section.title === 'Поработать над задачами');
  assert.deepEqual(new Set(card.groups.map((group) => group.title)), new Set(['Первый проект', 'Второй проект']));
});

test('1:1 and PR rows use only the person name next to the meeting type label', () => {
  const today = new Date().toISOString().slice(0, 10);
  const people = [
    ...demo.people,
    { id: 'p_target_meeting', name: 'Анна Смирнова', role: 'Дизайнер', type: 'team', status: 'active' },
  ];
  const meetings = [
    { id: 'm_11_clean', type: '1:1', title: '1:1 с Анна Смирнова', date: `${today}T10:00:00`, participantIds: [ME, 'p_target_meeting'] },
    { id: 'm_pr_clean', type: 'PR', title: 'PR: Анна Смирнова', date: `${today}T11:00:00`, participantIds: [ME, 'p_target_meeting'] },
  ];
  const result = ask(makeEngine({ people, meetings }), 'чем заняться сегодня');
  const card = result.digest.sections.find((section) => section.title === 'Подготовиться к встречам');
  assert.deepEqual(card.items.map((item) => [item.label, item.title]), [
    ['1:1', 'Анна Смирнова'],
    ['PR', 'Анна Смирнова'],
  ]);
});

test('today rows expose editable entity statuses and important issues do not add a duplicate tone dot', () => {
  const tasks = [{ id: 'status_task', title: 'Задача', assigneeIds: [ME], status: 'in_progress', priority: 'high' }];
  const issues = [{ id: 'status_issue', title: 'Проблема', status: 'in_progress', severity: 'high' }];
  const agreements = [{ id: 'status_agreement', text: 'Договорённость', status: 'open' }];
  const result = ask(makeEngine({ tasks, issues, agreements }), 'чем заняться сегодня');
  const byTitle = Object.fromEntries(result.digest.sections.map((section) => [section.title, section]));
  assert.equal(byTitle['Поработать над задачами'].items[0].status, 'in_progress');
  assert.equal(byTitle['Поработать над задачами'].items[0].entityType, 'task');
  assert.equal(byTitle['Разобраться с проблемами'].items[0].status, 'in_progress');
  assert.equal(byTitle['Разобраться с проблемами'].items[0].rightLabel, 'Важная');
  assert.equal(byTitle['Разобраться с проблемами'].items[0].tone, '');
  assert.equal(byTitle['Актуализировать договорённости'].items[0].status, 'open');
  assert.equal(byTitle['Актуализировать договорённости'].items[0].entityType, 'agreement');
});

test('"как дела у" shows no more than five latest journal notes', () => {
  const journal = Array.from({ length: 7 }, (_, i) => ({
    id: `person_note_${i}`,
    kind: 'note',
    text: `Заметка ${i}`,
    createdAt: `2026-09-0${i + 1}T10:00:00Z`,
    mentions: [{ type: 'person', id: 'ppl_demo_dwight' }],
  }));
  const result = ask(makeEngine({ journal }), 'Как дела у Дуайта');
  const notes = result.digest.sections.find((section) => section.title === 'Заметки в журнале');
  assert.ok(notes);
  assert.equal(notes.count, 7);
  assert.equal(notes.items.length, 5);
  assert.deepEqual(notes.items.map((item) => item.title), ['Заметка 6', 'Заметка 5', 'Заметка 4', 'Заметка 3', 'Заметка 2']);
  assert.equal(notes.more, 2);
});


test('today digest adds up to five past meetings without outcomes after the upcoming meetings card', () => {
  const today = new Date().toISOString().slice(0, 10);
  const base = new Date(`${today}T00:00:00Z`);
  const past = (days) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() - days); return `${d.toISOString().slice(0, 10)}T10:00:00`; };
  const meetings = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `missed_${i}`, type: 'other', title: `Встреча ${i}`, date: past(i + 1), participantIds: [ME] })),
    { id: 'done_outcome', type: 'other', title: 'С итогами', date: past(1), participantIds: [ME], notes: 'Итоги заполнены' },
  ];
  const result = ask(makeEngine({ meetings }), 'Чем заняться сегодня');
  const titles = result.digest.sections.map((section) => section.title);
  const upcomingIndex = titles.indexOf('Подготовиться к встречам');
  const missedIndex = titles.indexOf('Перенести или заполнить итоги');
  assert.ok(missedIndex > upcomingIndex, 'карточка должна идти сразу после подготовки к встречам, если обе есть');
  const card = result.digest.sections[missedIndex];
  assert.equal(card.count, 6);
  assert.equal(card.items.length, 5);
  assert.equal(card.more, 1);
  assert.ok(card.items.every((item) => item.title !== 'С итогами'));
});

test('person digest exposes workload and only active issues while retaining agreements', () => {
  const personId = 'ppl_demo_dwight';
  const projects = [
    { id: 'load_a', name: 'Проект A', status: 'active', memberIds: [personId], memberLoads: { [personId]: 'half' } },
    { id: 'load_b', name: 'Проект B', status: 'active', memberIds: [personId], memberLoads: { [personId]: 'support' } },
  ];
  const issues = [
    { id: 'issue_open_person', title: 'Открытая', status: 'open', relatedPersonIds: [personId] },
    { id: 'issue_done_person', title: 'Решённая', status: 'resolved', relatedPersonIds: [personId] },
  ];
  const agreements = [
    { id: 'agr_open_person', text: 'Открытая договорённость', status: 'open', withPersonIds: [personId] },
    { id: 'agr_done_person', text: 'Завершённая договорённость', status: 'done', mentions: [{ id: personId, type: 'person' }] },
  ];
  const result = ask(makeEngine({ projects, issues, agreements }), 'Как дела у Дуайта');
  const load = result.digest.sections.find((section) => section.title === 'Загрузка');
  assert.ok(load);
  assert.equal(load.layout, 'project-load');
  assert.equal(load.summary.variant, 'load-level');
  assert.equal(load.summary.tone, 'full');
  assert.equal(load.summary.text, 'Полная');
  assert.deepEqual(load.summary.action, { label: 'Изменить загрузку', command: 'openPersonLoadModal', arg: personId });
  assert.deepEqual(load.items.map((item) => [item.title, item.meta]), [
    ['Проект A', 'Парт-тайм'],
    ['Проект B', 'Саппорт'],
  ]);
  assert.deepEqual(result.digest.sections.find((section) => section.title === 'Проблемы').items.map((item) => item.entityId), ['issue_open_person']);
  assert.equal(result.digest.sections.find((section) => section.title === 'Договорённости').items.length, 2);
});

test('assistant/search rendering is section-based in the React client', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/pages/misc.jsx'), 'utf8');
  assert.match(page, /Object\.entries\(result\?\.groups/);
  assert.match(page, /groups\.map\(\(\[group,items\]\)/);
  assert.match(page, /<Section key=\{group\}/);
});

test('person context does not stick to the next generic monthly task query', () => {
  const engine = makeEngine();
  const person = ask(engine, 'Как дела у Дуайта');
  assert.equal(person.kind, 'digest');
  assert.equal(person.digest.type, 'person');

  const monthly = ask(engine, 'задачи за месяц');
  assert.equal(monthly.kind, 'search');
  assert.equal(monthly.search.command.group, 'tasks');
  assert.equal(monthly.search.command.person, null);
  const assignees = new Set(monthly.search.groups.tasks.flatMap((task) => task.assigneeIds || []));
  assert.ok(assignees.size > 1, 'следующий запрос должен быть по всей доступной команде');
});

test('assistant fallback reuses the shared NLU plan used by regular search', () => {
  const engine = makeEngine();
  const result = ask(engine, 'покажи мои задачи по развитию');
  assert.equal(result.kind, 'search');
  assert.equal(result.search.nlu.kind, 'content');
  assert.equal(result.search.nlu.intent, 'show');
  assert.equal(result.search.nlu.entity, 'tasks');
  assert.equal(result.search.nlu.filters.taskType, 'development');
  assert.equal(result.search.nlu.filters.selfRequested, true);
});

test('assistant returns an attached meeting material for a natural link-title query', () => {
  const people = [...demo.people, { id: 'ppl_smart_maria', name: 'Мария Зубарева', role: 'Дизайнер', type: 'team', status: 'active' }];
  const meetings = [...demo.meetings, {
    id: 'mtg_smart_maria', type: '1:1', title: '1:1 с Марией Зубаревой', date: '2026-09-04T10:00:00',
    participantIds: ['ppl_smart_maria'], projectId: null,
    documentLinks: [{ title: 'Саммари', url: 'https://example.test/summary' }],
  }];
  const engine = makeEngine({ people, meetings });
  const result = ask(engine, 'саммари встречи с Машей');
  assert.equal(result.kind, 'search');
  assert.equal(result.search.command.person.id, 'ppl_smart_maria');
  assert.equal(result.search.groups.links.length, 1);
  assert.equal(result.search.groups.links[0].title, 'Саммари');
});

test('assistant keeps «саммари со встречи» in material search instead of returning meetings', () => {
  const meetings = [...demo.meetings, {
    id: 'mtg_smart_summary_from_meeting', type: 'project', title: 'Планирование', date: '2026-09-04T10:00:00',
    participantIds: [], projectId: null,
    documentLinks: [{ title: 'Саммари', url: 'https://example.test/summary-from-meeting' }],
  }];
  const engine = makeEngine({ meetings });
  const result = ask(engine, 'саммари со встречи');

  assert.equal(result.kind, 'search');
  assert.equal(result.search.command.group, 'links');
  assert.equal(result.search.command.materialKind, 'summary');
  assert.equal(result.search.command.sourceType, 'meeting');
  assert.ok(result.search.groups.links.some((link) => link.sourceId === 'mtg_smart_summary_from_meeting'));
  assert.equal(result.search.groups.meetings.length, 0);
});

test('assistant understands «саммари встреч» as meeting material search', () => {
  const meetings = [...demo.meetings, {
    id: 'mtg_smart_summary_plural', type: 'project', title: 'Планирование', date: '2026-09-04T10:00:00',
    participantIds: [], projectId: null,
    documentLinks: [{ title: 'Саммари', url: 'https://example.test/summary-plural' }],
  }];
  const engine = makeEngine({ meetings });
  const result = ask(engine, 'саммари встреч');

  assert.equal(result.kind, 'search');
  assert.equal(result.search.command.group, 'links');
  assert.equal(result.search.command.materialKind, 'summary');
  assert.equal(result.search.command.sourceType, 'meeting');
  assert.ok(result.search.groups.links.some((link) => link.sourceId === 'mtg_smart_summary_plural'));
});

test('assistant treats summary synonyms as one material intent and can scope attachments to meetings', () => {
  const people = [...demo.people, { id: 'ppl_smart_nastya', name: 'Анастасия Власова', role: 'Аналитик', type: 'team', status: 'active' }];
  const meetings = [...demo.meetings, {
    id: 'mtg_smart_nastya', type: '1:1', title: '1:1 с Анастасией Власовой', date: '2026-09-04T10:00:00',
    participantIds: ['ppl_smart_nastya'], projectId: null,
    documentLinks: [{ title: 'Саммари', url: 'https://example.test/nastya-summary' }],
  }];
  const engine = makeEngine({ people, meetings });

  const byPerson = ask(engine, 'найди конспект с Настей');
  assert.equal(byPerson.kind, 'search');
  assert.equal(byPerson.search.command.materialKind, 'summary');
  assert.equal(byPerson.search.command.person.id, 'ppl_smart_nastya');
  assert.deepEqual(byPerson.search.groups.links.map((link) => link.sourceId), ['mtg_smart_nastya']);

  const fromMeeting = ask(engine, 'найди документы с встречи');
  assert.equal(fromMeeting.kind, 'search');
  assert.equal(fromMeeting.search.command.group, 'links');
  assert.equal(fromMeeting.search.command.sourceType, 'meeting');
  assert.ok(fromMeeting.search.groups.links.some((link) => link.sourceId === 'mtg_smart_nastya'));
});

test('assistant reuses relative weekday/week parsing without «на» and in create commands', () => {
  const engine = makeEngine();
  const found = ask(engine, 'задачи прошедшая пятница');
  assert.equal(found.kind, 'search');
  assert.ok(found.search.command.dateRange);
  assert.equal(found.search.command.textRemainder, '');

  const reference = ask(engine, 'задачи следующая пятница').search.command.dateRange;
  const created = ask(engine, 'создай задачу подготовить отчёт следующая пятница');
  assert.equal(created.kind, 'create');
  assert.equal(created.create.dueDate, reference.end);
  assert.equal(created.create.title, 'подготовить отчёт');

  const weekReference = ask(engine, 'задачи предыдущая неделя').search.command.dateRange;
  const weekCreated = ask(engine, 'создай задачу закрыть хвосты предыдущая неделя');
  assert.equal(weekCreated.create.dueDate, weekReference.end);
  assert.equal(weekCreated.create.title, 'закрыть хвосты');
});

test('assistant includes planned events with date-only rows and a preparation card in today digest', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const technologyEvents = [{
    id: 'tech_smart_planned',
    plannedDate: today,
    topic: 'Разбор новых инструментов',
    hours: 2,
    personIds: ['ppl_demo_dwight', ME],
    completed: false,
    createdByUserId: 'usr_demo',
  }, {
    id: 'tech_smart_tomorrow',
    plannedDate: tomorrow,
    topic: 'Практика с прототипами',
    hours: 1,
    personIds: [ME],
    completed: false,
    createdByUserId: 'usr_demo',
  }];
  const engine = makeEngine({ technologyEvents });

  const week = ask(engine, 'Обзор недели');
  const weekSection = week.digest.sections.find((section) => section.title === 'Запланированные мероприятия');
  assert.ok(weekSection);
  assert.equal(weekSection.items[0].title, 'Разбор новых инструментов');
  assert.equal(weekSection.items[0].meta, undefined);
  assert.equal(weekSection.items[0].date, today);
  assert.equal(weekSection.items[0].open.route, '/technology');

  const todayDigest = ask(engine, 'Чем заняться сегодня');
  const todaySection = todayDigest.digest.sections.find((section) => section.title === 'Подготовиться к мероприятиям');
  assert.ok(todaySection);
  assert.equal(todaySection.items.length, 2);
  assert.equal(todaySection.items[0].meta, undefined);
  assert.equal(todaySection.items[0].date, today);
  assert.equal(todaySection.items[1].date, tomorrow);

  const person = ask(engine, 'Как дела у Дуайта');
  const personSection = person.digest.sections.find((section) => section.title === 'Запланированные мероприятия');
  assert.ok(personSection);
  assert.equal(personSection.items[0].meta, undefined);
});

test('assistant understands «саммари с последних PR» and «документы со встреч»', () => {
  const meetings = [...demo.meetings,
    { id: 'mtg_smart_pr_old_material', type: 'pr', title: 'PR old', date: '2026-08-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/smart-pr-old' }] },
    { id: 'mtg_smart_pr_new_material', type: 'pr', title: 'PR new', date: '2026-09-01T10:00:00', participantIds: [], documentLinks: [{ title: 'Саммари', url: 'https://example.test/smart-pr-new' }] },
    { id: 'mtg_smart_docs_notes', type: 'other', title: 'Workshop', date: '2026-09-02T10:00:00', participantIds: [], notes: 'Документ: https://example.test/smart-doc-in-notes' },
  ];
  const engine = makeEngine({ meetings });

  const summaries = ask(engine, 'саммари с последних PR');
  assert.equal(summaries.kind, 'search');
  assert.equal(summaries.search.command.sourceMeetingType, 'pr');
  assert.deepEqual(summaries.search.groups.links.slice(0, 2).map((link) => link.sourceId), ['mtg_smart_pr_new_material', 'mtg_smart_pr_old_material']);

  const documents = ask(engine, 'документы со встреч');
  assert.equal(documents.kind, 'search');
  assert.equal(documents.search.command.sourceType, 'meeting');
  assert.ok(documents.search.groups.links.some((link) => link.sourceId === 'mtg_smart_docs_notes'));
});

test('"загрузка у <человека>" returns only the workload section', () => {
  const engine = makeEngine();
  const result = ask(engine, 'загрузка у Дуайта');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'person');
  assert.equal(result.digest.person.name, 'Дуайт Шрут');
  assert.deepEqual(result.digest.sections.map((section) => section.title), ['Загрузка']);
});

test('"как дела с задачами у <человека>" returns only the tasks section', () => {
  const engine = makeEngine();
  const result = ask(engine, 'как дела с задачами у Дуайта');
  assert.equal(result.kind, 'digest');
  assert.equal(result.digest.type, 'person');
  assert.equal(result.digest.person.name, 'Дуайт Шрут');
  assert.deepEqual(result.digest.sections.map((section) => section.title), ['Задачи в работе']);
});


test('создание заметки понимает команду «Запиши в заметки» с двоеточием', () => {
  const engine = makeEngine();
  const result = ask(engine, 'Запиши в заметки: обсудили с командой план на квартал');
  assert.equal(result.kind, 'create');
  assert.equal(result.create.target, 'note');
  assert.equal(result.create.title, 'обсудили с командой план на квартал');
});


test('assistant suggestions exclude completed and archived tasks and resolved issues', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [
    { id: 'active_task', title: 'Активная задача', status: 'todo', assigneeIds: [ME], dueDate: today },
    { id: 'done_task', title: 'Завершённая задача', status: 'done', assigneeIds: [ME], dueDate: today },
    { id: 'archived_task', title: 'Архивная задача', status: 'archived', assigneeIds: [ME], dueDate: today },
    { id: 'archived_date_task', title: 'Удалённая из работы', status: 'todo', archivedAt: today, assigneeIds: [ME], dueDate: today },
  ];
  const issues = [
    { id: 'active_issue', title: 'Активная проблема', status: 'open', relatedPersonIds: [ME] },
    { id: 'resolved_issue', title: 'Решённая проблема', status: 'resolved', relatedPersonIds: [ME] },
    { id: 'closed_issue', title: 'Закрытая проблема', status: 'closed', relatedPersonIds: [ME] },
  ];
  const engine = makeEngine({ tasks, issues });
  for (const query of ['Чем заняться сегодня', 'Обзор недели', 'Как дела у Майкла']) {
    const response = ask(engine, query);
    assert.equal(response.kind, 'digest', query);
    const allItems = (response.digest.sections || []).flatMap((section) => [
      ...(section.items || []),
      ...(section.groups || []).flatMap((group) => group.items || []),
    ]);
    const ids = new Set(allItems.map((item) => item.entityId));
    for (const id of ['done_task', 'archived_task', 'archived_date_task', 'resolved_issue', 'closed_issue']) {
      assert.equal(ids.has(id), false, `${query}: ${id} should be hidden`);
    }
  }
});
