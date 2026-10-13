'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('assistant is the only home experience', () => {
  const home = read('src/pages/home.jsx');
  const settings = read('src/pages/misc.jsx');
  const serverSettings = read('server/routes/settings.js');
  assert.match(home, /<AssistantWorkspace user=\{user\}\/>/);
  assert.doesNotMatch(home, /DashboardHome|overviewHomeMode|widgets/);
  assert.doesNotMatch(settings, /overviewHomeMode|Виджеты|Главный экран/);
  assert.doesNotMatch(serverSettings, /overviewHomeMode|overviewDashboard|widgets/);
});

test('assistant keeps command, creation, navigation and ambiguity workflows', () => {
  const assistant = read('src/components/assistant.jsx');
  for (const phrase of ['Создай', 'Открой', 'Покажи мои', 'Запиши в заметки']) assert.ok(assistant.includes(phrase));
  assert.match(assistant, /api\.get\(`\/api\/smart-search\?q=/);
  assert.match(assistant, /api\.resource\('journal'\)\.create/);
  assert.match(assistant, /api\.resource\('tasks'\)\.create/);
  assert.match(assistant, /api\.resource\('meetings'\)\.create/);
  assert.match(assistant, /api\.resource\('issues'\)\.create/);
  assert.match(assistant, /api\.resource\('agreements'\)\.create/);
  assert.match(assistant, /api\.resource\('labs'\)\.create/);
  assert.match(assistant, /smartSearchPersonHints/);
  assert.match(assistant, /navigationFromSearch/);
  assert.match(assistant, /InlineStatus/);
});

test('journal preserves composer, mentions, search, pinning, editing and deletion', () => {
  const journal = read('src/pages/journal.jsx');
  const mentions = read('src/components/mention-editor.jsx');
  assert.match(journal, /MentionEditor/);
  assert.match(journal, /Поиск по заметкам/);
  assert.match(journal, /attentionPinned/);
  assert.match(journal, /attention-notes/);
  assert.match(journal, /datetime-local/);
  assert.match(journal, /api\.resource\('journal'\)\.update/);
  assert.match(journal, /api\.resource\('journal'\)\.remove/);
  assert.match(journal, /params\.get\('entry'\)/);
  assert.match(mentions, /data-mention-type/);
  assert.match(mentions, /person|project/);
  assert.match(mentions, /submitOnEnter/);
});

test('Garden themes are selectable, persisted and restored in the React client', () => {
  const settings = read('src/pages/misc.jsx');
  const appearance = read('src/lib/appearance.js');
  const auth = read('src/components/auth.jsx');
  const main = read('src/main.jsx');
  for (const label of ['Garden Light','AnuPpuccin Latte','Garden Dark','AnuPpuccin Mocha']) {
    assert.ok(appearance.includes(label), `${label} is missing from appearance registry`);
  }
  assert.equal((appearance.match(/mode: 'light'/g) || []).length, 2);
  assert.equal((appearance.match(/mode: 'dark'/g) || []).length, 2);
  assert.match(settings, /<ThemeGroup title="Светлые"/);
  assert.match(settings, /<ThemeGroup title="Тёмные"/);
  assert.match(settings, /<AccentPicker/);
  assert.match(settings, /api\.put\('\/api\/settings'/);
  assert.match(main, /applyStoredAppearance/);
  assert.match(auth, /api\.get\('\/api\/settings'\)/);
  assert.match(auth, /applyAppearance\(settings\)/);
  assert.doesNotMatch(appearance, /glow/);
});

test('Garden themes cannot be stripped from the production Tailwind build', () => {
  const css = read('src/styles.css');
  const tailwind = read('tailwind.config.js');
  const layerClose = css.indexOf('/* Garden theme palettes live outside Tailwind layers');
  assert.ok(layerClose > 0, 'theme palettes should be emitted outside a purgeable Tailwind layer');
  for (const theme of ['disk-light','anuppuccin-latte','noch','anuppuccin-mocha']) {
    assert.ok(css.includes(`html.theme-${theme}`), `${theme} CSS variables are missing`);
    assert.ok(tailwind.includes(`theme-${theme}`), `${theme} is not safelisted`);
  }
  for (const retired of ['chernika','myata','lavanda','tuman','garden-clean','grafit','khvoya','disk-dark']) {
    assert.ok(!tailwind.includes(`theme-${retired}`), `${retired} should not be safelisted`);
  }
});

test('team workload management is restored from projects, people and assistant flows', () => {
  const resources = read('src/pages/resources.jsx');
  const app = read('src/app.jsx');
  const assistant = read('src/components/assistant.jsx');
  for (const feature of ['Загрузка','Управление загрузкой','PersonLoadDialog','ProjectLoadDialog','Фултайм','Парт-тайм','Саппорт']) {
    assert.ok(resources.includes(feature) || read('src/lib/domain.js').includes(feature), `${feature} is missing`);
  }
  assert.match(app, /path="\/team-load"/);
  assert.match(assistant, /загрузка команды/);
  assert.match(assistant, /openPersonLoadModal/);
  assert.match(resources, /params\.get\('person'\)/);
});

test('team and stakeholders are separate product sections', () => {
  const app = read('src/app.jsx');
  const shell = read('src/components/app-shell.jsx');
  const resources = read('src/pages/resources.jsx');
  const search = read('src/pages/misc.jsx');
  assert.match(app, /path="\/team" element=\{<PeoplePage type="team"\/>\}/);
  assert.match(app, /path="\/stakeholders" element=\{<PeoplePage type="stakeholder"\/>\}/);
  assert.match(shell, /\['\/team', 'Команда'/);
  assert.match(shell, /\['\/stakeholders', 'Стейкхолдеры'/);
  assert.match(resources, /person\.type === type/);
  assert.match(search, /team:'Команда'/);
  assert.match(search, /stakeholders:'Стейкхолдеры'/);
});

test('task list keeps Garden statuses and the current project/development filters', () => {
  const tasks = read('src/pages/tasks.jsx');
  const domain = read('src/lib/domain.js');
  for (const label of ['Новая','В работе','На ревью','Приостановлено','Заблокировано','Готово']) assert.ok(domain.includes(label), `${label} is missing`);
  for (const label of ['Архив','По статусам','По сотрудникам','По проектам','по всем проектам','Команда','Технологизация','Поиск задач']) assert.ok(tasks.includes(label), `${label} filter is missing`);
});

test('task priority sorting is shared outside the tasks page', () => {
  const tasks = read('src/pages/tasks.jsx');
  const resources = read('src/pages/resources.jsx');
  const priority = read('src/lib/task-priority.js');
  assert.match(tasks, /rankTasksByPriority/);
  assert.match(resources, /rankTasksByPriority/);
  assert.match(priority, /export function rankTasksByPriority/);
});


test('task workspace uses personal/team representations, explicit toolbar filters, grouping and kanban', () => {
  const tasks = read('src/pages/tasks.jsx');
  for (const label of ['Фокус на день','Мои задачи','Задачи команды','Технологизация','Список','Доска','Поиск задач']) assert.ok(tasks.includes(label), `${label} task workspace control is missing`);
  assert.ok(tasks.includes('Шаблоны'), 'task view rail should use the Knowledge Base-style Шаблоны heading');
  assert.ok(!tasks.includes('До 3 задач на проект'), 'focus view should not render the redundant per-project limit hint');
  assert.equal(tasks.includes('tasks-filter-section-title">Сортировка'), false);
  assert.match(tasks, /settings\.data\?\.taskPriorityMode/);
  assert.match(tasks, /bucket\.length < 3/);
  assert.ok(tasks.includes('<PageHeader') && tasks.includes('title="Задачи"'), 'Tasks should use the shared page header');
  assert.ok(tasks.includes('tasks-control-strip'), 'Search, view switcher and filters should share the top control row');
  assert.ok(tasks.includes('tasks-filter-sentence'), 'Task filters should stay in the compact top filter row');
  assert.ok(tasks.includes("'Команда'"), 'Team filter should use the concise "Команда" subject');
  assert.ok(tasks.includes('Технологизация'), 'Technology filter should use the product terminology');
  assert.ok(tasks.includes('в ревью'), 'Status filter should support review wording');
  assert.match(tasks, /aria-label="Список"[\s\S]*<ListTodo[^>]*\/>\s*<\/button>/, 'List view control should be icon-only');
  assert.match(tasks, /aria-label="Доска"[\s\S]*<Columns3[^>]*\/>\s*<\/button>/, 'Board view control should be icon-only');
  assert.ok(tasks.includes('Все проекты'), 'Task project filter should support all-projects selection');
  assert.equal(tasks.includes('tasks-group-select'), false, 'Grouping should not compete with the view/search controls in the top toolbar');
  assert.ok(tasks.includes('tasks-grouping-section') && tasks.includes('tasks-group-radio'), 'Grouping should live in the local navigation rail');

  assert.ok(tasks.includes('onValueChange={changeActor}'), 'Assignee should stay editable even in personal task views');
  assert.ok(tasks.includes("setView(isTechnology ? 'technology' : 'team')"), 'Changing assignee should move personal views into one of the four supported views');
  assert.ok(tasks.includes('value="development">Технологизация'), 'Technology scope should be replaceable from the compact filter control');
  assert.equal(tasks.includes('is-status-group'), false, 'Status glyphs should not be attached to group headers');
  assert.ok(tasks.includes('tasks-view-header') && tasks.includes('currentViewTitle'), 'Selected task view heading is missing');
  assert.ok(tasks.includes('hideProjectMeta={groupBy === \'project\' || isPriorityView}'), 'Project metadata should be suppressed when the project is already the group heading');
  assert.match(tasks, /function TaskKanban/);
  assert.match(tasks, /draggable/);
  assert.match(tasks, /onDrop/);
  assert.equal(tasks.includes('Только важные'), false);
});

test('typed list pages expose type and lifecycle/status filters', () => {
  const meetings = read('src/pages/operations.jsx');
  const labs = read('src/pages/workspace.jsx');
  const resources = read('src/pages/resources.jsx');
  const technology = read('src/pages/technology.jsx');
  for (const label of ['Будущие','Завершённые','Без итогов','Все','Все типы']) assert.ok(meetings.includes(label), `${label} meeting filter is missing`);
  assert.match(meetings, /MEETING_TYPE_OPTIONS/);
  for (const label of ['Все типы','Все сотрудники','Только идеи без проектов']) assert.ok(labs.includes(label), `${label} workshop filter is missing`);
  assert.match(resources, /filters:/);
  for (const label of ['Все мероприятия','Запланировано','Проведено','Поиск по теме']) assert.ok(technology.includes(label), `${label} technology filter is missing`);
});

test('resource list filters tolerate partial or stale stored filters and use plural option labels', () => {
  const resources = read('src/pages/resources.jsx');
  assert.match(resources, /filterDefaults\[filter\.key\]/, 'stored filters must fall back to defaults per key');
  assert.doesNotMatch(resources, /setFilters\(\(current\)/, 'setFilters must not depend on a possibly malformed stored value');
  for (const label of ['Все уровни важности','Новые','Отложенные','Решённые','Важные','Обычные','Сломанные','Выполненные']) assert.ok(resources.includes(label), `${label} plural filter option is missing`);
  assert.doesNotMatch(resources, /Любая важность/);
});

test('assistant landing uses the same calm flat rhythm as tasks', () => {
  const assistant = read('src/components/assistant.jsx');
  assert.match(assistant, /assistant-greeting mb-5 flex justify-center/);
  assert.match(assistant, /text-\[28px\]/);
  assert.match(assistant, /assistant-composer-wrap w-full/);
  assert.match(assistant, /assistant-digest-section-header/);
  assert.match(assistant, /TaskEntityRow/);
  assert.match(assistant, /EntityRow/);
  assert.match(assistant, /flex flex-wrap justify-center gap-1/);
  assert.match(assistant, /!rounded-full/);
  assert.doesNotMatch(assistant, /<Sparkles className="absolute left-3/);
});

test('Weekly is the canonical check-in UI and keeps Garden editing and navigation flows', () => {
  const app = read('src/app.jsx');
  const shell = read('src/components/app-shell.jsx');
  const assistant = read('src/components/assistant.jsx');
  const operations = read('src/pages/operations.jsx');
  const searchRoute = read('server/routes/search.js');
  assert.match(app, /path="\/weekly" element=\{<CheckinsPage\/>\}/);
  assert.match(app, /path="\/checkins" element=\{<LegacyWeeklyRedirect\/>\}/);
  assert.match(shell, /\['\/weekly', 'Weekly'/);
  for (const alias of ['дейли','дейлик','викли','виклик']) {
    assert.ok(assistant.includes(alias), `${alias} assistant alias is missing`);
    assert.ok(searchRoute.includes(alias), `${alias} search alias is missing`);
  }
  for (const feature of ['По неделям','По сотрудникам','Предыдущая неделя','Следующая неделя','Текущая неделя','type="date"','onBlur={save}']) {
    assert.ok(operations.includes(feature), `${feature} Weekly capability is missing`);
  }
  assert.match(operations, /repeat\(3,minmax\(230px,1fr\)\)/);
});

test('requested catalog sections expose create, update and delete flows', () => {
  const resources = read('src/pages/resources.jsx');
  const misc = read('src/pages/misc.jsx');
  const crudHook = read('src/hooks/use-crud-dialog-form.js');
  // Generic create/update/remove now live once in the shared hook, parameterized by `resource`.
  assert.match(crudHook, /api\.resource\(resource\)\.create\(payload\)/);
  assert.match(crudHook, /api\.resource\(resource\)\.update\(id\(\), payload\)/);
  assert.match(crudHook, /api\.resource\(resource\)\.remove\(id\(\)\)/);
  // resources.jsx wires the hook for the catalog resources: processes/goals/tools (and issues/agreements)
  // garden through ResourceCrudDialog with a `resource` prop threaded straight into useCrudDialogForm...
  assert.match(resources, /function ResourceCrudDialog\(\{ resource, item, open, onOpenChange, onSaved/);
  assert.match(resources, /useCrudDialogForm\(\{\s*resource, open, item, onOpenChange, onSaved/);
  for (const resource of ['processes', 'goals', 'tools']) assert.match(resources, new RegExp(`\\b${resource}:\\s*\\{`), `${resource} is missing from RESOURCE_CONFIG`);
  // ...and 'people' is wired explicitly via PersonCrudDialog.
  assert.match(resources, /function PersonCrudDialog\(/);
  assert.match(resources, /useCrudDialogForm\(\{\s*resource: 'people', open, item, onOpenChange, onSaved/);
  // misc.jsx (kbDocs) is wired through the shared hook, same as the resources.jsx dialogs above.
  assert.match(misc, /function KnowledgeDialog\(\{ open, item, folders, people = \[\], projects = \[\], onOpenChange, onSaved/);
  assert.match(misc, /useCrudDialogForm\(\{\s*resource: 'kbDocs', open, item, onOpenChange, onSaved/);
});

test('team cards retain original Garden identity and work context', () => {
  const resources = read('src/pages/resources.jsx');
  for (const token of ['roleWithGrade(person)','TeamAvailabilityBadge person={person}','localTimeLabel(person)','activeProjects.slice(0,2)','extraPersonTags(person)']) assert.ok(resources.includes(token), `${token} is missing from team cards`);
});

test('event plan is named and placed in Development rather than Knowledge', () => {
  const shell = read('src/components/app-shell.jsx');
  const development = shell.slice(shell.indexOf("label: 'Развитие'"), shell.indexOf("label: 'Знания'"));
  const knowledge = shell.slice(shell.indexOf("label: 'Знания'"), shell.indexOf("label: 'Управление'"));
  assert.ok(development.includes("'/technology', 'План мероприятий'"));
  assert.ok(!knowledge.includes("'/technology'"));
});

test('desktop sidebar stays fixed and Garden keyboard navigation is restored', () => {
  const shell = read('src/components/app-shell.jsx');
  assert.match(shell, /fixed inset-y-0 left-0 z-20 hidden md:block/);
  assert.match(shell, /md:ml-\[402px\]/);
  assert.match(shell, /event\.code === 'KeyK'/);
  assert.match(shell, /event\.code === 'Slash'/);
  assert.match(shell, /event\.code === 'KeyN'/);
  assert.match(shell, /event\.code === 'KeyG'/);
  assert.match(shell, /\['KeyW','\/weekly'\]/);
  assert.match(shell, /isEditable\(event\.target\)/);
});

test('sidebar search action is replaced by a persistent collapse control', () => {
  const shell = read('src/components/app-shell.jsx');
  assert.ok(shell.includes('ChevronsLeft') && shell.includes('ChevronsRight'));
  assert.match(shell, /garden:sidebar-collapsed/);
  assert.match(shell, /setSidebarCollapsed/);
  assert.match(shell, /md:ml-\[64px\]/);
});

test('issues, processes and agreements use a compact list presentation', () => {
  const resources = read('src/pages/resources.jsx');
  assert.ok(resources.includes("['issues','processes','agreements'].includes(resource)"));
  assert.ok(resources.includes('function ResourceList('));
  assert.ok(resources.includes('function ResourceListRow('));
});

test('team cards omit workload summary and edit icon while preserving edit on profile', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('function TeamCard(');
  const end = resources.indexOf('function StakeholderRow(', start);
  const card = resources.slice(start, end);
  assert.ok(!card.includes('Проектная загрузка'));
  assert.ok(!card.includes('Pencil'));
  assert.ok(!card.includes('onEdit'));
  assert.ok(resources.includes('onSelect={()=>setEditOpen(true)}><Pencil className="h-4 w-4"/>Редактировать</DropdownMenuItem>'));
});

test('project detail page replaces Редактировать with a ⋯ menu offering archive, history and delete', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('export function ProjectDetailPage(');
  const end = resources.indexOf('\nfunction ProjectCrudDialog(');
  const page = resources.slice(start, end);
  assert.match(page, /aria-label="Действия"/);
  assert.match(page, /Архивировать проект/);
  assert.match(page, /Восстановить из архива/);
  assert.match(page, /История версий/);
  assert.match(page, /entityType="projects"/);
  assert.doesNotMatch(page, /Редактировать/);
  assert.match(page, /<ProjectStatusIcon/);
  assert.match(page, /InlineProjectKeyEditor/);
  // Описание and Контекст are sequential sections (like Мастерская's WorkshopDetailPage),
  // not switchable top-level tabs - only Контекст has its own (sub-tab) Tabs underneath it.
  assert.match(page, /<SectionHeader title="Описание"/);
  assert.match(page, /<SectionHeader title="Контекст"/);
  assert.match(page, /task-detail-workspace-grid/);
  assert.match(page, /task-properties-column/);
  assert.match(page, /ariaLabel="Разделы проекта"/);
  assert.doesNotMatch(page, /pageTab/);
});

test('project context tab covers team, active sorted tasks, open issues, links and embedded notes', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('export function ProjectDetailPage(');
  const end = resources.indexOf('\nfunction ProjectCrudDialog(');
  const page = resources.slice(start, end);
  for (const label of ["'team', 'Команда'", "'tasks', 'Задачи'", "'issues', 'Проблемы'", "'links', 'Ссылки'", "'notes', 'Заметки'"]) {
    assert.ok(page.includes(label), `${label} context sub-tab is missing`);
  }
  assert.match(page, /!task\.archivedAt && task\.status !== 'done'/);
  assert.match(resources, /rankTasksByPriority/);
  assert.match(page, /issue\.status !== 'resolved'/);
  assert.match(page, /entityType="project"/);
  assert.match(page, /<StickyNotes/);
  assert.doesNotMatch(page, /title="Цели"/);
  assert.doesNotMatch(page, /goalProgress|goals\.length/);
});

test('project create dialog no longer carries dead edit/delete code paths', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('function ProjectCrudDialog(');
  const end = resources.indexOf('function ProjectLoadDialog(');
  const dialog = resources.slice(start, end);
  assert.match(dialog, /function ProjectCrudDialog\(\{ open, onOpenChange, onSaved, people = \[\], projects = \[\] \}\)/);
  assert.doesNotMatch(dialog, /isEdit/);
  assert.doesNotMatch(dialog, /Удалить проект/);
  assert.doesNotMatch(dialog, /AlertDialog/);
  assert.match(dialog, /<DialogTitle>Новый проект<\/DialogTitle>/);
  assert.doesNotMatch(resources, /<ProjectCrudDialog[^>]*project=/);
});

test('task status is a Garden-style clickable icon and the first attribute in task rows', () => {
  const status = read('src/components/status.jsx');
  const tasks = read('src/pages/tasks.jsx');
  const home = read('src/pages/home.jsx');
  const resources = read('src/pages/resources.jsx');
  const assistant = read('src/components/assistant.jsx');
  const search = read('src/pages/misc.jsx');
  assert.match(status, /export function TaskStatusIcon/);
  for (const symbol of ["in_progress: '◐'", "in_review: '◎'", "paused: 'Ⅱ'", "blocked: '×'", "done: '✓'"]) assert.ok(status.includes(symbol), `${symbol} is missing`);
  assert.match(status, /resource="tasks"/);
  const useEntityStatusHook = read('src/hooks/use-entity-status.js');
  assert.match(useEntityStatusHook, /api\.resource\(resource\)\.update\(id, \{ status: next \}\)/);
  const rows = read('src/components/entity-row.jsx');
  assert.match(tasks, /<TaskEntityRow/);
  assert.match(rows, /<TaskStatusIcon/);
  assert.match(rows, /className=\"things-task-status\"/);
  assert.match(home, /<TaskEntityRow/);
  assert.match(resources, /<TaskList/);
  assert.match(assistant, /return <TaskStatusIcon taskId=\{item\.entityId\}/);
  assert.match(search, /group==='tasks'&&<TaskStatusIcon task=\{item\}\/\>/);
  assert.doesNotMatch(tasks, /<StatusBadge value=\{task\.(?:archivedAt|status)/);
});

test('project status is a Garden-style clickable icon, like task/issue/process status', () => {
  const status = read('src/components/status.jsx');
  assert.match(status, /export function ProjectStatusIcon/);
  assert.match(status, /resource="projects"/);
  assert.match(status, /PROJECT_TO_TASK_STATUS/);
});

test('idea and workshop-project status is a Garden-style clickable icon in the list row', () => {
  const status = read('src/components/status.jsx');
  const workspace = read('src/pages/workspace.jsx');
  assert.match(status, /export function IdeaStatusIcon/);
  assert.match(status, /export function LabStatusIcon/);
  const listRowStart = workspace.indexOf('function LabListRow(');
  const listRowEnd = workspace.indexOf('\n}', listRowStart);
  const listRow = workspace.slice(listRowStart, listRowEnd);
  assert.match(listRow, /leading=\{isIdea \? <IdeaStatusIcon/);
  assert.doesNotMatch(listRow, /<StatusBadge/);
  assert.match(workspace, /<LabListRow key=\{item\.id\}[\s\S]*?onStatusChanged=\{state\.reload\}/);
});

test('calendar restores Garden event types and per-type filters', () => {
  const operations = read('src/pages/operations.jsx');
  for (const label of ['Встречи','Дни рождения','Отпуска','Больничные','Отгулы']) assert.ok(operations.includes(label), `${label} calendar type missing`);
  for (const key of ["'meeting'","'birthday'","'vacation'","'sick'","'dayoff'"]) assert.ok(operations.includes(key), `${key} calendar key missing`);
  assert.match(operations, /aria-label="Фильтр типов событий"/);
  assert.match(operations, /localStorage\.setItem\(CALENDAR_FILTER_STORAGE/);
  assert.doesNotMatch(operations.slice(operations.indexOf('export function CalendarPage()'), operations.indexOf('function dateKey(date)')), /tasksDue/);
});

test('assistant autocomplete and inline statuses preserve Garden interaction parity', () => {
  const assistant = read('src/components/assistant.jsx');
  const status = read('src/components/status.jsx');
  assert.match(assistant, /PERSON_SLOT_MARKERS/);
  assert.match(assistant, /PROJECT_SLOT_MARKERS/);
  assert.match(assistant, /CREATE_PREFIXES/);
  assert.doesNotMatch(assistant, /highlightedQueryParts/);
  assert.match(assistant, /IssueStatusIcon/);
  assert.match(assistant, /AgreementStatusIcon/);
  assert.doesNotMatch(assistant, /return <select value=\{item\.status/);
  assert.match(status, /export function AgreementStatusIcon/);
});


test('entity rows are shared across pages, assistant and detail tabs', () => {
  const rows = read('src/components/entity-row.jsx');
  const tasks = read('src/pages/tasks.jsx');
  const meetings = read('src/pages/operations.jsx');
  const assistant = read('src/components/assistant.jsx');
  const resources = read('src/pages/resources.jsx');
  const workspace = read('src/pages/workspace.jsx');
  assert.match(rows, /export function EntityRow/);
  assert.match(rows, /export function TaskEntityRow/);
  assert.match(rows, /export function MeetingEntityRow/);
  assert.match(tasks, /<TaskEntityRow/);
  assert.match(meetings, /<MeetingEntityRow/);
  assert.match(assistant, /<TaskEntityRow/);
  assert.match(assistant, /<EntityRow/);
  assert.match(resources, /<TaskList/);
  assert.match(resources, /<MeetingList/);
  assert.match(resources, /<EntityRow/);
  assert.match(workspace, /<EntityRow/);
});

test('detail pages share the task-detail visual shell', () => {
  const page = read('src/components/page.jsx');
  const resources = read('src/pages/resources.jsx');
  const workspace = read('src/pages/workspace.jsx');
  const operations = read('src/pages/operations.jsx');
  assert.match(page, /export function DetailHeader/);
  assert.match(page, /export function DetailLayout/);
  assert.match(page, /export function DetailAsideField/);
  for (const source of [resources, operations]) {
    assert.match(source, /DetailHeader/);
    assert.match(source, /DetailLayout/);
  }
  // Мастерская's detail page moved to the newer task-detail shell (Свойства column + "⋯" menu)
  // instead of DetailHeader/DetailLayout — verify that shell directly rather than the older pattern.
  assert.match(workspace, /task-properties-column/);
  assert.match(workspace, /aria-label="Действия"/);
  for (const name of ['Проблемы','Процессы','Договорённости','Цели','Проекты']) assert.ok(resources.includes(name));
  assert.ok(workspace.includes('Мастерская'));
  assert.ok(operations.includes('Встречи'));
});

test('task rows use avatar assignees, Linear-style priority and omit empty due dates', () => {
  const entityRow = read('src/components/entity-row.jsx');
  assert.match(entityRow, /TaskPriorityIcon/);
  assert.match(entityRow, /task-linear-priority/);
  assert.match(entityRow, /<Avatar person=\{assignee\} size="xs"\/>/);
  assert.match(entityRow, /task\.dueDate \? formatEventDate\(task\.dueDate\) : ''/);
  assert.doesNotMatch(entityRow, /effectiveProject \|\| null,\s*assignee \|\| null/);
});

test('issue and process rows follow the task-row visual language', () => {
  const resources = read('src/pages/resources.jsx');
  const assistant = read('src/components/assistant.jsx');
  const status = read('src/components/status.jsx');
  assert.match(resources, /TaskPriorityIcon priority=\{item\.severity === 'high' \? 'high' : 'normal'\}/);
  assert.match(resources, /resource === 'processes'[\s\S]*?<ProcessStatusIcon process=\{item\}/);
  assert.doesNotMatch(resources.slice(resources.indexOf('function ResourceListRow('), resources.indexOf('function ResourceCard(')), /item\.description|currentBehavior \|\| item\.expectedBehavior/);
  assert.match(assistant, /item\.entityType === 'issue'[\s\S]*?TaskPriorityIcon/);
  assert.match(status, /export function ProcessStatusIcon/);
});

test('issue detail separates description and managed solution options with icon statuses', () => {
  const resources = read('src/pages/resources.jsx');
  const status = read('src/components/status.jsx');
  assert.match(resources, /resource==='issues'[\s\S]*?<InlineIssueField[\s\S]*?item\.description/);
  assert.doesNotMatch(resources, /resource==='issues'&&<>\s*<Section title="Описание"/);
  assert.match(resources, /<IssueSolutionsSection issue=\{item\}/);
  assert.match(resources, /title="Варианты решения"/);
  assert.match(resources, /Добавить вариант/);
  assert.match(resources, /<SolutionStatusIcon value=\{option\.status\}/);
  assert.match(resources, /api\.resource\(resource\)\.update\(item\.id, \{ \[field\]: next \}\)/);
  assert.match(resources, /<SolutionOptionsSection resource="issues" item=\{issue\} field="solutionOptions"/);
  for (const label of ['Эффективно','Неэффективно','Не проверялось']) assert.ok(status.includes(label), `${label} solution status missing`);
});

test('task detail uses shared tabs and the shared sticky-notes detail sidebar', () => {
  const tasks = read('src/pages/tasks.jsx');
  const patterns = read('src/components/patterns.jsx');
  const sidebar = read('src/components/detail-sidebar.jsx');
  const sticky = read('src/components/sticky-notes.jsx');
  assert.match(tasks, /<Tabs[\s\S]*?ariaLabel="Разделы задачи"/);
  for (const label of ['План','Ссылки','Связи','Обсуждение']) assert.ok(tasks.includes(`label:'${label}'`), `${label} tab missing`);
  assert.match(tasks, /planItems/);
  assert.match(tasks, /dropPlanItem/);
  assert.match(tasks, /<DetailSidebar/);
  assert.match(tasks, /<StickyNotes/);
  assert.match(patterns, /export function Tabs/);
  assert.match(sidebar, /detail-sidebar-drawer/);
  assert.match(sticky, /sticky-note-card/);
  // Plain-input redesign: no more colored card variants or bold/italic formatting.
  assert.doesNotMatch(sticky, /is-\$\{noteColor/);
  assert.doesNotMatch(sticky, /cycleColor/);
  assert.doesNotMatch(sticky, /sticky-note-formatbar/);
  assert.doesNotMatch(sticky, /from 'lucide-react'.*\bBold\b/s);
  assert.doesNotMatch(sticky, /color:\s*noteColor/);
  assert.doesNotMatch(sticky, /sticky-note-head/);
  assert.match(sticky, /sticky-note-corner-actions/);
  assert.match(sticky, /sticky-note-expand/);
  assert.match(sticky, /Maximize2/);
  assert.match(sticky, /expandedId/);
  assert.match(sticky, /<Dialog /);
});

test('team availability reflects workday and absences instead of always saying active', () => {
  const resources = read('src/pages/resources.jsx');
  const utils = read('src/lib/utils.js');
  for (const token of ['Рабочий день закончен','На больничном','В отпуске']) assert.ok(utils.includes(token), `${token} is missing from the teamAvailability helper`);
  assert.ok(resources.includes('teamAvailability(person, vacations)'), 'resources.jsx should call the shared teamAvailability helper');
});

test('sidebar items support favorite toggling from a right-click context menu', () => {
  const shell = read('src/components/app-shell.jsx');
  for (const token of ['onContextMenu={onContextMenu}','openMenuContext','Добавить в избранное','Убрать из избранного','favoriteMenuItems']) assert.ok(shell.includes(token), `${token} is missing from sidebar favorite context menu`);
});

test('task detail keeps secondary attributes in the compact metadata rail', () => {
  const tasks = read('src/pages/tasks.jsx');
  const css = read('src/styles.css');
  assert.ok(tasks.includes('task-meta-compact'));
  assert.ok(css.includes('task-detail-secondary-meta { display:none !important; }'));
  assert.ok(css.includes('max-width:860px'));
});


test('assistant keeps encouragement after answers, aligns avatars and uses date-only journal rows', () => {
  const assistant = read('src/components/assistant.jsx');
  const styles = read('src/styles.css');
  const utils = read('src/lib/utils.js');
  assert.match(assistant, /const \[greeting\] = React\.useState\(currentGreeting\)/);
  assert.match(assistant, /\{greeting\}<\/span><\/div>/);
  assert.match(assistant, /group === 'journal'[\s\S]*includeTime: false/);
  assert.match(assistant, /group === 'journal' && 'assistant-journal-row'/);
  assert.match(styles, /\.assistant-text-row \{[\s\S]*min-height: 48px;[\s\S]*padding-top: 0 !important;[\s\S]*padding-bottom: 0 !important;/);
  assert.match(styles, /\.unified-entity-row-trailing \{ grid-column: 4; \}/);
  assert.match(styles, /\.assistant-journal-row \.unified-entity-row-title[\s\S]*max-width: 620px/);
  assert.match(utils, /diffDays === -1 \? 'Вчера'/);
  assert.match(utils, /diffDays === 0 \? 'Сегодня'/);
  assert.match(utils, /diffDays === 1 \? 'Завтра'/);
});
