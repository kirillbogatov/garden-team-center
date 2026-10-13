import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Archive, ArchiveRestore, BriefcaseBusiness, CalendarPlus, Check, ChevronDown, CircleDot, Copy, TriangleAlert, Clock3, ExternalLink, Gauge, Goal, Handshake, History, Info, Link2, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, Users, Workflow, Wrench, X,
} from 'lucide-react';
import { DetailAsideField, DetailHeader, DetailLayout, Page, PageHeader, Section } from '@/components/page';
import { SectionHeader, Tabs } from '@/components/patterns';
import {
  AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch, Textarea, Tooltip,
} from '@/components/ui';
import { AgreementStatusCheckbox, IssueStatusIcon, ProcessStatusGlyph, ProcessStatusIcon, ProjectStatusIcon, SolutionStatusIcon, StatusBadge, TaskStatusGlyph, TaskStatusIcon } from '@/components/status';
import { MentionEditor, MentionText } from '@/components/mention-editor';
import { MarkdownText } from '@/components/markdown';
import { EditableMarkdownDescription } from '@/components/editable-markdown-description';
import { DetailSidebar, DetailSidebarToggle, useDetailSidebarState } from '@/components/detail-sidebar';
import { VersionHistoryDialog } from '@/components/version-history';
import { StickyNotes } from '@/components/sticky-notes';
import { ProgressTree } from '@/components/progress-tree';
import { ViewModeToggle, useViewMode } from '@/components/view-mode-toggle';
import { CatalogToolbar } from '@/components/catalog';
import { EntityRow, TaskEntityRow, MeetingEntityRow, TaskPriorityIcon } from '@/components/entity-row';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';
import { MaterialServiceIcon, normalizeMaterialUrl } from '@/lib/link-preview';
import { rankTasksByPriority } from '@/lib/task-priority';
import { goalProgress } from '@/lib/goal-progress';
import {
  AGREEMENT_STATUS_LABEL, GOAL_STATUS_LABEL, ISSUE_IMPORTANCE_LABEL, ISSUE_STATUS_LABEL, PERSON_STATUS_LABEL,
  PROCESS_STATUS_LABEL, PROJECT_LOAD_OPTIONS, PROJECT_STATUS_LABEL, MEETING_TYPE_LABEL, daysBetweenKeys, isTeamlead, localTodayKey, meetingDisplayTitle, normalizeProjectMemberLoad, personMeetingCadence, personProjectLoadSummary, personUpcomingVacation,
} from '@/lib/domain';
import { mentionRoute } from '@/lib/mention-route';
import { cn, convertClockTime, formatDate, formatEventDate, teamAvailability, titleOf } from '@/lib/utils';
import { DEFAULT_TIMEZONE } from '@/lib/timezones';
import { CreateTaskDialog } from '@/pages/tasks';
import { CreateMeetingDialog } from '@/pages/operations';

export const RESOURCE_CONFIG = {
  issues: {
    title: 'Проблемы', detail: true, description: 'То, что мешает работе и требует решения.', icon: TriangleAlert,
    filters: [
      { key: 'status', label: 'Статус', all: 'Все статусы', values: { active: 'Открытые', open: 'Новые', in_progress: 'В работе', paused: 'Отложенные', resolved: 'Решённые' } },
      { key: 'severity', label: 'Важность', all: 'Все уровни важности', values: { high: 'Важные', normal: 'Обычные' } },
    ],
  },
  processes: {
    title: 'Процессы', detail: true, description: 'Как работа должна происходить и где процесс даёт сбой.', icon: Workflow,
    filters: [{ key: 'status', label: 'Статус', all: 'Все статусы', values: { ok: 'Работают', attention: 'С проблемами', broken: 'Сломанные' } }],
  },
  goals: {
    title: 'Цели', description: 'Направления и результаты команды.', icon: Goal, detail: true,
    filters: [{ key: 'status', label: 'Статус', all: 'Все статусы', values: { active: 'В работе', done: 'Достигнутые', paused: 'Отложенные' } }],
  },
  agreements: {
    title: 'Договорённости', detail: true, description: 'Принятые решения, ответственные и сроки.', icon: Handshake, titleField: 'text',
    filters: [{ key: 'status', label: 'Статус', all: 'Все статусы', values: { open: 'Открытые', done: 'Выполненные' } }],
  },
  tools: { title: 'Инструменты', detail: true, description: 'Рабочие сервисы и быстрые ссылки.', icon: Wrench },
};

const RESOURCE_DIALOG_LABEL = {
  issues: 'проблему',
  processes: 'процесс',
  goals: 'цель',
  agreements: 'договорённость',
  tools: 'инструмент',
};

const statusKindForResource = { issues: 'issue', processes: 'process', goals: 'goal', agreements: 'agreement' };

const RESOURCE_KEY_FIELD = { issues:'issueKey', processes:'processKey', agreements:'agreementKey', goals:'goalKey', tools:'toolKey' };
export function resourceRef(resource, item) {
  if (resource === 'goals') return item?.goalKey || null;
  return item?.[RESOURCE_KEY_FIELD[resource]] || item?.id;
}
export function projectRef(project) { return project?.projectKey || project?.id; }

function isWorkloadEligiblePerson(person) {
  return Boolean(person && person.type === 'team' && !['dismissed', 'transferred'].includes(person.status));
}


export function ResourcePage({ resource }) {
  const config = RESOURCE_CONFIG[resource];
  const state = useResource(resource);
  const projects = useResource('projects');
  // Архивные задачи нужны для прогресса целей: выполненные задачи авто-архивируются.
  const tasks = useEndpoint('/api/tasks?includeArchived=1');
  const people = useResource('people');
  const toolFolders = useResource('toolFolders');
  const [params] = useSearchParams();
  const requestedPerson = params.get('person') || '';
  const requestedProject = params.get('project') || '';
  const [query, setQuery] = usePersistentFilter(`resource-${resource}`, 'query', '');
  const filterDefaults = Object.fromEntries((config.filters || []).map((filter) => [filter.key, resource === 'issues' && filter.key === 'status' ? 'active' : 'all']));
  const [storedFilters, setFilters] = usePersistentFilter(`resource-${resource}`, 'filters', filterDefaults, (config.filters || []).some((filter) => params.has(filter.key)) ? Object.fromEntries((config.filters || []).map((filter) => [filter.key, params.get(filter.key) || filterDefaults[filter.key]])) : undefined);
  // Сохранённый фильтр может быть неполным или устаревшим — недостающие ключи берём из значений по умолчанию.
  const storedObject = storedFilters && typeof storedFilters === 'object' && !Array.isArray(storedFilters) ? storedFilters : {};
  const filters = Object.fromEntries((config.filters || []).map((filter) => {
    const value = storedObject[filter.key];
    return [filter.key, value === 'all' || Object.hasOwn(filter.values, value) ? value : filterDefaults[filter.key]];
  }));
  const [editing, setEditing] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewMode, setViewMode] = useViewMode(`resource-${resource}`, ['issues','processes','agreements'].includes(resource) ? 'list' : 'cards');
  const navigate = useNavigate();
  const Icon = config.icon;
  const crudEnabled = ['issues','processes','goals','agreements','tools'].includes(resource);
  const items = state.data.filter((item) => {
    if (requestedPerson && resource === 'issues' && ![
      item.affectedPersonId, ...(item.relatedPersonIds || []), ...(item.assigneeIds || []), item.ownerId,
    ].includes(requestedPerson) && !(item.mentions || []).some((mention) => mention.id === requestedPerson)) return false;
    if (requestedPerson && resource === 'agreements' && ![
      ...(item.withPersonIds || []), ...(item.relatedPersonIds || []), item.ownerId,
    ].includes(requestedPerson) && !(item.mentions || []).some((mention) => mention.id === requestedPerson)) return false;
    if (requestedProject && ['issues','agreements'].includes(resource) && item.projectId !== requestedProject && !(item.relatedProjectIds || []).includes(requestedProject)) return false;
    if (!titleOf(item).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) return false;
    return (config.filters || []).every((filter) => {
      const selected = filters[filter.key];
      if (selected === 'all') return true;
      if (resource === 'issues' && filter.key === 'status' && selected === 'active') return item.status !== 'resolved';
      return String(item[filter.key] || '') === selected;
    });
  }).sort((a, b) => {
    if (resource !== 'issues') return 0;
    const rank = { open:0, in_progress:1, paused:2, resolved:3 };
    return (rank[a.status] ?? 2) - (rank[b.status] ?? 2);
  });
  const filterIssuesBySeverity = (severity) => setFilters({
    ...filters,
    severity: filters.severity === severity ? 'all' : severity,
  });

  return <Page>
    <PageHeader title={config.title} actions={crudEnabled?<Button data-primary-action="true" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Добавить</Button>:null}/>
    <CatalogToolbar query={query} onQueryChange={setQuery} placeholder={`Поиск: ${config.title.toLocaleLowerCase('ru')}`} viewMode={viewMode} onViewModeChange={setViewMode}>
      {(requestedPerson || requestedProject) && <button type="button" className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={()=>navigate(`/${resource}`)} title="Сбросить фильтры Ассистента">{requestedPerson ? `Человек: ${people.data.find(p=>p.id===requestedPerson)?.name || 'выбран'}` : `Проект: ${projects.data.find(p=>p.id===requestedProject)?.name || 'выбран'}`} ×</button>}
      {(config.filters || []).map((filter) => <FilterSelect key={filter.key} value={filters[filter.key]} onChange={(value) => setFilters({ ...filters, [filter.key]: value })} filter={filter}/>) }
    </CatalogToolbar>
    <div key={viewMode} className="view-mode-transition">{state.error && !state.loading ? <ErrorState error={state.error} onRetry={state.reload}/> : state.loading ? (viewMode === 'list' ? <ListSkeletons/> : <CardSkeletons/>) : items.length ? (viewMode === 'list' ? <ResourceList resource={resource} items={items} people={people.data} onOpen={(item)=>{const ref=resourceRef(resource,item);if(config.detail&&ref)navigate(`/${resource}/${encodeURIComponent(ref)}`);else if(crudEnabled)setEditing(item);}} onChanged={state.reload} onSeverityFilter={resource==='issues'?filterIssuesBySeverity:null} activeSeverity={filters.severity}/> : <div className="entity-card-grid sm:grid-cols-2 lg:grid-cols-3">{items.map((item)=><ResourceCard key={item.id} resource={resource} item={item} tasks={Array.isArray(tasks.data) ? tasks.data : []} people={people.data} onOpen={()=>{const ref=resourceRef(resource,item);if(config.detail&&ref)navigate(`/${resource}/${encodeURIComponent(ref)}`);else if(crudEnabled)setEditing(item);}} onEdit={crudEnabled && resource !== 'goals' ? ()=>setEditing(item) : null} onSeverityFilter={resource==='issues'?filterIssuesBySeverity:null} activeSeverity={filters.severity}/>)}</div>) : <EmptyState icon={Icon} title="Ничего не найдено" description="Попробуйте изменить фильтры или поисковый запрос." action={crudEnabled?<Button onClick={()=>setCreateOpen(true)}>Добавить первый элемент</Button>:null}/>}</div>
    {crudEnabled&&<ResourceCrudDialog resource={resource} item={editing} open={Boolean(editing)} onOpenChange={(open)=>!open&&setEditing(null)} projects={projects.data} people={people.data} folders={toolFolders.data} onSaved={state.reload}/>} 
    {crudEnabled&&<ResourceCrudDialog resource={resource} item={null} open={createOpen} onOpenChange={setCreateOpen} projects={projects.data} people={people.data} folders={toolFolders.data} onSaved={state.reload}/>} 
  </Page>;
}

function FilterBar({ query, setQuery, placeholder, children }) {
  return <div className="entity-toolbar">
    <div className="entity-toolbar-search relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={placeholder} className="pl-9"/></div>
    {children}
  </div>;
}

function FilterSelect({ value, onChange, filter }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="lg:min-w-[160px]" aria-label={filter.label}><SelectValue placeholder={filter.label}/></SelectTrigger><SelectContent><SelectItem value="all">{filter.all}</SelectItem>{Object.entries(filter.values).map(([optionValue, label])=><SelectItem key={optionValue} value={optionValue}>{label}</SelectItem>)}</SelectContent></Select>;
}

function issueAffectedValue(item) {
  if (item?.affectsTeam) return 'team';
  return item?.affectedPersonId || 'none';
}

