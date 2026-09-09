// Theme, command palette and keyboard shortcuts.
// ---------------- Тема (светлая / тёмная) ----------------

// Единый реестр тем: отсюда берут данные и настройки в «Настройках», список
// цветовых меток в team-load/аватарах и т.д. Полный список — только там; быстрая
// иконка в сайдбаре (см. cycleTheme ниже) переключает исключительно между
// Туман/Хвоя, а не по кругу через все темы — остальные выбираются
// осознанно, по имени, в «Настройках».
const {
  themes: GARDEN_THEMES,
  themeValues: THEME_VALUES,
  accentThemes: GARDEN_ACCENT_THEMES,
  accents: ACCENT_COLORS,
  accentValues: ACCENT_VALUES,
  defaultAccent: DEFAULT_ACCENT,
} = GardenAppearance;
const ACCENT_THEMES = new Set(GARDEN_ACCENT_THEMES);

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
  if (options.persistLocal !== false) {
    try {
      localStorage.setItem('garden-accent', value);
    } catch (e) {}
  }
}

function applyGlow(enabled, options = {}) {
  const value = !!enabled;
  document.documentElement.classList.toggle('glow-enabled', value);
  if (options.persistLocal !== false) {
    try {
      localStorage.setItem('garden-glow', value ? '1' : '0');
    } catch (e) {}
  }
}

function applyTheme(theme, options = {}) {
  const root = document.documentElement;
  THEME_VALUES.forEach((name) => root.classList.toggle(`theme-${name}`, theme === name));
  // Общий переключатель «тёмного» состояния форм-контролов (стрелка select,
  // иконка календаря и т.п.) — не завязан на конкретное имя темы, работает для
  // любой темы с mode: 'dark' (Графит, Хвоя, Ночь, будущие тёмные темы).
  root.classList.toggle('theme-dark', isDarkTheme(theme));
  if (options.persistLocal !== false) {
    try {
      localStorage.setItem('garden-theme', theme);
    } catch (e) {}
  }
  // Переключение темы либо переносит ранее сохранённый акцент (если новая тема
  // его поддерживает), либо снимает accent-* класс целиком — он не должен
  // «протекать» из AnuPpuccin в темы, где акцент не настраивается.
  if (themeSupportsAccent(theme)) {
    let saved = DEFAULT_ACCENT;
    try {
      saved = localStorage.getItem('garden-accent') || DEFAULT_ACCENT;
    } catch (e) {}
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
  try {
    await GardenSettings.update({ theme: next });
  } catch (_) {}
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
  'график встреч': '/meetings',
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
    'перейди в ', 'перейди на ', 'перейти в ', 'перейти на ', 'переключись на ', 'зайди в ', 'зайти в ',
    'запусти ', 'отправься в ', 'перейди к ', 'проведи к ', 'покажи раздел ', 'хочу открыть ', 'хочу посмотреть ', 'где ',
  ];
  for (const prefix of wrappers) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }
  return SEARCH_SECTION_ROUTES[normalized] || null;
}

let paletteState = { query: '', results: null, activeIndex: 0, flatItems: [], searchMode: false };

function openPalette() {
  if (!Auth.user) return;
  Modal.root.innerHTML = `<div class="ui-overlay overlay" id="palette-overlay">
    <div class="palette">
      <input id="palette-input" placeholder="Поиск: задачи на сегодня, встречи без итогов, check-in с блокерами…" autocomplete="off" />
      <div class="palette-results" id="palette-results"></div>
      <div class="palette-hint">
        <span>↑↓ навигация</span><span>Enter выбрать</span><span>Esc закрыть</span><span>? горячие клавиши</span>
      </div>
    </div>
  </div>`;
  const overlay = document.getElementById('palette-overlay');
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closePalette();
  });
  document.addEventListener('keydown', paletteKeyHandler);
  const input = document.getElementById('palette-input');
  input.focus();
  renderPaletteQuickActions();
  let suggestionRequest = 0;
  const fetchPaletteResults = debounce(async () => {
    const query = input.value.trim();
    if (!query) return;
    const data = await api.get('/api/search?q=' + encodeURIComponent(query));
    // Не подменяем подсказки/результаты, если пользователь уже успел изменить запрос.
    if (input.value.trim() === query) renderPaletteResults(data);
  }, 180);

  const updatePaletteForInput = async () => {
    const query = input.value;
    const trimmed = query.trim();
    paletteState.query = trimmed;
    const request = ++suggestionRequest;
    if (!trimmed) {
      renderPaletteQuickActions();
      return;
    }

    paletteState.searchMode = true;
    paletteState.activeIndex = -1;
    try {
      await FeatureLoader.load('smart-search');
      const suggestions = await FeatureLoader.run('smartSearchSuggestions', query);
      if (request !== suggestionRequest || input.value !== query) return;
      if (suggestions?.length) {
        renderPaletteSuggestions(suggestions);
        return;
      }
    } catch (error) {
      console.error(error);
    }

    // Незавершённые команды Ассистента не превращаем в обычный полнотекстовый поиск.
    if (paletteUsesAssistantCommand(trimmed)) {
      renderPaletteCommandContinuation();
      return;
    }
    markActivePaletteItem();
    fetchPaletteResults();
  };

  input.addEventListener('input', updatePaletteForInput);
}

