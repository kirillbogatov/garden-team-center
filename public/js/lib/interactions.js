// Theme, command palette and keyboard shortcuts.
// ---------------- Тема (светлая / тёмная) ----------------

// Единый реестр тем: отсюда берут данные и настройки в «Настройках», список
// цветовых меток в team-load/аватарах и т.д. Полный список — только там; быстрая
// иконка в сайдбаре (см. cycleTheme ниже) переключает исключительно между
// Туман/Хвоя, а не по кругу через все темы — остальные выбираются
// осознанно, по имени, в «Настройках».
const GARDEN_THEMES = [
  { value: 'chernika', label: 'Черника', mode: 'light', note: 'прохладная' },
  { value: 'myata', label: 'Мята', mode: 'light', note: 'свежая' },
  { value: 'lavanda', label: 'Лаванда', mode: 'light', note: 'мягкая' },
  { value: 'tuman', label: 'Туман', mode: 'light', note: 'нейтральная' },
  { value: 'grafit', label: 'Графит', mode: 'dark', note: 'строгая' },
  { value: 'khvoya', label: 'Хвоя', mode: 'dark', note: 'природная' },
  { value: 'noch', label: 'Ночь', mode: 'dark', note: 'глубокая' },
  // Семейство AnuPpuccin: палитры Catppuccin, перенесённые в стиле темы AnuPpuccin
  // для Obsidian — https://github.com/AnubisNekhet/AnuPpuccin (сама AnuPpuccin
  // построена поверх Catppuccin — https://github.com/catppuccin/catppuccin).
  { value: 'anuppuccin-latte', label: 'AnuPpuccin Latte', mode: 'light', note: 'настраиваемая' },
  { value: 'anuppuccin-mocha', label: 'AnuPpuccin Mocha', mode: 'dark', note: 'настраиваемая' },
];
const THEME_VALUES = GARDEN_THEMES.map((t) => t.value);

// Темы с настраиваемым акцентным цветом (см. ACCENT_COLORS ниже) — сейчас это
// только семейство AnuPpuccin. Значения должны совпадать с ACCENT_THEMES в
// public/index.html (анти-FOUC скрипт) и с server/routes/settings.js.
const ACCENT_THEMES = new Set(['anuppuccin-latte', 'anuppuccin-mocha']);

// 12 официальных акцентов Catppuccin (https://github.com/catppuccin/catppuccin),
// доступных независимо от базовой палитры темы. latte/mocha — цвет свотча для
// светлого/тёмного варианта AnuPpuccin соответственно (см. CSS-переопределения
// html.theme-anuppuccin-<flavor>.accent-<name> в style.css).
const ACCENT_COLORS = [
  { value: 'rosewater', label: 'Розовая вода', latte: '#DC8A78', mocha: '#F5E0DC' },
  { value: 'flamingo', label: 'Фламинго', latte: '#DD7878', mocha: '#F2CDCD' },
  { value: 'pink', label: 'Розовый', latte: '#EA76CB', mocha: '#F5C2E7' },
  { value: 'mauve', label: 'Мальва', latte: '#8839EF', mocha: '#CBA6F7' },
  { value: 'red', label: 'Красный', latte: '#D20F39', mocha: '#F38BA8' },
  { value: 'maroon', label: 'Бордовый', latte: '#E64553', mocha: '#EBA0AC' },
  { value: 'peach', label: 'Персиковый', latte: '#FE640B', mocha: '#FAB387' },
  { value: 'yellow', label: 'Жёлтый', latte: '#DF8E1D', mocha: '#F9E2AF' },
  { value: 'green', label: 'Зелёный', latte: '#40A02B', mocha: '#A6E3A1' },
  { value: 'teal', label: 'Бирюзовый', latte: '#179299', mocha: '#94E2D5' },
  { value: 'sky', label: 'Небесный', latte: '#04A5E5', mocha: '#89DCEB' },
  { value: 'lavender', label: 'Лавандовый', latte: '#7287FD', mocha: '#B4BEFE' },
];
const ACCENT_VALUES = ACCENT_COLORS.map((a) => a.value);
// Зелёный — акцент по умолчанию для AnuPpuccin Latte/Mocha у новых пользователей.
const DEFAULT_ACCENT = 'green';

