'use strict';

const { rankTasksByPriority } = require('./task-priority');

// «Умный поиск» — единая строка, которая понимает три вида запросов:
//   1. создание («создай задачу собрать отчёт»);
//   2. обзорные вопросы («как дела у Маши», «на что обратить внимание сегодня»);
//   3. всё остальное — обычный поиск (тот же разбор, что и в /api/search).
//
// Языковой модели здесь нет: это детерминированные правила поверх уже существующего
// разбора запросов. Так поиск остаётся предсказуемым, работает офлайн и покрывается
// обычными тестами — цена в том, что набор формулировок конечен и расширяется списками ниже.

// Разница в суммарном счёте, начиная с которой лидер считается уверенным.
// Меньше — просим уточнить, кого пользователь имел в виду, вместо того чтобы угадывать.
const AMBIGUITY_MARGIN = 2;
const MAX_CANDIDATES = 5;
const MAX_SECTION_ITEMS = 4;
// В сценарии «Чем заняться сегодня» показываем не более трёх приоритетных задач
// внутри каждого проекта. Самих проектов не ограничиваем: так фокус не теряется,
// если у пользователя есть важная работа сразу в нескольких проектах.
const TODAY_TASKS_PER_PROJECT_LIMIT = 3;
const TODAY_NOTES_LIMIT = 10;
const TODAY_ISSUES_LIMIT = 3;
const TODAY_AGREEMENTS_LIMIT = 3;
const TODAY_MISSED_MEETINGS_LIMIT = 5;

const PROJECT_LOAD_OPTIONS = {
  full: { max: 8, label: 'Фултайм', rangeLabel: '6–8 часов' },
  half: { max: 5, label: 'Парт-тайм', rangeLabel: '3–5 часов' },
  support: { max: 2, label: 'Саппорт', rangeLabel: '1–2 часа' },
};

function projectLoadConfig(value) {
  const raw = value && typeof value === 'object' ? value.mode : value;
  return PROJECT_LOAD_OPTIONS[raw] || PROJECT_LOAD_OPTIONS.full;
}

function projectLoadLevel(maxHours) {
  if (maxHours > 10) return { label: 'Перегруз', tone: 'overloaded' };
  if (maxHours >= 8) return { label: 'Полная', tone: 'full' };
  if (maxHours >= 5) return { label: 'Средняя', tone: 'medium' };
  if (maxHours >= 1) return { label: 'Низкая', tone: 'small' };
  return { label: 'Нет загрузки', tone: 'none' };
}

function projectLoadSummary(maxHours) {
  const level = projectLoadLevel(maxHours);
  return { variant: 'load-level', tone: level.tone, text: level.label };
}

function currentWeekRange(today) {
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const start = date.toISOString().slice(0, 10);
  const end = shiftDay(start, 6);
  return { start, end };
}

function meetingHasOutcomes(meeting) {
  const hasNotes = String(meeting?.notes || '').trim().length > 0;
  const hasDocuments = Array.isArray(meeting?.documentLinks)
    && meeting.documentLinks.some((doc) => String(doc?.title || doc?.url || '').trim());
  return hasNotes || hasDocuments;
}

const CREATE_PREFIXES = [
  'создай мне', 'создай', 'создать', 'создайте',
  'добавь мне', 'добавь', 'добавить', 'добавьте',
  'заведи', 'завести', 'заведите',
  'поставь', 'поставить', 'поставьте', 'подставь',
  'назначь', 'назначить', 'оформи', 'оформить',
  'зафиксируй', 'зафиксировать', 'запланируй', 'запланировать',
  'запиши', 'записать', 'запишите', 'сделай', 'сделать',
  'подготовь', 'подготовить', 'организуй', 'организовать',
  'зарегистрируй', 'зарегистрировать', 'внеси', 'внести', 'сформируй', 'сформировать',
  'новая', 'новый', 'новое', 'новую',
].sort((a, b) => b.length - a.length);

const CREATE_TARGETS = [
  ['задачу на развитие', { target: 'tasks', taskType: 'development' }],
  ['задача на развитие', { target: 'tasks', taskType: 'development' }],
  ['задачу', { target: 'tasks' }], ['задача', { target: 'tasks' }], ['задачку', { target: 'tasks' }], ['таск', { target: 'tasks' }],
  ['1:1', { target: 'meetings', meetingType: '1:1' }], ['pr', { target: 'meetings', meetingType: 'pr' }],
  ['встречу', { target: 'meetings' }], ['встреча', { target: 'meetings' }], ['созвон', { target: 'meetings' }],
  ['митинг', { target: 'meetings' }], ['звонок', { target: 'meetings' }],
  ['проблему', { target: 'issues' }], ['проблема', { target: 'issues' }],
  ['договоренность', { target: 'agreements' }], ['договорённость', { target: 'agreements' }],
  ['договоренности', { target: 'agreements' }], ['договорённости', { target: 'agreements' }],
  ['идею', { target: 'idea' }], ['идея', { target: 'idea' }], ['мысль', { target: 'idea' }],
  ['запись в журнал', { target: 'note' }], ['запись в журнале', { target: 'note' }],
  ['в журнал', { target: 'note' }], ['заметку', { target: 'note' }], ['заметка', { target: 'note' }],
].sort((a, b) => b[0].length - a[0].length);

// Обзорные вопросы про человека или проект. Порядок важен: длинные формулировки первыми.
const PERSON_DIGEST_PREFIXES = [
  'как дела у', 'как дела с', 'как дела в', 'как обстоят дела у', 'как там дела у', 'как там у', 'как там',
  'что с', 'что у', 'что по', 'как у', 'как поживает', 'как успехи у', 'как успехи',
  'что нового у', 'что нового по', 'как обстановка у', 'как обстановка с',
  'чем занят', 'чем занята', 'чем занимается', 'статус по', 'статус',
  'расскажи про', 'расскажи о', 'расскажи об', 'сводка по', 'сводку по', 'сводка', 'дай сводку по',
  'подскажи как дела у', 'расскажи как дела у', 'опиши ситуацию у', 'покажи статус', 'дай статус по',
  'резюмируй работу', 'оцени загрузку', 'проверь дела у', 'объясни что у', 'собери сводку по',
  'выдели главное по', 'назови главное по',
].sort((a, b) => b.length - a.length);

// Вопросы «что мне важно прямо сейчас». Отвечаем сводкой по всему рабочему дню.
const TODAY_DIGEST_PATTERNS = [
  'чем заняться сегодня', 'чем мне заняться сегодня', 'что делать сегодня',
  'на что мне обратить внимание', 'на что обратить внимание', 'что требует внимания', 'что требует моего внимания',
  'что мне важно', 'что важного', 'что важное', 'что горит', 'что срочного', 'что срочное',
  'что у меня сегодня', 'что сегодня', 'что на сегодня', 'мой день', 'как дела у меня', 'как мои дела',
  'итоги дня', 'что происходит', 'обзор дня', 'дай сводку', 'сводка на сегодня', 'сводку на сегодня',
  'что важно сегодня', 'на что смотреть сегодня', 'что по сегодняшнему дню', 'что в работе',
  'подскажи что важно сегодня', 'расскажи что важно сегодня', 'дай обзор дня', 'собери сводку на сегодня',
  'резюмируй день', 'покажи главное на сегодня', 'выдели главное на сегодня', 'назови главное на сегодня',
  'оцени что горит', 'проверь что требует внимания', 'объясни что важно сегодня', 'опиши мой день',
].sort((a, b) => b.length - a.length);