function closePalette() {
  Modal.root.innerHTML = '';
  document.removeEventListener('keydown', paletteKeyHandler);
}

function paletteInsertCommand(value) {
  const input = document.getElementById('palette-input');
  if (!input) return false;
  input.value = value;
  paletteState.query = value.trim();
  paletteState.searchMode = true;
  paletteState.activeIndex = -1;
  input.focus();
  input.setSelectionRange(value.length, value.length);
  // input.value меняется программно, поэтому явно запускаем ту же цепочку подсказок.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return false;
}

function paletteUsesAssistantCommand(query) {
  const value = String(query || '').trim().toLowerCase().replace(/ё/g, 'е');
  return /^(создай|создать|открой|открыть|покажи мои|покажи все мои|запиши в журнал|записать в журнал)(?:\s|:|$)/.test(value);
}

function paletteHasShowIntent(query) {
  const value = String(query || '').trim().toLowerCase().replace(/ё/g, 'е');
  return /^(покажи|показать|найди|найти|выведи|отобрази|перечисли|подбери|отфильтруй|поищи|отыщи|дай список|список)(?:\s|$)/.test(value);
}

async function runPaletteShowQuery(query) {
  const data = await api.get('/api/search?q=' + encodeURIComponent(query));
  // Семантический parser вернул конкретный тип контента — значит показываем
  // отфильтрованную выдачу прямо в палитре и не закрываем её.
  if (data?.command?.group) {
    renderPaletteResults(data);
    return true;
  }
  return false;
}

