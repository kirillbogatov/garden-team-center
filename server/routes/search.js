'use strict';

const { taskPriorityRank } = require('../domain/task-priority');
const { createSearchRanker } = require('../domain/search-ranking');

module.exports = function registerSearchRoutes(app, { db, visibleItems, normalizeUserSettings }) {
// ---------- Нормализация и нечёткое сравнение текста ----------
const { escapeRe, containsPhrase, norm, stemRu } = require('../domain/text-match');

// Как containsPhrase, но сравнивает не точную форму слова, а стем каждого
// слова фразы («задач» находит «задачи», «задача», «задачам», «задачах» —
// любую словоформу, а не только ту, что явно перечислена в словаре).
// Возвращает реально найденную подстроку текста (в её исходной форме) —
// её и нужно вырезать из remainder, а не словарную форму фразы.
function findStemPhrase(text, phrase) {
  const words = text.split(/\s+/).filter(Boolean);
  const phraseStems = phrase.split(/\s+/).filter(Boolean).map(stemRu);
  if (!phraseStems.length) return null;
  for (let i = 0; i + phraseStems.length <= words.length; i++) {
    if (phraseStems.every((stem, j) => stemRu(words[i + j]) === stem)) {
      return words.slice(i, i + phraseStems.length).join(' ');
    }
  }
  return null;
}

// Ищет тип/раздел по словарю алиасов: сначала точным совпадением формы (как
// раньше), и только если буквально ничего не нашлось — по стему. Точная форма
// проверяется первой намеренно: грамматическая форма иногда — единственное,
// что отличает разные по смыслу фразы («в процессе» — статус задачи, «Процессы»
// — раздел; «задачи команды» — контекст, а не раздел «Люди» через «команда»).
// Стемминг поэтому только расширяет покрытие для реально новых словоформ, а не
// переигрывает уже работающие случаи короткой формой из другого слова.
function matchTypeAlias(text, aliasList) {
  for (const [alias, spec] of aliasList) {
    if (containsPhrase(text, alias)) return { alias, spec, matchedText: alias };
  }
  for (const [alias, spec] of aliasList) {
    const matchedText = findStemPhrase(text, alias);
    if (matchedText) return { alias, spec, matchedText };
  }
  return null;
}

const SEARCH_FILLER_WORDS = new Set([
  'про', 'о', 'об', 'обо', 'по', 'для', 'у', 'с', 'со', 'к', 'ко', 'от', 'из', 'за',
  'насчет', 'насчёт', 'касательно', 'относительно', 'про', 'покажи', 'показать', 'найди', 'найти',
  'выведи', 'отобрази', 'перечисли', 'подбери', 'отфильтруй', 'поищи', 'отыщи', 'дай', 'список', 'проверь',
]);

const SEARCH_INTENT_PREFIXES = [
  'когда у меня', 'когда у нас', 'когда будет', 'когда будут', 'когда',
  'где у меня', 'где у нас', 'где находится', 'где',
  'что у меня', 'что у нас', 'что есть',
  'какие у меня', 'какие у нас', 'какие', 'какая', 'какой',
  'покажи мне', 'покажи', 'показать', 'найди мне', 'найди', 'найти',
  'выведи', 'отобрази', 'перечисли', 'подбери', 'отфильтруй', 'поищи', 'отыщи', 'дай список', 'проверь',
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
    const re = new RegExp(`^${escapeRe(phrase)}(?=\\s|$)`, 'i');
    if (re.test(value)) {
      value = value.replace(re, '').trim();
      break;
    }
  }
  return value;
}

