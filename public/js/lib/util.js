// Общие хелперы: даты, цвета, экранирование, метки статусов/приоритетов.

// Красивые URL карточек. Связи в данных по-прежнему используют внутренние id.
function personPath(personOrId) {
  const person = typeof personOrId === 'string' ? (store && store.person ? store.person(personOrId) : null) : personOrId;
  const ref = person ? (person.slug || person.id) : personOrId;
  return `/people/${encodeURIComponent(ref || '')}`;
}

function projectPath(projectOrId) {
  const project = typeof projectOrId === 'string' ? (store && store.project ? store.project(projectOrId) : null) : projectOrId;
  const ref = project ? (project.slug || project.id) : projectOrId;
  return `/projects/${encodeURIComponent(ref || '')}`;
}

function goalPath(goal) {
  const ref = goal && (goal.slug || goal.id);
  return `/goals/${encodeURIComponent(ref || '')}`;
}

function taskPath(taskOrKey) {
  const ref = typeof taskOrKey === 'string' ? taskOrKey : (taskOrKey && (taskOrKey.taskKey || taskOrKey.id));
  return `/tasks/${encodeURIComponent(ref || '')}`;
}

function meetingPath(meetingOrKey) {
  const ref = typeof meetingOrKey === 'string' ? meetingOrKey : (meetingOrKey && (meetingOrKey.meetingKey || meetingOrKey.id));
  return `/meetings/${encodeURIComponent(ref || '')}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Сокращённые названия месяцев (родительный падеж, «1 янв.») — по просьбе
// пользователя даты везде должны быть короче. Май не сокращается точкой —
// «мая» и так короче, чем «май.» выглядело бы.
const MONTHS_RU = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DOW_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Понедельник календарной недели, которой принадлежит дата. Используется и для
// группировки Check-in по неделям, и для сигнала «пора провести Check-in»
// в Обзоре (напоминание строго по понедельникам) — единая точка правды на
// случай, если день начала недели когда-нибудь станет настраиваемым.
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = воскресенье … 6 = суббота
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Общие текстовые хелперы нужны нескольким разделам, поэтому остаются в util.js,
// который загружается до ленивых view-модулей.
function plainJournalText(text) {
  return String(text || '').replace(/@\[([^\]]+)\]\((?:person|project|stakeholder|team):[a-zA-Z0-9_]+\)/g, '$1').trim();
}

function fmtDate(dateStr, opts) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const day = d.getDate();
  const month = MONTHS_RU[d.getMonth()];
  if (opts && opts.withYear) {
    return `${day} ${month} ${d.getFullYear()}`;
  }
  return `${day} ${month}`;
}

function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} дн назад`;
  return fmtDate(dateStr, { withYear: d.getFullYear() !== now.getFullYear() });
}

function daysDiff(dateStr, fromStr) {
  const a = new Date((dateStr || '').slice(0, 10));
  const b = new Date((fromStr || todayStr()).slice(0, 10));
  return Math.round((a - b) / 86400000);
}

function deadlineDateLabel(dueDate) {
  if (!dueDate) return '';
  return `до ${fmtDate(dueDate)}`;
}

function dueLabel(dueDate) {
  if (!dueDate) return '';
  const diff = daysDiff(dueDate);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff < 0) return `${Math.abs(diff)} дн. назад`;
  if (diff <= 7) return `через ${diff} дн`;
  return deadlineDateLabel(dueDate);
}

const AVATAR_PALETTE = ['#5E6AD2', '#26B5CE', '#4CB782', '#F2994A', '#EB5757', '#9B74E9', '#EB70AA', '#E2B203'];

