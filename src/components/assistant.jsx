import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, FileText,
  FolderOpen, Handshake, Leaf, Lightbulb, Loader2, NotebookPen, Plus, Search, Sparkles, Sprout, TreePine,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from '@/components/ui';
import { MentionEditor, MentionText, mentionStorageToPlainText, mentionStorageToQueryText } from '@/components/mention-editor';
import { PeopleField } from '@/components/people-field';
import { AgreementStatusIcon, IssueStatusIcon, ProcessStatusIcon, TaskStatusIcon } from '@/components/status';
import { TaskEntityRow, EntityRow, TaskPriorityIcon } from '@/components/entity-row';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { cn, escapeRe, formatEventDate, norm, teamAvailability, titleOf } from '@/lib/utils';
import { isTeamlead, LAB_VISIBILITY_LABEL, MEETING_TYPE_LABEL, normalizeMeetingType } from '@/lib/domain';

function WaveCrestIcon({ className, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 14.5c1.4-3.8 4.1-6.2 7.6-6.2 2.5 0 4.8 1.2 6.9 3.6 1.1 1.2 2.3 2 3.5 2.6" />
      <path d="M10.7 8.3c.2 2.4-.6 4.4-2.4 6.1 2.8-.5 5 .2 6.6 2" />
      <path d="M15.6 17.1c1.7.1 3.2-.3 4.4-1.3" />
    </svg>
  );
}

const GREETING_ICONS = [Leaf, TreePine, Sprout, WaveCrestIcon];

const GREETING_ICON_STORAGE_KEY = 'garden.smartGreetingIconIndex';
function initialGreetingIconIndex() {
  try {
    const value = Number(localStorage.getItem(GREETING_ICON_STORAGE_KEY));
    return Number.isInteger(value) && value >= 0 ? value % GREETING_ICONS.length : 0;
  } catch { return 0; }
}

const QUICK_INPUTS = [
  { label: 'Создай', value: 'Создай ', icon: Plus },
  { label: 'Открой', value: 'Открой ', icon: FolderOpen },
  { label: 'Покажи мои', value: 'Покажи мои ', icon: Search },
  { label: 'Запиши в журнал', value: 'Запиши в журнал: ', icon: NotebookPen },
];

const SECTION_TARGETS = [
  ['задачи', '/tasks'], ['проекты', '/projects'], ['загрузка', '/team-load'], ['загрузка команды', '/team-load'], ['команда', '/team'], ['сотрудники', '/team'], ['люди', '/team'], ['стейкхолдеры', '/stakeholders'], ['стейкхолдер', '/stakeholders'],
  ['встречи', '/meetings'], ['календарь', '/calendar'], ['база знаний', '/knowledge'], ['журнал', '/journal'],
  ['цели', '/goals'], ['проблемы', '/issues'], ['договоренности', '/agreements'], ['договорённости', '/agreements'],
  ['weekly', '/weekly'], ['викли', '/weekly'], ['виклик', '/weekly'], ['дейли', '/weekly'], ['дейлик', '/weekly'], ['check-in', '/weekly'], ['чек-ин', '/weekly'], ['мастерская', '/workshop'], ['the labs', '/workshop'],
  ['идеи', '/ideas'], ['документы', '/knowledge'], ['инструменты', '/tools'], ['процессы', '/processes'],
  ['план мероприятий', '/technology'], ['мероприятия', '/technology'], ['технологизация', '/technology'], ['ассистент', '/'], ['обзор', '/'],
];

const SUGGEST_LIMIT = 6;
const INPUT_PLACEHOLDERS = ['Что нужно сделать?', 'С чего начнём?'];
const OPEN_PREFIXES = ['открой мне','открой','открыть','перейди в','перейди на','перейти в','перейти на','переключись на','зайди в','зайти в','запусти','отправься в','перейди к','проведи к','покажи раздел'].sort((a,b)=>b.length-a.length);
const PERSON_PREFIXES = ['как дела у','как там у','как там','что с','что у','чем занят','чем занята','чем занимается','расскажи про','расскажи о','статус','сводка по','сводку по','как успехи у','что нового у','как обстановка у','подскажи как дела у','расскажи как дела у','опиши ситуацию у','покажи статус','дай статус по','резюмируй работу','оцени загрузку','проверь дела у','объясни что у','собери сводку по','выдели главное по','назови главное по'];
const PROJECT_PREFIXES = ['как дела на','как дела в','как дела с проектом','что с проектом','что на проекте','обзор проекта','как проект'];
const CREATE_PREFIXES = ['создай что-то:','создай что-то','создай мне','создай','создать','создайте','добавь мне','добавь','добавить','добавьте','заведи','завести','поставь','поставить','назначь','назначить','оформи','оформить','зафиксируй','зафиксировать','запланируй','запланировать','запиши','записать','сделай','сделать','подготовь','организуй','зарегистрируй','внеси','сформируй','новая','новый','новое','новую'];
const SHOW_PREFIXES = ['покажи мне','покажи','показать','найди мне','найди','найти','выведи','отобрази','перечисли','подбери','отфильтруй','поищи','отыщи','дай список','проверь','список'];
const MINE_PREFIXES = ['покажи мои','покажи все мои','мои','моя','мой','мне'];
const PERSON_SLOT_MARKERS = ['для','исполнитель','ответственный','назначь на','участник','участники','вместе с','со','с','у','про'];
const PROJECT_SLOT_MARKERS = ['по проекту','в проекте','на проекте','проекту','проекте','проект'];
const CREATE_TYPES = [
  {insert:'задачу ',label:'задачу',meta:'новая задача'}, {insert:'встречу ',label:'встречу',meta:'новая встреча'},
  {insert:'проблему ',label:'проблему',meta:'новая проблема'}, {insert:'договорённость ',label:'договорённость',meta:'новая договорённость'},
  {insert:'идею ',label:'идею',meta:'новая идея'}, {insert:'запись в журнал ',label:'запись в журнал',meta:'новая запись'},
];
const SCHEDULE_TYPES = [
  {insert:'1:1 ',label:'1:1',meta:'личная встреча'}, {insert:'PR ',label:'PR',meta:'performance review'}, {insert:'встречу ',label:'встречу',meta:'новая встреча'},
];
const SECTION_SUGGESTIONS = [
  ['задачи','Задачи','/tasks'],['проекты','Проекты','/projects'],['команда','Команда','/team'],['встречи','Встречи','/meetings'],['календарь','Календарь','/calendar'],
  ['база знаний','База знаний','/knowledge'],['заметки','Журнал','/journal'],['журнал','Журнал','/journal'],['цели','Цели','/goals'],['проблемы','Проблемы','/issues'],
  ['договоренности','Договорённости','/agreements'],['договорённости','Договорённости','/agreements'],['weekly','Weekly','/weekly'],['check-in','Weekly','/weekly'],
  ['мастерская','Мастерская','/workshop'],['идеи','Идеи','/ideas'],['документы','База знаний','/knowledge'],['инструменты','Инструменты','/tools'],['процессы','Процессы','/processes'],['загрузка','Загрузка','/team-load'],
].map(([insert,label,route])=>({insert,label,route}));
const MINE_TARGETS = ['задачи','встречи','проблемы','договорённости','идеи','записи журнала','проекты','цели','weekly'].map((insert)=>({insert,label:insert}));
const SHOW_TARGETS = [
  ['мои задачи','мои задачи'],['просроченные задачи','просроченные задачи'],['задачи на сегодня','задачи на сегодня'],['встречи без итогов','встречи без итогов'],
  ['ближайшие 1:1','ближайшие 1:1'],['открытые проблемы','открытые проблемы'],['открытые договоренности','открытые договорённости'],['идеи','идеи'],
  ['weekly с блокерами','weekly с блокерами'],['процессы с проблемами','процессы с проблемами'],['отпуска','отпуска и отсутствия'],
].map(([insert,label])=>({insert,label}));

const TASK_STATUS = { todo: 'Новая', in_progress: 'В работе', in_review: 'На ревью', paused: 'Приостановлено', blocked: 'Заблокировано', done: 'Готово', archived: 'Архив' };
const ISSUE_STATUS = { open: 'Новая', in_progress: 'В работе', paused: 'Отложена', resolved: 'Решена' };
const AGREEMENT_STATUS = { open: 'Открыта', done: 'Выполнена' };