function levenshtein(a, b) {
  a = norm(a);
  b = norm(b);
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

const searchRanker = createSearchRanker({ norm, fuzzyTextMatch, taskPriorityRank });

// ---------- Разрешение ссылки на человека по фрагменту имени ----------

const RU_NICKNAMES = {
  'настя': 'анастасия', 'настюша': 'анастасия', 'маша': 'мария', 'машенька': 'мария',
  'саша': 'александра', 'сашка': 'александра', 'женя': 'евгения', 'лена': 'елена',
  'леночка': 'елена', 'юля': 'юлия', 'поля': 'полина', 'алеша': 'алексей',
  'катя': 'екатерина', 'таня': 'татьяна', 'оля': 'ольга', 'даша': 'дарья',
  'ира': 'ирина', 'дима': 'дмитрий', 'петя': 'петр', 'коля': 'николай',
  'вика': 'виктория', 'соня': 'софия', 'юра': 'юрий', 'костя': 'константин',
};

// Слова запроса, приведённые к каноничному виду: уменьшительные («маша») разворачиваются
// в полное имя («мария»), служебные слова выбрасываются.
function canonicalPersonQueryWords(fragment) {
  const lower = stripSearchFillers(fragment);
  if (!lower) return [];
  const words = lower.split(/\s+/).filter(Boolean);
  return words.map((word) => {
    const stem = stemRu(word);
    for (const [nick, canonical] of Object.entries(RU_NICKNAMES)) {
      if (fuzzyWordMatch(stem, nick)) return canonical;
    }
    return word;
  });
}

function scorePersonAgainstWords(person, canonicalWords) {
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
  return { score, matchedParts, nameParts };
}

// Все подходящие люди со счётом совпадения имени, от лучшего к худшему.
// Обычному поиску достаточно лучшего варианта, а «Умному поиску» нужен весь список:
// по одному имени «Маша» в команде может быть несколько Марий, и выбирать за
// пользователя нельзя — сначала нужно понять, есть ли у лидера уверенный отрыв.
function rankPeopleByFragment(fragment, options = {}) {
  const canonicalWords = canonicalPersonQueryWords(fragment);
  if (!canonicalWords.length) return [];
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 3;
  // Сортировка стабильная, поэтому при равном счёте порядок остаётся исходным —
  // тем же, который до появления рейтинга давал «первый максимум» в цикле.
  return db.people.all()
    .map((person) => {
      const { score, matchedParts } = scorePersonAgainstWords(person, canonicalWords);
      return { person, score, matchedParts, queryWords: canonicalWords.length };
    })
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

function findPersonByFragment(fragment) {
  const canonicalWords = canonicalPersonQueryWords(fragment);
  if (!canonicalWords.length) return null;
  const best = rankPeopleByFragment(fragment)[0]?.person || null;
  if (!best) return null;
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

// ---------- Словарь команд поиска: типы сущностей, материалы, модификаторы, даты ----------

// Командный язык поиска. Спецификация может задавать коллекцию и дополнительный подтип.
const MATERIAL_KIND_ALIASES = {
  summary: ['саммари', 'summary', 'резюме', 'конспект'],
  minutes: ['протокол встречи', 'протокол', 'minutes'],
  presentation: ['презентация', 'презентации', 'слайды', 'слайд', 'deck', 'дек'],
  brief: ['бриф', 'brief'],
  spec: ['техническое задание', 'техзадание', 'спецификация', 'спека', 'spec', 'тз'],
  research: ['исследование', 'исследования', 'ресерч', 'research'],
};

const MATERIAL_SEARCH_TYPE_ALIASES = Object.entries(MATERIAL_KIND_ALIASES)
  .flatMap(([materialKind, aliases]) => aliases.map((alias) => [alias, { group: 'links', materialKind }]));

const SEARCH_TYPE_ALIASES = [
  ['проекты мастерской', { group: 'labs', labEntityType: 'project' }], ['проект мастерской', { group: 'labs', labEntityType: 'project' }],
  ['мастерская', { group: 'labs', labEntityType: 'project' }], ['мастерскую', { group: 'labs', labEntityType: 'project' }], ['мастерской', { group: 'labs', labEntityType: 'project' }],
  // Legacy aliases remain searchable so old phrasing/bookmarks keep working.
  ['проекты the labs', { group: 'labs', labEntityType: 'project' }], ['the labs', { group: 'labs', labEntityType: 'project' }],
  ['пет-проекты', { group: 'labs', labEntityType: 'project' }], ['пет-проект', { group: 'labs', labEntityType: 'project' }],
  ['эксперименты', { group: 'labs', labEntityType: 'project' }], ['эксперимент', { group: 'labs', labEntityType: 'project' }],
  ['лаборатория', { group: 'labs', labEntityType: 'project' }], ['лабы', { group: 'labs', labEntityType: 'project' }], ['лаба', { group: 'labs', labEntityType: 'project' }], ['labs', { group: 'labs', labEntityType: 'project' }],
  ['инициатива', { group: 'labs', labEntityType: 'project' }],
  // Тип задачи — отдельное доменное поле, а не текст в названии.
  // Длинные алиасы стоят раньше общего «задачи», чтобы «задачи по развитию»
  // не деградировали до полнотекстового поиска по слову «развитие».
  ['development-задачи', { group: 'tasks', taskType: 'development' }],
  ['development задачи', { group: 'tasks', taskType: 'development' }],
  ['задачи на развитие', { group: 'tasks', taskType: 'development' }],
  ['задача на развитие', { group: 'tasks', taskType: 'development' }],
  ['задачи по развитию', { group: 'tasks', taskType: 'development' }],
  ['задача по развитию', { group: 'tasks', taskType: 'development' }],
  ['задачи развития', { group: 'tasks', taskType: 'development' }],
  ['задача развития', { group: 'tasks', taskType: 'development' }],
  ['задачи по технологизации', { group: 'tasks', taskType: 'development' }],
  ['задача по технологизации', { group: 'tasks', taskType: 'development' }],
  ['задачи на технологизацию', { group: 'tasks', taskType: 'development' }],
  ['задача на технологизацию', { group: 'tasks', taskType: 'development' }],
  ['задачи технологизации', { group: 'tasks', taskType: 'development' }],
  ['задача технологизации', { group: 'tasks', taskType: 'development' }],
  ['задачи техна', { group: 'tasks', taskType: 'development' }],
  ['задача техна', { group: 'tasks', taskType: 'development' }],
  ['проектные задачи', { group: 'tasks', taskType: 'standard' }],
  ['проектная задача', { group: 'tasks', taskType: 'standard' }],
  ['заметки', { group: 'journal' }],
  ['заметка', { group: 'journal' }],
  ['наблюдения', { group: 'journal' }],
  ['наблюдение', { group: 'journal' }],
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
  ['технологизация', { group: 'meetings', meetingType: 'club' }],
  ['технологизации', { group: 'meetings', meetingType: 'club' }],
  ['технологизацию', { group: 'meetings', meetingType: 'club' }],
  ['клабы', { group: 'meetings', meetingType: 'club' }],
  ['клаб', { group: 'meetings', meetingType: 'club' }],
  ['клубы', { group: 'meetings', meetingType: 'club' }],
  ['клуб', { group: 'meetings', meetingType: 'club' }],
  ['1:1', { group: 'meetings', meetingType: '1:1' }],
  ['1-1', { group: 'meetings', meetingType: '1:1' }],
  ['one-on-one', { group: 'meetings', meetingType: '1:1' }],
  ['one to one', { group: 'meetings', meetingType: '1:1' }],
  ['один на один', { group: 'meetings', meetingType: '1:1' }],
  // «график встреч» — разговорный синоним раздела «Встречи» (это отдельное
  // слово, не словоформа «встречи» — стемминг ниже его не поймает).
  ['график встреч', { group: 'meetings' }],
  // Падежные формы («встреч», «встречам» и т.д.) распознаёт matchTypeAlias
  // через стем — отдельно их перечислять не нужно.
  ['встречи', { group: 'meetings' }], ['встреча', { group: 'meetings' }],
  ['договоренности', { group: 'agreements' }], ['договоренность', { group: 'agreements' }],
  // Типовые материалы берутся из одного расширяемого словаря выше.
  ...MATERIAL_SEARCH_TYPE_ALIASES,
  ['ссылки', { group: 'links' }], ['ссылка', { group: 'links' }], ['материалы', { group: 'links' }], ['материал', { group: 'links' }],
  ['документы', { group: 'documents' }], ['документ', { group: 'documents' }],
  ['инструменты', { group: 'tools' }], ['инструмент', { group: 'tools' }],
  ['процессы', { group: 'processes' }], ['процесс', { group: 'processes' }],
  ['состояние команды', { group: 'checkins' }], ['статусы команды', { group: 'checkins' }], ['статус команды', { group: 'checkins' }],
  ['weekly', { group: 'checkins' }], ['викли', { group: 'checkins' }], ['виклик', { group: 'checkins' }], ['дейли', { group: 'checkins' }], ['дейлик', { group: 'checkins' }],
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

const TECHNOLOGIZATION_FORMS = ['техна', 'техну', 'техной', 'техне', 'техны'];

const RU_WEEKDAYS = [
  [{ forms: ['понедельник', 'понедельника', 'понедельнику'], canonical: 'понедельник' }, 1],
  [{ forms: ['вторник', 'вторника', 'вторнику'], canonical: 'вторник' }, 2],
  [{ forms: ['среда', 'среду', 'среды'], canonical: 'среда' }, 3],
  [{ forms: ['четверг', 'четверга', 'четвергу'], canonical: 'четверг' }, 4],
  [{ forms: ['пятница', 'пятницу', 'пятницы'], canonical: 'пятница' }, 5],
  [{ forms: ['суббота', 'субботу', 'субботы'], canonical: 'суббота' }, 6],
  [{ forms: ['воскресенье', 'воскресенья', 'воскресенью'], canonical: 'воскресенье' }, 7],
];

const RELATIVE_NEXT_RE = 'следующ(?:ий|ая|ую|ее|ей)';
const RELATIVE_PREVIOUS_RE = '(?:предыдущ(?:ий|ая|ую|ее|ей)|прош(?:лый|лая|лую|лое|лой)|прошедш(?:ий|ая|ую|ее|ей))';

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function mondayOfWeek(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function shiftUtcDate(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// Календарные обороты работают и с «на», и без него:
// «на следующую пятницу», «следующая пятница», «прошедшая среда»,
// «предыдущая неделя». Модификатор всегда означает соседнюю календарную
// неделю, а «на пятницу» без модификатора — ближайшую пятницу.
function parseRelativeDatePhrase(text, now = new Date()) {
  const normalized = norm(text);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentMonday = mondayOfWeek(today);
  const relativeWeek = new RegExp(`(?:^|\\s)(?:на\\s+)?(${RELATIVE_NEXT_RE}|${RELATIVE_PREVIOUS_RE})\\s+недел(?:я|ю|е|и)(?=\\s|$)`, 'i');
  const weekMatch = normalized.match(relativeWeek);
  if (weekMatch) {
    const direction = /^следующ/i.test(weekMatch[1]) ? 1 : -1;
    const start = shiftUtcDate(currentMonday, direction * 7);
    const end = shiftUtcDate(start, 6);
    return { phrase: weekMatch[0].trim(), start: isoDay(start), end: isoDay(end) };
  }

  for (const [weekdaySpec, weekdayNumber] of RU_WEEKDAYS) {
    const weekdayRe = `(?:${weekdaySpec.forms.join('|')})`;
    const explicit = normalized.match(new RegExp(`(?:^|\\s)(?:на\\s+)?(${RELATIVE_NEXT_RE}|${RELATIVE_PREVIOUS_RE})\\s+${weekdayRe}(?=\\s|$)`, 'i'));
    if (explicit) {
      const direction = /^следующ/i.test(explicit[1]) ? 1 : -1;
      const target = shiftUtcDate(currentMonday, direction * 7 + weekdayNumber - 1);
      return { phrase: explicit[0].trim(), start: isoDay(target), end: isoDay(target) };
    }

    const nearest = normalized.match(new RegExp(`(?:^|\\s)на\\s+${weekdayRe}(?=\\s|$)`, 'i'));
    if (nearest) {
      const todayNumber = today.getUTCDay() || 7;
      let delta = weekdayNumber - todayNumber;
      if (delta < 0) delta += 7;
      const target = shiftUtcDate(today, delta);
      return { phrase: nearest[0].trim(), start: isoDay(target), end: isoDay(target) };
    }
  }
  return null;
}

const SEARCH_MODIFIERS = [
  ['высокой серьезности', 'high'], ['высокой серьёзности', 'high'], ['высокая серьезность', 'high'], ['высокая серьёзность', 'high'], ['серьезные', 'high'], ['серьёзные', 'high'],
  ['завершенные', 'done'], ['завершённые', 'done'], ['завершенный', 'done'], ['завершённый', 'done'], ['завершенная', 'done'], ['завершённая', 'done'],
  ['закрытые', 'done'], ['закрытый', 'done'], ['закрытая', 'done'], ['выполненные', 'done'], ['выполненный', 'done'], ['выполненная', 'done'], ['готовые', 'done'], ['готовый', 'done'], ['готовая', 'done'], ['решенные', 'done'], ['решённые', 'done'], ['решенный', 'done'], ['решённый', 'done'],
  ['открытые', 'open'], ['открытый', 'open'], ['открытая', 'open'], ['активные', 'active'], ['активный', 'active'], ['активная', 'active'], ['текущие', 'active'], ['текущий', 'active'], ['текущая', 'active'],
  ['незавершенные', 'open'], ['незавершённые', 'open'], ['незавершенный', 'open'], ['незавершённый', 'open'], ['приостановленные', 'paused'], ['приостановленный', 'paused'], ['приостановлена', 'paused'], ['приостановлено', 'paused'], ['на паузе', 'paused'], ['отложенные', 'paused'], ['отложенный', 'paused'], ['отложенная', 'paused'], ['отложена', 'paused'], ['отложено', 'paused'],
  ['заблокированные', 'blocked'], ['заблокированный', 'blocked'], ['заблокирована', 'blocked'], ['на ревью', 'in_review'], ['на проверке', 'in_review'], ['проверяется', 'in_review'], ['в работе', 'in_progress'], ['в процессе', 'in_progress'], ['выполняется', 'in_progress'], ['новая', 'todo'], ['новые', 'todo'], ['к выполнению', 'todo'], ['не начатые', 'todo'], ['не начатый', 'todo'],
  ['последних', 'latest'], ['последние', 'latest'], ['последний', 'latest'], ['последняя', 'latest'], ['последнее', 'latest'], ['последнего', 'latest'], ['последней', 'latest'],
  ['следующая', 'upcoming'], ['следующий', 'upcoming'], ['следующие', 'upcoming'], ['ближайшая', 'upcoming'], ['ближайший', 'upcoming'], ['ближайшие', 'upcoming'], ['предстоящие', 'upcoming'], ['предстоящая', 'upcoming'], ['будущие', 'upcoming'],
  ['предыдущая', 'past'], ['предыдущий', 'past'], ['прошлая', 'past'], ['прошлый', 'past'], ['прошедшие', 'past'], ['прошедшая', 'past'], ['прошедший', 'past'], ['прошлые', 'past'],
  ['без записей по итогам', 'without_outcomes'], ['без записей', 'without_outcomes'], ['без итогов', 'without_outcomes'],
  ['пропущенные', 'without_outcomes'], ['пропущенная', 'without_outcomes'], ['пропущенный', 'without_outcomes'], ['пропущено', 'without_outcomes'], ['пропущены', 'without_outcomes'],
  ['просроченные', 'overdue'], ['просроченная', 'overdue'], ['просроченный', 'overdue'], ['просрочено', 'overdue'], ['просрочены', 'overdue'],
  ['важные', 'important'], ['важная', 'important'], ['важный', 'important'], ['важное', 'important'],
  ['на сегодня', 'due_today'], ['сегодня', 'due_today'], ['на завтра', 'due_tomorrow'], ['завтра', 'due_tomorrow'],
  ['с проблемами', 'attention'], ['есть проблемы', 'attention'], ['требуют внимания', 'attention'], ['сломанные', 'broken'], ['сломанный', 'broken'], ['сломан', 'broken'], ['работающие', 'ok'], ['работающий', 'ok'], ['работает', 'ok'],
  ['на этой неделе', 'current_week'], ['за эту неделю', 'current_week'], ['текущая неделя', 'current_week'],
  ['за этот месяц', 'current_month'], ['за текущий месяц', 'current_month'], ['в этом месяце', 'current_month'], ['на этот месяц', 'current_month'], ['текущий месяц', 'current_month'], ['за месяц', 'current_month'],
  ['архивные', 'archived'], ['архивный', 'archived'], ['в архиве', 'archived'],
  ['с блокерами', 'has_blockers'], ['с блокером', 'has_blockers'], ['с проблемами в check-in', 'has_blockers'], ['что мешает', 'has_blockers'],
].sort((a, b) => b[0].length - a[0].length);

const SEARCH_MEETING_TYPE_ALIASES = [
  ['проектные', 'project'], ['проектная', 'project'], ['project', 'project'],
  ['ретроспектива', 'retro'], ['ретроспективы', 'retro'], ['ретро', 'retro'],
  ['технологизация', 'club'], ['технологизации', 'club'], ['технологизацию', 'club'],
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

// ---------- Вложения встреч и Мастерская как «ссылки»/«документы» ----------

function meetingHasOutcomeRecordsSearch(meeting) {
  const hasNotes = String(meeting?.notes || '').trim().length > 0;
  const hasDocuments = Array.isArray(meeting?.documentLinks) && meeting.documentLinks.some((doc) => String(doc?.title || doc?.url || '').trim());
  return hasNotes || hasDocuments;
}

function meetingIsPastSearch(meeting, today) {
  const key = String(meeting?.date || '').slice(0, 10);
  return !!key && key < today;
}

function stripPersonFromRemainder(text, person) {
  if (!person) return norm(text);
  const nameParts = norm(person.name).split(/\s+/).filter(Boolean);
  return norm(text).split(/\s+/).filter((word) => {
    const canonical = canonicalPersonQueryWords(word)[0] || word;
    return !nameParts.some((part) => fuzzyWordMatch(canonical, part));
  }).join(' ').trim();
}

function meetingNoteLinks(meeting) {
  const notes = String(meeting?.notes || '');
  if (!notes.trim()) return [];
  const rows = [];
  const urlRe = /https?:\/\/[^\s<>)\]}]+/gi;
  for (const line of notes.split(/\r?\n/)) {
    let match;
    while ((match = urlRe.exec(line))) {
      const url = match[0].replace(/[.,;:!?]+$/, '');
      const before = line.slice(0, match.index).trim().replace(/[:\-–—]\s*$/, '').trim();
      const title = before && before.length <= 80 ? before : 'Материал встречи';
      rows.push({ title, url });
    }
    urlRe.lastIndex = 0;
  }
  return rows;
}

function embeddedLinks(user) {
  const links = [];
  visibleItems('meetings', user).forEach((meeting) => {
    const seenUrls = new Set();
    const docs = [...(meeting.documentLinks || []), ...meetingNoteLinks(meeting)];
    docs.forEach((doc, index) => {
      const title = String(doc?.title || '').trim();
      const url = String(doc?.url || '').trim();
      if (!title && !url) return;
      if (url && seenUrls.has(url)) return;
      if (url) seenUrls.add(url);
      links.push({
        id: `meeting:${meeting.id}:${index}`,
        title: title || url,
        url,
        sourceType: 'meeting',
        sourceMeetingType: meeting.type || '',
        sourceId: meeting.id,
        sourceTitle: meeting.title || 'Встреча',
        sourceDate: meeting.date || '',
        personIds: [...(meeting.participantIds || [])],
        projectId: meeting.projectId || null,
      });
    });
  });
  visibleItems('labs', user).forEach((lab) => {
    (lab.links || []).forEach((doc, index) => {
      const title = String(doc?.title || doc?.name || '').trim();
      const url = String(doc?.url || doc?.href || '').trim();
      if (!title && !url) return;
      links.push({
        id: `labs:${lab.id}:${index}`,
        title: title || url,
        url,
        sourceType: 'labs',
        sourceId: lab.id,
        sourceTitle: lab.title || (lab.entityType === 'idea' ? 'Идея' : 'Мастерская'),
        sourceDate: lab.updatedAt || lab.createdAt || '',
        personIds: lab.authorId ? [lab.authorId] : [],
        projectId: null,
      });
    });
  });
  return links;
}

const LINK_SOURCE_ALIASES = [
  ['во встречах', 'meeting'], ['во встрече', 'meeting'],
  ['из встреч', 'meeting'], ['из встречи', 'meeting'],
  ['со встреч', 'meeting'], ['со встречи', 'meeting'],
  ['с встреч', 'meeting'], ['с встречи', 'meeting'],
  ['встречи', 'meeting'], ['встреча', 'meeting'], ['встреч', 'meeting'],
  ['в мастерской', 'labs'], ['из мастерской', 'labs'], ['мастерская', 'labs'],
  ['в the labs', 'labs'], ['из the labs', 'labs'], ['the labs', 'labs'],
].sort((a, b) => b[0].length - a[0].length);

function materialKindMatch(kind, link) {
  if (!kind) return true;
  const terms = MATERIAL_KIND_ALIASES[kind] || [];
  const haystack = `${link?.title || ''} ${link?.url || ''}`;
  return terms.some((term) => fuzzyTextMatch(term, haystack));
}

function stripPhrase(text, phrase) {
  return text.replace(new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'i'), ' ').replace(/\s+/g, ' ').trim();
}

// ---------- Разбор команды поиска ----------
// Одна строка запроса превращается в структуру { group, modifiers, person, project, ... },
// которую дальше фильтрует и ранжирует commandSearch.

function parseSearchCommand(rawQuery, user) {
  const normalizedRaw = norm(rawQuery);
  const asksWhen = /^когда(?:\s|$)/i.test(normalizedRaw);
  let remainder = normalizedRaw;
  const selfWords = [
    'у меня', 'для меня', 'со мной', 'обо мне', 'про меня',
    'мой','моя','мое','моё','мои','моего','моей','моих','моему','моим','мною','меня','мне',
  ];
  let selfRequested = false;
  for (const word of selfWords.sort((a, b) => b.length - a.length)) {
    if (containsPhrase(remainder, word)) {
      selfRequested = true;
      remainder = stripPhrase(remainder, word);
    }
  }

  // Разговорная оболочка обрабатывается до типа: «когда 1:1», «где мои задачи».
  remainder = stripSearchIntentPrefix(remainder);

  let type = null;

  // Явный тип материала сильнее контекста источника. Например, в запросе
  // «саммари со встречи» слово «встречи» не должно превращать запрос в выдачу
  // встреч: это scope для вложения. Материалы поэтому разбираем до общего
  // SEARCH_TYPE_ALIASES, где также живут встречи, проекты и другие сущности.
  const materialMatch = matchTypeAlias(remainder, [...MATERIAL_SEARCH_TYPE_ALIASES].sort((a, b) => b[0].length - a[0].length));
  if (materialMatch) {
    type = { alias: materialMatch.alias, ...materialMatch.spec };
    remainder = stripPhrase(remainder, materialMatch.matchedText);
  }

  if (!type) {
    const typeMatch = matchTypeAlias(remainder, SEARCH_TYPE_ALIASES);
    if (typeMatch) {
      type = { alias: typeMatch.alias, ...typeMatch.spec };
      remainder = stripPhrase(remainder, typeMatch.matchedText);
    }
  }
  if (!type) return null;

  // Для документов/ссылок контекст источника является частью смысла запроса:
  // «документы с встречи» означает вложения встречи, а не глобальный раздел Документы.
  if (type.group === 'links' || type.group === 'documents') {
    for (const [alias, sourceType] of LINK_SOURCE_ALIASES) {
      if (containsPhrase(remainder, alias)) {
        type.sourceType = sourceType;
        remainder = stripPhrase(remainder, alias);
        if (sourceType === 'meeting') type.group = 'links';
        break;
      }
    }
  }

  // Материалы можно ограничивать типом встречи: «саммари с последних PR»,
  // «документы с 1:1». В таком запросе PR/1:1 — не самостоятельная выдача встреч,
  // а источник вложений, поэтому сохраняем подтип отдельно от group. «Документы»
  // без явного упоминания встречи («документы с последних PR») разбираются так же,
  // как «ссылки»: тип встречи здесь однозначно указывает на вложения, а не на
  // раздел «Документы» базы знаний.
  if (type.group === 'links' || type.group === 'documents') {
    for (const [alias, meetingType] of SEARCH_MEETING_TYPE_ALIASES) {
      if (containsPhrase(remainder, alias)) {
        type.sourceType = 'meeting';
        type.sourceMeetingType = meetingType;
        type.group = 'links';
        remainder = stripPhrase(remainder, alias);
        break;
      }
    }
  }

  // «задачи команды», «встречи всей команды» задают контекст выдачи, а не текстовый
  // поиск по слову «команда». Права доступа уже ограничивают состав данных, поэтому
  // здесь достаточно убрать эту разговорную связку из остатка запроса.
  for (const phrase of ['всей команды', 'моей команды', 'команды']) {
    remainder = stripPhrase(remainder, phrase);
  }

  // Тип встречи можно указывать вместе с общим словом «встречи»: «встречи 1:1», «встречи ретро».
  if (type.group === 'meetings' && !type.meetingType) {
    for (const [alias, meetingType] of SEARCH_MEETING_TYPE_ALIASES) {
      if (containsPhrase(remainder, alias)) {
        type.meetingType = meetingType;
        remainder = stripPhrase(remainder, alias);
        break;
      }
    }
  }

  // «техна» — разговорный синоним технологизации. Поддерживаем все
  // употребляемые формы слова, независимо от порядка: «задачи техны»,
  // «задачи по техне» и т. п.
  if (type.group === 'tasks' && !type.taskType) {
    for (const form of TECHNOLOGIZATION_FORMS) {
      if (containsPhrase(remainder, form)) {
        type.taskType = 'development';
        remainder = stripPhrase(remainder, form);
        remainder = remainder.replace(/^(?:по|на)\s+/, '').trim();
        break;
      }
    }
  }

  const relativeDate = parseRelativeDatePhrase(remainder);
  if (relativeDate) remainder = stripPhrase(remainder, relativeDate.phrase);

  const modifiers = [];
  for (const [phrase, value] of SEARCH_MODIFIERS) {
    if (containsPhrase(remainder, phrase)) {
      modifiers.push(value);
      remainder = stripPhrase(remainder, phrase);
    }
  }

  // После выделения типа/источника разговорные предлоги не должны оставаться
  // полнотекстовым хвостом: «документы со встреч», «саммари с последних PR».
  if (type.group === 'links') remainder = remainder.replace(/^(?:с|со|из|в|во)\s+/, '').trim();

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

  remainder = stripPersonFromRemainder(remainder, person);
  return {
    ...type,
    modifiers,
    person,
    project,
    selfRequested,
    textRemainder: remainder,
    ...(relativeDate ? { dateRange: { start: relativeDate.start, end: relativeDate.end } } : {}),
  };
}

// ---------- Фильтрация и выполнение разобранной команды ----------

function peopleWithContext(people, user) {
  return people.map((p) => {
    const id = p.id;
    return {
      ...p,
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
  return {
    people: [], projects: [], tasks: [], issues: [], meetings: [], journal: [], goals: [],
    agreements: [], links: [], documents: [], tools: [], labs: [], processes: [], vacations: [], checkins: [],
  };
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
  if (group === 'links') return items.filter((x) => (x.personIds || []).includes(id));
  if (group === 'documents') {
    const projectIds = new Set(db.projects.all().filter((x) => (x.memberIds || []).includes(id)).map((x) => x.id));
    return items.filter((x) => x.projectId && projectIds.has(x.projectId));
  }
  if (group === 'tools') return [];
  if (group === 'goals') {
    const goalKeys = new Set();
    db.tasks.all().filter((x) => !x.archivedAt && (x.assigneeIds || []).includes(id) && x.goalKey).forEach((x) => goalKeys.add(x.goalKey));
    db.issues.all().filter((x) => (x.relatedPersonIds || []).includes(id) && x.goalKey).forEach((x) => goalKeys.add(x.goalKey));
    return items.filter((x) => goalKeys.has(x.goalKey));
  }
  return items;
}

function filterByProject(group, items, project) {
  if (!project) return items;
  const id = project.id;
  if (['tasks', 'issues', 'meetings', 'agreements', 'links', 'documents'].includes(group)) return items.filter((x) => x.projectId === id);
  if (group === 'projects') return items.filter((x) => x.id === id);
  return items;
}

function filterByModifier(group, items, modifiers) {
  if (!modifiers.length) return items;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(`${today}T00:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthDate = new Date(`${monthStart}T00:00:00Z`);
  monthDate.setUTCMonth(monthDate.getUTCMonth() + 1);
  const nextMonthStart = monthDate.toISOString().slice(0, 10);
  const periodDate = (group, x) => {
    if (group === 'tasks') return String(x.dueDate || x.updatedAt || x.createdAt || '').slice(0, 10);
    if (group === 'meetings') return String(x.date || '').slice(0, 10);
    if (group === 'agreements') return String(x.dueDate || x.updatedAt || x.createdAt || '').slice(0, 10);
    if (group === 'vacations') return String(x.startDate || '').slice(0, 10);
    if (group === 'checkins') return String(x.weekStart || '').slice(0, 10);
    return String(x.updatedAt || x.createdAt || x.date || '').slice(0, 10);
  };
  return items.filter((x) => modifiers.every((mod) => {
    if (mod === 'current_month') {
      const key = periodDate(group, x);
      return !!key && key >= monthStart && key < nextMonthStart;
    }
    if (mod === 'high') return group === 'issues' ? x.severity === 'high' : true;
    if (mod === 'important' && group === 'issues') return x.severity === 'high';

    if (group === 'tasks') {
      if (mod === 'done') return x.status === 'done';
      if (mod === 'open' || mod === 'active') return x.status !== 'done';
      if (mod === 'overdue') return x.status !== 'done' && !!x.dueDate && String(x.dueDate).slice(0, 10) < today;
      if (['paused', 'blocked', 'in_review', 'in_progress', 'todo'].includes(mod)) return x.status === mod;
      if (mod === 'important') return x.priority === 'high';
      if (mod === 'due_today') return String(x.dueDate || '').slice(0, 10) === today;
      if (mod === 'due_tomorrow') return String(x.dueDate || '').slice(0, 10) === tomorrow;
      if (mod === 'archived') return !!x.archivedAt;
    }
    if (group === 'projects' || group === 'goals') {
      if (mod === 'done') return x.status === 'done';
      if (mod === 'open' || mod === 'active') return x.status === 'active';
      if (mod === 'paused') return x.status === 'paused';
    }
    if (group === 'issues') {
      if (mod === 'done') return x.status === 'resolved';
      if (mod === 'paused') return x.status === 'paused';
      if (mod === 'open' || mod === 'active') return x.status !== 'resolved';
    }
    if (group === 'agreements') {
      if (mod === 'done') return x.status === 'done';
      if (mod === 'open' || mod === 'active') return x.status !== 'done';
      if (mod === 'overdue') return x.status !== 'done' && !!x.dueDate && String(x.dueDate).slice(0, 10) < today;
    }
    if (group === 'meetings') {
      const key = (x.date || '').slice(0, 10);
      if (mod === 'upcoming' || mod === 'active') return key >= today;
      if (mod === 'past') return key < today;
      if (mod === 'done') return key < today && meetingHasOutcomeRecordsSearch(x);
      if (mod === 'without_outcomes' || mod === 'overdue') return meetingIsPastSearch(x, today) && !meetingHasOutcomeRecordsSearch(x);
    }
    if (group === 'vacations') {
      if (mod === 'active') return x.startDate <= today && x.endDate >= today;
      if (mod === 'upcoming') return x.startDate > today;
      if (mod === 'past' || mod === 'done') return x.endDate < today;
    }
    if (group === 'people') {
      if (mod === 'active' || mod === 'open') return x.status === 'active';
    }
    if (group === 'processes') {
      if (mod === 'open' || mod === 'active' || mod === 'blocked' || mod === 'attention') return x.status === 'broken' || x.status === 'attention';
      if (mod === 'done' || mod === 'ok') return x.status === 'ok' || !x.status;
      if (mod === 'broken') return x.status === 'broken';
    }
    if (group === 'checkins') {
      if (mod === 'has_blockers' || mod === 'attention') return String(x.blockers || '').trim().length > 0;
      if (mod === 'current_week') {
        const d = new Date(`${today}T00:00:00Z`);
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        return String(x.weekStart || '') === d.toISOString().slice(0, 10);
      }
    }
    return true;
  }));
}

function commandSearch(command, user, options = {}) {
  const groups = emptySearchGroups();
  // Персональные формулировки («мой», «у меня», «для меня» и т. п.)
  // никогда не должны деградировать до общего поиска. Если профиль аккаунта
  // не связан с сотрудником, безопаснее вернуть пустой результат, чем чужие данные.
  if (command.selfRequested && !command.person) return groups;
  const all = {
    people: visibleItems('people', user),
    projects: visibleItems('projects', user),
    tasks: visibleItems('tasks', user, { includeArchived: true }),
    issues: visibleItems('issues', user),
    meetings: visibleItems('meetings', user),
    journal: visibleItems('journal', user),
    goals: visibleItems('goals', user),
    agreements: visibleItems('agreements', user),
    links: embeddedLinks(user),
    documents: visibleItems('kbDocs', user),
    tools: visibleItems('tools', user),
    labs: visibleItems('labs', user),
    processes: visibleItems('processes', user),
    vacations: visibleItems('vacations', user),
    checkins: visibleItems('checkins', user),
  };
  let items = all[command.group] || [];
  if (command.group === 'links' && command.sourceType) items = items.filter((x) => x.sourceType === command.sourceType);
  if (command.group === 'links' && command.materialKind) items = items.filter((x) => materialKindMatch(command.materialKind, x));
  if (command.group === 'links' && command.sourceMeetingType) items = items.filter((x) => norm(x.sourceMeetingType) === norm(command.sourceMeetingType));
  if (command.taskType) items = items.filter((x) => (x.taskType || 'standard') === command.taskType);
  if (command.meetingType) items = items.filter((x) => norm(x.type) === norm(command.meetingType));
  if (command.vacationType) items = items.filter((x) => x.type === command.vacationType);
  if (command.peopleType) items = items.filter((x) => x.type === command.peopleType);
  if (command.labEntityType) items = items.filter((x) => x.entityType === command.labEntityType);
  // Журнал уже персональный на уровне visibleItems. Формулировки «мои записи
  // журнала / мои заметки» не означают «записи, где я упомянут», поэтому для
  // selfRequested не применяем дополнительный person-фильтр. Явный запрос про
  // другого человека («записи журнала про Дуайта») по-прежнему фильтруется по mentions.
  if (!(command.group === 'journal' && command.selfRequested)) {
    items = filterByPerson(command.group, items, command.person);
  }
  items = filterByProject(command.group, items, command.project);
  items = filterByModifier(command.group, items, command.modifiers);
  if (command.dateRange) {
    const { start, end } = command.dateRange;
    const periodDate = (group, x) => {
      if (group === 'tasks') return String(x.dueDate || '').slice(0, 10);
      if (group === 'meetings') return String(x.date || '').slice(0, 10);
      if (group === 'agreements') return String(x.dueDate || '').slice(0, 10);
      if (group === 'vacations') return String(x.startDate || '').slice(0, 10);
      if (group === 'checkins') return String(x.weekStart || '').slice(0, 10);
      return String(x.date || x.dueDate || x.updatedAt || x.createdAt || '').slice(0, 10);
    };
    items = items.filter((x) => {
      if (command.group === 'vacations') {
        const itemStart = String(x.startDate || '').slice(0, 10);
        const itemEnd = String(x.endDate || itemStart).slice(0, 10);
        return !!itemStart && itemStart <= end && itemEnd >= start;
      }
      const key = periodDate(command.group, x);
      return !!key && key >= start && key <= end;
    });
  }
  if (command.group === 'meetings' && command.textRemainder) {
    const meetingIds = new Set(items.map((meeting) => meeting.id));
    const linkMatches = embeddedLinks(user).filter((link) => link.sourceType === 'meeting' && meetingIds.has(link.sourceId) && fuzzyTextMatch(command.textRemainder, `${link.title} ${link.url}`));
    if (linkMatches.length) {
      groups.links = linkMatches;
      groups.meetings = [];
      return groups;
    }
  }
  if (command.textRemainder) {
    const q = command.textRemainder;
    items = items.filter((x) => fuzzyTextMatch(q, [x.name, x.title, x.text, x.description, x.notes, x.url, x.note, x.did, x.willDo, x.blockers, x.taskKey, x.projectKey, x.issueKey, x.processKey, x.agreementKey, x.goalKey, x.noteKey, x.toolKey, x.meetingKey, x.ideaKey, x.blueprintKey].filter(Boolean).join(' ')));
  }
  items = searchRanker.rankGroup(command.group, items, command.textRemainder || '', {
    user,
    taskPriorityMode: options.taskPriorityMode || 'balanced',
    materialKind: command.materialKind || null,
  });
  if (command.group === 'links' && command.modifiers.includes('latest')) {
    items = [...items].sort((a, b) => String(b.sourceDate || '').localeCompare(String(a.sourceDate || '')));
  }
  groups[command.group] = command.group === 'people' ? peopleWithContext(items, user) : items;
  return groups;
}

// ---------- Единая точка входа: NLU и полный поиск ----------

// Полный поиск одним вызовом: сначала пробуем разобрать запрос как команду,
// иначе ищем по тексту. Вынесено из обработчика маршрута, чтобы «Умный поиск»
// мог отдавать ровно тот же результат без второго HTTP-запроса.
// Единое структурированное представление обычного NLU-запроса. UI и умный
// ассистент должны опираться на этот результат, а не повторно разбирать строку.
// Специальные digest/create-интенты остаются уровнем smart-search, но любой запрос
// к доменным коллекциям проходит через эту точку.
function parseQuery(rawQuery, user) {
  const query = (rawQuery || '').toString().trim();
  const normalized = norm(query);
  if (!normalized) return { kind: 'empty', query, normalized };

  const command = parseSearchCommand(query, user);
  if (!command) return { kind: 'text', query, normalized };

  const intent = /^(?:открой|открыть)(?:\s|$)/i.test(normalized)
    ? 'open'
    : /^(?:покажи|показать|выведи|отобрази|перечисли|дай)(?:\s|$)/i.test(normalized)
      ? 'show'
      : 'find';
  return {
    kind: 'content',
    intent,
    query,
    normalized,
    entity: command.group,
    filters: {
      modifiers: [...(command.modifiers || [])],
      person: command.person || null,
      project: command.project || null,
      selfRequested: !!command.selfRequested,
      text: command.textRemainder || '',
      ...(command.taskType ? { taskType: command.taskType } : {}),
      ...(command.dateRange ? { dateRange: command.dateRange } : {}),
      ...(command.meetingType ? { meetingType: command.meetingType } : {}),
      ...(command.labEntityType ? { labEntityType: command.labEntityType } : {}),
      ...(command.peopleType ? { peopleType: command.peopleType } : {}),
      ...(command.vacationType ? { vacationType: command.vacationType } : {}),
    },
    command,
  };
}

function runSearch(rawQuery, user, parsedQuery = null, options = {}) {
  const query = (rawQuery || '').toString().trim();
  const q = norm(query);
  if (!q) return { query, groups: emptySearchGroups() };

  const parsed = parsedQuery || parseQuery(query, user);
  if (parsed.kind === 'content') {
    const command = parsed.command;
    return {
      query,
      nlu: {
        kind: parsed.kind,
        intent: parsed.intent,
        entity: parsed.entity,
        filters: parsed.filters,
      },
      command: {
        group: command.group,
        alias: command.alias,
        modifiers: command.modifiers,
        person: command.person || null,
        project: command.project || null,
        selfRequested: !!command.selfRequested,
        textRemainder: command.textRemainder || '',
        ...(command.taskType ? { taskType: command.taskType } : {}),
        ...(command.materialKind ? { materialKind: command.materialKind } : {}),
        ...(command.sourceType ? { sourceType: command.sourceType } : {}),
        ...(command.sourceMeetingType ? { sourceMeetingType: command.sourceMeetingType } : {}),
        ...(command.dateRange ? { dateRange: command.dateRange } : {}),
      },
      personFocus: command.person || null,
      personFocusType: command.group,
      groups: commandSearch(command, user, options),
    };
  }

  // Обычный полнотекстовый поиск без распознанной команды: каждая коллекция
  // фильтруется своим набором полей и ранжируется тем же ranker'ом, что и команды.
  const match = (s) => norm(s).includes(q) || fuzzyTextMatch(q, s || '');
  const matchedGroup = (group, items, matchFn, extraOptions = {}) =>
    searchRanker.rankGroup(group, items.filter(matchFn), query, { user, ...extraOptions });

  const groups = {
    people: peopleWithContext(matchedGroup('people', visibleItems('people', user), (p) => match(p.name) || match(p.role) || match(p.tags && p.tags.join(' '))), user),
    projects: matchedGroup('projects', visibleItems('projects', user), (p) => match(p.projectKey) || match(p.name) || match(p.description)),
    tasks: matchedGroup('tasks', visibleItems('tasks', user, { includeArchived: true }), (t) => match(t.taskKey) || match(t.title) || match(t.description), { taskPriorityMode: options.taskPriorityMode || 'balanced' }),
    issues: matchedGroup('issues', visibleItems('issues', user), (i) => match(i.issueKey) || match(i.title) || match(i.description)),
    meetings: matchedGroup('meetings', visibleItems('meetings', user), (m) => match(m.meetingKey) || match(m.title) || match(m.notes)),
    journal: matchedGroup('journal', visibleItems('journal', user), (j) => match(j.noteKey) || match(j.text)),
    goals: matchedGroup('goals', visibleItems('goals', user), (g) => match(g.goalKey) || match(g.title) || match(g.description)),
    agreements: matchedGroup('agreements', visibleItems('agreements', user), (a) => match(a.agreementKey) || match(a.text)),
    links: matchedGroup('links', embeddedLinks(user), (link) => match(link.title) || match(link.url) || match(link.sourceTitle)),
    documents: matchedGroup('documents', visibleItems('kbDocs', user), (d) => match(d.title) || match(d.url)),
    tools: matchedGroup('tools', visibleItems('tools', user), (d) => match(d.toolKey) || match(d.title) || match(d.url)),
    labs: matchedGroup('labs', visibleItems('labs', user), (d) => match(d.ideaKey) || match(d.blueprintKey) || match(d.title) || match(d.description)),
    processes: matchedGroup('processes', visibleItems('processes', user), (p) => match(p.processKey) || match(p.title) || match(p.expectedBehavior) || match(p.currentBehavior) || match(p.description) || match(p.brokenNote) || (p.fixOptions || []).some((option) => match(option.text))),
    vacations: matchedGroup('vacations', visibleItems('vacations', user), (v) => match(v.note) || match(v.type)),
    checkins: matchedGroup('checkins', visibleItems('checkins', user), (c) => match(c.did) || match(c.willDo) || match(c.blockers)),
  };
  return { query, personFocus: null, personFocusType: null, groups };
}

// ---------- Статистика непонятых запросов ----------

// Запрос считаем «непонятым», когда он непустой, но команду распознать не
// удалось (runSearch/smart-search в этом случае не кладут в результат
// command) — тогда поиск тихо падает в обычный полнотекстовый режим. Копим
// такие запросы, чтобы расширять словарь по реальным формулировкам, а не
// гадать. Сбой самого лога не должен портить ответ поиска.
function logSearchMissIfUnrecognized(result, user) {
  if (!result || !result.query || result.command) return;
  try {
    db.searchMisses.log(result.query, { personId: user && user.personId });
  } catch (_) {
    // Статистика необязательна — поиск важнее лога.
  }
}

// ---------- HTTP-маршрут ----------

app.get('/api/search', (req, res) => {
  let settings = {};
  if (normalizeUserSettings) {
    try {
      settings = normalizeUserSettings(db.auth.preferences.get(req.auth.user.id));
    } catch (_) {
      // Настройки не критичны для поиска — при сбое просто используем стратегию по умолчанию.
    }
  }
  const result = runSearch(req.query.q, req.auth.user, null, { taskPriorityMode: settings.taskPriorityMode || 'balanced' });
  logSearchMissIfUnrecognized(result, req.auth.user);
  res.json(result);
});

// Разбор запросов живёт в одном месте: «Умный поиск» (server/domain/smart-search.js)
// переиспользует эти же функции, а не заводит второй, расходящийся со временем парсер.
return {
  norm, stemRu, fuzzyTextMatch, fuzzyWordMatch, stripSearchFillers, stripSearchIntentPrefix,
  parseQuery, parseSearchCommand, commandSearch, emptySearchGroups, runSearch, parseRelativeDatePhrase,
  logSearchMissIfUnrecognized,
  findPersonByFragment, rankPeopleByFragment, findProjectByFragment, peopleWithContext,
};

};
