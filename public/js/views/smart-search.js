// Ассистент на Обзоре: одна строка, которая понимает команды создания, обзорные вопросы
// («как дела у Маши», «обзор недели»), переходы («открой задачи») и обычный поиск.
// Разбор запроса живёт на сервере (server/domain/smart-search.js) — здесь UI:
// приветствие, строка ввода с подсказками и отрисовка ответа.
// Режимом главного экрана управляет настройка overviewHomeMode (Настройки → Главный экран).

const {
  suggestLimit: SMART_SUGGEST_LIMIT,
  inputPlaceholders: SMART_INPUT_PLACEHOLDERS,
  greetingIcons: SMART_GREETING_ICONS,
  memberSuggestionRows: SMART_MEMBER_SUGGESTION_ROWS,
  teamleadSuggestionRows: SMART_TEAMLEAD_SUGGESTION_ROWS,
  quickInputs: SMART_QUICK_INPUTS,
  openPrefixes: SMART_OPEN_PREFIXES,
  personPrefixes: SMART_PERSON_PREFIXES,
  projectPrefixes: SMART_PROJECT_PREFIXES,
  createPrefixes: SMART_CREATE_PREFIXES,
  showPrefixes: SMART_SHOW_PREFIXES,
  minePrefixes: SMART_MINE_PREFIXES,
  personSlotMarkers: SMART_PERSON_SLOT_MARKERS,
  projectSlotMarkers: SMART_PROJECT_SLOT_MARKERS,
  createTypes: SMART_CREATE_TYPES,
  scheduleTypes: SMART_SCHEDULE_TYPES,
  sectionTargets: SMART_SECTION_TARGETS,
  mineTargets: SMART_MINE_TARGETS,
  showTargets: SMART_SHOW_TARGETS,
  statusSuggestions: SMART_STATUS_SUGGESTIONS,
} = SmartSearchUIConfig;

function smartInputPlaceholder() {
  const state = smartSearchState();
  if (!SMART_INPUT_PLACEHOLDERS.includes(state.placeholder)) {
    state.placeholder = SMART_INPUT_PLACEHOLDERS[Math.floor(Math.random() * SMART_INPUT_PLACEHOLDERS.length)];
  }
  return state.placeholder;
}

const SMART_GREETING_ICON_STORAGE_KEY = 'garden.smartGreetingIcon';
function smartGreetingIconName() {
  try {
    const saved = localStorage.getItem(SMART_GREETING_ICON_STORAGE_KEY);
    return SMART_GREETING_ICONS.includes(saved) ? saved : SMART_GREETING_ICONS[0];
  } catch (_) { return SMART_GREETING_ICONS[0]; }
}
function smartCycleGreetingIcon() {
  const current = smartGreetingIconName();
  const next = SMART_GREETING_ICONS[(SMART_GREETING_ICONS.indexOf(current) + 1) % SMART_GREETING_ICONS.length];
  try { localStorage.setItem(SMART_GREETING_ICON_STORAGE_KEY, next); } catch (_) {}
  return next;
}
function smartSuggestionRows() {
  return Auth.isTeamlead() ? SMART_TEAMLEAD_SUGGESTION_ROWS : SMART_MEMBER_SUGGESTION_ROWS;
}

const SMART_STATUS_TERMS = [...new Set([
  ...Object.values(SMART_STATUS_SUGGESTIONS).flat().map(([phrase]) => smartNorm(phrase)),
  'просроченный','просроченная','просрочено','пропущенный','пропущенная','пропущено',
  'активный','активная','открытый','открытая','закрытый','закрытая','завершенный','завершённый',
  'заблокированный','в процессе','на проверке','приостановленный','архивный'
])];
const SMART_STATUS_ENTITY_ALIASES = [
  ['задачи', 'tasks'], ['задачу', 'tasks'], ['задача', 'tasks'],
  ['встречи', 'meetings'], ['встречу', 'meetings'], ['встреча', 'meetings'],
  ['проблемы', 'issues'], ['проблему', 'issues'], ['проблема', 'issues'],
  ['договорённости', 'agreements'], ['договоренности', 'agreements'], ['договорённость', 'agreements'],
  ['проекты', 'projects'], ['проект', 'projects'], ['цели', 'goals'], ['цель', 'goals'],
  ['процессы', 'processes'], ['процесс', 'processes'], ['check-in', 'checkins'], ['чек-ин', 'checkins'],
].sort((a,b) => b[0].length - a[0].length);


function smartSearchState() {
  if (!Views._smartSearch) Views._smartSearch = { query: '', result: null, busy: false, error: '', note: null };
  return Views._smartSearch;
}

function smartNorm(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
}

// Короткое напутствие зависит от локального времени пользователя. Внутри одного
// периода фраза держится не меньше двух часов и переживает перезагрузку страницы.
const SMART_GREETINGS = {
  morning: [
    'Начни с главного',
    'Ясность важнее спешки',
  ],
  day: [
    'Спокойно, всё по порядку',
    'Сохраняй темп, а не суету',
    'Спокойный ум, прямая спина',
  ],
  evening: [
    'Пусть оставшееся будет лёгким',
  ],
  night: [
    'Оставь себе понятное завтра',
  ],
};
const SMART_GREETING_STORAGE_KEY = 'garden.smartGreeting';
const SMART_GREETING_MIN_AGE = 2 * 60 * 60 * 1000;

function smartGreetingPeriod(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'day';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
}