function assistantFooterLabel(label) {
  const value = String(label || 'Открыть');
  return value;
}
function pluralDays(n) {
  const mod10 = n % 10; const mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней';
}
function daysFromToday(value) {
  const source = String(value || '');
  const d = new Date(source.length === 10 ? `${source}T12:00:00` : source);
  if (!source || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const start = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((start(d) - start(now)) / 86400000);
}
// Ближайшая неделя — относительно; просроченный срок задачи всегда показываем
// в едином формате «X дн. назад». Точная дата остаётся доступна в подсказке.
function formatAssistantDate(value, { includeTime = true, overdue = false } = {}) {
  const absolute = formatEventDate(value, { includeTime, short: true });
  const diff = daysFromToday(value);
  if (diff == null) return absolute;
  const full = formatEventDate(value, { includeTime, short: false });
  const time = includeTime && absolute.includes(', ') ? absolute.slice(absolute.indexOf(', ')) : '';
  let label = absolute;
  if (overdue && diff < 0) label = `${-diff} дн. назад`;
  else if (diff >= 2 && diff <= 6) label = `через ${diff} ${pluralDays(diff)}${time}`;
  else if (diff <= -2 && diff >= -6) label = `${-diff} ${pluralDays(-diff)} назад`;
  return label === absolute ? absolute : <time dateTime={String(value)} title={full}>{label}</time>;
}

const ABSENCE_TYPE_LABELS = { vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Отгул' };
function absenceReasonLabel(item) {
  const base = ABSENCE_TYPE_LABELS[item?.absenceType || item?.type] || 'Отсутствие';
  const note = String(item?.note || '').trim();
  return note ? `${base} · ${note}` : base;
}
function formatAssistantPeriod(start, end) {
  if (!start) return '';
  const startLabel = formatEventDate(start, { includeTime: false, short: true });
  const effectiveEnd = end || start;
  const endLabel = formatEventDate(effectiveEnd, { includeTime: false, short: true });
  return effectiveEnd && String(effectiveEnd).slice(0, 10) !== String(start).slice(0, 10)
    ? `${startLabel} — ${endLabel}`
    : startLabel;
}
export function assistantSectionRoute(value) {
  const q = norm(value);
  const found = SECTION_TARGETS.find(([label]) => norm(label) === q);
  return found?.[1] || null;
}

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 11) return 'Начни с главного';
  if (hour >= 11 && hour < 16) return 'Спокойно, всё по порядку';
  if (hour >= 16 && hour < 20) return 'Пусть оставшееся будет лёгким';
  return 'Оставь себе понятное завтра';
}

function openResultItem(item, group, navigate) {
  const open = item?.open || {};
  if (open.route) { navigate(open.route); return; }
  if (open.href) { window.open(open.href, '_blank', 'noopener,noreferrer'); return; }
  if (open.command === 'openTaskModal' || item?.entityType === 'task' || group === 'tasks') { navigate(`/tasks/${encodeURIComponent(open.arg || item.taskKey || item.entityId || item.id)}`); return; }
  if (open.command === 'openIssueModal' || item?.entityType === 'issue' || group === 'issues') { navigate(`/issues/${encodeURIComponent(open.arg || item.issueKey || item.entityId || item.id)}`); return; }
  if (open.command === 'openAgreementModal' || item?.entityType === 'agreement' || group === 'agreements') { navigate(`/agreements/${encodeURIComponent(open.arg || item.agreementKey || item.entityId || item.id)}`); return; }
  if (group === 'meetings') { navigate(`/meetings/${encodeURIComponent(item.meetingKey || item.entityId || item.id)}`); return; }
  if (group === 'people') { const person = item.person || item; const ref = person.slug || person.id || item.entityId; if (ref) navigate(`/people/${encodeURIComponent(ref)}`); return; }
  if (group === 'projects') { navigate(`/projects/${encodeURIComponent(item.projectKey || item.entityId || item.id)}`); return; }
  if (group === 'goals') { if (item.goalKey) navigate(`/goals/${encodeURIComponent(item.goalKey)}`); return; }
  if (group === 'journal') { navigate(`/journal?entry=${encodeURIComponent(item.noteKey || item.entityId || item.id)}`); return; }
  if (group === 'labs') { navigate(item.entityType === 'idea' ? '/ideas' : `/workshop/${encodeURIComponent(item.blueprintKey || item.entityId || item.id)}`); return; }
  if (group === 'checkins') { navigate(`/weekly${item.personId ? `?person=${encodeURIComponent(item.personId)}` : ''}`); return; }
  if (group === 'processes') { navigate(`/processes/${encodeURIComponent(item.processKey || item.entityId || item.id)}`); return; }
  if (group === 'tools') { navigate(`/tools/${encodeURIComponent(item.toolKey || item.entityId || item.id)}`); return; }
  const fallback = { documents:'/knowledge', vacations:'/calendar' }[group];
  if (fallback) navigate(fallback);
}

