import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Check, CheckCircle2, CircleDot, Columns3, ExternalLink, GripVertical, History, Inbox, Link2, ListTodo, Loader2, MoreHorizontal, Pencil, Plus, Sparkles, Sprout, Target, Trash2, UserRound, Users, X } from 'lucide-react';
import { Page, PageHeader, Section } from '@/components/page';
import { SectionHeader, Tabs } from '@/components/patterns';
import { DetailSidebar, DetailSidebarToggle, useDetailSidebarState } from '@/components/detail-sidebar';
import { StickyNotes } from '@/components/sticky-notes';
import { EditableComments } from '@/components/editable-comments';
import { EditableMarkdownDescription } from '@/components/editable-markdown-description';
import { MentionEditor, MentionText } from '@/components/mention-editor';
import { VersionHistoryDialog } from '@/components/version-history';
import {
  Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, Input,
  Label, Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue, Skeleton, Textarea,
} from '@/components/ui';
import { TaskStatusGlyph, TaskStatusIcon, TASK_STATUS_OPTIONS } from '@/components/status';
import { TaskEntityRow, TaskPriorityIcon, overdueTaskDueLabel } from '@/components/entity-row';
import { CompactSearchControl, ViewModeToggle } from '@/components/view-mode-toggle';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_TYPE_LABEL } from '@/lib/domain';
import { jiraLabelFromUrl, normalizeJiraUrl, normalizeMaterialUrl, MaterialLetterIcon, MaterialServiceIcon } from '@/lib/link-preview';
import { formatDate, formatShortDate, isOverdue } from '@/lib/utils';
import { rankTasksByPriority } from '@/lib/task-priority';