// Вопросы про неделю целиком. Проверяются раньше «сегодня»: формулировки пересекаются.
const WEEK_DIGEST_PATTERNS = [
  'обзор недели', 'обзор на неделю', 'что на этой неделе', 'что на неделе', 'что за неделю',
  'план недели', 'планы на неделю', 'план на неделю', 'итоги недели', 'сводка за неделю',
  'сводка недели', 'моя неделя', 'неделя', 'что по неделе', 'расписание недели', 'что предстоит на неделе',
  'дай обзор недели', 'расскажи про неделю', 'подскажи что на неделе', 'собери сводку недели',
  'резюмируй неделю', 'покажи главное на неделе', 'выдели главное недели', 'назови главное недели',
  'оцени неделю', 'проверь план недели', 'объясни что предстоит на неделе', 'опиши мою неделю',
].sort((a, b) => b.length - a.length);

const PROJECT_DIGEST_PREFIXES = [
  'что нового на проекте', 'что нового в проекте', 'что нового по проекту',
  'что происходит на проекте', 'что происходит в проекте', 'что происходит с проектом',
  'как дела на проекте', 'как дела в проекте', 'как дела с проектом',
  'как там проект', 'как идет проект', 'как идёт проект', 'как поживает проект',
  'что на проекте', 'что по проекту', 'что с проектом',
  'обзор проекта', 'сводка по проекту', 'сводку по проекту', 'статус проекта',
  'расскажи про проект', 'расскажи о проекте', 'покажи проект',
].sort((a, b) => b.length - a.length);

const PROJECT_WORDS = ['проект', 'проекте', 'проекта', 'проекту', 'проектом'];

const TEAM_DIGEST_SUBJECTS = new Set([
  'команда', 'команды', 'команде', 'команду', 'моей команде', 'моей команды',
  'нашей команде', 'нашей команды', 'вся команда', 'всей команды',
]);

function isTeamDigestSubject(value) {
  const cleaned = String(value || '').replace(/^у\s+/, '').replace(/^(моей|нашей)\s+/, (m) => m).trim();
  return TEAM_DIGEST_SUBJECTS.has(cleaned);
}

// Кому и куда: «создай задачу для Маши по проекту ATOM до завтра».
// Ищем эти обороты в тексте команды и вырезаем их из названия.
// У задачи исполнитель («для Маши»), у встречи и договорённости — участник («с Машей»).
const CREATE_PERSON_MARKERS = {
  tasks: ['для', 'исполнитель', 'ответственный', 'назначь на', 'на человека'],
  issues: ['для', 'у', 'с'],
  meetings: ['с', 'со', 'вместе с', 'участник', 'участники'],
  agreements: ['с', 'со', 'вместе с'],
};
const CREATE_ASSIGNEE_MARKERS = CREATE_PERSON_MARKERS.tasks;
// Заметка и идея — это текст записи целиком, из него ничего не вырезаем.
const CREATE_TARGETS_WITH_DETAILS = new Set(['tasks', 'meetings', 'issues', 'agreements']);
const CREATE_PROJECT_MARKERS = ['по проекту', 'в проекте', 'на проекте', 'проект', 'проекте', 'проекту'];
const CREATE_PRIORITY_MARKERS = ['срочно', 'срочная', 'срочную', 'важная', 'важную', 'важно', 'высокий приоритет', 'приоритетная'];
const CREATE_DUE_MARKERS = [
  ['послезавтра', 2], ['на послезавтра', 2], ['завтра', 1], ['на завтра', 1], ['до завтра', 1],
  ['сегодня', 0], ['на сегодня', 0], ['до сегодня', 0], ['через неделю', 7], ['на следующей неделе', 7],
].sort((a, b) => b[0].length - a[0].length);

