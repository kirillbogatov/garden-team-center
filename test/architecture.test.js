'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function files(dir, ext = '.jsx') {
  const root = path.join(ROOT, dir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...files(path.join(dir, name), ext));
    else if (name.endsWith(ext)) out.push(path.join(dir, name));
  }
  return out;
}

test('client is React/Vite rather than the legacy vanilla bundle', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies.react);
  assert.ok(pkg.dependencies['react-dom']);
  assert.ok(pkg.devDependencies.vite);
  assert.match(read('src/main.jsx'), /createRoot/);
  assert.match(read('src/app.jsx'), /BrowserRouter/);
  assert.equal(fs.existsSync(path.join(ROOT, 'public/js/app.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'public/css/system.css')), false);
});

test('shared UI primitives are Radix-backed and shadcn-style', () => {
  const ui = read('src/components/ui.jsx');
  for (const primitive of ['react-avatar','react-dialog','react-dropdown-menu','react-select','react-tooltip','react-switch']) {
    assert.match(ui, new RegExp(`@radix-ui/${primitive}`));
  }
  assert.match(ui, /class-variance-authority/);
  assert.match(read('src/lib/utils.js'), /tailwind-merge/);
  assert.match(ui, /buttonVariants/);
});

test('all product routes render through the React application shell', () => {
  const app = read('src/app.jsx');
  for (const route of ['/tasks','/meetings','/calendar','/team','/stakeholders','/people','/projects','/ideas','/workshop','/goals','/knowledge','/settings']) {
    assert.ok(app.includes(`path="${route}"`), `${route} is not declared`);
  }
  assert.match(app, /<AppShell/);
  assert.match(app, /<Navigate to="\/workshop"/);
});

test('navigation labels use Мастерская and keep ideas separate', () => {
  const shell = read('src/components/app-shell.jsx');
  assert.match(shell, /\['\/ideas', 'Идеи'/);
  assert.match(shell, /\['\/workshop', 'Мастерская'/);
  assert.equal(shell.includes("'The Labs'"), false);
});

test('task detail exposes the primary metadata directly under the title', () => {
  const tasks = read('src/pages/tasks.jsx');
  assert.match(tasks, /<TaskStatusIcon task=\{task\}/);
  assert.match(tasks, /task\.dueDate/);
  assert.match(tasks, /task\.projectId/);
  assert.match(tasks, /task\.assigneeIds/);
});

test('server bootstrap stays thin and domain workflows remain extracted', () => {
  const index = read('server/index.js');
  assert.ok(index.split('\n').length <= 250, `server/index.js grew to ${index.split('\n').length} lines`);
  assert.match(index, /createRecurringMeetings/);
  assert.match(index, /createTaskAutoArchive/);
  assert.match(index, /createTeamleadSync/);
});

test('generic CRUD routes remain adapters backed by the application service', () => {
  const crud = read('server/routes/crud.js');
  const resources = read('server/application/resource-service.js');
  assert.match(crud, /createResourceService/);
  assert.doesNotMatch(crud, /db\.[a-zA-Z]/);
  assert.match(resources, /db\.transaction\(\(\) =>/);
});

test('client uses one icon system', () => {
  const client = files('src').map((file) => read(file)).join('\n');
  assert.match(client, /lucide-react/);
  assert.equal(client.includes('@tabler/icons'), false);
  // Inline <svg> is allowed only for brand artwork and the assistant wave glyph.
  const allowed = ['brand.jsx', 'assistant.jsx'];
  const stray = files('src').filter((file) => !allowed.some((ok) => file.endsWith(ok)) && read(file).includes('<svg'));
  assert.deepEqual(stray, []);
});

test('technology route restores the Garden event-planning workflow', () => {
  const app = read('src/app.jsx');
  const technology = read('src/pages/technology.jsx');
  assert.match(app, /path="\/technology" element=\{<TechnologyPage user=\{user\}\/>\}/);
  for (const feature of [
    'План мероприятий', 'Добавить мероприятие', 'Плановая дата', 'Тайминг, ч',
    'Драйвер / гость', 'Проведено', 'Запланировать встречу', 'Экспорт',
  ]) assert.ok(technology.includes(feature), `${feature} is missing from TechnologyPage`);
  assert.match(technology, /sourceTechnologyEventId/);
  assert.match(technology, /technologyEvents/);
  assert.match(technology, /downloadTable/);
});

test('technology export keeps the original offline XLSX, CSV and Markdown formats', () => {
  const exporter = read('src/lib/tabular-export.js');
  assert.match(exporter, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(exporter, /text\/csv/);
  assert.match(exporter, /text\/markdown/);
  assert.match(exporter, /zipStore/);
});

test('core entities expose stable public identifiers and standalone detail routes', () => {
  const app = read('src/app.jsx');
  for (const route of ['/issues/:id','/processes/:id','/agreements/:id','/goals/:goalKey','/tools/:id','/meetings/:id','/workshop/:id']) {
    assert.ok(app.includes(`path="${route}"`), `${route} detail route is not declared`);
  }
  const identifiers = read('server/entity-identifiers.js');
  for (const pair of [
    ['issueKey','ISSUE'], ['processKey','PROCESS'], ['agreementKey','AGREE'], ['goalKey','GOAL'],
    ['noteKey','NOTE'], ['toolKey','TOOL'], ['meetingKey','MEET'], ['ideaKey','IDEA'], ['blueprintKey','BLUEPRINT'],
  ]) {
    assert.ok(identifiers.includes(pair[0]), `${pair[0]} is missing`);
    assert.ok(identifiers.includes(pair[1]), `${pair[1]} prefix is missing`);
  }
  assert.match(identifiers, /projectKey/);
});

test('database writes preserve attributes the React client does not render', () => {
  const database = read('server/db.js');
  assert.match(database, /Object\.assign\(\{\}, current, patch/);
  assert.doesNotMatch(database, /delete\s+merged\.(startDate|color|kind|issueId|agreementId|labId)/);
  const resources = read('server/application/resource-service.js');
  assert.doesNotMatch(resources, /normalizeJournalModel|normalizeProjectModel|normalizeWorkspaceIdentifiers/);
});


test('task detail supports wrapping title, inline status metadata, relations and archive action', () => {
  const tasks = read('src/pages/tasks.jsx');
  const styles = read('src/styles.css');
  assert.match(tasks, /TaskTitleEditor/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(tasks, /Добавить связь/);
  assert.match(tasks, /jiraLinks/);
  assert.match(tasks, /goalKeys/);
  assert.match(tasks, /Архивировать задачу/);
  assert.match(tasks, /Восстановить из архива/);
});

test('tasks use four flat views and text-like sentence filters', () => {
  const tasks = read('src/pages/tasks.jsx');
  const styles = read('src/styles.css');
  for (const label of ['Фокус на день', 'Мои задачи', 'Задачи команды', 'Технологизация']) {
    assert.ok(tasks.includes(`label="${label}"`), `${label} task view is missing`);
  }
  assert.doesNotMatch(tasks, /tasks-view-section-title">Мои задачи/);
  assert.doesNotMatch(tasks, /tasks-view-section-title">Задачи команды/);
  assert.match(styles, /\.tasks-filter-word[\s\S]*font-weight:\s*700\s*!important/);
  assert.match(styles, /\.tasks-filter-word[\s\S]*text-decoration-line:\s*underline/);
});
