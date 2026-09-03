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
  ['пет-проекты', { group: 'labs' }], ['пет-проект', { group: 'labs' }],
  ['эксперименты', { group: 'labs' }], ['эксперимент', { group: 'labs' }],
  ['лаборатория', { group: 'labs' }], ['лабы', { group: 'labs' }], ['лаба', { group: 'labs' }], ['labs', { group: 'labs' }],
  ['инициатива', { group: 'labs' }],
  ['задачи на развитие', { group: 'tasks', taskType: 'development' }],
  ['задача на развитие', { group: 'tasks', taskType: 'development' }],
  ['заметки', { group: 'journal', journalKind: 'note' }],
  ['заметка', { group: 'journal', journalKind: 'note' }],
  ['наблюдения', { group: 'journal', journalKind: 'note' }],
  ['наблюдение', { group: 'journal', journalKind: 'note' }],
  ['идеи', { group: 'journal', journalKind: 'idea' }],
  ['идея', { group: 'journal', journalKind: 'idea' }],

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
  ['отсутствия', { group: 'vacations' }], ['отсутствие', { group: 'vacations' }],
  ['отпуска', { group: 'vacations', vacationType: 'vacation' }], ['отпуск', { group: 'vacations', vacationType: 'vacation' }],
  ['больничные', { group: 'vacations', vacationType: 'sick' }], ['больничный', { group: 'vacations', vacationType: 'sick' }],
  ['отгулы', { group: 'vacations', vacationType: 'dayoff' }], ['отгул', { group: 'vacations', vacationType: 'dayoff' }],
  ['сотрудники', { group: 'people', peopleType: 'team' }], ['сотрудник', { group: 'people', peopleType: 'team' }],
  ['стейкхолдеры', { group: 'people', peopleType: 'stakeholder' }], ['стейкхолдер', { group: 'people', peopleType: 'stakeholder' }],
  ['люди', { group: 'people' }], ['человек', { group: 'people' }],
].sort((a, b) => b[0].length - a[0].length);

const SEARCH_MODIFIERS = [
  ['высокой серьезности', 'high'], ['высокая серьезность', 'high'], ['серьезные', 'high'], ['серьезные', 'high'],
  ['завершенные', 'done'], ['завершенные', 'done'], ['закрытые', 'done'], ['выполненные', 'done'], ['готовые', 'done'],
  ['открытые', 'open'], ['активные', 'active'], ['текущие', 'active'], ['приостановленные', 'paused'], ['на паузе', 'paused'],
  ['заблокированные', 'blocked'], ['на ревью', 'in_review'], ['в работе', 'in_progress'], ['к выполнению', 'todo'],
  ['следующая', 'upcoming'], ['следующий', 'upcoming'], ['следующие', 'upcoming'],
  ['ближайшая', 'upcoming'], ['ближайший', 'upcoming'], ['ближайшие', 'upcoming'],
  ['предстоящие', 'upcoming'], ['будущие', 'upcoming'],
  ['предыдущая', 'past'], ['предыдущий', 'past'], ['прошлая', 'past'], ['прошлый', 'past'],
  ['прошедшие', 'past'], ['прошлые', 'past'],
].sort((a, b) => b[0].length - a[0].length);

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

  return { ...type, modifiers, person, selfRequested, textRemainder: person ? '' : remainder };
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
  return { people: [], projects: [], tasks: [], issues: [], meetings: [], journal: [], goals: [], agreements: [], documents: [], tools: [], labs: [], processes: [], vacations: [] };
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

function filterByModifier(group, items, modifiers) {
  if (!modifiers.length) return items;
  const today = new Date().toISOString().slice(0, 10);
  return items.filter((x) => modifiers.every((mod) => {
    if (mod === 'high') return group === 'issues' ? x.severity === 'high' : true;
    if (group === 'tasks') {
      if (mod === 'done') return x.status === 'done'; if (mod === 'open' || mod === 'active') return x.status !== 'done';
      if (['paused','blocked','in_review','in_progress','todo'].includes(mod)) return x.status === mod;
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
      const key = (x.date || '').slice(0, 10); if (mod === 'upcoming' || mod === 'active') return key >= today; if (mod === 'past' || mod === 'done') return key < today;
    }
    if (group === 'vacations') {
      if (mod === 'active') return x.startDate <= today && x.endDate >= today; if (mod === 'upcoming') return x.startDate > today; if (mod === 'past' || mod === 'done') return x.endDate < today;
    }
    if (group === 'people') {
      if (mod === 'active' || mod === 'open') return x.status === 'active';
    }
    if (group === 'processes') {
      if (mod === 'open' || mod === 'active' || mod === 'blocked') return x.status === 'broken' || x.status === 'attention'; if (mod === 'done') return x.status === 'ok' || !x.status;
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
    people: visibleItems('people', user), projects: visibleItems('projects', user), tasks: visibleItems('tasks', user), issues: visibleItems('issues', user), meetings: visibleItems('meetings', user),
    journal: visibleItems('journal', user), goals: visibleItems('goals', user), agreements: visibleItems('agreements', user), documents: visibleItems('documents', user), tools: visibleItems('tools', user), labs: visibleItems('labs', user), processes: visibleItems('processes', user), vacations: visibleItems('vacations', user),
  };
  let items = all[command.group] || [];
  if (command.taskType) items = items.filter((x) => (x.taskType || 'standard') === command.taskType);
  if (command.meetingType) items = items.filter((x) => x.type === command.meetingType);
  if (command.journalKind) items = items.filter((x) => x.kind === command.journalKind);
  if (command.vacationType) items = items.filter((x) => x.type === command.vacationType);
  if (command.peopleType) items = items.filter((x) => x.type === command.peopleType);
  items = filterByPerson(command.group, items, command.person);
  items = filterByModifier(command.group, items, command.modifiers);
  if (command.group === 'meetings') {
    const direction = command.modifiers.includes('past') ? -1 : 1;
    items = [...items].sort((a, b) => direction * String(a.date || '').localeCompare(String(b.date || '')));
  }
  if (command.textRemainder) {
    const q = command.textRemainder;
    items = items.filter((x) => fuzzyTextMatch(q, x.name || x.title || x.text || x.description || x.notes || x.url || x.note || ''));
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
      command: { group: command.group, alias: command.alias, modifiers: command.modifiers, person: command.person || null, selfRequested: !!command.selfRequested },
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
    processes: visibleItems('processes', req.auth.user).filter((p) => match(p.title) || match(p.description)),
    vacations: visibleItems('vacations', req.auth.user).filter((v) => match(v.note) || match(v.type)),
  };
  res.json({ query: rawQuery, personFocus: null, personFocusType: null, groups });
});


};