// Зеркало MEETING_TYPE_LABEL из тех же констант — тип встречи показывается в строке.
const MEETING_TYPE_LABEL = { '1:1': '1:1', pr: 'PR', club: 'Технологизация', retro: 'Ретро', project: 'Проектные', other: 'Другое' };

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Даты в текстах сигналов пишем по-человечески: «до 11 сентября», а не «до 2026-09-11».
// Даты внутри строк списка не форматируем здесь — они уезжают на клиент как есть
// и печатаются его же helpers (fmtDate/dueLabel), чтобы формат совпадал со всем приложением.
function ruDate(value) {
  const key = String(value || '').slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return `${day} ${RU_MONTHS[month - 1]}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function shiftDay(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function daysAgoLabel(days) {
  if (days === null) return '';
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = function createSmartSearch({ db, visibleItems, search, isTeamlead }) {
  const { norm, rankPeopleByFragment, findProjectByFragment, parseQuery, runSearch, parseRelativeDatePhrase, stripSearchFillers, fuzzyWordMatch } = search;

  function startsWithPhrase(text, phrase) {
    return new RegExp(`^${escapeRe(phrase)}(?=\\s|$)`, 'i').test(text);
  }

  // В командах создания за словом-типом часто идёт двоеточие или тире
  // («создай идею: клуб продаж»), поэтому граница здесь шире, чем просто пробел.
  function startsWithCommandWord(text, phrase) {
    return new RegExp(`^${escapeRe(phrase)}(?=[\\s:;,.—–-]|$)`, 'i').test(text);
  }

  function containsPhrase(text, phrase) {
    return new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'i').test(text);
  }

  // ---------- Разбор намерения ----------

  function parseCreateIntent(rawQuery) {
    const raw = String(rawQuery || '').trim();
    const normalized = norm(raw);
    // Разбираем по нормализованной строке, а заголовок вырезаем из исходной по тем же
    // позициям: пользователь пишет название задачи один раз, и оно должно попасть
    // в карточку как есть — с заглавными буквами и буквой «ё», а не после norm().
    const sameLength = normalized.length === raw.length;

    let matchedPrefix = null;
    for (const prefix of CREATE_PREFIXES) {
      if (startsWithCommandWord(normalized, prefix)) { matchedPrefix = prefix; break; }
    }
    if (!matchedPrefix) return null;

    const afterPrefix = normalized.slice(matchedPrefix.length).replace(/^\s+/, '');
    const prefixOffset = normalized.length - afterPrefix.length;
    for (const [alias, spec] of CREATE_TARGETS) {
      if (!startsWithCommandWord(afterPrefix, alias)) continue;
      // «Запланировать» — узкое действие календаря: только 1:1, PR или встреча.
      // Не позволяем этим глаголом создавать задачи, проблемы, идеи и другие сущности.
      if (matchedPrefix.startsWith('запланир') && !['1:1', 'pr', 'встречу', 'встреча'].includes(alias)) return null;
      const rest = afterPrefix.slice(alias.length);
      const restTrimmed = rest.replace(/^[\s:—–-]+/, '');
      const titleOffset = prefixOffset + alias.length + (rest.length - restTrimmed.length);
      const title = (sameLength ? raw.slice(titleOffset) : restTrimmed).trim();
      return { ...spec, title, alias };
    }
    return null;
  }

  // Детали задачи из фразы: исполнитель, проект, приоритет и срок. Всё найденное
  // вырезается из названия, чтобы в карточку не попало «для Маши по проекту ATOM».
  function parseCreateDetails(title, user, options = {}, target = 'tasks') {
    let rest = String(title || '').trim();
    const details = { assignee: null, assigneeAmbiguity: null, project: null, priority: null, dueDate: null };
    const cutMatch = (regex) => {
      const match = rest.match(regex);
      if (!match) return null;
      rest = (rest.slice(0, match.index) + ' ' + rest.slice(match.index + match[0].length)).replace(/\s+/g, ' ').trim();
      return match;
    };

    // Проект: «по проекту ATOM», «в проекте ATOM».
    for (const marker of CREATE_PROJECT_MARKERS) {
      const match = rest.match(new RegExp(`(^|\\s)${escapeRe(marker)}\\s+([^,;]+)`, 'i'));
      if (!match) continue;
      const project = findProjectByFragment(match[2]);
      if (!project) continue;
      details.project = { id: project.id, name: project.name };
      // Из хвоста убираем только само название проекта, остальное — часть заголовка.
      const consumed = match[2].split(/\s+/).slice(0, norm(project.name).split(/\s+/).length).join(' ');
      cutMatch(new RegExp(`(^|\\s)${escapeRe(marker)}\\s+${escapeRe(consumed)}`, 'i'));
      break;
    }

    // Исполнитель: «для Маши», «для Марии Соколовой». Пробуем сначала два слова
    // (имя и фамилия) и оставляем их, только если оба действительно часть имени —
    // иначе «для Марии завтра проверить» съело бы срок и половину названия.
    for (const marker of (CREATE_PERSON_MARKERS[target] || CREATE_PERSON_MARKERS.tasks)) {
      const match = rest.match(new RegExp(`(^|\\s)${escapeRe(marker)}\\s+([^,;]+)`, 'i'));
      if (!match) continue;
      const words = match[2].trim().split(/\s+/);
      let picked = null;
      for (const count of [2, 1]) {
        if (words.length < count) continue;
        const fragment = words.slice(0, count).join(' ');
        const resolution = resolvePersonReference(fragment, user, options);
        if (resolution.status === 'ambiguous') {
          // Второе слово берём в имя, только если оно и правда похоже на часть имени:
          // иначе «для Марии подготовить …» запомнило бы выбор для «марии подготовить».
          const secondWord = fragment.split(/\s+/)[1];
          const looksLikeName = count === 1 || (resolution.candidates || []).some((candidate) => norm(candidate.name).split(/\s+/).some((part) => fuzzyWordMatch(secondWord, part)));
          if (!looksLikeName) continue;
          picked = { fragment, resolution };
          break;
        }
        if (resolution.status !== 'resolved') continue;
        const nameParts = norm(resolution.person.name).split(/\s+/);
        const everyWordIsName = fragment.split(/\s+/).every((word) => nameParts.some((part) => fuzzyWordMatch(word, part)));
        if (count === 1 || everyWordIsName) { picked = { fragment, resolution }; break; }
      }
      if (!picked) continue;
      cutMatch(new RegExp(`(^|\\s)${escapeRe(marker)}\\s+${escapeRe(picked.fragment)}`, 'i'));
      if (picked.resolution.status === 'ambiguous') {
        details.assigneeAmbiguity = { fragment: picked.fragment, hintKey: picked.resolution.hintKey, candidates: picked.resolution.candidates };
      } else {
        details.assignee = { id: picked.resolution.person.id, name: picked.resolution.person.name };
      }
      break;
    }

    for (const marker of CREATE_PRIORITY_MARKERS) {
      if (cutMatch(new RegExp(`(^|\\s)${escapeRe(marker)}(?=\\s|$)`, 'i'))) { details.priority = 'high'; break; }
    }

    const relativeDate = parseRelativeDatePhrase ? parseRelativeDatePhrase(rest) : null;
    if (relativeDate && cutMatch(new RegExp(`(^|\\s)${escapeRe(relativeDate.phrase)}(?=\\s|$)`, 'i'))) {
      // У задачи один дедлайн, поэтому для целой недели используем её последний день.
      details.dueDate = relativeDate.end;
    } else {
      for (const [marker, offset] of CREATE_DUE_MARKERS) {
        if (cutMatch(new RegExp(`(^|\\s)${escapeRe(marker)}(?=\\s|$)`, 'i'))) { details.dueDate = shiftDay(todayKey(), offset); break; }
      }
    }

    details.title = rest.replace(/^[\s:—–-]+/, '').replace(/[\s,]+$/, '').trim();
    return details;
  }

  function parseWeekIntent(rawQuery) {
    const value = norm(rawQuery).replace(/[?!.]+$/, '').trim();
    return WEEK_DIGEST_PATTERNS.some((pattern) => value === pattern || startsWithPhrase(value, pattern));
  }

  function parseTodayIntent(rawQuery) {
    const value = norm(rawQuery).replace(/[?!.]+$/, '').trim();
    return TODAY_DIGEST_PATTERNS.some((pattern) => value === pattern || startsWithPhrase(value, pattern));
  }

  // «на что обратить внимание сегодня по Маше», «обзор недели у Дуайта» — хвост после
  // распознанной формулировки. Пустой хвост означает сводку по себе.
  function digestSubjectTail(rawQuery, patterns) {
    const value = norm(rawQuery).replace(/[?!.]+$/, '').trim();
    const pattern = patterns.find((item) => value === item || startsWithPhrase(value, item));
    if (pattern === undefined) return null;
    const rest = value.slice(pattern.length).trim();
    return { pattern, tail: stripSearchFillers(rest) };
  }

  function parseSubjectDigestIntent(rawQuery) {
    const value = norm(rawQuery).replace(/[?!.]+$/, '').trim();
    for (const prefix of PROJECT_DIGEST_PREFIXES) {
      if (startsWithPhrase(value, prefix)) {
        const fragment = value.replace(new RegExp(`^${escapeRe(prefix)}\s*`, 'i'), '').trim();
        if (!fragment) return null;
        return { fragment, subjectType: 'project' };
      }
    }
    for (const prefix of PERSON_DIGEST_PREFIXES) {
      if (startsWithPhrase(value, prefix)) {
        const fragment = value.replace(new RegExp(`^${escapeRe(prefix)}\s*`, 'i'), '').trim();
        if (!fragment) return null;
        return { fragment, subjectType: 'auto' };
      }
    }
    return null;
  }

  // ---------- Разрешение ссылки на человека ----------

  function personHintKey(fragment) {
    return stripSearchFillers(fragment).replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  // Контекст спрашивающего: из нескольких одинаково подходящих по имени людей почти
  // всегда имеется в виду тот, с кем пользователь реально работает. Каждый сигнал
  // возвращает и причину — её показываем в карточке уточнения, чтобы выбор был осознанным.
  function contextScore(person, user) {
    const reasons = [];
    let score = 0;
    const myPersonId = user?.personId || null;

    if (myPersonId && person.id === myPersonId) {
      score += 4;
      reasons.push('это вы');
    }
    if (myPersonId && person.teamLeadId === myPersonId) {
      score += 4;
      reasons.push('ваш прямой подчинённый');
    } else if (isTeamlead && isTeamlead(user) && person.type === 'team') {
      score += 1;
      reasons.push('в вашей команде');
    }

    if (myPersonId) {
      const sharedProject = visibleItems('projects', user).find((project) => project.status !== 'archived'
        && (project.memberIds || []).includes(person.id)
        && (project.memberIds || []).includes(myPersonId));
      if (sharedProject) {
        score += 3;
        reasons.push(`вместе на проекте «${sharedProject.name}»`);
      }

      const today = todayKey();
      const sharedMeetings = visibleItems('meetings', user)
        .filter((meeting) => (meeting.participantIds || []).includes(person.id) && (meeting.participantIds || []).includes(myPersonId) && dateKey(meeting.date) <= today)
        .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
      const lastMeeting = sharedMeetings[0];
      if (lastMeeting) {
        const days = daysBetween(dateKey(lastMeeting.date), today);
        const isOneOnOne = norm(lastMeeting.type) === '1:1';
        if (days !== null && days <= 30) score += isOneOnOne ? 3 : 2;
        else score += 1;
        reasons.push(`${isOneOnOne ? '1:1' : 'встреча'} ${daysAgoLabel(days)}`);
      }

      const monthAgo = shiftDay(today, -30);
      const mentions = visibleItems('journal', user).filter((entry) => !entry.kind || entry.kind === 'note').filter((entry) => (entry.mentions || []).some((mention) => mention.id === person.id)
        && (!entry.createdByUserId || entry.createdByUserId === user?.id)
        && dateKey(entry.createdAt) >= monthAgo);
      if (mentions.length) {
        score += 2;
        reasons.push(`${mentions.length} ${plural(mentions.length, 'упоминание', 'упоминания', 'упоминаний')} в вашем журнале`);
      }
    }

    if (person.status && person.status !== 'active') {
      score -= 3;
      reasons.push('не активен');
    }
    return { score, reasons };
  }

  function candidatePayload(row) {
    const person = row.person;
    return {
      id: person.id,
      name: person.name,
      role: person.role || '',
      type: person.type || 'team',
      slug: person.slug || '',
      photoUrl: person.photoUrl || '',
      photoPosition: person.photoPosition || '',
      reasons: row.reasons || [],
      score: row.total,
    };
  }

  // Порядок разрешения: явный выбор пользователя → запомненная подсказка →
  // уверенный отрыв по счёту → иначе честно признаёмся, что вариантов несколько.
  function resolvePersonReference(fragment, user, options = {}) {
    const hintKey = personHintKey(fragment);
    if (options.personId) {
      const explicit = db.people.get(options.personId);
      if (explicit) return { status: 'resolved', person: explicit, via: 'explicit', hintKey, candidates: [] };
    }

    const ranked = rankPeopleByFragment(fragment);
    if (!ranked.length) return { status: 'not_found', person: null, candidates: [], hintKey };

    const hints = options.hints && typeof options.hints === 'object' ? options.hints : {};
    const hintedId = hints[hintKey];
    if (hintedId) {
      const hinted = ranked.find((row) => row.person.id === hintedId);
      // Подсказку применяем только если человек всё ещё подходит под фразу: людей
      // переименовывают и увольняют, и «залипшая» подсказка не должна пережить это.
      if (hinted) return { status: 'resolved', person: hinted.person, via: 'hint', hintKey, candidates: [] };
    }

    // Контекст разрешает спор между одинаково подходящими по имени людьми, но не может
    // вытащить наверх заведомо более слабое совпадение: «Мартин» не должен побеждать
    // «Марию» только потому, что с ним больше общих встреч. Поэтому сначала оставляем
    // претендентов, сопоставимых по имени с лидером, а уже внутри них решает контекст —
    // счёт имени входит в сумму с большим весом.
    const bestNameScore = ranked[0].score;
    const contenders = ranked.filter((row) => row.score >= bestNameScore - 1);
    const scored = contenders
      .map((row) => {
        const context = contextScore(row.person, user);
        return { ...row, context: context.score, reasons: context.reasons, total: row.score * 10 + context.score };
      })
      .sort((a, b) => b.total - a.total);

    const [top, second] = scored;
    // Полное имя («мария зубарева») бьёт любую близость по одному слову.
    const fullNameWin = top.matchedParts >= 2 && top.matchedParts > (second?.matchedParts || 0);
    const confident = !second || fullNameWin || (top.total - second.total) >= AMBIGUITY_MARGIN;
    if (confident) {
      return {
        status: 'resolved',
        person: top.person,
        via: 'score',
        hintKey,
        margin: second ? top.total - second.total : null,
        candidates: scored.slice(0, MAX_CANDIDATES).map(candidatePayload),
      };
    }
    return {
      status: 'ambiguous',
      person: null,
      hintKey,
      candidates: scored.slice(0, MAX_CANDIDATES).map(candidatePayload),
    };
  }

  // ---------- Сводки ----------

  function section(title, items, extra = {}) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return null;
    const { limit = MAX_SECTION_ITEMS, ...rest } = extra;
    return {
      title,
      count: list.length,
      items: list.slice(0, limit),
      more: Math.max(0, list.length - limit),
      ...rest,
    };
  }

  const taskItem = (task, today) => ({
    title: task.title,
    date: task.dueDate || '',
    dateKind: 'due',
    tone: task.dueDate && dateKey(task.dueDate) < today && task.status !== 'done' ? 'danger' : '',
    entityType: 'task',
    entityId: task.id,
    status: task.status || 'todo',
    open: { command: 'openTaskModal', arg: task.id },
  });

  function meetingPersonName(meeting, user, focusId = null) {
    const type = norm(meeting.type);
    if (type !== '1:1' && type !== 'pr') return '';
    const people = visibleItems('people', user);
    const ids = Array.isArray(meeting.participantIds) ? meeting.participantIds : [];
    const preferredId = focusId && ids.includes(focusId)
      ? focusId
      : ids.find((id) => id && id !== user?.personId) || ids[0];
    const person = people.find((candidate) => candidate.id === preferredId);
    if (person?.name) return person.name;

    // Старые встречи могли хранить человека только в title. Тип уже показывается
    // отдельным лейблом, поэтому убираем «1:1 с» / «PR:» и оставляем имя.
    return String(meeting.title || '')
      .replace(/^1:1\s+[сc]\s+/i, '')
      .replace(/^(performance\s+review|pr)\s*:\s*/i, '')
      .trim();
  }

  const meetingItem = (meeting, user, focusId = null) => ({
    title: meetingPersonName(meeting, user, focusId) || meeting.title || 'Встреча',
    // Тип в базе встречается и как 'PR', и как 'pr' — сверяем в нижнем регистре.
    label: MEETING_TYPE_LABEL[norm(meeting.type)] || '',
    date: meeting.date || '',
    open: { route: `/meetings/${encodeURIComponent(meeting.slug || meeting.id)}` },
  });

  const issueItem = (issue) => ({
    title: issue.title,
    // «Важная» уже сама является сигналом — дополнительная красная точка дублировала её.
    rightLabel: issue.severity === 'high' ? 'Важная' : '',
    tone: '',
    entityType: 'issue',
    entityId: issue.id,
    status: issue.status || 'open',
    open: { command: 'openIssueModal', arg: issue.id },
  });

  const agreementItem = (agreement, today) => ({
    title: agreement.text,
    date: agreement.dueDate || '',
    dateKind: 'due',
    tone: agreement.dueDate && dateKey(agreement.dueDate) < today ? 'danger' : '',
    entityType: 'agreement',
    entityId: agreement.id,
    status: agreement.status || 'open',
    open: { command: 'openAgreementModal', arg: agreement.id },
  });

  const journalItem = (entry) => ({
    title: entry.text,
    date: entry.createdAt || '',
    open: { route: `/journal?entry=${encodeURIComponent(entry.id)}` },
  });

  const technologyEventItem = (item) => ({
    title: item.topic || 'Мероприятие',
    date: item.plannedDate || '',
    open: { route: '/technology' },
  });

  function personDigest(person, user) {
    const today = todayKey();
    const id = person.id;
    const tasks = visibleItems('tasks', user).filter((task) => !task.archivedAt && (task.assigneeIds || []).includes(id));
    const openTasks = tasks.filter((task) => task.status !== 'done');
    const inProgressTasks = openTasks.filter((task) => task.status === 'in_progress');
    const overdueTasks = openTasks.filter((task) => task.dueDate && dateKey(task.dueDate) < today);
    const meetings = visibleItems('meetings', user).filter((meeting) => (meeting.participantIds || []).includes(id));
    const upcomingMeetings = meetings.filter((meeting) => dateKey(meeting.date) >= today)
      .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
    const upcomingTechnologyEvents = visibleItems('technologyEvents', user)
      .filter((item) => !item.completed && dateKey(item.plannedDate) >= today && (item.personIds || []).includes(id))
      .sort((a, b) => dateKey(a.plannedDate).localeCompare(dateKey(b.plannedDate)));
    const pastOneOnOnes = meetings.filter((meeting) => norm(meeting.type) === '1:1' && dateKey(meeting.date) < today)
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
    const lastOneOnOne = pastOneOnOnes[0] || null;

    const week = currentWeekRange(today);
    const checkin = visibleItems('checkins', user).find((item) => item.personId === id && dateKey(item.weekStart) === week.start) || null;

    // В персональной сводке «Договорённости» — это все сущности, где человек
    // упомянут, независимо от текущего статуса. Так сводка не теряет уже решённый
    // контекст, который всё ещё важен для разговора с сотрудником. «Проблемы» же
    // показываем только нерешённые и сортируем по важности — как в общем списке проблем.
    const agreements = visibleItems('agreements', user).filter((item) =>
      (item.withPersonIds || []).includes(id) || (item.mentions || []).some((mention) => mention.id === id));
    const issues = visibleItems('issues', user).filter((item) =>
      item.status !== 'resolved' && ((item.relatedPersonIds || []).includes(id) || (item.mentions || []).some((mention) => mention.id === id)))
      .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')
        || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const notes = visibleItems('journal', user).filter((entry) => (!entry.kind || entry.kind === 'note')
      && (entry.mentions || []).some((mention) => mention.id === id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const projects = visibleItems('projects', user).filter((project) => project.status === 'active' && (project.memberIds || []).includes(id));
    const loadItems = projects.map((project) => {
      const cfg = projectLoadConfig((project.memberLoads || {})[id]);
      return {
        title: project.name,
        meta: `${cfg.label} (${cfg.rangeLabel})`,
        markerColor: project.color || '',
        maxHours: cfg.max,
        open: { route: `/projects/${encodeURIComponent(project.slug || project.id)}` },
      };
    });

    const totalMaxHours = loadItems.reduce((sum, item) => sum + item.maxHours, 0);

    const absences = visibleItems('vacations', user).filter((item) => item.personId === id && dateKey(item.endDate) >= today)
      .sort((a, b) => dateKey(a.startDate).localeCompare(dateKey(b.startDate)));
    const absence = absences[0] || null;

    const sections = [
      {
        title: 'Загрузка',
        count: loadItems.length,
        items: loadItems,
        more: 0,
        layout: 'project-load',
        summary: {
          ...projectLoadSummary(totalMaxHours),
          action: { label: 'Редактировать', command: 'openPersonLoadModal', arg: id },
        },
        emptyText: 'Нет активных проектов',
      },
      checkin ? {
        title: `Check-in за ${ruDate(week.start)} — ${ruDate(week.end)}`,
        count: 3,
        layout: 'labeled-text',
        items: [
          { label: 'На прошлой неделе', title: String(checkin.did || '').trim() || '—', wrapText: true },
          { label: 'На этой неделе', title: String(checkin.willDo || '').trim() || '—', wrapText: true },
          { label: 'Блокеры', title: String(checkin.blockers || '').trim() || '—', tone: String(checkin.blockers || '').trim() ? 'warning' : '', wrapText: true },
        ],
        more: 0,
        footer: { label: 'Все check-in', route: `/checkins?person=${encodeURIComponent(id)}` },
      } : null,
      section('Задачи в работе', inProgressTasks.map((task) => taskItem(task, today)), { footer: { label: 'Все задачи', route: `/tasks?person=${encodeURIComponent(id)}` } }),
      section('Ближайшие встречи', upcomingMeetings.map((meeting) => meetingItem(meeting, user, id))),
      section('Запланированные мероприятия', upcomingTechnologyEvents.map(technologyEventItem), { footer: { label: 'План мероприятий', route: '/technology' } }),
      section('Заметки в журнале', notes.map(journalItem), { limit: 5, footer: { label: 'Журнал', route: `/journal` } }),
      issues.length ? section('Проблемы', issues.map(issueItem), { limit: issues.length, footer: { label: 'Все проблемы', route: `/issues?person=${encodeURIComponent(id)}` } }) : null,
      agreements.length ? section('Договорённости', agreements.map((item) => agreementItem(item, today)), { limit: agreements.length, footer: { label: 'Все договорённости', route: `/agreements?person=${encodeURIComponent(id)}` } }) : null,
    ].filter(Boolean);

    return {
      type: 'person',
      title: person.name,
      person: {
        id: person.id, name: person.name, role: person.role || '', slug: person.slug || '',
        photoUrl: person.photoUrl || '', photoPosition: person.photoPosition || '', type: person.type || 'team',
        status: person.status || 'active', timezone: person.timezone || '', workStart: person.workStart || '', workEnd: person.workEnd || '',
      },
      signals: [],
      sections,
    };
  }


  function teamDigest(user) {
    const today = todayKey();
    const week = currentWeekRange(today);
    const people = visibleItems('people', user)
      .filter((person) => person.type === 'team' && person.status !== 'dismissed' && person.status !== 'transferred')
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const teamIds = new Set(people.map((person) => person.id));
    const projects = visibleItems('projects', user).filter((project) => project.status === 'active');

    const loadItems = people.map((person) => {
      const maxHours = projects
        .filter((project) => (project.memberIds || []).includes(person.id))
        .reduce((sum, project) => sum + projectLoadConfig((project.memberLoads || {})[person.id]).max, 0);
      const level = projectLoadLevel(maxHours);
      return {
        title: person.name,
        meta: level.label,
        open: { route: `/people/${encodeURIComponent(person.slug || person.id)}` },
      };
    });

    const tasks = visibleItems('tasks', user)
      .filter((task) => !task.archivedAt && task.status === 'in_progress' && (task.assigneeIds || []).some((id) => teamIds.has(id)))
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'));

    const issues = visibleItems('issues', user)
      .filter((item) => item.status !== 'resolved' && (item.relatedPersonIds || []).some((id) => teamIds.has(id)))
      .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')
        || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const blockers = visibleItems('checkins', user)
      .filter((item) => teamIds.has(item.personId) && dateKey(item.weekStart) === week.start && String(item.blockers || '').trim())
      .map((item) => ({
        title: peopleById.get(item.personId)?.name || 'Сотрудник',
        meta: String(item.blockers || '').trim(),
        open: { route: `/checkins?person=${encodeURIComponent(item.personId || '')}` },
      }));

    const absences = visibleItems('vacations', user)
      .filter((item) => teamIds.has(item.personId) && dateKey(item.endDate) >= today)
      .sort((a, b) => dateKey(a.startDate).localeCompare(dateKey(b.startDate)))
      .map((item) => ({
        title: peopleById.get(item.personId)?.name || 'Сотрудник',
        date: item.startDate || '',
        dateEnd: item.endDate || '',
        open: { route: `/people/${encodeURIComponent(peopleById.get(item.personId)?.slug || item.personId || '')}` },
      }));

    const technologyEvents = visibleItems('technologyEvents', user)
      .filter((item) => !item.completed && dateKey(item.plannedDate) >= week.start && dateKey(item.plannedDate) <= week.end
        && (item.personIds || []).some((id) => teamIds.has(id)))
      .sort((a, b) => dateKey(a.plannedDate).localeCompare(dateKey(b.plannedDate)));

    return {
      type: 'team',
      title: 'Как дела у команды',
      subtitle: `${people.length} ${plural(people.length, 'сотрудник', 'сотрудника', 'сотрудников')}`,
      signals: [],
      sections: [
        loadItems.length ? { title: 'Загрузка команды', count: loadItems.length, items: loadItems, more: 0 } : null,
        section('Задачи в работе', tasks.map((task) => taskItem(task, today)), { footer: { label: 'Все задачи', route: '/tasks?project=all' } }),
        section('Проблемы', issues.map(issueItem), { footer: { label: 'Все проблемы', route: '/issues' } }),
        section('Блокеры в Check-in', blockers, { footer: { label: 'Все Check-in', route: '/checkins' } }),
        section('Запланированные мероприятия', technologyEvents.map(technologyEventItem), { footer: { label: 'План мероприятий', route: '/technology' } }),
        section('Отсутствия', absences, { footer: { label: 'Календарь', route: '/calendar' } }),
      ].filter(Boolean),
    };
  }

  function projectDigest(project, user) {
    const today = todayKey();
    const id = project.id;
    const tasks = visibleItems('tasks', user).filter((task) => !task.archivedAt && task.projectId === id);
    const openTasks = tasks.filter((task) => task.status !== 'done');
    const overdueTasks = openTasks.filter((task) => task.dueDate && dateKey(task.dueDate) < today);
    const issues = visibleItems('issues', user).filter((item) => item.status !== 'resolved' && (item.projectId === id || (item.relatedProjectIds || []).includes(id)));
    const meetings = visibleItems('meetings', user).filter((meeting) => meeting.projectId === id && dateKey(meeting.date) >= today)
      .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
    const agreements = visibleItems('agreements', user).filter((item) => item.status !== 'done' && item.projectId === id);
    const members = visibleItems('people', user).filter((person) => (project.memberIds || []).includes(person.id));

    const signals = [];
    if (overdueTasks.length) signals.push({ tone: 'danger', text: `${overdueTasks.length} ${plural(overdueTasks.length, 'просроченная задача', 'просроченные задачи', 'просроченных задач')}` });
    const highIssues = issues.filter((item) => item.severity === 'high');
    if (highIssues.length) signals.push({ tone: 'danger', text: `${highIssues.length} ${plural(highIssues.length, 'серьёзная проблема', 'серьёзные проблемы', 'серьёзных проблем')}` });
    if (!signals.length) signals.push({ tone: 'ok', text: 'Тревожных сигналов нет' });

    return {
      type: 'project',
      title: project.name,
      subtitle: `${openTasks.length} ${plural(openTasks.length, 'открытая задача', 'открытые задачи', 'открытых задач')}`,
      signals,
      sections: [
        section('Открытые задачи', openTasks.map((task) => taskItem(task, today))),
        section('Проблемы', issues.map(issueItem)),
        section('Ближайшие встречи', meetings.map((meeting) => meetingItem(meeting, user))),
        section('Договорённости', agreements.map((item) => agreementItem(item, today))),
        section('Участники', members.map((person) => ({
          title: person.name, meta: person.role || '',
          open: { route: `/people/${encodeURIComponent(person.slug || person.id)}` },
        }))),
      ].filter(Boolean),
      footer: { label: 'Открыть проект', route: `/projects/${encodeURIComponent(project.slug || project.id)}` },
    };
  }

  function todayDigest(user, focus = null, options = {}) {
    const today = todayKey();
    const tomorrow = shiftDay(today, 1);
    const personId = focus ? focus.id : (user?.personId || null);
    const priorityMode = options.taskPriorityMode || 'balanced';

    // 1. Поработать над задачами — ровно тот же приоритетный алгоритм, который
    // используется выбранной пользователем стратегией на главном экране.
    const ownTasks = visibleItems('tasks', user).filter((task) => !task.archivedAt && task.status !== 'done'
      && (!personId || (task.assigneeIds || []).includes(personId)));
    const topTasks = rankTasksByPriority(ownTasks, priorityMode, today);
    const projectsById = new Map(visibleItems('projects', user).map((project) => [project.id, project]));
    // topTasks уже отсортирован выбранной стратегией. Собираем группы в порядке
    // первого появления проекта, а внутри каждой оставляем максимум три задачи.
    // Задачи без проекта не теряем — они живут в отдельной группе «Без проекта».
    const taskGroupsMap = new Map();
    for (const task of topTasks) {
      const key = task.projectId || '__no_project__';
      if (!taskGroupsMap.has(key)) {
        const project = task.projectId ? projectsById.get(task.projectId) : null;
        taskGroupsMap.set(key, {
          id: key,
          title: project?.name || 'Без проекта',
          route: project ? `/projects/${encodeURIComponent(project.slug || project.id)}` : '',
          all: [],
        });
      }
      taskGroupsMap.get(key).all.push(task);
    }
    const taskGroups = Array.from(taskGroupsMap.values()).map((group) => ({
      title: group.title,
      ...(group.route ? { route: group.route } : {}),
      count: group.all.length,
      items: group.all.slice(0, TODAY_TASKS_PER_PROJECT_LIMIT).map((task) => taskItem(task, today)),
      more: Math.max(0, group.all.length - TODAY_TASKS_PER_PROJECT_LIMIT),
    }));

    // 2. Подготовиться к встречам — только сегодня и завтра. Для сводки по человеку
    // фильтруем его участие; без явного focus берём все доступные пользователю встречи,
    // потому что visibleItems уже применяет права и рабочий контекст.
    const meetings = visibleItems('meetings', user)
      .filter((meeting) => {
        const day = dateKey(meeting.date);
        if (!day || day < today || day > tomorrow) return false;
        return !focus || (meeting.participantIds || []).includes(personId);
      })
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    const technologyEvents = visibleItems('technologyEvents', user)
      .filter((item) => {
        const day = dateKey(item.plannedDate);
        if (item.completed || !day || day < today || day > tomorrow) return false;
        return !focus || (item.personIds || []).includes(personId);
      })
      .sort((a, b) => String(a.plannedDate || '').localeCompare(String(b.plannedDate || '')));

    // Прошедшие встречи без заполненных итогов требуют отдельного действия:
    // либо перенести встречу, либо зафиксировать результат. Показываем максимум пять.
    const meetingsWithoutOutcomes = visibleItems('meetings', user)
      .filter((meeting) => dateKey(meeting.date) && dateKey(meeting.date) < today && !meetingHasOutcomes(meeting))
      .filter((meeting) => !focus || (meeting.participantIds || []).includes(personId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    // 3. Проверить заметки — только заметки Журнала, которые пользователь явно
    // прикрепил к главному экрану/вниманию.
    const pinnedNotes = visibleItems('journal', user)
      .filter((entry) => (!entry.kind || entry.kind === 'note') && entry.attentionPinned)
      .filter((entry) => !focus || (entry.mentions || []).some((mention) => mention.id === personId))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    // 4. Разобраться с проблемами — только нерешённые, сначала важные.
    const issues = visibleItems('issues', user)
      .filter((item) => item.status !== 'resolved'
        && (!focus || (item.relatedPersonIds || []).includes(personId)))
      .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')
        || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    // 5. Актуализировать договорённости — незавершённые, ближайший/просроченный срок первым.
    const agreements = visibleItems('agreements', user)
      .filter((item) => item.status !== 'done'
        && (!focus || (item.withPersonIds || []).includes(personId) || (item.mentions || []).some((mention) => mention.id === personId)))
      .sort((a, b) => {
        const ad = dateKey(a.dueDate) || '9999-12-31';
        const bd = dateKey(b.dueDate) || '9999-12-31';
        return ad.localeCompare(bd) || String(a.text || '').localeCompare(String(b.text || ''), 'ru');
      });

    // Для этого сценария сохраняем пять карточек даже когда одна из подборок пуста:
    // ответ остаётся стабильным и сразу показывает, что именно было проверено.
    const card = (title, items, limit, emptyText, footer) => ({
      title,
      count: items.length,
      items: limit == null ? items : items.slice(0, limit),
      more: limit == null ? 0 : Math.max(0, items.length - limit),
      emptyText,
      ...(footer ? { footer } : {}),
    });

    return {
      type: 'today',
      title: focus ? `Чем заняться сегодня — ${focus.name}` : 'Чем заняться сегодня',
      subtitle: ruDate(today),
      ...(focus ? { person: { id: focus.id, name: focus.name, role: focus.role || '', slug: focus.slug || '', photoUrl: focus.photoUrl || '', photoPosition: focus.photoPosition || '', type: focus.type || 'team' } } : {}),
      signals: [],
      // Пустые карточки в дневном сценарии не показываем: ответ должен содержать
      // только реальные действия, которыми можно заняться сейчас.
      sections: [
        {
          title: 'Поработать над задачами',
          count: topTasks.length,
          items: taskGroups.flatMap((group) => group.items),
          groups: taskGroups,
          emptyText: 'Приоритетных задач нет',
          footer: { label: 'Все мои задачи', route: '/tasks?mine=1&project=all' },
        },
        card('Подготовиться к встречам', meetings.map((meeting) => meetingItem(meeting, user, focus ? personId : null)), null, 'На сегодня и завтра встреч нет', { label: 'Все встречи', route: '/meetings' }),
        card('Подготовиться к мероприятиям', technologyEvents.map(technologyEventItem), null, 'На сегодня и завтра мероприятий нет', { label: 'План мероприятий', route: '/technology' }),
        card('Перенести или заполнить итоги', meetingsWithoutOutcomes.map((meeting) => meetingItem(meeting, user, focus ? personId : null)), TODAY_MISSED_MEETINGS_LIMIT, 'Встреч без итогов нет', { label: 'Все встречи', route: '/meetings' }),
        card('Проверить заметки', pinnedNotes.map(journalItem), TODAY_NOTES_LIMIT, 'Прикреплённых заметок нет', { label: 'Журнал', route: '/journal' }),
        card('Разобраться с проблемами', issues.map(issueItem), TODAY_ISSUES_LIMIT, 'Нерешённых проблем нет', { label: 'Все проблемы', route: '/issues' }),
        card('Актуализировать договорённости', agreements.map((item) => agreementItem(item, today)), TODAY_AGREEMENTS_LIMIT, 'Открытых договорённостей нет', { label: 'Все договорённости', route: '/agreements' }),
      ].filter((section) => Array.isArray(section.groups) ? section.groups.some((group) => (group.items || []).length) : (section.items || []).length),
    };
  }

  function weekDigest(user, focus = null) {
    const today = todayKey();
    const weekEnd = shiftDay(today, 6);
    // Обзор недели — про то, что только предстоит: всё прошедшее живёт в сводке дня.
    const personId = focus ? focus.id : (user?.personId || null);
    const userId = focus ? null : (user?.id || null);
    const inWeek = (value) => {
      const key = dateKey(value);
      return Boolean(key) && key >= today && key <= weekEnd;
    };
    const mine = (meeting) => (focus
      ? (meeting.participantIds || []).includes(personId)
      : (!personId || (meeting.participantIds || []).includes(personId) || meeting.createdByUserId === userId));

    const meetings = visibleItems('meetings', user)
      .filter((meeting) => inWeek(meeting.date) && mine(meeting))
      .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
    const technologyEvents = visibleItems('technologyEvents', user)
      .filter((item) => !item.completed && inWeek(item.plannedDate)
        && (focus ? (item.personIds || []).includes(personId) : (!personId || (item.personIds || []).includes(personId) || item.createdByUserId === userId)))
      .sort((a, b) => dateKey(a.plannedDate).localeCompare(dateKey(b.plannedDate)));
    const tasks = visibleItems('tasks', user)
      .filter((task) => !task.archivedAt && task.status !== 'done' && inWeek(task.dueDate)
        && (!personId || (task.assigneeIds || []).includes(personId)))
      .sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)));
    const agreements = visibleItems('agreements', user)
      .filter((item) => item.status !== 'done' && inWeek(item.dueDate)
        && (!focus || (item.withPersonIds || []).includes(personId) || (item.mentions || []).some((mention) => mention.id === personId)))
      .sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)));
    const absences = visibleItems('vacations', user)
      .filter((item) => dateKey(item.startDate) <= weekEnd && dateKey(item.endDate) >= today && (!focus || item.personId === personId))
      .sort((a, b) => dateKey(a.startDate).localeCompare(dateKey(b.startDate)));
    const birthdays = visibleItems('people', user).filter((person) => {
      if (!person.birthday) return false;
      const day = String(person.birthday).slice(5, 10);
      const from = today.slice(5, 10);
      const to = weekEnd.slice(5, 10);
      const inRange = from <= to ? (day >= from && day <= to) : (day >= from || day <= to);
      return inRange && (!focus || person.id === personId);
    });

    const signals = [];
    if (meetings.length) signals.push({ tone: 'info', text: `${meetings.length} ${plural(meetings.length, 'встреча', 'встречи', 'встреч')} впереди` });
    if (technologyEvents.length) signals.push({ tone: 'info', text: `${technologyEvents.length} ${plural(technologyEvents.length, 'мероприятие', 'мероприятия', 'мероприятий')} запланировано` });
    if (tasks.length) signals.push({ tone: 'warning', text: `${tasks.length} ${plural(tasks.length, 'задача', 'задачи', 'задач')} со сроком на неделе` });
    if (absences.length) signals.push({ tone: 'info', text: `${absences.length} ${plural(absences.length, 'отсутствие', 'отсутствия', 'отсутствий')}` });
    if (!signals.length) signals.push({ tone: 'ok', text: 'На неделе пока пусто' });

    const personName = (id) => db.people.get(id)?.name || '';
    return {
      type: 'week',
      title: focus ? `Обзор недели — ${focus.name}` : 'Обзор недели',
      subtitle: `${ruDate(today)} — ${ruDate(weekEnd)}`,
      ...(focus ? { person: { id: focus.id, name: focus.name, role: focus.role || '', slug: focus.slug || '', photoUrl: focus.photoUrl || '', photoPosition: focus.photoPosition || '', type: focus.type || 'team' } } : {}),
      signals,
      sections: [
        section('Встречи недели', meetings.map((meeting) => meetingItem(meeting, user, focus ? personId : null)), { footer: { label: 'Календарь', route: '/calendar' } }),
        section('Запланированные мероприятия', technologyEvents.map(technologyEventItem), { footer: { label: 'План мероприятий', route: '/technology' } }),
        section('Задачи со сроком', tasks.map((task) => taskItem(task, today)), { footer: { label: 'Все мои задачи', route: '/tasks?mine=1&project=all' } }),
        section('Договорённости к сроку', agreements.map((item) => agreementItem(item, today))),
        section('Отсутствия', absences.map((item) => ({
          title: personName(item.personId) || 'Сотрудник',
          date: item.startDate || '',
          dateEnd: item.endDate || '',
          open: { route: '/calendar' },
        }))),
        section('Дни рождения', birthdays.map((person) => ({
          title: person.name,
          meta: ruDate(`2000-${String(person.birthday).slice(5, 10)}`),
          open: { route: `/people/${encodeURIComponent(person.slug || person.id)}` },
        }))),
      ].filter(Boolean),
    };
  }


  // Узкие персональные запросы должны возвращать только запрошенный блок сводки,
  // а не весь person digest. Проверяем их раньше общих «как дела у …».
  function parsePersonSectionDigestIntent(rawQuery) {
    const value = norm(rawQuery).replace(/[?!.]+$/, '').trim();
    const patterns = [
      { section: 'load', re: /^(?:загрузка|что\s+с\s+загрузкой|как\s+загрузка)\s+(?:у\s+)?(.+)$/i },
      { section: 'tasks', re: /^(?:как\s+дела\s+с\s+задачами|что\s+с\s+задачами)\s+(?:у\s+)?(.+)$/i },
    ];
    for (const { section, re } of patterns) {
      const match = value.match(re);
      if (!match) continue;
      const fragment = stripSearchFillers(match[1] || '').trim();
      if (fragment) return { section, fragment };
    }
    return null;
  }

  function scopedPersonDigest(person, user, section) {
    const digest = personDigest(person, user);
    const titles = section === 'load'
      ? new Set(['Загрузка'])
      : section === 'tasks'
        ? new Set(['Задачи в работе'])
        : null;
    if (!titles) return digest;
    return { ...digest, sections: (digest.sections || []).filter((item) => titles.has(item.title)) };
  }

  // ---------- Точка входа ----------

  // Слова про время в хвосте сводки — не имя: «…сегодня», «…на этой неделе».
  const DIGEST_TAIL_NOISE = new Set(['сегодня', 'сейчас', 'день', 'дня', 'неделя', 'неделю', 'неделе', 'этой', 'текущей', 'мне', 'мой', 'моя', 'мои', 'меня']);

  function digestFocusFor(tail, user, options) {
    const cleaned = String(tail || '').split(/\s+/).filter((word) => word && !DIGEST_TAIL_NOISE.has(word)).join(' ');
    if (!cleaned) return { status: 'self', person: null };
    const resolution = resolvePersonReference(cleaned, user, options);
    if (resolution.status === 'resolved') return { status: 'resolved', person: resolution.person, resolution, fragment: cleaned };
    if (resolution.status === 'ambiguous') return { status: 'ambiguous', resolution, fragment: cleaned };
    return { status: 'not_found', fragment: cleaned };
  }

  function ambiguousPayload(query, fragment, resolution) {
    return { kind: 'ambiguous', query, ambiguous: { fragment, hintKey: resolution.hintKey, candidates: resolution.candidates } };
  }

  function resolutionPayload(focus) {
    if (!focus?.resolution || !focus.person) return undefined;
    return {
      via: focus.resolution.via,
      hintKey: focus.resolution.hintKey,
      personId: focus.person.id,
      alternatives: (focus.resolution.candidates || []).filter((item) => item.id !== focus.person.id),
    };
  }

  function smartSearch(rawQuery, user, options = {}) {
    const query = String(rawQuery || '').trim();
    if (!query) return { kind: 'empty', query };

    const create = parseCreateIntent(query);
    if (create) {
      // Для всего, что открывается формой, достаём из фразы человека, проект, приоритет
      // и срок — форма открывается заполненной. Заметка и идея — это сам текст записи,
      // из него ничего вырезать нельзя.
      if (CREATE_TARGETS_WITH_DETAILS.has(create.target)) {
        const details = parseCreateDetails(create.title, user, options, create.target);
        if (details.assigneeAmbiguity) {
          return { kind: 'ambiguous', query, ambiguous: details.assigneeAmbiguity };
        }
        return { kind: 'create', query, create: { ...create, ...details } };
      }
      return { kind: 'create', query, create };
    }

    const weekTail = digestSubjectTail(query, WEEK_DIGEST_PATTERNS);
    if (weekTail) {
      const focus = digestFocusFor(weekTail.tail, user, options);
      if (focus.status === 'ambiguous') return ambiguousPayload(query, focus.fragment, focus.resolution);
      if (focus.status !== 'not_found') {
        return { kind: 'digest', query, resolution: resolutionPayload(focus), digest: weekDigest(user, focus.person) };
      }
    }
    const todayTail = digestSubjectTail(query, TODAY_DIGEST_PATTERNS);
    if (todayTail) {
      const focus = digestFocusFor(todayTail.tail, user, options);
      if (focus.status === 'ambiguous') return ambiguousPayload(query, focus.fragment, focus.resolution);
      if (focus.status !== 'not_found') {
        return { kind: 'digest', query, resolution: resolutionPayload(focus), digest: todayDigest(user, focus.person, options) };
      }
    }

    const personSection = parsePersonSectionDigestIntent(query);
    if (personSection) {
      const resolution = resolvePersonReference(personSection.fragment, user, options);
      if (resolution.status === 'ambiguous') return ambiguousPayload(query, personSection.fragment, resolution);
      if (resolution.status === 'resolved') {
        return {
          kind: 'digest',
          query,
          resolution: { via: resolution.via, hintKey: resolution.hintKey, personId: resolution.person.id, alternatives: (resolution.candidates || []).filter((item) => item.id !== resolution.person.id) },
          digest: scopedPersonDigest(resolution.person, user, personSection.section),
        };
      }
    }

    const subject = parseSubjectDigestIntent(query);
    if (subject) {
      const askedAboutProject = subject.subjectType === 'project' || PROJECT_WORDS.some((word) => containsPhrase(subject.fragment, word));
      const project = askedAboutProject ? findProjectByFragment(subject.fragment) : null;
      if (project) return { kind: 'digest', query, digest: projectDigest(project, user) };
      // Явный запрос про проект не должен пытаться интерпретировать название проекта как имя человека.
      if (subject.subjectType === 'project') return { kind: 'search', query, search: runSearch(query, user, parseQuery(query, user), { taskPriorityMode: options.taskPriorityMode }) };

      // «Как дела у команды» — самостоятельная агрегированная сводка, а не поиск
      // человека по слову «команда» и не полнотекстовый поиск по встречам/задачам.
      if (isTeamDigestSubject(subject.fragment)) return { kind: 'digest', query, digest: teamDigest(user) };

      const resolution = resolvePersonReference(subject.fragment, user, options);
      if (resolution.status === 'ambiguous') return ambiguousPayload(query, subject.fragment, resolution);
      if (resolution.status === 'resolved') {
        return {
          kind: 'digest',
          query,
          resolution: { via: resolution.via, hintKey: resolution.hintKey, personId: resolution.person.id, alternatives: (resolution.candidates || []).filter((item) => item.id !== resolution.person.id) },
          digest: personDigest(resolution.person, user),
        };
      }
      // Человека с таким именем нет — не выдумываем сводку, отдаём обычный поиск.
    }

    return { kind: 'search', query, search: runSearch(query, user, parseQuery(query, user), { taskPriorityMode: options.taskPriorityMode }) };
  }

  return { smartSearch, resolvePersonReference, personDigest, teamDigest, projectDigest, todayDigest, weekDigest, parseCreateIntent, parseCreateDetails, parseTodayIntent, parseWeekIntent, parseSubjectDigestIntent, parsePersonSectionDigestIntent, personHintKey, AMBIGUITY_MARGIN };
};