function themeMeta(value) {
  return GARDEN_THEMES.find((t) => t.value === value) || GARDEN_THEMES[0];
}

function currentTheme() {
  const root = document.documentElement;
  // По умолчанию используем AnuPpuccin Latte.
  return THEME_VALUES.find((name) => root.classList.contains(`theme-${name}`)) || 'anuppuccin-latte';
}

function isDarkTheme(value) {
  return themeMeta(value).mode === 'dark';
}

function themeSupportsAccent(theme) {
  return ACCENT_THEMES.has(theme);
}

// Применяет акцентный класс (accent-<name>) для тем, которые это поддерживают.
// Для остальных тем класс не ставится вовсе — акцент значим только вместе
// с поддерживающей его базовой темой (см. themeSupportsAccent).
function applyAccent(accent, options = {}) {
  const root = document.documentElement;
  ACCENT_VALUES.forEach((name) => root.classList.remove(`accent-${name}`));
  if (!themeSupportsAccent(currentTheme())) return;
  const value = ACCENT_VALUES.includes(accent) ? accent : DEFAULT_ACCENT;
  root.classList.add(`accent-${value}`);
  if (options.persistLocal !== false) { try { localStorage.setItem('garden-accent', value); } catch (e) {} }
}

function applyTheme(theme, options = {}) {
  const root = document.documentElement;
  THEME_VALUES.forEach((name) => root.classList.toggle(`theme-${name}`, theme === name));
  // Общий переключатель «тёмного» состояния форм-контролов (стрелка select,
  // иконка календаря и т.п.) — не завязан на конкретное имя темы, работает для
  // любой темы с mode: 'dark' (Графит, Хвоя, Ночь, будущие тёмные темы).
  root.classList.toggle('theme-dark', isDarkTheme(theme));
  if (options.persistLocal !== false) { try { localStorage.setItem('garden-theme', theme); } catch (e) {} }
  // Переключение темы либо переносит ранее сохранённый акцент (если новая тема
  // его поддерживает), либо снимает accent-* класс целиком — он не должен
  // «протекать» из AnuPpuccin в темы, где акцент не настраивается.
  if (themeSupportsAccent(theme)) {
    let saved = DEFAULT_ACCENT;
    try { saved = localStorage.getItem('garden-accent') || DEFAULT_ACCENT; } catch (e) {}
    applyAccent(options.accent || saved, { persistLocal: false });
  } else {
    ACCENT_VALUES.forEach((name) => root.classList.remove(`accent-${name}`));
  }
}

// Быстрая иконка в сайдбаре: строго Туман/Хвоя, а не перебор всех
// всех тем подряд — остальные темы осознанно выбираются по имени в «Настройках».
async function cycleTheme() {
  const next = isDarkTheme(currentTheme()) ? 'tuman' : 'khvoya';
  applyTheme(next);
  try { await GardenSettings.update({ theme: next }); } catch (_) {}
  renderSidebar(Router.current());
}

// ---------------- Command palette ----------------

// Точное название раздела в поиске работает как команда навигации.
// Уточнения (например, «задачи Кирилла») остаются обычным поиском.
const SEARCH_SECTION_ROUTES = {
  'обзор': '/overview',
  'фокус': '/overview',
  'сегодня': '/overview',
  'журнал': '/journal',
  'люди': '/team',
  'команда': '/team',
  'сотрудники': '/team',
  'стейкхолдеры': '/stakeholders',
  'встречи': '/meetings',
  'календарь': '/calendar',
  'работа': '/tasks',
  'задачи': '/tasks',
  'проекты': '/projects',
  'загрузка команды': '/team-load',
  'загрузка': '/team-load',
  'labs': '/labs',
  'лабы': '/labs',
  'лаба': '/labs',
  'лаборатория': '/labs',
  'пет-проекты': '/labs',
  'проекты labs': '/labs',
  'labs проекты': '/labs',
  'цели': '/goals',
  'проблемы': '/issues',
  'договоренности': '/agreements',
  'договорённости': '/agreements',
  'check-in': '/checkins',
  'чек-ин': '/checkins',
  'чекин': '/checkins',
  'чек-ины': '/checkins',
  'знания': '/knowledge-base',
  'база знаний': '/knowledge-base',
  'документы': '/knowledge-base',
  'инструменты': '/tools',
  'процессы': '/processes',
  'идеи': '/labs?tab=ideas',
  'the labs': '/labs?tab=projects',
  'проекты the labs': '/labs?tab=projects',
};