function IssueAffectedAvatar({ item, people = [], size = "xs", showLabel = false }) {
  const value = issueAffectedValue(item);
  if (value === 'none') return null;
  if (value === 'team') {
    const team = people.filter((person)=>person.type==='team').slice(0,3);
    return <span className={cn('inline-flex min-w-0 items-center gap-2', !showLabel && 'justify-center')} title="Команда целиком"><span className="flex shrink-0 -space-x-1.5">{team.length ? team.map((person)=><Avatar key={person.id} person={person} size={size} className="ring-2 ring-background"/>) : <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground', size==='sm' ? 'h-8 w-8' : 'h-6 w-6')}><Users className={size==='sm' ? 'h-4 w-4' : 'h-3.5 w-3.5'}/></span>}</span>{showLabel&&<span className="truncate">Команда целиком</span>}</span>;
  }
  const person = people.find((candidate)=>candidate.id===value);
  if (!person) return null;
  return <span className="inline-flex min-w-0 items-center gap-2" title={person.name}><Avatar person={person} size={size}/>{showLabel&&<span className="truncate">{person.name}</span>}</span>;
}

function ResourceList({ resource, items, people = [], onOpen, onChanged, onSeverityFilter, activeSeverity }) {
  return <div className="entity-list">{items.map((item)=><ResourceListRow key={item.id} resource={resource} item={item} people={people} onOpen={()=>onOpen(item)} onChanged={onChanged} onSeverityFilter={onSeverityFilter} activeSeverity={activeSeverity}/>)}</div>;
}

function ResourceListRow({ resource, item, people = [], onOpen, onChanged, onSeverityFilter, activeSeverity }) {
  const title = titleOf(item);
  const leading = resource === 'issues'
    ? <IssueStatusIcon issue={item} onChanged={onChanged}/>
    : resource === 'processes'
      ? <ProcessStatusIcon process={item} onChanged={onChanged}/>
      : resource === 'agreements'
        ? <AgreementStatusCheckbox agreement={item} onChanged={onChanged}/>
        : null;
  const rowTitle = resource === 'issues'
    ? <span className="flex min-w-0 items-center gap-2"><button type="button" className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-muted', activeSeverity===item.severity && 'bg-accent')} onClick={(event)=>{event.stopPropagation();onSeverityFilter?.(item.severity||'normal');}} aria-label={`Фильтровать по важности: ${ISSUE_IMPORTANCE_LABEL[item.severity]||item.severity}`} title={`Фильтр: ${ISSUE_IMPORTANCE_LABEL[item.severity]||item.severity}`}><TaskPriorityIcon priority={item.severity === 'high' ? 'high' : 'normal'}/></button><span className="min-w-0 truncate"><MentionText text={title}/></span></span>
    : resource === 'agreements' ? <MentionText text={item.text}/> : title;
  const trailing = <div className="flex shrink-0 items-center gap-2">
    {resource === 'issues' && <IssueAffectedAvatar item={item} people={people}/>}
    {resource === 'agreements' && item.dueDate && <span className="hidden text-xs text-muted-foreground sm:inline">До {formatEventDate(item.dueDate, { short: true })}</span>}
    {item.status && !['issues','processes','agreements'].includes(resource) && <StatusBadge value={item.status} kind={statusKindForResource[resource] || 'generic'}/>}
  </div>;
  return <EntityRow className={cn(resource==='agreements' && item.status==='done' ? 'agreement-row-done' : '', ['issues','processes'].includes(resource) && 'task-entity-row')} leading={leading} title={rowTitle} meta={[]} trailing={trailing} onOpen={onOpen}/>;
}

function ResourceCard({ resource, item, tasks = [], people = [], onOpen, onEdit, onSeverityFilter, activeSeverity }) {
  const clickable = Boolean(onOpen);
  const description = resource === 'processes' ? (item.currentBehavior || item.expectedBehavior) : item.description;
  const openFromCard = (event) => {
    if (!clickable || event.defaultPrevented) return;
    const interactive = event.target.closest?.('button,a,input,select,textarea,[role="button"]');
    if (interactive && interactive !== event.currentTarget) return;
    onOpen();
  };
  const onCardKeyDown = (event) => {
    if (!clickable || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    onOpen();
  };
  return <div role={clickable?'button':undefined} tabIndex={clickable?0:undefined} onClick={openFromCard} onKeyDown={onCardKeyDown} className={cn('entity-card text-left', clickable && 'cursor-pointer hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20')}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="entity-card-title truncate-2">{resource==='agreements'?<MentionText text={item.text}/>:resource==='issues'?<span className="flex items-start gap-2"><button type="button" className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-muted', activeSeverity===item.severity && 'bg-accent')} onClick={(event)=>{event.stopPropagation();onSeverityFilter?.(item.severity||'normal');}} aria-label={`Фильтровать по важности: ${ISSUE_IMPORTANCE_LABEL[item.severity]||item.severity}`}><TaskPriorityIcon priority={item.severity==='high'?'high':'normal'}/></button><MentionText text={titleOf(item)}/></span>:titleOf(item)}</h3></div><div className="flex shrink-0 items-center gap-1">{resource==='issues'&&<IssueAffectedAvatar item={item} people={people}/>} {item.status && <StatusBadge value={item.status} kind={statusKindForResource[resource] || 'generic'}/>} {onEdit&&<Button variant="ghost" size="icon-sm" onClick={(event)=>{event.stopPropagation();onEdit();}} aria-label="Редактировать"><Pencil className="h-3.5 w-3.5"/></Button>}</div></div>
    {description && <p className="entity-card-description truncate-2"><MentionText text={description}/></p>}
    {resource === 'goals' && (() => { const progress = goalProgress(item, tasks); return <div className="goal-growth-line-react mt-3"><div className="goal-growth-copy-react"><span className="text-xs text-muted-foreground">Прогресс</span><strong>{progress}%</strong></div><ProgressTree progress={progress} seed={item.goalKey || item.id} compact/></div>; })()}
    {resource === 'agreements' && item.dueDate && <div className="mt-3 text-xs text-muted-foreground">До {formatEventDate(item.dueDate, { short: true })}</div>}
    {resource === 'tools' && item.url && <div className="mt-3 flex items-center justify-between gap-2"><a onClick={(event)=>event.stopPropagation()} className="truncate text-xs text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a></div>}
  </div>;
}

function FixOptionsField({ options, onChange }) {
  const update = (index, text) => onChange(options.map((option, i) => i === index ? { ...option, text } : option));
  const add = () => onChange([...options, { id: globalThis.crypto?.randomUUID?.() || `fix_${Date.now().toString(36)}_${options.length}`, text: '', status: 'untested' }]);
  const remove = (index) => onChange(options.filter((_, i) => i !== index));
  const [focusLast, setFocusLast] = React.useState(false);
  const lastRef = React.useRef(null);
  React.useEffect(() => { if (focusLast) { lastRef.current?.focus(); setFocusLast(false); } }, [focusLast, options.length]);
  return <div>
    <div className="flex items-center justify-between"><Label>Варианты улучшения</Label><Button type="button" variant="ghost" size="sm" onClick={()=>{ add(); setFocusLast(true); }}><Plus className="h-4 w-4"/>Добавить вариант</Button></div>
    {options.length ? <div className="mt-1.5 space-y-2">{options.map((option, index) => <div key={option.id || index} className="flex items-center gap-2">
      <Input ref={index === options.length - 1 ? lastRef : undefined} value={option.text || ''} onChange={(event)=>update(index, event.target.value)} onKeyDown={(event)=>{ if (event.key === 'Enter') { event.preventDefault(); if (String(option.text || '').trim()) { add(); setFocusLast(true); } } }} placeholder="Опишите, что можно попробовать…" aria-label={`Вариант улучшения ${index + 1}`}/>
      <Button type="button" variant="ghost" size="icon-sm" onClick={()=>remove(index)} aria-label="Удалить вариант" title="Удалить"><X className="h-4 w-4"/></Button>
    </div>)}</div> : <div className="mt-1.5 text-xs text-muted-foreground">Вариантов улучшения пока нет.</div>}
  </div>;
}

function ResourceCrudDialog({ resource, item, open, onOpenChange, onSaved, projects = [], people = [], folders = [], showDeleteAction = true }) {
  const config = RESOURCE_CONFIG[resource];
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource, open, item, onOpenChange, onSaved,
    resolveId: (current) => resourceRef(resource, current),
    buildDraft: (current) => {
      if (resource === 'issues') return { title: current?.title || '', description: current?.description || '', status: current?.status || 'open', severity: current?.severity || 'normal', projectId: current?.projectId || 'none', affectedTarget: issueAffectedValue(current) };
      if (resource === 'processes') return { title: current?.title || '', status: current?.status || 'ok', expectedBehavior: current?.expectedBehavior || '', currentBehavior: current?.currentBehavior || '', fixOptions: (current?.fixOptions || []).map((x, index) => normalizeSolutionOption(x, index)) };
      if (resource === 'goals') return { title: current?.title || '', description: current?.description || '', dueDate: current?.dueDate || '', status: current?.status || 'active' };
      if (resource === 'agreements') return { text: current?.text || '', status: current?.status || 'open', date: current?.date || '', dueDate: current?.dueDate || '', projectId: current?.projectId || 'none' };
      return { title: current?.title || '', url: current?.url || '', folderId: current?.folderId || 'none', scope: current?.scope || '' };
    },
    validate: (d) => {
      const title = resource === 'agreements' ? String(d.text || '').trim() : String(d.title || '').trim();
      if (!title) return resource === 'agreements' ? 'Укажите текст договорённости' : 'Укажите название';
      if (resource === 'tools' && d.url && !/^https?:\/\//i.test(d.url)) return 'Укажите корректную ссылку';
      return null;
    },
    buildPayload: (d) => {
      const title = resource === 'agreements' ? String(d.text || '').trim() : String(d.title || '').trim();
      if (resource === 'issues') return { title, description: String(d.description || '').trim(), status: d.status, severity: d.severity, projectId: d.projectId === 'none' ? null : d.projectId, affectsTeam: d.affectedTarget === 'team', affectedPersonId: !['none', 'team'].includes(d.affectedTarget) ? d.affectedTarget : null };
      if (resource === 'processes') return { title, status: d.status, expectedBehavior: String(d.expectedBehavior || '').trim(), currentBehavior: String(d.currentBehavior || '').trim(), fixOptions: (d.fixOptions || []).map((option) => ({ ...option, text: String(option.text || '').trim() })).filter((option) => option.text) };
      if (resource === 'goals') return { title, description: String(d.description || '').trim(), dueDate: d.dueDate || null, status: d.status };
      if (resource === 'agreements') return { text: title, status: d.status, date: d.date || null, dueDate: d.dueDate || null, projectId: d.projectId === 'none' ? null : d.projectId };
      return { title, url: String(d.url || '').trim(), folderId: d.folderId === 'none' ? null : d.folderId, scope: String(d.scope || '').trim() || null };
    },
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>{isEdit ? `Редактировать ${RESOURCE_DIALOG_LABEL[resource]}` : `Добавить ${RESOURCE_DIALOG_LABEL[resource]}`}</DialogTitle></DialogHeader><div className="space-y-4">
    {resource==='agreements'?<div><Label>Договорённость</Label><MentionEditor className="mt-1.5" value={draft.text||''} onChange={(value)=>field('text',value)} people={people} projects={projects} autoFocus ariaLabel="Договорённость"/></div>:resource==='issues'?<div><Label>Название</Label><MentionEditor className="mt-1.5" editorClassName="min-h-10 h-10" value={draft.title||''} onChange={(value)=>field('title',value)} people={people} projects={projects} autoFocus singleLine ariaLabel="Название проблемы"/></div>:<div><Label>Название</Label><Input className="mt-1.5" value={draft.title||''} onChange={(e)=>field('title',e.target.value)} autoFocus/></div>}
    {resource==='issues'&&<><div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} ariaLabel="Описание"/></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Статус</Label><Select value={draft.status||'open'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(ISSUE_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><div><Label>Важность</Label><Select value={draft.severity||'normal'} onValueChange={(v)=>field('severity',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(ISSUE_IMPORTANCE_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div><div><Label>Кого затрагивает</Label><Select value={draft.affectedTarget||'none'} onValueChange={(v)=>field('affectedTarget',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указано</SelectItem><SelectItem value="team">Команда целиком</SelectItem>{people.map((person)=><SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div><ProjectSelect value={draft.projectId||'none'} onChange={(v)=>field('projectId',v)} projects={projects}/></>}
    {resource==='processes'&&<><div><Label>Статус</Label><Select value={draft.status||'ok'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(PROCESS_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><div><Label>Как должно работать</Label><MentionEditor className="mt-1.5" value={draft.expectedBehavior||''} onChange={(value)=>field('expectedBehavior',value)} people={people} projects={projects} ariaLabel="Как должно работать"/></div><div><Label>Как работает сейчас / проблемы</Label><MentionEditor className="mt-1.5" value={draft.currentBehavior||''} onChange={(value)=>field('currentBehavior',value)} people={people} projects={projects} ariaLabel="Как работает сейчас"/></div><FixOptionsField options={draft.fixOptions||[]} onChange={(next)=>field('fixOptions',next)}/></>}
    {resource==='goals'&&<><div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} ariaLabel="Описание"/></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Срок</Label><Input className="mt-1.5" type="date" value={draft.dueDate||''} onChange={(e)=>field('dueDate',e.target.value)}/></div><div><Label>Статус</Label><Select value={draft.status||'active'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(GOAL_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div></>}
    {resource==='agreements'&&<><div className="grid gap-4 sm:grid-cols-3"><div><Label>Дата</Label><Input className="mt-1.5" type="date" value={draft.date||''} onChange={(e)=>field('date',e.target.value)}/></div><div><Label>Срок</Label><Input className="mt-1.5" type="date" value={draft.dueDate||''} onChange={(e)=>field('dueDate',e.target.value)}/></div><div><Label>Статус</Label><Select value={draft.status||'open'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(AGREEMENT_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div><ProjectSelect value={draft.projectId||'none'} onChange={(v)=>field('projectId',v)} projects={projects}/></>}
    {resource==='tools'&&<><div><Label>Ссылка</Label><Input className="mt-1.5" type="url" value={draft.url||''} onChange={(e)=>field('url',e.target.value)} placeholder="https://…"/></div><div><Label>Область применения</Label><Input className="mt-1.5" value={draft.scope||''} onChange={(e)=>field('scope',e.target.value)}/></div><div><Label>Папка</Label><Select value={draft.folderId||'none'} onValueChange={(v)=>field('folderId',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без папки</SelectItem>{folders.map((folder)=><SelectItem key={folder.id} value={folder.id}>{folder.title}</SelectItem>)}</SelectContent></Select></div></>}
    {error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
  </div><DialogFooter className="justify-between"><div>{isEdit&&showDeleteAction&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить «${item ? titleOf(item) : ''}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}

function ProjectSelect({ value, onChange, projects }) { return <div><Label>Проект</Label><Select value={value||'none'} onValueChange={onChange}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem>{projects.map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>; }


function InlineIssueField({ value, placeholder, multiline = false, className, onSave, children, mentionable = false, people = [], projects = [] }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  React.useEffect(()=>{ if (!editing) setDraft(value || ''); }, [value, editing]);
  const saveValue = async (raw) => {
    const next = String(raw ?? draft).trim();
    setDraft(next);
    setEditing(false);
    if (next === String(value || '').trim()) return;
    await onSave(next);
  };
  if (!editing) return <div role="button" tabIndex={0} className={cn('issue-inline-field text-left', className)} onClick={()=>setEditing(true)} onKeyDown={(event)=>{ if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditing(true); } }}>{children || value || placeholder}</div>;
  if (mentionable) return <MentionEditor
    autoFocus
    value={draft}
    onChange={setDraft}
    onBlur={saveValue}
    people={people}
    projects={projects}
    placeholder={placeholder}
    singleLine={!multiline}
    editorClassName={cn('issue-inline-editor', multiline ? 'issue-inline-editor-description' : 'issue-inline-editor-title')}
    ariaLabel={multiline ? 'Описание проблемы' : 'Название проблемы'}
  />;
  if (multiline) return <Textarea autoFocus value={draft} onChange={(event)=>setDraft(event.target.value)} onBlur={()=>saveValue(draft)} onKeyDown={(event)=>{ if ((event.metaKey||event.ctrlKey) && event.key==='Enter') event.currentTarget.blur(); if (event.key==='Escape') { setDraft(value || ''); setEditing(false); } }} className={cn('issue-inline-editor issue-inline-editor-description', className)} placeholder={placeholder}/>;
  return <Input autoFocus value={draft} onChange={(event)=>setDraft(event.target.value)} onBlur={()=>saveValue(draft)} onKeyDown={(event)=>{ if (event.key==='Enter') event.currentTarget.blur(); if (event.key==='Escape') { setDraft(value || ''); setEditing(false); } }} className={cn('issue-inline-editor issue-inline-editor-title', className)} placeholder={placeholder}/>;
}

const ISSUE_STATUS_GLYPH = { open:'todo', in_progress:'in_progress', paused:'paused', resolved:'done' };

function IssueStatusProperty({ issue, onChange }) {
  const value = ISSUE_STATUS_LABEL[issue.status] ? issue.status : 'open';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="issue-enum-control"><TaskStatusGlyph status={ISSUE_STATUS_GLYPH[value] || 'todo'}/><span>{ISSUE_STATUS_LABEL[value] || value}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground"/></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-48">
      {Object.entries(ISSUE_STATUS_LABEL).map(([next,label])=><DropdownMenuItem key={next} onSelect={()=>onChange(next)} className="grid grid-cols-[22px_minmax(0,1fr)_18px] gap-2"><TaskStatusGlyph status={ISSUE_STATUS_GLYPH[next] || 'todo'}/><span>{label}</span><span className="text-center text-xs text-muted-foreground">{next===value?'✓':''}</span></DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function IssueImportanceProperty({ issue, onChange }) {
  const value = ISSUE_IMPORTANCE_LABEL[issue.severity] ? issue.severity : 'normal';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="issue-enum-control"><TaskPriorityIcon priority={value==='high'?'high':'normal'}/><span>{ISSUE_IMPORTANCE_LABEL[value] || value}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground"/></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-44">
      {Object.entries(ISSUE_IMPORTANCE_LABEL).map(([next,label])=><DropdownMenuItem key={next} onSelect={()=>onChange(next)} className="grid grid-cols-[22px_minmax(0,1fr)_18px] gap-2"><TaskPriorityIcon priority={next==='high'?'high':'normal'}/><span>{label}</span><span className="text-center text-xs text-muted-foreground">{next===value?'✓':''}</span></DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ProcessStatusProperty({ item, onChange }) {
  const value = PROCESS_STATUS_LABEL[item.status] ? item.status : 'ok';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="issue-enum-control"><ProcessStatusGlyph status={value}/><span>{PROCESS_STATUS_LABEL[value] || value}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground"/></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-48">
      {Object.entries(PROCESS_STATUS_LABEL).map(([next,label])=><DropdownMenuItem key={next} onSelect={()=>onChange(next)} className="grid grid-cols-[22px_minmax(0,1fr)_18px] gap-2"><ProcessStatusGlyph status={next}/><span>{label}</span><span className="text-center text-xs text-muted-foreground">{next===value?'✓':''}</span></DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function ResourceDetailPage({ resource }) {
  const { id } = useParams(); const navigate = useNavigate(); const config = RESOURCE_CONFIG[resource];
  const state = useEndpoint(`/api/${resource}/${encodeURIComponent(id)}`,[id]);
  const projects = useResource('projects'); const people = useResource('people'); const folders = useResource('toolFolders'); const [editOpen,setEditOpen]=React.useState(false);
  const [createTaskOpen,setCreateTaskOpen]=React.useState(false); const [createTaskTitle,setCreateTaskTitle]=React.useState(''); const [creatingTask,setCreatingTask]=React.useState(false);
  const [historyOpen,setHistoryOpen]=React.useState(false);
  if(state.loading) return <Page narrow><Skeleton className="h-80"/></Page>;
  const item=state.data; if(!item) return <Page narrow><EmptyState title={`${config.title}: элемент не найден`}/></Page>;
  const project=projects.data.find((p)=>p.id===item.projectId);
  const affectedPerson = item.affectedPersonId ? people.data.find((person)=>person.id===item.affectedPersonId) : null;
  const identifier=resourceRef(resource,item);
  const mentionNavigate=(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`);
  const patchIssue = async (body) => { const updated = await api.resource('issues').update(item.id, body); state.setData(updated); return updated; };
  const deleteIssue = async () => { if (!confirm('Удалить проблему?')) return; await api.resource('issues').remove(item.id); navigate('/issues'); };
  const patchProcess = async (body) => { const updated = await api.resource('processes').update(item.id, body); state.setData(updated); return updated; };
  const deleteProcess = async () => { if (!confirm('Удалить процесс?')) return; await api.resource('processes').remove(item.id); navigate('/processes'); };
  const openCreateTask = () => { setCreateTaskTitle(item.title || ''); setCreateTaskOpen(true); };
  const createTaskFromIssue = async () => {
    const title = createTaskTitle.trim(); if (!title || creatingTask) return;
    setCreatingTask(true);
    try {
      const task = await api.resource('tasks').create({ title, status:'todo', priority:item.severity==='high'?'high':'normal', taskType:'standard', assigneeIds:[], projectId:item.projectId||null, dueDate:null, issueIds:[item.id] });
      setCreateTaskOpen(false); navigate(`/tasks/${encodeURIComponent(task.taskKey || task.id)}`);
    } finally { setCreatingTask(false); }
  };
  const description = resource==='tools' ? (item.scope||'Рабочий инструмент') : resource==='issues' ? null : item.description ? <MarkdownText text={item.description} onNavigate={mentionNavigate}/> : null;
  const meta = resource==='issues' ? <>
    <IssueStatusProperty issue={item} onChange={(status)=>patchIssue({status})}/>
    <IssueImportanceProperty issue={item} onChange={(severity)=>patchIssue({severity})}/>
    {(item.affectsTeam||affectedPerson)&&<span className="entity-detail-chip issue-affected-chip"><span className="text-muted-foreground">Кого затрагивает:</span><IssueAffectedAvatar item={item} people={people.data} showLabel/></span>}
    {project&&<span className="entity-detail-chip project-chip"><BriefcaseBusiness className="h-3.5 w-3.5"/><Link to={`/projects/${encodeURIComponent(projectRef(project))}`}>{project.name}</Link></span>}
  </> : resource==='processes' ? <>
    <ProcessStatusProperty item={item} onChange={(status)=>patchProcess({status})}/>
    {project&&<span className="entity-detail-chip project-chip"><BriefcaseBusiness className="h-3.5 w-3.5"/><Link to={`/projects/${encodeURIComponent(projectRef(project))}`}>{project.name}</Link></span>}
  </> : <>
    {item.status&&<span className="entity-detail-chip"><StatusBadge value={item.status} kind={statusKindForResource[resource]||'generic'}/></span>}
    {project&&<span className="entity-detail-chip project-chip"><BriefcaseBusiness className="h-3.5 w-3.5"/><Link to={`/projects/${encodeURIComponent(projectRef(project))}`}>{project.name}</Link></span>}
  </>;
  const aside = <>
    {item.status&&<DetailAsideField label="Статус"><StatusBadge value={item.status} kind={statusKindForResource[resource]||'generic'}/></DetailAsideField>}
    {resource==='issues'&&item.severity&&<DetailAsideField label="Важность">{ISSUE_IMPORTANCE_LABEL[item.severity]||item.severity}</DetailAsideField>}
    {resource==='agreements'&&<><DetailAsideField label="Дата">{item.date?formatDate(item.date):'—'}</DetailAsideField><DetailAsideField label="Срок">{item.dueDate?formatDate(item.dueDate):'—'}</DetailAsideField></>}
    {project&&<DetailAsideField label="Контекст проекта"><Link className="hover:underline" to={`/projects/${encodeURIComponent(projectRef(project))}`}>{project.name}</Link></DetailAsideField>}
    {identifier&&<DetailAsideField label="Ключ">{identifier}</DetailAsideField>}
  </>;
  return <Page narrow>
    <div className="mb-7 flex items-center justify-between"><Button variant="ghost" size="sm" onClick={()=>navigate(`/${resource}`)}><ArrowLeft className="h-4 w-4"/>{config.title}</Button>{resource==='issues'?<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={openCreateTask}><Plus className="h-4 w-4"/>Создать задачу</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onSelect={deleteIssue}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:resource==='processes'?<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История изменений</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onSelect={deleteProcess}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:<Button variant="ghost" size="sm" onClick={()=>setEditOpen(true)}><Pencil className="h-3.5 w-3.5"/>Редактировать</Button>}</div>
    {resource==='issues'?<header className="entity-detail-header issue-detail-header">
      <InlineIssueField value={item.title} placeholder="Название проблемы" className="entity-detail-title issue-inline-title" onSave={(title)=>patchIssue({title})} mentionable people={people.data} projects={projects.data}><MentionText text={item.title} onNavigate={mentionNavigate}/></InlineIssueField>
      <InlineIssueField value={item.description} placeholder="Добавьте описание…" multiline className="entity-detail-description issue-inline-description" onSave={(description)=>patchIssue({description})} mentionable people={people.data} projects={projects.data}>{item.description?<MarkdownText text={item.description} onNavigate={mentionNavigate}/>:<span className="text-muted-foreground">Добавьте описание…</span>}</InlineIssueField>
      <div className="entity-detail-meta">{meta}</div>
    </header>:resource==='processes'?<header className="entity-detail-header issue-detail-header">
      <InlineIssueField value={item.title} placeholder="Название процесса" className="entity-detail-title issue-inline-title" onSave={(title)=>patchProcess({title})}>{item.title}</InlineIssueField>
      <div className="entity-detail-meta">{meta}</div>
    </header>:<DetailHeader title={resource==='agreements'?<MentionText text={item.text} onNavigate={mentionNavigate}/>:titleOf(item)} description={description} meta={meta}/>}
    <DetailLayout aside={['issues','processes'].includes(resource)?null:aside}>
      {resource==='issues'&&<IssueSolutionsSection issue={item} onChanged={(updated)=>updated?state.setData(updated):state.reload()}/>}
      {resource==='processes'&&<>
        <Section title="Как должно работать">
          <InlineIssueField value={item.expectedBehavior} placeholder="Опишите, как должно работать…" multiline className="entity-detail-copy issue-inline-description" onSave={(expectedBehavior)=>patchProcess({expectedBehavior})} mentionable people={people.data} projects={projects.data}>{item.expectedBehavior?<MarkdownText text={item.expectedBehavior} onNavigate={mentionNavigate}/>:<span className="text-muted-foreground">Опишите, как должно работать…</span>}</InlineIssueField>
        </Section>
        <Section title="Как работает сейчас">
          <InlineIssueField value={item.currentBehavior} placeholder="Опишите, как работает сейчас…" multiline className="entity-detail-copy issue-inline-description" onSave={(currentBehavior)=>patchProcess({currentBehavior})} mentionable people={people.data} projects={projects.data}>{item.currentBehavior?<MarkdownText text={item.currentBehavior} onNavigate={mentionNavigate}/>:<span className="text-muted-foreground">Опишите, как работает сейчас…</span>}</InlineIssueField>
        </Section>
        <SolutionOptionsSection resource="processes" item={item} field="fixOptions" title="Варианты улучшения" addLabel="Добавить вариант" emptyText="Вариантов улучшения пока нет." onChanged={(updated)=>updated?state.setData(updated):state.reload()}/>
      </>}
      {resource==='agreements'&&<Section title="Детали"><div className="entity-detail-copy">Договорённость зафиксирована в общем рабочем контексте. Даты и статус находятся справа.</div></Section>}
      {resource==='tools'&&<Section title="Ссылка">{item.url?<a href={item.url} target="_blank" rel="noreferrer" className="task-relation-main px-0"><Link2 className="h-4 w-4"/><span className="task-relation-title">{item.url}</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></a>:<div className="text-sm text-muted-foreground">Ссылка не указана.</div>}</Section>}
    </DetailLayout>
    {!['issues','processes'].includes(resource)&&<ResourceCrudDialog resource={resource} item={item} open={editOpen} onOpenChange={setEditOpen} projects={projects.data} people={people.data} folders={folders.data} onSaved={state.reload}/>}
    {resource==='issues'&&<Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Создать задачу</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="issue-task-title">Название</Label><Input id="issue-task-title" autoFocus value={createTaskTitle} onChange={(event)=>setCreateTaskTitle(event.target.value)} onKeyDown={(event)=>{ if(event.key==='Enter') createTaskFromIssue(); }}/></div><DialogFooter><Button variant="ghost" onClick={()=>setCreateTaskOpen(false)} disabled={creatingTask}>Отмена</Button><Button onClick={createTaskFromIssue} disabled={creatingTask||!createTaskTitle.trim()}>Создать</Button></DialogFooter></DialogContent></Dialog>}
    {resource==='processes'&&<VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="processes" entityId={item.id} onRestored={(restored)=>state.setData(restored)}/>}
  </Page>;
}

function normalizeSolutionOption(option, index) {
  if (option && typeof option === 'object') return {
    id: option.id || `solution-${index}`,
    text: option.text || '',
    status: ['effective','ineffective','untested'].includes(option.status) ? option.status : 'untested',
  };
  return { id: `solution-${index}`, text: String(option || ''), status: 'untested' };
}

function SolutionOptionsSection({ resource, item, field, title, addLabel = 'Добавить вариант', emptyText = 'Вариантов пока нет.', onChanged }) {
  const options = (item[field] || []).map(normalizeSolutionOption);
  const [editor, setEditor] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const saveOptions = async (next) => {
    setBusy(true);
    try {
      const updated = await api.resource(resource).update(item.id, { [field]: next });
      await onChanged?.(updated);
      return updated;
    } finally { setBusy(false); }
  };
  const openNew = () => { setDraft(''); setEditor({ mode:'new' }); };
  const openEdit = (option, index) => { setDraft(option.text || ''); setEditor({ mode:'edit', index }); };
  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...options];
    if (editor?.mode === 'edit') next[editor.index] = { ...next[editor.index], text };
    else next.push({ id: globalThis.crypto?.randomUUID?.() || `solution-${Date.now()}`, text, status:'untested' });
    await saveOptions(next);
    setEditor(null); setDraft('');
  };
  const remove = async (index) => {
    if (busy) return;
    await saveOptions(options.filter((_, itemIndex)=>itemIndex!==index));
  };
  const setStatus = async (index, status) => {
    if (busy) return;
    await saveOptions(options.map((option,itemIndex)=>itemIndex===index ? { ...option, status } : option));
  };

  return <>
    <Section title={title} actions={<Button variant="ghost" size="sm" onClick={openNew}><Plus className="h-4 w-4"/>{addLabel}</Button>}>
      {options.length ? <div className="task-relations-list issue-solutions-list">{options.map((option,index)=><div key={option.id||index} className="task-relation-row issue-solution-row">
        <div className="task-relation-main issue-solution-main">
          <SolutionStatusIcon value={option.status} onChange={(status)=>setStatus(index,status)} disabled={busy}/>
          <span className="task-relation-title"><MentionText text={option.text}/></span>
        </div>
        <div className="issue-solution-actions">
          <Button variant="ghost" size="icon-sm" onClick={()=>openEdit(option,index)} aria-label="Редактировать вариант" title="Редактировать"><Pencil className="h-3.5 w-3.5"/></Button>
          <Button variant="ghost" size="icon-sm" onClick={()=>remove(index)} aria-label="Удалить вариант" title="Удалить"><X className="h-4 w-4"/></Button>
        </div>
      </div>)}</div> : <div className="task-relations-empty">{emptyText}</div>}
    </Section>
    <Dialog open={Boolean(editor)} onOpenChange={(open)=>{ if(!open&&!busy){ setEditor(null); setDraft(''); } }}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle>{editor?.mode==='edit'?'Редактировать вариант':addLabel}</DialogTitle></DialogHeader>
          <div className="mt-5"><Label htmlFor={`${resource}-option-text`}>Вариант</Label><Textarea id={`${resource}-option-text`} autoFocus className="mt-1.5 min-h-24" value={draft} onChange={(event)=>setDraft(event.target.value)} placeholder="Опишите, что можно попробовать…"/></div>
          <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={()=>setEditor(null)} disabled={busy}>Отмена</Button><Button type="submit" disabled={busy||!draft.trim()}>Сохранить</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function IssueSolutionsSection({ issue, onChanged }) {
  return <SolutionOptionsSection resource="issues" item={issue} field="solutionOptions" title="Варианты решения" addLabel="Добавить вариант" emptyText="Вариантов решения пока нет." onChanged={onChanged}/>;
}

const GRADE_LABEL = { junior:'Junior', middle:'Middle', senior:'Senior', lead:'Lead', principal:'Principal' };
function personGrade(person) { const explicit=String(person?.grade||'').toLowerCase(); if(GRADE_LABEL[explicit])return explicit; return (person?.tags||[]).find((tag)=>GRADE_LABEL[String(tag).toLowerCase()])?.toLowerCase()||''; }
function roleWithGrade(person) { const grade=personGrade(person); return [person?.role, grade?GRADE_LABEL[grade]:''].filter(Boolean).join(' · '); }
function extraPersonTags(person) { return (person?.tags||[]).filter((tag)=>!GRADE_LABEL[String(tag).toLowerCase()]); }
function localTimeLabel(person) { try { return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:person?.timezone||'Europe/Moscow'}).format(new Date()); } catch { return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date()); } }
function workScheduleLabel(person, viewerTimezone) {
  if (!person?.workStart || !person?.workEnd) return null;
  const fromZone = person.timezone || 'Europe/Moscow';
  const toZone = viewerTimezone || DEFAULT_TIMEZONE;
  const start = convertClockTime(person.workStart, fromZone, toZone);
  const end = convertClockTime(person.workEnd, fromZone, toZone);
  if (!start || !end) return `${person.workStart} - ${person.workEnd} (по вашему времени)`;
  const dayNote = (shift) => shift === 0 ? '' : shift > 0 ? ' (+1 д.)' : ' (-1 д.)';
  return `${start.time}${dayNote(start.dayShift)} - ${end.time}${dayNote(end.dayShift)} (по вашему времени)`;
}

export function PeoplePage({ type }) {
  const isTeam = type === 'team';
  const state = useResource('people');
  const projects = useResource('projects');
  const vacations = useResource('vacations');
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');
  const [onlyActive, setOnlyActive] = React.useState(true);
  const [viewMode, setViewMode] = useViewMode(`people-${type}`, isTeam ? 'cards' : 'list');
  const [editing,setEditing]=React.useState(null); const [createOpen,setCreateOpen]=React.useState(false);
  const items = state.data.filter((person) => person.type === type)
    .filter((person) => !isTeam || !onlyActive || !person.status || person.status === 'active' || person.status === 'on_leave')
    .filter((person) => `${person.name || ''} ${person.role || ''} ${person.email || ''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  const title = isTeam ? 'Команда' : 'Стейкхолдеры';

  return <Page>
    <PageHeader title={title} actions={<Button data-primary-action="true" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>{isTeam?'Добавить сотрудника':'Добавить стейкхолдера'}</Button>}/>
    <CatalogToolbar query={query} onQueryChange={setQuery} placeholder={`Поиск: ${title.toLocaleLowerCase('ru')}`} viewMode={viewMode} onViewModeChange={setViewMode}>{isTeam && <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={onlyActive} onCheckedChange={setOnlyActive}/><span>Только активные</span></label>}</CatalogToolbar>
    <div key={viewMode} className="view-mode-transition">{state.error && !state.loading ? <ErrorState error={state.error} onRetry={state.reload}/> : state.loading ? (viewMode === 'list' ? <ListSkeletons/> : <CardSkeletons/>) : items.length ? (viewMode === 'cards' ? <div className={`entity-card-grid ${isTeam ? 'team-card-grid' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>{items.map((person)=>isTeam?<TeamCard key={person.id} person={person} projects={projects.data} vacations={vacations.data} onClick={()=>navigate(`/people/${person.id}`)}/>:<StakeholderCard key={person.id} person={person} projects={projects.data} onClick={()=>navigate(`/people/${person.id}`)}/>)}</div> : <div className="entity-list">{items.map((person)=>isTeam?<TeamListRow key={person.id} person={person} projects={projects.data} vacations={vacations.data} onClick={()=>navigate(`/people/${person.id}`)}/>:<StakeholderRow key={person.id} person={person} projects={projects.data} onClick={()=>navigate(`/people/${person.id}`)} onEdit={()=>setEditing(person)}/>)}</div>) : <EmptyState icon={Users} title={isTeam && onlyActive ? 'Нет активных сотрудников' : `Раздел «${title}» пуст`} action={<Button onClick={()=>setCreateOpen(true)}>Добавить</Button>}/>}</div>
    <PersonCrudDialog type={type} item={editing} open={Boolean(editing)} onOpenChange={(open)=>!open&&setEditing(null)} onSaved={state.reload} people={state.data} projects={projects.data}/>
    <PersonCrudDialog type={type} item={null} open={createOpen} onOpenChange={setCreateOpen} onSaved={state.reload} people={state.data} projects={projects.data}/>
  </Page>;
}

function TeamAvailabilityBadge({ person, vacations }) {
  const status = teamAvailability(person, vacations);
  const variant = status.key === 'active' ? 'success' : status.key === 'done' || status.key === 'off' ? 'muted' : status.key === 'inactive' ? 'muted' : 'warning';
  return <Badge variant={variant}>{status.label}</Badge>;
}

function TeamCard({ person, projects, vacations, onClick }) {
  const activeProjects = projects.filter((project) => project.status === 'active' && (project.memberIds || []).includes(person.id));
  const tags = [...activeProjects.map((project)=>project.name), ...extraPersonTags(person)].filter((tag,index,all)=>tag && all.indexOf(tag)===index);
  const availability = teamAvailability(person, vacations);
  return <button type="button" onClick={onClick} className="entity-card people-person-card team-person-card block w-full text-left">
    <div className="team-person-card-main">
      <div className="relative shrink-0"><Avatar person={person} size="lg"/>{availability.key==='active'&&<span className="team-person-status-dot is-active" aria-hidden="true"/>}</div>
      <div className="team-person-card-copy">
        <div className="team-person-card-name">{person.name}</div>
        <div className="team-person-card-role">{roleWithGrade(person)||'Участник команды'}</div>
        <div className={`team-person-card-availability is-${availability.key}`}>{availability.label.toLocaleLowerCase('ru')}</div>
        {!!tags.length && <div className="team-person-card-tags">{tags.slice(0,3).map((tag)=><span className="team-person-project-tag" key={tag}>{tag}</span>)}{tags.length>3&&<span className="team-person-project-tag">+{tags.length-3}</span>}</div>}
      </div>
      <div className="team-person-card-time">{localTimeLabel(person)}</div>
    </div>
  </button>;
}

function StakeholderCard({ person, projects, onClick }) {
  const linked = projects.filter((project)=>(project.stakeholderIds || []).includes(person.id));
  return <button type="button" onClick={onClick} className="entity-card people-person-card team-person-card stakeholder-person-card block w-full text-left">
    <div className="team-person-card-main">
      <div className="relative shrink-0"><Avatar person={person} size="lg"/></div>
      <div className="team-person-card-copy">
        <div className="team-person-card-name">{person.name}</div>
        <div className="team-person-card-role">{person.role || 'Стейкхолдер'}</div>
        <div className="team-person-card-tags">
          {linked.slice(0,3).map((project)=><span className="team-person-project-tag" key={project.id}>{project.name}</span>)}
          {linked.length>3&&<span className="team-person-project-tag">+{linked.length-3}</span>}
          {!linked.length&&<span className="team-person-card-empty-meta">Нет связанных проектов</span>}
        </div>
      </div>
    </div>
  </button>;
}

function TeamListRow({ person, projects, vacations, onClick }) {
  const activeProjects = projects.filter((project) => project.status === 'active' && (project.memberIds || []).includes(person.id));
  const availability = teamAvailability(person, vacations);
  return <EntityRow
    onOpen={onClick}
    leading={<div className="relative shrink-0"><Avatar person={person} size="sm"/>{availability.key==='active'&&<span className="team-person-status-dot is-active" aria-hidden="true"/>}</div>}
    title={person.name}
    meta={[roleWithGrade(person)||'Участник команды', ...activeProjects.slice(0,2).map((project)=>project.name)]}
    trailing={<div className="flex items-center gap-3"><TeamAvailabilityBadge person={person} vacations={vacations}/><span className="hidden w-12 text-right text-xs tabular-nums text-muted-foreground lg:block">{localTimeLabel(person)}</span></div>}
  />;
}

function StakeholderRow({ person, projects, onClick, onEdit }) {
  const related = projects.filter((project) => (project.memberIds || []).includes(person.id));
  return <EntityRow
    onOpen={onClick}
    leading={<Avatar person={person} size="sm"/>}
    title={person.name}
    meta={[person.role || 'Стейкхолдер', ...related.slice(0,2).map((project)=>project.name), person.email || null]}
    trailing={<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать стейкхолдера"><Pencil className="h-3.5 w-3.5"/></Button>}
  />;
}

function PersonCrudDialog({ type, item, open, onOpenChange, onSaved, people = [], projects = [], focusField = null, showDeleteAction = true }) {
  const isTeam = type === 'team';
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'people', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({ name: current?.name || '', role: current?.role || '', email: current?.email || '', telegram: current?.telegram || '', status: current?.status || 'active', city: current?.city || '', timezone: current?.timezone || 'Europe/Moscow', workStart: current?.workStart || '09:00', workEnd: current?.workEnd || '18:00', birthday: current?.birthday || '', hireDate: current?.hireDate || '', grade: personGrade(current), strengthsLikes: current?.strengthsLikes || '', weaknessesDislikes: current?.weaknessesDislikes || '', skillsetUrl: current?.skillsetUrl || '', iprUrl: current?.iprUrl || '', oneOnOneEveryMonths: String(current?.oneOnOneEveryMonths ?? 1), prEveryMonths: String(current?.prEveryMonths ?? 3) }),
    validate: (d) => (!d.name?.trim() ? 'Укажите имя' : null),
    buildPayload: (d) => {
      const payload = { name: d.name.trim(), role: d.role.trim(), type, email: d.email.trim(), telegram: d.telegram.trim() };
      if (isTeam) Object.assign(payload, { status: d.status, birthday: d.birthday || null, hireDate: d.hireDate || null, grade: d.grade || null, city: d.city.trim(), timezone: d.timezone.trim() || 'Europe/Moscow', workStart: d.workStart || '09:00', workEnd: d.workEnd || '18:00', strengthsLikes: d.strengthsLikes.trim(), weaknessesDislikes: d.weaknessesDislikes.trim(), skillsetUrl: d.skillsetUrl.trim(), iprUrl: d.iprUrl.trim(), oneOnOneEveryMonths: Number(d.oneOnOneEveryMonths || 0), prEveryMonths: Number(d.prEveryMonths || 0) });
      return payload;
    },
  });
  const fieldsRef = React.useRef(null);
  React.useEffect(()=>{
    if (!open || !focusField) return;
    const timer = setTimeout(()=>{ const target = fieldsRef.current?.querySelector(`[data-field="${focusField}"] :is(input,textarea,[contenteditable="true"])`); target?.scrollIntoView({ block: 'center' }); target?.focus(); }, 60);
    return ()=>clearTimeout(timer);
  }, [open, focusField]);
  const fieldProps = (name) => ({ 'data-field': name });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{isTeam ? (isEdit ? 'Редактировать сотрудника' : 'Добавить сотрудника') : (isEdit ? 'Редактировать стейкхолдера' : 'Добавить стейкхолдера')}</DialogTitle></DialogHeader><div ref={fieldsRef} className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Имя</Label><Input className="mt-1.5" value={draft.name||''} onChange={(e)=>field('name',e.target.value)} autoFocus={!focusField}/></div><div className="sm:col-span-2"><Label>Роль</Label><Input className="mt-1.5" value={draft.role||''} onChange={(e)=>field('role',e.target.value)}/></div><div {...fieldProps('email')}><Label>Email</Label><Input className="mt-1.5" value={draft.email||''} onChange={(e)=>field('email',e.target.value)}/></div><div {...fieldProps('telegram')}><Label>Telegram</Label><Input className="mt-1.5" value={draft.telegram||''} onChange={(e)=>field('telegram',e.target.value)}/></div>{isTeam&&<><div><Label>Грейд</Label><Select value={draft.grade||'none'} onValueChange={(v)=>field('grade',v==='none'?'':v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{Object.entries(GRADE_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><div><Label>Статус</Label><Select value={draft.status||'active'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(PERSON_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><div {...fieldProps('birthday')}><Label>День рождения</Label><Input className="mt-1.5" type="date" value={draft.birthday||''} onChange={(e)=>field('birthday',e.target.value)}/></div><div {...fieldProps('hireDate')}><Label>Дата найма</Label><Input className="mt-1.5" type="date" value={draft.hireDate||''} onChange={(e)=>field('hireDate',e.target.value)}/></div><div {...fieldProps('city')}><Label>Город</Label><Input className="mt-1.5" value={draft.city||''} onChange={(e)=>field('city',e.target.value)}/></div><div><Label>Часовой пояс</Label><Input className="mt-1.5" value={draft.timezone||''} onChange={(e)=>field('timezone',e.target.value)} placeholder="Europe/Moscow"/></div><div {...fieldProps('workStart')}><Label>Начало дня</Label><Input className="mt-1.5" type="time" value={draft.workStart||''} onChange={(e)=>field('workStart',e.target.value)}/></div><div><Label>Конец дня</Label><Input className="mt-1.5" type="time" value={draft.workEnd||''} onChange={(e)=>field('workEnd',e.target.value)}/></div><div {...fieldProps('oneOnOneEveryMonths')}><Label>1:1 каждые, месяцев</Label><Input className="mt-1.5" type="number" min="0" value={draft.oneOnOneEveryMonths||'0'} onChange={(e)=>field('oneOnOneEveryMonths',e.target.value)}/></div><div {...fieldProps('prEveryMonths')}><Label>PR каждые, месяцев</Label><Input className="mt-1.5" type="number" min="0" value={draft.prEveryMonths||'0'} onChange={(e)=>field('prEveryMonths',e.target.value)}/></div><div className="sm:col-span-2" {...fieldProps('strengthsLikes')}><Label>Сильные стороны / что нравится</Label><MentionEditor className="mt-1.5" value={draft.strengthsLikes||''} onChange={(value)=>field('strengthsLikes',value)} people={people} projects={projects} ariaLabel="Сильные стороны"/></div><div className="sm:col-span-2" {...fieldProps('weaknessesDislikes')}><Label>Зоны роста / что не нравится</Label><MentionEditor className="mt-1.5" value={draft.weaknessesDislikes||''} onChange={(value)=>field('weaknessesDislikes',value)} people={people} projects={projects} ariaLabel="Зоны роста"/></div><div {...fieldProps('skillsetUrl')}><Label>Скиллсет</Label><Input className="mt-1.5" type="url" value={draft.skillsetUrl||''} onChange={(e)=>field('skillsetUrl',e.target.value)}/></div><div {...fieldProps('iprUrl')}><Label>ИПР</Label><Input className="mt-1.5" type="url" value={draft.iprUrl||''} onChange={(e)=>field('iprUrl',e.target.value)}/></div></>}</div>{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}<DialogFooter className="justify-between"><div>{isEdit&&showDeleteAction&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить ${item?.name} из списка?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}

export function ProjectsPage() {
  const projects = useResource('projects');
  const people = useResource('people');
  const navigate = useNavigate();
  const [query, setQuery] = usePersistentFilter('projects', 'query', '');
  const [status, setStatus] = usePersistentFilter('projects', 'status', 'all');
  const [loadProject, setLoadProject] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewMode, setViewMode] = useViewMode('projects');
  const team = people.data.filter(isWorkloadEligiblePerson);
  const filteredProjects = projects.data.filter((project) => (status === 'all' || project.status === status) && project.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));

  return <Page>
    <PageHeader title="Проекты" actions={<Button data-primary-action="true" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Создать проект</Button>}/>
    <CatalogToolbar query={query} onQueryChange={setQuery} placeholder="Поиск проектов" viewMode={viewMode} onViewModeChange={setViewMode}><FilterSelect value={status} onChange={setStatus} filter={{ label:'Статус', all:'Все статусы', values:PROJECT_STATUS_LABEL }}/></CatalogToolbar>
    <div key={viewMode} className="view-mode-transition">{projects.error && !projects.loading ? <ErrorState error={projects.error} onRetry={projects.reload}/> : projects.loading ? (viewMode === 'list' ? <ListSkeletons/> : <CardSkeletons/>) : filteredProjects.length ? (viewMode === 'cards' ? <div className="entity-card-grid sm:grid-cols-2 lg:grid-cols-3">{filteredProjects.map((project)=><ProjectCard key={project.id} project={project} people={people.data} onOpen={()=>navigate(`/projects/${encodeURIComponent(projectRef(project))}`)} onLoad={()=>setLoadProject(project)}/>)}</div> : <div className="entity-list">{filteredProjects.map((project)=><ProjectListRow key={project.id} project={project} people={people.data} onOpen={()=>navigate(`/projects/${encodeURIComponent(projectRef(project))}`)} onLoad={()=>setLoadProject(project)}/>)}</div>) : <EmptyState icon={BriefcaseBusiness} title="Проекты не найдены" description="Измените фильтры или поисковый запрос."/>}</div>
    <ProjectCrudDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={()=>projects.reload()} people={people.data} projects={projects.data}/>
    <ProjectLoadDialog open={!!loadProject} project={loadProject} people={team} onOpenChange={(open)=>!open&&setLoadProject(null)} onSaved={()=>projects.reload()}/>
  </Page>;
}

export function TeamLoadPage() {
  const projects = useResource('projects');
  const people = useResource('people');
  const [params, setParams] = useSearchParams();
  const [loadPerson, setLoadPerson] = React.useState(null);
  const team = people.data.filter(isWorkloadEligiblePerson);
  React.useEffect(()=>{
    const requested = params.get('person');
    if (!requested || !people.data.length) return;
    const match = people.data.find((person)=>person.id===requested && isWorkloadEligiblePerson(person));
    if (match) setLoadPerson(match);
  },[params.toString(), people.data]);
  return <Page>
    <PageHeader
      title={<span className="inline-flex items-center gap-1.5">Загрузка
        <Tooltip content={<div className="max-w-[260px] space-y-1">
          <div>Загрузка = сумма весов режимов (Фултайм — 3, Парт-тайм — 2, Саппорт — 1) + 0.5 за каждый проект сверх первого.</div>
          <div className="text-muted-foreground">Низкая &lt; 1.5 · Средняя 1.5–3 · Полная 3–5 · Перегруз &gt; 5</div>
        </div>}>
          <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" aria-label="Как считается загрузка"/>
        </Tooltip>
      </span>}
    />
    <TeamLoadView people={team} projects={projects.data} loading={projects.loading || people.loading} onManage={setLoadPerson}/>
    <PersonLoadDialog open={!!loadPerson} person={loadPerson} projects={projects.data} onOpenChange={(open)=>{if(!open){setLoadPerson(null);const updated=new URLSearchParams(params);updated.delete('person');setParams(updated,{replace:true});}}} onSaved={()=>projects.reload()}/>
  </Page>;
}


function ProjectCard({ project, people, onOpen, onLoad }) {
  const members = (project.memberIds || []).map((id)=>people.find((person)=>person.id===id)).filter(Boolean);
  const cardClick = (event) => { if (event.target.closest?.('button,a,input,select,textarea')) return; onOpen(); };
  const cardKeyDown = (event) => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onOpen(); } };
  return <div role="button" tabIndex={0} onClick={cardClick} onKeyDown={cardKeyDown} className="entity-card cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"><div className="flex items-center justify-between gap-3"><h3 className="entity-card-title min-w-0 flex-1 truncate">{project.name}</h3><StatusBadge value={project.status} kind="project"/></div><div className="mt-4 flex items-center justify-between gap-3"><div className="flex -space-x-1.5">{members.slice(0,5).map((person)=><Avatar key={person.id} person={person} size="sm" className="ring-2 ring-card"/>)}</div><Button variant="ghost" size="sm" onClick={(event)=>{event.stopPropagation();onLoad();}}><Gauge className="h-4 w-4"/>Загрузка</Button></div></div>;
}

function ProjectListRow({ project, people, onOpen, onLoad }) {
  const members = (project.memberIds || []).map((id)=>people.find((person)=>person.id===id)).filter(Boolean);
  return <EntityRow
    onOpen={onOpen}
    title={project.name}
    trailing={<div className="flex items-center gap-3"><div className="hidden -space-x-1.5 sm:flex">{members.slice(0,4).map((person)=><Avatar key={person.id} person={person} size="xs" className="ring-2 ring-card"/>)}</div><StatusBadge value={project.status} kind="project"/><Button variant="ghost" size="sm" onClick={onLoad}><Gauge className="h-4 w-4"/><span className="hidden lg:inline">Загрузка</span></Button></div>}
  />;
}

function TeamLoadView({ people, projects, loading, onManage }) {
  if (loading) return <div className="space-y-2">{[1,2,3,4].map((item)=><Skeleton key={item} className="h-16"/>)}</div>;
  return <div className="entity-list">{people.map((person)=>{const summary=personProjectLoadSummary(person.id,projects);return <div key={person.id} className="entity-row grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_150px] md:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><Avatar person={person} size="sm"/><div><div className="entity-row-title">{person.name}</div><div className="entity-row-meta flex flex-wrap gap-1">{summary.projects.map((project)=><span key={project.id} className="team-person-project-tag">{project.name}</span>)}</div></div></div></div><div className="flex items-center md:justify-start"><Badge variant={summary.level.tone}>{summary.level.label}</Badge></div><Button variant="outline" size="sm" onClick={()=>onManage(person)}>Настроить</Button></div>})}</div>;
}

export function PersonDetailPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useEndpoint(`/api/people/${encodeURIComponent(id)}/profile`, [id]);
  const allProjects = useResource('projects');
  const allPeople = useResource('people');
  const viewerSettings = useEndpoint('/api/settings');
  const [loadOpen, setLoadOpen] = React.useState(false);
  const [selectedLoadProjectId, setSelectedLoadProjectId] = React.useState(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editFocus, setEditFocus] = React.useState(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const openEdit = (focusField = null) => { setEditFocus(focusField); setEditOpen(true); };
  const relationsRef = React.useRef(null);
  const [activeTab, setActiveTab] = React.useState('tasks');
  const [taskCreate, setTaskCreate] = React.useState(null);
  const [meetingCreate, setMeetingCreate] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = useDetailSidebarState(`garden-person-detail-sidebar:${id}`, false);
  const addStickyRef = React.useRef(null);
  const stickyPreview = useEndpoint(`/api/comments/person/${encodeURIComponent(id)}`, [id]);
  const stickyDefaultApplied = React.useRef(false);
  React.useEffect(()=>{
    if (stickyDefaultApplied.current || stickyPreview.loading || !state.data?.person) return;
    stickyDefaultApplied.current = true;
    let stored = null;
    try { stored = localStorage.getItem(`garden-person-detail-sidebar:${id}`); } catch (_) {}
    if (stored === 'open' || stored === 'closed') return;
    const hasStickers = Boolean(stickyPreview.data?.length) || Boolean(String(state.data.person.notes || '').trim());
    if (hasStickers) setSidebarOpen(true);
  }, [id, stickyPreview.loading, stickyPreview.data, state.data?.person?.id]);
  if (state.loading) return <Page><Skeleton className="h-80"/></Page>;
  if (!state.data) return <Page><EmptyState title="Человек не найден"/></Page>;
  const { person, tasks = [], projects = [], meetings = [], issues = [], agreements = [], journal = [], vacations = [] } = state.data;
  const patchPerson = async (body) => { await api.resource('people').update(person.id, body); await state.reload(); };
  const removePerson = async () => {
    setDeleting(true);
    try {
      await api.resource('people').remove(person.id);
      setDeleteOpen(false);
      navigate(back);
    } finally {
      setDeleting(false);
    }
  };
  const isTeam = person.type === 'team';
  const back = isTeam ? '/team' : '/stakeholders';
  const summary = isTeam ? personProjectLoadSummary(person.id, allProjects.data) : null;
  const availability = isTeam ? teamAvailability(person, vacations) : null;
  const regularTasks = tasks.filter((task)=>task.taskType !== 'development' && !task.archivedAt && task.status !== 'done');
  const openIssues = issues.filter((issue)=>issue.status !== 'resolved');
  const openAgreements = agreements.filter((agreement)=>agreement.status !== 'done');
  const openTasks = tasks.filter((task)=>!task.archivedAt && task.status !== 'done');
  const today = localTodayKey();
  const oneOnOne = isTeam ? personMeetingCadence(meetings, '1:1', person.oneOnOneEveryMonths, today) : null;
  const performanceReview = isTeam ? personMeetingCadence(meetings, 'pr', person.prEveryMonths, today) : null;
  const createTask = (projectId) => setTaskCreate({ projectId: projectId || 'none' });
  const scheduleMeeting = (type) => setMeetingCreate({ type, participantIds: [person.id] });
  const showRelationsTab = (tab) => { setActiveTab(tab); relationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const telegramUrl = personTelegramUrl(person.telegram);
  const attentionSignals = [];
  if (isTeam && isTeamlead(user)) {
    summary.projects.filter((project)=>!openTasks.some((task)=>task.projectId === project.id))
      .forEach((project)=>attentionSignals.push({ key: `no-tasks-${project.id}`, tone: 'warning', label: `Нет задач по активному проекту «${project.name}»`, action: { label: 'Создать задачу', onClick: ()=>createTask(project.id) } }));
    if (summary.level.tone === 'muted') attentionSignals.push({ key: 'incomplete-load', tone: 'warning', label: `Неполная загрузка: ${summary.level.label.toLowerCase()}`, action: { label: 'Настроить загрузку', onClick: ()=>setLoadOpen(true) } });
    if (summary.level.tone === 'danger') attentionSignals.push({ key: 'overload', tone: 'danger', label: 'Перегруз: загрузка выше нормы', action: { label: 'Настроить загрузку', onClick: ()=>setLoadOpen(true) } });
    [['1:1', '1:1', oneOnOne], ['PR', 'pr', performanceReview]].forEach(([label, type, cadence])=>{
      if (cadence.state === 'overdue') attentionSignals.push({ key: `cadence-${type}`, tone: 'warning', label: `${label} просрочена на ${daysLabel(cadence.overdueDays)}`, action: { label: `Назначить ${label}`, onClick: ()=>scheduleMeeting(type) } });
    });
    if (openIssues.length) attentionSignals.push({ key: 'issues', tone: 'warning', label: `Активные проблемы: ${openIssues.length}`, action: { label: 'Показать', onClick: ()=>showRelationsTab('issues') } });
    const vacation = personUpcomingVacation(person.id, vacations);
    if (vacation) attentionSignals.push({ key: 'vacation', tone: 'warning', label: `Скоро в отпуск: с ${formatDate(vacation.startDate)}` });
  }
  const tabs = [
    ['tasks','Задачи',regularTasks.length],
    ['issues','Проблемы',openIssues.length],
    ['meetings','Встречи',meetings.length],
    ['journal','Журнал',journal.length],
    ['agreements','Договорённости',openAgreements.length],
  ];

  const tabBody = () => {
    if (activeTab === 'tasks') return <TaskList items={regularTasks} empty="Нет задач" navigate={navigate} onStatusChanged={state.reload} people={allPeople.data} projects={allProjects.data}/>;
    if (activeTab === 'meetings') return <MeetingList items={meetings} empty="Нет встреч" navigate={navigate} people={allPeople.data} projects={allProjects.data}/>;
    if (activeTab === 'issues') return <div className="surface overflow-hidden">{openIssues.length ? openIssues.map((item)=><EntityRow key={item.id} className="task-entity-row" onOpen={()=>navigate(`/issues/${encodeURIComponent(resourceRef('issues', item))}`)} leading={<IssueStatusIcon issue={item} onChanged={state.reload}/>} title={<span className="flex min-w-0 items-center gap-2"><TaskPriorityIcon priority={item.severity === 'high' ? 'high' : 'normal'}/><span className="min-w-0 truncate"><MentionText text={titleOf(item)} onNavigate={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`)}/></span></span>}/>) : <div className="p-4 text-sm text-muted-foreground">Нет проблем</div>}</div>;
    if (activeTab === 'agreements') return <CompactList items={openAgreements} empty="Нет договорённостей" href={(item)=>`/agreements/${encodeURIComponent(resourceRef('agreements', item))}`} leading={(item)=><AgreementStatusCheckbox agreement={item} onChanged={state.reload}/>} meta={(item)=>item.dueDate?`До ${formatDate(item.dueDate)}`:null}/>;
    if (activeTab === 'journal') return <CompactList className="person-journal-relations" items={journal} empty="Нет связанных записей" href={(item)=>`/journal?entry=${encodeURIComponent(item.noteKey || item.id)}`} meta={(item)=>formatDate(item.createdAt)}/>;
    return null;
  };

  return <Page narrow className={`person-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}>
    <div className="person-profile-nav"><Button variant="ghost" size="sm" onClick={()=>navigate(back)}><ArrowLeft className="h-4 w-4"/>{isTeam?'Команда':'Стейкхолдеры'}</Button><div className="detail-page-header-actions"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setEditOpen(true)}><Pencil className="h-4 w-4"/>Редактировать</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onSelect={()=>setDeleteOpen(true)}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu><DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров"/></div></div>

    <div className="person-card-stack">
      <section className="person-card person-card--hero">
        <div className="person-card-hero-main">
          <div className="relative shrink-0"><Avatar person={person} size="xl"/>{isTeam&&availability.key==='active'&&<span className="team-person-status-dot team-person-status-dot--profile is-active" title={availability.label} aria-hidden="true"/>}</div>
          <div className="min-w-0 flex-1">
            <h1 className="person-card-name">{person.name}</h1>
            <div className="person-card-role">{roleWithGrade(person)||person.role||'Участник команды'}</div>
            {isTeam&&<div className={`team-person-card-availability is-${availability.key}`}>{availability.label}</div>}
          </div>
          <div className="person-card-hero-actions">
            {isTeam&&<Button variant="outline" size="sm" onClick={()=>scheduleMeeting('1:1')}><CalendarPlus className="h-4 w-4"/>Встреча</Button>}
            <Button variant="outline" size="sm" onClick={()=>createTask()}><Plus className="h-4 w-4"/>Задача</Button>
            {telegramUrl&&<a href={telegramUrl} target="_blank" rel="noreferrer" className="person-hero-icon-link" aria-label="Написать в Telegram" title="Написать в Telegram"><Send className="h-4 w-4"/></a>}
          </div>
        </div>
      </section>

      <PersonAttentionSection signals={attentionSignals}/>

      {isTeam && <>
        <div className="person-card-row">
          <section className="person-card person-development-card">
            <SectionHeader title="Развитие" compact/>
            <div className="person-development-tab-body">
              <div className="person-contact-grid">
                <PersonContextItem label="ИПР" value={person.iprUrl?<a href={person.iprUrl} target="_blank" rel="noreferrer" className="person-profile-link">Открыть ИПР</a>:null} onAdd={()=>openEdit('iprUrl')} addLabel="Добавить ссылку"/>
                <PersonContextItem label="Скиллсет" value={person.skillsetUrl?<a href={person.skillsetUrl} target="_blank" rel="noreferrer" className="person-profile-link">Открыть скиллсет</a>:null} onAdd={()=>openEdit('skillsetUrl')} addLabel="Добавить ссылку"/>
                <PersonCadenceItem label="Ближайший 1:1" cadence={oneOnOne} today={today} onSchedule={()=>scheduleMeeting('1:1')}/>
                <PersonCadenceItem label="Ближайший PR" cadence={performanceReview} today={today} onSchedule={()=>scheduleMeeting('pr')}/>
                <div className="person-development-notes">
                  <PersonTextContext title="Сильные стороны:" titleClassName="person-context-label person-context-label--section" text={person.strengthsLikes || person.developmentFocus} onAdd={()=>openEdit('strengthsLikes')} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
                  <PersonTextContext title="Зоны роста:" titleClassName="person-context-label person-context-label--section" text={person.weaknessesDislikes} onAdd={()=>openEdit('weaknessesDislikes')} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
                </div>
              </div>
            </div>
          </section>

          <section className="person-card">
            <SectionHeader title={<><span>Загрузка</span><span className="person-load-inline-separator"> — </span><span className="person-load-inline-status">{String(summary.level.label || '').toLowerCase()}</span></>} compact/>
            {summary.projects.length ? <PersonLoadBreakdown summary={summary} personId={person.id} onOpenProject={(project)=>{ setSelectedLoadProjectId(project.id); setLoadOpen(true); }}/> : <div className="person-card-empty"><div className="person-card-empty-title">Проектной загрузки нет</div><div className="person-card-empty-copy">Для сотрудника пока не настроена загрузка по проектам.</div><Button variant="outline" size="sm" className="mt-3" onClick={()=>setLoadOpen(true)}>Добавить проекты</Button></div>}
          </section>
        </div>

        <section className="person-card">
          <SectionHeader title="О сотруднике" compact/>
          <div className="person-contact-grid person-contact-grid--paired">
            <PersonContextItem label="Дата найма" value={person.hireDate?formatDate(person.hireDate):null} onAdd={()=>openEdit('hireDate')}/>
            <PersonContextItem label="Стаж" value={person.hireDate?personTenureLabel(person.hireDate):null}/>
            <PersonContextItem label="Дата рождения" value={person.birthday?<PersonBirthday birthday={person.birthday} today={today}/>:null} onAdd={()=>openEdit('birthday')}/>
            <PersonContextItem label="Город" value={person.city||null} onAdd={()=>openEdit('city')}/>
            <PersonContextItem label="Рабочая почта" value={person.email?<span className="person-copyable"><a className="person-profile-link" href={`mailto:${person.email}`}>{person.email}</a><CopyValueButton value={person.email} label="Скопировать почту"/></span>:null} onAdd={()=>openEdit('email')}/>
            <PersonContextItem label="Тег в Telegram" value={person.telegram?(telegramUrl?<a className="person-profile-link" href={telegramUrl} target="_blank" rel="noreferrer">@{String(person.telegram).trim().replace(/^@/,'')}</a>:person.telegram):null} onAdd={()=>openEdit('telegram')}/>
            <PersonContextItem label="График работы" value={person.workStart&&person.workEnd?workScheduleLabel(person, viewerSettings.data?.timezone):null} onAdd={()=>openEdit('workStart')}/>
            <PersonContextItem label="Местное время" value={localTimeLabel(person)}/>
          </div>
        </section>
      </>}

      <section ref={relationsRef} className="person-card person-relations-card">
        <SectionHeader title="Связи" compact/>
        <Tabs className="person-tabs" ariaLabel="Связи сотрудника" value={activeTab} onValueChange={setActiveTab} items={tabs.map(([value,label,count])=>({value,label,count}))}/>
        <div className="person-relations-body">{tabBody()}</div>
      </section>


    </div>

    <DetailSidebar
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      title="Заметки на полях"
      showLabel="Показать панель стикеров"
      hideLabel="Скрыть панель стикеров"
      showEdgeToggle={false}
      count={stickyPreview.data?.length || 0}
      headerActions={<Button variant="ghost" size="icon-sm" onClick={()=>addStickyRef.current?.()} aria-label="Добавить стикер" title="Добавить стикер"><Plus className="h-4 w-4"/></Button>}
    >
      <StickyNotes
        entityType="person"
        entityId={person.id}
        notesPrefix={person.name || ''}
        addButtonRef={addStickyRef}
        legacyNotes={person.notes?.trim() ? [{ text: person.notes.trim(), color:'yellow' }] : []}
        onLegacyMigrated={()=>patchPerson({notes:''})}
      />
    </DetailSidebar>

    {isTeam&&<PersonLoadDialog open={loadOpen} person={person} projects={allProjects.data} highlightProjectId={selectedLoadProjectId} onOpenChange={(next)=>{ setLoadOpen(next); if (!next) setSelectedLoadProjectId(null); }} onSaved={()=>{allProjects.reload();state.reload();}}/>}
    <CreateTaskDialog open={!!taskCreate} onOpenChange={(open)=>{if(!open)setTaskCreate(null);}} people={allPeople.data} projects={allProjects.data} initialAssignee={isTeam ? person.id : 'none'} initialProject={taskCreate?.projectId || 'none'} onCreated={()=>state.reload()}/>
    <CreateMeetingDialog open={!!meetingCreate} onOpenChange={(open)=>{if(!open)setMeetingCreate(null);}} preset={meetingCreate || {}} people={allPeople.data} projects={allProjects.data} onSaved={()=>state.reload()}/>
    <PersonCrudDialog type={person.type} item={person} open={editOpen} focusField={editFocus} onOpenChange={(open)=>{setEditOpen(open);if(!open)setEditFocus(null);}} onSaved={state.reload} people={allPeople.data} projects={allProjects.data} showDeleteAction={false}/>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Удалить ${person?.name} из списка?`} onConfirm={removePerson} busy={deleting}/>
  </Page>;
}

function personTenureLabel(hireDate) {
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return 'Не указано';
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearWord = years % 10 === 1 && years % 100 !== 11 ? 'год' : (years % 10 >= 2 && years % 10 <= 4 && (years % 100 < 12 || years % 100 > 14) ? 'года' : 'лет');
  const monthWord = rest % 10 === 1 && rest % 100 !== 11 ? 'месяц' : (rest % 10 >= 2 && rest % 10 <= 4 && (rest % 100 < 12 || rest % 100 > 14) ? 'месяца' : 'месяцев');
  if (!years) return `${rest} ${monthWord}`;
  if (!rest) return `${years} ${yearWord}`;
  return `${years} ${yearWord} ${rest} ${monthWord}`;
}

function personIntervalLabel(value) {
  const months = Number(value) || 0;
  if (!months) return 'Не запланировано';
  const mod10 = months % 10, mod100 = months % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'месяц' : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'месяца' : 'месяцев');
  return `Раз в ${months} ${word}`;
}
function pluralRu(count, one, few, many) {
  const mod10 = count % 10, mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
function daysLabel(days) { return `${days} ${pluralRu(days, 'день', 'дня', 'дней')}`; }
function personTelegramUrl(value) {
  const handle = String(value || '').trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{3,32}$/.test(handle) ? `https://t.me/${handle}` : null;
}
function PersonEmptyValue({ text = 'Не указано', onAdd, addLabel = 'Добавить' }) {
  return <span className="person-empty-value"><span className="text-muted-foreground">{text}</span>{onAdd ? <button type="button" className="person-inline-action" onClick={onAdd}>{addLabel}</button> : null}</span>;
}
function PersonContextItem({ label, value, empty = 'Не указано', onAdd, addLabel }) {
  return <div className="person-context-item"><div className="person-context-label">{label}</div><div className="person-context-value">{value ?? <PersonEmptyValue text={empty} onAdd={onAdd} addLabel={addLabel}/>}</div></div>;
}
function PersonTextContext({ title, text, onNavigateMention, onAdd, titleClassName = "person-context-label" }) {
  return <div className="person-text-context">{title ? <div className={titleClassName}>{title}</div> : null}<div className="person-text-context-value">{text ? <MarkdownText text={text} onNavigate={onNavigateMention}/> : <PersonEmptyValue onAdd={onAdd}/>}</div></div>;
}
function relativeDaysAgo(dateKey, today) {
  const days = daysBetweenKeys(dateKey, today);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days > 60) return formatDate(dateKey);
  return `${daysLabel(days)} назад`;
}
function PersonCadenceItem({ label, cadence, today, onSchedule }) {
  const { state, last, next, due, months, overdueDays } = cadence;
  if (state === 'off') return <PersonContextItem label={label} value={null} empty="Не запланировано"/>;
  const scheduleButton = <button type="button" className="person-inline-action" onClick={onSchedule}>Назначить</button>;
  const main = {
    scheduled: <span>{next === today ? 'Сегодня' : formatDate(next)}</span>,
    never: <span className="person-empty-value"><span className="text-muted-foreground">Ещё не проводилась</span>{scheduleButton}</span>,
    due: <span className="person-empty-value"><span>Следующая — до {formatDate(due)}</span>{scheduleButton}</span>,
    overdue: <span className="person-empty-value"><span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>Просрочена на {daysLabel(overdueDays || 0)}</span>{scheduleButton}</span>,
  }[state];
  const sub = [personIntervalLabel(months), last ? `последняя ${relativeDaysAgo(last, today)}` : null].filter(Boolean).join(' · ');
  return <PersonContextItem label={label} value={<div>{main}<div className="person-context-sub">{sub}</div></div>}/>;
}
function PersonBirthday({ birthday, today }) {
  const [, month, day] = String(birthday).slice(0, 10).split('-').map(Number);
  const year = Number(today.slice(0, 4));
  const key = (y) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let days = daysBetweenKeys(today, key(year));
  if (days < 0) days = daysBetweenKeys(today, key(year + 1));
  const soon = days === 0 ? 'сегодня' : days <= 14 ? `через ${daysLabel(days)}` : null;
  return <span>{formatDate(birthday)}{soon ? <span className="person-context-soon"> · {soon}</span> : null}</span>;
}
function CopyValueButton({ value, label }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(()=>setCopied(false), 1500); } catch (_) {} };
  const text = copied ? 'Скопировано' : label;
  return <button type="button" className="person-copy-button" onClick={copy} aria-label={text} title={text}>{copied ? <Check className="h-3.5 w-3.5"/> : <Copy className="h-3.5 w-3.5"/>}</button>;
}
const LOAD_SERIES_COUNT = 8;
// Share of the person's load weight per project; largest-remainder rounding keeps the total at exactly 100%.
function personLoadShares(projects, personId) {
  const items = projects.map((project)=>{const option=PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode];return { project, option, weight: option.weight };});
  const total = items.reduce((sum, item)=>sum + item.weight, 0) || 1;
  const withRaw = items.map((item)=>({ ...item, raw: item.weight / total * 100 }));
  withRaw.forEach((item)=>{ item.percent = Math.floor(item.raw); });
  let rest = 100 - withRaw.reduce((sum, item)=>sum + item.percent, 0);
  [...withRaw].sort((a, b)=>(b.raw - b.percent) - (a.raw - a.percent)).forEach((item)=>{ if (rest > 0) { item.percent += 1; rest -= 1; } });
  return withRaw;
}
function PersonLoadBreakdown({ summary, personId, onOpenProject }) {
  const shares = personLoadShares(summary.projects, personId);
  const seriesVar = (index) => `var(--series-${Math.min(index, LOAD_SERIES_COUNT - 1) + 1})`;
  return <div className="person-load-breakdown">
    {shares.map((item, index)=><button key={item.project.id} type="button" className="person-load-item" onClick={()=>onOpenProject(item.project)}><span className="person-load-item-main"><span className="person-load-swatch" style={{ background: seriesVar(index) }} aria-hidden="true"/><span className="person-load-item-title">{item.project.name}</span></span><span className="person-load-item-mode">{item.option.label}</span></button>)}
  </div>;
}
function PersonAttentionSection({ signals }) {
  if (!signals.length) return null;
  return <section className="person-card person-attention-card">
    <SectionHeader title="Обратить внимание" compact/>
    <div className="flex flex-col gap-2.5">
      {signals.map((signal) => <div key={signal.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={cn('inline-flex items-center gap-2', signal.tone === 'danger' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300')}><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true"/>{signal.label}</span>
        {signal.action ? <button type="button" className="person-inline-action" onClick={signal.action.onClick}>{signal.action.label}</button> : null}
      </div>)}
    </div>
  </section>;
}

function LoadSummary({ summary, projects, personId }) {
  return <div className="surface p-4"><div className="flex items-center justify-between gap-3"><Badge variant={summary.level.tone}>{summary.level.label}</Badge></div><div className="mt-4 space-y-2">{summary.projects.length?summary.projects.map((project)=>{const mode=normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode;const option=PROJECT_LOAD_OPTIONS[mode];return <div key={project.id} className="flex items-center justify-between gap-3 text-sm"><Link to={`/projects/${encodeURIComponent(projectRef(project))}`} className="truncate font-medium hover:underline">{project.name}</Link><span className="shrink-0 text-xs text-muted-foreground">{option.label}</span></div>}):<span className="text-sm text-muted-foreground">Нет активной проектной загрузки.</span>}</div></div>;
}

function InlineProjectKeyEditor({ project, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(project.projectKey || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setValue(project.projectKey || ''); }, [project.projectKey]);
  React.useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const cancel = () => { setValue(project.projectKey || ''); setError(''); setEditing(false); };
  const save = async () => {
    const next = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,4}$/.test(next)) { setError('Ключ проекта: от 1 до 4 латинских букв или цифр'); return; }
    if (next === project.projectKey) { setEditing(false); return; }
    setSaving(true); setError('');
    try {
      const updated = await api.resource('projects').update(project.id, { projectKey: next });
      await onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e?.status === 409 ? 'Такой ключ проекта уже используется' : e?.status === 400 ? 'Проверьте ключ проекта' : e?.status === 403 ? 'Недостаточно прав' : 'Не удалось сохранить ключ');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return <button type="button" className="entity-key-button" onClick={()=>setEditing(true)} aria-label="Изменить ключ проекта">{project.projectKey}</button>;

  return <div className="space-y-1">
    <Input
      ref={inputRef}
      className="uppercase"
      maxLength={4}
      value={value}
      disabled={saving}
      onChange={(e)=>{ setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); setError(''); }}
      onBlur={save}
      onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key==='Escape') { e.preventDefault(); cancel(); } }}
    />
    {error && <div className="text-[12px] text-destructive">{error}</div>}
  </div>;
}

export function ProjectDetailPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const state = useEndpoint(`/api/projects/${encodeURIComponent(id)}/detail`, [id]);
  const people = useResource('people');
  const allProjectsForMentions = useResource('projects');
  const [loadOpen, setLoadOpen] = React.useState(false);
  const [loadPerson, setLoadPerson] = React.useState(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = useDetailSidebarState('garden-project-detail-sidebar');
  const [contextTab, setContextTab] = React.useState('team');
  const [linkName, setLinkName] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkError, setLinkError] = React.useState('');
  const [linkBusy, setLinkBusy] = React.useState(false);
  const addStickyRef = React.useRef(null);
  const [stickyCount, setStickyCount] = React.useState(0);
  const mentionNavigate = (kind, mentionId) => navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`);
  if (state.loading) return <Page narrow><Skeleton className="h-80"/></Page>;
  if (!state.data) return <Page narrow><EmptyState title="Проект не найден"/></Page>;
  const { project, tasks = [], members = [], issues = [] } = state.data;
  const externalLinks = Array.isArray(project.externalLinks) ? project.externalLinks : [];
  const activeTasks = tasks.filter((task)=>!task.archivedAt && task.status !== 'done');
  const openIssues = issues.filter((issue)=>issue.status !== 'resolved');

  const patch = async (body) => {
    const updated = await api.resource('projects').update(project.id, body);
    state.setData({ ...state.data, project: { ...project, ...updated } });
    return updated;
  };
  const toggleArchive = () => patch({ archivedAt: project.archivedAt ? null : new Date().toISOString() });
  const remove = async () => { if (!confirm('Удалить проект?')) return; await api.resource('projects').remove(project.id); navigate('/projects'); };
  const saveExternalLinks = async (links) => { setLinkBusy(true); setLinkError(''); try { await patch({ externalLinks: links }); } finally { setLinkBusy(false); } };
  const addExternalLink = async (event) => { event.preventDefault(); const name = linkName.trim(), url = linkUrl.trim(); if (!name || !url) { setLinkError('Укажите название и ссылку'); return; } if (!/^https?:\/\//i.test(url)) { setLinkError('Ссылка должна начинаться с http:// или https://'); return; } await saveExternalLinks([...externalLinks, { name, url }]); setLinkName(''); setLinkUrl(''); };
  const removeExternalLink = async (index) => saveExternalLinks(externalLinks.filter((_, itemIndex)=>itemIndex!==index));

  const contextTabs = [
    ['team', 'Команда', members.length],
    ['tasks', 'Задачи', activeTasks.length],
    ['issues', 'Проблемы', openIssues.length],
    ['links', 'Ссылки', externalLinks.length],
  ];
  const contextTabBody = () => {
    if (contextTab === 'team') return <div className="task-detail-tab-content"><div className="task-relations-list">{members.length ? members.map((person)=>{
      const mode = normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;
      const load = PROJECT_LOAD_OPTIONS[mode];
      return <div key={person.id} className="task-relation-row">
        <Link to={`/people/${person.id}`} className="task-relation-main"><Avatar person={person} size="sm"/><div className="min-w-0"><div className="task-relation-title">{person.name}</div><div className="task-relation-kind">{person.role || 'Участник'}</div></div></Link>
        <div className="task-relation-side"><span className="task-relation-load">{load.label}</span><Button variant="ghost" size="sm" onClick={()=>setLoadPerson(person)}>Изменить</Button></div>
      </div>;
    }) : <div className="task-relations-empty">Команда проекта не задана.</div>}</div></div>;

    if (contextTab === 'tasks') return <div className="task-detail-tab-content"><TaskList items={activeTasks} empty="Нет активных задач" navigate={navigate} onStatusChanged={state.reload} people={people.data} projects={allProjectsForMentions.data}/></div>;

    if (contextTab === 'issues') return <div className="task-detail-tab-content"><CompactList items={openIssues} empty="Нет открытых проблем" href={(item)=>`/issues/${encodeURIComponent(resourceRef('issues', item))}`} meta={(item)=><StatusBadge value={item.status} kind="issue"/>}/></div>;

    if (contextTab === 'links') return <div className="task-detail-tab-content">
      {externalLinks.length ? <div className="task-relations-list">{externalLinks.map((link,index)=><div key={`${link.url}:${index}`} className="task-relation-row"><a href={link.url} target="_blank" rel="noreferrer" className="task-relation-main"><Link2 className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="task-relation-title">{link.name || link.title || link.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/></a><Button variant="ghost" size="icon-sm" aria-label="Удалить ссылку" onClick={()=>removeExternalLink(index)} disabled={linkBusy}><Trash2 className="h-3.5 w-3.5"/></Button></div>)}</div> : <div className="task-relations-empty">Внешних ссылок пока нет.</div>}
      <form onSubmit={addExternalLink} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto]"><Input value={linkName} onChange={(e)=>setLinkName(e.target.value)} placeholder="Название"/><Input value={linkUrl} onChange={(e)=>setLinkUrl(e.target.value)} placeholder="https://…" inputMode="url"/><Button type="submit" variant="secondary" disabled={linkBusy}>Добавить</Button></form>
      {linkError && <div className="mt-2 text-xs text-destructive">{linkError}</div>}
    </div>;


    return null;
  };

  return <Page narrow className={`task-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}> 
    <div className="mb-7 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={()=>navigate('/projects')}><ArrowLeft className="h-4 w-4"/>Проекты</Button>
      <div className="detail-page-header-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggleArchive}>{project.archivedAt ? <ArchiveRestore className="h-4 w-4"/> : <Archive className="h-4 w-4"/>}{project.archivedAt ? 'Восстановить из архива' : 'Архивировать проект'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История версий</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem className="text-destructive" onSelect={remove}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров"/>
      </div>
    </div>

    <MentionEditor
      value={project.name || ''}
      onChange={(name)=>state.setData({ ...state.data, project: { ...project, name } })}
      onBlur={(name)=>patch({ name: name.trim() })}
      people={people.data}
      projects={[]}
      singleLine
      editorClassName="things-task-detail-title task-title-mention-editor"
      ariaLabel="Название проекта"
    />

    <div className="task-detail-workspace-grid">
      <div className="task-detail-main">
        <header className="things-task-detail-header task-detail-reference-header task-detail-unboxed-header">
          <div className="task-detail-reference-section task-detail-description-section">
            <SectionHeader title="Описание" compact/>
            <EditableMarkdownDescription value={project.description || ''} onChange={(value)=>state.setData({ ...state.data, project: { ...project, description: value } })} onSave={(value)=>patch({ description: value })} people={people.data} projects={allProjectsForMentions.data} placeholder="Добавить описание…" className="things-task-detail-description task-detail-reference-description" editorClassName="things-task-detail-description task-detail-reference-description" onNavigate={mentionNavigate} ariaLabel="Описание проекта"/>
          </div>
        </header>

        <div className="task-detail-layout py-7">
          
          <div className="task-detail-content-card">
            <Tabs className="task-context-tabs" ariaLabel="Разделы проекта" value={contextTab} onValueChange={setContextTab} items={contextTabs.map(([value,label,count])=>({value,label,count}))}/>
            <div className="task-detail-tab-panel">
              {contextTabBody()}
            </div>
          </div>
        </div>
      </div>
      <aside className="task-properties-column" aria-label="Свойства проекта">
        <SectionHeader title="Свойства" compact className="task-properties-title"/>
        <div className="task-properties-list">
          <div className="task-property-row"><span className="task-property-label">Статус</span><div className="task-attribute-item"><ProjectStatusIcon project={project} onChanged={(updated)=>state.setData({ ...state.data, project: { ...project, ...updated } })} showLabel/></div></div>
          <div className="task-property-row"><span className="task-property-label">Ключ</span><div className="task-attribute-item"><InlineProjectKeyEditor project={project} onSaved={(updated)=>state.setData({ ...state.data, project: { ...project, ...updated } })}/></div></div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={()=>setLoadOpen(true)}><Gauge className="h-4 w-4"/>Управлять загрузкой</Button>
      </aside>
    </div>

    <DetailSidebar
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      title="Заметки на полях"
      showLabel="Показать панель стикеров"
      hideLabel="Скрыть панель стикеров"
      showEdgeToggle={false}
      count={stickyCount}
      headerActions={<Button variant="ghost" size="icon-sm" onClick={()=>addStickyRef.current?.()} aria-label="Добавить стикер" title="Добавить стикер"><Plus className="h-4 w-4"/></Button>}
    >
      <StickyNotes entityType="project" entityId={project.id} notesPrefix={project.name || ''} addButtonRef={addStickyRef} onCountChange={setStickyCount}/>
    </DetailSidebar>

    <VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="projects" entityId={project.id} onRestored={(restored)=>state.setData({ ...state.data, project: restored })}/>
    <ProjectLoadDialog open={loadOpen} project={project} people={people.data.filter(isWorkloadEligiblePerson)} onOpenChange={setLoadOpen} onSaved={()=>state.reload()}/>
    <PersonLoadDialog open={Boolean(loadPerson)} person={loadPerson} projects={allProjectsForMentions.data} onOpenChange={(open)=>{ if (!open) setLoadPerson(null); }} onSaved={()=>{allProjectsForMentions.reload();state.reload();}}/>
  </Page>;
}

function ProjectCrudDialog({ open, onOpenChange, onSaved, people = [], projects = [] }) {
  const { draft, field, saving, error, save } = useCrudDialogForm({
    resource: 'projects', open, item: null, onOpenChange, onSaved,
    buildDraft: () => ({ name: '', projectKey: '', description: '', status: 'active' }),
    validate: (d) => {
      const key = String(d.projectKey || '').trim().toUpperCase();
      if (!d.name?.trim()) return 'Укажите название';
      if (!/^[A-Z0-9]{1,4}$/.test(key)) return 'Ключ проекта: от 1 до 4 латинских букв или цифр';
      return null;
    },
    buildPayload: (d) => ({
      name: d.name.trim(), projectKey: String(d.projectKey || '').trim().toUpperCase(),
      description: String(d.description || '').trim(), status: d.status, memberIds: [], memberLoads: {},
    }),
    forbiddenMessages: { save: 'Недостаточно прав' },
    mapSaveError: (e) => e?.status === 409 ? 'Такой ключ проекта уже используется' : e?.status === 400 ? 'Проверьте ключ проекта' : e?.status === 403 ? 'Недостаточно прав' : 'Не удалось сохранить проект',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Добавить проект</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input className="mt-1.5" value={draft.name||''} onChange={(e)=>field('name',e.target.value)} autoFocus/></div><div><Label>Ключ проекта</Label><Input className="mt-1.5 uppercase" maxLength={4} value={draft.projectKey||''} onChange={(e)=>field('projectKey',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="KODE"/><div className="mt-1 text-[12px] text-muted-foreground">До 4 латинских букв или цифр.</div></div><div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} ariaLabel="Описание"/></div><div><Label>Статус</Label><Select value={draft.status||'active'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(PROJECT_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></DialogFooter></DialogContent></Dialog>;
}

function ProjectLoadDialog({ open, project, people, onOpenChange, onSaved }) {
  const eligiblePeople = people.filter(isWorkloadEligiblePerson);
  const eligibleIds = new Set(eligiblePeople.map((person) => person.id));
  const [selected, setSelected] = React.useState([]);
  const [loads, setLoads] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(()=>{if(!open||!project)return;const allowedIds=new Set(people.filter(isWorkloadEligiblePerson).map((person)=>person.id));setSelected((project.memberIds||[]).filter((personId)=>allowedIds.has(personId)));setLoads({...project.memberLoads});setError('');},[open,project?.id]);
  if (!project) return null;
  const toggle = (personId) => setSelected((current)=>current.includes(personId)?current.filter((id)=>id!==personId):[...current,personId]);
  const save = async()=>{setSaving(true);setError('');try{const cleanSelected=selected.filter((personId)=>eligibleIds.has(personId));const memberLoads=Object.fromEntries(cleanSelected.map((personId)=>[personId,normalizeProjectMemberLoad(loads[personId]||'full').mode]));await api.resource('projects').update(project.id,{memberIds:cleanSelected,memberLoads});onOpenChange(false);await onSaved?.();}catch(e){setError(e?.status===403?'Недостаточно прав для изменения загрузки':'Не удалось сохранить загрузку');}finally{setSaving(false)}};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Управление загрузкой</DialogTitle></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{eligiblePeople.map((person)=>{const included=selected.includes(person.id);const mode=normalizeProjectMemberLoad(loads[person.id]||'full').mode;return <div key={person.id} className={`grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center ${included?'bg-card':'bg-muted/20'}`}><label className="flex items-center gap-3"><input type="checkbox" checked={included} onChange={()=>toggle(person.id)} className="h-4 w-4 accent-[hsl(var(--primary))]"/><Avatar person={person} size="sm"/><span className="text-sm font-medium">{person.name}</span></label><Select value={included?mode:'none'} disabled={!included} onValueChange={(value)=>setLoads((current)=>({...current,[person.id]:value}))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не участвует</SelectItem>{Object.entries(PROJECT_LOAD_OPTIONS).map(([value,option])=><SelectItem key={value} value={value}>{option.label}</SelectItem>)}</SelectContent></Select></div>})}</div>{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}<DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></DialogFooter></DialogContent></Dialog>;
}

export function PersonLoadDialog({ open, person, projects, highlightProjectId = null, onOpenChange, onSaved }) {
  const activeProjects = React.useMemo(() => {
    const items = projects.filter((project)=>project.status==='active');
    if (!highlightProjectId) return items;
    return [...items].sort((a, b) => (a.id === highlightProjectId ? -1 : b.id === highlightProjectId ? 1 : 0));
  }, [projects, highlightProjectId]);
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(()=>{if(!open||!person)return;const next={};activeProjects.forEach((project)=>{const included=(project.memberIds||[]).includes(person.id);next[project.id]={included,mode:normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode};});setDraft(next);setError('');},[open,person?.id,projects]);
  if(!person || !isWorkloadEligiblePerson(person))return null;
  const setMode=(projectId,value)=>setDraft((current)=>({...current,[projectId]:{included:value!=='none',mode:value==='none'?(current[projectId]?.mode||'full'):value}}));
  const save=async()=>{setSaving(true);setError('');try{for(const project of activeProjects){const item=draft[project.id]||{included:false,mode:'full'};const memberIds=[...(project.memberIds||[])].filter((id)=>id!==person.id);if(item.included)memberIds.push(person.id);const memberLoads={...(project.memberLoads||{})};if(item.included)memberLoads[person.id]=item.mode;else delete memberLoads[person.id];await api.resource('projects').update(project.id,{memberIds:[...new Set(memberIds)],memberLoads});}onOpenChange(false);await onSaved?.();}catch(e){setError(e?.status===403?'Недостаточно прав для изменения загрузки':'Не удалось сохранить загрузку');}finally{setSaving(false)}};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Загрузка · {person.name}</DialogTitle></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{activeProjects.length?activeProjects.map((project)=>{const item=draft[project.id]||{included:false,mode:'full'};return <div key={project.id} className={`grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center ${item.included?'bg-card':'bg-muted/20'}`}><div><div className="text-sm font-medium">{project.name}</div><div className="text-xs text-muted-foreground">{PROJECT_STATUS_LABEL[project.status]||project.status}</div></div><Select value={item.included?item.mode:'none'} onValueChange={(value)=>setMode(project.id,value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не участвует</SelectItem>{Object.entries(PROJECT_LOAD_OPTIONS).map(([value,option])=><SelectItem key={value} value={value}>{option.label}</SelectItem>)}</SelectContent></Select></div>}):<div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Нет активных проектов.</div>}</div>{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}<DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></DialogFooter></DialogContent></Dialog>;
}

export function GoalDetailPage() {
  const { goalKey } = useParams(); const navigate = useNavigate();
  const goalRef = String(goalKey || '').trim();
  const goalsState = useResource('goals');
  const projectState = useResource('projects');
  const peopleState = useResource('people');
  const tasksState = useEndpoint('/api/tasks?includeArchived=1');
  const issuesState = useResource('issues');
  const [sidebarOpen, setSidebarOpen] = useDetailSidebarState(`garden-goal-detail-sidebar:${goalRef}`, false);
  const [detailTab, setDetailTab] = React.useState('tasks');
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkTitle, setLinkTitle] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkError, setLinkError] = React.useState('');
  const [linkEditingUrl, setLinkEditingUrl] = React.useState(null);
  const addStickyRef = React.useRef(null);
  if (goalsState.loading) return <Page narrow className="task-detail-page detail-page-shell"><Skeleton className="h-80"/></Page>;
  const goalItems = Array.isArray(goalsState.data) ? goalsState.data : [];
  const goal = goalItems.find((item)=>String(item?.goalKey || '').toUpperCase()===goalRef.toUpperCase());
  if (!goalRef || !goal) return <Page narrow><EmptyState title="Цель не найдена" description={goalsState.error ? "Не удалось загрузить данные цели. Попробуйте обновить страницу." : "Не удалось открыть цель. Вернитесь к списку целей и попробуйте снова."} action={<Button onClick={()=>navigate('/goals')}>К целям</Button>}/></Page>;

  const goalTaskIds = Array.isArray(goal.taskIds) ? goal.taskIds : [];
  const goalIssueIds = Array.isArray(goal.issueIds) ? goal.issueIds : [];
  const taskItems = Array.isArray(tasksState.data) ? tasksState.data : [];
  const issueItems = Array.isArray(issuesState.data) ? issuesState.data : [];
  const tasks = taskItems.filter((task)=>goalTaskIds.includes(task.id) || task.goalKey===goal.goalKey || (Array.isArray(task.goalKeys) && task.goalKeys.includes(goal.goalKey)));
  const issues = issueItems.filter((issue)=>goalIssueIds.includes(issue.id) || issue.goalKey===goal.goalKey || (Array.isArray(issue.goalKeys) && issue.goalKeys.includes(goal.goalKey)));
  const links = Array.isArray(goal.links) ? goal.links.filter((entry)=>entry?.url) : [];
  const patch = async (body) => {
    const updated = await api.resource('goals').update(goal.goalKey, body);
    goalsState.setData(goalItems.map((item)=>item.id===goal.id ? {...item,...updated} : item));
    return updated;
  };
  const mentionNavigate=(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`);
  const resetLinkDialog=()=>{setLinkTitle('');setLinkUrl('');setLinkError('');setLinkEditingUrl(null);};
  const openLinkDialog=()=>{resetLinkDialog();setLinkOpen(true);};
  const editLink=(entry)=>{setLinkTitle(entry.title||'');setLinkUrl(entry.url||'');setLinkError('');setLinkEditingUrl(entry.url);setLinkOpen(true);};
  const saveLink=async()=>{
    const title=linkTitle.trim(); const url=normalizeMaterialUrl(linkUrl);
    if(!title){setLinkError('Укажите название ссылки.');return;}
    if(!url){setLinkError('Укажите корректную ссылку.');return;}
    if(links.some((entry)=>entry.url===url && entry.url!==linkEditingUrl)){setLinkError('Эта ссылка уже добавлена.');return;}
    const nextLinks=linkEditingUrl ? links.map((entry)=>entry.url===linkEditingUrl?{title,url}:entry) : [...links,{title,url}];
    await patch({links:nextLinks}); setLinkOpen(false); resetLinkDialog();
  };
  const removeLink=(url)=>patch({links:links.filter((entry)=>entry.url!==url)});

  return <Page narrow className={`task-detail-page goal-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}>
    <div className="mb-7 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={()=>navigate('/goals')}><ArrowLeft className="h-4 w-4"/>Цели</Button>
      <div className="detail-page-header-actions"><DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров"/></div>
    </div>

    <MentionEditor value={goal.title || goal.name || ''} onChange={(title)=>goalsState.setData(goalItems.map((item)=>item.id===goal.id?{...item,title}:item))} onBlur={(title)=>patch({title:title.trim()})} people={peopleState.data} projects={[]} singleLine editorClassName="things-task-detail-title task-title-mention-editor" ariaLabel="Название цели"/>

    <div className="task-detail-workspace-grid">
      <div className="task-detail-main">
        <header className="things-task-detail-header task-detail-reference-header task-detail-unboxed-header">
          <div className="task-detail-reference-section task-detail-description-section">
            <SectionHeader title="Описание" compact/>
            <EditableMarkdownDescription value={goal.description || ''} onChange={(description)=>goalsState.setData(goalItems.map((item)=>item.id===goal.id?{...item,description}:item))} onSave={(description)=>patch({description})} people={peopleState.data} projects={projectState.data} placeholder="Добавить описание…" className="things-task-detail-description task-detail-reference-description" editorClassName="things-task-detail-description task-detail-reference-description" onNavigate={mentionNavigate} ariaLabel="Описание цели"/>
          </div>
        </header>

        <div className="task-detail-layout py-7">
          
          <div className="task-detail-content-card">
            <Tabs className="task-context-tabs" ariaLabel="Разделы цели" value={detailTab} onValueChange={setDetailTab} items={[
              {value:'tasks',label:'Задачи',count:tasks.length},
              {value:'issues',label:'Проблемы',count:issues.length},
              {value:'links',label:'Ссылки',count:links.length},
            ]}/>
            <div className="task-detail-tab-panel">
              {detailTab==='tasks' && <div className="task-detail-tab-content"><TaskList items={tasks} empty="Нет связанных задач" navigate={navigate} onStatusChanged={tasksState.reload} people={peopleState.data} projects={projectState.data}/></div>}
              {detailTab==='issues' && <div className="task-detail-tab-content"><CompactList items={issues} empty="Нет связанных проблем" href={(item)=>`/issues/${encodeURIComponent(resourceRef('issues',item))}`} meta={(item)=><StatusBadge value={item.status} kind="issue"/>}/></div>}
              {detailTab==='links' && <div className="task-detail-tab-content">
                <div className="task-tab-toolbar"><span className="task-tab-subtitle">Ссылки</span><Button variant="ghost" size="sm" onClick={openLinkDialog}><Plus className="h-4 w-4"/>Добавить ссылку</Button></div>
                {links.length ? <div className="task-relations-list">{links.map((entry)=><div key={entry.url} className="task-relation-row"><a href={entry.url} target="_blank" rel="noreferrer" className="task-relation-main"><MaterialServiceIcon url={entry.url}/><div className="min-w-0"><div className="task-relation-title">{entry.title || entry.url}</div></div><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></a><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Редактировать ссылку" title="Редактировать ссылку" onClick={()=>editLink(entry)}><Pencil className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon-sm" aria-label="Удалить ссылку" title="Удалить ссылку" onClick={()=>removeLink(entry.url)}><X className="h-4 w-4"/></Button></div></div>)}</div> : <button type="button" onClick={openLinkDialog} className="task-relations-empty">Добавить первую ссылку</button>}
              </div>}
            </div>
          </div>
        </div>
      </div>
      <aside className="task-properties-column" aria-label="Свойства цели">
        <SectionHeader title="Свойства" compact className="task-properties-title"/>
        <div className="task-properties-list">
          <div className="task-property-row"><span className="task-property-label">Статус</span><div className="task-attribute-item"><Select value={goal.status || 'active'} onValueChange={(value)=>patch({status:value})}><SelectTrigger className="things-task-meta-select is-quiet task-meta-compact"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(GOAL_STATUS_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Срок</span><div className="task-attribute-item"><input type="date" className="goal-due-date-inline" value={goal.dueDate || ''} onChange={(e)=>{const dueDate=e.target.value||'';goalsState.setData(goalItems.map((item)=>item.id===goal.id?{...item,dueDate}:item));}} onBlur={(e)=>patch({dueDate:e.target.value||null})} aria-label="Срок цели"/></div></div>
        </div>
      </aside>
    </div>

    <DetailSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров" showEdgeToggle={false} headerActions={<Button variant="ghost" size="icon-sm" onClick={()=>addStickyRef.current?.()} aria-label="Добавить стикер" title="Добавить стикер"><Plus className="h-4 w-4"/></Button>}>
      <StickyNotes entityType="goal" entityId={goal.goalKey} notesPrefix={goal.title || goal.name || ''} addButtonRef={addStickyRef}/>
    </DetailSidebar>

    <Dialog open={linkOpen} onOpenChange={(open)=>{setLinkOpen(open);if(!open)resetLinkDialog();}}>
      <DialogContent>
        <DialogHeader><DialogTitle>{linkEditingUrl ? 'Редактировать ссылку' : 'Добавить ссылку'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="goal-link-title">Название</Label><Input id="goal-link-title" value={linkTitle} onChange={(e)=>{setLinkTitle(e.target.value);setLinkError('');}} placeholder="Например, Макеты в Figma" autoFocus/></div>
          <div className="space-y-2"><Label htmlFor="goal-link-url">Ссылка</Label><Input id="goal-link-url" value={linkUrl} onChange={(e)=>{setLinkUrl(e.target.value);setLinkError('');}} placeholder="https://…" inputMode="url"/></div>
          {linkError && <p className="text-sm text-destructive">{linkError}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={()=>setLinkOpen(false)}>Отмена</Button><Button onClick={saveLink} disabled={!linkTitle.trim() || !linkUrl.trim()}>{linkEditingUrl ? 'Сохранить' : 'Добавить'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Page>;
}

function TaskList({ items = [], empty, navigate, onStatusChanged, people = [], projects = [] }) {
  const settings = useEndpoint('/api/settings');
  const sortedItems = React.useMemo(
    () => rankTasksByPriority(items, settings.data?.taskPriorityMode || 'balanced'),
    [items, settings.data?.taskPriorityMode],
  );
  if (!sortedItems.length) return <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{empty}</div>;
  const person=(id)=>people.find((item)=>item.id===id);
  const project=(id)=>projects.find((item)=>item.id===id);
  return <div className="surface overflow-hidden">{sortedItems.map((item)=><TaskEntityRow key={item.id} task={item} person={person} project={project} onStatusChanged={onStatusChanged} onOpen={()=>navigate(`/tasks/${encodeURIComponent(item.taskKey || item.id)}`)}/>)}</div>;
}

function MeetingList({ items = [], empty, navigate, people = [], projects = [] }) {
  if (!items.length) return <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{empty}</div>;
  const person=(id)=>people.find((item)=>item.id===id);
  const project=(id)=>projects.find((item)=>item.id===id);
  return <div className="surface overflow-hidden">{items.map((item)=>{const participants=(item.participantIds||[]).map(person).filter(Boolean);return <MeetingEntityRow key={item.id} typeLabel={MEETING_TYPE_LABEL[item.type] || 'Другое'} title={meetingDisplayTitle(item, participants)} projectName={project(item.projectId)?.name || ''} dateLabel={formatDate(item.date)} participants={participants.map((p)=>({id:p.id,avatar:<Avatar person={p} size="xs" className="ring-2 ring-card"/>}))} onOpen={()=>navigate(`/meetings/${encodeURIComponent(item.meetingKey || item.id)}`)}/>;})}</div>;
}

function CompactList({ items = [], empty, href, meta, leading, className }) {
  const navigate = useNavigate();
  const mentionNavigate = (kind, mentionId) => { const route = mentionRoute(kind, mentionId); if (route) navigate(route); };
  if (!items.length) return <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{empty}</div>;
  return <div className={cn("surface overflow-hidden", className)}>{items.map((item)=>{
    const target = href ? href(item) : null;
    return <EntityRow key={item.id} onOpen={target?()=>navigate(target):undefined} leading={leading?leading(item):null} title={<MentionText text={titleOf(item)} onNavigate={mentionNavigate}/>} meta={meta?[meta(item)]:[]}/>;
  })}</div>;
}

function ListSkeletons() { return <div className="surface overflow-hidden divide-y">{[1,2,3,4,5].map((item)=><div key={item} className="flex items-center gap-4 p-4"><Skeleton className="h-4 flex-1"/><Skeleton className="h-6 w-24"/></div>)}</div>; }
function CardSkeletons() { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map((item)=><Skeleton key={item} className="h-36"/>)}</div>; }