function smartGreetingStored() {
  try {
    const value = JSON.parse(localStorage.getItem(SMART_GREETING_STORAGE_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (_) {
    return null;
  }
}

function smartGreetingSave(value) {
  try { localStorage.setItem(SMART_GREETING_STORAGE_KEY, JSON.stringify(value)); } catch (_) {}
}

function smartSearchGreeting(now = new Date()) {
  const period = smartGreetingPeriod(now);
  const lines = SMART_GREETINGS[period] || SMART_GREETINGS.day;
  if (lines.length === 1) {
    const stored = smartGreetingStored();
    if (stored?.period !== period || stored?.line !== lines[0]) {
      smartGreetingSave({ period, line: lines[0], selectedAt: now.getTime() });
    }
    return lines[0];
  }

  const stored = smartGreetingStored();
  const samePeriod = stored?.period === period && lines.includes(stored?.line);
  const selectedAt = Number(stored?.selectedAt) || 0;
  if (samePeriod && now.getTime() - selectedAt < SMART_GREETING_MIN_AGE) return stored.line;

  const alternatives = samePeriod ? lines.filter((line) => line !== stored.line) : lines;
  const nextLine = alternatives[Math.floor(Math.random() * alternatives.length)] || lines[0];
  smartGreetingSave({ period, line: nextLine, selectedAt: now.getTime() });
  return nextLine;
}

async function smartSearchSaveHint(fragment, personId) {
  const key = String(fragment || '').trim();
  if (!key || !personId) return;
  const hints = { ...(GardenSettings.value?.smartSearchPersonHints || {}) };
  hints[key] = personId;
  try { await GardenSettings.update({ smartSearchPersonHints: hints }); } catch (_) {}
}

async function smartSearchForgetHint(fragment) {
  const key = String(fragment || '').trim();
  const hints = { ...(GardenSettings.value?.smartSearchPersonHints || {}) };
  if (!(key in hints)) return;
  delete hints[key];
  try { await GardenSettings.update({ smartSearchPersonHints: hints }); } catch (_) {}
}

// ---------- Переходы «открой …» ----------

function smartSearchHasOpenIntent(query) {
  const value = smartNorm(query);
  return SMART_OPEN_PREFIXES.some((item) => value === item || value.startsWith(`${item} `));
}

// Если после «Открой» сервер уверенно разобрал запрос как фильтруемый раздел,
// открываем сам раздел вместо карточки поисковой выдачи. Переходим напрямую только
// когда в команде не осталось свободного текста: так «открой задачи про OAuth»
// не потеряет содержательную часть запроса.
function smartSearchCommandNavigation(search) {
  const command = search?.command;
  if (!command || String(command.textRemainder || '').trim()) return null;

  if (command.group === 'tasks') {
    const params = new URLSearchParams();
    if (command.taskType === 'development') params.set('workMode', 'development');
    else if (command.taskType === 'standard') params.set('workMode', 'projects');
    if (command.selfRequested) params.set('mine', '1');
    else if (command.person?.id) params.set('person', command.person.id);
    if (command.project?.id) {
      params.set('project', command.project.id);
      if (!command.taskType) params.set('workMode', 'projects');
    }

    const statusModifiers = { todo: 'todo', in_progress: 'in_progress', in_review: 'in_review', blocked: 'blocked', paused: 'paused', done: 'done', archived: 'archived' };
    const modifiers = command.modifiers || [];
    const unsupported = modifiers.filter((modifier) => !(modifier in statusModifiers));
    if (unsupported.length) return null;
    const status = modifiers.map((modifier) => statusModifiers[modifier]).find(Boolean);
    if (status) params.set('status', status);
    const suffix = params.toString();
    return { route: `/tasks${suffix ? `?${suffix}` : ''}`, label: 'Задачи' };
  }

  return null;
}

function smartSearchNavigationTarget(query) {
  const value = smartNorm(query);
  const prefix = SMART_OPEN_PREFIXES.find((item) => value === item || value.startsWith(`${item} `));
  if (!prefix) return null;
  const rest = value.slice(prefix.length).trim();
  if (!rest) return { route: '/overview', label: 'Обзор' };
  // «Открой задачи» — переход. «Открой просроченные задачи» — уже запрос к данным:
  // его должен обработать серверный командный поиск, иначе статус потеряется.
  if (SMART_STATUS_TERMS.some((term) => rest === term || rest.includes(` ${term}`) || rest.startsWith(`${term} `))) return null;
  const sectionRoute = typeof searchSectionRoute === 'function' ? searchSectionRoute(rest) : null;
  if (sectionRoute) return { route: sectionRoute, label: rest };
  // Не раздел — возможно, это человек или проект. Открываем, только если совпадение
  // единственное: иначе честнее показать список результатов, чем угадывать.
  const people = (store?.people || []).filter((person) => smartNorm(person.name).includes(rest));
  if (people.length === 1) return { route: personPath(people[0]), label: people[0].name };
  const projects = (store?.projects || []).filter((project) => smartNorm(project.name).includes(rest));
  if (projects.length === 1) return { route: projectPath(projects[0]), label: projects[0].name };
  return null;
}

// ---------- Подсказки ввода ----------

function smartMatchPrefix(value, prefixes) {
  const normalized = smartNorm(value);
  let best = null;
  prefixes.forEach((prefix) => {
    if (normalized === prefix || normalized.startsWith(`${prefix} `)) {
      if (!best || prefix.length > best.length) best = prefix;
    }
  });
  return best;
}

function smartFilterByTail(items, tail, getText) {
  const needle = smartNorm(tail);
  if (!needle) return items.slice(0, SMART_SUGGEST_LIMIT);
  const matches = items.filter((item) => {
    const text = smartNorm(getText(item));
    return text.includes(needle) || text.split(/\s+/).some((word) => word.startsWith(needle));
  });
  return matches.slice(0, SMART_SUGGEST_LIMIT);
}

function smartSuggestionPeople() {
  return (store?.people || []).filter((person) => person?.type === 'team' && person?.status !== 'dismissed' && person?.status !== 'transferred');
}

function smartTeamSuggestion(prefix, tail = '') {
  const needle = smartNorm(tail);
  if (needle && !smartNorm('Команда').startsWith(needle) && !smartNorm('Команда').includes(needle)) return null;
  return {
    label: 'Команда',
    hint: 'Вся команда',
    icon: 'team',
    insert: `${prefix} команда`,
    submit: true,
  };
}

function smartEscapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ищем последний слот-маркер, после которого пользователь начал печатать имя
// (не больше двух слов — дальше это уже название записи, а не имя).
function smartSlotAt(value) {
  // Регистр и «ё» приводим без обрезки пробелов: позиции символов должны совпадать
  // с исходной строкой, иначе подстановка имени попадёт не туда.
  const normalized = String(value || '').toLowerCase().replace(/ё/g, 'е');
  let best = null;
  const scan = (markers, kind) => markers.forEach((marker) => {
    // Маркер может стоять и в самом конце строки («задача для»), и с уже начатым
    // именем после него («задача для Ма») — не больше двух слов.
    const match = normalized.match(new RegExp(`(^|\\s)${smartEscapeRe(marker)}(?:\\s+(?:\\S+\\s*){0,2})?$`, 'i'));
    if (!match) return;
    const markerEnd = match.index + match[1].length + marker.length;
    if (!best || markerEnd > best.markerEnd) best = { kind, markerEnd, tail: value.slice(markerEnd).trimStart() };
  });
  scan(SMART_PROJECT_SLOT_MARKERS, 'project');
  scan(SMART_PERSON_SLOT_MARKERS, 'person');
  return best;
}

// Подсказка = что подставить в строку и нужно ли сразу отправлять запрос.
// Людей и проекты отправляем сразу (фраза уже законченная), а тип создаваемой записи —
// нет: после него пользователь ещё пишет название.

function smartAtSuggestions(value) {
  const match = String(value || '').match(/(^|\s)@([^@,;]*)$/);
  if (!match) return null;
  const tail = match[2].trim();
  const start = match.index + match[1].length;
  const before = value.slice(0, start);
  const people = smartFilterByTail(smartSuggestionPeople(), tail, (person) => person.name).map((person) => ({
    label: `@${person.name}`,
    hint: person.role || 'Сотрудник',
    person,
    insert: `${before}@${person.name} `,
    submit: false,
  }));
  const projects = smartFilterByTail(store?.projects || [], tail, (project) => project.name).map((project) => ({
    label: `@${project.name}`,
    hint: 'Проект',
    icon: 'projects',
    insert: `${before}@${project.name} `,
    submit: false,
  }));
  return [...people, ...projects].slice(0, SMART_SUGGEST_LIMIT);
}



// Визуальный слой над обычным input: сохраняем нативную клавиатуру/каретку, но
// распознанные имена и проекты подчёркиваем как mention-chip в Журнале.
function smartHighlightedQueryHtml(value) {
  const text = String(value || '');
  if (!text) return '';
  const entities = [
    ...(store?.people || []).map((item) => ({ name: String(item.name || ''), kind: 'person' })),
    ...(store?.projects || []).map((item) => ({ name: String(item.name || ''), kind: 'project' })),
  ].filter((item) => item.name).sort((a, b) => b.name.length - a.name.length);
  const ranges = [];
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  for (const entity of entities) {
    const needle = entity.name.toLowerCase().replace(/ё/g, 'е');
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const left = at > 0 ? lower[at - 1] : '';
      const right = lower[at + needle.length] || '';
      if ((!left || /[\s@,;:()\[\]—–-]/.test(left)) && (!right || /[\s,;:.!?()\[\]—–-]/.test(right))) {
        const hasAt = at > 0 && text[at - 1] === '@';
        const start = hasAt ? at - 1 : at;
        if (!ranges.some((r) => start < r.end && at + needle.length > r.start)) ranges.push({ start, mentionStart: at, end: at + needle.length, kind: entity.kind, hasAt });
      }
      from = at + needle.length;
    }
  }
  ranges.sort((a,b) => a.start - b.start);
  let out = '', pos = 0;
  for (const range of ranges) {
    out += escapeHtml(text.slice(pos, range.start));
    if (range.hasAt) out += '<span class="smart-query-at-hidden">@</span>';
    out += `<span class="smart-query-mention smart-query-${range.kind}">${escapeHtml(text.slice(range.mentionStart ?? range.start, range.end))}</span>`;
    pos = range.end;
  }
  return out + escapeHtml(text.slice(pos));
}

// Проектный слот должен срабатывать сразу после самого маркера, даже когда
// пользователь ещё не начал вводить название проекта: «… проект»,
// «… по проекту», «… в проекте», «… на проекте». Возвращает null, когда
// совпадений нет — тогда вызывающая сторона идёт дальше по остальным префиксам.
function smartSuggestionsForProjectSlot(value, slot) {
  const projectHead = value.slice(0, slot.markerEnd);
  const insideCommand = Boolean(smartMatchPrefix(value, SMART_CREATE_PREFIXES));
  const projects = smartFilterByTail(store?.projects || [], slot.tail, (project) => project.name);
  if (!projects.length) return null;
  return projects.map((project) => ({
    label: project.name,
    hint: project.status === 'active' ? 'Активный проект' : 'Проект',
    icon: 'projects',
    insert: `${projectHead} ${project.name} `,
    submit: !insideCommand,
  }));
}

function smartSuggestionsForPersonPrefix(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  const team = smartTeamSuggestion(head, rest);
  const people = smartFilterByTail(smartSuggestionPeople(), rest, (person) => person.name).map((person) => ({
    label: person.name,
    hint: person.role || 'Сотрудник',
    person,
    insert: `${head} ${person.name}`,
    submit: true,
  }));
  return [...(team ? [team] : []), ...people].slice(0, SMART_SUGGEST_LIMIT);
}

function smartSuggestionsForProjectPrefix(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  return smartFilterByTail(store?.projects || [], rest, (project) => project.name).map((project) => ({
    label: project.name,
    hint: project.status === 'active' ? 'Активный проект' : 'Проект',
    icon: 'projects',
    insert: `${head} проекте ${project.name}`,
    submit: true,
  }));
}

// Слоты внутри команды важнее общих префиксов: «поставь задачу для Ма…» — это
// подсказка по сотрудникам, а не список типов записей. Возвращает null, когда
// в этом слоте нет совпадений — тогда вызывающая сторона идёт дальше.
function smartSuggestionsForSlot(value, slot) {
  const insideCommand = Boolean(smartMatchPrefix(value, SMART_CREATE_PREFIXES));
  const head = value.slice(0, slot.markerEnd);
  if (slot.kind === 'person') {
    const people = smartFilterByTail(smartSuggestionPeople(), slot.tail, (person) => person.name);
    if (!people.length) return null;
    return people.map((person) => ({
      label: person.name,
      hint: person.role || 'Сотрудник',
      person,
      insert: `${head} ${person.name} `,
      submit: !insideCommand,
    }));
  }
  const projects = smartFilterByTail(store?.projects || [], slot.tail, (project) => project.name);
  if (!projects.length) return null;
  return projects.map((project) => ({
    label: project.name,
    hint: project.status === 'active' ? 'Активный проект' : 'Проект',
    icon: 'projects',
    insert: `${head} ${project.name} `,
    submit: !insideCommand,
  }));
}

function smartSuggestionsForCreate(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  const typed = smartNorm(rest);
  const createTypes = smartNorm(prefix).startsWith('запланир') ? SMART_SCHEDULE_TYPES : SMART_CREATE_TYPES;
  // Для «запланируй» доступны только 1:1, PR и встреча. Для остальных
  // глаголов показываем полный набор создаваемых сущностей.
  const matched = createTypes.filter((type) => smartNorm(type.insert).startsWith(typed) || typed.startsWith(smartNorm(type.insert)));
  if (typed && matched.some((type) => typed.startsWith(smartNorm(type.insert)))) return [];
  return matched.slice(0, SMART_SUGGEST_LIMIT).map((type) => ({
    label: type.label,
    hint: type.hint,
    icon: 'plus',
    insert: `${head} ${type.insert}`,
    submit: false,
  }));
}

function smartSuggestionsForOpen(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  const sections = smartFilterByTail(SMART_SECTION_TARGETS, rest, (item) => item.label).map((item) => ({
    label: item.label,
    hint: 'раздел',
    icon: 'chevronRight',
    insert: `${head} ${item.insert}`,
    submit: true,
  }));
  const people = smartFilterByTail(smartSuggestionPeople(), rest, (person) => person.name)
    .slice(0, 3)
    .map((person) => ({ label: person.name, hint: 'профиль сотрудника', person, insert: `${head} ${person.name}`, submit: true }));
  const projects = smartFilterByTail(store?.projects || [], rest, (project) => project.name)
    .slice(0, 3)
    .map((project) => ({ label: project.name, hint: 'проект', icon: 'projects', insert: `${head} ${project.name}`, submit: true }));
  return [...sections, ...people, ...projects].slice(0, SMART_SUGGEST_LIMIT);
}

function smartSuggestionsForMine(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  // Даже после полного названия типа оставляем одну точную подсказку. Это даёт
  // понятный Enter/click target в палитре поиска: «Покажи мои задачи» не должен
  // внезапно терять предложение ровно на последней букве.
  const exactTarget = SMART_MINE_TARGETS.find((item) => smartNorm(item.insert) === smartNorm(rest));
  if (exactTarget) {
    return [{
      label: exactTarget.label,
      hint: 'только моё',
      icon: 'search',
      insert: `${head} ${exactTarget.insert}`,
      submit: true,
    }];
  }
  return smartFilterByTail(SMART_MINE_TARGETS, rest, (item) => item.label).map((item) => ({
    label: item.label,
    hint: 'только моё',
    icon: 'search',
    // После «Покажи мои» выбор типа уже полностью определяет запрос.
    // Не заставляем пользователя выбирать ту же точную подсказку второй раз:
    // первый клик сразу выполняет запрос и показывает результат.
    insert: `${head} ${item.insert}`,
    submit: true,
  }));
}

function smartSuggestionsForShow(value, prefix) {
  const head = value.slice(0, prefix.length);
  const rest = value.slice(prefix.length).trimStart();
  const targets = smartFilterByTail(SMART_SHOW_TARGETS, rest, (item) => item.label).map((item) => ({
    label: item.label,
    hint: 'тип элементов',
    icon: 'search',
    insert: `${head} ${item.insert}`,
    submit: true,
  }));
  const people = smartFilterByTail(smartSuggestionPeople(), rest, (person) => person.name).map((person) => ({
    label: person.name,
    hint: person.role || 'Сотрудник',
    person,
    insert: `${head} задачи ${person.name}`,
    submit: true,
  }));
  const projects = smartFilterByTail(store?.projects || [], rest, (project) => project.name).map((project) => ({
    label: project.name,
    hint: 'Проект',
    icon: 'projects',
    insert: `${head} задачи по проекту ${project.name}`,
    submit: true,
  }));
  return [...targets, ...people, ...projects].slice(0, SMART_SUGGEST_LIMIT);
}

function smartSuggestionsFor(rawValue) {
  const value = String(rawValue || '');
  if (!value.trim()) return [];
  const atSuggestions = smartAtSuggestions(value);
  if (atSuggestions) return atSuggestions;

  // Проектный слот проверяем отдельным ранним проходом — он не даёт более
  // общим intent-префиксам перехватить запрос раньше.
  const immediateProjectSlot = smartSlotAt(value);
  if (immediateProjectSlot?.kind === 'project') {
    const suggestions = smartSuggestionsForProjectSlot(value, immediateProjectSlot);
    if (suggestions) return suggestions;
  }

  const personPrefix = smartMatchPrefix(value, SMART_PERSON_PREFIXES);
  if (personPrefix) return smartSuggestionsForPersonPrefix(value, personPrefix);

  const projectPrefix = smartMatchPrefix(value, SMART_PROJECT_PREFIXES);
  if (projectPrefix) return smartSuggestionsForProjectPrefix(value, projectPrefix);

  const slot = smartSlotAt(value);
  if (slot) {
    const suggestions = smartSuggestionsForSlot(value, slot);
    if (suggestions) return suggestions;
  }

  const createPrefix = smartMatchPrefix(value, SMART_CREATE_PREFIXES);
  if (createPrefix) return smartSuggestionsForCreate(value, createPrefix);

  const openPrefix = smartMatchPrefix(value, SMART_OPEN_PREFIXES);
  if (openPrefix) return smartSuggestionsForOpen(value, openPrefix);

  const minePrefix = smartMatchPrefix(value, SMART_MINE_PREFIXES);
  if (minePrefix) return smartSuggestionsForMine(value, minePrefix);

  const showPrefix = smartMatchPrefix(value, SMART_SHOW_PREFIXES);
  if (showPrefix) return smartSuggestionsForShow(value, showPrefix);

  return [];
}

// ---------- Отрисовка ответа ----------

// Дату печатаем теми же helpers, что и всё приложение: «2 дн. назад», «12 сентября».
function smartSearchMetaText(item) {
  const parts = [];
  if (item.meta) parts.push(String(item.meta));
  if (item.date && item.dateEnd) parts.push(`${fmtDate(item.date)} – ${fmtDate(item.dateEnd)}`);
  else if (item.date) parts.push(item.dateKind === 'due' ? dueLabel(item.date) : fmtDate(item.date));
  return parts.join(' — ');
}

function smartSearchStatusHtml(item) {
  if (!item?.entityType || !item.entityId) return '';
  const status = item.status || '';
  if (item.entityType === 'task') {
    const label = TASK_STATUS_LABEL?.[status] || status || 'Статус';
    const task = (store.tasks || []).find((candidate) => candidate.id === item.entityId);
    const editable = !window.Auth || !task || Auth.canEditTask(task);
    const actionIdx = editable ? registerAction((event) => openTaskStatusMenu(event, item.entityId, status, async () => smartSearchAsk(smartSearchState().query, { keepNote: true }))) : null;
    return `<span class="smart-status-control smart-status-task ${editable ? 'task-status-interactive' : ''}" ${editable ? `role="button" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1" aria-label="Изменить статус: ${escapeHtml(label)}"` : `aria-label="${escapeHtml(label)}"`}>${taskStatusBadge(status)}</span>`;
  }
  if (item.entityType === 'issue') {
    const label = ISSUE_STATUS_LABEL?.[status] || status || 'Статус';
    const issue = (store.issues || []).find((candidate) => candidate.id === item.entityId);
    const editable = !window.Auth || !issue || Auth.canEditItem('issues', issue, ['relatedPersonIds']);
    const actionIdx = editable ? registerAction((event) => openIssueStatusMenu(event, item.entityId, status, async () => smartSearchAsk(smartSearchState().query, { keepNote: true }))) : null;
    return `<span class="smart-status-control smart-status-issue ${editable ? 'task-status-interactive' : ''}" ${editable ? `role="button" tabindex="0" data-action-id="${actionIdx}" data-action-stop="1" aria-label="Изменить статус: ${escapeHtml(label)}"` : `aria-label="${escapeHtml(label)}"`}>${issueStatusBadge(status, null, { withTitle: false })}</span>`;
  }
  if (item.entityType === 'agreement') return agreementStatusBadge(status, item.entityId, { withLabel: false, withTitle: false, onChanged: async () => smartSearchAsk(smartSearchState().query, { keepNote: true }) });
  return '';
}

function smartSearchRowHtml(item, options = {}) {
  const open = item.open || {};
  const attrs = open.command
    ? `data-command="${escapeHtml(open.command)}" data-command-arg="${escapeHtml(open.arg || '')}"`
    : open.route ? `data-route="${escapeHtml(open.route)}"` : '';
  const full = String(item.title || '');
  const meta = smartSearchMetaText(item);
  const status = smartSearchStatusHtml(item);
  if (options.layout === 'labeled-text') {
    return `<div class="smart-row smart-row-labeled ${attrs ? 'clickable' : ''} ${item.tone ? `tone-${escapeHtml(item.tone)}` : ''}" ${attrs}>
      <span class="smart-row-label-col">${escapeHtml(item.label || '')}</span>
      <span class="smart-row-title smart-row-title-wrap" title="${escapeHtml(full)}">${escapeHtml(full)}</span>
    </div>`;
  }
  if (options.layout === 'project-load') {
    const markerStyle = item.markerColor ? ` style="background:${escapeHtml(item.markerColor)}"` : '';
    return `<div class="smart-row smart-row-project-load ${attrs ? 'clickable' : ''}" ${attrs}>
      <span class="smart-project-load-marker"${markerStyle}></span>
      <span class="smart-row-title" title="${escapeHtml(full)}">${escapeHtml(full)}</span>
      ${meta ? `<span class="smart-row-meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>` : ''}
    </div>`;
  }
  return `<div class="smart-row ${attrs ? 'clickable' : ''} ${item.tone ? `tone-${escapeHtml(item.tone)}` : ''}" ${attrs}>
    ${status}
    ${item.label ? `<span class="smart-row-label">${escapeHtml(item.label)}</span>` : ''}
    ${item.wrapText
      ? `<span class="smart-row-title smart-row-title-wrap" title="${escapeHtml(full)}">${escapeHtml(full)}</span>`
      : `<span class="smart-row-title" title="${escapeHtml(full)}">${escapeHtml(previewText(full, 200))}</span>`}
    ${meta ? `<span class="smart-row-meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>` : ''}
    ${item.rightLabel ? `<span class="smart-row-label smart-row-label-right">${escapeHtml(item.rightLabel)}</span>` : ''}
  </div>`;
}

function smartCardHtml({ title, bodyHtml = '', summary = null, footer = null, more = 0, layout = '' }) {
  const isLoadLevel = summary?.variant === 'load-level';
  const canUseSummaryAction = summary?.action?.command && (!window.Auth || Auth.canManage('projects'));
  const summaryActionHtml = canUseSummaryAction
    ? `<button type="button" class="smart-section-summary-action" data-command="${escapeHtml(summary.action.command)}" data-command-arg="${escapeHtml(summary.action.arg || '')}" data-command-stop="1">${escapeHtml(summary.action.label || 'Редактировать')}</button>`
    : '';
  const summaryHtml = !summary || isLoadLevel ? ''
    : `<div class="smart-section-summary tone-${escapeHtml(summary.tone || 'info')}">${escapeHtml(summary.text || '')}${summaryActionHtml}</div>`;
  const loadTitleHtml = isLoadLevel
    ? `<h4 title="${escapeHtml(title || '')}: ${escapeHtml(summary.text || '')}"><span>${escapeHtml(title || '')}</span><span class="smart-section-title-sep">—</span><span class="smart-section-load-title ${escapeHtml(summary.tone || 'none')}">${escapeHtml(summary.text || '')}</span></h4>`
    : `<h4 title="${escapeHtml(title || '')}">${escapeHtml(title || '')}</h4>`;
  const loadActionHtml = isLoadLevel && canUseSummaryAction
    ? `<button type="button" class="smart-section-head-action smart-section-head-button" data-command="${escapeHtml(summary.action.command)}" data-command-arg="${escapeHtml(summary.action.arg || '')}" data-command-stop="1">Изменить загрузку</button>`
    : '';
  const headerActionHtml = loadActionHtml || (footer
    ? `<a class="smart-section-head-action" data-route="${escapeHtml(footer.route)}" data-route-stop="1">${escapeHtml(footer.label)}</a>`
    : '');
  return `<details class="smart-section ${layout ? `smart-section-${escapeHtml(layout)}` : ''}" open>
    <summary class="smart-section-head">
      <span class="smart-section-chevron">${icon('chevronRight', 10)}</span>
      ${loadTitleHtml}
      ${headerActionHtml}
    </summary>
    <div class="smart-section-content">
      <div class="smart-section-body">${summaryHtml}${bodyHtml}</div>
    </div>
  </details>`;
}

function smartSearchSectionHtml(section) {
  const groups = Array.isArray(section.groups) ? section.groups : [];
  const layout = section.layout || '';
  const groupedBody = groups.length ? groups.map((group) => `<div class="smart-project-group">
    <div class="smart-project-group-head">
      ${group.route ? `<a class="smart-project-group-title" data-route="${escapeHtml(group.route)}">${escapeHtml(group.title)}</a>` : `<span class="smart-project-group-title">${escapeHtml(group.title)}</span>`}
    </div>
    <div class="smart-project-group-items">${(group.items || []).map((item) => smartSearchRowHtml(item, { layout })).join('')}</div>
  </div>`).join('') : '';
  const flatItems = section.items || [];
  const bodyHtml = groupedBody || (flatItems.length
    ? flatItems.map((item) => smartSearchRowHtml(item, { layout })).join('')
    : `<div class="smart-empty smart-section-empty">${escapeHtml(section.emptyText || 'Пока ничего нет')}</div>`);
  return smartCardHtml({
    title: section.title,
    bodyHtml,
    summary: section.summary,
    footer: section.footer,
    more: section.more,
    layout,
  });
}

function smartSearchCandidateHtml(candidate, index) {
  const person = (typeof store !== 'undefined' && store?.person ? store.person(candidate.id) : null) || candidate;
  // Если общих проектов и встреч нет, показываем хотя бы тип — иначе при полных тёзках
  // («две Марии Зубаревы») карточки выглядят абсолютно одинаково и выбирать не из чего.
  const contextReasons = (candidate.reasons || []).slice(0, 3);
  const reasons = contextReasons.length ? contextReasons : [candidate.type === 'stakeholder' ? 'Стейкхолдер' : 'Сотрудник'];
  return `<button type="button" class="smart-candidate" data-smart-candidate="${escapeHtml(candidate.id)}" data-smart-candidate-index="${index}">
    ${avatarHtml(person, 'md')}
    <span class="smart-candidate-copy">
      <strong>${escapeHtml(candidate.name)}</strong>
      ${candidate.role ? `<small>${escapeHtml(candidate.role)}</small>` : ''}
      <span class="smart-candidate-reasons">${reasons.map((reason) => `<span class="smart-reason">${escapeHtml(reason)}</span>`).join('')}</span>
    </span>
  </button>`;
}

function smartSearchAmbiguousHtml(payload) {
  return `<section class="smart-answer smart-answer-ambiguous">
    <h3>Кого вы имеете в виду?</h3>
    <p class="smart-answer-hint">По слову «${escapeHtml(payload.fragment)}» подходит несколько человек — выберите, о ком рассказать.</p>
    <div class="smart-candidates">${payload.candidates.map(smartSearchCandidateHtml).join('')}</div>
    <label class="lab-private-checkbox smart-remember">
      <input type="checkbox" id="smart-remember-choice" checked />
      <span>Запомнить выбор для «${escapeHtml(payload.fragment)}»</span>
    </label>
  </section>`;
}

function smartPersonDigestHeader(person, digest) {
  if (!person) return '';
  const work = personWorkStatus(person, store?.vacations || []);
  const localTime = localTimeLabel(person);
  const statusParts = [];
  if (work?.text) statusParts.push(`<span class="smart-person-work-status" style="color:${work.color}">${escapeHtml(work.text)}</span>`);
  if (localTime) statusParts.push(`<span class="smart-person-local-time">${escapeHtml(localTime)}</span>`);
  // Должность + грейд — тот же формат, что в шапке профиля сотрудника (roleWithGrade).
  const roleGrade = typeof roleWithGrade === 'function' ? roleWithGrade(person) : '';
  return `<header class="smart-answer-head smart-answer-person-head smart-answer-person-profile">
    ${typeof avatarWithStatusHtml === 'function' ? avatarWithStatusHtml(person, store?.vacations || [], 'xl') : avatarHtml(person, 'xl')}
    <div class="smart-person-profile-copy">
      <div class="dh-name" title="${escapeHtml(digest.title)}">${escapeHtml(digest.title)}</div>
      ${roleGrade ? `<div class="dh-role">${roleGrade}</div>` : ''}
      ${statusParts.length ? `<div class="smart-person-head-meta">${statusParts.join('<span class="smart-person-meta-sep">—</span>')}</div>` : ''}
    </div>
  </header>`;
}

function smartSearchDigestHtml(result) {
  const digest = result.digest;
  const resolution = result.resolution;
  const person = digest.person && typeof store !== 'undefined' && store?.person ? (store.person(digest.person.id) || digest.person) : digest.person;
  const alternatives = resolution?.alternatives || [];
  const resolutionNote = digest.type === 'person' && (resolution?.via === 'hint' || alternatives.length)
    ? `<div class="smart-resolution">
        ${resolution?.via === 'hint' ? 'Запомненный выбор: ' : 'Показано для: '}<strong>${escapeHtml(digest.title)}</strong>
        ${alternatives.length ? `<button type="button" class="smart-link-button" data-smart-switch="1">Выбрать другого</button>` : ''}
        ${resolution?.via === 'hint' ? `<button type="button" class="smart-link-button" data-smart-forget="1">Забыть выбор</button>` : ''}
      </div>`
    : '';
  const digestIcon = digest.type === 'project' ? 'projects' : digest.type === 'week' ? 'calendar' : 'leaf';
  const header = digest.type === 'person'
    ? smartPersonDigestHeader(person, digest)
    : `<header class="smart-answer-head">
      ${person ? avatarHtml(person, 'lg') : `<span class="smart-answer-icon">${icon(digestIcon, 18)}</span>`}
      <div class="smart-answer-title">
        <h3 title="${escapeHtml(digest.title)}">${escapeHtml(digest.title)}</h3>
        ${digest.subtitle ? `<p title="${escapeHtml(digest.subtitle)}">${escapeHtml(digest.subtitle)}</p>` : ''}
      </div>
      ${digest.footer ? `<a class="smart-answer-link" data-route="${escapeHtml(digest.footer.route)}">${escapeHtml(digest.footer.label)}</a>` : ''}
    </header>`;
  // Строку-саммари ("N просроченных задач — N проблем") над секциями саджеста
  // убрали по просьбе пользователя: он и так открывает и просматривает сами
  // секции, а сигналы наверху воспринимались как бесполезный дублирующий шум.
  // Данные (digest.signals) сервер по-прежнему считает и отдаёт — здесь их
  // просто не рендерим, чтобы не трогать другие потребители smart-search API.
  return `<section class="smart-answer smart-answer-${escapeHtml(digest.type || 'digest')}">
    ${header}
    ${resolutionNote}
    ${digest.sections.length
      ? `<div class="smart-sections ${digest.sections.length > 1 ? 'smart-sections-unified' : ''}">${digest.sections.map(smartSearchSectionHtml).join('')}</div>`
      : (!(digest.signals || []).length ? `<div class="smart-empty">Пока ничего не записано</div>` : '')}
  </section>`;
}

// Группы обычного поиска показываем компактно: заголовок, счётчик и несколько строк.
const SMART_SEARCH_GROUPS = [
  ['people', 'Люди', 'team', (row) => {
    const person = row.person || row;
    return { title: person.name, meta: person.role || '', open: { route: personPath(person) } };
  }],
  ['tasks', 'Задачи', 'tasks', (task) => ({ title: task.title, meta: TASK_STATUS_LABEL?.[task.status] || '', open: { command: 'openTaskModal', arg: task.id } })],
  ['issues', 'Проблемы', 'issues', (issue) => ({ title: issue.title, open: { command: 'openIssueModal', arg: issue.id } })],
  ['meetings', 'Встречи', 'meetings', (meeting) => ({ title: meeting.title || 'Встреча', date: meeting.date, open: { route: `/meetings/${encodeURIComponent(meeting.slug || meeting.id)}` } })],
  ['agreements', 'Договорённости', 'agreements', (item) => ({ title: item.text, open: { command: 'openAgreementModal', arg: item.id } })],
  ['journal', 'Журнал', 'journal', (entry) => ({ title: entry.text, meta: JOURNAL_KIND_LABEL?.[entry.kind] || '', open: { route: `/journal?entry=${encodeURIComponent(entry.id)}` } })],
  ['projects', 'Проекты', 'projects', (project) => ({ title: project.name, open: { route: projectPath(project) } })],
  ['goals', 'Цели', 'goals', (goal) => ({ title: goal.title, open: { route: goalPath(goal) } })],
  ['labs', 'The Labs', 'labs', (item) => ({ title: item.title, open: { route: `/labs/${encodeURIComponent(item.id)}` } })],
  ['checkins', 'Check-in', 'checkins', (item) => ({ title: item.did || item.blockers || 'Check-in', date: item.weekStart || '', open: { route: `/checkins?person=${encodeURIComponent(item.personId || '')}` } })],
  ['processes', 'Процессы', 'processes', (item) => ({ title: item.title, open: { route: `/processes/${encodeURIComponent(item.slug || item.id)}` } })],
  ['vacations', 'Отсутствия', 'calendar', (item) => ({ title: store?.person(item.personId)?.name || 'Отсутствие', date: item.startDate, dateEnd: item.endDate, open: { route: '/calendar' } })],
  ['links', 'Ссылки и материалы', 'documents', (item) => ({ title: item.title || item.url, meta: item.sourceTitle || '', open: { href: item.url } })],
  ['documents', 'Документы', 'documents', (item) => ({ title: item.title || item.url, open: { route: '/documents' } })],
  ['tools', 'Инструменты', 'tools', (item) => ({ title: item.title || item.url, open: { route: '/tools' } })],
];

const SMART_SEARCH_SECTION_FOOTERS = {
  people: { label: 'Все люди', route: '/team' },
  projects: { label: 'Все проекты', route: '/projects' },
  tasks: { label: 'Все задачи', route: '/tasks' },
  issues: { label: 'Все проблемы', route: '/issues' },
  meetings: { label: 'Все встречи', route: '/meetings' },
  journal: { label: 'Все записи', route: '/journal' },
  agreements: { label: 'Все договорённости', route: '/agreements' },
  links: { label: 'Все материалы', route: '/knowledge-base' },
  goals: { label: 'Все цели', route: '/goals' },
  labs: { label: 'Все проекты The Labs', route: '/labs?tab=projects' },
  processes: { label: 'Все процессы', route: '/processes' },
  checkins: { label: 'Все Check-in', route: '/checkins' },
  vacations: { label: 'Все отсутствия', route: '/calendar' },
  documents: { label: 'Все документы', route: '/knowledge-base' },
  tools: { label: 'Все инструменты', route: '/tools' },
};

function smartSearchSectionFooter(group, result) {
  const base = SMART_SEARCH_SECTION_FOOTERS[group];
  if (!base) return null;
  if (group !== 'tasks') return base;
  const command = result?.search?.command;
  if (command?.group !== 'tasks' || String(command.textRemainder || '').trim()) return base;
  const nav = smartSearchCommandNavigation(result.search);
  return nav ? { label: 'Все задачи', route: nav.route } : base;
}

function smartSearchTaskStatusGroupedCard(tasks, result) {
  if (!tasks?.length) return '';
  const order = ['todo', 'in_progress', 'in_review', 'blocked', 'paused', 'done'];
  const byStatus = new Map();
  tasks.forEach((task) => {
    const status = task.status || 'todo';
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status).push(task);
  });
  const statuses = [
    ...order.filter((status) => byStatus.has(status)),
    ...[...byStatus.keys()].filter((status) => !order.includes(status)),
  ];
  const bodyHtml = statuses.map((status) => {
    const label = TASK_STATUS_LABEL?.[status] || status;
    return `<div class="smart-project-group smart-task-status-group">
      <div class="smart-project-group-head"><span class="smart-project-group-title">${escapeHtml(label)}</span></div>
      <div class="smart-project-group-items">${byStatus.get(status).map((task) => taskListRowHtml(task)).join('')}</div>
    </div>`;
  }).join('');
  return smartCardHtml({
    title: 'Задачи',
    bodyHtml,
    footer: smartSearchSectionFooter('tasks', result),
  });
}

function smartSearchResultsHtml(result) {
  const g = result.search?.groups || {};
  const cards = [];
  const resultCard = (group, title, items, renderer, options = {}) => {
    if (!items?.length) return;
    const visible = items.slice(0, 6);
    const more = typeof options.more === 'number' ? Math.max(0, options.more) : Math.max(0, items.length - visible.length);
    cards.push(smartCardHtml({
      title,
      bodyHtml: visible.map(renderer).join(''),
      footer: smartSearchSectionFooter(group, result),
      more,
    }));
  };

  if ((g.people || []).length) {
    resultCard('people', 'Люди', g.people, (block) => {
      const p = block.person || block;
      return `<div class="ui-row list-row" data-route="${personPath(p)}">${avatarHtml(p, 'sm')}<span class="title">${escapeHtml(p.name)}</span><span class="meta">${escapeHtml(p.role || '')}</span></div>`;
    });
  }
  resultCard('projects', 'Проекты', g.projects || [], (p) => `<div class="ui-row list-row" data-route="${projectPath(p)}"><span class="title">${escapeHtml(p.name)}</span>${p.status ? `<span class="meta">${escapeHtml(p.status)}</span>` : ''}</div>`);
  const searchCommand = result.search?.command || null;
  const monthlyTeamTasks = searchCommand?.group === 'tasks'
    && (searchCommand.modifiers || []).includes('current_month')
    && !searchCommand.person && !searchCommand.project && !searchCommand.selfRequested;
  if (monthlyTeamTasks && (g.tasks || []).length) cards.push(smartSearchTaskStatusGroupedCard(g.tasks, result));
  else {
    const tasks = g.tasks || [];
    const visibleTasks = tasks.slice(0, 6);
    const openTotal = tasks.filter((task) => task.status !== 'done' && !task.archivedAt).length;
    const openVisible = visibleTasks.filter((task) => task.status !== 'done' && !task.archivedAt).length;
    resultCard('tasks', 'Задачи', tasks, (t) => taskListRowHtml(t), { more: openTotal - openVisible });
  }
  resultCard('issues', 'Проблемы', g.issues || [], (i) => issueCardHtml(i));
  resultCard('meetings', 'Встречи', g.meetings || [], (m) => `<div class="ui-row list-row" data-route="/meetings/${encodeURIComponent(m.slug || m.id)}"><span class="ui-tag badge">${escapeHtml(MEETING_TYPE_LABEL?.[m.type] || m.type || 'Встреча')}</span><span class="title">${escapeHtml(meetingDisplayTitle(m))}</span><span class="meta">${fmtDate(m.date)}</span></div>`);
  resultCard('journal', 'Журнал', g.journal || [], (j) => `<div class="ui-row list-row" data-route="/journal?entry=${encodeURIComponent(j.id)}"><span class="title">${previewText(j.text, 90)}</span></div>`);
  resultCard('agreements', 'Договорённости', g.agreements || [], (a) => `<div class="ui-row list-row" data-command="openAgreementModal" data-command-arg="${escapeHtml(a.id)}"><span class="title">${previewText(a.text, 90)}</span>${a.dueDate ? `<span class="meta">${dueLabel(a.dueDate)}</span>` : ''}</div>`);
  resultCard('links', 'Ссылки и материалы', g.links || [], (item) => { const idx = registerAction(() => window.open(item.url, '_blank', 'noopener')); return `<div class="ui-row list-row" data-action-id="${idx}"><span class="title">${escapeHtml(item.title || item.url)}</span>${item.sourceTitle ? `<span class="meta">${escapeHtml(item.sourceTitle)}</span>` : ''}</div>`; });
  resultCard('goals', 'Цели', g.goals || [], (goal) => `<div class="ui-row list-row" data-route="${goalPath(goal)}"><span class="title">${escapeHtml(goal.title)}</span></div>`);
  resultCard('labs', 'The Labs', g.labs || [], (item) => `<div class="ui-row list-row" data-route="/labs/${encodeURIComponent(item.id)}"><span class="title">${escapeHtml(item.title)}</span><span class="meta">The Labs</span></div>`);
  resultCard('processes', 'Процессы', g.processes || [], (item) => processCardHtml(item));
  resultCard('checkins', 'Check-in', g.checkins || [], (item) => { const p = store?.person(item.personId); return `<div class="ui-row list-row" data-route="/checkins?person=${encodeURIComponent(item.personId || '')}"><span class="title">${p ? escapeHtml(p.name) : 'Check-in'}</span><span class="meta">${escapeHtml(item.weekStart || '')}</span></div>`; });
  resultCard('vacations', 'Отсутствия', g.vacations || [], (item) => { const p = store?.person(item.personId); return `<div class="ui-row list-row" data-route="${p ? personPath(p) : '/calendar'}"><span class="title">${p ? escapeHtml(p.name) : 'Отсутствие'}</span><span class="meta">${fmtDate(item.startDate)} – ${fmtDate(item.endDate)}</span></div>`; });
  resultCard('documents', 'Документы', g.documents || [], (item) => documentRowHtml(item));
  resultCard('tools', 'Инструменты', g.tools || [], (item) => toolRowHtml(item));

  if (!cards.length) {
    return `<section class="smart-answer"><div class="smart-empty">По запросу «${escapeHtml(result.query)}» ничего не нашлось.</div></section>`;
  }
  return `<section class="smart-answer smart-search-page-answer">
    <header class="smart-answer-head">
      <span class="smart-answer-icon">${icon('search', 18)}</span>
      <div class="smart-answer-title"><h3>Результаты поиска</h3><p title="${escapeHtml(result.query)}">${escapeHtml(result.query)}</p></div>
      <a class="smart-answer-link" data-route="/search?q=${encodeURIComponent(result.query)}">Все результаты</a>
    </header>
    <div class="smart-sections smart-search-page-results ${cards.length > 1 ? 'smart-sections-unified' : ''}">${cards.join('')}</div>
  </section>`;
}

function smartSearchAnswerHtml(state) {
  if (state.busy) return `<div class="smart-answer smart-answer-busy tiny">Ищу…</div>`;
  if (state.error) return `<div class="smart-answer smart-answer-error">${escapeHtml(state.error)}</div>`;
  const result = state.result;
  if (!result) return '';
  if (result.kind === 'done') {
    const open = result.done.open;
    const attrs = open?.command
      ? `data-command="${escapeHtml(open.command)}" data-command-arg="${escapeHtml(open.arg || '')}"`
      : open?.route ? `data-route="${escapeHtml(open.route)}"` : '';
    return `<section class="smart-answer smart-answer-note">${icon('check', 15)} ${escapeHtml(result.done.text)}
      ${attrs ? `<button type="button" class="smart-link-button" ${attrs}>${escapeHtml(open.label || 'Открыть')}</button>` : ''}</section>`;
  }
  if (result.kind === 'create') return '';
  if (result.kind === 'navigate') {
    return `<section class="smart-answer smart-answer-note">${icon('check', 15)} Открыл: ${escapeHtml(result.navigate.label)}.</section>`;
  }
  if (result.kind === 'ambiguous') return smartSearchAmbiguousHtml(result.ambiguous);
  if (result.kind === 'digest') return smartSearchDigestHtml(result);
  if (result.kind === 'search') return smartSearchResultsHtml(result);
  return '';
}

function smartSuggestionsHtml(items, activeIndex) {
  if (!items.length) return '';
  return `<div class="smart-suggest-list" role="listbox">
    ${items.map((item, index) => `<button type="button" class="smart-suggest-item ${index === activeIndex ? 'active' : ''}" role="option" aria-selected="${index === activeIndex}" data-smart-suggest-index="${index}">
      <span class="smart-suggest-icon">${item.person ? avatarHtml((typeof store !== 'undefined' && store?.person ? store.person(item.person.id) : null) || item.person, 'md') : icon(item.icon || 'search', 14)}</span>
      <span class="smart-suggest-label">${escapeHtml(item.label)}</span>
      ${item.hint ? `<span class="smart-suggest-hint">${escapeHtml(item.hint)}</span>` : ''}
    </button>`).join('')}
  </div>`;
}

function smartSearchHtml() {
  const state = smartSearchState();
  // Пока ответа нет, строка стоит ниже — по центру пустого экрана; с ответом
  // она поднимается, чтобы освободить место результатам.
  const hasAnswer = Boolean(state.result || state.busy || state.error);
  return `<div class="smart-search ${hasAnswer ? 'has-answer' : ''}" id="smart-search">
    <div class="smart-search-hero">
      <div class="smart-greeting"><span class="smart-greeting-copy"><button type="button" class="smart-greeting-icon" data-smart-greeting-icon aria-label="Сменить иконку">${icon(smartGreetingIconName(), 22)}</button><span>${escapeHtml(smartSearchGreeting())}</span></span></div>
      <div class="smart-input-wrap">
        <form class="smart-input-box" id="smart-search-form">
          <div class="smart-input-layer" id="smart-input-layer">
            <div class="smart-input-highlight" id="smart-input-highlight" aria-hidden="true"><span>${smartHighlightedQueryHtml(state.query || '')}</span></div>
            <input id="smart-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(smartInputPlaceholder())}" value="${escapeHtml(state.query || '')}" />
          </div>
          <div class="smart-quick-inputs" aria-label="Быстрый ввод">
            ${SMART_QUICK_INPUTS.map((item) => `<button type="button" class="smart-quick-input" data-smart-quick="${escapeHtml(item.value)}"><span class="smart-quick-input-icon">${icon(item.icon, 15)}</span><span>${escapeHtml(item.label)}</span></button>`).join('')}
          </div>
          <button type="submit" class="smart-input-submit" aria-label="Спросить">${icon('chevronRight', 16)}</button>
        </form>
        <div class="smart-suggest" id="smart-search-suggest"></div>
      </div>
      <div class="smart-suggestions">
        ${smartSuggestionRows().map((row) => `<div class="smart-suggestion-row">${row.map((item) => { const value = typeof item === 'string' ? item : item.value; const label = typeof item === 'string' ? item.trim() : item.label; return `<button type="button" class="smart-suggestion" data-smart-suggestion="${escapeHtml(value)}">${escapeHtml(label)}</button>`; }).join('')}</div>`).join('')}
      </div>
    </div>
    ${state.note ? `<div class="smart-note">${escapeHtml(state.note.text)}${state.note.undo ? ` <button type="button" class="smart-link-button" data-smart-undo="1">Отменить</button>` : ''}</div>` : ''}
    <div class="smart-answer-wrap" id="smart-search-answer">${smartSearchAnswerHtml(state)}</div>
  </div>`;
}

// ---------- Поведение ----------

// Статус показываем по факту: сначала действие, потом сообщение о результате.
// Поэтому формы сообщают о себе через onSaved, а не в момент открытия.
function smartSearchSetDone(text, open) {
  const state = smartSearchState();
  state.result = { kind: 'done', done: { text, open: open || null } };
  state.busy = false;
  smartSearchRender();
}

async function smartSearchRunCreate(create) {
  const title = create.title || '';
  const state = smartSearchState();

  if (create.target === 'note') {
    // Журнал хранит только заметки. Быстрая команда записывает заметку напрямую.
    try {
      const saved = await Resources.journal.create({ text: title, kind: 'note', createdAt: new Date().toISOString() });
      smartSearchSetDone(
        `Записал заметку: «${title}».`,
        { route: `/journal?entry=${encodeURIComponent(saved.id)}`, label: 'Открыть заметку' },
      );
    } catch (error) {
      console.error(error);
      state.result = null;
      state.error = 'Не удалось сохранить заметку.';
      smartSearchRender();
    }
    return;
  }

  if (create.target === 'idea') {
    // Идеи создаются только в The Labs — без промежуточной записи в Журнале.
    state.result = null;
    smartSearchRender();
    await FeatureLoader.run('openLabIdeaModal', null, {
      prefill: {
        title,
        ...(create.project ? { labProjectId: create.project.id } : {}),
      },
      onSaved: (saved) => smartSearchSetDone(
        `Создал идею «${saved?.title || title}».`,
        saved?.id ? { route: `/labs?tab=ideas`, label: 'Открыть The Labs' } : null,
      ),
    });
    return;
  }

  // Остальное открывается формой: у задачи и встречи есть поля, которые из фразы
  // не вытащить. Пока форма открыта, статус пуст — сообщение появится после сохранения.
  state.result = null;
  smartSearchRender();

  if (create.target === 'tasks') {
    await FeatureLoader.run('openTaskModal', null, {
      prefill: {
        title,
        ...(create.taskType ? { taskType: create.taskType } : {}),
        ...(create.assignee ? { assigneeIds: [create.assignee.id] } : {}),
        ...(create.project ? { projectId: create.project.id } : {}),
        ...(create.priority ? { priority: create.priority } : {}),
        ...(create.dueDate ? { dueDate: create.dueDate } : {}),
      },
      onSaved: (saved) => {
        const created = Array.isArray(saved?.copies) && saved.copies.length ? saved.copies[0] : saved;
        smartSearchSetDone(`Создал задачу «${created?.title || title}».`, created?.id ? { command: 'openTaskModal', arg: created.id, label: 'Открыть задачу' } : null);
      },
    });
    return;
  }
  if (create.target === 'meetings') {
    await FeatureLoader.run('openMeetingModal', {
      title,
      ...(create.meetingType ? { type: create.meetingType } : {}),
      ...(create.assignee ? { participantIds: [create.assignee.id] } : {}),
      ...(create.project ? { projectId: create.project.id } : {}),
      ...(create.dueDate ? { date: create.dueDate } : {}),
    }, {
      onSaved: (saved) => smartSearchSetDone(`Создал встречу «${saved?.title || title}».`, saved ? { route: `/meetings/${encodeURIComponent(saved.slug || saved.id)}`, label: 'Открыть встречу' } : null),
    });
    return;
  }
  if (create.target === 'issues') {
    await FeatureLoader.run('openIssueModal', null, {
      prefill: {
        title,
        ...(create.assignee ? { relatedPersonIds: [create.assignee.id] } : {}),
        ...(create.project ? { projectId: create.project.id } : {}),
        ...(create.priority === 'high' ? { severity: 'high' } : {}),
      },
      onSaved: (saved) => smartSearchSetDone(`Создал проблему «${saved?.title || title}».`, saved?.id ? { command: 'openIssueModal', arg: saved.id, label: 'Открыть проблему' } : null),
    });
    return;
  }
  if (create.target === 'agreements') {
    // Участники договорённости берутся из упоминаний в тексте, поэтому распознанного
    // человека подставляем именно как упоминание — форма подхватит его сама.
    const mention = create.assignee ? `@[${create.assignee.name}](person:${create.assignee.id}) ` : '';
    await FeatureLoader.run('openAgreementModal', null, {
      prefill: {
        text: `${mention}${title}`.trim(),
        ...(create.project ? { projectId: create.project.id } : {}),
        ...(create.dueDate ? { dueDate: create.dueDate } : {}),
      },
      onSaved: (saved) => smartSearchSetDone(`Создал договорённость «${saved?.text || title}».`, saved?.id ? { command: 'openAgreementModal', arg: saved.id, label: 'Открыть договорённость' } : null),
    });
  }
}

async function smartSearchAsk(query, options = {}) {
  const state = smartSearchState();
  const value = String(query || '').trim();
  if (!value) return;
  state.query = value;
  // Контекст сотрудника/проекта — строго одноразовый и определяется только текущим
  // текстом запроса. Никакая предыдущая сводка не должна сужать следующую выдачу.
  state.personContext = null;
  state.projectContext = null;
  state.resolutionContext = null;
  if (!options.keepNote) state.note = null;

  // Точное название раздела — самостоятельная команда навигации. Пользователю не
  // нужно писать «Открой календарь»: достаточно ввести «Календарь» и нажать Enter.
  const directSectionRoute = typeof searchSectionRoute === 'function' ? searchSectionRoute(value) : null;
  if (directSectionRoute && !smartSearchHasOpenIntent(value)) {
    state.result = { kind: 'navigate', query: value, navigate: { route: directSectionRoute, label: value } };
    state.busy = false;
    state.error = '';
    smartSearchRender();
    Router.go(directSectionRoute);
    return;
  }

  // «Открой …» — это прежде всего переход. Для простого названия раздела/сущности
  // маршрут известен сразу. Если в запросе есть фильтры, просим общий поисковый parser
  // разобрать их и, когда весь запрос покрыт структурированными полями, открываем
  // страницу раздела уже с этими фильтрами.
  const navigation = smartSearchNavigationTarget(value);
  if (navigation) {
    state.result = { kind: 'navigate', query: value, navigate: navigation };
    state.busy = false;
    state.error = '';
    smartSearchRender();
    Router.go(navigation.route);
    return;
  }
  if (smartSearchHasOpenIntent(value)) {
    state.busy = true;
    state.error = '';
    smartSearchRender();
    try {
      const parsedSearch = await api.get(`/api/search?q=${encodeURIComponent(value)}`);
      const filteredNavigation = smartSearchCommandNavigation(parsedSearch);
      if (filteredNavigation) {
        state.result = { kind: 'navigate', query: value, navigate: filteredNavigation };
        state.busy = false;
        smartSearchRender();
        Router.go(filteredNavigation.route);
        return;
      }
    } catch (error) {
      console.warn('Не удалось разобрать переход с фильтрами', error);
    }
  }

  state.busy = true;
  state.error = '';
  smartSearchRender();
  try {
    const url = `/api/smart-search?q=${encodeURIComponent(value)}${options.personId ? `&personId=${encodeURIComponent(options.personId)}` : ''}`;
    const result = await api.get(url);
    state.result = result;
    state.busy = false;
    if (result.kind === 'create') {
      smartSearchRender();
      await smartSearchRunCreate(result.create);
      return;
    }
    smartSearchRender();
  } catch (error) {
    console.error(error);
    state.busy = false;
    state.result = null;
    state.error = 'Не удалось выполнить запрос. Попробуйте ещё раз.';
    smartSearchRender();
  }
}

function smartSearchRender() {
  const host = document.getElementById('smart-search-mount');
  if (!host) return;
  host.innerHTML = smartSearchHtml();
  smartSearchBind(host);
}

function smartSearchBind(host) {
  const state = smartSearchState();
  const form = host.querySelector('#smart-search-form');
  const input = host.querySelector('#smart-search-input');
  const suggestBox = host.querySelector('#smart-search-suggest');
  const highlight = host.querySelector('#smart-input-highlight');
  const inputLayer = host.querySelector('#smart-input-layer');
  // Подсказки перерисовываем отдельно от всего виджета: полный ре-рендер на каждом
  // нажатии клавиши сбрасывал бы фокус и каретку в строке ввода.
  let suggestions = [];
  let activeIndex = -1;
  // Закрытие по blur отложено (иначе клик по подсказке не успевает сработать),
  // и этот отложенный вызов нужно снимать при каждом новом показе списка —
  // иначе подсказки, открытые кликом по чипу, гасли через мгновение.
  let closeTimer = null;

  const syncHighlight = () => {
    if (!input || !highlight || !inputLayer) return;
    const value = input.value || '';
    highlight.querySelector('span').innerHTML = smartHighlightedQueryHtml(value);
    highlight.scrollLeft = input.scrollLeft;
    inputLayer.classList.toggle('has-text', Boolean(value));
  };

  const renderSuggestions = () => {
    if (!suggestBox) return;
    suggestBox.innerHTML = smartSuggestionsHtml(suggestions, activeIndex);
    suggestBox.querySelectorAll('[data-smart-suggest-index]').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        applySuggestion(Number(button.dataset.smartSuggestIndex));
      });
    });
  };
  const closeSuggestions = () => { clearTimeout(closeTimer); suggestions = []; activeIndex = -1; renderSuggestions(); };
  const updateSuggestions = () => {
    clearTimeout(closeTimer);
    suggestions = smartSuggestionsFor(input.value);
    activeIndex = -1;
    renderSuggestions();
  };
  const applySuggestion = (index) => {
    const item = suggestions[index];
    if (!item) return;
    input.value = item.insert;
    syncHighlight();
    closeSuggestions();
    if (item.submit) { smartSearchAsk(input.value); return; }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    updateSuggestions();
  };

  if (form && input) {
    input.addEventListener('input', () => { syncHighlight(); updateSuggestions(); });
    input.addEventListener('scroll', syncHighlight);
    syncHighlight();
    input.addEventListener('focus', updateSuggestions);
    input.addEventListener('blur', () => { clearTimeout(closeTimer); closeTimer = setTimeout(closeSuggestions, 120); });
    input.addEventListener('keydown', (event) => {
      if (!suggestions.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = (activeIndex + 1) % suggestions.length; renderSuggestions(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1; renderSuggestions(); return; }
      if (event.key === 'Escape') { event.preventDefault(); closeSuggestions(); return; }
      if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); applySuggestion(activeIndex); }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      closeSuggestions();
      smartSearchAsk(input.value);
    });
  }

  host.querySelector('[data-smart-greeting-icon]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const next = smartCycleGreetingIcon();
    button.innerHTML = icon(next, 22);
  });

  host.querySelectorAll('[data-smart-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.smartQuick || '';
      state.query = value;
      input.value = value;
      syncHighlight();
      input.focus();
      input.setSelectionRange(value.length, value.length);
      updateSuggestions();
    });
  });

  host.querySelectorAll('[data-smart-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.smartSuggestion;
      // Подсказки-заготовки («Как дела у ») не отправляем — ставим курсор, чтобы дописать.
      if (/\s$/.test(value)) {
        state.query = value;
        input.value = value;
        syncHighlight();
        input.focus();
        input.setSelectionRange(value.length, value.length);
        // focus сам вызовет обновление списка; повторный вызов только мигал бы им.
        return;
      }
      smartSearchAsk(value);
    });
  });
  host.querySelectorAll('[data-smart-candidate]').forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = button.dataset.smartCandidate;
      const payload = state.result?.ambiguous;
      const remember = host.querySelector('#smart-remember-choice')?.checked;
      if (remember && payload?.hintKey) {
        await smartSearchSaveHint(payload.hintKey, personId);
        const person = state.result.ambiguous.candidates.find((item) => item.id === personId);
        state.note = { text: `Запомнили: «${payload.fragment}» — это ${person?.name || 'выбранный человек'}.`, undo: { hintKey: payload.hintKey } };
      }
      await smartSearchAsk(state.query, { personId, keepNote: true });
    });
  });
  host.querySelector('[data-smart-switch]')?.addEventListener('click', () => {
    const resolution = state.result?.resolution;
    const digest = state.result?.digest;
    if (!resolution || !digest) return;
    const current = { id: resolution.personId, name: digest.title, role: digest.person?.role || '', reasons: ['показан сейчас'] };
    state.result = {
      ...state.result,
      kind: 'ambiguous',
      ambiguous: { fragment: resolution.hintKey, hintKey: resolution.hintKey, candidates: [current, ...resolution.alternatives] },
    };
    smartSearchRender();
  });
  host.querySelector('[data-smart-forget]')?.addEventListener('click', async () => {
    const hintKey = state.result?.resolution?.hintKey;
    await smartSearchForgetHint(hintKey);
    state.note = { text: `Выбор для «${hintKey}» забыт — спрошу снова.` };
    await smartSearchAsk(state.query, { keepNote: true });
  });
  host.querySelector('[data-smart-undo]')?.addEventListener('click', async () => {
    const hintKey = state.note?.undo?.hintKey;
    await smartSearchForgetHint(hintKey);
    state.note = { text: `Выбор для «${hintKey}» забыт — спрошу снова.` };
    smartSearchRender();
  });
}

function mountSmartSearch(host) {
  if (!host) return;
  smartSearchRender();
  if (!smartSearchState().result) host.querySelector('#smart-search-input')?.focus();
}

FeatureLoader.register({ mountSmartSearch, smartSearchAsk, smartSearchSuggestions: smartSuggestionsFor });