function searchSectionRoute(query) {
  let normalized = String(query || '')
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
  const wrappers = [
    'покажи мне ', 'покажи ', 'показать ', 'найди мне ', 'найди ', 'найти ', 'открой мне ', 'открой ', 'открыть ',
    'перейди в ', 'перейти в ', 'хочу открыть ', 'хочу посмотреть ', 'где ',
  ];
  for (const prefix of wrappers) {
    if (normalized.startsWith(prefix)) { normalized = normalized.slice(prefix.length).trim(); break; }
  }
  return SEARCH_SECTION_ROUTES[normalized] || null;
}

let paletteState = { query: '', results: null, activeIndex: 0, flatItems: [], searchMode: false };

function openPalette() {
  if (!Auth.user) return;
  Modal.root.innerHTML = `<div class="ui-overlay overlay" id="palette-overlay">
    <div class="palette">
      <input id="palette-input" placeholder="Поиск: мои задачи, встречи без итогов 1:1, процессы с проблемами…" autocomplete="off" />
      <div class="palette-results" id="palette-results"></div>
      <div class="palette-hint">
        <span>↑↓ навигация</span><span>Enter выбрать</span><span>Esc закрыть</span><span>? горячие клавиши</span>
      </div>
    </div>
  </div>`;
  const overlay = document.getElementById('palette-overlay');
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePalette(); });
  document.addEventListener('keydown', paletteKeyHandler);
  const input = document.getElementById('palette-input');
  input.focus();
  renderPaletteQuickActions();
  const fetchPaletteResults = debounce(async () => {
    const query = input.value.trim();
    if (!query) return;
    const data = await api.get('/api/search?q=' + encodeURIComponent(query));
    // Не подменяем результаты, если пользователь уже успел изменить запрос.
    if (input.value.trim() === query) renderPaletteResults(data);
  }, 180);
  input.addEventListener('input', () => {
    paletteState.query = input.value.trim();
    if (!paletteState.query) { renderPaletteQuickActions(); return; }
    // Сразу снимаем выбор: Enter уже сейчас должен открыть все результаты,
    // даже если сетевой поиск ещё не успел завершиться.
    paletteState.searchMode = true;
    paletteState.activeIndex = -1;
    markActivePaletteItem();
    fetchPaletteResults();
  });
}

function closePalette() {
  Modal.root.innerHTML = '';
  document.removeEventListener('keydown', paletteKeyHandler);
}

function renderPaletteQuickActions() {
  paletteState.searchMode = false;
  const actions = [
    { label: 'Новая задача', icon: 'tasks', run: () => FeatureLoader.run('openTaskModal') },
    { label: 'Новая встреча', icon: 'meetings', run: () => FeatureLoader.run('openMeetingModal') },
    { label: 'Новая запись в журнал', icon: 'journal', run: () => Router.go('/journal') },
  ];
  const help = [
    { label: 'Горячие клавиши', icon: 'help', run: () => openShortcutsHelp() },
  ];
  const transitions = [
    { label: 'Мои задачи', icon: 'tasks', run: () => Router.go('/tasks?mine=1') },
    { label: 'Мои идеи', icon: 'journal', run: () => Router.go('/journal?kind=idea') },
    { label: 'Мои проблемы', icon: 'issues', run: () => Router.go('/issues?mine=1') },
    { label: 'Мои договорённости', icon: 'agreements', run: () => Router.go('/agreements?mine=1') },
  ];
  const allItems = [...actions, ...transitions, ...help];
  paletteState.flatItems = allItems.map((a) => () => setTimeout(a.run, 0));
  const renderItems = (items, offset) => items.map((a, i) => {
    const idx = offset + i;
    return `<div class="palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" data-palette-index="${idx}">${icon(a.icon)}<span>${a.label}</span></div>`;
  }).join('');
  document.getElementById('palette-results').innerHTML = `
    <div class="palette-group-title">Быстрые действия</div>
    ${renderItems(actions, 0)}
    <div class="palette-group-title">Быстрые переходы</div>
    ${renderItems(transitions, actions.length)}
    <div class="palette-group-title">Помощь</div>
    ${renderItems(help, actions.length + transitions.length)}
  `;
  paletteState.activeIndex = 0;
}