function colorForId(id) {
  let hash = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// Инициалы на цветном аватаре: белым по светлым цветам палитры (жёлтый, оранжевый,
// бирюзовый) контраст был около 2:1 — такие подписи первыми пропадают при наклоне
// крышки и низкой яркости. Выбираем из двух чернил то, что читается лучше;
// сами цвета палитры при этом не меняются.
function readableInk(background) {
  const hex = String(background || '').replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  const withWhite = 1.05 / (luminance + 0.05);
  const withInk = (luminance + 0.05) / 0.0654; // относительная яркость #12161c + 0.05
  return withInk > withWhite ? '#12161c' : '#ffffff';
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Убирает markdown-разметку упоминаний (@[Имя](type:id) -> Имя) — используется там,
// где текст обрезается по длине и полноценные кликабельные ссылки не нужны (превью, поиск).
function stripMentions(text) {
  if (!text) return '';
  return text.replace(/@\[([^\]]+)\]\((?:person|project|stakeholder|team):[a-zA-Z0-9_]+\)/g, '$1');
}

function previewText(text, maxLen) {
  const plain = escapeHtml(stripMentions(text || ''));
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

// ---------------- Часовые пояса и график работы ----------------
// Наш часовой пояс — Калининград (это ваше локальное время, все "разницы" считаются от него).

const OUR_TIMEZONE = 'Europe/Kaliningrad';
const MOSCOW_TIMEZONE = 'Europe/Moscow';

const TIMEZONE_RU_LABELS = {
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Moscow': 'Москва',
  'Europe/Minsk': 'Минск',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Almaty': 'Алматы',
  'Asia/Tashkent': 'Ташкент',
  'Asia/Yerevan': 'Ереван',
  'Asia/Tbilisi': 'Тбилиси',
  'Asia/Baku': 'Баку',
  'Asia/Dubai': 'Дубай',
  'Asia/Kolkata': 'Калькутта',
  'Europe/London': 'Лондон',
  'Europe/Berlin': 'Берлин',
  'Europe/Warsaw': 'Варшава',
  'America/New_York': 'Нью-Йорк',
  'America/Los_Angeles': 'Лос-Анджелес',
};

const TIMEZONE_SUGGESTIONS = [
  'Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Minsk', 'Asia/Yekaterinburg', 'Asia/Omsk',
  'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok',
  'Asia/Almaty', 'Asia/Tashkent', 'Asia/Yerevan', 'Asia/Tbilisi', 'Asia/Baku',
  'Europe/London', 'Europe/Berlin', 'Europe/Warsaw', 'Asia/Dubai', 'Asia/Kolkata',
  'America/New_York', 'America/Los_Angeles',
];

function availableTimezones(current) {
  let zones = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
  } catch (e) { /* fallback below */ }
  if (!zones.length) zones = TIMEZONE_SUGGESTIONS.slice();
  const preferred = TIMEZONE_SUGGESTIONS.filter((tz) => zones.includes(tz));
  const rest = zones.filter((tz) => !preferred.includes(tz));
  const all = [...preferred, ...rest];
  if (current && !all.includes(current)) all.unshift(current);
  return all;
}

function timezoneNameRu(timeZone) {
  if (!timeZone) return '';
  if (TIMEZONE_RU_LABELS[timeZone]) return TIMEZONE_RU_LABELS[timeZone];
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      timeZoneName: 'longGeneric',
      month: 'long',
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (name && !/^(GMT|UTC)/i.test(name)) {
      return name.replace(/^Время:\s*/i, '').replace(/\s+время$/i, '').trim();
    }
  } catch (e) { /* use IANA city below */ }
  const city = String(timeZone).split('/').pop().replace(/_/g, ' ');
  return city || timeZone;
}

function timezoneMoscowDiffMinutes(timeZone) {
  return tzOffsetMinutes(timeZone || MOSCOW_TIMEZONE) - tzOffsetMinutes(MOSCOW_TIMEZONE);
}

