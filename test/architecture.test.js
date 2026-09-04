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
  assert.match(index, /createJournalSync/);
  assert.match(index, /createRecurringMeetings/);
  assert.match(read('server/domain/journal-sync.js'), /syncJournalDerivedEntity/);
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
  assert.match(meetings, /function openMeetingModal\(existing\) \{\s*\n\s*if \(existing && existing\.id\) \{ Router\.go\(meetingPath\(existing\)\); return; \}/);
});

test('all registered themes are wired everywhere a theme must be listed (style.css, interactions.js, index.html, server settings), and the excluded ones stay out', () => {
  // История токена: базовый набор тем был расширен новыми палитрами (Алмаз/Опал/Графит/Оникс/Нефрит/
  // 2×Zendesk), заменённых двумя темами UI Kit Minimal. Позже поверх текущей геометрии/типографики Minimal, а затем дополнен новыми светлыми палитрами. Нефрит и оба Zendesk остаются осознанно не перенесёнными.
  const style = read('public/css/style.css');
  const interactions = read('public/js/lib/interactions.js');
  const indexHtml = read('public/index.html');
  const settingsJs = read('server/routes/settings.js');

  const activeThemes = [
    'chernika', 'myata', 'lavanda', 'tuman',
    'grafit', 'khvoya', 'noch',
    'anuppuccin-latte', 'anuppuccin-mocha',
  ];
  assert.match(style, /:root\s*\{/, 'базовые fallback-токены задаются в :root');
  for (const name of activeThemes) {
    assert.match(style, new RegExp(`html\\.theme-${name}\\s*\\{`), `style.css: нет блока токенов для темы "${name}"`);
    assert.match(interactions, new RegExp(`value:\\s*'${name}'`), `interactions.js: тема "${name}" не зарегистрирована в GARDEN_THEMES`);
    assert.match(indexHtml, new RegExp(`'${name}'`), `index.html: тема "${name}" не в анти-FOUC списке THEME_MODES`);
    assert.match(settingsJs, new RegExp(`'${name}'`), `routes/settings.js: тема "${name}" не в серверном THEME_VALUES — сохранённое значение будет отброшено`);
  }

  // Обобщённый переключатель тёмного режима для форм-контролов (стрелка select,
  // иконка календаря) не должен зависеть от конкретного имени тёмной темы.
  assert.match(interactions, /classList\.toggle\('theme-dark',\s*isDarkTheme\(theme\)\)/);
  assert.doesNotMatch(read('public/css/system.css'), /html\.theme-khvoya\b/, 'system.css: форм-контролы должны переключаться по общему .theme-dark, а не по конкретной теме');

  const excludedThemeNames = ['garden', 'zendesk-light', 'zendesk-dark'];
  for (const name of excludedThemeNames) {
    const needle = new RegExp(`theme-${name}\\b|'${name}'`);
    assert.doesNotMatch(style, needle, `тема "${name}" осознанно не перенесена, но встречается в style.css`);
    assert.doesNotMatch(interactions, needle, `тема "${name}" осознанно не перенесена, но встречается в interactions.js`);
    assert.doesNotMatch(indexHtml, needle, `тема "${name}" осознанно не перенесена, но встречается в index.html`);
    assert.doesNotMatch(settingsJs, needle, `тема "${name}" осознанно не перенесена, но встречается в routes/settings.js`);
  }
});

test('removed themes are absent from appearance settings', () => {
  const settingsView = read('public/js/views/settings.js');
  for (const name of ['minimal-light','ocean','provence','home-garden','greece','mountain-dawn','mountain-road','fog','clarity','clarity-dark','rime','pastel','forest-mushrooms','spring','anuppuccin-light','anuppuccin-dark','sumerki-sada','len','pergament','shipovnik','ten','cupertino','cupertino-dark','cupertino-forest','cupertino-forest-dark','anuppuccin-frappe','anuppuccin-macchiato']) {
    assert.doesNotMatch(settingsView, new RegExp(`value:\s*'${name}'`));
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

test('server-side settings whitelist accepts all registered theme values, so the choice actually persists (routes/settings.js)', () => {
  // Регрессия, которую поймал ручной прогон в прошлой фазе: THEME_VALUES на
  // сервере не был обновлён при добавлении новых тем — /api/settings молча
  // откатывал выбор пользователя на дефолт при следующей загрузке страницы
  // (bootstrap.js грузит настройки с сервера и переприменяет тему).
  const settings = read('server/routes/settings.js');
  const match = settings.match(/const THEME_VALUES = \[([^\]]*)\]/);
  assert.ok(match, 'THEME_VALUES не найден в server/routes/settings.js');
  assert.match(match[1], /'anuppuccin-mocha'/);
  assert.match(match[1], /'khvoya'/);
  const defaultMatch = settings.match(/theme:\s*'([^']+)'/);
  assert.ok(defaultMatch, 'DEFAULT_USER_SETTINGS.theme не найден');
  assert.strictEqual(defaultMatch[1], 'anuppuccin-latte', 'тема по умолчанию должна быть AnuPpuccin Latte');
  assert.match(settings, /const DEFAULT_ACCENT = 'green'/, 'акцентом по умолчанию должен быть green');
  const indexHtml = read('public/index.html');
  assert.match(indexHtml, /const defaultTheme = 'anuppuccin-latte'/, 'anti-FOUC должен применять AnuPpuccin Latte до первого рендера');
  assert.match(indexHtml, /savedAccent = 'green'/, 'anti-FOUC должен применять зелёный акцент по умолчанию');
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
  assert.match(dbSource, /'checkins',\n\];/, 'db.js: checkins должен быть в основном массиве COLLECTIONS');
  assert.match(dbSource, /checkins:\s*'chk'/, 'db.js: у checkins должен быть префикс id');

  const indexSource = read('server/index.js');
  assert.match(indexSource, /'toolFolders',\n  'checkins',\n\];/, 'index.js: checkins должен быть в COLLECTIONS, иначе registerCrudRoutes не создаст /api/checkins');

  const authCore = read('server/auth-core.js');
  assert.match(authCore, /'checkins\.manage_all':/, 'auth-core.js: должно быть право checkins.manage_all — иначе оно не появится в admin.js/admin.js UI');

  const access = read('server/access-control.js');
  assert.match(access, /OWNER_COLLECTIONS = \[[^\]]*'checkins'/, 'access-control.js: checkins должен быть в OWNER_COLLECTIONS, чтобы createdByUserId проставлялся автоматически');
  assert.match(access, /checkins:'checkins'/, 'access-control.js: checkins должен быть сопоставлен области прав checkins');
  assert.match(access, /'checkins'\]\)\.has\(name\)/, 'access-control.js: canCreate должен разрешать checkins рядовым пользователям (свою запись)');
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
  // Тот же приём, что и sourceJournalId в journal.js: обратная ссылка живёт только
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
  assert.match(constants, /club:\s*'Клаб'/);
  assert.match(constants, /retro:\s*'Ретро'/);
  assert.match(constants, /project:\s*'Проектные'/);
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