function renderPaletteResults(data) {
  const groups = data.groups;
  const flat = [];
  let html = '';

  function section(title, arr, renderItem) {
    if (!arr || !arr.length) return '';
    let s = `<div class="palette-group-title">${title}</div>`;
    arr.slice(0, 5).forEach((item) => {
      const idx = flat.length;
      flat.push(item._go);
      s += `<div class="palette-item" data-idx="${idx}" data-palette-index="${idx}">${renderItem(item)}</div>`;
    });
    return s;
  }

  const peopleItems = groups.people.map((g) => ({ ...g.person, _go: () => Router.go(personPath(g.person)) }));
  html += section('Люди', peopleItems, (p) => `${avatarHtml(p)}<span>${escapeHtml(p.name)}</span><span class="pi-sub">${escapeHtml(p.role || '')}</span>`);

  const projItems = groups.projects.map((p) => ({ ...p, _go: () => Router.go(projectPath(p)) }));
  html += section('Проекты', projItems, (p) => `${icon('projects')}<span>${escapeHtml(p.name)}</span>`);

  const taskItems = groups.tasks.map((t) => ({ ...t, _go: () => FeatureLoader.run('openTaskModal', t.id) }));
  html += section('Задачи', taskItems, (t) => `${icon('tasks')}<span>${escapeHtml(t.title)}</span>`);

  const issueItems = groups.issues.map((t) => ({ ...t, _go: () => FeatureLoader.run('openIssueModal', t.id) }));
  html += section('Проблемы', issueItems, (t) => `${icon('issues')}<span>${escapeHtml(t.title)}</span>`);

  const meetingItems = groups.meetings.map((m) => ({ ...m, _go: () => FeatureLoader.run('openMeetingModal', m) }));
  html += section('Встречи', meetingItems, (m) => `${icon('meetings')}<span>${escapeHtml(meetingDisplayTitle(m))}</span><span class="pi-sub">${fmtDate(m.date)}</span>`);

  const vacationItems = (groups.vacations || []).map((v) => ({ ...v, _go: () => { const p = store.person(v.personId); Router.go(p ? personPath(p) : '/calendar'); } }));
  html += section('Отсутствия', vacationItems, (v) => { const p = store.person(v.personId); return `${icon('calendar')}<span>${p ? escapeHtml(p.name) + ' — ' : ''}${fmtDate(v.startDate)} – ${fmtDate(v.endDate)}</span>`; });

  const journalItems = groups.journal.map((j) => ({ ...j, _go: () => FeatureLoader.run('openJournalEditModal', j) }));
  html += section('Журнал', journalItems, (j) => `${icon('journal')}<span>${previewText(j.text, 60)}</span>`);

  const goalItems = groups.goals.map((g) => ({ ...g, _go: () => Router.go(goalPath(g)) }));
  html += section('Цели', goalItems, (g) => `${icon('goals')}<span>${escapeHtml(g.title)}</span>`);

  const agrItems = groups.agreements.map((a) => ({ ...a, _go: () => FeatureLoader.run('openAgreementModal', a.id) }));
  html += section('Договорённости', agrItems, (a) => `${icon('agreements')}<span>${previewText(a.text, 60)}</span>`);

  const docItems = groups.documents.map((d) => ({ ...d, _go: () => window.open(d.url, '_blank') }));
  html += section('Документы', docItems, (d) => `${icon('documents')}<span>${escapeHtml(d.title)}</span>`);

  const toolItems = (groups.tools || []).map((d) => ({ ...d, _go: () => window.open(d.url, '_blank') }));
  html += section('Инструменты', toolItems, (d) => `${icon('tools')}<span>${escapeHtml(d.title)}</span>`);

  const procItems = groups.processes.map((p) => ({ ...p, _go: () => Router.go(`/processes/${encodeURIComponent(p.id)}`) }));
  html += section('Процессы', procItems, (p) => `${icon('processes')}<span>${escapeHtml(p.title)}</span>`);

  const checkinItems = (groups.checkins || []).map((c) => ({ ...c, _go: () => Router.go(`/checkins?person=${encodeURIComponent(c.personId || '')}`) }));
  html += section('Check-in', checkinItems, (c) => { const p = store.person(c.personId); return `${icon('checkins')}<span>${p ? escapeHtml(p.name) : 'Check-in'}</span><span class="pi-sub">${escapeHtml(c.weekStart || '')}</span>`; });

  const sectionRoute = searchSectionRoute(data.query);
  if (sectionRoute) {
    html = `<div class="palette-group-title">Раздел</div><div class="palette-item" data-idx="0" data-palette-index="0">${icon('chevronRight')}<span>Открыть раздел «${escapeHtml(data.query)}»</span></div>`;
    flat.length = 0;
    flat.push(() => Router.go(sectionRoute));
  } else {
    html += `<div class="palette-item" data-idx="${flat.length}" data-palette-index="${flat.length}">${icon('search')}<span>Все результаты по «${escapeHtml(data.query)}»</span></div>`;
    flat.push(() => Router.go('/search?q=' + encodeURIComponent(data.query)));
  }

  paletteState.flatItems = flat;
  paletteState.searchMode = true;
  // По умолчанию ничего не выбрано: Enter ведёт на страницу всех результатов.
  paletteState.activeIndex = -1;

  document.getElementById('palette-results').innerHTML = html || `<div class="palette-empty">Ничего не найдено по «${escapeHtml(data.query)}»</div>`;
  markActivePaletteItem();
}

