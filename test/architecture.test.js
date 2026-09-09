'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function jsFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const full = path.join(ROOT, dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...jsFiles(path.join(dir, name)));
    else if (name.endsWith('.js')) out.push(path.join(dir, name));
  }
  return out;
}

test('views are lazy-loaded modules rather than eager script tags', () => {
  const html = read('public/index.html');
  assert.equal(/<script[^>]+src=["']js\/views\//.test(html), false);
  const loader = read('public/js/lib/view-loader.js');
  assert.match(loader, /import\(url\.href\)/);
  assert.equal(loader.includes('VIEW_DEPENDENCIES'), false);
});

test('task create form is schema-driven and keeps edit-only relations out of create', () => {
  const tasks = read('public/js/views/tasks.js');
  const start = tasks.indexOf('async function openTaskCreateModal');
  const end = tasks.indexOf('function taskDebounce', start);
  const block = tasks.slice(start, end);
  assert.match(block, /EntityForm\.open/);
  assert.match(block, /create:\s*false/);
  assert.match(block, /type:\s*'people'/);
  assert.equal(block.includes('tf-title'), false);
});

test('views use resource facade for standard CRUD instead of duplicating base URLs', () => {
  const allowedSpecial = new Set(['admin.js', 'settings.js', 'search.js']);
  for (const file of jsFiles('public/js/views')) {
    const name = path.basename(file);
    if (allowedSpecial.has(name)) continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const matches = source.match(/api\.(?:get|post|put|del)\(['"]\/api\/(tasks|labs|projects|goals|issues|meetings|people|agreements|journal|documents|tools|processes|vacations)(?:['"/])/g) || [];
    assert.equal(matches.length, 0, `${name} still contains direct standard CRUD calls: ${matches.join(', ')}`);
  }
});

test('shared relation and comment facades exist', () => {
  assert.match(read('public/js/lib/relations.js'), /const Relations/);
  assert.match(read('public/js/lib/services.js'), /const Comments/);
  assert.match(read('server/routes/comments.js'), /\/api\/comments\/:entityType\/:entityId/);
});

test('generated UI has no inline onclick attributes', () => {
  for (const file of [...jsFiles('public/js'), 'public/index.html']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(/onclick\s*=\s*["']/.test(source), false, `${file} contains an inline onclick attribute`);
  }
});

test('domain labels live in one constants module loaded before utility code', () => {
  const html = read('public/index.html');
  assert.ok(html.indexOf('js/domain/constants.js') < html.indexOf('js/lib/util.js'));
  const constants = read('public/js/domain/constants.js');
  for (const name of ['TASK_STATUS_LABEL', 'LAB_STATUS_LABEL', 'PROJECT_STATUS_LABEL', 'GOAL_STATUS_LABEL']) assert.match(constants, new RegExp(`const ${name}`));
  assert.equal(read('public/js/lib/util.js').includes('const TASK_STATUS_LABEL'), false);
});

test('common goal and agreement forms are schema-driven', () => {
  assert.match(read('public/js/views/goals.js'), /function openGoalModal[\s\S]*?EntityForm\.open/);
  assert.match(read('public/js/views/agreements.js'), /function openAgreementModal[\s\S]*?EntityForm\.open/);
});

test('server bootstrap stays thin and domain workflows are extracted', () => {
  const index = read('server/index.js');
  assert.ok(index.split('\n').length <= 250, `server/index.js grew to ${index.split('\n').length} lines`);
  assert.match(index, /createRecurringMeetings/);
  assert.match(read('server/domain/recurring-meetings.js'), /syncRecurringMeetingsForPerson/);

  // Task lifecycle, auto-archive, knowledge-base sanitization and teamlead self-assignment
  // sync used to be defined inline in index.js — they belong in server/domain/ instead
  // (ARCHITECTURE.md rule 9: index.js is composition/bootstrap, not business workflows).
  assert.match(index, /require\('\.\/domain\/task-lifecycle'\)/);
  assert.match(index, /createTaskAutoArchive/);
  assert.match(index, /require\('\.\/domain\/knowledge-sanitize'\)/);
  assert.match(index, /createTeamleadSync/);
  assert.match(read('server/domain/task-lifecycle.js'), /function taskLifecyclePatch/);
  assert.match(read('server/domain/task-auto-archive.js'), /function autoArchiveCompletedTasks/);
  assert.match(read('server/domain/knowledge-sanitize.js'), /function sanitizeKnowledgeHtmlServer/);
  assert.match(read('server/domain/teamlead-sync.js'), /function ensureTeamleadSelfAssignment/);
});


test('legacy HTTP and UI compatibility layers are removed', () => {
  const comments = read('server/routes/comments.js');
  const collaboration = read('server/routes/collaboration.js');
  const services = read('public/js/lib/services.js');
  const commentUi = read('public/js/lib/comments.js');
  assert.equal(comments.includes('/api/labs/:id/comments'), false);
  assert.equal(comments.includes('/api/task-comments/:id'), false);
  assert.equal(collaboration.includes("'/api/tasks/:id/personal-note'"), false);
  assert.equal(services.includes('/personal-note`'), false);
  assert.equal(commentUi.includes('bindCommentComposer'), false);
  assert.equal(commentUi.includes('renderCommentThread'), false);
});

test('calendar uses the shared action registry instead of a dedicated global callback registry', () => {
  const calendar = read('public/js/views/calendar.js');
  assert.equal(calendar.includes('__calGo'), false);
  assert.equal(calendar.includes('evGoRegistry'), false);
  assert.match(calendar, /registerAction\(/);
});


test('legacy data migrations are absent from runtime storage', () => {
  const db = read('server/db.js');
  const crud = read('server/routes/crud.js');
  assert.equal(/\n\s*'taskComments',/.test(db), false);
  assert.equal(/\n\s*'labComments',/.test(db), false);
  assert.equal(crud.includes('db.taskComments'), false);
  assert.equal(crud.includes('db.labComments'), false);
  assert.match(crud, /db\.comments\.related\(`task:/);
  assert.match(crud, /db\.comments\.related\(`lab:/);
  assert.equal(db.includes('ALTER TABLE records ADD COLUMN'), false);
  assert.equal(db.includes('migrateUnifiedComments'), false);
  assert.equal(db.includes('legacyWorkspaceRows'), false);
  assert.equal(db.includes('GLAB-'), false);
});

test('view-local state is not leaked onto window unnecessarily', () => {
  assert.equal(read('public/js/views/knowledge-base.js').includes('window._kbFolderNameMap'), false);
  const app = read('public/js/app.js');
  assert.equal(app.includes('window.GardenSettings'), false);
  assert.equal(app.includes('window.GARDEN_NAV_GROUPS'), false);
  assert.equal(app.includes('window.toggleNavSection'), false);
});


test('lazy feature communication uses FeatureLoader instead of window globals', () => {
  const loader = read('public/js/lib/view-loader.js');
  assert.match(loader, /register\(commands\)/);
  assert.match(loader, /async run\(name, \.\.\.args\)/);
  assert.equal(loader.includes('window[actionName]'), false);
  for (const file of jsFiles('public/js/views')) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(/Object\.assign\(window/.test(source), false, `${file} exports commands through window`);
  }
});

test('task and Labs detail pages use autosave without legacy save footers', () => {
  const tasks = read('public/js/views/tasks.js');
  const labs = read('public/js/views/labs.js');
  assert.doesNotMatch(tasks, /id=["']tf-save["']/);
  assert.doesNotMatch(labs, /id=["']lab-detail-save["']/);
  assert.match(tasks, /createAutosave\(/);
  assert.match(labs, /createAutosave\(/);
});

test('version history is shared by tasks and Labs projects', () => {
  const index = read('public/index.html');
  const versions = read('public/js/lib/version-history.js');
  assert.match(index, /js\/lib\/version-history\.js/);
  assert.match(versions, /Versions\.restore/);
  assert.match(versions, /Versions\.remove/);
  assert.match(versions, /data-version-delete/);
});

test('settings view references the current NAV_GROUPS constant, not the removed global', () => {
  // Регрессия: после удаления window.GARDEN_NAV_GROUPS (см. тест выше про view-local
  // state) settings.js остался со ссылкой на старое имя и падал с ReferenceError на
  // каждом заходе в /settings. NAV_GROUPS объявлен как обычная переменная в app.js
  // и виден settings.js как классическому <script>, без window.* моста.
  const settings = read('public/js/views/settings.js');
  assert.equal(settings.includes('GARDEN_NAV_GROUPS'), false);
  assert.match(settings, /\bNAV_GROUPS\b/);
});

test('meeting type label always falls back instead of leaking "undefined" into markup', () => {
  const meetings = read('public/js/views/meetings.js');
  assert.equal(/MEETING_TYPE_LABEL\[[^\]]+\]\s*\}/.test(meetings), false, 'MEETING_TYPE_LABEL lookup without a || fallback would render "undefined" for unrecognized meeting types');
});

test('avatar photo has a delegated error fallback to initials', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  assert.match(entityUi, /data-avatar-fallback-text/);
  const interactions = read('public/js/lib/interactions.js');
  assert.match(interactions, /addEventListener\('error'/);
});

test('title-edit DOM refs are re-declared in every canEdit block that uses them (tasks.js)', () => {
  // Регрессия: titleShell/titleDisplay/titleInput были объявлены как const внутри
  // ПЕРВОГО `if (canEdit) { ... }`, а второй, отдельный `if (canEdit) { ... }` (со
  // save/autosave-обвязкой) читал те же имена без собственного объявления — блочная
  // область видимости JS такое не пробрасывает, и открытие любой редактируемой задачи
  // падало с ReferenceError: titleInput is not defined.
  const tasks = read('public/js/views/tasks.js');
  const idx = tasks.indexOf("titleShell.classList.remove('is-editing')");
  assert.notEqual(idx, -1, 'expected to find the Enter-to-commit title handler in tasks.js');
  const preceding = tasks.slice(Math.max(0, idx - 1500), idx);
  assert.match(preceding, /const titleShell\s*=\s*document\.getElementById\('tf-title-shell'\)/);
  assert.match(preceding, /const titleDisplay\s*=\s*document\.getElementById\('tf-title-display'\)/);
  assert.match(preceding, /const titleInput\s*=\s*document\.getElementById\('tf-title'\)/);
});

test('index.html references assets with root-absolute paths, not relative ones', () => {
  // Регрессия: относительные href/src (`css/style.css`, `js/lib/icons.js`, ...) резолвятся
  // от текущего URL страницы. Поскольку index.html отдаётся по SPA-фоллбэку на любом
  // вложенном маршруте (/tasks/:key, /labs/:id, ...), браузер пытался грузить
  // /tasks/css/style.css и получал 404 — жёсткая перезагрузка или прямой заход по
  // ссылке на вложенный маршрут давали полностью пустую страницу.
  const html = read('public/index.html');
  const relativeLinkOrScript = /(?:href|src)=["'](?!https?:|\/|#|data:|mailto:)[^"']+\.(?:css|js)["']/;
  assert.equal(relativeLinkOrScript.test(html), false, 'index.html has a relative css/js href or src that will 404 on nested routes');
});

test('detail textareas commit on Enter and keep Shift+Enter for new lines', () => {
  const detail = read('public/js/lib/detail-page.js');
  const tasks = read('public/js/views/tasks.js');
  const labs = read('public/js/views/labs.js');
  assert.match(detail, /function bindDetailCommitOnEnter/);
  assert.match(detail, /event\.shiftKey/);
  assert.match(tasks, /bindDetailCommitOnEnter\(descriptionField/);
  assert.match(labs, /bindDetailCommitOnEnter\(descriptionField/);
  assert.match(labs, /bindLabLinksEditor\('lab-detail-links'/);
});

test('task notes drawer does not default to open below the overlay breakpoint (tasks.js)', () => {
  // Регрессия: setNotesDrawerOpen(true) вызывался безусловно при каждом открытии
  // задачи. На десктопе панель заметок сдвигает контент через margin-right, но
  // ниже 940px (см. detail-page.css "@media (max-width: 940px)") она становится
  // fixed-оверлеем на весь экран — то есть на телефоне пользователь при каждом
  // открытии задачи сначала видел на весь экран пустую панель заметок, а не саму
  // задачу.
  const tasks = read('public/js/views/tasks.js');
  assert.doesNotMatch(tasks, /setNotesDrawerOpen\(true\)/);
  assert.match(tasks, /setNotesDrawerOpen\(window\.innerWidth > 940\)/);
});

test('short task descriptions do not get a min-height taller than the JS auto-resize floor (detail-page.css)', () => {
  // Регрессия: CSS задавал min-height: 92px для textarea описания, тогда как
  // resizeTaskDescription() в tasks.js сам держит пол в 52px (Math.max(scrollHeight, 52)).
  // Разница создавала пустой "воздух" под короткими однострочными описаниями.
  const css = read('public/css/detail-page.css');
  const match = css.match(/\.task-detail-description-section \.task-detail-description \{\s*[^}]*min-height:\s*(\d+)px/);
  assert.ok(match, 'expected a min-height rule for .task-detail-description-section .task-detail-description');
  assert.equal(Number(match[1]), 52);
});

test('description field uses the shared calm field focus ring, details-grid fields keep their native outline suppressed (detail-page.css)', () => {
  const css = read('public/css/detail-page.css');
  assert.match(css, /\.task-inline-edit-description \.task-detail-description:focus\s*\{[^}]*outline:\s*1px solid var\(--field-focus-ring/);
  // The details grid suppresses the native control outline; the shared page-level
  // focus-visible rule supplies the same ring color to all editable fields.
  assert.match(css, /\.task-detail-property \.task-inline-edit input,\s*\n\.task-detail-property \.task-inline-edit select \{[^}]*outline:\s*0 !important/);
  const globalCss = read('public/css/style.css');
  assert.match(globalCss, /--field-focus-ring:\s*color-mix/);
  assert.match(globalCss, /input:focus-visible, textarea:focus-visible, select:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--field-focus-ring\)/);
});

test('project chip keeps its ellipsis visible when truncated on narrow screens (system.css)', () => {
  // Регрессия: .task-labels-group задаёт flex-wrap, поэтому project-chip (inline-flex)
  // блокифицируется в `flex` как flex-item — text-overflow: ellipsis для такого элемента
  // не рисует "…", текст просто обрывается без визуальной подсказки, что он обрезан.
  // inline-block блокифицируется в обычный `block` и возвращает стандартное поведение
  // однострочного текста с ellipsis.
  const css = read('public/css/system.css');
  const match = css.match(/\.task-labels-group \.ui-tag--project,\s*\n\s*\.task-labels-group \.project-chip \{([^}]*)\}/);
  assert.ok(match, 'expected the narrow-screen .project-chip truncation rule in system.css');
  assert.match(match[1], /display:\s*inline-block\s*!important/);
});

test('meetings get their own addressable MEET-XXXX instances, mirroring tasks (entity-identifiers.js, entity-keys.js)', () => {
  const identifiers = read('server/entity-identifiers.js');
  assert.match(identifiers, /function nextMeetingKey\(\)/);
  assert.match(identifiers, /prefix:\s*'MEET'/);
  assert.match(identifiers, /function ensureMeetingKeys\(\)/);
  // resolveEntity must accept a MEET-XXXX key the same way it accepts task/lab keys.
  assert.match(identifiers, /if \(name === 'meetings'\) \{/);
});

test('meeting context drawer does not default to open below the overlay breakpoint (meetings.js)', () => {
  // Та же регрессия, что и для панели заметок в задачах (см. тест выше для
  // tasks.js): ниже 940px detail-page.css превращает .task-detail-side в
  // fixed-оверлей на весь экран, поэтому раскрывать его по умолчанию на
  // телефоне нельзя — сначала видно только пустую панель, а не встречу.
  const meetings = read('public/js/views/meetings.js');
  assert.doesNotMatch(meetings, /setContextDrawerOpen\(true\)/);
  assert.match(meetings, /setContextDrawerOpen\(window\.innerWidth > 940\)/);
});

test('existing meetings open as a routed page instead of the edit modal (meetings.js, router.js)', () => {
  // "Отдельные экземпляры встреч, по аналогии с задачами": открытие существующей
  // встречи должно вести на /meetings/MEET-XXXX, а не в модалку редактирования —
  // модалка остаётся только для создания новой встречи.
  const router = read('public/js/lib/router.js');
  assert.match(router, /\/\^\\\/meetings\\\/\(\[\^\/\]\+\)\\\/\?\$\//);
  const meetings = read('public/js/views/meetings.js');
  assert.match(meetings, /function openMeetingModal\(existing[^)]*\) \{\s*\n\s*if \(existing && existing\.id\) \{ Router\.go\(meetingPath\(existing\)\); return; \}/);
});

test('appearance registry is the single source for client, anti-FOUC and server settings', () => {
  const style = read('public/css/style.css');
  const interactions = read('public/js/lib/interactions.js');
  const indexHtml = read('public/index.html');
  const settingsJs = read('server/routes/settings.js');
  const appearance = require('../public/js/domain/appearance-config');
  assert.match(style, /:root\s*\{/);
  for (const name of appearance.themeValues) assert.match(style, new RegExp(`html\.theme-${name}\s*\{`));
  assert.match(indexHtml, /appearance-config\.js/);
  assert.match(indexHtml, /const cfg = GardenAppearance;/);
  assert.match(interactions, /GardenAppearance/);
  assert.match(settingsJs, /appearance-config/);
  assert.match(read('public/js/views/settings.js'), /const appearanceThemes = GARDEN_THEMES;/);
  assert.match(interactions, /classList\.toggle\('theme-dark',\s*isDarkTheme\(theme\)\)/);
  for (const name of ['garden','zendesk-light','zendesk-dark']) assert.ok(!appearance.themeValues.includes(name));
});
test('removed themes are absent from appearance settings', () => {
  const settingsView = read('public/js/views/settings.js');
  for (const name of ['minimal-light','ocean','provence','home-garden','greece','mountain-dawn','mountain-road','fog','clarity','clarity-dark','rime','pastel','forest-mushrooms','spring','anuppuccin-light','anuppuccin-dark','sumerki-sada','len','pergament','shipovnik','ten','cupertino','cupertino-dark','cupertino-forest','cupertino-forest-dark','anuppuccin-frappe','anuppuccin-macchiato']) {
    assert.doesNotMatch(settingsView, new RegExp(`value:\\s*'${name}'`));
  }
});

test('«Прожектор», «Рейнисфьяра» и «Полдень» are fully removed, not just hidden from the picker', () => {
  // Убраны по просьбе пользователя, чтобы упростить список тем. Проверяем все
  // места, куда обычно регистрируется тема (см. первый тест в этом файле) —
  // и отдельно public/js/views/settings.js, у которого свой самодостаточный
  // список тем (appearanceThemes), не совпадающий по структуре с GARDEN_THEMES.
  const style = read('public/css/style.css');
  const interactions = read('public/js/lib/interactions.js');
  const indexHtml = read('public/index.html');
  const settingsRoute = read('server/routes/settings.js');
  const settingsView = read('public/js/views/settings.js');
  for (const name of ['prozhektor', 'reynisfjara', 'polden']) {
    const needle = new RegExp(`theme-${name}\\b|'${name}'`);
    assert.doesNotMatch(style, needle, `тема "${name}" должна быть удалена из style.css`);
    assert.doesNotMatch(interactions, needle, `тема "${name}" должна быть удалена из interactions.js`);
    assert.doesNotMatch(indexHtml, needle, `тема "${name}" должна быть удалена из index.html`);
    assert.doesNotMatch(settingsRoute, needle, `тема "${name}" должна быть удалена из routes/settings.js`);
    assert.doesNotMatch(settingsView, needle, `тема "${name}" должна быть удалена из views/settings.js`);
  }
});

test('server settings and anti-FOUC consume shared appearance defaults', () => {
  const settings = read('server/routes/settings.js');
  const indexHtml = read('public/index.html');
  const appearance = require('../public/js/domain/appearance-config');
  assert.equal(appearance.defaultTheme, 'anuppuccin-latte');
  assert.equal(appearance.defaultAccent, 'green');
  assert.match(settings, /theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT/);
  assert.match(indexHtml, /cfg\.defaultTheme/);
  assert.match(indexHtml, /cfg\.defaultAccent/);
});
test('khvoya keeps a strictly brighter base < elevated < elevated-2 < hover < active surface order (style.css)', () => {
  // В тёмных темах каждая следующая поверхность читается как более
  // «приподнятая» и потому светлее предыдущей — hover/active обязаны быть
  // светлее --bg-elevated-2, иначе подсветка строки выглядит темнее самой
  // строки (визуальный баг, который эта проверка ловит для любой будущей
  // тёмной темы, не только текущей).
  const style = read('public/css/style.css');
  const block = style.match(/html\.theme-khvoya\s*\{([^}]*)\}/);
  assert.ok(block, 'блок html.theme-khvoya не найден');
  const vars = {};
  for (const [, name, hex] of block[1].matchAll(/--(bg-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[name] = hex;
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
  };
  const order = ['bg-base', 'bg-elevated', 'bg-elevated-2', 'bg-hover', 'bg-active'];
  const lums = order.map((name) => luminance(vars[name]));
  for (let i = 1; i < lums.length; i++) {
    assert.ok(lums[i] > lums[i - 1], `${order[i]} (${vars[order[i]]}) должен быть светлее ${order[i - 1]} (${vars[order[i - 1]]})`);
  }
});

test('khvoya text tiers clear 4.5:1 AA against every real background they render on, including --bg-elevated-2 (style.css)', () => {
  // Регрессия: буквальные --text-tertiary/--text-disabled (#8592A0/#818D99)
  // проходили AA на --bg-base/--bg-elevated, но давали только 4.10/3.84:1 на
  // --bg-elevated-2 — а именно на нём сидят, например, счётчик в .nav-item
  // .count и статусные чипы. Подняты до значений, которые проходят везде,
  // сохраняя порядок secondary > tertiary > disabled.
  const style = read('public/css/style.css');
  const block = style.match(/html\.theme-khvoya\s*\{([^}]*)\}/);
  assert.ok(block, 'блок html.theme-khvoya не найден');
  const vars = {};
  for (const [, name, hex] of block[1].matchAll(/--(text-[a-z]+|bg-elevated-2):\s*(#[0-9a-fA-F]{6})/g)) vars[name] = hex;
  const relLum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const toLin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
  };
  const ratio = (a, b) => { const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  const bg = vars['bg-elevated-2'];
  for (const tier of ['text-secondary', 'text-tertiary', 'text-disabled']) {
    const r = ratio(vars[tier], bg);
    assert.ok(r >= 4.5, `${tier} (${vars[tier]}) на bg-elevated-2 (${bg}) даёт только ${r.toFixed(2)}:1, нужно 4.5:1`);
  }
  const secondaryRatio = ratio(vars['text-secondary'], bg);
  const tertiaryRatio = ratio(vars['text-tertiary'], bg);
  const disabledRatio = ratio(vars['text-disabled'], bg);
  assert.ok(secondaryRatio >= tertiaryRatio, 'text-secondary должен быть не темнее text-tertiary');
  assert.ok(tertiaryRatio >= disabledRatio, 'text-tertiary должен быть не темнее text-disabled');
});

test('The Labs ideas render as task-like list rows and default to ideas without projects (labs.js)', () => {
  const labs = read('public/js/views/labs.js');
  const start = labs.indexOf('function labIdeaRowHtml');
  const end = labs.indexOf('\n}', start);
  const block = labs.slice(start, end);
  assert.match(block, /task-list-row/, 'labIdeaRowHtml должен выглядеть как строка списка задач');
  assert.equal(/\blab-card\b/.test(block), false, 'идея не должна рендериться карточкой проекта');
  assert.equal(labs.includes('labs-ideas-list'), true, 'для списка идей должен использоваться отдельный модификатор списка');
  assert.match(labs, /Views\._labOnlyUnassignedIdeas = Views\._labOnlyUnassignedIdeas !== false;/, 'флаг «только задачи без проектов» должен быть включён по умолчанию');
  assert.match(labs, /!idea\.labProjectId/, 'при включённом флаге идеи, уже связанные с проектом, должны скрываться');
});

test('task/meeting/labs detail pages use a neutral "Назад" label, not a fixed destination (tasks.js, meetings.js, labs.js)', () => {
  // taskDetailGoBack/meetingDetailGoBack/data-router-back все вызывают Router.back(),
  // то есть возврат по истории браузера на тот экран, откуда открыли задачу/встречу/
  // проект (список, «Обзор», поиск, карточка человека и т.д.) — а не жёстко на список
  // задач/встреч/лабов. Подпись кнопки не должна называть конкретный пункт назначения
  // (это было ошибочно сделано в одном из предыдущих проходов и исправлено здесь).
  for (const file of ['public/js/views/tasks.js', 'public/js/views/meetings.js', 'public/js/views/labs.js']) {
    const source = read(file);
    assert.match(source, /task-detail-topbar-btn"[^>]*(?:data-command="\w+"|data-router-back)>Назад</, `${file}: кнопка возврата должна называться «Назад», без привязки к конкретному экрану`);
  }
});

test('sidebar scrolls the active nav item into view after render (app.js)', () => {
  // Пункты меню сайдбара по высоте не всегда помещаются в окно (особенно когда
  // развёрнута одна из последних групп — «Развитие»/«Знания»): .nav-sections-stacked
  // прокручивается, но по умолчанию не показывает индикатор прокрутки. Без явного
  // scrollIntoView активный пункт (например, «База знаний» на /knowledge-base) мог
  // оказаться почти полностью обрезан снизу, а соседние пункты группы — вовсе не
  // видны, без какой-либо подсказки, что список нужно прокрутить.
  const source = read('public/js/app.js');
  assert.match(source, /function ensureActiveNavItemVisible\(sidebar\)/, 'app.js: должна быть функция, подкручивающая активный пункт меню в видимую область');
  assert.match(source, /ensureActiveNavItemVisible\(sidebar\);\s*\n\s*renderAppHeader\(\);/, 'app.js: ensureActiveNavItemVisible должна вызываться при каждой отрисовке сайдбара');
});

test('Документы и Инструменты открываются без фатальной ошибки (router.js, documents.js, tools.js)', () => {
  // Было два независимых бага, оба валили страницу целиком:
  // 1) router.js лениво грузил 'resource-folders' через loadViewScripts — но
  //    resource-folders.js подключён обычным <script> в index.html (общая функция,
  //    а не ES-модуль представления) и файла views/resource-folders.js не существует,
  //    поэтому import 404-ился и вся страница падала с "Не удалось загрузить feature".
  // 2) resourceFolderLayoutHtml(kind, folders, items, selected, selectedFolder, filtered,
  //    rowRenderer, one, two, five) ожидает функцию-рендерер строки седьмым аргументом,
  //    а documents.js/tools.js передавали туда строку словоформы ('документ'/'инструмент'),
  //    из-за чего filtered.map(rowRenderer) падал с "string ... is not a function".
  const routerSource = read('public/js/lib/router.js');
  assert.doesNotMatch(routerSource, /loadViewScripts\(\['resource-folders'/, 'router.js: resource-folders.js не является ленивым view-модулем, его нельзя грузить через loadViewScripts');
  assert.match(routerSource, /await loadViewScript\('documents'\); return Views\.documents\(\);/, 'router.js: маршрут /documents должен лениво грузить только documents.js');
  assert.match(routerSource, /await loadViewScript\('tools'\); return Views\.tools\(\);/, 'router.js: маршрут /tools должен лениво грузить только tools.js');

  const rendererSource = read('public/js/domain/entity-renderers.js');
  assert.match(rendererSource, /function documentRowHtml\(/, 'entity-renderers.js: должна быть функция documentRowHtml для рендера строки документа');
  assert.match(rendererSource, /function toolRowHtml\(/, 'entity-renderers.js: должна быть функция toolRowHtml для рендера строки инструмента');

  const docsSource = read('public/js/views/documents.js');
  assert.match(docsSource, /Router\.replace\('\/knowledge-base'\)/, 'documents.js: старый маршрут должен перенаправлять в объединённую Базу знаний');
  assert.doesNotMatch(docsSource, /legacyDocumentsLayoutContract|resourceFolderLayoutHtml\('documents'/, 'documents.js: мёртвый legacy-layout не должен оставаться после объединения разделов');

  const toolsSource = read('public/js/views/tools.js');
  assert.match(toolsSource, /resourceFolderLayoutHtml\('tools', folders, tools, selected, selectedFolder, filtered, toolRowHtml,/, 'tools.js: resourceFolderLayoutHtml должен получать toolRowHtml как rowRenderer, а не строку словоформы');
});

test('checkins is registered as a first-class collection end-to-end (server)', () => {
  // db.js и index.js держат две ОТДЕЛЬНЫЕ копии COLLECTIONS — добавление коллекции
  // только в одном месте даёт db.checkins, но не регистрирует REST-маршруты.
  const dbSource = read('server/db.js');
  assert.match(dbSource, /'checkins'/, 'db.js: checkins должен быть в основном массиве COLLECTIONS');
  assert.match(dbSource, /checkins:\s*'chk'/, 'db.js: у checkins должен быть префикс id');

  const indexSource = read('server/index.js');
  assert.match(indexSource, /'checkins'/, 'index.js: checkins должен быть в COLLECTIONS, иначе registerCrudRoutes не создаст /api/checkins');

  const authCore = read('server/auth-core.js');
  assert.match(authCore, /'checkins\.manage_all':/, 'auth-core.js: должно быть право checkins.manage_all — иначе оно не появится в admin.js/admin.js UI');

  const access = read('server/access-control.js');
  assert.match(access, /OWNER_COLLECTIONS = \[[^\]]*'checkins'/, 'access-control.js: checkins должен быть в OWNER_COLLECTIONS, чтобы createdByUserId проставлялся автоматически');
  assert.match(access, /checkins:'checkins'/, 'access-control.js: checkins должен быть сопоставлен области прав checkins');
  assert.match(access, /'checkins'[^\]]*\]\)\.has\(name\)/, 'access-control.js: canCreate должен разрешать checkins рядовым пользователям (свою запись)');
  assert.match(access, /if \(name === 'checkins'\) return owns\(item, user\) \|\| Boolean\(user\.personId && item\.personId === user\.personId\)/, 'access-control.js: свои checkins должны определяться по автору записи или самому сотруднику');
});

test('checkins view is wired into router, sidebar and resource facade (client)', () => {
  const router = read('public/js/lib/router.js');
  assert.match(router, /\/\^\\\/checkins\\\/\?\$\//, 'router.js: должен быть маршрут /checkins');

  const app = read('public/js/app.js');
  assert.match(app, /key: 'checkins', path: '\/checkins', label: 'Check-in'/, "app.js: пункт Check-in должен быть в группе «Работа» (NAV_GROUPS)");

  const services = read('public/js/lib/services.js');
  assert.match(services, /'checkins'/, 'services.js: Resources.checkins должен быть объявлен через общую фабрику api.resource');

});

test('spinning off a Task/Issue from a Check-in cell stamps a one-way sourceCheckinId back-reference', () => {
  // Обратная ссылка живёт только на созданной сущности и не дублируется в форме.
  // на новой сущности, без поля в исходном Check-in.
  const checkins = read('public/js/views/checkins.js');
  assert.match(checkins, /sourceCheckinId:\s*c\.id/, 'checkins.js: spin-off должен передавать sourceCheckinId в prefill и для задачи, и для проблемы');
  assert.match(checkins, /FeatureLoader\.run\('openTaskModal', null, \{/);
  assert.match(checkins, /FeatureLoader\.run\('openIssueModal', null, \{/);

  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /if \(opts\.prefill\?\.sourceCheckinId\) payload\.sourceCheckinId = opts\.prefill\.sourceCheckinId;/, 'tasks.js: openTaskCreateModal должен прокидывать sourceCheckinId в payload (EntityForm.read его не знает — схема его не объявляет)');

  const issues = read('public/js/views/issues.js');
  assert.match(issues, /if \(!isEdit && opts\.prefill\?\.sourceCheckinId\) payload\.sourceCheckinId = opts\.prefill\.sourceCheckinId;/, 'issues.js: openIssueModal должен прокидывать sourceCheckinId в payload при создании из Check-in');
});

test('the «Check-in недели» overview widget is fully removed, not just hidden from the catalog', () => {
  const overview = read('public/js/views/overview.js');
  assert.doesNotMatch(overview, /'checkin-week':/, 'overview.js: checkin-week не должен остаться в OVERVIEW_WIDGET_LABELS/overviewCatalogIcon');
  assert.doesNotMatch(overview, /\['goals','team-workload','priority-tasks','unresolved-issues','week-events','checkin-week'\]/, 'overview.js: checkin-week не должен остаться в каталоге виджетов сигналов (overviewCatalogTypes)');
  assert.doesNotMatch(overview, /widget\.type === 'checkin-week'/, 'overview.js: ветка рендера checkin-week должна быть удалена');
  assert.doesNotMatch(overview, /Resources\.checkins\.list\(\)/, 'overview.js: Обзор больше не должен запрашивать checkins — эти данные нужны были только удалённому виджету');
  // Строка ниже — намеренное исключение: разовая чистка уже сохранённых у
  // пользователей конфигураций от ссылок на удалённый виджет, а не сам виджет.
  assert.match(overview, /config\.signals\.filter\(\(item\) => item\.type !== 'checkin-week'\)/, 'overview.js: у уже сохранённых пользовательских конфигураций нужно вычищать ссылки на удалённый виджет');

  const settingsRoute = read('server/routes/settings.js');
  assert.doesNotMatch(settingsRoute, /checkin-week/, "routes/settings.js: checkin-week не должен остаться в списке допустимых типов сигналов Обзора");

  // Сам раздел Check-in (страница, роут, пункт меню, право доступа) остаётся —
  // просьба была убрать только карточку на Обзоре, а не саму фичу.
  const router = read('public/js/lib/router.js');
  assert.match(router, /\/\^\\\/checkins\\\/\?\$\//, 'router.js: маршрут /checkins должен остаться');
});

test('week navigation always snaps to the Monday of the ISO week (mondayOf helper)', () => {
  const util = read('public/js/lib/util.js');
  assert.match(util, /function mondayOf\(date\)/, 'util.js: должен быть общий помощник mondayOf, используемый и Check-in, и Обзором');
});

test('role access policies expose six visibility/management scenarios and are editable in admin', () => {
  const authCore = read('server/auth-core.js');
  for (const level of ['none','own_read','own_manage','all_read','all_own_manage','all_manage']) {
    assert.match(authCore, new RegExp(`id:'${level}'`), `auth-core.js: должен быть уровень ${level}`);
  }
  assert.match(authCore, /accessLevelFromCapabilities/, 'комбинация нескольких ролей должна объединять видимость и управление, а не выбирать один уровень вслепую');
  assert.match(authCore, /role_access_policies/, 'auth-core.js: политика ролей должна храниться в workspace meta');
  assert.match(authCore, /role === 'admin' \|\| role === 'teamlead' \? 'all_manage' : 'all_own_manage'/, 'по умолчанию тимлид управляет всем, сотрудник видит все данные и управляет своими');
  const access = read('server/access-control.js');
  assert.match(access, /caps\.view >= 2 \|\| isOwnItem/, 'просмотр должен различать свои данные и все данные');
  assert.match(access, /caps\.manage >= 2/, 'управление должно различать свои данные и все данные');
  const adminRoute = read('server/routes/admin.js');
  assert.match(adminRoute, /\/api\/admin\/role-policies/, 'admin API должен сохранять права ролей');
  const adminView = read('public/js/views/admin.js');
  assert.match(adminView, /Права ролей/, 'в админке должна быть настройка прав ролей');
  assert.match(adminView, /data-role-access-role/, 'матрица ролей должна рендерить редактируемые уровни доступа');
});

test('aggregate detail endpoints reuse permission filters instead of bypassing access control', () => {
  const source = read('server/routes/aggregates.js');
  assert.match(source, /canReadItem\('projects', project, req\.auth\.user\)/, 'карточка проекта должна проверять право просмотра');
  assert.match(source, /canReadItem\('goals', goal, req\.auth\.user\)/, 'карточка цели должна проверять право просмотра');
  assert.match(source, /visibleItems\('tasks', req\.auth\.user/, 'агрегаты задач должны проходить через visibleItems');
});

test('employee first overview uses focused personal dashboard defaults', () => {
  const overview = read('public/js/views/overview.js');
  assert.match(overview, /function overviewDefaultDashboardForCurrentUser\(\)/);
  assert.match(overview, /const isRegularMember = !!Auth\.user && !Auth\.isAdmin\(\)/);
  assert.match(overview, /project\?\.status === 'active' && \(project\.memberIds \|\| \[\]\)\.includes\(personId\)/);
  assert.match(overview, /\{ id: 'my-journal', type: 'my-journal', breakBefore: true \}/);
  assert.match(overview, /linkKey: 'knowledge', breakBefore: true/);
  assert.match(overview, /linkKey: 'labs-projects'/);
  assert.match(overview, /signals: \[\{ id: 'priority-tasks', type: 'priority-tasks' \}, \{ id: 'week-events', type: 'week-events' \}, \{ id: 'attention-notes', type: 'attention-notes' \}\]/);
  assert.match(overview, /GardenSettings\.update\(\{ overviewDashboard: config \}\)/);
});

test('meeting types are centralized and reused by filters and forms', () => {
  const constants = read('public/js/domain/constants.js');
  const meetingDomain = read('public/js/domain/meeting.js');
  const meetings = read('public/js/views/meetings.js');
  assert.match(constants, /club:\s*'Техна'/);
  assert.match(constants, /retro:\s*'Ретро'/);
  assert.match(constants, /project:\s*'Проект'/);
  assert.match(constants, /MEETING_TYPE_ORDER = \['1:1', 'pr', 'club', 'retro', 'project', 'other'\]/);
  assert.match(meetingDomain, /function meetingTypeOptionsHtml/);
  assert.match(meetingDomain, /includeAll \? \['all', \.\.\.MEETING_TYPE_ORDER\] : MEETING_TYPE_ORDER/);
  assert.ok((meetings.match(/meetingTypeOptionsHtml\(/g) || []).length >= 3, 'filter, create and edit should reuse shared meeting options');
});

test('processes use task-like list/detail flow with autosave, archive and fix option statuses', () => {
  const processes = read('public/js/views/processes.js');
  const constants = read('public/js/domain/constants.js');
  const router = read('public/js/lib/router.js');
  assert.match(router, /\/\^\\\/processes\\\/\(\[\^\/\]\+\)\\\/\?\$\//, 'router.js: process instances should have a routed detail page');
  assert.match(processes, /Views\.processDetailPage/, 'processes.js: existing processes should open as detail pages');
  assert.match(constants, /PROCESS_STATUS_LABEL = \{ ok: 'Работает', attention: 'Есть проблемы', broken: 'Сломан' \}/, 'domain/constants.js: status dictionaries live here, not in the view');
  assert.match(constants, /PROCESS_FIX_STATUS_LABEL = \{ unchecked: 'Не проверялось', effective: 'Эффективно', ineffective: 'Неэффективно' \}/, 'domain/constants.js: status dictionaries live here, not in the view');
  assert.doesNotMatch(processes, /const PROCESS_STATUS_LABEL|const PROCESS_FIX_STATUS_LABEL/, 'processes.js should reference the shared dictionaries, not redeclare them');
  assert.match(processes, /expectedBehavior/, 'processes.js: should store expected process behavior');
  assert.match(processes, /currentBehavior/, 'processes.js: should store current behavior/problems');
  assert.match(processes, /fixOptions/, 'processes.js: should support multiple repair options');
  assert.match(processes, /DetailAutosave\.set\(createAutosave/, 'process detail should autosave changes');
  assert.match(processes, /archivedAt: new Date\(\)\.toISOString\(\)/, 'process actions should support archive');
  assert.match(processes, /Resources\.processes\.remove\(id\)/, 'process actions should support deletion');
  assert.match(processes, /eyebrow: ''/, 'PROCESS identifier should not be duplicated inside the detail body');
  assert.match(processes, /p\.processKey \|\| 'PROCESS'/, 'process detail header should render the unique PROCESS key');
});


test('processes receive stable human-readable PROCESS keys', () => {
  const identifiers = fs.readFileSync(path.join(ROOT, 'server/entity-identifiers.js'), 'utf8');
  const crud = fs.readFileSync(path.join(ROOT, 'server/routes/crud.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
  assert.match(identifiers, /prefix: 'PROCESS'/);
  assert.match(identifiers, /processKey: nextProcessKey\(\)/);
  assert.match(identifiers, /\^PROCESS-\\d\{4,\}\$/);
  assert.match(crud, /processes: \{[\s\S]*prepareCreate: \(payload\) => assignProcessKey\(payload\)/);
  assert.match(server, /ensureProcessKeys\(\)/);
});

test('employee detail exposes project-style sticky sidebar and journals notes with a real person mention', () => {
  const people = read('public/js/views/people.js');
  const comments = read('server/routes/comments.js');
  const settings = read('server/routes/settings.js');
  assert.match(people, /id="person-comments-toggle"/, 'employee detail should expose a sticky sidebar toggle');
  assert.match(people, /id="person-comments-drawer"/, 'employee detail should render the sticky sidebar drawer');
  assert.match(people, /entityType: 'person', entityId: p\.id/, 'employee stickies should be stored against the person entity');
  assert.match(people, /journalPrefix: `@\[\$\{String\(p\.name \|\| ''\).*\}\]\(person:\$\{p\.id\}\)`/, 'moving an employee sticky to journal must prepend a canonical person mention');
  assert.match(comments, /person: \{ collection: 'people' \}/, 'comments API must resolve person entities');
  assert.match(comments, /'project', 'person'/, 'person comments should support sticky-note color/autosave behavior');
  assert.match(settings, /personNotesOpen/, 'employee sidebar open state should persist in user settings');
});

test('meeting rows use the shared three-avatar stack with a circular overflow count', () => {
  const meetings = read('public/js/views/meetings.js');
  const entityUi = read('public/js/lib/entity-ui.js');
  const css = read('public/css/system.css');
  assert.match(meetings, /peopleAvatarStackHtml\(participants, \{ limit: 3 \}\)/);
  assert.doesNotMatch(meetings, /const employee = participants\[0\]/);
  assert.match(entityUi, /class="people-avatar-stack-overflow"[\s\S]*>\+\$\{extra\}<\/span>/);
  assert.match(css, /\.people-avatar-stack \.ui-person-avatar[\s\S]*margin-left:\s*-7px/);
  assert.match(css, /\.people-avatar-stack-overflow \{[\s\S]*width:24px;[\s\S]*height:24px;[\s\S]*margin-left:-7px;[\s\S]*border-radius:50%/);
});

test('compact employee lists reuse the shared avatar stack instead of local overflow badges', () => {
  const renderers = read('public/js/domain/entity-renderers.js');
  const agreements = read('public/js/views/agreements.js');
  const issues = read('public/js/views/issues.js');
  const projects = read('public/js/views/projects.js');
  assert.match(renderers, /peopleAvatarStackHtml\(people, \{ limit: 3 \}\)/);
  assert.match(agreements, /peopleAvatarStackHtml\(people, \{ limit: 3 \}\)/);
  assert.match(issues, /peopleAvatarStackHtml\(people, \{ limit: 3 \}\)/);
  assert.doesNotMatch(issues, /issue-list-avatar-more/);
  assert.match(projects, /peopleAvatarStackHtml\(members, \{ limit: 6 \}\)/);
});

test('repository includes a README describing Garden Team Center capabilities', () => {
  const readme = read('README.md');
  assert.match(readme, /Garden Team Center/);
  assert.match(readme, /## Что умеет Garden/);
  assert.match(readme, /### Встречи/);
  assert.match(readme, /### Процессы/);
  assert.match(readme, /## Лицензия/);
});

test('work area width adapts to large screens while detail and table views keep suitable widths', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/system.css'), 'utf8');
  assert.match(css, /--content-max:\s*clamp\(900px,\s*51vw,\s*1180px\)/);
  assert.match(css, /--detail-content-max:\s*clamp\(840px,\s*50vw,\s*960px\)/);
  assert.match(css, /\.view\.task-detail-page-view\s*\{[\s\S]*?--detail-content-max/);
  assert.match(css, /\.view\.gcal-wide,\s*\n\.view\.checkins-wide\s*\{[\s\S]*?--wide-content-gutter/);
});


test('overview settings section and attention signal preferences are removed without removing overview widgets', () => {
  const settingsView = read('public/js/views/settings.js');
  assert.doesNotMatch(settingsView, /key:\s*'focus'/, 'settings.js: раздел «Обзор» не должен оставаться в навигации настроек');
  assert.doesNotMatch(settingsView, /data-attention/, 'settings.js: переключатели сигналов Обзора должны быть удалены');
  assert.doesNotMatch(settingsView, /Выберите сигналы для страницы «Обзор»/, 'settings.js: описание удалённого раздела не должно оставаться');

  const settingsRoute = read('server/routes/settings.js');
  assert.doesNotMatch(settingsRoute, /attention:\s*\{\s*workload:/, 'routes/settings.js: пользовательская настройка списка сигналов больше не хранится');

  const overview = read('public/js/views/overview.js');
  assert.match(overview, /'team-workload'/, 'overview.js: сами виджеты Обзора должны остаться');
  assert.match(overview, /'attention-notes'/, 'overview.js: виджет «Записи из журнала» должен остаться');
});

test('sticky sidebars use a sticky-note icon and explicit panel tooltip', () => {
  const icons = read('public/js/lib/icons.js');
  const views = [
    read('public/js/views/overview.js'),
    read('public/js/views/projects.js'),
    read('public/js/views/people.js'),
    read('public/js/views/tasks.js'),
    read('public/js/views/meetings.js'),
  ].join('\n');
  assert.match(icons, /sticky:\s*'<path/, 'icons: должна быть отдельная иконка стикера');
  assert.match(views, /icon\('sticky', 16\)/, 'правые панели стикеров должны использовать иконку стикера');
  assert.match(views, /Показать панель стикеров/, 'закрытая панель должна иметь понятный tooltip');
  assert.match(views, /Скрыть панель стикеров/, 'открытая панель должна иметь понятный tooltip');
});

test('stakeholders do not expose birthday in create/edit forms or detail context', () => {
  const people = read('public/js/views/people.js');
  assert.match(people, /type === 'team' \? `<div class="ui-field-row field-row">[\s\S]*pf-birthday/, 'birthday input should only render for team members');
  assert.match(people, /if \(type === 'team'\) \{[\s\S]*payload\.birthday = document\.getElementById\('pf-birthday'\)/, 'birthday should only be written for team members');
  assert.match(people, /p\.type === 'team' && p\.birthday/, 'birthday should only be shown in team member context');
});

test('team cards fill each row responsively and keep local time at the top', () => {
  const css = read('public/css/system.css');
  const people = read('public/js/views/people.js');
  assert.match(people, /people-grid-responsive/);
  assert.match(css, /\.people-grid-responsive \{ container-type: inline-size; \}/);
  assert.match(css, /\.people-grid--team \{[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 320px\), 1fr\)\) !important;[\s\S]*justify-content: stretch !important;/);
  assert.doesNotMatch(css, /repeat\(2, minmax\(0, 370px\)\)/);
  assert.doesNotMatch(css, /repeat\(3, minmax\(0, 370px\)\)/);
  assert.match(css, /\.pc-local-time \{[\s\S]*align-self: start;[\s\S]*margin-top: 0 !important;/);
});

test('The Labs project cards do not show LABS identifiers', () => {
  const labs = read('public/js/views/labs.js');
  const rowStart = labs.indexOf('function labRowHtml');
  const rowEnd = labs.indexOf('function canEditLab', rowStart);
  const row = labs.slice(rowStart, rowEnd);
  assert.doesNotMatch(row, /lab-card-key/);
  assert.doesNotMatch(row, /escapeHtml\(lab\.labKey\)/);
});

test('Office demo data exercises current Garden entities, including Check-in, Processes and Clubs', () => {
  const demoPath = path.join(ROOT, 'server/demo-data.js');
  delete require.cache[require.resolve(demoPath)];
  const demo = require(demoPath);
  const activeTeam = demo.people.filter((p) => p.type === 'team' && p.status === 'active');
  const currentWeek = '2026-08-31';
  for (const person of activeTeam) {
    assert.ok(demo.checkins.some((c) => c.personId === person.id && c.weekStart === currentWeek), `missing current Check-in for ${person.name}`);
  }
  assert.ok(demo.processes.length >= 3, 'demo should include several processes');
  assert.deepEqual(new Set(demo.processes.map((p) => p.status)), new Set(['ok', 'attention', 'broken']));
  assert.ok(demo.processes.every((p) => /^PROCESS-\d{4}$/.test(p.processKey || '')), 'demo processes should have PROCESS keys');
  assert.ok(demo.meetings.some((m) => m.type === 'club' && (m.participantIds || []).length > 5), 'demo should demonstrate Club and participant overflow');
  assert.ok(demo.kbDocs.length > 0 && demo.tools.length > 0, 'demo knowledge base and tools should not be empty');
});

test('personal and team task widgets rank up to five tasks with configurable strategies', () => {
  const overview = read('public/js/views/overview.js');
  const constants = read('public/js/domain/constants.js');
  const settingsView = read('public/js/views/settings.js');
  const settingsRoute = read('server/routes/settings.js');
  assert.match(constants, /const TASK_PRIORITY_STRATEGIES = \{/);
  assert.match(constants, /balanced:[\s\S]*overdue: 40[\s\S]*today: 50/);
  assert.match(constants, /importance:[\s\S]*important: 60/);
  assert.match(constants, /overdue:[\s\S]*overdue: 70/);
  assert.match(overview, /TASK_PRIORITY_STRATEGIES\[mode\]/);
  assert.match(overview, /'priority-tasks': 'Мои задачи'/);
  assert.match(overview, /'team-priority-tasks': 'Задачи команды'/);
  assert.match(overview, /widget\.type === 'priority-tasks' \|\| widget\.type === 'team-priority-tasks'/);
  assert.match(overview, /tasks\.filter\(\(task\) => !personId \|\| !\(task\.assigneeIds \|\| \[\]\)\.includes\(personId\)\)/);
  assert.match(overview, /tasks\.filter\(\(task\) => \(task\.assigneeIds \|\| \[\]\)\.includes\(personId\)\)/);
  assert.match(overview, /rankedPriorityTasks\(sourceTasks, priorityMode, today\)\.slice\(0, 5\)/);
  assert.match(overview, /const projectName = store\.project\(task\.projectId\)\?\.name \|\| '';/);
  assert.match(overview, /if \(projectName\) metaParts\.push\(projectName\);/);
  assert.doesNotMatch(overview, /overview-widget-footer-note[^\n]*modeLabel/);
  assert.match(overview, /Просрочено \$\{overdueDays\} дн\./);
  assert.match(overview, /Auth\.isTeamlead\(\)[\s\S]*team-priority-tasks/);
  assert.match(settingsView, /name="task-priority-mode"/);
  assert.match(settingsView, /Object\.entries\(TASK_PRIORITY_STRATEGIES\)/);
  assert.match(constants, /Сбалансированный/);
  assert.match(constants, /По дедлайнам/);
  assert.match(constants, /По важности/);
  assert.match(constants, /Разгребание долгов/);
  assert.match(settingsRoute, /taskPriorityMode: 'balanced'/);
  assert.match(settingsRoute, /team-priority-tasks/);
  assert.match(settingsRoute, /\['balanced', 'deadline', 'importance', 'overdue'\]/);
});


test('overview priority task widgets allow inline task status changes', () => {
  const overview = read('public/js/views/overview.js');
  assert.match(overview, /trailingHtml:\s*taskStatusBadge\(task\.status \|\| 'todo', task\.id\)/);
  assert.match(overview, /overview-mini-trailing/);
});

test('overview task widget status click does not activate the parent task row and task rows show assignee avatars', () => {
  const overview = read('public/js/views/overview.js');
  const bootstrap = read('public/js/bootstrap.js');
  assert.match(overview, /const assignee = store\.person\(\(task\.assigneeIds \|\| \[\]\)\[0\]\) \|\| null/);
  assert.match(bootstrap, /event\.target\.closest\?\.\('\[data-action-stop="1"\]'\)\) return;/);
});

test('task list has no priority-strategy sorting control', () => {
  const tasks = fs.readFileSync(path.join(ROOT, 'public/js/views/tasks.js'), 'utf8');
  assert.doesNotMatch(tasks, /task-sort-mode/);
  assert.doesNotMatch(tasks, /_taskSortMode/);
  assert.doesNotMatch(tasks, /sortTasksByPriorityStrategy/);
});

test('task create deadline suggestions are compact inline actions with a Friday shortcut', () => {
  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /Поставить на:/);
  assert.match(tasks, /data-task-date-suggest=\"today\">сегодня/);
  assert.match(tasks, /data-task-date-suggest=\"tomorrow\">завтра/);
  assert.match(tasks, /data-task-date-suggest=\"week-end\">конец недели/);
  assert.match(tasks, /new Date\(\)\.getDay\(\) === 5/);
  assert.match(tasks, /data-task-date-suggest=\"next-monday\">следующий понедельник/);
  assert.match(tasks, /kind === 'next-monday'/);
});

test('obvious unused legacy helpers are removed', () => {
  const source = [
    read('public/js/lib/detail-page.js'),
    read('public/js/lib/interactions.js'),
    read('public/js/lib/ui-helpers.js'),
    read('public/js/lib/mentions.js'),
    read('public/js/views/meetings.js'),
    read('public/js/views/goals.js'),
    read('public/js/views/agreements.js'),
    read('public/js/views/documents.js'),
  ].join('\n');
  [
    'detailRelationListHtml',
    'accentMeta',
    'currentAccent',
    'multiCheckList',
    'getCheckedValues',
    'timezoneLineHtml',
    'attachMentionAutocomplete(',
    'openMeetingFollowup',
    'linkTaskToGoal',
    'deleteAgreement',
    'legacyDocumentsLayoutContract',
  ].forEach((name) => assert.doesNotMatch(source, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('package manifest contains only runtime dependencies that are used', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), ['express']);
  assert.ok(pkg.scripts?.['test:client'], 'package.json should expose a dependency-free client test command');
  assert.ok(pkg.scripts?.['test:api'], 'package.json should expose an explicit API test command');
});

test('removed UI generations do not leave dead CSS or helper functions behind', () => {
  const css = [read('public/css/style.css'), read('public/css/system.css'), read('public/css/detail-page.css')].join('\n');
  const js = [read('public/js/views/tasks.js'), read('public/js/views/people.js')].join('\n');
  ['dash-kpi', 'dash-widget-', 'focus-attention', 'meeting-period-tabs', 'meeting-details', 'task-detail-footer', 'week-row', 'sidebar-search-empty'].forEach((token) => {
    assert.doesNotMatch(css, new RegExp(token));
  });
  assert.doesNotMatch(js, /function taskDebounce\(/);
  assert.doesNotMatch(js, /function taskGroup\(/);
});

test('task priority strategy descriptions are centralized with their weights', () => {
  const constants = read('public/js/domain/constants.js');
  const settings = read('public/js/views/settings.js');
  assert.match(constants, /Смотрим на срок и важность задачи\. Ближайшие задачи обычно важнее просроченных\./);
  assert.match(constants, /Акцент на ближайших задачах\. Важность влияет на порядок, но не так сильно\./);
  assert.match(constants, /Поднимает важные задачи, сортирует их по сроку\./);
  assert.match(constants, /Чем дольше задача просрочена, тем выше она в списке\./);
  assert.match(settings, /strategy\.description/);
});

test('meetings expose missed follow-up state, outcome tabs and a top type filter', () => {
  const meetings = read('public/js/views/meetings.js');
  const meetingDomain = read('public/js/domain/meeting.js');
  const css = read('public/css/style.css');
  assert.match(meetingDomain, /function meetingHasOutcomeRecords\(meeting\)/);
  assert.match(meetingDomain, /meetingIsPast\(meeting, todayKey\) && !meetingHasOutcomeRecords\(meeting\)/);
  assert.match(meetings, /нет записей по итогам/);
  assert.match(meetings, /data-command-arg="upcoming">Будущие/);
  assert.match(meetings, /data-command-arg="completed">Завершённые/);
  assert.match(meetings, /data-command-arg="missed">Без итогов/);
  assert.match(meetings, /data-command-arg="all">Все/);
  assert.match(meetings, /id="meeting-type-filter"/);
  assert.match(meetings, /meetingTypeOptionsHtml\(Views\._meetingFilter, \{ includeAll: true \}\)/);
  assert.match(css, /\.meeting-missed-label/);
});



test('past meeting tabs expand all month groups by default', () => {
  const meetings = read('public/js/views/meetings.js');
  assert.match(meetings, /const expandedByDefault = Views\._meetingPeriod === 'upcoming' \? index === 0 : true;/);
});

test('team leads get a missed meetings widget sorted by days without outcome records', () => {
  const overview = read('public/js/views/overview.js');
  const settingsRoute = read('server/routes/settings.js');
  assert.match(overview, /'missed-meetings': 'Встречи без итогов'/);
  assert.match(overview, /Auth\.isTeamlead\(\)[\s\S]*missed-meetings/);
  assert.match(overview, /widget\.type === 'missed-meetings'/);
  assert.match(overview, /sort\(\(a, b\) => b\.days - a\.days/);
  assert.match(overview, /pluralRu\(days, 'день', 'дня', 'дней'\)/);
  assert.match(settingsRoute, /missed-meetings/);
});


test('meeting filters stay flat and missed widget shows type plus age', () => {
  const meetings = read('public/js/views/meetings.js');
  const overview = read('public/js/views/overview.js');
  assert.doesNotMatch(meetings, /view-narrow work-list-page meetings-view/);
  assert.match(meetings, /view-narrow meetings-view/);
  assert.match(overview, /MEETING_TYPE_LABEL\[meeting\.type\].*pluralRu\(days, 'день', 'дня', 'дней'\).*назад/);
});

test('meeting tabs update only list content, preserve scroll and keep task-like spacing', () => {
  const meetings = read('public/js/views/meetings.js');
  const css = read('public/css/style.css');
  assert.match(meetings, /function renderMeetingsWorkspace\(meetings\)/);
  assert.match(meetings, /Views\._meetingsCache = meetings/);
  const periodBlock = meetings.match(/function setMeetingPeriod\(period\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(periodBlock, /querySelector\('\.meetings-list-body'\)/);
  assert.match(periodBlock, /body\.innerHTML = meetingPeriodContent\(Views\._meetingsCache \|\| \[\]\)/);
  assert.match(periodBlock, /scrollTop/);
  assert.doesNotMatch(periodBlock, /renderMeetingsWorkspace|Views\.meetings\(/);
  assert.match(meetings, /work-list-page meetings-work-surface/);
  assert.match(meetings, /view\.classList\.add\('task-page'\)/);
  assert.match(css, /\.meeting-sticky-toolbar \{ padding-bottom: 18px; margin-bottom: 16px; \}/);
  assert.match(css, /\.meetings-work-surface \.meetings-list-body\{[\s\S]*padding-top: 18px/);
});


test('overview operational widgets deep-link to the relevant filtered context', () => {
  const overview = read('public/js/views/overview.js');
  const meetings = read('public/js/views/meetings.js');
  const tasks = read('public/js/views/tasks.js');
  const people = read('public/js/views/people.js');
  assert.match(overview, /data-route="\/meetings\?period=missed">Все без итогов/);
  assert.match(meetings, /Router\.queryParam\('period'\)/);
  assert.match(meetings, /Views\._meetingPeriod = requestedPeriod/);
  assert.match(overview, /route: `\$\{personPath\(p\)\}\?tab=load`/);
  assert.match(people, /Router\.queryParam\('tab'\)/);
  assert.match(people, /Views\._personTab = requestedTab/);
  assert.match(overview, /route: taskPath\(task\)/);
  assert.match(tasks, /Router\.queryParam\('person'\)/);
  assert.match(tasks, /requestedPerson \? requestedPerson\.id : Views\._taskPersonFilter/);
  assert.match(tasks, /Router\.queryParam\('project'\)/);
  assert.match(tasks, /requestedProjectFilter === 'all'.*Views\._taskProjectFilter = 'all'/s);
});


test('overview task links clear stale project filters and entity task rows use canonical task typography', () => {
  const overview = read('public/js/views/overview.js');
  const projects = read('public/js/views/projects.js');
  const people = read('public/js/views/people.js');
  const css = read('public/css/system.css');
  assert.match(overview, /\/tasks\?mine=1&project=all[\s\S]*?Все мои задачи/);
  assert.match(overview, /route: taskPath\(task\)/);
  assert.match(projects, /ui-row ui-row--task list-row task-list-row project-task-row/);
  assert.match(projects, /class="tl-title"/);
  assert.match(projects, /personAvatarLinkHtml/);
  assert.doesNotMatch(projects.match(/if \(key === 'tasks'\)[\s\S]*?emptyState\('Задач нет'/)?.[0] || '', /personChip/);
  assert.match(people, /ui-row ui-row--task list-row task-list-row/);
  // font-size accepts the literal or the design-token form: --fs-sm resolves to 13px in every theme (verified in public/css/style.css :root).
  assert.match(css, /\.project-detail-page-shell \.task-list-row \.tl-title,[\s\S]*\.person-detail \.task-list-row \.tl-title[\s\S]*font-size: (?:13px|var\(--fs-sm\));[\s\S]*font-weight: 400/);
  assert.doesNotMatch(people, /task-assignee-cell\" aria-hidden=\"true/);
  assert.match(css, /\.person-detail \.task-list-row \.tl-right,[\s\S]*grid-template-columns: minmax\(170px, 220px\) 118px/);
});


test('The Labs project create command is registered and lazy-loadable', () => {
  const loader = fs.readFileSync(path.join(ROOT, 'public/js/lib/view-loader.js'), 'utf8');
  const labs = fs.readFileSync(path.join(ROOT, 'public/js/views/labs.js'), 'utf8');
  assert.match(loader, /openLabModal:\s*['"]labs['"]/);
  assert.match(labs, /FeatureLoader\.register\(\{[^}]*openLabModal[^}]*\}\)/);
  assert.match(labs, /data-command=\"\$\{isIdeas \? 'openLabIdeaModal' : 'openLabModal'\}\"/);
});


test('editable status fields make both icon and adjacent label clickable', () => {
  const tasks = read('public/js/views/tasks.js');
  const labs = read('public/js/views/labs.js');
  const detailCss = read('public/css/detail-page.css');
  assert.match(tasks, /task-detail-status-click-target task-status-interactive/);
  assert.match(tasks, /openTaskStatusMenu\(event, t\.id, status\)/);
  assert.match(labs, /lab-status-click-target task-status-interactive/);
  assert.match(labs, /openLabStatusMenu\(event, lab\)/);
  assert.match(detailCss, /Status fields: icon and adjacent label share one interactive hit area/);
});


test('task titles expose full text on hover and filter panel collapses without rerender', () => {
  const tasks = read('public/js/views/tasks.js');
  const renderers = read('public/js/domain/entity-renderers.js');
  const css = read('public/css/system.css');
  assert.match(renderers, /class="tl-title" title="\$\{escapeHtml\(t\.title\)\}"/);
  assert.match(tasks, /class="kc-title" title="\$\{escapeHtml\(t\.title\)\}"/);
  assert.match(tasks, /task-sticky-toolbar \$\{filtersCollapsed \? 'is-collapsed' : ''\}/);
  assert.match(tasks, /toolbar\?\.classList\.toggle\('is-collapsed'/);
  const start = tasks.indexOf('if (filterToggle) filterToggle.onclick');
  const end = tasks.indexOf('const statusFilter', start);
  const toggleBlock = start >= 0 && end > start ? tasks.slice(start, end) : '';
  assert.doesNotMatch(toggleBlock, /Views\.tasks\(\)/);
  assert.match(css, /Task filter panel: keep one DOM node[\s\S]*?\.task-sticky-toolbar\.is-collapsed/);
});


test('checkins toolbar hides current-week action on current week and supports XLSX CSV MD export', () => {
  const checkins = read('public/js/views/checkins.js');
  const index = read('public/index.html');
  const exporter = read('public/js/lib/tabular-export.js');
  assert.match(checkins, /if \(Views\._checkinsWeek === current\) return '';/, 'current week button should be hidden when it would be redundant');
  assert.match(checkins, /data-command="openCheckinsExportModal"/, 'Check-in toolbar should expose export action');
  assert.match(checkins, /<option value="xlsx">XLSX<\/option>/);
  assert.match(checkins, /<option value="csv">CSV<\/option>/);
  assert.match(checkins, /<option value="md">MD<\/option>/);
  assert.match(checkins, /Все сотрудники/);
  assert.match(checkins, /checkinsExportRows\(_lastCheckins, personId, from, to\)/);
  assert.match(index, /\/js\/lib\/tabular-export\.js/);
  assert.match(exporter, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(exporter, /function toCsv/);
  assert.match(exporter, /function toMarkdown/);
});


test('checkins period picker is a public feature command and opens from the toolbar period', () => {
  const checkins = read('public/js/views/checkins.js');
  const loader = read('public/js/lib/view-loader.js');
  assert.match(checkins, /data-command="openCheckinsWeekPicker"/, 'the visible period should invoke the week picker');
  assert.match(checkins, /function openCheckinsWeekPicker\(\)/, 'Check-in should provide a period picker');
  assert.match(checkins, /Дата внутри нужной недели/, 'the picker should let the user choose a date inside the target week');
  assert.match(checkins, /Views\._checkinsWeek = localDateKey\(mondayOf/, 'the selected date should normalize to the week start');
  assert.match(loader, /openCheckinsWeekPicker: 'checkins'/, 'week picker command must be lazy-loadable even before the view command registry is ready');
});

test('meeting detail caps participants at two while related context is limited by meeting type', () => {
  const meetings = read('public/js/views/meetings.js');
  assert.match(meetings, /function meetingDetailParticipantsHtml\(participants\)[\s\S]*participants\.slice\(0, 2\)/, 'meeting detail should show only two people');
  assert.match(meetings, /и ещё \$\{extra\}…/, 'detail view should show the remaining participant count');
  assert.match(meetings, /meeting-detail-participant-name/, 'detail participants should have a dedicated no-wrap name element');
  assert.match(meetings, /const showParticipantContext = meetingType === '1:1' \|\| meetingType === 'pr';/);
  assert.match(meetings, /const tasksPromise = showParticipantContext \? Resources\.tasks\.list\(\) : Promise\.resolve\(\[\]\);/);
  assert.match(meetings, /const issuesPromise = showParticipantContext \? Resources\.issues\.list\(\) : Promise\.resolve\(\[\]\);/);
  assert.match(meetings, /const journalPromise = showParticipantContext \? Resources\.journal\.list\(\) : Promise\.resolve\(\[\]\);/);
  assert.match(meetings, /renderMeetingRelatedPanel\(participantsPicker\?\.getSelected\?\.\(\) \|\| m\.participantIds \|\| \[\], event\.target\.value\)/, 'changing meeting type should refresh the contextual sidebar');
});

test('detail pages show one transient saved status and meeting key is not duplicated above the title', () => {
  const app = read('public/js/app.js');
  const detail = read('public/js/lib/detail-page.js');
  const meetings = read('public/js/views/meetings.js');
  const tasks = read('public/js/views/tasks.js');
  const labs = read('public/js/views/labs.js');
  const processes = read('public/js/views/processes.js');
  const css = read('public/css/system.css');

  assert.match(meetings, /<h1 class="topbar-h1-key">\$\{escapeHtml\(m\.meetingKey \|\| ''\)\}<\/h1>/, 'meeting key should remain in the topbar');
  assert.match(meetings, /detailPageHeaderHtml\(\{ title: meetingDisplayTitle\(m\), eyebrow: ''/, 'meeting key should not repeat above the meeting title');

  assert.match(app, /data-detail-save-status/, 'detail topbars should get a shared save-status slot');
  assert.match(detail, /status\.textContent = 'Сохранено'/, 'autosave feedback should use the short Saved label');
  assert.match(detail, /if \(result !== false\) notify\('saved'\)/, 'failed validation must not display a false saved confirmation');
  assert.match(css, /\.detail-save-status[\s\S]*opacity: 0[\s\S]*\.detail-save-status\.is-visible \{ opacity: 1; \}/, 'save feedback should be unobtrusive and transient');

  for (const source of [tasks, labs, processes, meetings]) {
    assert.doesNotMatch(source, /Версия сохранена|Изменения сохранены/, 'detail pages should not use legacy save-copy toasts');
  }
});

test('version history batches autosaves and shows concise change summaries', () => {
  const versioning = read('server/versioning.js');
  const versionsRoute = read('server/routes/versions.js');
  const history = read('public/js/lib/version-history.js');
  const services = read('public/js/lib/services.js');
  const detail = read('public/js/lib/detail-page.js');
  assert.match(versioning, /VERSION_WINDOW_MS\s*=\s*10 \* 60 \* 1000/);
  assert.match(versioning, /updateLatest/);
  assert.match(versioning, /isImportantChange/);
  assert.match(versionsRoute, /\/finalize/);
  assert.match(history, /entry\.summary/);
  assert.match(services, /finalize:\s*\(entityType, entityId\)/);
  assert.match(detail, /pagehide/);
});


test('overview task rows open task detail, my tasks use task icon, and Garden brand stays visually quiet', () => {
  const overview = read('public/js/views/overview.js');
  const appJs = read('public/js/app.js');
  const css = read('public/css/style.css');
  assert.match(overview, /person: isTeamWidget \? assignee : null/);
  assert.match(overview, /iconName: isTeamWidget \? '' : 'tasks'/);
  assert.match(overview, /route: taskPath\(task\)/, 'task widget rows should open the task detail');
  assert.match(css, /\.sidebar-brand-name:hover\{background: transparent;color: var\(--text-primary\);\}/, 'Garden brand should not get a hover background');
  assert.doesNotMatch(appJs, /garden-hover-sprig/, 'Garden brand should not render decorative animation markup');
  assert.doesNotMatch(css, /garden-branch-grow|garden-leaf-one|garden-leaf-two/, 'Garden brand should not include decorative hover animation');
});


test('command palette search field follows the modal shape and uses broadly useful examples', () => {
  const css = read('public/css/style.css');
  const interactions = read('public/js/lib/interactions.js');
  assert.match(css, /\.palette input\{[^}]*border-radius:\s*calc\(var\(--radius-lg\) - 1px\) calc\(var\(--radius-lg\) - 1px\) 0 0/);
  assert.match(interactions, /Поиск: задачи на сегодня, встречи без итогов, check-in с блокерами…/);
  assert.equal(interactions.includes('мои задачи, встречи без итогов 1:1'), false);
});

test('person and project detail tabs update locally without rerendering the whole detail page', () => {
  const people = read('public/js/views/people.js');
  const projects = read('public/js/views/projects.js');
  assert.match(people, /data-person-detail-tab=/);
  assert.match(people, /personTabBody\.innerHTML = tabBody\(key\)/);
  assert.doesNotMatch(people, /data-view-state="_personTab"[^>]*data-view-render="personDetail"/);
  assert.match(projects, /data-project-detail-tab=/);
  assert.match(projects, /projectTabBody\.innerHTML = body\(key\)/);
  assert.doesNotMatch(projects, /data-view-state="_projectTab"[^>]*data-view-render="projectDetail"/);
});

test('project detail does not expose the removed Documents tab or fetch project documents', () => {
  const projects = read('public/js/views/projects.js');
  const aggregates = read('server/routes/aggregates.js');
  assert.doesNotMatch(projects, /key: 'documents'/);
  assert.doesNotMatch(projects, /data\.documents/);
  assert.doesNotMatch(aggregates, /const documents = visibleItems\('documents'/);
});

test('project detail exposes task creation prefilled with the current project', () => {
  const projects = read('public/js/views/projects.js');
  assert.match(projects, /openTaskModal', null, \{ prefill: \{ projectId: p\.id \} \}/);
  assert.match(projects, /\+ Создать задачу/);
});

test('overview offers a project overview quick-access widget to every user', () => {
  const overview = read('public/js/views/overview.js');
  assert.match(overview, /'project-overview': 'Обзор проекта'/);
  assert.match(overview, /\['my-tasks','project-overview','project-tasks'/, 'project overview should be in the shared quick-action catalog without a role gate');
  assert.match(overview, /widget\.type === 'project-overview'[\s\S]*projectPath\(project\)/, 'project overview quick action should deep-link to project detail');
  assert.match(overview, /overview-project-overview-select/);
  assert.match(overview, /config\.quick\.push\(\{ id, type:'project-overview', projectId \}\)/);
});

test('project detail shows members as a dedicated section with workload mode', () => {
  const projects = read('public/js/views/projects.js');
  const css = read('public/css/style.css');
  assert.match(projects, /Участники проекта/);
  assert.match(projects, /PROJECT_LOAD_OPTIONS\[load\.mode\]/);
  assert.match(projects, /project-member-mode/);
  assert.match(projects, /option\.label/);
  assert.match(projects, /option\.rangeLabel/);
  assert.doesNotMatch(projects, /data\.members\.map\(personChip\)/, 'legacy inline member chips should be removed from project detail');
  assert.match(css, /\.project-members-section\{/);
  assert.match(css, /\.project-member-row\{/);
});


test('employee workload edit action works and project workload opens from participant hours', () => {
  const projects = read('public/js/views/projects.js');
  const css = read('public/css/style.css');
  assert.match(projects, /const canEdit = Auth\.canManage\('projects'\)/, 'employee workload modal must not reference an undefined project variable');
  assert.match(projects, /Управление загрузкой/);
  assert.doesNotMatch(projects, /project-members-load-link/, 'project detail should not keep a separate workload-management link');
  assert.match(projects, /project-member-action[\s\S]*data-action-id=/, 'only the participant text should be the workload-management entry point');
  assert.match(projects, /openProjectLoadManagement\(p\.id, person\.id\)/, 'participant click should tell the workload modal which employee to focus');
  assert.doesNotMatch(projects, /project-member-row[^>]*data-action-id=/, 'empty participant-row space must not be clickable');
  assert.match(projects, /\$\{escapeHtml\(option\.label\)\} \(\$\{escapeHtml\(option\.rangeLabel\)\}\)/, 'the row should show both workload mode and hours');
  assert.match(projects, /async function openProjectLoadManagement\(projectId, focusPersonId = null\)/);
  assert.match(projects, /project-load-management-members[\s\S]*Исполнители/, 'workload modal should expose the participant picker above load rows');
  assert.match(projects, /initPeoplePicker\(document\.getElementById\('project-load-members-wrap'\)/);
  assert.match(projects, /Resources\.projects\.update\(project\.id, \{ memberIds, memberLoads \}\)/);
  assert.doesNotMatch(projects, /Router\.go\(personPath\(person\)\)/, 'participant workload rows should not navigate to the employee page');
  assert.doesNotMatch(projects, /project-member-load-link|data-project-load-open/, 'workload row should not contain a competing nested link');
  assert.doesNotMatch(css, /\.project-member-row:hover\{background:var\(--bg-hover\);\}/, 'workload row should not use background highlighting on hover');
  assert.match(css, /\.project-member-action:hover \.project-member-name,\.project-member-action:hover \.project-member-mode\{text-decoration:underline/, 'hovering the participant text should underline it');
  assert.doesNotMatch(projects, /id="prf-member-loads"/, 'project edit form should keep only the participant picker');
  assert.match(projects, /existingMemberLoads/, 'editing participants must preserve existing workload values');
  assert.match(css, /\.project-load-management-members\{[^}]*margin-bottom:18px/, 'workload assignee field should be separated from workload controls');
  assert.match(projects, /Modal\.open\([\s\S]*initialFocus: 'panel'/, 'workload modal should not autofocus the assignee picker');
  assert.match(projects, /data-project-load-person[\s\S]*focusPersonId[\s\S]*targetLoad\.focus/, 'workload modal should focus the selected employee load control after opening');
});

test('server settings preserve project overview quick widgets', () => {
  const settings = read('server/routes/settings.js');
  assert.match(settings, /new Set\(\['my-tasks','project-overview','project-tasks'/);
  assert.match(settings, /item\.type === 'project-tasks' \|\| item\.type === 'project-overview'/);
});

test('journal composer stays note-only and does not expose legacy task handoff', () => {
  const journal = read('public/js/views/journal.js');
  assert.match(journal, /id="journal-submit">Записать заметку<\/button>/);
  assert.doesNotMatch(journal, /journal-create-task|Сделать задачей/);
});
test('journal composer has one primary action', () => {
  const journal = read('public/js/views/journal.js');
  assert.match(journal, /ui-button--primary btn btn-primary" id="journal-submit"/);
  assert.doesNotMatch(journal, /journal-create-task/);
});
test('notification center is wired into sidebar, settings and server persistence', () => {
  const app = read('public/js/app.js');
  const settingsView = read('public/js/views/settings.js');
  const settingsRoute = read('server/routes/settings.js');
  const db = read('server/db.js');
  const crud = read('server/routes/crud.js');
  assert.match(app, /data-header-menu="notifications"/);
  assert.match(app, /data-notification-badge/);
  assert.match(app, /\/api\/notifications/);
  assert.match(settingsView, /key: 'notifications', label: 'Уведомления'/);
  assert.match(settingsView, /\['task_assigned', 'Новая задача от тимлида'/);
  assert.match(settingsView, /\['project_load_changed', 'Изменение загрузки на проекте'/);
  assert.match(settingsView, /\['checkin_reminder', 'Напоминание о чек-апе'/);
  assert.match(settingsView, /\['issue_created', 'Новая проблема от сотрудника'/);
  assert.match(settingsView, /\['lab_created', 'Новая идея или проект The Labs'/);
  assert.match(settingsView, /Auth\.isTeamlead\(\) \? \[/);
  assert.match(settingsRoute, /notificationEvents/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(crud, /notifyTaskAssigned/);
  assert.match(crud, /notifyProjectLoadChanges/);
  assert.match(crud, /notifyIssueCreated/);
  assert.match(crud, /notifyLabCreated/);
});


test('The Labs uses inline privacy controls and placeholder-only links editor', () => {
  const labs = read('public/js/views/labs.js');
  const css = read('public/css/system.css');
  assert.match(labs, /lab-private-checkbox/);
  assert.match(labs, /placeholder="Название"/);
  assert.match(labs, /placeholder="Ссылка"/);
  assert.doesNotMatch(labs, /<div class="meeting-document-head"/);
  assert.match(css, /\.lab-links-editor/);
});
test('team active-only checkbox shows inactive employees when unchecked', () => {
  const people = read('public/js/views/people.js');
  assert.match(people, /const people = type === 'team' && Views\._teamOnlyActive \? allPeople\.filter\(isActiveTeamPerson\) : allPeople/);
  assert.match(people, /id="team-only-active"/);
  assert.match(people, /addEventListener\('change',[\s\S]*toggleTeamOnlyActive\(event\.currentTarget\.checked\)/);
  assert.doesNotMatch(people, /onchange="toggleTeamOnlyActive/);
});

test('a nested data-stop-propagation control (e.g. the agreement done checkbox) does not also trigger the parent row\'s data-action-id', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  assert.match(entityUi, /document\.addEventListener\('click', \(event\) => \{\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(event\.target\.closest\?\.\('\[data-stop-propagation\]'\)\) return;\s*\n\s*const target = event\.target\.closest\?\.\('\[data-action-id\]'\)/);
  const agreements = read('public/js/views/agreements.js');
  assert.match(agreements, /data-stop-propagation="1"/);
  assert.match(agreements, /data-command="toggleAgreement"/);
});

test('issue status menu reads the clicked icon from event.target, not the delegated listener\'s currentTarget', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  const fn = entityUi.slice(entityUi.indexOf('function openIssueStatusMenu'), entityUi.indexOf('function openIssueStatusMenu') + 900);
  assert.doesNotMatch(fn, /event\?\.currentTarget/, 'currentTarget is document for a delegated listener and has no getBoundingClientRect, which silently broke the whole menu');
  assert.match(fn, /event\?\.target/);
  assert.match(fn, /closest\?\.\('\.task-status-interactive'\)/);
});

test('Issues and Agreements list "Все" tab last, after the status-specific tabs', () => {
  const issues = read('public/js/views/issues.js');
  const agreements = read('public/js/views/agreements.js');
  assert.match(issues, /\{ key: 'open', label: 'Открытые'[\s\S]*?\{ key: 'resolved', label: 'Решённые'[\s\S]*?\{ key: 'all', label: 'Все'/);
  assert.match(agreements, /\{ key: 'open', label: 'Открытые'[\s\S]*?\{ key: 'done', label: 'Выполненные'[\s\S]*?\{ key: 'all', label: 'Все'/);
});

test('ideas, problems and agreements are independent from Journal', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  const issues = read('public/js/views/issues.js');
  const agreements = read('public/js/views/agreements.js');
  const labs = read('public/js/views/labs.js');
  const crud = read('server/routes/crud.js');
  const index = read('server/index.js');
  assert.doesNotMatch(entityUi, /askDeleteLinkedJournal/);
  for (const source of [issues, agreements, labs]) {
    assert.doesNotMatch(source, /askDeleteLinkedJournal|Resources\.journal\.remove/);
  }
  assert.doesNotMatch(crud, /unlinkJournalFor|syncEntityToJournal|syncJournalDerivedEntity/);
  assert.doesNotMatch(index, /journal-sync|unlinkJournalFor|syncEntityToJournal|syncJournalDerivedEntity/);
});

test('idea privacy is controlled only by the checkbox in the idea form', () => {
  const labs = read('public/js/views/labs.js');
  const journal = read('public/js/views/journal.js');
  const entityUi = read('public/js/lib/entity-ui.js');
  assert.match(labs, /Приватная идея \(видна только вам и тимлиду\)/);
  assert.doesNotMatch(journal, /ideaVisibilityDefault|askIdeaVisibility|journal-idea-private/);
  assert.doesNotMatch(entityUi, /askIdeaVisibility|ideaVisibilityDefault/);
});

test('checkboxes/radios inside a modal do not get the text-field focus outline (which rendered as a thick, oversized border)', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.modal-panel input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):focus/, 'the heavy text-field focus style (border-color + box-shadow) must exclude checkboxes/radios');
  assert.match(css, /\.modal-panel input\[type="checkbox"\]:focus-visible,\s*\n\.modal-panel input\[type="radio"\]:focus-visible \{/, 'checkboxes/radios need their own lighter focus ring instead');
});

test('the "Приватная" badge on a private idea in the Journal feed matches the tiny size of its sibling meta text (date/kind), not the body font size', () => {
  const renderers = read('public/js/domain/entity-renderers.js');
  assert.match(renderers, /class="tiny lab-private-meta"/, 'lab-private-meta has no font-size of its own — outside the Labs meta row (11px) it silently inherits the body font size, which read oversized next to the tiny je-kind-label');
});

test('legacy idea visibility defaults are removed from user settings', () => {
  const settingsRoute = read('server/routes/settings.js');
  const settingsView = read('public/js/views/settings.js');
  assert.doesNotMatch(settingsRoute, /ideaVisibilityDefault/);
  assert.doesNotMatch(settingsView, /idea-visibility-default|ideaVisibilityDefault/);
});

test('smart search reuses the existing search parser instead of forking a second one', () => {
  const engine = read('server/domain/smart-search.js');
  assert.match(engine, /module\.exports = function createSmartSearch\(\{ db, visibleItems, search, isTeamlead \}\)/);
  assert.match(engine, /const \{ norm, rankPeopleByFragment, findProjectByFragment, parseQuery, runSearch, parseRelativeDatePhrase, stripSearchFillers, fuzzyWordMatch \} = search;/,
    'разбор запросов должен приходить из server/routes/search.js, иначе два парсера разъедутся');
  const searchRoute = read('server/routes/search.js');
  assert.match(searchRoute, /function rankPeopleByFragment\(fragment/, 'нужен список кандидатов, а не только лучший');
  assert.match(searchRoute, /function parseQuery\(rawQuery, user\)/);
  assert.match(searchRoute, /function runSearch\(rawQuery, user, parsedQuery = null, options = \{\}\)/);
  const index = read('server/index.js');
  assert.match(index, /const searchApi = registerSearchRoutes\(app/);
  assert.match(index, /registerSmartSearchRoutes\(app, \{ db, visibleItems, search: searchApi/);
});

test('an ambiguous person reference is never resolved silently — name score outweighs context, context only breaks ties', () => {
  const engine = read('server/domain/smart-search.js');
  assert.match(engine, /const contenders = ranked\.filter\(\(row\) => row\.score >= bestNameScore - 1\);/,
    'контекст не должен вытаскивать наверх заведомо более слабое совпадение по имени');
  assert.match(engine, /total: row\.score \* 10 \+ context\.score/);
  assert.match(engine, /status: 'ambiguous'/);
  assert.match(engine, /AMBIGUITY_MARGIN/);
});

test('remembered name hints live in user settings, are read server-side and can be forgotten from the UI', () => {
  const settingsRoute = read('server/routes/settings.js');
  assert.match(settingsRoute, /smartSearchPersonHints/);
  assert.match(settingsRoute, /smartSearchHistory/);
  const smartRoute = read('server/routes/smart-search.js');
  assert.match(smartRoute, /normalizeUserSettings\(db\.auth\.preferences\.get\(user\.id\)\)/,
    'подсказку нельзя принимать с клиента — иначе её можно подделать запросом');
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /smartSearchForgetHint/);
  assert.match(widget, /data-smart-forget/);
});

test('the assistant is a home-screen mode from settings, not a widget among widgets', () => {
  const overview = read('public/js/views/overview.js');
  assert.match(overview, /const assistantMode = settings\?\.overviewHomeMode === 'assistant';/);
  assert.match(overview, /assistantMode \? assistantHtml :/, 'в режиме ассистента остальные виджеты просто не рисуются');
  assert.doesNotMatch(overview, /smart-search'\]|smartWidget/, 'виджета «Умный поиск» больше нет — режим задаётся настройкой');
  const settingsRoute = read('server/routes/settings.js');
  assert.doesNotMatch(settingsRoute, /'smart-search'/, 'тип виджета не должен оставаться в whitelist');
  assert.match(settingsRoute, /overviewHomeMode: 'widgets'/);
  assert.match(settingsRoute, /\['widgets', 'assistant'\]\.includes\(source\.overviewHomeMode\)/);
  const settingsView = read('public/js/views/settings.js');
  assert.match(settingsView, /name="overview-home-mode"/);
  assert.match(settingsView, /GardenSettings\.update\(\{ overviewHomeMode: input\.value \}\)/);
});

test('assistant mode drops the page header entirely but keeps the notes reachable', () => {
  const overview = read('public/js/views/overview.js');
  const assistantBlock = overview.slice(overview.indexOf('if (assistantMode) {'), overview.indexOf('view.innerHTML = `<div class="overview-page-shell">'));
  assert.match(assistantBlock, /setTopbar\(''\)/, 'заголовок «Обзор» на этом экране ничего не добавляет');
  assert.match(assistantBlock, /classList\.add\('topbar-hidden'\)/);
  assert.doesNotMatch(assistantBlock, /overview-customize/, 'кнопка «Настроить» относится к виджетам');
  assert.doesNotMatch(assistantBlock, /openPalette/, 'кнопка «+ Добавить» в режиме ассистента не нужна');
  assert.match(assistantBlock, /id="overview-comments-toggle"/, 'стикеры остаются доступны кнопкой на самом экране');
  // Класс ставит только этот экран — на других страницах шапка обязана вернуться.
  assert.match(read('public/js/lib/router.js'), /topbar\.classList\.remove\('task-board-wide', 'task-list-toolbar-wide', 'topbar-hidden'\)/);
  assert.match(read('public/css/system.css'), /\.topbar\.topbar-hidden\{display:none;\}/);
});

test('the greeting is short, unobtrusive and uses the shared assistant UI config', () => {
  const widget = read('public/js/views/smart-search.js');
  const config = read('public/js/domain/smart-search-ui-config.js');
  assert.match(widget, /const SMART_GREETINGS = \{/);
  assert.doesNotMatch(widget, /'Доброе утро'|'Добрый день'|'Добрый вечер'/);
  assert.match(config, /greetingIcons: \['leaf', 'pinecone'/);
  assert.match(widget, /smartGreetingIconName\(\)/);
});
test('the assistant completes people, projects, entity types and sections from shared UI config', () => {
  const widget = read('public/js/views/smart-search.js');
  const config = read('public/js/domain/smart-search-ui-config.js');
  assert.match(config, /personPrefixes: \['как дела у'/);
  assert.match(config, /projectPrefixes: \['как дела на'/);
  assert.match(config, /createTypes:/);
  assert.match(config, /sectionTargets:/);
  assert.match(widget, /function smartSuggestionsFor\(rawValue\)/);
  assert.match(widget, /const renderSuggestions = \(\) => \{/);
});
test('"открой …" navigates to a section while "покажи …" still lists results', () => {
  const widget = read('public/js/views/smart-search.js');
  const config = read('public/js/domain/smart-search-ui-config.js');
  assert.match(config, /openPrefixes: \['открой мне', 'открой'/);
  assert.match(widget, /function smartSearchNavigationTarget\(query\)/);
  assert.match(widget, /searchSectionRoute\(rest\)/);
});
test('long result rows are truncated with the full text available on hover', () => {
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /class="smart-row-title" title="\$\{escapeHtml\(full\)\}"/);
  assert.match(widget, /class="smart-row-meta" title="\$\{escapeHtml\(meta\)\}"/);
  const css = read('public/css/system.css');
  assert.match(css, /\.smart-row-title\{[^}]*text-overflow:ellipsis/);
});

test('the assistant column is centred and capped, not stretched across the whole page', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.smart-search\{width:100%;max-width:var\(--smart-column\);margin:0 auto;align-self:center/);
  assert.doesNotMatch(css, /\.smart-search\{width:100%;max-width:720px;display/);
});

test('the assistant reports completed actions and writes journal notes in place', () => {
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /Resources\.journal\.create\(\{ text: title, kind: 'note'/);
  assert.match(widget, /Записал заметку/);
  assert.doesNotMatch(widget, /Router\.go\('\/journal'\)/);
});
test('a pending blur-close never swallows suggestions that were just reopened', () => {
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /let closeTimer = null;/);
  assert.match(widget, /const updateSuggestions = \(\) => \{\s*\n\s*clearTimeout\(closeTimer\);/, 'иначе подсказки, открытые кликом по чипу, гаснут через мгновение');
  assert.match(widget, /input\.addEventListener\('blur', \(\) => \{ clearTimeout\(closeTimer\); closeTimer = setTimeout\(closeSuggestions, 120\); \}\);/);
});

test('digest answers in the assistant do not render the top signals summary line', () => {
  // Пользователь: «в разделе с ассистентом я не хочу, чтобы по саджестам
  // выводилось такое саммари — в нём нет смысла, т.к. я всё равно смотрю всё
  // сам». Строка вида «1 просроченная задача — 1 серьёзная проблема» больше
  // не рендерится ни для одного типа дайджеста (сервер данные по-прежнему
  // считает и отдаёт — просто фронт их не показывает).
  const widget = read('public/js/views/smart-search.js');
  assert.doesNotMatch(widget, /class="smart-signals"/, 'строка-саммари сигналов над секциями саджеста должна быть удалена из вёрстки');
  assert.match(widget, /function smartSearchDigestHtml\(result\) \{[\s\S]*?\n\}/, 'на всякий случай убеждаемся, что функция вообще нашлась для проверки выше');
});

test('task commands can prefill assignee, project, priority and due date', () => {
  const engine = read('server/domain/smart-search.js');
  assert.match(engine, /function parseCreateDetails\(title, user, options = \{\}, target = 'tasks'\)/);
  assert.match(engine, /CREATE_PERSON_MARKERS/);
  assert.match(engine, /CREATE_PROJECT_MARKERS/);
  assert.match(engine, /details\.assigneeAmbiguity/, 'неоднозначный исполнитель должен уточняться, а не угадываться');
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /assigneeIds: \[create\.assignee\.id\]/);
  assert.match(widget, /projectId: create\.project\.id/);
});

test('digests accept a person focus so every request can be asked about someone', () => {
  const engine = read('server/domain/smart-search.js');
  assert.match(engine, /function todayDigest\(user, focus = null, options = \{\}\)/);
  assert.match(engine, /function weekDigest\(user, focus = null\)/);
  assert.match(engine, /function digestSubjectTail\(rawQuery, patterns\)/);
  assert.match(engine, /DIGEST_TAIL_NOISE/, 'слова про время в хвосте не должны приниматься за имя');
});

test('switching the home-screen mode persists and refreshes navigation', () => {
  const settings = read('public/js/views/settings.js');
  assert.match(settings, /GardenSettings\.update\(\{ overviewHomeMode: input\.value \}\)/);
  assert.match(settings, /renderSidebar\(Router\.current\(\)\)/);
});
test('typing a person slot suggests people with their photos', () => {
  const widget = read('public/js/views/smart-search.js');
  const config = read('public/js/domain/smart-search-ui-config.js');
  assert.match(config, /personSlotMarkers:/);
  assert.match(widget, /avatarWithStatusHtml|avatarHtml/);
});
test('create commands understand verb synonyms and fill people/projects for every record type', () => {
  const engine = read('server/domain/smart-search.js');
  for (const verb of ['поставь', 'подставь', 'добавь', 'назначь', 'оформи', 'зафиксируй', 'запланируй']) {
    assert.ok(engine.includes(`'${verb}'`), `синоним «${verb}» должен распознаваться`);
  }
  assert.match(engine, /const CREATE_PERSON_MARKERS = \{/);
  assert.match(engine, /const CREATE_TARGETS_WITH_DETAILS = new Set\(\['tasks', 'meetings', 'issues', 'agreements'\]\)/);
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /participantIds: \[create\.assignee\.id\]/);
  assert.match(widget, /relatedPersonIds: \[create\.assignee\.id\]/);
  assert.match(widget, /@\[\$\{create\.assignee\.name\}\]\(person:\$\{create\.assignee\.id\}\)/, 'участник договорённости подставляется упоминанием');
});

test('answers stay light: one column of blocks, no per-row icons, human dates', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.smart-answer\{display:flex;flex-direction:column;gap:16px;padding:0;border:0;background:transparent;box-shadow:none;\}/,
    'внешняя карточка вокруг карточек читалась как визуальный шум');
  assert.match(css, /\.smart-sections\{display:flex;flex-direction:column;gap:10px;\}/, 'разделы идут одной колонкой');
  assert.match(css, /\.smart-section\{min-width:0;border:1px solid var\(--border-soft\)/, 'сами разделы — привычные блоки');

  const widget = read('public/js/views/smart-search.js');
  assert.doesNotMatch(widget, /class="smart-row-icon"/, 'иконка в каждой строке дублировала заголовок раздела');
  assert.match(widget, /function smartSearchMetaText\(item\)/);
  assert.match(widget, /item\.dateKind === 'due' \? dueLabel\(item\.date\) : fmtDate\(item\.date\)/,
    'даты должны печататься теми же helpers, что и во всём приложении');

  const engine = read('server/domain/smart-search.js');
  assert.match(engine, /dateKind: 'due'/, 'даты уезжают на клиент структурой, а не строкой с ISO');
  assert.doesNotMatch(engine, /meta: `Срок \$\{dateKey\(task\.dueDate\)\}`/);
  assert.match(engine, /function ruDate\(value\)/, 'в текстах сигналов даты пишутся по-русски');
});

test('the assistant is one centered column, and the input starts low like a chat home screen', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.smart-search\{width:100%;max-width:var\(--smart-column\);margin:0 auto;align-self:center;display:flex;flex-direction:column;gap:22px;--smart-column:760px;--smart-hero-top:15vh;\}/);
  assert.match(css, /\.smart-search\.has-answer\{--smart-hero-top:6vh;\}/, 'с ответом строка поднимается, освобождая место');
  assert.match(css, /\.smart-search > \*\{min-width:0;\}/, 'колонку задаёт сам контейнер, дети только не распирают её содержимым');
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /const hasAnswer = Boolean\(state\.result \|\| state\.busy \|\| state\.error\);/);
});

test('the assistant composer has one continuous surface with no legacy divider strip', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.smart-quick-inputs\{[^}]*border:0;[^}]*background:transparent;/,
    'нижняя строка команд не должна рисовать собственную линию или подложку');
  assert.doesNotMatch(css, /\.smart-input-box::after/,
    'отдельный декоративный слой над кнопкой отправки больше не нужен');
});

test('the Overview never flashes a header on its way into assistant mode', () => {
  const overview = read('public/js/views/overview.js');
  const head = overview.slice(overview.indexOf('Views.overview = async function ()'), overview.indexOf('const view = document.getElementById(\'view\')'));
  assert.match(head, /const assistantHint = GardenSettings\.value\?\.overviewHomeMode === 'assistant';/,
    'режим известен до загрузки данных — иначе шапка успевает мигнуть');
  assert.match(head, /if \(assistantHint\) \{\s*\n\s*setTopbar\(''\);/);
});

test('the notes button lines up with the assistant column, and the query history is gone', () => {
  const css = read('public/css/system.css');
  assert.match(css, /\.overview-smart-notes\{position:absolute;top:0;right:max\(0px,calc\(\(100% - var\(--smart-column\)\) \/ 2\)\)/);
  const widget = read('public/js/views/smart-search.js');
  assert.doesNotMatch(widget, /smart-history/, 'история запросов больше не показывается');
  assert.doesNotMatch(widget, /smartSearchRememberQuery/, 'и не пишется в настройки');
});

test('the assistant digests and search keep the same task ranking as the Overview widgets', () => {
  const engine = read('server/domain/smart-search.js');
  const taskPriority = read('server/domain/task-priority.js');
  const search = read('server/routes/search.js');
  const constants = read('public/js/domain/constants.js');
  const weights = taskPriority.slice(taskPriority.indexOf('const TASK_PRIORITY_WEIGHTS'), taskPriority.indexOf('function dateKey'));
  assert.match(engine, /require\('\.\/task-priority'\)/, 'assistant should use the shared server task ranking');
  assert.match(search, /require\('\.\.\/domain\/task-priority'\)/, 'search should use the shared server task ranking');
  ['balanced', 'deadline', 'importance', 'overdue'].forEach((mode) => {
    const fromEngine = weights.match(new RegExp(`${mode}: \\{([^}]*)\\}`))?.[1]?.replace(/\s/g, '');
    const fromClient = constants.match(new RegExp(`${mode}: \\{[\\s\\S]*?weights: \\{([^}]*)\\}`))?.[1]?.replace(/\s/g, '');
    assert.ok(fromEngine && fromClient, `не удалось прочитать веса стратегии ${mode}`);
    assert.equal(fromEngine, fromClient, `веса стратегии «${mode}» разошлись между сервером и клиентом`);
  });
  const meetingTypes = engine.match(/const MEETING_TYPE_LABEL = \{([^}]*)\}/)?.[1]?.replace(/\s/g, '');
  const clientTypes = constants.match(/const MEETING_TYPE_LABEL = \{([^}]*)\}/)?.[1]?.replace(/\s/g, '');
  assert.equal(meetingTypes, clientTypes, 'подписи типов встреч должны совпадать с клиентскими');
});

test('the "Мои задачи" list sorts by the same priority scoring as the Overview widget, not creation order', () => {
  // Реальная проверка поведения, а не только текста: исполняем constants.js в
  // песочнице (чистый клиентский JS без DOM) и прогоняем через него набор
  // задач — просроченная должна оказаться выше сегодняшней, важная задача без
  // срока — выше обычной задачи «через пару дней», и т.д.
  const vm = require('node:vm');
  const sandbox = { todayStr: () => '2026-09-09' };
  vm.createContext(sandbox);
  vm.runInContext(read('public/js/domain/constants.js'), sandbox);

  const overdue = { title: 'Просрочена 5 дней', dueDate: '2026-09-04', priority: 'normal' };
  const today = { title: 'Сегодня', dueDate: '2026-09-09', priority: 'normal' };
  const importantNoDate = { title: 'Важная, без срока', dueDate: null, priority: 'high' };
  const soon = { title: 'Через 2 дня', dueDate: '2026-09-11', priority: 'normal' };
  const noSignal = { title: 'Без срока и не важная', dueDate: null, priority: 'normal' };
  // Реальный баг, замеченный на живом списке: у завершённой задачи с давно
  // прошедшим дедлайном «просрочка» не должна ничего значить — иначе готовая
  // задача обгоняет активные todo/in_review только потому, что её когда-то
  // забыли закрыть до срока.
  const doneOverdue = { title: 'Готова, дедлайн давно прошёл', dueDate: '2026-08-01', priority: 'high', status: 'done' };
  const archivedSoon = { title: 'В архиве, дедлайн скоро', dueDate: '2026-09-10', priority: 'high', archivedAt: '2026-08-15T00:00:00.000Z' };
  // Второй реальный баг с того же списка: без учёта статуса задача «На паузе»
  // без дедлайна и задача «К выполнению» без дедлайна получали одинаковый
  // счёт 0 и расходились только по алфавиту названия — пауза оказывалась
  // выше активных дел чисто случайно. Статус должен решать раньше срока.
  const pausedOverdue = { title: 'На паузе, дедлайн давно прошёл', dueDate: '2026-08-01', priority: 'high', status: 'paused' };
  const blockedNoDate = { title: 'Заблокирована, без срока', dueDate: null, priority: 'normal', status: 'blocked' };

  const sorted = [noSignal, soon, overdue, today, importantNoDate, doneOverdue, archivedSoon, pausedOverdue, blockedNoDate]
    .sort((a, b) => sandbox.compareTasksByPriority(a, b, 'balanced', '2026-09-09'));
  assert.deepEqual(sorted.map((t) => t.title), [
    'Просрочена 5 дней', 'Сегодня', 'Важная, без срока', 'Через 2 дня', 'Без срока и не важная',
    'На паузе, дедлайн давно прошёл', 'Заблокирована, без срока',
    'В архиве, дедлайн скоро', 'Готова, дедлайн давно прошёл',
  ], 'приоритет: активные (по сроку/важности) → приостановленные/заблокированные (тоже по сроку/важности между собой) → завершённые/архивные, независимо от их дедлайна');

  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /function sortTasksForDisplay\(/, 'должна быть отдельная функция сортировки, переиспользуемая списком и канбаном');
  assert.match(tasks, /compareTasksByPriority\(/, 'сортировка должна использовать общую функцию из domain/constants.js, а не свою копию');
  assert.match(tasks, /taskGroupsFor\(rawListTasks\)[\s\S]*sortTasksForDisplay\(rawListTasks\)/, 'группировка по статусу/сотруднику/проекту должна сортировать список перед разбивкой на группы');
  assert.match(tasks, /Views\._taskViewMode === 'kanban'\)[\s\S]{0,200}sortTasksForDisplay\(tasks\)/, 'канбан должен сортировать карточки тем же способом, что и список');
  // Ручного переключателя сортировки на странице больше нет — сортировка
  // всегда тихо следует стратегии из Настроек, а место на панели фильтров,
  // где раньше был переключатель, теперь занимает поиск по задачам.
  assert.doesNotMatch(tasks, /task-sort-filter/, 'переключатель сортировки убран со страницы');
  assert.doesNotMatch(tasks, /openTaskSortMenu/, 'меню выбора стратегии сортировки убрано со страницы');
  assert.match(tasks, /GardenSettings\.value\?\.taskPriorityMode/, 'сортировка должна молча брать стратегию из Настроек, без переопределения на странице');
});

test('clicking the "Важная" label on the tasks page filters the list to high-priority tasks only', () => {
  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /Views\._taskPriorityFilter = Views\._taskPriorityFilter \|\| false;/, 'должно быть отдельное состояние фильтра «только важные»');
  assert.match(tasks, /if \(Views\._taskPriorityFilter\) tasks = tasks\.filter\(\(t\) => t\.priority === 'high'\);/, 'фильтр должен реально сужать список задач');
  // Клик — делегирование на #task-content, а не на priorityBadge внутри
  // entity-ui.js: тот переиспользуется на странице сотрудника и проекта,
  // где кликабельности быть не должно.
  assert.match(tasks, /content\.addEventListener\('click', \(event\) => \{\s*\n\s*if \(!event\.target\.closest\('\.priority-high'\)\) return;\s*\n\s*event\.stopPropagation\(\);/, 'клик по лейблу должен обрабатываться делегированием на #task-content и не всплывать к обработчику строки/карточки');
  assert.match(tasks, /Views\._taskPriorityFilter = true;\s*\n\s*Views\.tasks\(\);/, 'клик должен включать фильтр и перерисовывать страницу');
  assert.match(tasks, /id="task-priority-filter-clear"/, 'должна быть кнопка снятия фильтра — иначе пустой результат фильтра некуда кликнуть, чтобы вернуться');
  assert.match(tasks, /clearBtn\.onclick = \(\) => \{ Views\._taskPriorityFilter = false; Views\.tasks\(\); \}/, 'кнопка «Показать все» должна сбрасывать фильтр');
  assert.match(tasks, /bindPriorityFilterClear\(\);/g, 'кнопку сброса нужно перепривязывать и после частичной перерисовки живым поиском, не только при первом рендере');

  const entityUi = read('public/js/lib/entity-ui.js');
  assert.doesNotMatch(entityUi, /function priorityBadge\(priority\) \{\s*\n\s*if \(priority !== 'high'\) return '';\s*\n\s*return `<span class="ui-tag badge priority-high"[^`]*clickable/, 'сам priorityBadge не должен становиться кликабельным глобально — кликабельность нужна только на странице задач');

  const css = read('public/css/style.css');
  assert.match(css, /#task-content \.priority-high\{cursor: pointer;\}/, 'курсор-указатель должен быть только в рамках страницы задач, а не у бейджа везде');
});

test('priority sorting used on the tasks page also applies to the person Development tab and the project Tasks tab', () => {
  // Раньше вкладка «Развитие» сортировала по своим правилам (готовые вниз,
  // дальше по свежести), а вкладка задач проекта не сортировала вовсе —
  // из-за этого порядок расходился со страницей «Задачи».
  const people = read('public/js/views/people.js');
  assert.match(people, /function personDevelopmentHtml\(p, data\) \{[\s\S]{0,900}compareTasksByPriority\(a, b, priorityMode, todayForSort\)/, 'вкладка «Развитие» должна сортировать тем же общим компаратором приоритета');
  assert.doesNotMatch(people, /const aDone = a\.status === 'done' \? 1 : 0;/, 'старый самодельный сорт (готово/по свежести) должен быть удалён');

  const projects = read('public/js/views/projects.js');
  assert.match(projects, /function projectDetailTabBody\(data, key\) \{\s*\n\s*if \(key === 'tasks'\) \{[\s\S]{0,400}compareTasksByPriority\(a, b, mode, today\)/, 'вкладка «Задачи» карточки проекта должна сортировать задачи, а не показывать их в порядке ответа сервера');
});

test('project and person detail tabs show a count of open tasks, issues and agreements', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  assert.match(entityUi, /function listTabCountHtml\(count\) \{\s*\n\s*return count > 0 \? `<span class="list-tab-count">\$\{count\}<\/span>` : '';/, 'должен быть переиспользуемый рендер бейджа-счётчика на вкладке, использующий существующий класс .list-tab-count');

  const projects = read('public/js/views/projects.js');
  assert.match(projects, /tasks: data\.tasks\.filter\(\(t\) => t\.status !== 'done' && !t\.archivedAt\)\.length,/, 'счётчик задач проекта должен считать незавершённые и неархивные');
  assert.match(projects, /issues: data\.issues\.filter\(\(i\) => i\.status !== 'resolved'\)\.length,/, 'счётчик проблем проекта должен считать нерешённые');
  assert.match(projects, /agreements: \(data\.agreements \|\| \[\]\)\.filter\(\(a\) => a\.status !== 'done'\)\.length,/, 'счётчик договорённостей проекта должен считать невыполненные');
  assert.match(projects, /\$\{t\.label\}\$\{listTabCountHtml\(projectTabCounts\[t\.key\] \|\| 0\)\}/, 'счётчик должен реально попадать в разметку вкладки проекта');

  const people = read('public/js/views/people.js');
  assert.match(people, /tasks: historyTasks\.filter\(\(t\) => t\.status !== 'done'\)\.length,/, 'счётчик задач сотрудника должен считать незавершённые из того же набора, что рендерит вкладка «Задачи»');
  assert.match(people, /issues: data\.issues\.filter\(\(i\) => i\.status !== 'resolved'\)\.length,/, 'счётчик проблем сотрудника должен считать нерешённые');
  assert.match(people, /agreements: data\.agreements\.filter\(\(a\) => a\.status !== 'done'\)\.length,/, 'счётчик договорённостей сотрудника должен считать невыполненные');
  assert.match(people, /\$\{t\.label\}\$\{listTabCountHtml\(personTabCounts\[t\.key\] \|\| 0\)\}/, 'счётчик должен реально попадать в разметку вкладки сотрудника');

  const css = read('public/css/style.css');
  assert.match(css, /\.tab\.active \.list-tab-count\{background: color-mix\(in srgb, var\(--ltc-color\) 22%, transparent\);\}/, 'активная вкладка карточки должна подсвечивать счётчик так же, как это уже работает у вкладок-фильтров (.list-tab)');
});

test('the tasks page has a third "wide list" view between compact list and kanban', () => {
  const tasks = read('public/js/views/tasks.js');
  // Три кнопки представления, в этом порядке: компактный список, широкий
  // список, канбан.
  assert.match(tasks, /id="task-view-list" title="Компактный список"[\s\S]{0,250}id="task-view-wide" title="Широкий список"[\s\S]{0,250}id="task-view-kanban" title="Канбан"/, 'три кнопки представления должны идти в порядке компактный/широкий/канбан');
  assert.match(tasks, /const isWide = Views\._taskViewMode === 'wide';/, 'должно быть отдельное состояние для широкого списка, не совпадающее с канбаном');
  // Растягивание рабочей области переиспользует тот же класс, что и у канбана
  // (.task-board-wide), а не собственный — раз по требованию расширяется
  // «как в Канбане».
  assert.match(tasks, /view\.classList\.toggle\('task-board-wide', isKanban \|\| isWide\);/, 'широкий список должен растягивать страницу тем же способом, что и канбан');
  assert.match(tasks, /document\.getElementById\('task-view-wide'\)\.onclick = \(\) => \{ Views\._taskViewMode = 'wide'; Views\.tasks\(\); \};/, 'должен быть обработчик клика на кнопку широкого списка');

  // Разметка строки: собственная функция, не переиспользующая taskListRowHtml
  // напрямую — тот рендерит и на страницах поиска/ассистента, где колонки
  // с кодом задачи быть не должно.
  assert.match(tasks, /function taskWideListRowHtml\(t\) \{[\s\S]{0,600}task-key-cell tiny[\s\S]{0,50}t\.taskKey/, 'у строки широкого списка должна быть колонка с кодом задачи (taskKey)');
  assert.match(tasks, /const rowRenderer = isWideList \? taskWideListRowHtml : taskListRowHtml;/, 'группировка должна переключать рендер строки в зависимости от режима');
  assert.match(tasks, /\$\{isWideList \? 'task-groups-wide' : ''\}/, 'обёртка списка должна отмечаться модификатором для широкого режима');

  // Компактный список и канбан не должны получить новую колонку — только
  // widget-специфичный класс её вводит.
  const entityRenderers = read('public/js/domain/entity-renderers.js');
  assert.doesNotMatch(entityRenderers, /task-key-cell/, 'обычная (переиспользуемая) строка списка задач не должна получить колонку с кодом задачи');

  const css = read('public/css/style.css');
  assert.match(css, /\.task-list-row-wide \.task-key-cell\{flex: 0 0 auto;width: 96px;/, 'колонка с кодом задачи должна иметь фиксированную ширину, достаточную для самого длинного префикса (GARDEN)');
});

test('overdue due dates are labelled "X дн. назад" instead of "просрочено на X дн"', () => {
  const util = read('public/js/lib/util.js');
  assert.match(util, /if \(diff < 0\) return `\$\{Math\.abs\(diff\)\} дн\. назад`;/, 'формулировка просроченного срока должна быть короче — «X дн. назад» вместо «просрочено на X дн»');
  assert.doesNotMatch(util, /просрочено на/, 'старая формулировка не должна остаться нигде в dueLabel');
});

test('task list rows on the tasks page (compact and wide) get wider column gaps and lighter dividers, but keep the standard filled labels', () => {
  const css = read('public/css/style.css');
  // Расстояние между колонками строки — раздвинуто и одинаково что между
  // статусом/кодом/названием (gap самой строки), что внутри правого кластера
  // лейблы/срок/исполнитель (column-gap у .tl-right).
  assert.match(css, /#task-content \.task-list-row\{gap: 14px;\}/, 'расстояние между статусом/кодом/названием и правым кластером должно быть увеличено');
  assert.match(css, /#task-content \.task-list-row \.tl-right\{column-gap: 18px;\}/, 'расстояние между лейблами/сроком/исполнителем должно быть увеличено');

  // Разделительные линии — та же ширина 1px (меньше на растровом экране не
  // получится), но менее контрастные: странице задач переопределяем общую
  // переменную --ui-divider, которую читают и бордер строки, и бордер группы.
  assert.match(css, /#task-content\{--ui-divider: color-mix\(in srgb, var\(--border-soft\) 55%, transparent\);\}/, 'линии-разделители в списке задач должны быть светлее (тоньше на вид), чем стандартный --ui-divider');

  // Лейблы («Важная», тип задачи, проект) вернули к обычному закрашенному
  // виду — пользователь попросил отменить прозрачно-обводочный редизайн,
  // так что в строке списка задач для .ui-tag/.badge/.project-chip не должно
  // остаться никакого прозрачного фона с обводкой по тону.
  assert.doesNotMatch(css, /background: transparent !important;\s*border: 1px solid color-mix\(in srgb, var\(--ui-tag-tone\)/, 'лейблы в строке списка задач не должны иметь прозрачный фон с цветной обводкой');

  // Клик-фильтр по «Важная» (см. предыдущий тест про приоритет) — простое
  // правило без лишней специфичности, раз прозрачный фон лейблов убран.
  assert.match(css, /#task-content \.priority-high\{cursor: pointer;\}/, '«Важная» в списке задач должна оставаться кликабельной');
  assert.match(css, /#task-content \.priority-high:hover\{background: color-mix\(in srgb, var\(--orange\) 22%, var\(--bg-elevated-2\)\) !important;\}/, 'подсветка при наведении на «Важная» должна работать');
});

test('group header rows on the tasks page have no color highlight at all, and stay scoped to that page', () => {
  // Пользователь сначала попросил акцентную подсветку, затем серую, а потом
  // явно попросил убрать выделение цветом совсем — заголовок группы должен
  // остаться обычным текстом без фона, как до всех этих правок.
  const css = read('public/css/style.css');
  assert.doesNotMatch(css, /#task-content \.task-group-section\.separated \.group-header\{[^}]*background: color-mix/, 'у заголовка группы на странице задач не должно остаться подсветки цветом (ни акцентной, ни серой)');
  assert.doesNotMatch(css, /#task-content \.task-group-section\.separated \.group-header:hover\{[^}]*background: color-mix/, 'подсветка при наведении на заголовок группы тоже должна быть убрана');
  assert.doesNotMatch(css, /#task-content \.task-groups > \.task-group-section\.separated:first-child \.group-header\{margin-top: 8px;\}/, 'временная поправка отступа первой группы (под цветную подсветку) больше не нужна');
});

test('the wide task list view uses the same work-area gutter as the Calendar page, not its own narrower one', () => {
  const css = read('public/css/style.css');
  assert.match(css, /\.view\.task-board-wide\{max-width: none;padding-left: var\(--wide-content-gutter, 24px\);padding-right: var\(--wide-content-gutter, 24px\);overflow-x: hidden;\}/, 'широкий список/канбан должны использовать общий --wide-content-gutter (тот же, что и у Календаря), а не собственные фиксированные 18px');
});

test('switching between compact and wide task list view animates the work-area width instead of snapping', () => {
  const css = read('public/css/style.css');
  // Специфичность через #view нужна, чтобы не потерять существующий transition
  // для отступа под панель комментариев Обзора (.main > .view{transition:
  // margin-right .22s ease} в system.css) — оба свойства должны остаться в силе.
  assert.match(css, /#view\.task-page\{transition: padding 220ms cubic-bezier\(\.22,\.75,\.18,1\), margin-right \.22s ease;\}/, 'переключение компактный/широкий список должно плавно анимировать боковые отступы рабочей области');
});

test('hovering a task due date in the list shows the full deadline date as a tooltip', () => {
  const renderers = read('public/js/domain/entity-renderers.js');
  assert.match(renderers, /function taskDueTooltip\(t\) \{\n {2}return t\?\.dueDate \? `Дедлайн по задаче: \$\{fmtDate\(t\.dueDate\)\}` : '';\n\}/, 'должна быть функция, формирующая полную дату для подсказки по сроку');
  assert.match(renderers, /<span class="tiny" title="\$\{escapeHtml\(taskDueTooltip\(t\)\)\}" style="\$\{overdue \? 'color:var\(--red\)' : ''\}">\$\{taskDueLabel\(t\)\}<\/span>/, 'компактная строка списка задач должна показывать подсказку по сроку при наведении');

  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /<span class="tiny" title="\$\{escapeHtml\(taskDueTooltip\(t\)\)\}" style="\$\{overdue \? 'color:var\(--red\)' : ''\}">\$\{taskDueLabel\(t\)\}<\/span>/, 'широкая строка списка задач должна показывать ту же подсказку по сроку при наведении');
});

test('the "Мои задачи" list has a compact icon search instead of the sort dropdown', () => {
  const tasks = read('public/js/views/tasks.js');
  // Иконка-кнопка вместо всегда открытого текстового поля — не занимает
  // место на панели фильтров, пока поиск не нужен.
  assert.match(tasks, /id="task-search-toggle"[^>]*>\$\{icon\('search', 16\)\}/, 'должна быть иконка поиска, открывающая текстовое поле по клику');
  assert.match(tasks, /id="task-search-input"/, 'по клику на иконку должно появляться поле ввода');
  assert.match(tasks, /id="task-search-close"/, 'у развёрнутого поиска должна быть кнопка закрытия');
  assert.match(tasks, /function filterTasksByQuery\(/, 'должна быть отдельная функция текстового поиска по названию задачи');
  assert.match(tasks, /searchInput\.oninput = \(\) => \{[\s\S]{0,300}filterTasksByQuery\(preSearchTasks, Views\._taskQuery\)/, 'поиск должен фильтровать список на лету, без похода на сервер на каждую букву');

  const css = read('public/css/style.css');
  assert.match(css, /\.task-sticky-toolbar \.task-search-slot\{margin-left: auto;/, 'блок поиска должен быть прижат к правому краю панели фильтров');
  // Реальный баг: класс-обёртка назывался .task-filter-search — то же имя,
  // что у не связанного с этой страницей компонента (.task-filter-search-wrap
  // .task-filter-search в style.css/system.css, поиск в другом списке с
  // вкладками). Его правило `flex: 1 1 0%` совпадало по имени класса и
  // забирало всё свободное место у flex-контейнера себе, из-за чего margin-
  // left: auto переставал что-либо сдвигать (auto-отступы получают свободное
  // место только после того, как flex-grow его не разобрал). Обёртку
  // переименовали в task-search-slot, чтобы не совпадать с чужим классом.
  assert.doesNotMatch(tasks, /class="task-filter-search"/, 'обёртка поиска не должна называться так же, как чужой компонент .task-filter-search-wrap .task-filter-search — совпадение имени класса ломает margin-left: auto через чужой flex: 1 1 0%');
});

test('the due-date column in the "Мои задачи" list is one fixed width for the whole page, not per row', () => {
  // Реальный баг с живого списка: ячейка под срок рендерилась только когда у
  // конкретной задачи есть dueDate, поэтому у задач без срока лейбл проекта
  // стоял ближе к аватарке, чем у соседних задач со сроком — колонки внутри
  // списка не были выровнены. Правило: если срока нет ни у одной видимой
  // задачи на странице — колонка схлопывается совсем; если есть хотя бы у
  // одной — у всех строк резервируется одна и та же ширина, по самому
  // длинному из реально показанных текстов (без запаса «на вырост»).
  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /function syncTaskDueColumnWidth\(container\)/, 'должна быть отдельная функция, синхронизирующая ширину колонки срока по всей странице');
  assert.match(tasks, /container\.querySelectorAll\('\.task-due-cell span'\)/, 'ширина должна считаться по реально отрисованным текстам, а не по эвристике/константе');
  // Реальный баг: у самого текста — inline <span> (class="tiny"), а
  // offsetWidth/scrollWidth у строчных элементов в браузере всегда 0 (это
  // общее свойство inline-элементов, не связанное с display:none) — из-за
  // этого колонка каждый раз открывалась на 0px и обрезала весь текст срока,
  // хотя данные были на месте. getBoundingClientRect() у inline работает как
  // положено и должен использоваться вместо scrollWidth/offsetWidth.
  assert.match(tasks, /maxWidth = Math\.max\(maxWidth, span\.getBoundingClientRect\(\)\.width\)/, 'ширина inline-текста должна мериться через getBoundingClientRect, а не scrollWidth/offsetWidth (у inline-элементов они всегда 0)');
  assert.doesNotMatch(tasks, /span\.scrollWidth|span\.offsetWidth/, 'нельзя мерить ширину inline-текста через scrollWidth/offsetWidth — это всегда 0');
  assert.match(tasks, /classList\.add\('has-task-due-dates'\);\s*\n\s*const dueSpans/, 'класс нужно включить до измерения — иначе .task-due-cell ещё скрыт (display:none) и измерение тоже даст 0');
  assert.match(tasks, /classList\.toggle\('has-task-due-dates', dueSpans\.length > 0\)/, 'колонка должна полностью схлопываться, если у видимых задач нет срока, а не просто становиться нулевой ширины');
  assert.match(tasks, /setProperty\('--task-due-col-width', `\$\{Math\.ceil\(maxWidth\)\}px`\)/, 'ширина должна браться по самому длинному реально показанному тексту, а не с фиксированным запасом');
  // Функция должна перезапускаться на каждом рендере списка задач — и при
  // обычной загрузке страницы, и при живой фильтрации по тексту поиска
  // (иначе колонка не пересчитается, когда поиск сузил видимый набор задач).
  assert.match(tasks, /content\.innerHTML = taskListContentHtml\(tasks, archiveMode, allTasksCount, groups\);\s*\n\s*syncTaskDueColumnWidth\(content\);/, 'колонку нужно пересчитывать после обычного рендера списка');
  assert.match(tasks, /taskGroupsFor\(shown\)\);\s*\n\s*syncTaskDueColumnWidth\(content\);/, 'колонку нужно пересчитывать и после живой фильтрации по поиску');

  const css = read('public/css/style.css');
  assert.match(css, /#task-content \.task-due-cell\{display: none;\}/, 'по умолчанию колонка срока должна быть схлопнута');
  assert.match(css, /#task-content\.has-task-due-dates \.task-due-cell\{display: block;width: var\(--task-due-col-width, 118px\);/, 'колонка должна раскрываться на общую для всей страницы ширину только когда на странице есть хоть один срок');
  assert.match(css, /#task-content \.tl-right\{grid-template-columns: minmax\(170px, 220px\) 64px;\}/, 'без сроков на странице сетка строки должна состоять только из двух колонок — теги и аватар вплотную');
  assert.match(css, /#task-content\.has-task-due-dates \.tl-right\{grid-template-columns: minmax\(170px, 220px\) var\(--task-due-col-width, 118px\) 64px;\}/, 'с хотя бы одним сроком на странице сетка строки должна резервировать общую колонку между тегами и аватаром');
});

test('page details inherit dark-theme glow without a solid panel patch', () => {
  const css = read('public/css/detail-page.css');
  assert.match(css, /html\.theme-dark\.glow-enabled \.view\.task-detail-page-view > \.modal-panel\.modal-task-detail\.task-detail-page \{[\s\S]*background: transparent !important;/);
  assert.doesNotMatch(css, /nnn\.task-detail-topbar-actions|\}n\.view/, 'malformed dead CSS from an old notes-sidebar patch must stay removed');
});


test('assistant empty search result stays concise without generic follow-up examples', () => {
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /По запросу «\$\{escapeHtml\(result\.query\)\}» ничего не нашлось\./);
  assert.doesNotMatch(widget, /Попробуйте «как дела у …», «обзор недели», «открой задачи» или «запиши в журнал …»/);
});

test('assistant search cards link to entity sections and task overflow counts only open tasks', () => {
  const widget = read('public/js/views/smart-search.js');
  assert.match(widget, /tasks: \{ label: 'Все задачи', route: '\/tasks' \}/);
  assert.match(widget, /issues: \{ label: 'Все проблемы', route: '\/issues' \}/);
  assert.match(widget, /meetings: \{ label: 'Все встречи', route: '\/meetings' \}/);
  assert.match(widget, /footer: smartSearchSectionFooter\(group, result\)/,
    'каждая карточка поисковой выдачи должна вести в свой раздел');
  assert.doesNotMatch(widget, /footer: items\.length > 6 \? \{ label: `Ещё результаты`/,
    'внизу карточки больше не должно быть перехода на общий поиск');
  assert.match(widget, /openTotal = tasks\.filter\(\(task\) => task\.status !== 'done' && !task\.archivedAt\)\.length/,
    'счётчик «ещё» у задач считает только незакрытые задачи');
});

test('Check-in dash is a focus placeholder for the whole editable cell', () => {
  const view = read('public/js/views/checkins.js');
  const css = read('public/css/system.css');
  assert.match(view, /placeholder="—"/);
  assert.match(view, /field\.closest\('\.checkins-cell-editable'\)/);
  assert.match(css, /\.checkins-inline-editor:focus::placeholder \{ color:transparent; opacity:0; \}/);
  assert.match(css, /\.checkins-cell-editable:focus-within \{[\s\S]*box-shadow:inset 0 0 0 1px var\(--accent\)/);
});

test('issues list rows expose interactive status, serious label and related people avatars', () => {
  const view = read('public/js/views/issues.js');
  assert.match(view, /function issueListTitleRowHtml\(issue\)/);
  assert.match(view, /filtered\.map\(issueListTitleRowHtml\)\.join\(''\)/);
  const rowRenderer = view.slice(view.indexOf('function issueListTitleRowHtml'), view.indexOf('Views.issues = async function'));
  assert.match(rowRenderer, /issueStatusBadge\(issue\.status, issue\.id\)/);
  assert.match(rowRenderer, /issue\.severity === 'high'/);
  assert.match(rowRenderer, />серьёзная</);
  assert.match(rowRenderer, /relatedPersonIds/);
  assert.match(rowRenderer, /peopleAvatarStackHtml\(people, \{ limit: 3 \}\)/);
});

test('Check-in employee history rows do not highlight on row hover', () => {
  const css = read('public/css/system.css');
  assert.doesNotMatch(css, /\.checkins-history-table-row:not\(\.checkins-history-table-head\):hover \.checkins-history-table-cell\s*\{[\s\S]*?background:\s*var\(--bg-hover\)/);
});


test('technology section is nested under Development and exposes CRUD table fields', () => {
  const app = read('public/js/app.js');
  const router = read('public/js/lib/router.js');
  const view = read('public/js/views/technology.js');
  const db = read('server/db.js');
  assert.match(app, /key: 'development'[\s\S]*key: 'technology'[\s\S]*label: 'План мероприятий'/);
  assert.match(router, /Views\.technology\(\)/);
  assert.match(view, /Плановая дата проведения/);
  assert.match(view, /Тема/);
  assert.match(view, /Тайминг/);
  assert.match(view, /Драйвер \/ гость/);
  assert.match(view, /Проведено/);
  assert.match(view, /Resources\.technologyEvents\.create/);
  assert.match(view, /Resources\.technologyEvents\.update/);
  assert.match(view, /Resources\.technologyEvents\.remove/);
  assert.match(view, /people: \(\) => store\.people/);
  assert.match(db, /'technologyEvents'/);
});

test('events use Check-in style table navigation, quarter filter, inline completion and export', () => {
  const view = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.match(view, /checkins-view gcal-layout technology-view/);
  assert.match(view, /view\.classList\.remove\('checkins-wide'\)/, 'technology must stay inside the standard work-area width');
  assert.match(view, /gcal-toolbar checkins-toolbar technology-toolbar/);
  assert.match(view, /id="technology-quarter-filter"/);
  assert.match(view, /function technologyYearNavHtml\(\)/);
  assert.match(view, /data-view-state="_technologyYear"/);
  assert.match(view, /Текущий год/);
  assert.match(view, /data-command="openTechnologyExportModal"/);
  assert.match(view, /TabularExport\.download/);
  assert.doesNotMatch(view, /schema\.push\(\{ key: 'completed'/);
  assert.match(view, /if \(!isEdit\) payload\.completed = false/);
  assert.match(view, /Q1 \${year}/);
  assert.match(view, /Q4 \${year}/);
  assert.match(view, />Весь год<\/option>/);
  assert.doesNotMatch(view, /<span>Квартал<\/span>/);
  assert.match(view, /checkins-table technology-table/);
  assert.match(view, /checkins-cell technology-table-cell/);
  assert.match(view, /technology-inline-input/);
  assert.match(css, /\.technology-table\{width:100%;max-width:100%;min-width:0;grid-template-columns:/);
  assert.match(css, /grid-template-columns:subgrid/);
  assert.doesNotMatch(view, /technology-table-row[^`]*data-command=\"openTechnologyEventModal/);
  assert.match(view, /На этот период мероприятий нет/);
  assert.doesNotMatch(view, /В \${technologyYearValue\(\)} году/);
  assert.match(css, /\.technology-empty\{grid-column:1\/-1;padding:12px 12px;\}/);
});

test('technology timing only accepts whole hours and native number controls follow dark theme', () => {
  const view = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.match(view, /type="number" min="1" step="1" inputmode="numeric"/);
  assert.match(view, /Number\.isInteger\(payload\.hours\)/);
  assert.match(view, /Укажите тайминг целым числом часов больше нуля/);
  assert.match(css, /input\[type="number"\]\{color-scheme:light;\}/);
  assert.match(css, /html\.theme-dark input\[type="number"\]\{color-scheme:dark;\}/);
});

test('technology navigation has its own icon distinct from The Labs', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  const icons = fs.readFileSync(path.join(ROOT, 'public/js/lib/icons.js'), 'utf8');
  assert.match(app, /technology:\s*'events'/);
  assert.match(icons, /events:\s*'<rect/);
});


test('events table supports inline editing and edit form excludes completed flag', () => {
  const view = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.match(view, /data-technology-inline="1"/);
  assert.match(view, /function wireTechnologyInlineEditors\(\)/);
  assert.match(view, /Resources\.technologyEvents\.update\(id, \{ \[key\]: value \}\)/);
  assert.match(view, /data-technology-people=/);
  assert.doesNotMatch(view, /schema\.push\(\{ key: 'completed'/);
  assert.match(view, /payload\.completed = Boolean\(item\.completed\)/);
  assert.match(css, /\.technology-table-head\{[^}]*text-transform:none/);
  assert.match(css, /\.technology-inline-input:hover,[^}]*background:transparent!important/);
  assert.doesNotMatch(css, /\.technology-inline-input:focus\{[^}]*box-shadow:inset 0 0 0 1px/);
  assert.match(view, /technology-people-read/);
  assert.match(css, /\.technology-inline-people\{display:none;/);
  assert.match(css, /\.technology-inline-people\.is-editing\{display:block;/);
  assert.match(view, /menuMinWidth: 440/);
  assert.match(view, /menuClass: 'technology-people-menu'/);
  assert.match(css, /\.technology-people-menu \.pp-item-name\{[^}]*overflow:visible/);
});


test('plan events schedules Garden meetings from a calendar action outside the table row', () => {
  const technology = read('public/js/views/technology.js');
  const meetings = read('public/js/views/meetings.js');
  const css = read('public/css/style.css');
  assert.match(technology, /function technologyMeetingForEvent/);
  assert.match(technology, /function scheduleTechnologyMeeting/);
  assert.match(technology, /Запланировать встречу в Garden/);
  assert.match(technology, /Встреча уже запланирована/);
  assert.match(technology, /sourceTechnologyEventId: item\.id/);
  assert.match(technology, /type: 'club'/);
  assert.match(technology, /technology-row-actions/);
  assert.match(css, /\.technology-row-actions\{position:absolute;left:calc\(100% \+ 8px\)/);
  assert.match(css, /\.technology-row-action:disabled\{[^}]*opacity:/);
  assert.match(meetings, /sourceTechnologyEventId: m\.sourceTechnologyEventId/);
  assert.doesNotMatch(technology, /icon\('edit'/);
});

test('plan events can be deleted from the row action gutter', () => {
  const technology = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.match(technology, /data-command=\"deleteTechnologyEvent\"/);
  assert.match(technology, /Удалить мероприятие/);
  assert.match(technology, /icon\('trash', 15\)/);
  assert.match(technology, /async function deleteTechnologyEvent\(id\)/);
  assert.match(technology, /Resources\.technologyEvents\.remove\(id\)/);
  assert.match(technology, /confirmAction\('Удалить это мероприятие\?'\)/);
  assert.match(css, /\.technology-row-actions\{[^}]*display:flex[^}]*gap:2px/);
  assert.match(css, /\.technology-delete-action:hover/);
  assert.match(css, /\.technology-row-actions\{[^}]*opacity:0/);
  assert.match(css, /\.technology-table-row:hover \.technology-row-actions,[^}]*opacity:1/);
});

test('plan events shows full people names and one stable calendar control in the planned date cell', () => {
  const technology = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.match(technology, /technology-person-row/);
  assert.match(technology, /technology-person-name/);
  assert.match(technology, /escapeHtml\(person\.name \|\| ''\)/);
  assert.match(css, /\.technology-people\{display:flex;flex-direction:column/);
  assert.match(css, /\.technology-person-row\{display:flex;align-items:center/);
  assert.match(technology, /class="technology-date-picker"/);
  assert.match(technology, /input\.showPicker/);
  assert.match(css, /\.technology-inline-input\[type="date"\]::-webkit-calendar-picker-indicator\{[^}]*display:none!important/);
  assert.match(css, /\.technology-date-picker\{[^}]*display:inline-grid/);
});

test('plan event single-line inline editors share one vertical text baseline', () => {
  const technology = read('public/js/views/technology.js');
  const css = read('public/css/style.css');
  assert.doesNotMatch(technology, /field\.style\.height = '0px'/);
  assert.match(css, /\.technology-inline-input\{[^}]*height:20px[^}]*line-height:20px/);
  assert.match(css, /\.technology-topic \.technology-inline-input\{[^}]*white-space:nowrap/);
  assert.match(css, /\.technology-date,\.technology-topic,\.technology-timing\{align-items:center;/);
});

test('smart-search cards use compact semantic footers without more counters', () => {
  const smartSearch = fs.readFileSync(path.join(ROOT, 'public/js/views/smart-search.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/system.css'), 'utf8');
  assert.doesNotMatch(smartSearch, /smart-section-more[^\n]*ещё/);
  assert.doesNotMatch(smartSearch, /smart-project-group-more[^\n]*ещё/);
  // font-size accepts the literal or the design-token form: --fs-2xs resolves to 11px in every theme (verified in public/css/style.css :root).
  assert.match(css, /\.smart-section-head-action\{[\s\S]*?font-size:(?:11px|var\(--fs-2xs\));/);
  assert.match(css, /\.smart-section-head-action\{[\s\S]*?border:1px solid var\(--border-soft\)/);
});

test('assistant and search merge multiple result cards into one Tasks-style collapsible surface', () => {
  const view = fs.readFileSync(path.join(ROOT, 'public/js/views/smart-search.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/system.css'), 'utf8');
  assert.match(view, /digest\.sections\.length > 1 \? 'smart-sections-unified'/);
  assert.match(view, /cards\.length > 1 \? 'smart-sections-unified'/);
  assert.match(view, /<details class="smart-section/);
  assert.match(view, /smart-section-chevron/);
  assert.match(css, /\.smart-sections\.smart-sections-unified > \.smart-section \+ \.smart-section\s*\{[\s\S]*?margin-top:32px;[\s\S]*?border-top:0;/);
  // font-size accepts the literal or the design-token form: --smart-section-title-size resolves to 15px (defined once, on .smart-answer, which always wraps .smart-sections-unified).
  assert.match(css, /\.smart-sections\.smart-sections-unified \.smart-section-head h4\s*\{[\s\S]*?font-size:(?:15px|var\(--smart-section-title-size\));[\s\S]*?font-weight:600;/);
  assert.match(css, /\.smart-section\[open\] > \.smart-section-head \.smart-section-chevron\{transform:rotate\(90deg\);\}/);
  assert.match(view, /smart-section-head-action[\s\S]*data-route-stop=\"1\"/);
  assert.match(css, /\.smart-sections\.smart-sections-unified \.smart-section-body > \.smart-row,[\s\S]*?min-height:42px;/);
});

test('assistant cards share one typography and secondary-action scale', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/system.css'), 'utf8');
  assert.match(css, /--smart-section-title-size:15px/);
  assert.match(css, /--smart-row-text-size:14px/);
  assert.match(css, /--smart-action-text-size:11px/);
  assert.match(css, /--smart-action-height:24px/);
  assert.match(css, /\.smart-section-head-action,[\s\S]*?\.smart-section-summary-action,[\s\S]*?\.smart-answer-link\{[\s\S]*?height:var\(--smart-action-height\)/);
  assert.match(css, /\.smart-section-head-button\{font:var\(--smart-action-text-size\)\/1 var\(--font\);font-weight:550;\}/);
});

test('the deadline field on the full task detail page shows its edit pencil by default, not only on hover', () => {
  // Реальная жалоба пользователя: карандаш редактирования дедлайна был
  // виден только при наведении (opacity: 0 в базовом правиле выше в файле),
  // а нативная стрелка выбора даты у браузера скрыта нарочно
  // (input[type=date]::-webkit-calendar-picker-indicator, opacity:0 в
  // system.css) — в сумме кнопка выглядела полностью невидимой: при
  // наведении курсор показывал только нативную подсказку браузера «Показать
  // окно выбора даты», а не наш собственный значок. У полей-select рядом
  // (Проект/Тип/Приоритет) стрелка уже видна по умолчанию — сделали
  // карандаш дедлайна таким же, для единообразия на странице.
  const css = fs.readFileSync(path.join(ROOT, 'public/css/detail-page.css'), 'utf8');
  assert.match(css, /\.view\.task-detail-page-view \.task-inline-edit-due \.task-inline-edit-icon \{\s*\n\s*opacity: \.72;/, 'значок карандаша у дедлайна должен быть виден по умолчанию (как стрелка у select-полей), а не только при наведении');
  assert.match(css, /\.view\.task-detail-page-view \.task-inline-edit-due\.is-editable:hover \.task-inline-edit-icon,\s*\n\s*\.view\.task-detail-page-view \.task-inline-edit-due\.is-editable:focus-within \.task-inline-edit-icon \{\s*\n\s*opacity: \.9;/, 'при наведении/фокусе значок должен становиться чуть заметнее, как у select-полей');
});

test('the wide-list toggle on the tasks page uses a horizontal double-arrow icon, not the generic list icon', () => {
  const icons = read('public/js/lib/icons.js');
  assert.match(icons, /arrowsHorizontal: '<path d="M3\.5 12h17"\/><path d="M7\.2 8\.2 3\.5 12l3\.7 3\.8"\/><path d="M16\.8 8\.2 20\.5 12l-3\.7 3\.8"\/>'/, 'должна быть иконка двусторонней стрелки ↔');

  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /id="task-view-wide" title="Широкий список">\$\{icon\('arrowsHorizontal', 14\)\}/, 'кнопка «Широкий список» должна использовать новую иконку ↔, а не иконку списка');
});

test('dates are abbreviated everywhere (fmtDate month names), except мая which is already short', () => {
  const util = read('public/js/lib/util.js');
  assert.match(util, /const MONTHS_RU = \['янв\.', 'февр\.', 'мар\.', 'апр\.', 'мая', 'июн\.', 'июл\.', 'авг\.', 'сент\.', 'окт\.', 'нояб\.', 'дек\.'\];/, 'месяцы в fmtDate должны быть сокращены (кроме мая, который и так короткий)');
});

test('the due-date column in the task list is right-aligned and sits close to the avatar', () => {
  // Пользователь сначала попросил центрировать колонку срока (чтобы отступы
  // до лейбла и до аватара выглядели одинаково), но затем явно попросил
  // вернуть выравнивание по правому краю и вместо этого просто придвинуть
  // колонку ближе к фото — то есть сократить именно зазор дата→аватар,
  // не трогая зазор лейбл→дата.
  const css = read('public/css/style.css');
  assert.match(css, /\.task-list-row \.task-due-cell\{width: 118px;min-width: 0;text-align: right;white-space: nowrap;\}/, 'колонка срока должна быть прижата вправо, как раньше');
  assert.match(css, /#task-content \.task-list-row \.task-assignee-cell\{margin-left: -8px;\}/, 'аватар в списке задач должен быть сдвинут ближе к дате отрицательным margin-left');
});

test('the sticky task filter toolbar gets a full-width light shadow once the page is scrolled', () => {
  const css = read('public/css/style.css');
  assert.match(css, /\.task-sticky-toolbar::before\{[\s\S]*left: calc\(-1 \* var\(--toolbar-bleed-left, 0px\)\);[\s\S]*right: calc\(-1 \* var\(--toolbar-bleed-right, 0px\)\);[\s\S]*transition: box-shadow 160ms ease;/, 'фон и тень sticky-панели должны быть вынесены в полноширинный слой');
  assert.match(css, /\.task-sticky-toolbar\.is-scrolled::before\{box-shadow: var\(--shadow-card\);\}/, 'при прокрутке тень должна появляться у полноширинной поверхности панели');

  const tasks = read('public/js/views/tasks.js');
  // #view — постоянный узел, переживающий все перерисовки Views.tasks(), так
  // что слушатель обязан быть присвоен через onscroll (перезаписывается), а
  // не через addEventListener (иначе он копился бы с каждым рендером).
  assert.match(tasks, /const toolbarEl = document\.querySelector\('\.task-sticky-toolbar'\);\s*\n\s*view\.onscroll = \(\) => \{ toolbarEl\?\.classList\.toggle\('is-scrolled', view\.scrollTop > 2\); \};/, 'скролл страницы должен переключать класс is-scrolled на панели фильтров через onscroll, а не addEventListener');
});

test('assistant mine suggestions submit immediately after choosing a type', () => {
  const smart = read('public/js/views/smart-search.js');
  assert.match(smart, /function smartSuggestionsForMine\([\s\S]*return smartFilterByTail\(SMART_MINE_TARGETS[\s\S]*insert: `\$\{head\} \$\{item\.insert\}`,[\s\S]*submit: true,/, 'выбор типа после «Покажи мои» должен сразу выполнять запрос');
});

test('the sticky task filter toolbar also gets a full-width divider line on scroll, like the page header', () => {
  // .topbar — прямой соседний элемент #view внутри .main, поэтому её
  // border-bottom идёт по border-box самого .topbar и достаёт до истинных
  // краёв рабочей области. Панель фильтров — дочерний элемент #view и уже
  // самого #view на его боковой padding, так что просто border-bottom на
  // ней самой останавливался бы на этом отступе. Линия-разделитель поэтому
  // сделана псевдоэлементом с бликом на величину реального зазора до .main,
  // измеренного в JS (тот же приём, что и с --task-due-col-width).
  const css = read('public/css/style.css');
  assert.match(css, /\.task-sticky-toolbar\.is-scrolled::after\{\n {2}content: "";\n {2}position: absolute;\n {2}left: calc\(-1 \* var\(--toolbar-bleed-left, 0px\)\);\n {2}right: calc\(-1 \* var\(--toolbar-bleed-right, 0px\)\);\n {2}bottom: 0;\n {2}height: 1px;\n {2}background: var\(--border-soft\);\n\}/, 'при прокрутке под панелью фильтров должна появляться линия-разделитель во всю ширину рабочей области');

  const tasks = read('public/js/views/tasks.js');
  assert.match(tasks, /function syncTaskToolbarBleed\(\) \{/, 'должна быть функция, измеряющая реальный зазор между панелью фильтров и .main');
  assert.match(tasks, /bar\.style\.setProperty\('--toolbar-bleed-left', `\$\{Math\.max\(0, barRect\.left - mainRect\.left\)\}px`\);/, 'зазор слева должен браться из фактических координат, а не из формулы отступа .view');
  assert.match(tasks, /bar\.style\.setProperty\('--toolbar-bleed-right', `\$\{Math\.max\(0, mainRect\.right - barRect\.right\)\}px`\);/, 'зазор справа должен браться из фактических координат, а не из формулы отступа .view');

  // Замер сразу после рендера ловит промежуточное значение анимируемого
  // padding (#view.task-page{transition: padding 220ms...} при переключении
  // компактный ⇄ широкий список), поэтому обязателен и отложенный повторный
  // замер после завершения перехода.
  assert.match(tasks, /syncTaskToolbarBleed\(\);\s*\n\s*setTimeout\(syncTaskToolbarBleed, 260\);/, 'после переключения режима списка зазор должен пересчитываться повторно уже после завершения CSS-перехода padding');

  // Один window-слушатель на всё приложение (флаг вместо addEventListener на
  // каждый рендер) — тот же приём, что и scheduleCalendarFit в calendar.js.
  assert.match(tasks, /if \(!Views\._taskToolbarBleedBound\) \{\s*\n\s*Views\._taskToolbarBleedBound = true;\s*\n\s*window\.addEventListener\('resize', syncTaskToolbarBleed\);/, 'пересчёт зазора при изменении размера окна должен вешаться один раз на всё приложение, а не на каждый рендер списка задач');
});


test('informational labels use the canonical ui-tag component without styling assistant suggestions', () => {
  const css = read('public/css/system.css');
  const meeting = read('public/js/domain/meeting.js');
  const entityUi = read('public/js/lib/entity-ui.js');
  const smartSearch = read('public/js/views/smart-search.js');

  assert.match(css, /Canonical informational label component/);
  assert.match(css, /\.ui-tag\s*\{[\s\S]*?min-height:\s*20px/);
  assert.match(meeting, /class="ui-tag meeting-type badge meeting-type-/);
  assert.equal(entityUi.includes('--ui-tag-dot:'), false, 'entity labels must use --ui-tag-tone, not the retired dot token');

  assert.match(smartSearch, /class="smart-suggestion"/);
  assert.match(smartSearch, /class="smart-suggest-item/);
  assert.equal(/class="[^"]*ui-tag[^"]*smart-suggest/.test(smartSearch), false, 'assistant suggestions must not opt into ui-tag');
  const canonical = css.slice(css.indexOf('*/', css.indexOf('Canonical informational label component')) + 2);
  assert.doesNotMatch(canonical, /\.smart-suggest(?:ion|-item)?\s*[,\{]/);
});