function matchPrefix(value, prefixes) {
  const normalized = norm(value);
  return prefixes.find((prefix) => normalized === norm(prefix) || normalized.startsWith(`${norm(prefix)} `)) || null;
}
function filterByTail(items, tail, getText) {
  const needle = norm(tail);
  return items.filter((item) => !needle || norm(getText(item)).includes(needle)).slice(0, SUGGEST_LIMIT);
}
function suggestionPeople(people) { return (people || []).filter((person)=>person?.type==='team' && !['dismissed','transferred'].includes(person?.status)); }
function slotAt(value) {
  const normalized = String(value || '').toLowerCase().replace(/ё/g,'е');
  let best=null;
  const scan=(markers,kind)=>markers.forEach((marker)=>{
    const match=normalized.match(new RegExp(`(^|\\s)${escapeRe(marker)}(?:\\s+(?:\\S+\\s*){0,2})?$`,'i'));
    if(!match)return;
    const markerEnd=match.index+match[1].length+marker.length;
    if(!best||markerEnd>best.markerEnd) best={kind,markerEnd,tail:value.slice(markerEnd).trimStart()};
  });
  scan(PROJECT_SLOT_MARKERS,'project'); scan(PERSON_SLOT_MARKERS,'person'); return best;
}
const BARE_PREPOSITIONS=new Set(['в','во','на','по','про','о','об','обо','с','со','у','к','ко','для','из','от','до','за','над','под','при','через','без']);
function endsWithBarePreposition(value){ const raw=String(value||''); if(!raw.trim()||/\s$/.test(raw))return false; return BARE_PREPOSITIONS.has(norm(raw).split(/\s+/).pop()); }
export function assistantSuggestions(query, people, projects) {
  const value=String(query||''); if(!value.trim()) return [];
  const teamPeople=suggestionPeople(people);

  const at=value.match(/(^|\s)@([^@,;]*)$/u);
  if(at){
    const tail=at[2].trim(); const start=at.index+at[1].length; const before=value.slice(0,start);
    const persons=filterByTail(teamPeople,tail,(p)=>p.name).map((person)=>({label:person.name,meta:person.role||'Сотрудник',person,mention:{kind:'person',id:person.id,name:person.name},insert:`${before}@${person.name} `,submit:false}));
    const projectItems=filterByTail(projects||[],tail,(p)=>p.name).map((project)=>({label:project.name,meta:'Проект',kind:'project',project,mention:{kind:'project',id:project.id,name:project.name},insert:`${before}@${project.name} `,submit:false}));
    return [...persons,...projectItems].slice(0,SUGGEST_LIMIT);
  }
  if(endsWithBarePreposition(value)) return [];

  const needle=norm(value);
  if(needle.length>=3){
    const sections=SECTION_SUGGESTIONS.filter((item)=>norm(item.label).startsWith(needle)||norm(item.insert).startsWith(needle));
    if(sections.length) return sections.slice(0,SUGGEST_LIMIT).map((item)=>({label:item.label,meta:'раздел',insert:item.label,submit:true}));
  }

  const immediate=slotAt(value);
  if(immediate?.kind==='project'){
    const head=value.slice(0,immediate.markerEnd); const inside=Boolean(matchPrefix(value,CREATE_PREFIXES));
    const items=filterByTail(projects||[],immediate.tail,(p)=>p.name);
    if(items.length) return items.map((project)=>({label:project.name,meta:project.status==='active'?'Активный проект':'Проект',kind:'project',insert:`${head} ${project.name} `,submit:!inside}));
  }

  const personPrefix=matchPrefix(value,PERSON_PREFIXES);
  if(personPrefix){
    const head=value.slice(0,personPrefix.length); const rest=value.slice(personPrefix.length).trimStart();
    const result=[]; if(!rest||norm('Команда').includes(norm(rest))) result.push({label:'Команда',meta:'Вся команда',insert:`${head} команды`,submit:true});
    result.push(...filterByTail(teamPeople,rest,(p)=>p.name).map((person)=>({label:person.name,meta:person.role||'Сотрудник',person,insert:`${head} ${person.name}`,submit:true})));
    return result.slice(0,SUGGEST_LIMIT);
  }
  const projectPrefix=matchPrefix(value,PROJECT_PREFIXES);
  if(projectPrefix){ const head=value.slice(0,projectPrefix.length); const rest=value.slice(projectPrefix.length).trimStart(); return filterByTail(projects||[],rest,(p)=>p.name).map((project)=>({label:project.name,meta:project.status==='active'?'Активный проект':'Проект',kind:'project',insert:`${head} проекте ${project.name}`,submit:true})); }

  const slot=slotAt(value);
  if(slot){ const inside=Boolean(matchPrefix(value,CREATE_PREFIXES)); const head=value.slice(0,slot.markerEnd);
    if(slot.kind==='person'){ const items=filterByTail(teamPeople,slot.tail,(p)=>p.name); if(items.length)return items.map((person)=>({label:person.name,meta:person.role||'Сотрудник',person,insert:`${head} ${person.name} `,submit:!inside})); }
    else { const items=filterByTail(projects||[],slot.tail,(p)=>p.name); if(items.length)return items.map((project)=>({label:project.name,meta:project.status==='active'?'Активный проект':'Проект',kind:'project',insert:`${head} ${project.name} `,submit:!inside})); }
  }

  const createPrefix=matchPrefix(value,CREATE_PREFIXES);
  if(createPrefix){
    const head=value.slice(0,createPrefix.length);
    const rest=value.slice(createPrefix.length).trimStart();
    const typed=norm(rest);
    const types=norm(createPrefix).startsWith('запланир')?SCHEDULE_TYPES:CREATE_TYPES;
    const isCreateQuickAction=norm(createPrefix)==='создай';
    const typeMatchesInput=(type)=>{
      const base=norm(type.insert).trim();
      return !typed || base.startsWith(typed) || typed===base || typed.startsWith(`${base} `) || typed.startsWith(`${base}:`);
    };
    const matched=types.filter(typeMatchesInput);
    if(typed&&matched.some((type)=>{
      const base=norm(type.insert).trim();
      return typed===base || typed.startsWith(`${base} `) || typed.startsWith(`${base}:`);
    })) return [];
    return matched.slice(0,SUGGEST_LIMIT).map((type)=>({
      label:type.label,
      meta:type.meta,
      insert:isCreateQuickAction ? `${head} ${type.insert.trim()}: ` : `${head} ${type.insert}`,
      submit:false,
    }));
  }
  const openPrefix=matchPrefix(value,OPEN_PREFIXES);
  if(openPrefix){
    const head=value.slice(0,openPrefix.length); const rest=value.slice(openPrefix.length).trimStart();
    const sections=filterByTail(SECTION_SUGGESTIONS,rest,(i)=>i.label).map((item)=>({label:item.label,meta:'раздел',insert:`${head} ${item.insert}`,submit:true}));
    const persons=filterByTail(teamPeople,rest,(p)=>p.name).slice(0,3).map((person)=>({label:person.name,meta:'профиль сотрудника',person,insert:`${head} ${person.name}`,submit:true}));
    const projectItems=filterByTail(projects||[],rest,(p)=>p.name).slice(0,3).map((project)=>({label:project.name,meta:'проект',kind:'project',insert:`${head} ${project.name}`,submit:true}));
    return [...sections,...persons,...projectItems].slice(0,SUGGEST_LIMIT);
  }
  const minePrefix=matchPrefix(value,MINE_PREFIXES);
  if(minePrefix){ const head=value.slice(0,minePrefix.length); const rest=value.slice(minePrefix.length).trimStart(); const exact=MINE_TARGETS.find((i)=>norm(i.insert)===norm(rest)); if(exact)return[{label:exact.label,meta:'только моё',insert:`${head} ${exact.insert}`,submit:true}]; return filterByTail(MINE_TARGETS,rest,(i)=>i.label).map((item)=>({label:item.label,meta:'только моё',insert:`${head} ${item.insert}`,submit:true})); }
  const showPrefix=matchPrefix(value,SHOW_PREFIXES);
  if(showPrefix){ const head=value.slice(0,showPrefix.length); const rest=value.slice(showPrefix.length).trimStart();
    const targets=filterByTail(SHOW_TARGETS,rest,(i)=>i.label).map((item)=>({label:item.label,meta:'тип элементов',insert:`${head} ${item.insert}`,submit:true}));
    const persons=filterByTail(teamPeople,rest,(p)=>p.name).map((person)=>({label:person.name,meta:person.role||'Сотрудник',person,insert:`${head} задачи ${person.name}`,submit:true}));
    const projectItems=filterByTail(projects||[],rest,(p)=>p.name).map((project)=>({label:project.name,meta:'Проект',kind:'project',insert:`${head} задачи по проекту ${project.name}`,submit:true}));
    return [...targets,...persons,...projectItems].slice(0,SUGGEST_LIMIT);
  }
  return [];
}

// Ассистент принимает упоминания как обычный текст «@Имя» (см. assistantSuggestions).
// Чтобы они не терялись при переносе в заметки/договорённости/задачи — единственные
// места, что умеют рендерить `@[Имя](kind:id)` — распознанные «@Имя» превращаем в это
// хранимое представление по тем же людям/проектам, что видел составитель запроса.
function mentionMarkupFor(value, people, projects) {
  const source = String(value || '');
  if (!source.includes('@')) return source;
  const entities = [
    ...(people || []).filter((item) => item?.id && item?.name).map((item) => ({ name: item.name, kind: item.type === 'stakeholder' ? 'stakeholder' : 'person', id: item.id })),
    ...(projects || []).filter((item) => item?.id && item?.name).map((item) => ({ name: item.name, kind: 'project', id: item.id })),
  ].sort((a, b) => b.name.length - a.name.length);
  const lower = source.toLowerCase().replace(/ё/g, 'е');
  const ranges = [];
  for (const entity of entities) {
    const needle = entity.name.toLowerCase().replace(/ё/g, 'е');
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      from = at + needle.length;
      if (at === 0 || source[at - 1] !== '@') continue;
      const right = lower[at + needle.length] || '';
      if (right && !/[\s,;:.!?()\[\]—–-]/.test(right)) continue;
      if (ranges.some((range) => at - 1 < range.end && at + needle.length > range.start)) continue;
      ranges.push({ start: at - 1, end: at + needle.length, entity });
    }
  }
  if (!ranges.length) return source;
  ranges.sort((a, b) => a.start - b.start);
  let out = ''; let pos = 0;
  for (const range of ranges) {
    if (range.start < pos) continue;
    out += source.slice(pos, range.start);
    out += `@[${range.entity.name}](${range.entity.kind}:${range.entity.id})`;
    pos = range.end;
  }
  out += source.slice(pos);
  return out;
}

function navigationFromSearch(parsed) {
  const command = parsed?.command;
  if (!command || String(command.textRemainder || '').trim()) return null;
  if (command.group === 'labs') {
    const type = parsed?.nlu?.filters?.labEntityType || command.labEntityType;
    return type === 'idea' ? '/ideas' : '/workshop';
  }
  if (command.group !== 'tasks') return null;
  const params = new URLSearchParams();
  if (command.taskType === 'development') params.set('type', 'development');
  else if (command.taskType === 'standard') params.delete('type');
  if (command.selfRequested) params.set('mine', '1');
  else if (command.person?.id) params.set('person', command.person.id);
  if (command.project?.id) params.set('project', command.project.id);
  const statusMap = { todo:'todo', in_progress:'in_progress', in_review:'in_review', blocked:'blocked', paused:'paused', done:'done', archived:'archived' };
  const modifiers = command.modifiers || [];
  const unsupported = modifiers.filter((modifier) => !(modifier in statusMap) && !['overdue','today','tomorrow','important'].includes(modifier));
  if (unsupported.length) return null;
  const status = modifiers.map((modifier) => statusMap[modifier]).find(Boolean);
  if (status) params.set('status', status);
  if (modifiers.some((modifier) => ['overdue','today','tomorrow'].includes(modifier))) return null;
  if (modifiers.includes('important')) params.set('important', '1');
  return `/tasks${params.toString() ? `?${params}` : ''}`;
}