function markActivePaletteItem() {
  document.querySelectorAll('.palette-item').forEach((elm) => {
    elm.classList.toggle('active', Number(elm.dataset.idx) === paletteState.activeIndex);
  });
}

// 'error' не всплывает, поэтому делегирование требует capture-фазы на document.
// Подставляет инициалы для аватара, у которого не загрузилось фото (битая ссылка,
// удалённый файл) — без этого браузер показывает alt-текст, не обрезанный рамкой.
document.addEventListener('error', (event) => {
  const img = event.target;
  if (!img || img.tagName !== 'IMG') return;
  const wrap = img.closest?.('.ui-avatar[data-avatar-fallback-text]');
  if (!wrap) return;
  const bg = wrap.dataset.avatarFallbackBg;
  const fg = wrap.dataset.avatarFallbackFg;
  wrap.classList.remove('has-photo');
  wrap.style.background = bg;
  wrap.style.color = fg;
  wrap.textContent = wrap.dataset.avatarFallbackText;
}, true);

document.addEventListener('click', (event) => {
  const item = event.target.closest?.('[data-palette-index]');
  if (!item) return;
  const index = Number(item.dataset.paletteIndex);
  const action = paletteState.flatItems[index];
  if (typeof action !== 'function') return;
  event.preventDefault();
  action();
  closePalette();
});

function paletteKeyHandler(e) {
  const items = paletteState.flatItems;
  if (e.key === 'Escape') { closePalette(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!items.length) return;
    paletteState.activeIndex = paletteState.activeIndex < 0 ? 0 : Math.min(paletteState.activeIndex + 1, items.length - 1);
    markActivePaletteItem();
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    paletteState.activeIndex = paletteState.activeIndex <= 0 ? 0 : paletteState.activeIndex - 1;
    markActivePaletteItem();
  }
  else if (e.key === 'Enter') {
    e.preventDefault();
    // Точное название раздела без уточнений сразу открывает этот раздел.
    if (paletteState.searchMode && paletteState.activeIndex < 0 && paletteState.query) {
      const sectionRoute = searchSectionRoute(paletteState.query);
      if (sectionRoute) Router.go(sectionRoute);
      else Router.go('/search?q=' + encodeURIComponent(paletteState.query));
      closePalette();
      return;
    }
    if (items[paletteState.activeIndex]) { items[paletteState.activeIndex](); closePalette(); }
  }
}

// ---------------- Горячие клавиши ----------------
// Работаем по e.code, а не по e.key: тогда клавиши срабатывают и в русской раскладке.

function shortcutModifierLabel() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
}