function localDateKey(date = new Date()) {
  const value = new Date(date);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function quickTaskDeadline(kind) {
  const date = new Date();
  date.setHours(12,0,0,0);
  if (kind === 'tomorrow') date.setDate(date.getDate() + 1);
  if (kind === 'next-monday') {
    const day = date.getDay();
    const daysToMonday = ((8 - day) % 7) || 7;
    date.setDate(date.getDate() + daysToMonday);
  }
  if (kind === 'week-end') {
    const day = date.getDay();
    if (day === 6) date.setDate(date.getDate() + 1);
    else if (day !== 0) date.setDate(date.getDate() + ((5 - day + 7) % 7));
  }
  return localDateKey(date);
}
function QuickDeadlineSuggestions({ onPick }) {
  const friday = new Date().getDay() === 5;
  const options = friday
    ? [['today','Сегодня'],['next-monday','Следующий понедельник']]
    : [['today','Сегодня'],['tomorrow','Завтра'],['week-end','Конец недели']];
  return <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground"><span>Поставить на:</span>{options.map(([value,label])=><button type="button" key={value} className="text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary" onClick={()=>onPick(quickTaskDeadline(value))}>{label}</button>)}</div>;
}

export function orderIndex(order, value) { const index = order.indexOf(value); return index === -1 ? order.length : index; }
export function taskSort(a, b) {
  const statusDiff = orderIndex(TASK_STATUS_ORDER, a.status) - orderIndex(TASK_STATUS_ORDER, b.status);
  if (statusDiff) return statusDiff;
  if ((a.priority === 'high') !== (b.priority === 'high')) return a.priority === 'high' ? -1 : 1;
  const aOver = isOverdue(a.dueDate, a.status) ? 0 : 1;
  const bOver = isOverdue(b.dueDate, b.status) ? 0 : 1;
  return aOver - bOver || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(a.title || '').localeCompare(String(b.title || ''), 'ru');
}

export function TasksPage({ user }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tasks = useResource('tasks');
  const people = useResource('people');
  const projects = useResource('projects');
  const settings = useEndpoint('/api/settings');

  const rawInitialView = params.get('view');
  const legacyDevelopment = params.get('type') === 'development';
  const legacyViewMap = {
    my: legacyDevelopment ? 'technology' : 'my',
    priority: 'focus',
    all: legacyDevelopment ? 'technology' : 'team',
    'my-priority': 'focus',
    'my-projects': 'my',
    'my-development': 'technology',
    'team-projects': 'team',
    'team-development': 'technology',
  };
  const allowedViews = ['focus','my','team','technology'];
  const initialView = allowedViews.includes(rawInitialView) ? rawInitialView : (legacyViewMap[rawInitialView] || (legacyDevelopment ? 'technology' : (params.get('person') ? 'team' : 'my')));

  const [view, setView] = usePersistentFilter('tasks', 'view', initialView, params.has('view') || params.has('person') || params.has('type') ? initialView : undefined);
  const [displayMode, setDisplayMode] = usePersistentFilter('tasks', 'displayMode', 'list', params.has('layout') ? (params.get('layout') === 'board' ? 'board' : 'list') : undefined);
  const railCollapsed = displayMode === 'board';
  const [searchOpen, setSearchOpen] = React.useState(Boolean(params.get('q')));
  const [query, setQuery] = usePersistentFilter('tasks', 'query', '', params.has('q') ? params.get('q') : undefined);
  const [status, setStatus] = usePersistentFilter('tasks', 'status', 'open', params.has('status') ? params.get('status') : undefined);
  const [groupBy, setGroupBy] = usePersistentFilter('tasks', 'groupBy', defaultGroupForView(initialView), params.has('group') ? params.get('group') : undefined);
  const [personId, setPersonId] = usePersistentFilter('tasks', 'personId', 'all', params.has('person') ? params.get('person') : undefined);
  const [projectId, setProjectId] = usePersistentFilter('tasks', 'projectId', 'all', params.has('project') ? params.get('project') : undefined);
  const [createOpen, setCreateOpen] = React.useState(params.get('create') === '1');

  const team = people.data.filter((person) => person.type === 'team');
  const person = (id) => people.data.find((item) => item.id === id);
  const project = (id) => projects.data.find((item) => item.id === id);
  const myPersonId = user?.personId || null;
  const effectiveSortMode = settings.data?.taskPriorityMode || 'balanced';
  const isPriorityView = view === 'focus';
  const isPersonalView = view === 'focus' || view === 'my';
  const isTeamView = view === 'team' || view === 'technology';
  const isDevelopmentView = view === 'technology';
  const isProjectView = !isDevelopmentView;
  const wantedTaskType = isDevelopmentView ? 'development' : 'standard';

  const visible = React.useMemo(() => {
    const filtered = tasks.data.filter((task) => {
      if ((task.taskType || 'standard') !== wantedTaskType) return false;
      if (isPersonalView && (!myPersonId || !(task.assigneeIds || []).includes(myPersonId))) return false;
      if (isPriorityView && (!task.projectId || task.status === 'done')) return false;
      if (status === 'archived') { if (!task.archivedAt) return false; }
      else {
        if (task.archivedAt) return false;
        if (status === 'open' && task.status === 'done') return false;
        if (status !== 'all' && status !== 'open' && task.status !== status) return false;
      }
      if (isTeamView && personId !== 'all' && !(task.assigneeIds || []).includes(personId)) return false;
      if (isProjectView && projectId !== 'all' && task.projectId !== projectId) return false;
      if (query && !String(task.title || '').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) return false;
      return true;
    });
    const ranked = rankTasksByPriority(filtered, effectiveSortMode);
    if (!isPriorityView) return ranked;
    const perProject = new Map();
    for (const task of ranked) {
      const bucket = perProject.get(task.projectId) || [];
      if (bucket.length < 3) { bucket.push(task); perProject.set(task.projectId, bucket); }
    }
    return [...perProject.values()].flat();
  }, [tasks.data, wantedTaskType, isPersonalView, isPriorityView, myPersonId, status, isTeamView, personId, isProjectView, projectId, query, effectiveSortMode]);

  const groups = React.useMemo(() => {
    if (status === 'archived') return [{ key:'archived', label:'Архив', items: visible }];
    if (isPriorityView) {
      const result = projects.data
        .map((item) => ({ key:`project:${item.id}`, label:item.name, items:visible.filter((task)=>task.projectId===item.id) }))
        .filter((group)=>group.items.length)
        .sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''), 'ru', { sensitivity:'base' }));
      const noProject = visible.filter((task)=>!task.projectId);
      if (noProject.length) result.push({key:'project:none',label:'Без проекта',items:noProject});
      return result;
    }
    if (groupBy === 'person' && isTeamView) {
      const result = team.map((member) => ({ key:`person:${member.id}`, label:member.name, items:visible.filter((task)=>(task.assigneeIds||[]).includes(member.id)) })).filter((group)=>group.items.length);
      const unassigned = visible.filter((task)=>!(task.assigneeIds||[]).length); if (unassigned.length) result.push({key:'person:none',label:'Без сотрудника',items:unassigned}); return result;
    }
    if (groupBy === 'project' && isProjectView) {
      const result = projects.data
        .map((item) => ({ key:`project:${item.id}`, label:item.name, items:visible.filter((task)=>task.projectId===item.id) }))
        .filter((group)=>group.items.length)
        .sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''), 'ru', { sensitivity:'base' }));
      const noProject = visible.filter((task)=>!task.projectId);
      if (noProject.length) result.push({key:'project:none',label:'Без проекта',items:noProject});
      return result;
    }
    return TASK_STATUS_ORDER.map((value)=>({key:value,label:TASK_STATUS_LABEL[value],items:visible.filter((task)=>task.status===value)})).filter((group)=>group.items.length);
  }, [visible, groupBy, status, isPriorityView, isTeamView, isProjectView, team, projects.data]);

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (view !== 'my') next.set('view', view);
    if (displayMode === 'board') next.set('layout', 'board');
    if (query) next.set('q', query);
    if (status !== 'open') next.set('status', status);
    const defaultGroup = defaultGroupForView(view);
    if (groupBy !== defaultGroup) next.set('group', groupBy);
    if (isTeamView && personId !== 'all') next.set('person', personId);
    if (isProjectView && projectId !== 'all') next.set('project', projectId);
    setParams(next, { replace: true });
  }, [view, displayMode, query, status, groupBy, personId, projectId, isTeamView, isProjectView]);

  const previousViewRef = React.useRef(view);
  React.useEffect(() => {
    if (previousViewRef.current === view) return;
    setGroupBy(defaultGroupForView(view));
    if (view === 'focus') setStatus('open');
    if (view === 'focus' || view === 'my') setPersonId('all');
    previousViewRef.current = view;
  }, [view]);

  const setLayout = (nextLayout) => {
    setDisplayMode(nextLayout);
  };

  const clearFilters = () => { setStatus('open'); setPersonId('all'); setProjectId('all'); };
  const hasFilters = status !== 'open' || personId !== 'all' || projectId !== 'all';
  const changeTaskStatus = async (task, nextStatus) => {
    await api.resource('tasks').update(task.id, { status: nextStatus });
    tasks.reload();
  };

  const currentViewTitle = viewTitle(view);
  const selectedViewPerson = personId !== 'all' ? team.find((item) => item.id === personId) : null;
  const currentViewDescription = isPriorityView
    ? 'До трёх приоритетных задач по каждому проекту'
    : view === 'my'
      ? 'Мои задачи на проектах'
      : view === 'technology'
        ? (selectedViewPerson ? `Сотрудник: ${selectedViewPerson.name}` : 'Все сотрудники')
        : selectedViewPerson
          ? `Сотрудник: ${selectedViewPerson.name}`
          : 'Все сотрудники';

  return <Page className={`tasks-page ${displayMode === 'board' ? 'is-board-mode' : ''}`}>
    <PageHeader title="Задачи" />

    <div className="tasks-control-strip">
      <TaskFilterSentence
        view={view}
        status={status}
        setStatus={setStatus}
        personId={personId}
        setPersonId={setPersonId}
        projectId={projectId}
        setProjectId={setProjectId}
        setView={setView}
        myPersonId={myPersonId}
        people={team}
        projects={projects.data}
        hasFilters={hasFilters}
        onReset={clearFilters}
      />

      <div className="tasks-control-actions">
        <CompactSearchControl value={query} onChange={setQuery} placeholder="Поиск задач" open={searchOpen || Boolean(query)} onOpenChange={setSearchOpen}/>
        <ViewModeToggle value={displayMode} onChange={setLayout} modes={[{ value:'list', label:'Список', icon:ListTodo }, { value:'board', label:'Доска', icon:Columns3 }]} ariaLabel="Вид задач"/>
      </div>
    </div>

    <div className={`tasks-split-layout ${railCollapsed ? 'is-rail-collapsed' : ''}`}>
      {!railCollapsed && <aside className="tasks-filter-rail">
        <div className="tasks-filter-rail-inner">
          <div className="tasks-view-section">
            <div className="tasks-rail-kb-heading">Шаблоны</div>
            <nav className="tasks-view-nav" aria-label="Представления задач">
              <TaskViewButton active={view==='focus'} disabled={!myPersonId} icon={Target} label="Фокус на день" onClick={()=>setView('focus')}/>
              <TaskViewButton active={view==='my'} disabled={!myPersonId} icon={UserRound} label="Мои задачи" onClick={()=>setView('my')}/>
              <TaskViewButton active={view==='team'} icon={Users} label="Задачи команды" onClick={()=>setView('team')}/>
              <TaskViewButton active={view==='technology'} icon={Sprout} label="Технологизация" onClick={()=>setView('technology')}/>
            </nav>
          </div>

          {displayMode === 'list' && !isPriorityView && <div className="tasks-grouping-section">
            <div className="tasks-rail-section-label">Группировка</div>
            <div className="tasks-group-radio" role="radiogroup" aria-label="Группировка задач">
              <label><input type="radio" name="task-grouping" value="status" checked={groupBy==='status'} onChange={()=>setGroupBy('status')}/><span>По статусам</span></label>
              {isProjectView && <label><input type="radio" name="task-grouping" value="project" checked={groupBy==='project'} onChange={()=>setGroupBy('project')}/><span>По проектам</span></label>}
              {isTeamView && <label><input type="radio" name="task-grouping" value="person" checked={groupBy==='person'} onChange={()=>setGroupBy('person')}/><span>По сотрудникам</span></label>}
            </div>
          </div>}

        </div>
      </aside>}

      <main className="tasks-main-pane">
        <div className="tasks-view-header">
          <div className="tasks-view-header-copy">
            <h2>{currentViewTitle}</h2>
            <p>{currentViewDescription}</p>
          </div>
          <Button className="tasks-view-create" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4"/>Добавить задачу</Button>
        </div>
        <div key={displayMode} className="view-mode-transition">{tasks.error && !tasks.loading ? <ErrorState error={tasks.error} onRetry={tasks.reload}/> : tasks.loading ? <div className="space-y-2">{[1,2,3,4].map((item)=><Skeleton key={item} className="h-12"/>)}</div> : visible.length ? (displayMode === 'board' ? <TaskKanban tasks={visible} navigate={navigate} person={person} project={project} onStatusChange={changeTaskStatus}/> : <TaskGroupedRows groups={groups} navigate={navigate} person={person} project={project} onStatusChanged={tasks.reload} hideProjectMeta={groupBy === 'project' || isPriorityView}/>) : <EmptyState icon={CheckCircle2} title="Задач не найдено" description={isPersonalView?'Для вас нет задач с такими фильтрами.':'Измените фильтры или создайте новую задачу.'} action={<Button onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Создать задачу</Button>}/>}</div> 
      </main>
    </div>
    <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} people={people.data} projects={projects.data} taskType={wantedTaskType} initialTitle={params.get('title') || ''} initialAssignee={params.get('assignee') || (isPersonalView && myPersonId ? myPersonId : 'none')} initialProject={params.get('createProject') || 'none'} initialDueDate={params.get('dueDate') || ''} onCreated={(task)=>{ tasks.reload(); navigate(`/tasks/${encodeURIComponent(task.taskKey || task.id)}`); }}/>
  </Page>;
}