test('meeting rows render up to five overlapping participant avatars with an overflow count', () => {
  const meetings = read('public/js/views/meetings.js');
  const css = read('public/css/system.css');
  assert.match(meetings, /function meetingParticipantsHtml\(participants\)[\s\S]*participants\.slice\(0, 5\)/);
  assert.match(meetings, /и ещё \$\{extra\}…/);
  assert.match(meetings, /meeting-participants-stack/);
  assert.doesNotMatch(meetings, /const employee = participants\[0\]/);
  assert.match(css, /\.meeting-participants-stack \.ui-person-avatar[\s\S]*margin-left:\s*-7px/);
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
  assert.match(css, /\.project-detail-page-shell \.task-list-row \.tl-title,[\s\S]*\.person-detail \.task-list-row \.tl-title[\s\S]*font-size: 13px;[\s\S]*font-weight: 400/);
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

test('journal opens task creation modal in place and hands over text plus canonical mentions', () => {
  const journal = read('public/js/views/journal.js');
  const overview = read('public/js/views/overview.js');
  const css = read('public/css/system.css');
  assert.match(journal, /id="journal-create-task"[^>]*>Сделать задачей<\/button>/);
  assert.doesNotMatch(journal, /id="journal-create-task"[^>]*>[^<]*<svg/, 'journal task action must not render an icon');
  assert.match(journal, /const sourceText = serializeEditableToText\(editable\)\.trim\(\)/);
  assert.match(journal, /function journalTaskPrefill\(text\)/);
  assert.match(journal, /type === 'person'[^\n]*assigneeIds\.push\(id\)/, 'canonical employee mentions should prefill task assignees');
  assert.match(journal, /type === 'project'[^\n]*projectId = id/, 'the first canonical project mention should prefill the task project');
  assert.match(journal, /replace\(MENTION_DISPLAY_RE, \(_, label\) => label\)/, 'task title should use visible mention labels rather than canonical markup');
  assert.match(journal, /editable\.innerHTML = ''/);
  assert.match(journal, /FeatureLoader\.run\('openTaskModal', null, \{ prefill \}\)/, 'task creation should open as a modal without leaving Journal');
  assert.doesNotMatch(journal, /Router\.go/, 'journal task action must not navigate to Tasks');
  assert.match(css, /\.journal-composer \.journal-composer-actions \{[\s\S]*margin-left: auto;/);
  assert.match(overview, /return project \? project\.name : 'Проект';/, 'project overview widget title should be only the project name');
  assert.match(overview, /title = project\.name;/);
});


test('journal task handoff uses the same button size as Record', () => {
  const journal = read('public/js/views/journal.js');
  assert.match(journal, /class="ui-button btn journal-create-task" id="journal-create-task">Сделать задачей<\/button>/);
  assert.doesNotMatch(journal, /journal-create-task[^\n]*btn-sm/);
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


test('The Labs uses aligned privacy control and document-style links editor', () => {
  const labs = read('public/js/views/labs.js');
  const css = read('public/css/system.css');
  const style = read('public/css/style.css');
  const meetings = read('public/js/views/meetings.js');
  assert.match(labs, /Приватный проект \(Виден только вам и вашему тимлиду\)/);
  assert.match(labs, /canManagePrivacy = Boolean\(Auth\.isTeamlead\(\)/);
  assert.match(labs, /labLinksEditorHtml\('lab-detail-links'/);
  assert.match(labs, /meeting-document-head/);
  assert.match(labs, /data-lab-link-new-title/);
  assert.match(labs, /data-lab-link-new-url/);
  assert.match(css, /\.lab-private-checkbox\{display:flex;align-items:center/);
  assert.match(css, /\.meeting-document-head\{grid-template-columns:[^}]*72px;align-items:start/);
  assert.match(style, /\.header-menu-popover--notifications\{border-color:var\(--border-soft\);box-shadow:var\(--shadow-card\);\}/);
  assert.match(meetings, /<span>Название<\/span><span>Ссылка<\/span>/);
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

test('deleting a problem/agreement/idea directly asks about its linked Journal entry instead of silently orphaning it', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  assert.match(entityUi, /function askDeleteLinkedJournal\(\)/);
  const issues = read('public/js/views/issues.js');
  assert.match(issues, /issue\?\.sourceJournalId \? await askDeleteLinkedJournal\(\) : false/);
  assert.match(issues, /Resources\.journal\.remove\(issue\.sourceJournalId\)/);
  const agreements = read('public/js/views/agreements.js');
  assert.match(agreements, /a\.sourceJournalId \? await askDeleteLinkedJournal\(\) : false/);
  assert.match(agreements, /Resources\.journal\.remove\(a\.sourceJournalId\)/);
  const labs = read('public/js/views/labs.js');
  assert.match(labs, /idea\.sourceJournalId \? await askDeleteLinkedJournal\(\) : false/);
  assert.match(labs, /Resources\.journal\.remove\(idea\.sourceJournalId\)/);
});

test('the idea edit form still reuses the styled lab-private-checkbox class (not a bare, oversized check-row)', () => {
  const journal = read('public/js/views/journal.js');
  assert.match(journal, /class="lab-private-checkbox journal-idea-visibility" id="jef-idea-visibility"/);
});

test('creating a new idea asks visibility via a direct dialog instead of a checkbox, and remembers the choice through settings', () => {
  const entityUi = read('public/js/lib/entity-ui.js');
  const fn = entityUi.slice(entityUi.indexOf('async function askIdeaVisibility'), entityUi.indexOf('async function askIdeaVisibility') + 1800);
  assert.match(fn, /GardenSettings\.load\(\)/, 'must consult the remembered default before showing the dialog');
  assert.match(fn, /ideaVisibilityDefault === 'private'/);
  assert.match(fn, /ideaVisibilityDefault === 'public'/);
  assert.match(fn, /Применять для всех моих последующих идей/);
  assert.match(fn, /GardenSettings\.update\(\{ ideaVisibilityDefault: isPrivate \? 'private' : 'public' \}\)/);

  const journal = read('public/js/views/journal.js');
  assert.match(journal, /if \(selectedKind === 'idea'\) payload\.private = await askIdeaVisibility\(\);/);
  assert.doesNotMatch(journal, /journal-idea-private/, 'the composer must no longer render the old inline privacy checkbox for new entries');

  const labs = read('public/js/views/labs.js');
  assert.match(labs, /const initialPrivate = isNewIdea \? await askIdeaVisibility\(\) : Boolean\(idea\.private\);/);
  assert.match(labs, /\.\.\.\(isNewIdea \? \[\] : \[\{ key: 'private'/, 'the create-mode schema must not show the old privacy checkbox once the dialog already asked');
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

test('the idea-visibility default is a persisted, whitelisted user setting with a Settings-page control to reset it back to "ask"', () => {
  const settingsRoute = read('server/routes/settings.js');
  assert.match(settingsRoute, /ideaVisibilityDefault: 'ask'/);
  assert.match(settingsRoute, /\['ask', 'private', 'public'\]\.includes\(source\.ideaVisibilityDefault\)/);
  const settingsView = read('public/js/views/settings.js');
  assert.match(settingsView, /name="idea-visibility-default"/);
  assert.match(settingsView, /GardenSettings\.update\(\{ ideaVisibilityDefault: input\.value \}\)/);
});