function timezoneMoscowDiffLabel(timeZone) {
  const diff = timezoneMoscowDiffMinutes(timeZone);
  if (Math.abs(diff) < 1) return 'МСК';
  const sign = diff > 0 ? '+' : '−';
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `МСК${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

function timezoneOptionLabel(timeZone) {
  return `${timezoneNameRu(timeZone)} (${timezoneMoscowDiffLabel(timeZone)})`;
}

// Смещение таймзоны в минутах от UTC на заданный момент (учитывает переход на летнее время, если он есть).
function tzOffsetMinutes(timeZone, date) {
  date = date || new Date();
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
    const part = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName');
    if (part) {
      if (/^GMT$/.test(part.value)) return 0;
      const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part.value);
      if (m) {
        const sign = m[1] === '-' ? -1 : 1;
        return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
      }
    }
  } catch (e) { /* браузер не поддерживает longOffset — считаем через фолбэк ниже */ }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch (e) {
    return 0;
  }
}

// Разница часового пояса человека относительно Калининграда, в минутах (положительная — человек впереди по времени).
function tzDiffMinutes(timeZone) {
  return tzOffsetMinutes(timeZone || OUR_TIMEZONE) - tzOffsetMinutes(OUR_TIMEZONE);
}

function tzDiffShort(timeZone) {
  const diff = tzDiffMinutes(timeZone);
  if (Math.abs(diff) < 1) return '±0';
  const sign = diff > 0 ? '+' : '−';
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Переводит "HH:MM" рабочего графика человека в эквивалентное время по Калининграду (для сравнения графиков).
function shiftHHMMByDiff(hhmm, diffMinutes) {
  const base = parseHHMM(hhmm);
  if (base === null) return hhmm;
  let total = base - diffMinutes;
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------- Грейд человека (переносим из тегов в должность) ----------------

const GRADE_TAGS = ['junior', 'middle', 'senior', 'lead', 'principal'];
const GRADE_LABEL = { junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead', principal: 'Principal' };

function findGradeTag(tags) {
  return (tags || []).find((t) => GRADE_TAGS.includes((t || '').toLowerCase())) || null;
}

function personGrade(p) {
  const explicit = String((p && p.grade) || '').toLowerCase();
  if (GRADE_TAGS.includes(explicit)) return explicit;
  return String(findGradeTag(p && p.tags) || '').toLowerCase() || null;
}

// "Chapter Lead · Senior" — роль + отдельный грейд; старые grade-теги поддерживаем как миграцию.
function roleWithGrade(p) {
  const role = (p && p.role) || '';
  const gradeKey = personGrade(p);
  const grade = gradeKey ? (GRADE_LABEL[gradeKey] || gradeKey) : '';
  if (!grade) return escapeHtml(role);
  return role ? `${escapeHtml(role)} · ${escapeHtml(grade)}` : escapeHtml(grade);
}

// Теги без грейда (грейд уже показан в должности, дублировать чипом не нужно).
function nonGradeTags(p) {
  return ((p && p.tags) || []).filter((t) => !GRADE_TAGS.includes((t || '').toLowerCase()));
}

// ---------------- Текущий статус человека (работает / закончил / в отпуске) ----------------

function nowMinutesInTimezone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour').value);
    const m = Number(parts.find((p) => p.type === 'minute').value);
    return h * 60 + m;
  } catch (e) {
    return new Date().getHours() * 60 + new Date().getMinutes();
  }
}

// День недели считаем в часовом поясе самого сотрудника: в момент, когда у нас уже
// суббота, у коллеги в другом часовом поясе всё ещё может быть пятница (и наоборот).
function weekdayInTimezone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date());
  } catch (e) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
  }
}

function formatHoursMinutes(diffMin) {
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

// Возвращает { text, color } с текущим статусом человека, либо null, если данных не хватает.
function isActiveTeamPerson(p) {
  return !!p && p.type === 'team' && !['dismissed', 'transferred', 'inactive'].includes(p.status);
}

function localTimeLabel(person) {
  if (!person?.timezone) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: person.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
  } catch (e) {
    return '';
  }
}

function personWorkStatus(p, vacations) {
  if (!p || p.type !== 'team') return null;
  if (p.status === 'dismissed') return { text: 'уволен', color: 'var(--text-tertiary)' };
  if (p.status === 'transferred') return { text: 'переведен', color: 'var(--text-tertiary)' };
  if (p.status === 'on_leave') return { text: 'в отпуске', color: 'var(--orange)' };
  const today = todayStr();
  const activeVacation = (vacations || []).find((v) => v.personId === p.id && v.startDate <= today && v.endDate >= today);
  if (activeVacation) {
    const [, m, d] = activeVacation.endDate.split('-');
    return { text: `в отпуске до ${d}.${m}`, color: 'var(--orange)' };
  }
  if (!p.timezone || !p.workStart || !p.workEnd) return null;
  const weekday = weekdayInTimezone(p.timezone);
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { text: 'выходной', color: 'var(--text-tertiary)' };
  }
  const start = parseHHMM(p.workStart);
  const end = parseHHMM(p.workEnd);
  if (start === null || end === null) return null;
  const nowMin = nowMinutesInTimezone(p.timezone);
  const working = start <= end ? (nowMin >= start && nowMin < end) : (nowMin >= start || nowMin < end);
  if (working) return { text: 'работает', color: 'var(--green)' };
  if (nowMin < start) return { text: `начнёт через ${formatHoursMinutes(start - nowMin)}`, color: 'var(--text-tertiary)' };
  return { text: 'рабочий день закончен', color: 'var(--text-tertiary)' };
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------------- Русские числительные, стаж, возраст, скиллсет ----------------

function pluralRu(n, one, few, many) {
  n = Math.abs(Number(n) || 0);
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 === 1) return one;
  if (mod10 > 1 && mod10 < 5) return few;
  return many;
}

// "2 года 3 месяца" — стаж от даты найма до сегодня.
function formatTenure(hireDate) {
  if (!hireDate) return '';
  const start = new Date((hireDate || '').slice(0, 10));
  const now = new Date(todayStr());
  if (isNaN(start) || start > now) return '';
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts = [];
  if (years > 0) parts.push(`${years} ${pluralRu(years, 'год', 'года', 'лет')}`);
  if (months > 0 || years === 0) parts.push(`${months} ${pluralRu(months, 'месяц', 'месяца', 'месяцев')}`);
  return parts.join(' ') || 'меньше месяца';
}

// Возраст на сегодня по дате рождения (с учётом того, был ли уже день рождения в этом году).
// Две строки для блока "Время работы": график по Калининграду + город и разница в часах
// (разница не показывается, если она равна нулю — человек и так в том же часовом поясе).
function workScheduleBlockHtml(person) {
  if (!person || !person.timezone || !person.workStart || !person.workEnd) return '';
  const diff = tzDiffMinutes(person.timezone);
  const eqStart = shiftHHMMByDiff(person.workStart, diff);
  const eqEnd = shiftHHMMByDiff(person.workEnd, diff);
  const bits = [];
  if (person.city) bits.push(escapeHtml(person.city));
  if (Math.abs(diff) >= 1) bits.push(`${tzDiffShort(person.timezone)} часов`);
  return `<div>${eqStart}–${eqEnd} по Калининграду</div>${bits.length ? `<div class="tiny" style="margin-top:2px">${bits.join(', ')}</div>` : ''}`;
}

// datetime-local <-> ISO, для редактируемой даты записей журнала.
function toDatetimeLocalValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Вытаскивает строку "Скиллсет: <url>" из заметок, возвращает ссылку и остаток текста отдельно.


function renderLinkedText(value) {
  const escaped = escapeHtml(String(value || ''));
  return escaped.replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
    const clean = url.replace(/[),.;!?]+$/g, '');
    const suffix = url.slice(clean.length);
    return `<a class="inline-text-link" href="${clean}" target="_blank" rel="noopener noreferrer" data-stop-propagation="1">${clean}</a>${suffix}`;
  }).replace(/\r?\n/g, '<br>');
}