function AssistantCreateDialog({ spec, user, people, projects, labs, open, onOpenChange, onSaved }) {
  const target = spec?.target;
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({});

  React.useEffect(() => {
    if (!open || !spec) return;
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      title: target === 'tasks' ? mentionMarkupFor(spec.title || '', people, [])
        : target === 'issues' ? mentionMarkupFor(spec.title || '', people, projects)
        : (spec.title || ''),
      text: target === 'agreements'
        ? [spec.assignee?.id ? `@[${spec.assignee.name}](person:${spec.assignee.id})` : null, mentionMarkupFor(spec.title || '', people, projects)].filter(Boolean).join(' ').trim()
        : (spec.title || ''),
      description: '',
      assigneeId: spec.assignee?.id || 'none', projectId: spec.project?.id || 'none',
      dueDate: spec.dueDate || '', date: spec.dueDate || today, priority: spec.priority || 'normal',
      taskType: spec.taskType || 'standard', type: spec.meetingType || 'other', severity: spec.priority === 'high' ? 'high' : 'normal',
      status: target === 'issues' ? 'open' : target === 'agreements' ? 'open' : target === 'idea' ? 'idea' : '',
      participantIds: spec.assignee?.id ? [spec.assignee.id] : [], relatedPersonIds: spec.assignee?.id ? [spec.assignee.id] : [],
      authorId: user?.personId || 'none', visibility: 'team', labProjectId: spec.project?.id || 'none',
    });
  }, [open, spec, user, target]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      let saved;
      if (target === 'tasks') {
        saved = await api.resource('tasks').create({
          title: form.title.trim(), status: 'todo', priority: form.priority || 'normal', taskType: form.taskType || 'standard',
          assigneeIds: form.assigneeId === 'none' ? [] : [form.assigneeId], projectId: form.projectId === 'none' ? null : form.projectId, dueDate: form.dueDate || null,
        });
        const actual = saved?.copies?.[0] || saved;
        onSaved?.(actual, { route: `/tasks/${encodeURIComponent(actual.taskKey || actual.id)}`, label: 'Открыть задачу' });
      } else if (target === 'meetings') {
        saved = await api.resource('meetings').create({
          type: form.type || 'other', date: form.date || new Date().toISOString().slice(0, 10), title: form.title.trim() || 'Встреча',
          projectId: form.projectId === 'none' ? null : form.projectId, participantIds: form.participantIds || [], notes:'', actionItems:[], prepNotes:'', documentLinks:[],
        });
        onSaved?.(saved, { route: `/meetings/${encodeURIComponent(saved.meetingKey || saved.id)}`, label: 'Открыть встречу' });
      } else if (target === 'issues') {
        saved = await api.resource('issues').create({
          title: form.title.trim(), description: form.description.trim(), projectId: form.projectId === 'none' ? null : form.projectId,
          goalKey: null, severity: form.severity || 'normal', status: form.status || 'open', relatedPersonIds: form.relatedPersonIds || [], solutionOptions: [],
        });
        onSaved?.(saved, { route: `/issues/${encodeURIComponent(saved.issueKey || saved.id)}`, label: 'Открыть проблему' });
      } else if (target === 'agreements') {
        const mentionIds = [...String(form.text || '').matchAll(/@\[[^\]]+\]\(person:([^\)]+)\)/g)].map((match) => match[1]);
        saved = await api.resource('agreements').create({
          text: form.text.trim(), date: new Date().toISOString().slice(0, 10), dueDate: form.dueDate || null,
          projectId: form.projectId === 'none' ? null : form.projectId, status: form.status || 'open', withPersonIds: mentionIds,
        });
        onSaved?.(saved, { route: `/agreements/${encodeURIComponent(saved.agreementKey || saved.id)}`, label: 'Открыть договорённость' });
      } else if (target === 'idea') {
        saved = await api.resource('labs').create({
          entityType:'idea', title: form.title.trim() || form.description.trim().slice(0, 80), description: form.description.trim(),
          visibility: form.visibility || 'team', authorId: form.authorId === 'none' ? user?.personId || null : form.authorId,
          status: form.status || 'idea', labProjectId: form.labProjectId === 'none' ? null : form.labProjectId,
        });
        onSaved?.(saved, { route: '/ideas', label: 'Открыть идеи' });
      }
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  const title = { tasks:'Новая задача', meetings:'Новая встреча', issues:'Новая проблема', agreements:'Новая договорённость', idea:'Новая идея' }[target] || 'Создать';
  const valid = target === 'agreements' ? Boolean(form.text?.trim()) : target === 'idea' ? Boolean(form.title?.trim() || form.description?.trim()) : target === 'meetings' ? true : Boolean(form.title?.trim());
  const workshopProjects = labs.filter((item) => item.entityType !== 'idea');

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><form onSubmit={save}>
    <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <div className="mt-5 space-y-4">
      {target === 'tasks' && <>
        <Field label="Название"><MentionEditor autoFocus value={form.title || ''} onChange={(value) => set('title', value)} people={people} projects={[]} singleLine ariaLabel="Название задачи"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Исполнитель"><Select value={form.assigneeId || 'none'} onValueChange={(value) => set('assigneeId', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не назначен</SelectItem>{people.filter((p) => p.type === 'team').map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Проект"><ProjectSelect value={form.projectId} onChange={(value) => set('projectId', value)} projects={projects}/></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Срок"><Input type="date" value={form.dueDate || ''} onChange={(event) => set('dueDate', event.target.value)}/></Field><Field label="Приоритет"><Select value={form.priority || 'normal'} onValueChange={(value) => set('priority', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="normal">Обычный</SelectItem><SelectItem value="high">Высокий</SelectItem></SelectContent></Select></Field></div>
      </>}
      {target === 'meetings' && <>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Тип"><Select value={form.type || 'other'} onValueChange={(value) => set('type', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1:1">1:1</SelectItem><SelectItem value="pr">PR</SelectItem><SelectItem value="other">Другое</SelectItem></SelectContent></Select></Field><Field label="Дата"><Input type="date" value={form.date || ''} onChange={(event) => set('date', event.target.value)}/></Field></div>
        <Field label="Название"><Input autoFocus value={form.title || ''} onChange={(event) => set('title', event.target.value)}/></Field>
        {!['1:1','pr'].includes(form.type) && <Field label="Проект"><ProjectSelect value={form.projectId} onChange={(value) => set('projectId', value)} projects={projects}/></Field>}
        <PeopleField label="Участники" people={people} value={form.participantIds || []} onChange={(ids) => set('participantIds', ids)}/>
      </>}
      {target === 'issues' && <>
        <Field label="Название"><MentionEditor autoFocus value={form.title || ''} onChange={(value) => set('title', value)} people={people} projects={projects} singleLine ariaLabel="Название проблемы"/></Field>
        <Field label="Описание"><MentionEditor value={form.description || ''} onChange={(value) => set('description', value)} people={people} projects={projects} ariaLabel="Описание"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Проект"><ProjectSelect value={form.projectId} onChange={(value) => set('projectId', value)} projects={projects}/></Field><Field label="Важность"><Select value={form.severity || 'normal'} onValueChange={(value) => set('severity', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="low">Низкая</SelectItem><SelectItem value="normal">Обычная</SelectItem><SelectItem value="high">Высокая</SelectItem></SelectContent></Select></Field></div>
        <PeopleField label="Причастные люди" people={people} value={form.relatedPersonIds || []} onChange={(ids) => set('relatedPersonIds', ids)}/>
      </>}
      {target === 'agreements' && <>
        <Field label="О чём договорились"><MentionEditor value={form.text || ''} onChange={(value) => set('text', value)} people={people} projects={projects} autoFocus placeholder="Наберите @ для упоминания человека или проекта"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Срок"><Input type="date" value={form.dueDate || ''} onChange={(event) => set('dueDate', event.target.value)}/></Field><Field label="Проект"><ProjectSelect value={form.projectId} onChange={(value) => set('projectId', value)} projects={projects}/></Field></div>
      </>}
      {target === 'idea' && <>
        <Field label="Название"><Input autoFocus value={form.title || ''} onChange={(event) => set('title', event.target.value)}/></Field>
        <Field label="Описание"><MentionEditor value={form.description || ''} onChange={(value) => set('description', value)} people={people} projects={projects} editorClassName="min-h-[130px]" ariaLabel="Описание"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Автор"><Select value={form.authorId || 'none'} onValueChange={(value) => set('authorId', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{people.filter((p) => p.type === 'team').map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Проект Мастерской"><Select value={form.labProjectId || 'none'} onValueChange={(value) => set('labProjectId', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem>{workshopProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></Field></div>
        <Field label="Видимость"><Select value={form.visibility || 'team'} onValueChange={(value) => set('visibility', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(LAB_VISIBILITY_LABEL).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
      </>}
    </div>
    <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={busy || !valid}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Создать</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function Field({ label, children }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function ProjectSelect({ value, onChange, projects }) { return <Select value={value || 'none'} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>; }

function InlineStatus({ item, onChanged }) {
  if (item.entityType === 'task' && item.entityId) return <TaskStatusIcon taskId={item.entityId} status={item.status || 'todo'} onChanged={onChanged}/>;
  if (item.entityType === 'issue' && item.entityId) return <IssueStatusIcon issueId={item.entityId} status={item.status || 'open'} onChanged={onChanged}/>;
  if (item.entityType === 'agreement' && item.entityId) return <AgreementStatusIcon agreementId={item.entityId} status={item.status || 'open'} onChanged={onChanged}/>;
  if (item.entityType === 'process' && item.entityId) return <ProcessStatusIcon processId={item.entityId} status={item.status || 'ok'} onChanged={onChanged}/>;
  return null;
}

function AssistantTaskRow({ item, navigate, onRefresh, people = [] }) {
  const open = () => openResultItem(item, 'tasks', navigate);
  return <TaskEntityRow
    task={{ id:item.entityId, entityId:item.entityId, status:item.status || 'todo', priority:item.priority, title:item.title || 'Без названия', dueDate:null }}
    dueLabel={formatAssistantDate(item.date, { overdue: item.tone === 'danger' })}
    overdue={item.tone === 'danger'}
    projectName={item.projectName}
    assigneePerson={people.find((person) => person.id === item.assigneeId) || people.find((person) => person.name === item.assigneeName) || null}
    assigneeName={item.assigneeName}
    onStatusChanged={onRefresh}
    onOpen={open}
  />;
}

function AssistantRow({ item, group, navigate, onRefresh, layout, people = [], projects = [] }) {
  const isTask = item.entityType === 'task' && item.entityId;
  if (isTask) return <AssistantTaskRow item={item} navigate={navigate} onRefresh={onRefresh} people={people}/>;
  const hasEntityStatus = ['issue','agreement','process'].includes(item.entityType) && item.entityId;
  const open = () => openResultItem(item, group, navigate);
  const mentionNavigate = (kind, id) => navigate(kind === 'project' ? `/projects/${encodeURIComponent(id)}` : `/people/${encodeURIComponent(id)}`);
  const secondaryMeta = item.entityType === 'vacation' || group === 'vacations'
    ? [absenceReasonLabel(item), formatAssistantPeriod(item.date || item.startDate, item.dateEnd || item.endDate)].filter(Boolean)
    : group === 'journal'
      ? [formatAssistantDate(item.date, { includeTime: false })].filter(Boolean)
      : group === 'meetings'
        ? [item.label, formatAssistantDate(item.date, { includeTime: false })].filter(Boolean)
        : [item.label, item.meta, formatAssistantDate(item.date)].filter(Boolean);
  const isLabeledText = layout === 'labeled-text' && item.label;
  const titleNode = isLabeledText
    ? <span className="assistant-labeled-text"><span className={cn('assistant-labeled-text-label', item.tone === 'warning' && 'is-warning')}>{item.label}</span><MentionText text={item.title || 'Без названия'} onNavigate={mentionNavigate}/></span>
    : item.entityType === 'issue'
    ? <span className="flex min-w-0 items-center gap-2"><TaskPriorityIcon priority={item.severity === 'high' || item.rightLabel === 'Важная' ? 'high' : 'normal'}/><MentionText text={item.title || item.label || 'Без названия'} onNavigate={mentionNavigate}/></span>
    : <MentionText text={item.title || item.label || 'Без названия'} onNavigate={mentionNavigate}/>;
  return <EntityRow
    onOpen={open}
    className={cn(
      item.entityType === 'issue' || item.entityType === 'process' ? 'task-entity-row' : '',
      (group === 'journal' || group === 'checkins') && 'assistant-text-row',
      group === 'journal' && 'assistant-journal-row',
      group === 'checkins' && 'assistant-weekly-row',
    )}
    leading={hasEntityStatus ? <InlineStatus item={item} onChanged={onRefresh}/> : null}
    title={titleNode}
    titleClassName={cn(layout === 'labeled-text' ? 'whitespace-normal' : '', group === 'journal' && 'assistant-journal-title')}
    meta={item.entityType === 'issue' || item.entityType === 'process' || isLabeledText ? [] : secondaryMeta}
    trailing={item.entityType === 'issue' ? null : item.rightLabel ? <Badge variant="warning">{item.rightLabel}</Badge> : null}
  />;
}

const PersonLoadDialog = React.lazy(() => import('@/pages/resources').then((module) => ({ default: module.PersonLoadDialog })));

function DigestResult({ result, navigate, onRefresh, onForget, onSwitch, onProjectsChanged, people = [], projects = [], vacations = [] }) {
  const digest = result.digest || {};
  const resolution = result.resolution;
  const availability = digest.type === 'person' && digest.person ? teamAvailability(digest.person, vacations) : null;
  const [loadPersonId, setLoadPersonId] = React.useState(null);
  const loadPerson = loadPersonId ? people.find((person) => person.id === loadPersonId) || null : null;
  return <div className="assistant-digest">
    <div className="assistant-digest-header flex items-start gap-3">
      {digest.type === 'person' && digest.person
        ? <div className="relative mt-0.5 shrink-0"><Avatar person={digest.person} size="lg"/>{availability?.key === 'active' && <span className="team-person-status-dot is-active" aria-hidden="true"/>}</div>
        : <span className="assistant-digest-icon mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">{digest.type === 'project' ? <FolderOpen className="h-4 w-4"/> : <Leaf className="h-4 w-4"/>}</span>}
      <div className="min-w-0 flex-1">
        <div className="assistant-digest-title">{digest.title}</div>
        {availability && <div className={`assistant-digest-availability is-${availability.key}`}>{availability.label}</div>}
        {digest.subtitle && <div className="mt-1 text-xs leading-5 text-muted-foreground">{digest.subtitle}</div>}
      </div>
      {digest.footer?.route && <Button size="sm" variant="ghost" onClick={() => navigate(digest.footer.route)}>{digest.footer.label}<ArrowRight className="h-3.5 w-3.5"/></Button>}
    </div>
    {digest.type === 'person' && resolution && (resolution.via === 'hint' || Boolean(resolution.alternatives?.length)) && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">Показано для <strong className="text-foreground">{digest.title}</strong>{resolution.alternatives?.length ? <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onSwitch}>Выбрать другого</Button> : null}{resolution.via === 'hint' ? <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onForget}>Забыть выбор</Button> : null}</div>}
    <div className="assistant-digest-sections">{(digest.sections || []).map((section) => <section key={section.title} className="assistant-digest-section assistant-entity-card">
      <div className="assistant-digest-section-header"><h3>{section.title}</h3>{section.count != null && <span className="text-[12px] tabular-nums text-muted-foreground">{section.count}</span>}{section.summary?.action?.command === 'openPersonLoadModal' && <button type="button" onClick={() => setLoadPersonId(section.summary.action.arg || '')} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{section.summary.action.label || 'Изменить загрузку'}</button>}{section.footer?.route && <button onClick={() => navigate(section.footer.route)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{assistantFooterLabel(section.footer.label)}<ChevronRight className="h-3 w-3"/></button>}</div>
      {section.summary?.text && <div className="assistant-digest-summary flex items-center gap-2 text-sm"><span className={cn('min-w-0 flex-1', section.summary.tone && `assistant-load-level is-${section.summary.tone}`)}>{section.summary.text}</span></div>}
      {Array.isArray(section.groups) && section.groups.length ? <div className="assistant-digest-groups">{section.groups.map((group) => <div key={group.title} className="assistant-digest-group"><div className="assistant-digest-group-title">{group.title}</div><div className="assistant-digest-rows">{(group.items || []).map((item, index) => <AssistantRow key={item.entityId || item.id || index} item={item} navigate={navigate} onRefresh={onRefresh} layout={section.layout} people={people} projects={projects}/>)}</div>{group.more > 0 && <div className="assistant-digest-more">Ещё {group.more}</div>}</div>)}</div> : (section.items || []).length ? <div className="assistant-digest-rows">{section.items.map((item, index) => <AssistantRow key={item.entityId || item.id || index} item={item} group={section.layout === 'labeled-text' ? 'checkins' : undefined} navigate={navigate} onRefresh={onRefresh} layout={section.layout} people={people} projects={projects}/>)}</div> : <div className="px-3 py-4 text-xs text-muted-foreground">{section.emptyText || 'Пока ничего нет'}</div>}
      {section.more > 0 && <div className="assistant-digest-more">Ещё {section.more}</div>}
    </section>)}</div>
    {loadPerson && <React.Suspense fallback={null}><PersonLoadDialog open person={loadPerson} projects={projects} onOpenChange={(next) => { if (!next) setLoadPersonId(null); }} onSaved={async () => { await onProjectsChanged?.(); onRefresh(); }}/></React.Suspense>}
  </div>;
}

const SEARCH_GROUP_LABELS = { people:'Люди', tasks:'Задачи', issues:'Проблемы', meetings:'Встречи', agreements:'Договорённости', journal:'Журнал', projects:'Проекты', goals:'Цели', labs:'Мастерская', checkins:'Weekly', processes:'Процессы', vacations:'Отсутствия', links:'Ссылки и материалы', documents:'Документы', tools:'Инструменты' };
const SEARCH_GROUP_MINE_LABELS = { tasks:'Все мои задачи', meetings:'Все мои встречи', issues:'Все мои проблемы', agreements:'Все мои договорённости', journal:'Все мои записи', projects:'Все мои проекты', goals:'Все мои цели', labs:'Все мои идеи и проекты', checkins:'Все мои weekly', processes:'Все мои процессы', vacations:'Все мои отсутствия' };
const SEARCH_GROUP_MINE_QUERY = { tasks:'задачи', meetings:'встречи', issues:'проблемы', agreements:'договорённости', journal:'записи журнала', projects:'проекты', goals:'цели', labs:'идеи', checkins:'weekly', processes:'процессы', vacations:'отпуска' };
const SEARCH_STATUS_LABELS = {
  project: { active:'Активный', paused:'Приостановлен', done:'Завершён', archived:'Архив' },
  goal: { active:'Активная', achieved:'Достигнута', paused:'Приостановлена', archived:'Архив' },
  lab: { idea:'Идея', project:'Проект', active:'Активно', done:'Готово', archived:'Архив' },
};

function SearchStatus({ group, item, onChanged }) {
  const id = item.entityId || item.id;
  if (group === 'tasks') return <TaskStatusIcon taskId={id} status={item.status || 'todo'} onChanged={onChanged}/>;
  if (group === 'issues') return <IssueStatusIcon issueId={id} status={item.status || 'open'} onChanged={onChanged}/>;
  if (group === 'agreements') return <AgreementStatusIcon agreementId={id} status={item.status || 'open'} onChanged={onChanged}/>;
  if (group === 'processes') return <ProcessStatusIcon processId={id} status={item.status || 'ok'} onChanged={onChanged}/>;
  return null;
}

function searchMentionNavigate(navigate, kind, mentionId) {
  navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`);
}

function searchProjectName(item, projects) {
  return item?.projectId ? projects.find((project)=>project.id===item.projectId)?.name : '';
}

function searchPersonName(item, people) {
  const id = item?.personId || item?.authorId || item?.ownerId;
  return id ? people.find((person)=>person.id===id)?.name : '';
}

function richSearchMeta(group, item, people, projects) {
  const projectName = searchProjectName(item, projects);
  if (group === 'meetings') return [MEETING_TYPE_LABEL[normalizeMeetingType(item.type)] || 'Другое', formatAssistantDate(item.date, { includeTime:true })].filter(Boolean);
  if (group === 'agreements') return [item.dueDate ? formatAssistantDate(item.dueDate, { includeTime:false }) : '', projectName].filter(Boolean);
  if (group === 'issues') return [item.severity === 'high' ? 'Высокая важность' : item.severity === 'low' ? 'Низкая важность' : '', projectName].filter(Boolean);
  if (group === 'projects') return [SEARCH_STATUS_LABELS.project[item.status] || item.status].filter(Boolean);
  if (group === 'goals') return [SEARCH_STATUS_LABELS.goal[item.status] || item.status, item.dueDate ? formatAssistantDate(item.dueDate, { includeTime:false }) : ''].filter(Boolean);
  if (group === 'labs') return [SEARCH_STATUS_LABELS.lab[item.entityType] || SEARCH_STATUS_LABELS.lab[item.type] || '', SEARCH_STATUS_LABELS.lab[item.status] || item.status, projectName].filter(Boolean);
  if (group === 'checkins') return [searchPersonName(item, people), item.date ? formatAssistantDate(item.date, { includeTime:false }) : item.createdAt ? formatAssistantDate(item.createdAt, { includeTime:false }) : ''].filter(Boolean);
  if (group === 'journal') return [item.createdAt ? formatAssistantDate(item.createdAt, { includeTime:false }) : ''].filter(Boolean);
  if (group === 'processes') return [projectName].filter(Boolean);
  return [];
}

function SearchResult({ result, navigate, people = [], projects = [] }) {
  const search = result.search || {};
  const selfRequested = Boolean(search.nlu?.filters?.selfRequested || search.command?.selfRequested);
  const groups = Object.entries(search.groups || {}).filter(([, items]) => Array.isArray(items) && items.length);
  const [, forceRefresh] = React.useReducer((value) => value + 1, 0);
  if (!groups.length) return <div className="border-y border-dashed px-5 py-10 text-center"><div className="text-sm font-medium">Ничего не найдено</div><div className="mt-1 text-xs text-muted-foreground">Попробуйте более короткую формулировку.</div></div>;
  return <div className="assistant-search-results assistant-search-card-list">{groups.map(([group, items]) => {
    const mineLabel = selfRequested ? SEARCH_GROUP_MINE_LABELS[group] : null;
    const mineQuery = selfRequested ? SEARCH_GROUP_MINE_QUERY[group] : null;
    return <section key={group} className="assistant-digest-section assistant-entity-card">
      <div className="assistant-digest-section-header"><h3>{SEARCH_GROUP_LABELS[group] || group}</h3><span>{items.length}</span></div>
      <div className="assistant-digest-rows">{items.slice(0, 6).map((item, index) => {
        const open=()=>openResultItem(item, group, navigate);
        if (group === 'tasks') return <TaskEntityRow key={item.id || index} task={item} person={(id)=>people.find((person)=>person.id===id)} project={(id)=>projects.find((project)=>project.id===id)} onStatusChanged={forceRefresh} onOpen={open}/>;
        if (group === 'issues') return <EntityRow key={item.id || index} className="task-entity-row" onOpen={open} leading={<SearchStatus group={group} item={item} onChanged={forceRefresh}/>} title={<span className="flex min-w-0 items-center gap-2"><TaskPriorityIcon priority={item.severity === 'high' ? 'high' : 'normal'}/><span className="min-w-0 truncate"><MentionText text={titleOf(item)} onNavigate={(kind, mentionId)=>searchMentionNavigate(navigate, kind, mentionId)}/></span></span>} meta={selfRequested ? richSearchMeta(group,item,people,projects) : []}/>;
        if (group === 'processes') return <EntityRow key={item.id || index} className="task-entity-row" onOpen={open} leading={<SearchStatus group={group} item={item} onChanged={forceRefresh}/>} title={<span className="truncate"><MentionText text={titleOf(item)} onNavigate={(kind, mentionId)=>searchMentionNavigate(navigate, kind, mentionId)}/></span>} meta={selfRequested ? richSearchMeta(group,item,people,projects) : []}/>;
        if (group === 'vacations') {
          const personName = people.find((person)=>person.id===item.personId)?.name || 'Сотрудник';
          return <EntityRow key={item.id || index} onOpen={open} title={personName} meta={[absenceReasonLabel(item), formatAssistantPeriod(item.startDate, item.endDate)].filter(Boolean)}/>;
        }
        if (selfRequested && ['meetings','agreements','projects','goals','labs','checkins','journal'].includes(group)) {
          return <EntityRow key={item.id || index} onOpen={open} leading={group === 'agreements' ? <SearchStatus group={group} item={item} onChanged={forceRefresh}/> : null} title={<MentionText text={titleOf(item)} onNavigate={(kind, mentionId)=>searchMentionNavigate(navigate, kind, mentionId)}/>} meta={richSearchMeta(group,item,people,projects)} trailing={<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/55"/>}/>;
        }
        const hasStatus=['issues','agreements'].includes(group);
        return <div key={item.id || index} role="link" tabIndex={0} onClick={open} onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();open();}}} className="assistant-search-row group flex min-h-[50px] w-full cursor-pointer items-center gap-2 px-1 py-2 text-left transition-colors hover:bg-muted/45">
          {hasStatus && <div className="flex h-[30px] w-8 items-center justify-center"><SearchStatus group={group} item={item} onChanged={forceRefresh}/></div>}
          <span className="min-w-0 flex-1 truncate text-[17px] font-[470] leading-[23px] tracking-[-.006em]"><MentionText text={titleOf(item)} onNavigate={(kind, mentionId)=>searchMentionNavigate(navigate, kind, mentionId)}/></span>
          {!hasStatus && item.status && <Badge variant="muted">{item.status}</Badge>}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/55"/>
        </div>;
      })}</div>
      {mineLabel && mineQuery && <button type="button" className="assistant-search-footer-link flex w-full items-center justify-end gap-1 border-t px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground" onClick={()=>navigate(`/search?q=${encodeURIComponent(`покажи мои ${mineQuery}`)}`)}>{mineLabel}<ChevronRight className="h-3.5 w-3.5"/></button>}
    </section>;
  })}</div>;
}

export function AssistantWorkspace({ user, compact = false }) {
  const navigate = useNavigate();
  const [assistantParams, setAssistantParams] = useSearchParams();
  const initialPaletteQuery = assistantParams.get('q') || '';
  const autoRunPaletteQuery = assistantParams.get('run') === '1';
  const paletteRunRef = React.useRef(false);
  const peopleState = useResource('people');
  const projectsState = useResource('projects');
  const labsState = useResource('labs');
  const vacationsState = useResource('vacations');
  const [query, setQuery] = React.useState(initialPaletteQuery);
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [activeSuggestion, setActiveSuggestion] = React.useState(-1);
  const [rememberChoice, setRememberChoice] = React.useState(true);
  const [createSpec, setCreateSpec] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [greetingIconIndex, setGreetingIconIndex] = React.useState(initialGreetingIconIndex);
  const [greeting] = React.useState(currentGreeting);
  const [inputPlaceholder] = React.useState(() => INPUT_PLACEHOLDERS[Math.floor(Math.random() * INPUT_PLACEHOLDERS.length)]);
  const inputRef = React.useRef(null);
  const suggestionCloseTimerRef = React.useRef(null);
  const GreetingIcon = GREETING_ICONS[greetingIconIndex] || Leaf;
  const cycleGreetingIcon = () => setGreetingIconIndex((current) => { const next=(current+1)%GREETING_ICONS.length; try { localStorage.setItem(GREETING_ICON_STORAGE_KEY, String(next)); } catch {} return next; });

  const semanticQuery = React.useMemo(() => mentionStorageToPlainText(query), [query]);
  const suggestions = React.useMemo(() => assistantSuggestions(semanticQuery, peopleState.data, projectsState.data), [semanticQuery, peopleState.data, projectsState.data]);
  const quickRows = isTeamlead(user) ? [{ label:'Чем заняться сегодня', value:'Чем заняться сегодня' }, { label:'Как дела у...', value:'Как дела у ' }, { label:'Обзор недели', value:'Обзор недели' }] : [{ label:'Чем заняться сегодня', value:'Чем заняться сегодня' }, { label:'Обзор недели', value:'Обзор недели' }];

  const setDone = (text, open) => { setResult({ kind:'done', done:{ text, open } }); setError(''); };

  const runCreate = async (create) => {
    if (create.target === 'note') {
      if (!String(create.title || '').trim()) { navigate('/journal'); return; }
      const noteText = mentionMarkupFor(create.title.trim(), peopleState.data, projectsState.data);
      const saved = await api.resource('journal').create({ text: noteText, createdAt: new Date().toISOString() });
      setDone(`Записал в журнал: «${create.title.trim()}».`, { route:`/journal?entry=${encodeURIComponent(saved.id)}`, label:'Открыть в журнале' });
      return;
    }
    setCreateSpec(create);
  };

  const tryNavigation = async (value) => {
    const direct = assistantSectionRoute(value);
    if (direct) { navigate(direct); setResult({ kind:'navigate', navigate:{ route:direct, label:value } }); return true; }
    const normalized = norm(value);
    const openMatch = normalized.match(/^(открой мне|открой|открыть|перейди в|перейди на|перейти в|перейти на|зайди в|зайти в|покажи раздел)\s+(.+)$/);
    if (!openMatch) return false;
    const rest = openMatch[2].trim();
    const simple = assistantSectionRoute(rest);
    if (simple) { navigate(simple); setResult({ kind:'navigate', navigate:{ route:simple, label:rest } }); return true; }
    const personMatches = peopleState.data.filter((person) => norm(person.name).includes(rest));
    if (personMatches.length === 1) { navigate(`/people/${personMatches[0].id}`); return true; }
    const projectMatches = projectsState.data.filter((project) => norm(project.name).includes(rest));
    if (projectMatches.length === 1) { navigate(`/projects/${encodeURIComponent(projectMatches[0].projectKey || projectMatches[0].id)}`); return true; }
    try {
      const parsed = await api.get(`/api/search?q=${encodeURIComponent(value)}`);
      const route = navigationFromSearch(parsed);
      if (route) { navigate(route); return true; }
    } catch { /* let smart-search handle it */ }
    return false;
  };

  const ask = async (override, options = {}) => {
    const displayValue = String(override ?? query).trim();
    const value = mentionStorageToQueryText(displayValue).trim();
    if (!value || busy) return;
    setQuery(displayValue); setBusy(true); setError(''); setSuggestionsOpen(false); if (!options.keepNote) setNote('');
    try {
      if (!options.personId && await tryNavigation(value)) { setBusy(false); return; }
      const suffix = options.personId ? `&personId=${encodeURIComponent(options.personId)}` : '';
      const response = await api.get(`/api/smart-search?q=${encodeURIComponent(value)}${suffix}`);
      setResult(response);
      if (response.kind === 'create') await runCreate(response.create);
    } catch (err) {
      setResult(null); setError(err?.message || 'Не удалось выполнить запрос. Попробуйте ещё раз.');
    } finally { setBusy(false); }
  };

  React.useEffect(() => {
    if (!autoRunPaletteQuery || !initialPaletteQuery || paletteRunRef.current) return;
    paletteRunRef.current = true;
    setQuery(initialPaletteQuery);
    ask(initialPaletteQuery).finally(() => {
      const next = new URLSearchParams(assistantParams);
      next.delete('q'); next.delete('run');
      setAssistantParams(next, { replace:true });
    });
  }, [autoRunPaletteQuery, initialPaletteQuery]);

  const refresh = () => ask(query, { keepNote:true });

  const chooseCandidate = async (candidate) => {
    const payload = result?.ambiguous;
    if (rememberChoice && payload?.hintKey) {
      try {
        const settings = await api.get('/api/settings');
        await api.put('/api/settings', { smartSearchPersonHints:{ ...(settings.smartSearchPersonHints || {}), [payload.hintKey]: candidate.id } });
        setNote(`Запомнили: «${payload.fragment}» — это ${candidate.name}.`);
      } catch { /* choice still works for current query */ }
    }
    await ask(query, { personId:candidate.id, keepNote:true });
  };

  const forgetChoice = async () => {
    const hintKey = result?.resolution?.hintKey;
    if (!hintKey) return;
    const settings = await api.get('/api/settings');
    const hints = { ...(settings.smartSearchPersonHints || {}) }; delete hints[hintKey];
    await api.put('/api/settings', { smartSearchPersonHints:hints });
    setNote(`Выбор для «${hintKey}» забыт — спрошу снова.`);
    await ask(query, { keepNote:true });
  };

  const switchChoice = () => {
    const resolution = result?.resolution; const digest = result?.digest;
    if (!resolution || !digest) return;
    const current = { id:resolution.personId, name:digest.title, role:digest.person?.role || '', reasons:['показан сейчас'] };
    setResult({ ...result, kind:'ambiguous', ambiguous:{ fragment:resolution.hintKey, hintKey:resolution.hintKey, candidates:[current, ...(resolution.alternatives || [])] } });
  };

  const cancelSuggestionClose = () => {
    if (suggestionCloseTimerRef.current) {
      window.clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
  };

  const focusComposer = () => {
    cancelSuggestionClose();
    requestAnimationFrame(() => {
      const root = inputRef.current;
      root?.focus();
      if (!root) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const applySuggestion = (suggestion) => {
    cancelSuggestionClose();
    let nextQuery = suggestion.insert;
    if (suggestion.mention) {
      const match = String(query || '').match(/(^|\s)@([^@,;]*)$/u);
      if (match) {
        const start = match.index + match[1].length;
        const before = String(query || '').slice(0, start);
        const { kind, id, name } = suggestion.mention;
        nextQuery = `${before}@[${name}](${kind}:${id}) `;
      }
    }
    setQuery(nextQuery);
    setActiveSuggestion(-1);
    if (suggestion.submit) {
      setSuggestionsOpen(false);
      requestAnimationFrame(() => ask(nextQuery));
      return;
    }
    setSuggestionsOpen(true);
    focusComposer();
  };

  const hasAnswer = Boolean(result || busy || error);
  return <div className={cn('assistant-workspace mx-auto w-full', compact ? 'max-w-[720px]' : 'max-w-[780px]', hasAnswer && 'assistant-has-answer')}>
    <div className={cn('assistant-hero transition-all', hasAnswer ? 'assistant-hero-answer' : 'pt-[7vh]')}>
      <h1 className="sr-only">Главная</h1>
      <div className="assistant-greeting mb-5 flex justify-center"><span className="assistant-greeting-title relative inline-block text-balance text-center text-[28px] font-medium leading-[1.18] tracking-[-.025em] text-foreground"><button type="button" onClick={cycleGreetingIcon} className="assistant-greeting-icon absolute right-full top-1/2 mr-2.5 grid h-8 w-8 -translate-y-1/2 place-items-center text-primary transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20" aria-label="Сменить иконку" title="Сменить иконку"><GreetingIcon className="h-[22px] w-[22px]"/></button>{greeting}</span></div>
      <div className={cn('assistant-composer-wrap w-full', hasAnswer && 'assistant-composer-wrap-answer')}>
        <div className={cn('assistant-composer relative bg-background', hasAnswer && 'assistant-composer-answer')}>
          <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="assistant-composer-form">
            <div className="assistant-composer-input relative min-w-0 flex-1">
              <MentionEditor
                value={query}
                onChange={(value) => { setQuery(value); setSuggestionsOpen(true); setActiveSuggestion(-1); }}
                editorRef={inputRef}
                autoFocus={!compact}
                onEditorFocus={() => { cancelSuggestionClose(); setSuggestionsOpen(true); }}
                onEditorBlur={() => {
                  cancelSuggestionClose();
                  suggestionCloseTimerRef.current = window.setTimeout(() => {
                    setSuggestionsOpen(false);
                    suggestionCloseTimerRef.current = null;
                  }, 160);
                }}
                people={[]}
                projects={[]}
                placeholder={inputPlaceholder}
                singleLine
                submitOnEnter
                onSubmit={() => ask()}
                onEditorKeyDown={(event) => {
                  if (!suggestionsOpen || !suggestions.length) return;
                  if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSuggestion((index) => (index + 1) % suggestions.length); }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSuggestion((index) => index <= 0 ? suggestions.length - 1 : index - 1); }
                  if (event.key === 'Escape') { event.preventDefault(); setSuggestionsOpen(false); }
                  if (event.key === 'Enter' && activeSuggestion >= 0) { event.preventDefault(); applySuggestion(suggestions[activeSuggestion]); }
                }}
                ariaLabel="Запрос ассистенту"
                editorClassName="assistant-query-input h-10 min-h-0 border-0 bg-transparent px-2 py-2 text-sm font-normal leading-6 text-foreground shadow-none focus:border-0 focus:ring-0"
              />
            </div>
            <div className="assistant-composer-footer">
              <div className="assistant-quick-actions">{QUICK_INPUTS.map(({ label, value, icon:Icon }) => <button key={label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { cancelSuggestionClose(); setQuery(value); setActiveSuggestion(-1); setSuggestionsOpen(true); focusComposer(); }} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Icon className="h-3.5 w-3.5"/>{label}</button>)}</div>
              {query.trim() && <Button type="submit" size="icon" className="assistant-submit h-9 w-9 shrink-0 !rounded-full p-0" disabled={busy} aria-label="Спросить">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ChevronRight className="h-4 w-4"/>}</Button>}
            </div>
          </form>
          {suggestionsOpen && suggestions.length > 0 && <div className="assistant-suggestions absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">{suggestions.map((suggestion, index) => <button type="button" key={`${suggestion.label}-${index}`} onMouseDown={(event) => { event.preventDefault(); applySuggestion(suggestion); }} className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm', index === activeSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}>
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center text-muted-foreground">{suggestion.person ? <Avatar person={suggestion.person} size="xs"/> : suggestion.kind === 'project' ? <FolderOpen className="h-3.5 w-3.5"/> : <Search className="h-3.5 w-3.5"/>}</span>
            <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>{suggestion.meta && <span className="shrink-0 text-[12px] text-muted-foreground">{suggestion.meta}</span>}
          </button>)}</div>}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">{quickRows.map(({ label, value }) => { const active = Boolean(result) && norm(semanticQuery).startsWith(norm(value)); return <button key={label} type="button" aria-pressed={active} onClick={() => { if (/\s$/.test(value)) { setQuery(value); setActiveSuggestion(-1); setSuggestionsOpen(true); inputRef.current?.focus(); } else ask(value); }} className={cn('rounded-full bg-muted/45 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground', active && 'is-active')}>{label}</button>; })}</div>
      </div>
    </div>

    {note && <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{note}</div>}
    <div className="assistant-answer-area mt-5 pb-12">
      {busy && <div className="flex items-center gap-2 border-y px-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Разбираю запрос…</div>}
      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      {!busy && result?.kind === 'done' && <div className="flex items-center gap-3 border-y px-2 py-3"><CheckCircle2 className="h-5 w-5 text-primary"/><div className="min-w-0 flex-1 text-sm">{result.done?.text}</div>{result.done?.open?.route && <Button size="sm" variant="outline" onClick={() => navigate(result.done.open.route)}>{result.done.open.label || 'Открыть'}</Button>}</div>}
      {!busy && result?.kind === 'digest' && <DigestResult result={result} navigate={navigate} onRefresh={refresh} onForget={forgetChoice} onSwitch={switchChoice} onProjectsChanged={projectsState.reload} people={peopleState.data} projects={projectsState.data} vacations={vacationsState.data}/>}
      {!busy && result?.kind === 'search' && <SearchResult result={result} navigate={navigate} people={peopleState.data} projects={projectsState.data}/>} 
      {!busy && result?.kind === 'ambiguous' && <div className="border-y py-4"><div className="text-sm font-semibold">Кого вы имеете в виду?</div><div className="mt-1 text-xs text-muted-foreground">По слову «{result.ambiguous?.fragment}» подходит несколько человек.</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{(result.ambiguous?.candidates || []).map((candidate) => <button key={candidate.id} onClick={() => chooseCandidate(candidate)} className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left hover:bg-muted/50"><Avatar person={candidate} size="sm"/><div className="min-w-0"><div className="truncate text-sm font-medium">{candidate.name}</div><div className="truncate text-[12px] text-muted-foreground">{candidate.role || candidate.reasons?.join(' · ') || 'Сотрудник'}</div></div></button>)}</div><label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={rememberChoice} onChange={(event) => setRememberChoice(event.target.checked)}/>Запомнить выбор для «{result.ambiguous?.fragment}»</label></div>}
    </div>

    <AssistantCreateDialog
      spec={createSpec}
      user={user}
      people={peopleState.data}
      projects={projectsState.data}
      labs={labsState.data}
      open={Boolean(createSpec)}
      onOpenChange={(open) => { if (!open) setCreateSpec(null); }}
      onSaved={(saved, open) => {
        const label = createSpec?.target === 'tasks' ? 'задачу' : createSpec?.target === 'meetings' ? 'встречу' : createSpec?.target === 'issues' ? 'проблему' : createSpec?.target === 'agreements' ? 'договорённость' : 'идею';
        setDone(`Создал ${label} «${saved?.title || saved?.text || createSpec?.title || ''}».`, open);
        setCreateSpec(null);
      }}
    />
  </div>;
}