function renderPaletteSuggestions(suggestions) {
  const items = (suggestions || []).slice(0, 6);
  paletteState.searchMode = true;
  paletteState.activeIndex = items.length ? 0 : -1;
  paletteState.flatItems = items.map((item) => () => {
    const input = document.getElementById('palette-input');
    if (!input) return false;
    input.value = item.insert || item.label || '';
    paletteState.query = input.value.trim();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    if (item.submit) {
      const query = input.value;
      if (paletteHasShowIntent(query)) {
        paletteState.activeIndex = -1;
        runPaletteShowQuery(query).then((handled) => {
          if (!handled) {
            closePalette();
            return runPaletteAssistantCommand(query);
          }
          return null;
        }).catch((error) => {
          console.error(error);
          toast?.('Не удалось выполнить поиск');
        });
        return false;
      }
      closePalette();
      runPaletteAssistantCommand(query).catch((error) => {
        console.error(error);
        toast?.('Не удалось выполнить команду');
      });
      return false;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return false;
  });

  document.getElementById('palette-results').innerHTML = `
    <div class="palette-group-title">Предложения</div>
    ${items.map((item, idx) => `<div class="palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" data-palette-index="${idx}">
      ${item.person ? avatarHtml(item.person) : icon(item.icon || 'search')}
      <span>${escapeHtml(item.label || '')}</span>
      ${item.hint ? `<span class="pi-sub">${escapeHtml(item.hint)}</span>` : ''}
    </div>`).join('')}
  `;
}

function renderPaletteCommandContinuation() {
  paletteState.flatItems = [];
  paletteState.activeIndex = -1;
  document.getElementById('palette-results').innerHTML = '<div class="palette-empty">Продолжите запрос или нажмите Enter</div>';
}

async function runPaletteAssistantCommand(query) {
  await FeatureLoader.load('smart-search');
  await FeatureLoader.run('smartSearchAsk', query);
}

function renderPaletteQuickActions() {
  paletteState.searchMode = false;
  const commands = [
    { label: 'Создай…', value: 'Создай ', icon: 'plus' },
    { label: 'Открой…', value: 'Открой ', icon: 'folder' },
    { label: 'Покажи мои…', value: 'Покажи мои ', icon: 'search' },
    { label: 'Запиши в журнал', value: 'Запиши в журнал: ', icon: 'journal' },
  ];
  const help = [
    { label: 'Горячие клавиши', icon: 'help', run: () => openShortcutsHelp() },
  ];
  const allItems = [...commands, ...help];
  paletteState.flatItems = [
    ...commands.map((item) => () => paletteInsertCommand(item.value)),
    ...help.map((item) => () => setTimeout(item.run, 0)),
  ];
  const renderItems = (items, offset) => items.map((item, i) => {
    const idx = offset + i;
    return `<div class="palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" data-palette-index="${idx}">${icon(item.icon)}<span>${item.label}</span></div>`;
  }).join('');
  document.getElementById('palette-results').innerHTML = `
    <div class="palette-group-title">Команды</div>
    ${renderItems(commands, 0)}
    <div class="palette-group-title">Помощь</div>
    ${renderItems(help, commands.length)}
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

  const linkItems = (groups.links || []).map((d) => ({ ...d, _go: () => window.open(d.url, '_blank', 'noopener') }));
  html += section('Ссылки и материалы', linkItems, (d) => `${icon('documents')}<span>${escapeHtml(d.title || d.url)}</span><span class="pi-sub">${escapeHtml(d.sourceTitle || '')}</span>`);

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
  const result = action();
  if (result !== false) closePalette();
});

function paletteKeyHandler(e) {
  const items = paletteState.flatItems;
  if (e.key === 'Escape') {
    closePalette();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!items.length) return;
    paletteState.activeIndex = paletteState.activeIndex < 0 ? 0 : Math.min(paletteState.activeIndex + 1, items.length - 1);
    markActivePaletteItem();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    paletteState.activeIndex = paletteState.activeIndex <= 0 ? 0 : paletteState.activeIndex - 1;
    markActivePaletteItem();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    // Точное название раздела без уточнений сразу открывает этот раздел.
    if (paletteState.searchMode && paletteState.activeIndex < 0 && paletteState.query) {
      if (paletteHasShowIntent(paletteState.query)) {
        const query = paletteState.query;
        runPaletteShowQuery(query).then((handled) => {
          if (handled) return;
          closePalette();
          return runPaletteAssistantCommand(query);
        }).catch((error) => {
          console.error(error);
          toast?.('Не удалось выполнить поиск');
        });
        return;
      }
      if (paletteUsesAssistantCommand(paletteState.query)) {
        const query = paletteState.query;
        closePalette();
        runPaletteAssistantCommand(query).catch((error) => {
          console.error(error);
          toast?.('Не удалось выполнить команду');
        });
        return;
      }
      const sectionRoute = searchSectionRoute(paletteState.query);
      if (sectionRoute) Router.go(sectionRoute);
      else Router.go('/search?q=' + encodeURIComponent(paletteState.query));
      closePalette();
      return;
    }
    if (items[paletteState.activeIndex]) {
      const result = items[paletteState.activeIndex]();
      if (result !== false) closePalette();
    }
  }
}

// ---------------- Горячие клавиши ----------------
// Работаем по e.code, а не по e.key: тогда клавиши срабатывают и в русской раскладке.

function shortcutModifierLabel() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
}

const GARDEN_GO_SHORTCUTS = [
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
  { code: 'KeyU', path: '/tools', label: 'Инструменты' },
  { code: 'KeyR', path: '/processes', label: 'Процессы' },
  { code: 'KeyS', path: '/settings', label: 'Настройки' },
];

function homeGoShortcut() {
  const assistant = GardenSettings.value?.overviewHomeMode === 'assistant';
  return {
    code: assistant ? 'KeyA' : 'KeyO',
    path: '/overview',
    label: assistant ? 'Ассистент' : 'Обзор',
  };
}

function gardenGoShortcuts() {
  return [homeGoShortcut(), ...GARDEN_GO_SHORTCUTS];
}

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
  if (button) {
    button.click();
    return true;
  }
  // На экранах, где создание живёт в самом контенте (например, композер журнала),
  // ставим курсор в поле ввода вместо открытия диалога.
  const composer = document.querySelector('#view textarea, #view [contenteditable="true"]');
  if (composer) {
    composer.focus();
    return true;
  }
  const inlineButton = document.querySelector('#view .btn-primary');
  if (inlineButton) {
    inlineButton.click();
    return true;
  }
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
  const goRows = gardenGoShortcuts().map((item) => [item.label, ['G', item.code.replace('Key', '')]]);
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
    const target = gardenGoShortcuts().find((item) => item.code === e.code);
    _goSequenceUntil = 0;
    if (target) {
      e.preventDefault();
      Router.go(target.path);
      return;
    }
  }

  if (e.code === 'Slash' && e.shiftKey) {
    e.preventDefault();
    openShortcutsHelp();
    return;
  }
  if (e.key === '?') {
    e.preventDefault();
    openShortcutsHelp();
    return;
  }
  if (e.shiftKey) return;
  if (e.code === 'Slash' || e.key === '/') {
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.code === 'KeyN') {
    if (triggerPrimaryAction()) e.preventDefault();
    return;
  }
  if (e.code === 'KeyG') {
    _goSequenceUntil = Date.now() + 1500;
    return;
  }
});

