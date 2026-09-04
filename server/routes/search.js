'use strict';

module.exports = function registerSearchRoutes(app, { db, visibleItems }) {
// ---------- Search ----------
function norm(s) {
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').trim();
}

function stemRu(word) {
  return norm(word).replace(/(ами|ями|ого|ему|ому|ыми|ими|ов|ев|ей|ах|ях|ью|ям|ам|а|я|ы|и|у|ю|е|ь)$/i, '');
}


const SEARCH_FILLER_WORDS = new Set([
  'про', 'о', 'об', 'обо', 'по', 'для', 'у', 'с', 'со', 'к', 'ко', 'от', 'из', 'за',
  'насчет', 'насчёт', 'касательно', 'относительно', 'про', 'покажи', 'показать', 'найди', 'найти',
]);

const SEARCH_INTENT_PREFIXES = [
  'когда у меня', 'когда у нас', 'когда будет', 'когда будут', 'когда',
  'где у меня', 'где у нас', 'где находится', 'где',
  'что у меня', 'что у нас', 'что есть',
  'какие у меня', 'какие у нас', 'какие', 'какая', 'какой',
  'покажи мне', 'покажи', 'показать', 'найди мне', 'найди', 'найти',
  'открой мне', 'открой', 'открыть', 'хочу увидеть', 'хочу посмотреть',
  'есть ли у меня', 'есть ли у нас', 'есть ли',
].sort((a, b) => b.length - a.length);

function stripSearchFillers(text) {
  return norm(text).split(/\s+/).filter((w) => w && !SEARCH_FILLER_WORDS.has(w)).join(' ');
}

// Убираем разговорную оболочку только в начале остатка распознанной команды.
// Поэтому название вроде «Встреча: Где мы ошиблись» сохраняет слово «где».
function stripSearchIntentPrefix(text) {
  let value = norm(text);
  for (const phrase of SEARCH_INTENT_PREFIXES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}(?=\\s|$)`, 'i');
    if (re.test(value)) {
      value = value.replace(re, '').trim();
      break;
    }
  }
  return value;
}

function levenshtein(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function fuzzyWordMatch(queryWord, candidateWord) {
  const q = stemRu(queryWord);
  const c = stemRu(candidateWord);
  if (!q || !c) return false;
  if (q === c || q.startsWith(c) || c.startsWith(q)) return true;
  const maxLen = Math.max(q.length, c.length);
  const allowance = maxLen >= 8 ? 2 : maxLen >= 5 ? 1 : 0;
  return allowance > 0 && levenshtein(q, c) <= allowance;
}

function fuzzyTextMatch(query, text) {
  const qWords = stripSearchFillers(query).split(/\s+/).filter(Boolean);
  const tWords = norm(text).split(/[^a-zа-я0-9]+/i).filter(Boolean);
  if (!qWords.length) return true;
  return qWords.every((q) => tWords.some((t) => fuzzyWordMatch(q, t)));
}

const RU_NICKNAMES = {
  'настя': 'анастасия', 'настюша': 'анастасия', 'маша': 'мария', 'машенька': 'мария',
  'саша': 'александра', 'сашка': 'александра', 'женя': 'евгения', 'лена': 'елена',
  'леночка': 'елена', 'юля': 'юлия', 'поля': 'полина', 'алеша': 'алексей',
  'катя': 'екатерина', 'таня': 'татьяна', 'оля': 'ольга', 'даша': 'дарья',
  'ира': 'ирина', 'дима': 'дмитрий', 'петя': 'петр', 'коля': 'николай',
  'вика': 'виктория', 'соня': 'софия', 'юра': 'юрий', 'костя': 'константин',
};

function findPersonByFragment(fragment) {
  const lower = stripSearchFillers(fragment);
  if (!lower) return null;
  const words = lower.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const canonicalWords = words.map((word) => {
    const stem = stemRu(word);
    for (const [nick, canonical] of Object.entries(RU_NICKNAMES)) {
      if (fuzzyWordMatch(stem, nick)) return canonical;
    }
    return word;
  });

  let best = null;
  let bestScore = 0;
  db.people.all().forEach((person) => {
    const nameParts = norm(person.name).split(/\s+/).filter(Boolean);
    let score = 0;
    canonicalWords.forEach((queryWord) => {
      nameParts.forEach((part) => {
        const q = stemRu(queryWord);
        const c = stemRu(part);
        if (q === c) score = Math.max(score, 6);
        else if (q.startsWith(c) || c.startsWith(q)) score = Math.max(score, 4);
        else if (fuzzyWordMatch(q, c)) score = Math.max(score, 3);
      });
    });
    // Несколько совпавших частей полного имени повышают уверенность.
    const matchedParts = canonicalWords.filter((q) => nameParts.some((part) => fuzzyWordMatch(q, part))).length;
    score += Math.max(0, matchedParts - 1) * 2;
    if (score > bestScore) { best = person; bestScore = score; }
  });
  if (bestScore < 3 || !best) return null;
  const bestNameParts = norm(best.name).split(/\s+/).filter(Boolean);
  const matchedParts = canonicalWords.filter((q) => bestNameParts.some((part) => fuzzyWordMatch(q, part))).length;
  // Не принимаем случайное совпадение одного имени внутри длинной содержательной фразы.
  // «задачи Кирилла» по-прежнему работает, а «встреча где мы ошиблись» не превращается
  // в поиск по человеку из-за случайного fuzzy-совпадения одного слова.
  if (canonicalWords.length >= 3 && matchedParts / canonicalWords.length < 0.5) return null;
  return best;
}


function personFragmentCoverage(fragment, person) {
  if (!person) return 0;
  const words = stripSearchFillers(fragment).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const nameParts = norm(person.name).split(/\s+/).filter(Boolean);
  const matched = words.filter((q) => nameParts.some((part) => fuzzyWordMatch(q, part))).length;
  return matched / words.length;
}

// Командный язык поиска. Спецификация может задавать коллекцию и дополнительный подтип.
const SEARCH_TYPE_ALIASES = [
  ['проекты the labs', { group: 'labs', labEntityType: 'project' }], ['the labs', { group: 'labs', labEntityType: 'project' }],
  ['пет-проекты', { group: 'labs', labEntityType: 'project' }], ['пет-проект', { group: 'labs', labEntityType: 'project' }],
  ['эксперименты', { group: 'labs' }], ['эксперимент', { group: 'labs' }],
  ['лаборатория', { group: 'labs' }], ['лабы', { group: 'labs' }], ['лаба', { group: 'labs' }], ['labs', { group: 'labs' }],
  ['инициатива', { group: 'labs' }],
  ['задачи на развитие', { group: 'tasks', taskType: 'development' }],
  ['задача на развитие', { group: 'tasks', taskType: 'development' }],
  ['заметки', { group: 'journal', journalKind: 'note' }],
  ['заметка', { group: 'journal', journalKind: 'note' }],
  ['наблюдения', { group: 'journal', journalKind: 'note' }],
  ['наблюдение', { group: 'journal', journalKind: 'note' }],
  ['идеи the labs', { group: 'labs', labEntityType: 'idea' }],
  ['идея the labs', { group: 'labs', labEntityType: 'idea' }],
  ['идеи', { group: 'labs', labEntityType: 'idea' }],
  ['идея', { group: 'labs', labEntityType: 'idea' }],

  ['записи журнала', { group: 'journal' }],
  ['журнал', { group: 'journal' }],
  ['задачи', { group: 'tasks' }], ['задача', { group: 'tasks' }],
  ['проекты', { group: 'projects' }], ['проект', { group: 'projects' }],
  ['цели', { group: 'goals' }], ['цель', { group: 'goals' }],
  ['проблемы', { group: 'issues' }], ['проблема', { group: 'issues' }],
  ['performance review', { group: 'meetings', meetingType: 'pr' }],
  ['performance', { group: 'meetings', meetingType: 'pr' }],
  ['перформанс ревью', { group: 'meetings', meetingType: 'pr' }],
  ['перформанс-ревью', { group: 'meetings', meetingType: 'pr' }],
  ['оценка эффективности', { group: 'meetings', meetingType: 'pr' }],
  ['оценка результатов', { group: 'meetings', meetingType: 'pr' }],
  ['перформанс', { group: 'meetings', meetingType: 'pr' }],
  ['перфоманс', { group: 'meetings', meetingType: 'pr' }],
  ['ассессмент', { group: 'meetings', meetingType: 'pr' }],
  ['ассесмент', { group: 'meetings', meetingType: 'pr' }],
  ['assessment', { group: 'meetings', meetingType: 'pr' }],
  ['аттестация', { group: 'meetings', meetingType: 'pr' }],
  ['ревью', { group: 'meetings', meetingType: 'pr' }],
  ['pr', { group: 'meetings', meetingType: 'pr' }],
  ['проектные встречи', { group: 'meetings', meetingType: 'project' }],
  ['проектная встреча', { group: 'meetings', meetingType: 'project' }],
  ['ретро', { group: 'meetings', meetingType: 'retro' }],
  ['ретроспективы', { group: 'meetings', meetingType: 'retro' }],
  ['ретроспектива', { group: 'meetings', meetingType: 'retro' }],
  ['клабы', { group: 'meetings', meetingType: 'club' }],
  ['клаб', { group: 'meetings', meetingType: 'club' }],
  ['клубы', { group: 'meetings', meetingType: 'club' }],
  ['клуб', { group: 'meetings', meetingType: 'club' }],
  ['1:1', { group: 'meetings', meetingType: '1:1' }],
  ['1-1', { group: 'meetings', meetingType: '1:1' }],
  ['one-on-one', { group: 'meetings', meetingType: '1:1' }],
  ['one to one', { group: 'meetings', meetingType: '1:1' }],
  ['один на один', { group: 'meetings', meetingType: '1:1' }],
  ['встречи', { group: 'meetings' }], ['встреча', { group: 'meetings' }],
  ['договоренности', { group: 'agreements' }], ['договоренность', { group: 'agreements' }],
  ['документы', { group: 'documents' }], ['документ', { group: 'documents' }],
  ['инструменты', { group: 'tools' }], ['инструмент', { group: 'tools' }],
  ['процессы', { group: 'processes' }], ['процесс', { group: 'processes' }],
  ['состояние команды', { group: 'checkins' }], ['статусы команды', { group: 'checkins' }], ['статус команды', { group: 'checkins' }],
  ['check-in', { group: 'checkins' }], ['checkin', { group: 'checkins' }], ['чекины', { group: 'checkins' }], ['чекин', { group: 'checkins' }], ['чек-ин', { group: 'checkins' }],
  ['отсутствия', { group: 'vacations' }], ['отсутствие', { group: 'vacations' }],
  ['отпуска', { group: 'vacations', vacationType: 'vacation' }], ['отпуск', { group: 'vacations', vacationType: 'vacation' }],
  ['больничные', { group: 'vacations', vacationType: 'sick' }], ['больничный', { group: 'vacations', vacationType: 'sick' }],
  ['отгулы', { group: 'vacations', vacationType: 'dayoff' }], ['отгул', { group: 'vacations', vacationType: 'dayoff' }],
  ['команда', { group: 'people', peopleType: 'team' }],
  ['сотрудники', { group: 'people', peopleType: 'team' }], ['сотрудник', { group: 'people', peopleType: 'team' }],
  ['стейкхолдеры', { group: 'people', peopleType: 'stakeholder' }], ['стейкхолдер', { group: 'people', peopleType: 'stakeholder' }],
  ['люди', { group: 'people' }], ['человек', { group: 'people' }],
].sort((a, b) => b[0].length - a[0].length);

const SEARCH_MODIFIERS = [
  ['высокой серьезности', 'high'], ['высокая серьезность', 'high'], ['серьезные', 'high'], ['серьезные', 'high'],
  ['завершенные', 'done'], ['завершённые', 'done'], ['закрытые', 'done'], ['выполненные', 'done'], ['готовые', 'done'], ['решенные', 'done'], ['решённые', 'done'],
  ['открытые', 'open'], ['активные', 'active'], ['текущие', 'active'], ['незавершенные', 'open'], ['незавершённые', 'open'], ['приостановленные', 'paused'], ['на паузе', 'paused'],
  ['заблокированные', 'blocked'], ['на ревью', 'in_review'], ['в работе', 'in_progress'], ['к выполнению', 'todo'],
  ['следующая', 'upcoming'], ['следующий', 'upcoming'], ['следующие', 'upcoming'],
  ['ближайшая', 'upcoming'], ['ближайший', 'upcoming'], ['ближайшие', 'upcoming'],
  ['предстоящие', 'upcoming'], ['будущие', 'upcoming'],
  ['предыдущая', 'past'], ['предыдущий', 'past'], ['прошлая', 'past'], ['прошлый', 'past'],
  ['прошедшие', 'past'], ['прошлые', 'past'],
  ['без записей по итогам', 'without_outcomes'], ['без записей', 'without_outcomes'], ['без итогов', 'without_outcomes'],
  ['пропущенные', 'without_outcomes'], ['пропущенная', 'without_outcomes'],
  ['просроченные', 'overdue'], ['просроченная', 'overdue'], ['просрочено', 'overdue'],
  ['важные', 'important'], ['важная', 'important'], ['важный', 'important'],
  ['на сегодня', 'due_today'], ['сегодня', 'due_today'], ['на завтра', 'due_tomorrow'], ['завтра', 'due_tomorrow'],
  ['с проблемами', 'attention'], ['есть проблемы', 'attention'], ['сломанные', 'broken'], ['сломан', 'broken'], ['работающие', 'ok'], ['работает', 'ok'],
  ['на этой неделе', 'current_week'], ['за эту неделю', 'current_week'], ['текущая неделя', 'current_week'],
  ['архивные', 'archived'], ['в архиве', 'archived'],
  ['с блокерами', 'has_blockers'], ['с проблемами в check-in', 'has_blockers'], ['что мешает', 'has_blockers'],
].sort((a, b) => b[0].length - a[0].length);


const SEARCH_MEETING_TYPE_ALIASES = [
  ['проектные', 'project'], ['проектная', 'project'], ['project', 'project'],
  ['ретроспектива', 'retro'], ['ретроспективы', 'retro'], ['ретро', 'retro'],
  ['клабы', 'club'], ['клаб', 'club'], ['клубы', 'club'], ['клуб', 'club'],
  ['performance review', 'pr'], ['перформанс ревью', 'pr'], ['перформанс-ревью', 'pr'], ['pr', 'pr'],
  ['1:1', '1:1'], ['1-1', '1:1'], ['one-on-one', '1:1'], ['один на один', '1:1'],
  ['другое', 'other'], ['другие', 'other'],
].sort((a, b) => b[0].length - a[0].length);

function findProjectByFragment(fragment) {
  const value = norm(fragment);
  if (!value) return null;
  const queryWords = value.split(/[^a-zа-я0-9]+/i).filter((word) => word.length >= 2 && !['проект', 'проекта', 'проекте', 'проекту'].includes(word));
  let best = null;
  let bestScore = 0;
  db.projects.all().forEach((project) => {
    const name = norm(project.name);
    if (!name) return;
    const nameWords = name.split(/[^a-zа-я0-9]+/i).filter(Boolean);
    let score = value.includes(name) ? 20 + name.length : 0;
    for (const q of queryWords) {
      for (const part of nameWords) {
        if (stemRu(q) === stemRu(part)) score = Math.max(score, q.length >= 4 ? 12 : 7);
        else if (fuzzyWordMatch(q, part)) score = Math.max(score, q.length >= 5 ? 9 : 5);
      }
    }
    if (score > bestScore) { best = project; bestScore = score; }
  });
  return bestScore >= 7 ? best : null;
}

function stripProjectFromRemainder(text, project) {
  let value = norm(text);
  if (!project) return value;
  value = stripPhrase(value, norm(project.name));
  const projectWords = norm(project.name).split(/[^a-zа-я0-9]+/i).filter((word) => word.length >= 3);
  value = value.split(/\s+/).filter((word) => {
    if (['проект', 'проекта', 'проекте', 'проекту'].includes(word)) return false;
    return !projectWords.some((part) => word.length >= 3 && fuzzyWordMatch(word, part));
  }).join(' ');
  return value.replace(/\s+/g, ' ').trim();
}

function meetingHasOutcomeRecordsSearch(meeting) {
  const hasNotes = String(meeting?.notes || '').trim().length > 0;
  const hasDocuments = Array.isArray(meeting?.documentLinks) && meeting.documentLinks.some((doc) => String(doc?.title || doc?.url || '').trim());
  return hasNotes || hasDocuments;
}

function meetingIsPastSearch(meeting, today) {
  const key = String(meeting?.date || '').slice(0, 10);
  return !!key && key < today;
}

function stripPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i'), ' ').replace(/\s+/g, ' ').trim();
}

function parseSearchCommand(rawQuery, user) {
  const normalizedRaw = norm(rawQuery);
  const asksWhen = /^когда(?:\s|$)/i.test(normalizedRaw);
  let remainder = normalizedRaw;
  const selfWords = [
    'у меня', 'для меня', 'со мной', 'обо мне', 'про меня',
    'мой','моя','мое','моё','мои','моего','моей','моих','моему','моим','мною','меня','мне',
  ];
  let selfRequested = false;
  for (const word of selfWords.sort((a,b) => b.length - a.length)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(remainder)) {
      selfRequested = true;
      remainder = stripPhrase(remainder, word);
    }
  }

  // Разговорная оболочка обрабатывается до типа: «когда 1:1», «где мои задачи».
  remainder = stripSearchIntentPrefix(remainder);

  let type = null;
  for (const [alias, spec] of SEARCH_TYPE_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(remainder)) {
      type = { alias, ...spec };
      remainder = stripPhrase(remainder, alias);
      break;
    }
  }
  if (!type) return null;

  // Тип встречи можно указывать вместе с общим словом «встречи»: «встречи 1:1», «встречи ретро».
  if (type.group === 'meetings' && !type.meetingType) {
    for (const [alias, meetingType] of SEARCH_MEETING_TYPE_ALIASES) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(remainder)) {
        type.meetingType = meetingType;
        remainder = stripPhrase(remainder, alias);
        break;
      }
    }
  }

  const modifiers = [];
  for (const [phrase, value] of SEARCH_MODIFIERS) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(remainder)) {
      modifiers.push(value);
      remainder = stripPhrase(remainder, phrase);
    }
  }

  if (type.group === 'meetings' && asksWhen && !modifiers.includes('past') && !modifiers.includes('done') && !modifiers.includes('upcoming')) {
    modifiers.push('upcoming');
  }

  // Проект и сотрудника можно комбинировать в одном запросе: «встречи без итогов 1:1 Кирилла ATOM».
  const project = findProjectByFragment(remainder);
  if (project) remainder = stripProjectFromRemainder(remainder, project);

  // Служебные связки вроде «про Евгения», «у Кирилла» можно использовать свободно.
  // Вопросительное слово после типа удаляем только если оно не является частью
  // содержательного названия: сначала пробуем распознать человека с ним и без него.
  remainder = stripSearchFillers(remainder);
  let person = selfRequested && user?.personId ? db.people.get(user.personId) : null;
  if (!person && remainder) {
    const intentTrimmed = stripSearchIntentPrefix(remainder);
    if (intentTrimmed !== remainder) {
      const intentPerson = intentTrimmed ? findPersonByFragment(intentTrimmed) : null;
      if (intentPerson && personFragmentCoverage(intentTrimmed, intentPerson) >= 0.75) {
        person = intentPerson;
        remainder = intentTrimmed;
      } else if (!intentTrimmed) {
        remainder = '';
      }
      // Если после вопросительного слова осталось содержательное название, не пытаемся
      // угадывать человека по исходной фразе: «где мы ошиблись» остаётся названием.
    } else {
      person = findPersonByFragment(remainder);
    }
  }

  return { ...type, modifiers, person, project, selfRequested, textRemainder: (person || project) ? '' : remainder };
}

function peopleWithContext(people, user) {
  return people.map((p) => {
    const id = p.id;
    return {
      person: p,
      tasks: visibleItems('tasks', user).filter((t) => (t.assigneeIds || []).includes(id)),
      meetings: visibleItems('meetings', user).filter((m) => (m.participantIds || []).includes(id)),
      journal: visibleItems('journal', user).filter((j) => (j.mentions || []).some((m) => m.id === id)),
      agreements: visibleItems('agreements', user).filter((a) => (a.withPersonIds || []).includes(id) || (a.mentions || []).some((m) => m.id === id)),
      projects: visibleItems('projects', user).filter((pr) => (pr.memberIds || []).includes(id)),
      vacations: visibleItems('vacations', user).filter((v) => v.personId === id),
    };
  });
}

function emptySearchGroups() {
  return { people: [], projects: [], tasks: [], issues: [], meetings: [], journal: [], goals: [], agreements: [], documents: [], tools: [], labs: [], processes: [], vacations: [], checkins: [] };
}

function filterByPerson(group, items, person) {
  if (!person) return items;
  const id = person.id;
  if (group === 'tasks') return items.filter((x) => (x.assigneeIds || []).includes(id));
  if (group === 'projects') return items.filter((x) => (x.memberIds || []).includes(id));
  if (group === 'labs') return items.filter((x) => x.authorId === id);
  if (group === 'meetings') return items.filter((x) => (x.participantIds || []).includes(id));
  if (group === 'issues') return items.filter((x) => (x.relatedPersonIds || []).includes(id));
  if (group === 'agreements') return items.filter((x) => (x.withPersonIds || []).includes(id) || (x.mentions || []).some((m) => m.id === id));
  if (group === 'journal') return items.filter((x) => (x.mentions || []).some((m) => m.id === id));
  if (group === 'vacations') return items.filter((x) => x.personId === id);
  if (group === 'checkins') return items.filter((x) => x.personId === id);
  if (group === 'documents') {
    const projectIds = new Set(db.projects.all().filter((x) => (x.memberIds || []).includes(id)).map((x) => x.id));
    return items.filter((x) => x.projectId && projectIds.has(x.projectId));
  }
  if (group === 'tools') return [];
  if (group === 'goals') {
    const goalIds = new Set();
    db.tasks.all().filter((x) => !x.archivedAt && (x.assigneeIds || []).includes(id) && x.goalId).forEach((x) => goalIds.add(x.goalId));
    db.issues.all().filter((x) => (x.relatedPersonIds || []).includes(id) && x.goalId).forEach((x) => goalIds.add(x.goalId));
    const projectIds = new Set(db.projects.all().filter((x) => (x.memberIds || []).includes(id)).map((x) => x.id));
    return items.filter((x) => goalIds.has(x.id) || (x.projectIds || []).some((v) => projectIds.has(v)));
  }
  return items;
}


function filterByProject(group, items, project) {
  if (!project) return items;
  const id = project.id;
  if (['tasks', 'issues', 'meetings', 'agreements', 'documents'].includes(group)) return items.filter((x) => x.projectId === id);
  if (group === 'goals') return items.filter((x) => (x.projectIds || []).includes(id));
  if (group === 'projects') return items.filter((x) => x.id === id);
  return items;
}

function filterByModifier(group, items, modifiers) {
  if (!modifiers.length) return items;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(`${today}T00:00:00Z`); tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  return items.filter((x) => modifiers.every((mod) => {
    if (mod === 'high') return group === 'issues' ? x.severity === 'high' : true;
    if (group === 'tasks') {
      if (mod === 'done') return x.status === 'done'; if (mod === 'open' || mod === 'active') return x.status !== 'done'; if (mod === 'overdue') return x.status !== 'done' && !!x.dueDate && String(x.dueDate).slice(0, 10) < today;
      if (['paused','blocked','in_review','in_progress','todo'].includes(mod)) return x.status === mod;
      if (mod === 'important') return x.priority === 'high';
      if (mod === 'overdue') return x.status !== 'done' && !!x.dueDate && String(x.dueDate).slice(0, 10) < today;
      if (mod === 'due_today') return String(x.dueDate || '').slice(0, 10) === today;
      if (mod === 'due_tomorrow') return String(x.dueDate || '').slice(0, 10) === tomorrow;
      if (mod === 'archived') return !!x.archivedAt;
    }
    if (group === 'projects' || group === 'goals') {
      if (mod === 'done') return x.status === 'done'; if (mod === 'open' || mod === 'active') return x.status === 'active'; if (mod === 'paused') return x.status === 'paused';
    }
    if (group === 'issues') {
      if (mod === 'done') return x.status === 'resolved'; if (mod === 'open' || mod === 'active') return x.status !== 'resolved';
    }
    if (group === 'agreements') {
      if (mod === 'done') return x.status === 'done'; if (mod === 'open' || mod === 'active') return x.status !== 'done';
    }
    if (group === 'meetings') {
      const key = (x.date || '').slice(0, 10); if (mod === 'upcoming' || mod === 'active') return key >= today; if (mod === 'past') return key < today; if (mod === 'done') return key < today && meetingHasOutcomeRecordsSearch(x);
      if (mod === 'without_outcomes' || mod === 'overdue') return meetingIsPastSearch(x, today) && !meetingHasOutcomeRecordsSearch(x);
    }
    if (group === 'vacations') {
      if (mod === 'active') return x.startDate <= today && x.endDate >= today; if (mod === 'upcoming') return x.startDate > today; if (mod === 'past' || mod === 'done') return x.endDate < today;
    }
    if (group === 'people') {
      if (mod === 'active' || mod === 'open') return x.status === 'active';
    }
    if (group === 'processes') {
      if (mod === 'open' || mod === 'active' || mod === 'blocked' || mod === 'attention') return x.status === 'broken' || x.status === 'attention'; if (mod === 'done' || mod === 'ok') return x.status === 'ok' || !x.status; if (mod === 'broken') return x.status === 'broken';
    }
    if (group === 'checkins') {
      if (mod === 'has_blockers' || mod === 'attention') return String(x.blockers || '').trim().length > 0;
      if (mod === 'current_week') {
        const d = new Date(`${today}T00:00:00Z`); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1);
        return String(x.weekStart || '') === d.toISOString().slice(0, 10);
      }
    }
    return true;
  }));
}

function commandSearch(command, user) {
  const groups = emptySearchGroups();
  // Персональные формулировки («мой», «у меня», «для меня» и т. п.)
  // никогда не должны деградировать до общего поиска. Если профиль аккаунта
  // не связан с сотрудником, безопаснее вернуть пустой результат, чем чужие данные.
  if (command.selfRequested && !command.person) return groups;
  const all = {
    people: visibleItems('people', user), projects: visibleItems('projects', user), tasks: visibleItems('tasks', user, { includeArchived: true }), issues: visibleItems('issues', user), meetings: visibleItems('meetings', user),
    journal: visibleItems('journal', user), goals: visibleItems('goals', user), agreements: visibleItems('agreements', user), documents: visibleItems('documents', user), tools: visibleItems('tools', user), labs: visibleItems('labs', user), processes: visibleItems('processes', user), vacations: visibleItems('vacations', user), checkins: visibleItems('checkins', user),
  };
  let items = all[command.group] || [];
  if (command.taskType) items = items.filter((x) => (x.taskType || 'standard') === command.taskType);
  if (command.meetingType) items = items.filter((x) => norm(x.type) === norm(command.meetingType));
  if (command.journalKind) items = items.filter((x) => x.kind === command.journalKind);
  if (command.vacationType) items = items.filter((x) => x.type === command.vacationType);
  if (command.peopleType) items = items.filter((x) => x.type === command.peopleType);
  if (command.labEntityType) items = items.filter((x) => x.entityType === command.labEntityType);
  items = filterByPerson(command.group, items, command.person);
  items = filterByProject(command.group, items, command.project);
  items = filterByModifier(command.group, items, command.modifiers);
  if (command.group === 'meetings') {
    const direction = command.modifiers.some((m) => ['past','done','without_outcomes','overdue'].includes(m)) ? -1 : 1;
    items = [...items].sort((a, b) => direction * String(a.date || '').localeCompare(String(b.date || '')));
  }
  if (command.group === 'checkins') items = [...items].sort((a, b) => String(b.weekStart || '').localeCompare(String(a.weekStart || '')));
  if (command.textRemainder) {
    const q = command.textRemainder;
    items = items.filter((x) => fuzzyTextMatch(q, [x.name, x.title, x.text, x.description, x.notes, x.url, x.note, x.did, x.willDo, x.blockers].filter(Boolean).join(' ')));
  }
  groups[command.group] = command.group === 'people' ? peopleWithContext(items, user) : items;
  return groups;
}

app.get('/api/search', (req, res) => {
  const rawQuery = (req.query.q || '').toString().trim();
  const q = norm(rawQuery);
  if (!q) return res.json({ query: rawQuery, groups: emptySearchGroups() });

  const command = parseSearchCommand(rawQuery, req.auth.user);
  if (command) {
    return res.json({
      query: rawQuery,
      command: { group: command.group, alias: command.alias, modifiers: command.modifiers, person: command.person || null, project: command.project || null, selfRequested: !!command.selfRequested },
      personFocus: command.person || null,
      personFocusType: command.group,
      groups: commandSearch(command, req.auth.user),
    });
  }

  const match = (s) => norm(s).includes(q) || fuzzyTextMatch(q, s || '');
  const people = visibleItems('people', req.auth.user).filter((p) => match(p.name) || match(p.role) || match(p.tags && p.tags.join(' ')));
  const groups = {
    people: peopleWithContext(people, req.auth.user),
    projects: visibleItems('projects', req.auth.user).filter((p) => match(p.name) || match(p.description)),
    tasks: visibleItems('tasks', req.auth.user, { includeArchived: true }).filter((t) => match(t.title) || match(t.description)),
    issues: visibleItems('issues', req.auth.user).filter((i) => match(i.title) || match(i.description)),
    meetings: visibleItems('meetings', req.auth.user).filter((m) => match(m.title) || match(m.notes)),
    journal: visibleItems('journal', req.auth.user).filter((j) => match(j.text)),
    goals: visibleItems('goals', req.auth.user).filter((g) => match(g.title) || match(g.description)),
    agreements: visibleItems('agreements', req.auth.user).filter((a) => match(a.text)),
    documents: visibleItems('documents', req.auth.user).filter((d) => match(d.title) || match(d.url)),
    tools: visibleItems('tools', req.auth.user).filter((d) => match(d.title) || match(d.url)),
    labs: visibleItems('labs', req.auth.user).filter((d) => match(d.title) || match(d.description)),
    processes: visibleItems('processes', req.auth.user).filter((p) => match(p.title) || match(p.expectedBehavior) || match(p.currentBehavior) || match(p.description) || match(p.brokenNote) || (p.fixOptions || []).some((option) => match(option.text))),
    vacations: visibleItems('vacations', req.auth.user).filter((v) => match(v.note) || match(v.type)),
    checkins: visibleItems('checkins', req.auth.user).filter((c) => match(c.did) || match(c.willDo) || match(c.blockers)),
  };
  res.json({ query: rawQuery, personFocus: null, personFocusType: null, groups });
});


};