const GARDEN_GO_SHORTCUTS = [
  { code: 'KeyF', path: '/overview', label: 'Обзор' },
  { code: 'KeyJ', path: '/journal', label: 'Журнал' },
  { code: 'KeyT', path: '/team', label: 'Команда' },
  { code: 'KeyM', path: '/meetings', label: 'Встречи' },
  { code: 'KeyC', path: '/calendar', label: 'Календарь' },
  { code: 'KeyZ', path: '/tasks', label: 'Задачи' },
  { code: 'KeyP', path: '/projects', label: 'Проекты' },
  { code: 'KeyG', path: '/goals', label: 'Цели' },
  { code: 'KeyI', path: '/issues', label: 'Проблемы' },
  { code: 'KeyD', path: '/agreements', label: 'Договорённости' },
  { code: 'KeyL', path: '/labs', label: 'The Labs' },
  { code: 'KeyB', path: '/knowledge-base', label: 'База знаний' },
  { code: 'KeyO', path: '/knowledge-base', label: 'База знаний' },
  { code: 'KeyU', path: '/tools', label: 'Инструменты' },
  { code: 'KeyR', path: '/processes', label: 'Процессы' },
  { code: 'KeyS', path: '/settings', label: 'Настройки' },
];

function isEditableTarget(node) {
  if (!node) return false;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isOverlayOpen() {
  return !!document.getElementById('palette-overlay') || !!document.getElementById('modal-overlay');
}

// Нажали `n` — повторяем главное действие текущего экрана. Это всегда основная
// кнопка в топбаре, поэтому отдельный реестр действий на каждый раздел не нужен.
function triggerPrimaryAction() {
  const button = document.querySelector('#topbar .btn-primary');
  if (button) { button.click(); return true; }
  // На экранах, где создание живёт в самом контенте (например, композер журнала),
  // ставим курсор в поле ввода вместо открытия диалога.
  const composer = document.querySelector('#view textarea, #view [contenteditable="true"]');
  if (composer) { composer.focus(); return true; }
  const inlineButton = document.querySelector('#view .btn-primary');
  if (inlineButton) { inlineButton.click(); return true; }
  return false;
}

function openShortcutsHelp() {
  const mod = shortcutModifierLabel();
  const rows = [
    ['Поиск и быстрые действия', [`${mod}K`, '/']],
    ['Главное действие экрана (создать)', ['N']],
    ['Список горячих клавиш', ['?']],
    ['Закрыть диалог или меню', ['Esc']],
  ];
  const goRows = GARDEN_GO_SHORTCUTS.map((item) => [item.label, ['G', item.code.replace('Key', '')]]);
  const render = (list, separator = 'или') => list.map(([label, keys]) => `<div class="shortcut-row"><span>${escapeHtml(label)}</span><span class="shortcut-keys">${keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(`<span class="shortcut-or">${escapeHtml(separator)}</span>`)}</span></div>`).join('');
  Modal.open(`<h2>Горячие клавиши</h2>
    <div class="shortcut-group">
      <div class="shortcut-group-title">Общие</div>
      ${render(rows)}
    </div>
    <div class="shortcut-group">
      <div class="shortcut-group-title">Переходы — сначала G, затем буква</div>
      ${render(goRows, '+')}
    </div>
    <div class="ui-field-hint field-hint">Клавиши работают в любой раскладке и не срабатывают, когда курсор стоит в поле ввода.</div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button ui-button--primary btn btn-primary" data-modal-close>Понятно</button></div>`);
}

let _goSequenceUntil = 0;

document.addEventListener('keydown', (e) => {
  if (!Auth.user) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
    e.preventDefault();
    if (document.getElementById('palette-overlay')) closePalette();
    else openPalette();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isEditableTarget(e.target)) return;
  if (isOverlayOpen()) return;

  // Второй шаг последовательности «G, затем буква».
  if (_goSequenceUntil > Date.now()) {
    const target = GARDEN_GO_SHORTCUTS.find((item) => item.code === e.code);
    _goSequenceUntil = 0;
    if (target) { e.preventDefault(); Router.go(target.path); return; }
  }

  if (e.code === 'Slash' && e.shiftKey) { e.preventDefault(); openShortcutsHelp(); return; }
  if (e.key === '?') { e.preventDefault(); openShortcutsHelp(); return; }
  if (e.shiftKey) return;
  if (e.code === 'Slash' || e.key === '/') { e.preventDefault(); openPalette(); return; }
  if (e.code === 'KeyN') { if (triggerPrimaryAction()) e.preventDefault(); return; }
  if (e.code === 'KeyG') { _goSequenceUntil = Date.now() + 1500; return; }
});