function TaskFilterSentence({ view, status, setStatus, personId, setPersonId, projectId, setProjectId, setView, myPersonId, people, projects, hasFilters, onReset }) {
  const isPriority = view === 'focus';
  const isPersonal = view === 'focus' || view === 'my';
  const isTechnology = view === 'technology';
  const me = people.find((item) => item.id === myPersonId);
  const actorValue = isPersonal ? (myPersonId || 'all') : personId;
  const actorName = actorValue === 'all' ? 'Команда' : (people.find((item)=>item.id===actorValue)?.name || me?.name || 'Команда');

  const statusLabels = {
    open: 'открытые', all: 'все', archived: 'архивные', todo: 'новые', in_progress: 'в работе',
    in_review: 'в ревью', paused: 'на паузе', blocked: 'заблокированные', done: 'готовые',
  };
  const statusIsSuffix = ['in_progress', 'in_review', 'paused'].includes(status);
  const statusOptions = <>
    <SelectItem value="open">открытые</SelectItem><SelectItem value="all">все</SelectItem><SelectItem value="todo">новые</SelectItem>
    <SelectItem value="in_progress">в работе</SelectItem><SelectItem value="in_review">в ревью</SelectItem><SelectItem value="paused">на паузе</SelectItem>
    <SelectItem value="blocked">заблокированные</SelectItem><SelectItem value="done">готовые</SelectItem><SelectItem value="archived">архивные</SelectItem>
  </>;

  const projectName = projects.find((item)=>item.id===projectId)?.name;
  const scopeValue = isTechnology ? 'technology' : (projectId === 'all' ? 'all' : `project:${projectId}`);
  const scopeLabel = isTechnology ? 'по технологизации' : (projectId === 'all' ? 'по всем проектам' : `по проекту ${projectName || ''}`.trim());

  const changeActor = (nextActor) => {
    if (isTechnology) {
      setPersonId(nextActor);
      return;
    }
    if (nextActor === myPersonId) {
      setPersonId('all');
      setView('my');
      return;
    }
    setPersonId(nextActor);
    setView(isTechnology ? 'technology' : 'team');
  };

  const changeScope = (nextScope) => {
    if (nextScope === 'technology' || nextScope === 'development') {
      setProjectId('all');
      setView('technology');
      return;
    }
    const nextProjectId = nextScope === 'all' ? 'all' : nextScope.replace(/^project:/, '');
    setProjectId(nextProjectId);
    if (isTechnology) setView(actorValue === myPersonId ? 'my' : 'team');
  };

  const compactStatusLabel = status === 'open' ? 'Открытые' : status === 'all' ? 'Все' : (statusLabels[status] || 'Все');
  const compactScopeLabel = isTechnology ? 'Технологизация' : (projectId === 'all' ? 'Все проекты' : (projectName || 'Проект'));

  return <div className="tasks-filter-sentence" aria-label="Фильтры задач">
    <FilterWord value={actorValue} onValueChange={changeActor} label={actorName}>
      <SelectItem value="all">Команда</SelectItem>
      {people.map((item)=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
    </FilterWord>
    {!isPriority && <FilterWord value={status} onValueChange={setStatus} label={compactStatusLabel}>{statusOptions}</FilterWord>}
    {!isPriority && <FilterWord value={scopeValue} onValueChange={changeScope} label={compactScopeLabel}>
      <SelectItem value="all">Все проекты</SelectItem>
      <SelectItem value="development">Технологизация</SelectItem>
      {projects.length > 0 && <SelectSeparator/>}
      {projects.map((item)=><SelectItem key={item.id} value={`project:${item.id}`}>{item.name}</SelectItem>)}
    </FilterWord>}
    {hasFilters && <button type="button" className="tasks-filter-sentence-reset" onClick={onReset}>Сбросить</button>}
  </div>;
}

function FilterWord({ value, onValueChange, label, children }) {
  return <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className="tasks-filter-word" aria-label={label}><span>{label}</span></SelectTrigger>
    <SelectContent>{children}</SelectContent>
  </Select>;
}

function defaultGroupForView(view) {
  if (view === 'focus' || view === 'my' || view === 'team') return 'project';
  return 'status';
}

function viewTitle(view) {
  return { focus:'Фокус на день', my:'Мои задачи', team:'Задачи команды', technology:'Технологизация' }[view] || 'Задачи';
}

function TaskViewButton({ active, disabled, icon: Icon, label, onClick }) {
  return <button type="button" className={active?'is-active':''} onClick={onClick} disabled={disabled} title={disabled?'Профиль пользователя не связан с сотрудником':undefined}>
    <Icon className="h-[18px] w-[18px]"/><span>{label}</span>
  </button>;
}

function TaskKanban({ tasks, navigate, person, project, onStatusChange }) {
  const statuses = TASK_STATUS_ORDER.filter((value)=>value !== 'done').concat(TASK_STATUS_ORDER.includes('done') ? ['done'] : []);
  const [draggedId, setDraggedId] = React.useState(null);
  const draggedTask = tasks.find((task)=>task.id===draggedId);
  return <div className="tasks-kanban" aria-label="Канбан задач">
    {statuses.map((statusValue)=>{
      const items=tasks.filter((task)=>task.status===statusValue);
      return <section key={statusValue} className="tasks-kanban-column" onDragOver={(event)=>event.preventDefault()} onDrop={async(event)=>{event.preventDefault();if(draggedTask&&draggedTask.status!==statusValue) await onStatusChange(draggedTask,statusValue);setDraggedId(null);}}>
        <div className="tasks-kanban-column-header"><TaskStatusGlyph status={statusValue} className="tasks-kanban-column-status"/><span>{TASK_STATUS_LABEL[statusValue]}</span></div>
        <div className="tasks-kanban-cards">{items.map((task)=>{
          const assignee=task.assigneeIds?.length?person(task.assigneeIds[0]):null;
          const projectName=project(task.projectId)?.name || (task.taskType==='development'?TASK_TYPE_LABEL.development:'');
          const due=isOverdue(task.dueDate,task.status)?overdueTaskDueLabel(task.dueDate):formatShortDate(task.dueDate);
          return <article key={task.id} draggable onDragStart={()=>setDraggedId(task.id)} onDragEnd={()=>setDraggedId(null)} onClick={()=>navigate(`/tasks/${encodeURIComponent(task.taskKey || task.id)}`)} className="tasks-kanban-card">
            <div className="tasks-kanban-card-head"><span className="tasks-kanban-title"><MentionText text={task.title || 'Без названия'} className="task-title-mention-text"/></span><TaskPriorityIcon priority={task.priority}/></div>
            {(due||projectName||assignee)&&<div className="tasks-kanban-meta">{due&&<span className={isOverdue(task.dueDate,task.status)?'is-overdue':''}>{due}</span>}{projectName&&<span>{projectName}</span>}{assignee&&<span>{assignee.name}</span>}</div>}
          </article>;
        })}</div>
      </section>;
    })}
  </div>;
}

function TaskRow({ task, navigate, person, project, onStatusChanged, hideProjectMeta = false }) {
  return <TaskEntityRow
    task={task}
    person={person}
    project={project}
    hideProject={hideProjectMeta}
    onStatusChanged={onStatusChanged}
    onOpen={()=>navigate(`/tasks/${encodeURIComponent(task.taskKey || task.id)}`)}
  />;
}

function TaskRows({ tasks, navigate, person, project, onStatusChanged, hideProjectMeta = false }) {
  return <div className="things-task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} navigate={navigate} person={person} project={project} onStatusChanged={onStatusChanged} hideProjectMeta={hideProjectMeta}/>)}</div>;
}

function TaskGroupedRows({ groups, navigate, person, project, onStatusChanged, hideProjectMeta = false }) {
  return <div className="things-task-list things-task-unified-list">{groups.map((group) => <section key={group.key} className="things-task-list-group">
    <div className="things-task-inline-group-header"><span>{group.label}</span></div>
    <div className="things-task-inline-group-rows">{group.items.map((task) => <TaskRow key={task.id} task={task} navigate={navigate} person={person} project={project} onStatusChanged={onStatusChanged} hideProjectMeta={hideProjectMeta}/>)}</div>
  </section>)}</div>;
}

export function CreateTaskDialog({ open, onOpenChange, people, projects, taskType='standard', initialTitle = '', initialAssignee = 'none', initialProject = 'none', initialDueDate = '', onCreated }) {
  const { draft, field, saving, save } = useCrudDialogForm({
    resource: 'tasks', open, item: null, onOpenChange,
    onSaved: onCreated,
    buildDraft: () => ({ title: initialTitle, assignee: initialAssignee || 'none', project: initialProject || 'none', dueDate: initialDueDate || '' }),
    validate: () => null,
    buildPayload: (d) => ({ title: d.title.trim(), status:'todo', priority:'normal', taskType, assigneeIds: d.assignee==='none'?[]:[d.assignee], projectId: taskType==='development'?null:(d.project==='none'?null:d.project), dueDate: d.dueDate||null }),
  });
  const create = async (event) => { event?.preventDefault?.(); if (!draft.title?.trim() || saving) return; await save(); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={create}><DialogHeader><DialogTitle>Создать задачу</DialogTitle></DialogHeader><div className="mt-5 space-y-4"><div className="space-y-1.5"><Label>Название</Label><MentionEditor autoFocus value={draft.title||''} onChange={(value)=>field('title',value)} people={people} projects={[]} placeholder="Что нужно сделать?" singleLine submitOnEnter onSubmit={create} editorClassName="task-create-title-mention" ariaLabel="Название задачи"/></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Исполнитель</Label><Select value={draft.assignee||'none'} onValueChange={(value)=>field('assignee',value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не назначен</SelectItem>{people.filter((person)=>person.type==='team').map((person)=><SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div>{taskType==='standard'&&<div className="space-y-1.5"><Label>Проект</Label><Select value={draft.project||'none'} onValueChange={(value)=>field('project',value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem>{projects.map((item)=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}</div><div className="space-y-1.5"><Label>Срок</Label><Input type="date" value={draft.dueDate||''} onChange={(event)=>field('dueDate',event.target.value)}/><QuickDeadlineSuggestions onPick={(value)=>field('dueDate',value)}/></div></div><DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={saving||!draft.title?.trim()}>{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}Создать</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TaskTitleEditor({ value, onChange, onBlur, people = [] }) {
  return <MentionEditor
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    people={people}
    projects={[]}
    singleLine
    editorClassName="things-task-detail-title task-title-mention-editor"
    ariaLabel="Название задачи"
  />;
}

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const taskState = useEndpoint(`/api/tasks/${encodeURIComponent(id)}`, [id]);
  const people = useResource('people');
  const projects = useResource('projects');
  const goals = useResource('goals');
  const issues = useResource('issues');
  const comments = useEndpoint(`/api/comments/task-discussion/${encodeURIComponent(id)}`, [id]);
  const [saving, setSaving] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [relationOpen, setRelationOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [relationType, setRelationType] = React.useState('jira');
  const [jiraUrl, setJiraUrl] = React.useState('');
  const [goalKey, setGoalKey] = React.useState('none');
  const [issueId, setIssueId] = React.useState('none');
  const [relationError, setRelationError] = React.useState('');
  const [materialOpen, setMaterialOpen] = React.useState(false);
  const [materialTitle, setMaterialTitle] = React.useState('');
  const [materialUrl, setMaterialUrl] = React.useState('');
  const [materialError, setMaterialError] = React.useState('');
  const [materialEditingUrl, setMaterialEditingUrl] = React.useState(null);
  const [planDraft, setPlanDraft] = React.useState('');
  const [planComposerOpen, setPlanComposerOpen] = React.useState(false);
  const [editingPlanId, setEditingPlanId] = React.useState(null);
  const [editingPlanText, setEditingPlanText] = React.useState('');
  const [planEditError, setPlanEditError] = React.useState('');
  const [dragPlanId, setDragPlanId] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = useDetailSidebarState('garden-task-detail-sidebar');
  const addStickyRef = React.useRef(null);
  const [detailTab, setDetailTab] = React.useState('plan');
  const task = taskState.data;
  const person = (pid) => people.data.find((p)=>p.id===pid);
  const project = projects.data.find((p)=>p.id===task?.projectId);
  const assignee = person(task?.assigneeIds?.[0]);
  const linkedGoalKeys = Array.isArray(task?.goalKeys) ? task.goalKeys : (task?.goalKey ? [task.goalKey] : []);
  const linkedGoals = linkedGoalKeys.map((gid)=>goals.data.find((goal)=>goal.goalKey===gid)).filter(Boolean);
  const linkedIssueIds = Array.isArray(task?.issueIds) ? task.issueIds : [];
  const linkedIssues = linkedIssueIds.map((iid)=>issues.data.find((issue)=>issue.id===iid)).filter(Boolean);
  const jiraLinks = Array.isArray(task?.jiraLinks)
    ? task.jiraLinks.map((item)=>typeof item === 'string' ? { url:item, label:jiraLabelFromUrl(item) } : item).filter((item)=>item?.url)
    : [];
  const materials = Array.isArray(task?.materials)
    ? task.materials.map((item)=>typeof item === 'string' ? { title:item, url:item } : item).filter((item)=>item?.url)
    : [];
  const planItems = Array.isArray(task?.planItems)
    ? task.planItems.map((item, index)=>typeof item === 'string' ? { id:`legacy-${index}`, text:item, done:false } : item).filter((item)=>item?.text)
    : [];
  const patch = async (body) => { if (!task) return null; setSaving(true); try { const updated = await api.resource('tasks').update(task.id, body); taskState.setData(updated); return updated; } finally { setSaving(false); } };
  const addComment = async (e) => { e.preventDefault(); if (!comment.trim()) return; await api.post(`/api/comments/task-discussion/${task.id}`, { text: comment.trim() }); setComment(''); comments.reload(); };
  const remove = async () => { if (!confirm('Удалить задачу?')) return; await api.resource('tasks').remove(task.id); navigate('/tasks'); };
  const toggleArchive = async () => patch({ archivedAt: task.archivedAt ? null : new Date().toISOString() });

  const resetRelationDialog = () => { setRelationType('jira'); setJiraUrl(''); setGoalKey('none'); setIssueId('none'); setRelationError(''); };
  const openRelationDialog = () => { resetRelationDialog(); setRelationOpen(true); };
  const saveRelation = async () => {
    setRelationError('');
    if (relationType === 'jira') {
      const normalized = normalizeJiraUrl(jiraUrl);
      if (!normalized) { setRelationError('Укажите корректную ссылку.'); return; }
      if (jiraLinks.some((item)=>item.url===normalized)) { setRelationError('Эта ссылка уже добавлена.'); return; }
      await patch({ jiraLinks: [...jiraLinks, { url: normalized, label: jiraLabelFromUrl(normalized) }] });
    } else if (relationType === 'goal') {
      if (goalKey === 'none') { setRelationError('Выберите цель.'); return; }
      if (linkedGoalKeys.includes(goalKey)) { setRelationError('Эта цель уже связана с задачей.'); return; }
      const nextGoalKeys = [...linkedGoalKeys, goalKey];
      await patch({ goalKeys: nextGoalKeys, goalKey: nextGoalKeys[0] || null });
    } else {
      if (issueId === 'none') { setRelationError('Выберите проблему.'); return; }
      if (linkedIssueIds.includes(issueId)) { setRelationError('Эта проблема уже связана с задачей.'); return; }
      await patch({ issueIds: [...linkedIssueIds, issueId] });
    }
    setRelationOpen(false);
    resetRelationDialog();
  };
  const removeJiraLink = async (url) => patch({ jiraLinks: jiraLinks.filter((item)=>item.url!==url) });
  const removeGoalLink = async (gid) => {
    const nextGoalKeys = linkedGoalKeys.filter((item)=>item!==gid);
    await patch({ goalKeys: nextGoalKeys, goalKey: nextGoalKeys[0] || null });
  };
  const removeIssueLink = async (iid) => patch({ issueIds: linkedIssueIds.filter((item)=>item!==iid) });
  const resetMaterialDialog = () => { setMaterialTitle(''); setMaterialUrl(''); setMaterialError(''); setMaterialEditingUrl(null); };
  const openMaterialDialog = () => { resetMaterialDialog(); setMaterialOpen(true); };
  const editMaterial = (item) => {
    setMaterialTitle(item.title || '');
    setMaterialUrl(item.url || '');
    setMaterialError('');
    setMaterialEditingUrl(item.url);
    setMaterialOpen(true);
  };
  const saveMaterial = async () => {
    const title = materialTitle.trim();
    const url = normalizeMaterialUrl(materialUrl);
    if (!title) { setMaterialError('Укажите название материала.'); return; }
    if (!url) { setMaterialError('Укажите корректную ссылку.'); return; }
    if (materials.some((item)=>item.url===url && item.url!==materialEditingUrl)) { setMaterialError('Эта ссылка уже добавлена.'); return; }
    const nextMaterials = materialEditingUrl
      ? materials.map((item)=>item.url===materialEditingUrl ? { title, url } : item)
      : [...materials, { title, url }];
    await patch({ materials: nextMaterials });
    setMaterialOpen(false);
    resetMaterialDialog();
  };
  const removeMaterial = async (url) => patch({ materials: materials.filter((item)=>item.url!==url) });
  const addPlanItem = async (event) => {
    event?.preventDefault?.();
    const text = planDraft.trim();
    if (!text) return;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan-${Date.now()}`;
    await patch({ planItems: [...planItems, { id, text, done:false }] });
    setPlanDraft('');
    setPlanComposerOpen(false);
  };
  const startEditingPlanItem = (item) => {
    setEditingPlanId(item.id);
    setEditingPlanText(item.text);
    setPlanEditError('');
  };
  const cancelEditingPlanItem = () => {
    setEditingPlanId(null);
    setEditingPlanText('');
    setPlanEditError('');
  };
  const saveEditingPlanItem = async (event) => {
    event?.preventDefault?.();
    if (saving || editingPlanId === null) return;
    const text = editingPlanText.trim();
    if (!text) { setPlanEditError('Введите текст пункта.'); return; }
    const original = planItems.find((item)=>item.id===editingPlanId);
    if (!original) { cancelEditingPlanItem(); return; }
    if (original.text === text) { cancelEditingPlanItem(); return; }
    try {
      await patch({ planItems: planItems.map((item)=>item.id===editingPlanId ? {...item,text} : item) });
      cancelEditingPlanItem();
    } catch (error) {
      setPlanEditError(error?.message || 'Не удалось сохранить пункт.');
    }
  };
  const togglePlanItem = async (itemId) => patch({ planItems: planItems.map((item)=>item.id===itemId ? {...item,done:!item.done} : item) });
  const removePlanItem = async (itemId) => patch({ planItems: planItems.filter((item)=>item.id!==itemId) });
  const reorderItems = (items, fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return items;
    const from = items.findIndex((item)=>item.id===fromId); const to = items.findIndex((item)=>item.id===toId);
    if (from < 0 || to < 0) return items;
    const next = [...items]; const [moved] = next.splice(from,1); next.splice(to,0,moved); return next;
  };
  const dropPlanItem = async (targetId) => {
    const next = reorderItems(planItems, dragPlanId, targetId); setDragPlanId(null);
    if (next !== planItems) await patch({ planItems: next });
  };
  const useFullDragPreview = (event, selector) => {
    const source = event.currentTarget.closest(selector);
    if (!source || !event.dataTransfer?.setDragImage) return;
    const rect = source.getBoundingClientRect();
    event.dataTransfer.setDragImage(source, Math.min(28, Math.max(0, rect.width / 2)), Math.min(22, Math.max(0, rect.height / 2)));
  };

  if (taskState.loading) return <Page narrow><div className="space-y-4"><Skeleton className="h-8 w-3/4"/><Skeleton className="h-5 w-1/2"/><Skeleton className="h-56 w-full"/></div></Page>;
  if (!task) return <Page narrow><EmptyState title="Задача не найдена" action={<Button onClick={()=>navigate('/tasks')}>К списку задач</Button>}/></Page>;

  return <Page narrow className={`task-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}>
    <div className="mb-7 flex items-center justify-between"><Button variant="ghost" size="sm" onClick={()=>navigate('/tasks')}><ArrowLeft className="h-4 w-4"/>Задачи</Button><div className="detail-page-header-actions">{saving && <span className="text-xs text-muted-foreground" aria-live="polite">Сохраняю…</span>}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={toggleArchive}>{task.archivedAt ? <ArchiveRestore className="h-4 w-4"/> : <Archive className="h-4 w-4"/>}{task.archivedAt ? 'Восстановить из архива' : 'Архивировать задачу'}</DropdownMenuItem><DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История версий</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onSelect={remove}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu><DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров"/></div></div>

    <TaskTitleEditor value={task.title || ''} people={people.data} onChange={(title)=>taskState.setData({...task,title})} onBlur={(title)=>patch({title:title.trim()})}/>

    <div className="task-detail-workspace-grid">
      <div className="task-detail-main">
      <header className="things-task-detail-header task-detail-reference-header task-detail-unboxed-header">
        <div className="task-detail-reference-section task-detail-description-section">
          <SectionHeader title="Описание" compact/>
          <EditableMarkdownDescription value={task.description || ''} onChange={(value)=>taskState.setData({...task,description:value})} onSave={(value)=>patch({description:value})} people={people.data} projects={projects.data} placeholder="Добавить описание ..." className="things-task-detail-description task-detail-reference-description" editorClassName="things-task-detail-description task-detail-reference-description" onNavigate={(kind,id)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(id)}` : `/people/${encodeURIComponent(id)}`)} ariaLabel="Описание задачи"/>
        </div>
      </header>

      <div className="task-detail-layout py-7">
        
        <div className="task-detail-content-card">
        <Tabs
          className="task-context-tabs"
          ariaLabel="Разделы задачи"
          value={detailTab}
          onValueChange={setDetailTab}
          items={[
            {value:'plan',label:'План',count:planItems.length},
            {value:'context',label:'Ссылки',count:materials.length},
            {value:'relations',label:'Связи',count:linkedGoals.length + linkedIssues.length + jiraLinks.length},
            {value:'discussion',label:'Обсуждение',count:comments.data?.length || 0},
          ]}
        />
        <div className="task-detail-tab-panel">
          {detailTab==='plan' && <div className="task-detail-tab-content">
            <div className="task-tab-toolbar"><span className="task-tab-subtitle">Подзадачи</span><Button variant="ghost" size="sm" onClick={()=>setPlanComposerOpen(true)}><Plus className="h-4 w-4"/>Добавить подзадачу</Button></div>
            {planItems.length ? <div className="task-plan-list">
              {planItems.map((item)=><div key={item.id} className={`task-plan-row ${item.done ? 'is-done' : ''} ${dragPlanId===item.id?'is-dragging':''}`} onDragOver={(event)=>event.preventDefault()} onDrop={()=>dropPlanItem(item.id)}>
                <button type="button" className="task-drag-handle" draggable onDragStart={(event)=>{ setDragPlanId(item.id); event.dataTransfer.effectAllowed='move'; useFullDragPreview(event,'.task-plan-row'); }} onDragEnd={()=>setDragPlanId(null)} aria-label={`Перетащить «${item.text}»`} title="Изменить порядок"><GripVertical className="h-4 w-4"/></button>
                {editingPlanId===item.id ? <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={saveEditingPlanItem}>
                  <div className="min-w-0 flex-1"><Input autoFocus value={editingPlanText} onChange={(event)=>{setEditingPlanText(event.target.value);setPlanEditError('');}} onKeyDown={(event)=>{if(event.key==='Escape'){event.preventDefault();cancelEditingPlanItem();}}} aria-label="Текст подзадачи" aria-invalid={Boolean(planEditError)}/>{planEditError && <span role="alert" className="text-xs text-destructive">{planEditError}</span>}</div>
                  <Button type="submit" variant="ghost" size="icon-sm" disabled={saving || !editingPlanText.trim()} aria-label="Сохранить подзадачу" title="Сохранить"><Check className="h-4 w-4"/></Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={cancelEditingPlanItem} aria-label="Отменить редактирование" title="Отмена"><X className="h-4 w-4"/></Button>
                </form> : <>
                  <label className="task-plan-main"><input type="checkbox" checked={Boolean(item.done)} onChange={()=>togglePlanItem(item.id)} aria-label={item.done ? `Отметить «${item.text}» невыполненной` : `Отметить «${item.text}» выполненной`}/><span>{item.text}</span></label>
                  <Button variant="ghost" size="icon-sm" aria-label="Редактировать подзадачу" title="Редактировать" onClick={()=>startEditingPlanItem(item)}><Pencil className="h-4 w-4"/></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить подзадачу" title="Удалить" onClick={()=>removePlanItem(item.id)}><X className="h-4 w-4"/></Button>
                </>}
              </div>)}
            </div> : !planComposerOpen ? <button type="button" onClick={()=>setPlanComposerOpen(true)} className="task-relations-empty">Добавить первую подзадачу</button> : null}
            {planComposerOpen && <form onSubmit={addPlanItem} className="task-plan-add task-plan-composer"><Input autoFocus value={planDraft} onChange={(e)=>setPlanDraft(e.target.value)} placeholder="Добавить подзадачу…" aria-label="Новая подзадача"/><div className="task-plan-composer-actions"><Button type="button" variant="ghost" size="sm" onClick={()=>{setPlanDraft('');setPlanComposerOpen(false);}}>Отмена</Button><Button type="submit" variant="ghost" size="sm" disabled={!planDraft.trim()}><Plus className="h-4 w-4"/>Добавить</Button></div></form>}
          </div>}
          {detailTab==='context' && <div className="task-detail-tab-content">
            <div className="task-tab-toolbar"><span className="task-tab-subtitle">Материалы</span><Button variant="ghost" size="sm" onClick={openMaterialDialog}><Plus className="h-4 w-4"/>Добавить материал</Button></div>
            {materials.length ? <div className="task-relations-list">{materials.map((item)=><div key={item.url} className="task-relation-row"><a href={item.url} target="_blank" rel="noreferrer" className="task-relation-main"><MaterialServiceIcon url={item.url}/><div className="min-w-0"><div className="task-relation-title">{item.title || item.url}</div></div><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></a><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Редактировать материал" title="Редактировать материал" onClick={()=>editMaterial(item)}><Pencil className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon-sm" aria-label="Удалить материал" title="Удалить материал" onClick={()=>removeMaterial(item.url)}><X className="h-4 w-4"/></Button></div></div>)}</div> : <button type="button" onClick={openMaterialDialog} className="task-relations-empty">Добавить первый материал</button>}
          </div>}
          {detailTab==='relations' && <div className="task-detail-tab-content">
            <div className="task-tab-toolbar"><span className="task-tab-subtitle">Связанные элементы</span><Button variant="ghost" size="sm" onClick={openRelationDialog}><Plus className="h-4 w-4"/>Добавить связь</Button></div>
            {(linkedGoals.length || linkedIssues.length || jiraLinks.length) ? <div className="task-relations-list">
              {linkedGoals.map((goal)=><div key={`goal:${goal.id}`} className="task-relation-row"><Link to={`/goals/${encodeURIComponent(goal.goalKey)}`} className="task-relation-main"><Target className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Цель</div><div className="task-relation-title">{goal.title || goal.name || goal.goalKey || goal.id}</div></div></Link><Button variant="ghost" size="icon-sm" aria-label="Удалить связь с целью" title="Удалить связь" onClick={()=>removeGoalLink(goal.goalKey)}><X className="h-4 w-4"/></Button></div>)}
              {linkedIssues.map((issue)=><div key={`issue:${issue.id}`} className="task-relation-row"><Link to={`/issues/${encodeURIComponent(issue.issueKey || issue.id)}`} className="task-relation-main"><CircleDot className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Проблема</div><div className="task-relation-title">{issue.title || issue.issueKey || issue.id}</div></div></Link><Button variant="ghost" size="icon-sm" aria-label="Удалить связь с проблемой" title="Удалить связь" onClick={()=>removeIssueLink(issue.id)}><X className="h-4 w-4"/></Button></div>)}
              {jiraLinks.map((item)=><div key={`jira:${item.url}`} className="task-relation-row"><a href={item.url} target="_blank" rel="noreferrer" className="task-relation-main"><Link2 className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Jira</div><div className="task-relation-title">{String(item.label || jiraLabelFromUrl(item.url)).replace(/^Jira\s*[·:\-]\s*/i, '')}</div></div><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></a><Button variant="ghost" size="icon-sm" aria-label="Удалить Jira-ссылку" title="Удалить связь" onClick={()=>removeJiraLink(item.url)}><X className="h-4 w-4"/></Button></div>)}
            </div> : <button type="button" onClick={openRelationDialog} className="task-relations-empty">Добавить первую связь</button>}
          </div>}
          {detailTab==='discussion' && <div className="task-detail-tab-content task-discussion-tab">
            <div className="space-y-4">{comments.data?.length ? <EditableComments comments={comments.data} onChanged={comments.reload} people={people.data} projects={projects.data} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/> : <div className="task-tab-empty-copy">Пока нет комментариев.</div>}
              <form onSubmit={addComment} className="task-comments-form"><MentionEditor className="min-w-0 flex-1" editorClassName="min-h-[72px] task-comments-editor" value={comment} onChange={setComment} people={people.data} projects={projects.data} placeholder="Написать комментарий..." ariaLabel="Комментарий"/><div className="task-comments-actions"><Button type="submit" variant="secondary" size="sm" disabled={!comment.trim()}>Отправить</Button></div></form>
            </div>
          </div>}
        </div>
        </div>
      </div>
      </div>
      <aside className="task-properties-column" aria-label="Свойства задачи">
        <SectionHeader title="Свойства" compact className="task-properties-title"/>
        <div className="task-properties-list">
          <div className="task-property-row"><span className="task-property-label">Статус</span><div className="task-attribute-item"><TaskStatusIcon task={task} onStatusChange={(value)=>patch({status:value})} showLabel/></div></div>
          <div className="task-property-row"><span className="task-property-label">Срок</span><div className="task-attribute-item"><div className={`things-task-meta-control ${isOverdue(task.dueDate,task.status)?'is-overdue':''}`}><input type="date" value={task.dueDate||''} onChange={(e)=>patch({dueDate:e.target.value||null})}/></div></div></div>
          <div className="task-property-row"><span className="task-property-label">Тип</span><div className="task-attribute-item"><Select value={task.taskType || 'standard'} onValueChange={(v)=>patch({taskType:v})}><SelectTrigger className="things-task-meta-select is-quiet task-meta-compact"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Проектная</SelectItem><SelectItem value="development">Технологизация</SelectItem></SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Приоритет</span><div className="task-attribute-item"><Select value={task.priority || 'normal'} onValueChange={(v)=>patch({priority:v})}><SelectTrigger className="things-task-meta-select is-quiet task-meta-compact"><TaskPriorityIcon priority={task.priority || 'normal'}/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="high">Важная</SelectItem><SelectItem value="normal">Обычный</SelectItem><SelectItem value="low">Низкий</SelectItem></SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Проект</span><div className="task-attribute-item"><Select value={task.projectId || 'none'} onValueChange={(v)=>patch({projectId:v==='none'?null:v})}><SelectTrigger className="things-task-meta-select is-quiet"><SelectValue placeholder="Без проекта"/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem>{projects.data.map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Исполнитель</span><div className="task-attribute-item"><Select value={task.assigneeIds?.[0] || 'none'} onValueChange={(v)=>patch({assigneeIds:v==='none'?[]:[v]})}><SelectTrigger className="things-task-meta-select is-quiet"><span>{assignee?.name || 'Без исполнителя'}</span><span className="sr-only"><SelectValue/></span></SelectTrigger><SelectContent><SelectItem value="none">Без исполнителя</SelectItem>{people.data.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div></div>
        </div>
      </aside>
    </div>
    <DetailSidebar
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      title="Заметки на полях"
      showLabel="Показать панель стикеров"
      hideLabel="Скрыть панель стикеров"
      showEdgeToggle={false}
      headerActions={<Button variant="ghost" size="icon-sm" onClick={()=>addStickyRef.current?.()} aria-label="Добавить стикер" title="Добавить стикер"><Plus className="h-4 w-4"/></Button>}
    >
      <StickyNotes entityType="task" entityId={task.id} notesPrefix={task.title || ''} addButtonRef={addStickyRef} legacyNotes={task.sidebarNotes || []} onLegacyMigrated={()=>patch({sidebarNotes:[]})}/>
    </DetailSidebar>

    <VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="tasks" entityId={task.id} onRestored={(restored)=>taskState.setData(restored)}/>
    <Dialog open={materialOpen} onOpenChange={(open)=>{ setMaterialOpen(open); if (!open) resetMaterialDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{materialEditingUrl ? 'Редактировать материал' : 'Добавить материал'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="task-material-title">Название</Label><Input id="task-material-title" value={materialTitle} onChange={(e)=>{setMaterialTitle(e.target.value);setMaterialError('');}} placeholder="Например, Макеты в Figma" autoFocus/></div>
          <div className="space-y-2"><Label htmlFor="task-material-url">Ссылка</Label><Input id="task-material-url" value={materialUrl} onChange={(e)=>{setMaterialUrl(e.target.value);setMaterialError('');}} placeholder="https://…" inputMode="url"/></div>
          {materialError && <p className="text-sm text-destructive">{materialError}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={()=>setMaterialOpen(false)}>Отмена</Button><Button onClick={saveMaterial} disabled={!materialTitle.trim() || !materialUrl.trim()}>{materialEditingUrl ? 'Сохранить' : 'Добавить'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={relationOpen} onOpenChange={(open)=>{ setRelationOpen(open); if (!open) resetRelationDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Добавить связь</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Тип связи</Label><Select value={relationType} onValueChange={(value)=>{ setRelationType(value); setRelationError(''); }}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="jira">Jira-тикет</SelectItem><SelectItem value="goal">Цель</SelectItem><SelectItem value="issue">Проблема</SelectItem></SelectContent></Select></div>
          {relationType === 'jira' ? <div className="space-y-2"><Label htmlFor="task-jira-link">Ссылка на Jira-тикет</Label><Input id="task-jira-link" value={jiraUrl} onChange={(e)=>setJiraUrl(e.target.value)} placeholder="https://company.atlassian.net/browse/ABC-123" inputMode="url" autoFocus/></div> : relationType === 'goal' ? <div className="space-y-2"><Label>Цель</Label><Select value={goalKey} onValueChange={setGoalKey}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите цель"/></SelectTrigger><SelectContent><SelectItem value="none">Выберите цель…</SelectItem>{goals.data.filter((goal)=>goal.goalKey && !linkedGoalKeys.includes(goal.goalKey)).map((goal)=><SelectItem key={goal.goalKey} value={goal.goalKey}>{goal.title || goal.name || goal.goalKey}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>Проблема</Label><Select value={issueId} onValueChange={setIssueId}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите проблему"/></SelectTrigger><SelectContent><SelectItem value="none">Выберите проблему…</SelectItem>{issues.data.filter((issue)=>!linkedIssueIds.includes(issue.id)).map((issue)=><SelectItem key={issue.id} value={issue.id}>{issue.title || issue.issueKey || issue.id}</SelectItem>)}</SelectContent></Select></div>}
          {relationError && <p className="text-sm text-destructive">{relationError}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={()=>setRelationOpen(false)}>Отмена</Button><Button onClick={saveRelation}>Добавить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Page>;
}

