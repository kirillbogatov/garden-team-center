import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleDot, Download, ExternalLink, History, Link2, List, Maximize2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { DetailAsideField, DetailHeader, DetailLayout, Page, PageHeader, Section } from '@/components/page';
import { DetailSidebar, DetailSidebarSection, DetailSidebarToggle, useDetailSidebarState } from '@/components/detail-sidebar';
import { VersionHistoryDialog } from '@/components/version-history';
import { MentionEditor } from '@/components/mention-editor';
import { PeopleField } from '@/components/people-field';
import { AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { compareMeetingsByLifecycle, localTodayKey, meetingDisplayTitle, meetingIsMissed, meetingLifecycle, MEETING_TYPE_LABEL, MEETING_TYPE_OPTIONS, normalizeMeetingType } from '@/lib/domain';
import { formatDate, formatEventDate, formatShortDate } from '@/lib/utils';
import { downloadTable } from '@/lib/tabular-export';
import { CatalogToolbar } from '@/components/catalog';
import { MeetingEntityRow } from '@/components/entity-row';
import { Tabs } from '@/components/patterns';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';

const MEETING_PERIODS = [
  ['upcoming','Будущие'], ['completed','Завершённые'], ['missed','Без итогов'], ['all','Все'],
];

export function MeetingsPage() {
  const navigate = useNavigate();
  const meetings = useResource('meetings');
  const people = useResource('people');
  const projects = useResource('projects');
  const [query, setQuery] = usePersistentFilter('meetings', 'query', '');
  const [type, setType] = usePersistentFilter('meetings', 'type', 'all');
  const [period, setPeriod] = usePersistentFilter('meetings', 'period', 'upcoming');
  const [view, setView] = React.useState(() => {
    try { return localStorage.getItem('garden:meetingsView') === 'calendar' ? 'calendar' : 'list'; }
    catch (_) { return 'list'; }
  });
  const todayDate = React.useMemo(() => new Date(), []);
  const [calendarCursor, setCalendarCursor] = React.useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  // `?create=1&type=1:1&participant=<personId>` opens the create dialog prefilled (used by the person profile).
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = React.useState(params.get('create') === '1');
  const createPreset = React.useMemo(()=>({ type: params.get('type') || '', participantIds: params.get('participant') ? [params.get('participant')] : [] }), []);
  const closeCreate = (open) => { setCreateOpen(open); if (!open && params.get('create')) setParams({}, { replace: true }); };
  const today = localTodayKey();
  const person = (id)=>people.data.find((item)=>item.id===id);
  const project = (id)=>projects.data.find((item)=>item.id===id);
  const matchesQueryAndType = React.useCallback((meeting) => {
    if (type !== 'all' && normalizeMeetingType(meeting.type) !== type) return false;
    const lower = query.trim().toLocaleLowerCase('ru');
    return !lower || `${meetingDisplayTitle(meeting, people.data)} ${meeting.title || ''} ${project(meeting.projectId)?.name || ''}`.toLocaleLowerCase('ru').includes(lower);
  }, [type, query, people.data, projects.data]);
  const filtered = meetings.data.filter((meeting) => {
    if (!matchesQueryAndType(meeting)) return false;
    if (period === 'upcoming') return meetingLifecycle(meeting, today) === 'upcoming';
    if (period === 'completed') return meetingLifecycle(meeting, today) === 'completed';
    if (period === 'missed') return meetingLifecycle(meeting, today) === 'missed';
    return true;
  }).sort((a,b) => {
    if (period === 'upcoming') return String(a.date||'').localeCompare(String(b.date||''));
    if (period === 'completed' || period === 'missed') return String(b.date||'').localeCompare(String(a.date||''));
    return compareMeetingsByLifecycle(a,b,today);
  });
  const calendarMeetings = meetings.data.filter(matchesQueryAndType);
  const missedCount = meetings.data.filter((meeting) => meetingLifecycle(meeting, today) === 'missed').length;
  const groups = period === 'upcoming' ? groupUpcomingMeetingsByWeek(filtered, today) : groupMeetingsByMonth(filtered);
  const [monthExpansionOverrides, setMonthExpansionOverrides] = React.useState({});
  const defaultGroupExpanded = (key) => !(period === 'upcoming' && groups.length > 1 && groups[groups.length - 1]?.key === key);
  const monthExpanded = (key) => monthExpansionOverrides[`${period}:${key}`] ?? defaultGroupExpanded(key);
  const toggleMonth = (key) => {
    const storageKey = `${period}:${key}`;
    setMonthExpansionOverrides((current) => ({ ...current, [storageKey]: !(current[storageKey] ?? defaultGroupExpanded(key)) }));
  };
  const changeView = (next) => {
    setView(next);
    try { localStorage.setItem('garden:meetingsView', next); } catch (_) { /* ignore */ }
  };

  return <Page>
    <PageHeader title="Встречи" actions={<Button data-primary-action="true" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Добавить встречу</Button>}/>
    {view === 'list' && <Tabs className="mb-[18px]" items={MEETING_PERIODS.map(([value, label]) => ({ value, label, count: value === 'missed' ? missedCount : undefined, tone: value === 'missed' ? 'warning' : undefined }))} value={period} onValueChange={setPeriod} ariaLabel="Период встреч" />}
    <CatalogToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по встречам" viewMode={view} onViewModeChange={changeView} viewModes={[{ value:'list', label:'Список', icon:List }, { value:'calendar', label:'Календарь', icon:CalendarDays }]} viewAriaLabel="Представление встреч">
      <Select value={type} onValueChange={setType}><SelectTrigger className="sm:min-w-[170px]"><SelectValue placeholder="Тип встречи"/></SelectTrigger><SelectContent><SelectItem value="all">Все типы</SelectItem>{MEETING_TYPE_OPTIONS.map((item)=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
    </CatalogToolbar>
    <div key={view} className="view-mode-transition">{meetings.error && !meetings.loading ? <ErrorState error={meetings.error} onRetry={meetings.reload}/> : meetings.loading ? <div className="space-y-3">{[1,2,3,4].map((item)=><Skeleton key={item} className="h-16"/>)}</div> : view === 'calendar' ? <MeetingsCalendarView meetings={calendarMeetings} cursor={calendarCursor} onCursorChange={setCalendarCursor} navigate={navigate} people={people.data} onMoveMeeting={async (meeting, nextDate) => { const currentDate=String(meeting.date||''); const suffix=currentDate.length>10 ? currentDate.slice(10) : ''; const date=`${nextDate}${suffix}`; const saved=await api.resource('meetings').update(meeting.id, { date }); meetings.setData((current)=>current.map((item)=>item.id===meeting.id ? saved : item)); return saved; }}/> : groups.length ? <div className="grouped-section-card">{groups.map((group)=>{const expanded=monthExpanded(group.key);return <section key={group.key} className="grouped-section-block"><button type="button" className="grouped-section-header w-full text-left" aria-expanded={expanded} onClick={()=>toggleMonth(group.key)}><ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded?'rotate-90':''}`} aria-hidden="true"/><span>{group.label}</span><span className="grouped-section-count">{group.items.length}</span></button>{expanded&&<div className="grouped-section-rows">{group.items.map((meeting)=><MeetingRow key={meeting.id} meeting={meeting} navigate={navigate} person={person} project={project} today={today}/>)}</div>}</section>})}</div> : <EmptyState title="Встреч не найдено" description="Попробуйте другую вкладку, тип встречи или поисковый запрос."/>}</div>
    <CreateMeetingDialog open={createOpen} onOpenChange={closeCreate} preset={createPreset} people={people.data} projects={projects.data} onSaved={(saved)=>{meetings.setData((current)=>[...current, saved]); navigate(`/meetings/${encodeURIComponent(saved.meetingKey || saved.id)}`);}}/>
  </Page>;
}

function MeetingsCalendarView({ meetings, cursor, onCursorChange, navigate, people, onMoveMeeting }) {
  const year=cursor.getFullYear(), month=cursor.getMonth()+1;
  const firstDay=(new Date(year,month-1,1).getDay()+6)%7;
  const days=new Date(year,month,0).getDate();
  const cells=Array.from({length:firstDay+days},(_,i)=>i<firstDay?null:i-firstDay+1);
  while(cells.length%7) cells.push(null);
  const iso=(day)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const monthLabelRaw=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(cursor);
  const monthLabel=monthLabelRaw.charAt(0).toUpperCase()+monthLabelRaw.slice(1);
  const todayIso=localTodayKey();
  const [draggingId,setDraggingId]=React.useState(null);
  const [dropDate,setDropDate]=React.useState('');
  const [movingId,setMovingId]=React.useState(null);
  const byDay=React.useMemo(()=>{
    const map=new Map();
    meetings.forEach((meeting)=>{
      const key=String(meeting.date||'').slice(0,10);
      if(!key)return;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(meeting);
    });
    map.forEach((items)=>items.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))));
    return map;
  },[meetings]);
  const participantNames=(meeting)=>(meeting.participantIds||[]).map((id)=>people.find((item)=>item.id===id)).filter(Boolean);
  return <section className="meetings-calendar-view">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="text-base font-medium">{monthLabel}</div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={()=>onCursorChange(new Date(year,month-2,1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4"/></Button>
        <Button variant="outline" size="sm" onClick={()=>{const now=new Date();onCursorChange(new Date(now.getFullYear(),now.getMonth(),1));}}>Сегодня</Button>
        <Button variant="outline" size="icon" onClick={()=>onCursorChange(new Date(year,month,1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4"/></Button>
      </div>
    </div>
    <div className="meetings-calendar overflow-hidden rounded-[10px] border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/20 text-xs text-muted-foreground">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day)=><div key={day} className="px-2.5 py-2">{day}</div>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((day,index)=>{
          const dateKey=day?iso(day):'';
          const dayMeetings=day?(byDay.get(dateKey)||[]):[];
          const visible=dayMeetings.slice(0,3);
          return <div key={`${index}-${day||'empty'}`} onDragOver={day?(event)=>{event.preventDefault();event.dataTransfer.dropEffect='move';setDropDate(dateKey);}:undefined} onDragLeave={day?()=>setDropDate((current)=>current===dateKey?'':current):undefined} onDrop={day?async(event)=>{event.preventDefault();const id=event.dataTransfer.getData('text/meeting-id')||draggingId;const meeting=meetings.find((item)=>String(item.id)===String(id));setDropDate('');setDraggingId(null);if(!meeting||String(meeting.date||'').slice(0,10)===dateKey||!onMoveMeeting)return;setMovingId(meeting.id);try{await onMoveMeeting(meeting,dateKey);}finally{setMovingId(null);}}:undefined} className={`meetings-calendar-day min-h-[118px] border-b border-r p-2.5 last:border-r-0 ${day?'bg-card':'bg-muted/[.12]'} ${dropDate===dateKey&&draggingId?'is-drop-target':''}`}>
            {day&&<><div className={`mb-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs ${dateKey===todayIso?'bg-primary/15 text-foreground':'text-muted-foreground'}`}>{day}</div><div className="space-y-1">{visible.map((meeting)=>{const title=meetingDisplayTitle(meeting, participantNames(meeting));const typeLabel=MEETING_TYPE_LABEL[normalizeMeetingType(meeting.type)]||'Другое';return <button key={meeting.id} type="button" draggable={movingId!==meeting.id} onDragStart={(event)=>{setDraggingId(meeting.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/meeting-id',String(meeting.id));}} onDragEnd={()=>{setDraggingId(null);setDropDate('');}} onClick={()=>navigate(`/meetings/${encodeURIComponent(meeting.meetingKey || meeting.id)}`)} className={`meeting-calendar-event ui-focus-ring block w-full rounded-[5px] bg-muted/55 px-2 py-1.5 text-left transition-colors hover:bg-accent/60 ${draggingId===meeting.id?'is-dragging':''} ${movingId===meeting.id?'opacity-50':''}`} title={`${title} — ${typeLabel}`}><span className="block truncate text-xs text-foreground">{title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{typeLabel}</span></button>;})}{dayMeetings.length>3&&<div className="px-2 pt-0.5 text-xs text-muted-foreground">Ещё {dayMeetings.length-3}</div>}</div></>}
          </div>;
        })}
      </div>
    </div>
  </section>;
}

export function CreateMeetingDialog({ open, onOpenChange, people, projects, onSaved, preset = {} }) {
  const { draft, field, saving, error, save } = useCrudDialogForm({
    resource: 'meetings', open, item: null, onOpenChange, onSaved,
    buildDraft: () => ({ type: normalizeMeetingType(preset.type), date: localTodayKey(), title: '', projectId: '', participantIds: preset.participantIds || [] }),
    validate: (d) => (!d.date ? 'Укажите дату встречи' : null),
    buildPayload: (d) => ({
      type: d.type, date: d.date, title: d.title.trim() || 'Встреча', projectId: d.projectId || null,
      participantIds: d.participantIds, notes: '', actionItems: [], prepNotes: '', documentLinks: [],
    }),
    mapSaveError: (e) => e?.status === 403 ? 'Недостаточно прав для создания встречи' : 'Не удалось создать встречу',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Добавить встречу</DialogTitle></DialogHeader>
    <div className="grid gap-4 py-1">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div className="space-y-1.5"><Label>Тип</Label><Select value={draft.type||'other'} onValueChange={(value)=>field('type', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{MEETING_TYPE_OPTIONS.map((item)=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="new-meeting-date">Дата</Label><Input id="new-meeting-date" type="date" className="px-2" value={draft.date||''} onChange={(e)=>field('date', e.target.value)}/></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="new-meeting-title">Название</Label><Input id="new-meeting-title" value={draft.title||''} onChange={(e)=>field('title', e.target.value)} placeholder="Например, синк по проекту"/></div>
      {!['1:1','pr'].includes(draft.type) && <div className="space-y-1.5"><Label>Проект (необязательно)</Label><Select value={draft.projectId || '__none'} onValueChange={(projectId)=>field('projectId', projectId==='__none' ? '' : projectId)}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger><SelectContent><SelectItem value="__none">—</SelectItem>{projects.map((project)=><SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>}
      <PeopleField label="Участники" people={people} value={draft.participantIds||[]} onChange={(ids)=>field('participantIds', ids)}/>
      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Создаю…' : 'Создать встречу'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function groupUpcomingMeetingsByWeek(items, todayKey) {
  const thisWeekEnd = weekEnd(mondayKey(todayKey));
  const nextWeekEnd = weekEnd(shiftWeek(mondayKey(todayKey), 1));
  const buckets = [
    { key: 'this-week', label: 'Эта неделя', items: [] },
    { key: 'next-week', label: 'Следующая неделя', items: [] },
    { key: 'later', label: 'Позже', items: [] },
  ];
  items.forEach((meeting) => {
    const d = String(meeting.date || '').slice(0, 10);
    const bucket = (!d || d <= thisWeekEnd) ? buckets[0] : (d <= nextWeekEnd ? buckets[1] : buckets[2]);
    bucket.items.push(meeting);
  });
  return buckets.filter((group) => group.items.length);
}

function groupMeetingsByMonth(items) {
  const formatter = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'});
  const groups = [];
  const map = new Map();
  items.forEach((meeting)=>{const key=String(meeting.date||'').slice(0,7)||'no-date';if(!map.has(key)){let label='Без даты';if(key!=='no-date'){const [year,month]=key.split('-').map(Number);label=formatter.format(new Date(year,month-1,1));label=label.charAt(0).toUpperCase()+label.slice(1);}const group={key,label,items:[]};map.set(key,group);groups.push(group);}map.get(key).items.push(meeting);});
  return groups;
}

function MeetingRow({ meeting, navigate, person, project, today }) {
  const participants=(meeting.participantIds||[]).map(person).filter(Boolean);
  const missed=meetingIsMissed(meeting,today);
  const projectName=project(meeting.projectId)?.name || '';
  return <MeetingEntityRow
    dateLabel={formatEventDate(meeting.date)}
    title={meetingDisplayTitle(meeting, participants)}
    typeLabel={MEETING_TYPE_LABEL[meeting.type]||'Другое'}
    projectName={projectName}
    missed={missed}
    participants={participants.map((item)=>({id:item.id, avatar:<Avatar person={item} size="xs" className="ring-2 ring-card"/>}))}
    onOpen={()=>navigate(`/meetings/${encodeURIComponent(meeting.meetingKey || meeting.id)}`)}
    className={missed?'bg-amber-500/[.035]':''}
  />;
}

export function MeetingDetailPage() {
  const {id}=useParams();
  const navigate=useNavigate();
  const state=useEndpoint(`/api/meetings/${encodeURIComponent(id)}`,[id]);
  const people=useResource('people');
  const projects=useResource('projects');
  const agreements=useResource('agreements');
  const journal=useResource('journal');
  const issues=useResource('issues');
  const [saving,setSaving]=React.useState(false);
  const [documentOpen,setDocumentOpen]=React.useState(false);
  const [prepExpanded,setPrepExpanded]=React.useState(false);
  const [historyOpen,setHistoryOpen]=React.useState(false);
  const [documentTitle,setDocumentTitle]=React.useState('');
  const [documentUrl,setDocumentUrl]=React.useState('');
  const [documentError,setDocumentError]=React.useState('');
  const [sidebarOpen,setSidebarOpen]=useDetailSidebarState('garden-meeting-detail-sidebar');
  const dateInputRef=React.useRef(null);

  if(state.loading)return <Page narrow><Skeleton className="h-80"/></Page>;
  const m=state.data;
  if(!m)return <Page narrow><EmptyState title="Встреча не найдена"/></Page>;

  const patch=async(body)=>{setSaving(true);try{state.setData(await api.resource('meetings').update(m.id,body));}finally{setSaving(false)}};
  const remove=async()=>{if(!confirm('Удалить встречу?'))return;await api.resource('meetings').remove(m.id);navigate('/meetings');};
  const participants=(m.participantIds||[]).map((id)=>people.data.find((p)=>p.id===id)).filter(Boolean);
  const project=projects.data.find((p)=>p.id===m.projectId);
  const employee=['1:1','pr'].includes(m.type) ? participants[0] : null;
  const employeeAgreements=employee ? agreements.data.filter((agreement)=>agreement.status!=='done' && ((agreement.withPersonIds||[]).includes(employee.id) || (agreement.mentions||[]).some((mention)=>mention.id===employee.id))) : [];
  const sixMonthsAgo=new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
  const employeeJournal=employee ? journal.data.filter((entry)=>{
    const timestamp=new Date(entry.createdAt);
    return !Number.isNaN(timestamp.getTime()) && timestamp>=sixMonthsAgo && timestamp<=new Date() && (entry.mentions||[]).some((mention)=>mention.id===employee.id);
  }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))) : [];
  const employeeIssues=employee ? issues.data.filter((issue)=>issue.status!=='resolved' && (issue.relatedPersonIds||[]).includes(employee.id)) : [];
  const documents=Array.isArray(m.documentLinks)?m.documentLinks:[];
  const openDocumentDialog=()=>{setDocumentTitle('');setDocumentUrl('');setDocumentError('');setDocumentOpen(true)};
  const saveDocument=async()=>{const title=documentTitle.trim(),url=documentUrl.trim();if(!title||!url){setDocumentError('Укажите название и ссылку документа');return;}if(!/^https?:\/\//i.test(url)){setDocumentError('Ссылка должна начинаться с http:// или https://');return;}await patch({documentLinks:[...documents,{title,url}]});setDocumentOpen(false);};
  const removeDocument=async(index)=>{await patch({documentLinks:documents.filter((_,i)=>i!==index)});};
  const dateLabel=formatEventDate(m.date, { short:false });

  return <Page narrow className={`meeting-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}>
    <div className="mb-7 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={()=>navigate('/meetings')}><ArrowLeft className="h-4 w-4"/>Встречи</Button>
      <div className="detail-page-header-actions">
        {saving&&<span className="text-xs text-muted-foreground">Сохраняю…</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История версий</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem className="text-destructive" onSelect={remove}><Trash2 className="h-4 w-4"/>Удалить встречу</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Контекст встречи" showLabel="Показать контекст встречи" hideLabel="Скрыть контекст встречи"/>
      </div>
    </div>
    <DetailHeader title={meetingDisplayTitle(m, people.data)} description={project?.name || ''} meta={<>
      <Select value={normalizeMeetingType(m.type)} onValueChange={(type)=>patch({type})}>
        <SelectTrigger className="meeting-detail-meta-select" aria-label="Тип встречи"><SelectValue/></SelectTrigger>
        <SelectContent>{MEETING_TYPE_OPTIONS.map((item)=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <label className="meeting-detail-date-control" onClick={()=>{ try { dateInputRef.current?.showPicker?.(); } catch {} }}>
        <CalendarDays className="h-3.5 w-3.5"/>
        <span className="meeting-detail-date-label">{dateLabel}</span>
        <input
          ref={dateInputRef}
          type="date"
          value={String(m.date || '').slice(0,10)}
          onChange={(event)=>{
            const value=event.target.value;
            if(!value)return;
            const current=String(m.date || '');
            const suffix=current.length>10?current.slice(10):'';
            patch({date:`${value}${suffix}`});
          }}
          aria-label="Дата встречи"
        />
      </label>
      {participants.map((p)=><Link key={p.id} to={`/people/${encodeURIComponent(p.id)}`} className="meeting-header-person"><Avatar person={p} size="xs"/><span>{p.name}</span></Link>)}
    </>}/>

    <div className="task-detail-layout py-7">
      <div className="task-detail-main space-y-6">
        <Section title="Документы" actions={<Button variant="ghost" size="sm" onClick={openDocumentDialog}><Plus className="h-4 w-4"/>Добавить документ</Button>}>{documents.length?<div className="task-relations-list">{documents.map((doc,index)=><div key={`${doc.url || ''}:${index}`} className="task-relation-row"><a href={doc.url} target="_blank" rel="noreferrer" className="task-relation-main"><Link2 className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="task-relation-title">{doc.title || doc.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/></a><Button variant="ghost" size="icon-sm" onClick={()=>removeDocument(index)} aria-label="Удалить документ"><Trash2 className="h-3.5 w-3.5"/></Button></div>)}</div>:<button type="button" onClick={openDocumentDialog} className="task-relations-empty">Документов пока нет</button>}</Section>
        <Section title="Итоги"><MentionEditor value={m.notes||''} onChange={(value)=>state.setData({...m,notes:value})} onBlur={(value)=>patch({notes:value})} people={people.data} projects={projects.data} placeholder="Решения, выводы и контекст…" editorClassName="min-h-[150px]" ariaLabel="Итоги встречи"/></Section>
        <Section title="Следующие шаги"><MentionEditor value={m.nextSteps||''} onChange={(value)=>state.setData({...m,nextSteps:value})} onBlur={(value)=>patch({nextSteps:value})} people={people.data} projects={projects.data} placeholder="Кто и что делает после встречи?" ariaLabel="Следующие шаги"/></Section>
      </div>

      <DetailSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} title="Контекст встречи" showLabel="Показать контекст встречи" showEdgeToggle={false}>
        <DetailSidebarSection title={<span className="meeting-prep-heading"><span>Подготовка</span><button type="button" className="meeting-prep-expand" onClick={()=>setPrepExpanded(true)} aria-label="Развернуть подготовку" title="Развернуть подготовку"><Maximize2 className="h-3.5 w-3.5"/></button></span>}>
          <MentionEditor value={m.prepNotes||''} onChange={(value)=>state.setData((current)=>({...current,prepNotes:value}))} onBlur={(value)=>patch({prepNotes:value})} people={people.data} projects={projects.data} placeholder="Что важно обсудить?" editorClassName="meeting-prep-editor min-h-[140px]" ariaLabel="Подготовка к встрече"/>
        </DetailSidebarSection>

        {employee&&<DetailSidebarSection title="Сотрудник" className="meeting-employee-context">
          <Link to={`/people/${encodeURIComponent(employee.id)}`} className="meeting-context-person"><Avatar person={employee} size="sm"/><span>{employee.name}</span></Link>
          <div className="meeting-context-group">
            <div className="meeting-context-group-title">Открытые договорённости</div>
            {employeeAgreements.length?<div className="meeting-context-list">{employeeAgreements.map((agreement)=><Link key={agreement.id} to={`/agreements/${encodeURIComponent(agreement.agreementKey || agreement.id)}`} className="meeting-context-row"><span className="meeting-context-dot" aria-hidden="true"/><span className="min-w-0 truncate">{agreement.text||agreement.title||'Договорённость'}</span></Link>)}</div>:<div className="meeting-context-empty">Нет открытых договорённостей</div>}
          </div>
          <div className="meeting-context-group">
            <div className="meeting-context-group-title">Открытые проблемы</div>
            {employeeIssues.length?<div className="meeting-context-list">{employeeIssues.map((issue)=><Link key={issue.id} to={`/issues/${encodeURIComponent(issue.issueKey || issue.id)}`} className="meeting-context-row"><CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/><span className="min-w-0 truncate">{issue.title}</span></Link>)}</div>:<div className="meeting-context-empty">Нет открытых проблем</div>}
          </div>
          <div className="meeting-context-group">
            <div className="meeting-context-group-title">Записи в журнале <span className="meeting-journal-period">6 месяцев</span></div>
            {employeeJournal.length?<div className="meeting-context-list">{employeeJournal.map((entry)=><Link key={entry.id} to={`/journal?entry=${encodeURIComponent(entry.noteKey||entry.id)}`} className="meeting-context-row meeting-journal-row"><span className="meeting-journal-date">{formatShortDate(entry.createdAt)}</span><span className="min-w-0 line-clamp-2">{String(entry.text||'').replace(/@\[([^\]]+)\]\((?:person|project|stakeholder|team):[^)]+\)/g,'@$1')}</span></Link>)}</div>:<div className="meeting-context-empty">За последние 6 месяцев записей нет</div>}
          </div>
        </DetailSidebarSection>}
      </DetailSidebar>
    </div>

    <Dialog open={prepExpanded} onOpenChange={setPrepExpanded}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Подготовка к встрече</DialogTitle></DialogHeader>
        <MentionEditor value={m.prepNotes||''} onChange={(value)=>state.setData((current)=>({...current,prepNotes:value}))} onBlur={(value)=>patch({prepNotes:value})} people={people.data} projects={projects.data} placeholder="Что важно обсудить?" editorClassName="meeting-prep-editor-expanded min-h-[320px]" ariaLabel="Подготовка к встрече — развёрнутый редактор"/>
        <DialogFooter><Button variant="outline" onClick={()=>setPrepExpanded(false)}>Готово</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="meetings" entityId={m.id} onRestored={(restored)=>state.setData(restored)}/>
    <Dialog open={documentOpen} onOpenChange={setDocumentOpen}><DialogContent><DialogHeader><DialogTitle>Добавить документ</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input className="mt-1.5" value={documentTitle} onChange={(e)=>setDocumentTitle(e.target.value)} placeholder="Например, презентация" autoFocus/></div><div><Label>Ссылка</Label><Input className="mt-1.5" value={documentUrl} onChange={(e)=>setDocumentUrl(e.target.value)} placeholder="https://…" inputMode="url"/></div>{documentError&&<div className="text-sm text-destructive">{documentError}</div>}</div><DialogFooter><Button variant="ghost" onClick={()=>setDocumentOpen(false)}>Отмена</Button><Button onClick={saveDocument}>Добавить</Button></DialogFooter></DialogContent></Dialog>
  </Page>;
}


const CALENDAR_EVENT_TYPES = [
  { key: 'meeting', label: 'Встречи', emoji: '📅' },
  { key: 'birthday', label: 'Дни рождения', emoji: '🎂' },
  { key: 'vacation', label: 'Отпуска', emoji: '🌴' },
  { key: 'sick', label: 'Больничные', emoji: '🤒' },
  { key: 'dayoff', label: 'Отгулы', emoji: '☕' },
];
const CALENDAR_ABSENCE_LABEL = { vacation: 'отпуск', sick: 'больничный', dayoff: 'отгул' };
const CALENDAR_FILTER_STORAGE = 'garden:calendarFilters';
const CALENDAR_BAR_LANE_HEIGHT = 24;
const CALENDAR_BAR_TOP_OFFSET = 40;

function initialCalendarFilters() {
  const defaults = Object.fromEntries(CALENDAR_EVENT_TYPES.map((item) => [item.key, true]));
  try {
    const stored = JSON.parse(localStorage.getItem(CALENDAR_FILTER_STORAGE) || 'null');
    return stored && typeof stored === 'object' ? { ...defaults, ...stored } : defaults;
  } catch (_) {
    return defaults;
  }
}

export function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [cursor,setCursor] = React.useState(new Date(today.getFullYear(),today.getMonth(),1));
  const [filters,setFilters] = usePersistentFilter('calendar', 'filters', initialCalendarFilters);
  const year=cursor.getFullYear(), month=cursor.getMonth()+1;
  const state=useEndpoint(`/api/calendar/month?year=${year}&month=${month}`,[year,month]);
  const people=useResource('people');
  const me=useEndpoint('/api/auth/me');
  const vacAccess=me.data?.user?.access?.vacations || 'none';
  const canManageOwnAbsences=['own_manage','all_own_manage','all_manage'].includes(vacAccess);
  const canManageAllAbsences=vacAccess==='all_manage';
  const currentPersonId=me.data?.user?.personId || null;
  const canEditAbsence=(item)=>canManageAllAbsences||(canManageOwnAbsences&&item.personId===currentPersonId);
  const [absenceOpen,setAbsenceOpen]=React.useState(false);
  const [absenceItem,setAbsenceItem]=React.useState(null);
  const openCreateAbsence=()=>{ setAbsenceItem(null); setAbsenceOpen(true); };
  const openEditAbsence=(item)=>{ setAbsenceItem(item); setAbsenceOpen(true); };
  const firstDay=(new Date(year,month-1,1).getDay()+6)%7;
  const days=new Date(year,month,0).getDate();
  const cells=Array.from({length:firstDay+days},(_,i)=>i<firstDay?null:i-firstDay+1);
  while(cells.length%7)cells.push(null);
  const iso=(day)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const personName=(id)=>people.data.find((person)=>person.id===id)?.name || 'Сотрудник';
  const toggleFilter=(key)=>setFilters((current)=>{
    const next={...current,[key]:!current[key]};
    try{localStorage.setItem(CALENDAR_FILTER_STORAGE,JSON.stringify(next));}catch(_){/* ignore */}
    return next;
  });
  const eventClass=(type)=>({
    meeting:'bg-violet-500/10 text-violet-800 dark:text-violet-300',
    birthday:'bg-pink-500/10 text-pink-700 dark:text-pink-300',
    vacation:'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    sick:'bg-rose-500/10 text-rose-800 dark:text-rose-300',
    dayoff:'bg-sky-500/10 text-sky-800 dark:text-sky-300',
  }[type] || 'bg-muted text-foreground');
  const dayEventsFor=(day)=>{
    if(!day||!state.data)return[];
    const d=iso(day);
    const out=[];
    if(filters.meeting) state.data.meetings?.filter((m)=>String(m.date).slice(0,10)===d).forEach((m)=>out.push({
      type:'meeting',
      title:`${m.title || 'Встреча'}${MEETING_TYPE_LABEL[m.type]?` — ${MEETING_TYPE_LABEL[m.type]}`:''}`,
      onClick:()=>navigate(`/meetings/${encodeURIComponent(m.meetingKey || m.id)}`),
    }));
    if(filters.birthday) state.data.birthdays?.filter((p)=>p.birthday?.slice(5)===d.slice(5)).forEach((p)=>out.push({
      type:'birthday', title:`${p.name} — день рождения`, onClick:()=>navigate(`/people/${encodeURIComponent(p.id)}`),
    }));
    return out;
  };
  const barItems=React.useMemo(()=>{
    if(!state.data)return[];
    return (state.data.vacations||[]).filter((item)=>filters[item.type]).map((item)=>({
      ...item,
      title:`${personName(item.personId)} — ${CALENDAR_ABSENCE_LABEL[item.type]}`,
      onClick: canEditAbsence(item) ? ()=>openEditAbsence(item) : ()=>navigate(`/people/${encodeURIComponent(item.personId)}`),
    }));
  },[state.data,filters.vacation,filters.sick,filters.dayoff,people.data,canManageAllAbsences,canManageOwnAbsences,currentPersonId]);
  const weeks=[];
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
  const weekBars=(week)=>{
    const segments=[];
    barItems.forEach((item)=>{
      let colStart=-1,colEnd=-1;
      week.forEach((day,col)=>{
        if(!day)return;
        const d=iso(day);
        if(item.startDate<=d&&item.endDate>=d){ if(colStart===-1)colStart=col; colEnd=col; }
      });
      if(colStart!==-1) segments.push({
        item, colStart, colEnd,
        isStart: iso(week[colStart])===item.startDate,
        isEnd: iso(week[colEnd])===item.endDate,
      });
    });
    segments.sort((a,b)=>a.colStart-b.colStart);
    const laneEnds=[];
    segments.forEach((seg)=>{
      let lane=laneEnds.findIndex((end)=>end<seg.colStart);
      if(lane===-1){ lane=laneEnds.length; laneEnds.push(seg.colEnd); }
      else laneEnds[lane]=seg.colEnd;
      seg.lane=lane;
    });
    return { segments, laneCount: laneEnds.length };
  };
  const monthLabelRaw=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(cursor);
  const monthLabel=monthLabelRaw.charAt(0).toUpperCase()+monthLabelRaw.slice(1);
  const todayIso=today.toISOString().slice(0,10);
  return <Page>
    <PageHeader title="Календарь" actions={<div className="flex items-center gap-2">{canManageOwnAbsences&&<Button size="sm" onClick={openCreateAbsence}><Plus className="h-4 w-4"/>Добавить отсутствие</Button>}<div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month-2,1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" size="sm" onClick={()=>setCursor(new Date(today.getFullYear(),today.getMonth(),1))}>Сегодня</Button><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month,1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4"/></Button></div></div>}/>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-base font-semibold">{monthLabel}</div>
      <div className="flex flex-wrap items-center justify-end gap-1.5" aria-label="Фильтр типов событий">
        {CALENDAR_EVENT_TYPES.map((item)=><button type="button" key={item.key} aria-pressed={filters[item.key]} onClick={()=>toggleFilter(item.key)} className={`ui-focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition ${filters[item.key]?'border-border bg-muted/55 text-foreground':'border-transparent text-muted-foreground opacity-55 hover:opacity-85'}`}><span aria-hidden="true">{item.emoji}</span><span>{item.label}</span></button>)}
      </div>
    </div>
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/30">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d)=><div key={d} className="px-2 py-2 text-center text-[12px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{d}</div>)}</div>
      {weeks.map((week,wi)=>{
        const {segments,laneCount}=weekBars(week);
        const barsHeight=laneCount*CALENDAR_BAR_LANE_HEIGHT;
        return <div key={wi} className="relative grid grid-cols-7 border-b last:border-b-0">
          {week.map((day,di)=>{
            const events=dayEventsFor(day);
            const isToday=day&&iso(day)===todayIso;
            return <div key={di} className="min-h-[126px] border-r p-2 last:border-r-0">
              <div className={`mb-2 grid h-6 w-6 place-items-center rounded-full text-xs ${isToday?'bg-primary text-primary-foreground':'text-muted-foreground'}`}>{day||''}</div>
              {barsHeight>0&&<div style={{height:barsHeight}} aria-hidden="true"/>}
              <div className="space-y-1">{events.slice(0,4).map((event,i)=><button type="button" key={`${event.type}:${i}:${event.title}`} onClick={event.onClick} className={`block w-full truncate rounded px-1.5 py-1 text-left text-[12px] ${eventClass(event.type)}`} title={event.title}><span className="mr-1" aria-hidden="true">{CALENDAR_EVENT_TYPES.find((item)=>item.key===event.type)?.emoji}</span>{event.title}</button>)}{events.length>4&&<div className="px-1 text-[12px] text-muted-foreground">ещё {events.length-4}</div>}</div>
            </div>;
          })}
          {laneCount>0&&<div className="pointer-events-none absolute inset-x-0 grid grid-cols-7" style={{top:CALENDAR_BAR_TOP_OFFSET,height:barsHeight}}>
            {segments.map((seg,i)=><button type="button" key={`${seg.item.id}:${i}`} onClick={seg.item.onClick} title={seg.item.title} style={{gridColumn:`${seg.colStart+1} / ${seg.colEnd+2}`,top:seg.lane*CALENDAR_BAR_LANE_HEIGHT}} className={`pointer-events-auto absolute inset-x-0.5 flex h-5 items-center truncate px-2 text-left text-[12px] ${eventClass(seg.item.type)} ${seg.isStart?'rounded-l-full':''} ${seg.isEnd?'rounded-r-full':''}`}><span className="mr-1 shrink-0" aria-hidden="true">{CALENDAR_EVENT_TYPES.find((t)=>t.key===seg.item.type)?.emoji}</span><span className="truncate">{seg.item.title}</span></button>)}
          </div>}
        </div>;
      })}
    </div>
    <AbsenceDialog
      open={absenceOpen}
      item={absenceItem}
      people={people.data}
      canManageAll={canManageAllAbsences}
      currentPersonId={currentPersonId}
      onOpenChange={(next)=>{ setAbsenceOpen(next); if(!next) setAbsenceItem(null); }}
      onSaved={()=>state.reload()}
    />
  </Page>;
}

const ABSENCE_TYPE_OPTIONS = [
  { value: 'vacation', label: 'Отпуск' },
  { value: 'sick', label: 'Больничный' },
  { value: 'dayoff', label: 'Отгул' },
];

function AbsenceDialog({ open, item, people, canManageAll, currentPersonId, onOpenChange, onSaved }) {
  const eligiblePeople = people.filter((p)=>p.type==='team' && !['dismissed','transferred'].includes(p.status));
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'vacations', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({
      type: current?.type || 'vacation',
      personId: current?.personId || (canManageAll ? (eligiblePeople[0]?.id || '') : (currentPersonId || '')),
      startDate: current?.startDate || localTodayKey(),
      endDate: current?.endDate || localTodayKey(),
      note: current?.note || '',
    }),
    validate: (d) => {
      if (!d.personId) return 'Укажите сотрудника';
      if (!d.startDate || !d.endDate) return 'Укажите даты начала и окончания';
      if (d.endDate < d.startDate) return 'Дата окончания раньше даты начала';
      return null;
    },
    buildPayload: (d) => ({ type: d.type, personId: d.personId, startDate: d.startDate, endDate: d.endDate, note: d.note.trim() || null }),
    mapSaveError: (e) => e?.status===403 ? 'Недостаточно прав для изменения' : 'Не удалось сохранить',
  });
  const personName = (id) => people.find((p)=>p.id===id)?.name || 'Сотрудник';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{isEdit?'Редактировать отсутствие':'Добавить отсутствие'}</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div><Label>Тип</Label><Select value={draft.type||'vacation'} onValueChange={(v)=>field('type',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{ABSENCE_TYPE_OPTIONS.map((option)=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Сотрудник</Label>{canManageAll ? <Select value={draft.personId||''} onValueChange={(v)=>field('personId',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Выберите сотрудника"/></SelectTrigger><SelectContent>{eligiblePeople.map((person)=><SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select> : <div className="mt-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">{personName(draft.personId)}</div>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Начало</Label><Input className="mt-1.5" type="date" value={draft.startDate||''} onChange={(e)=>field('startDate',e.target.value)}/></div><div><Label>Окончание</Label><Input className="mt-1.5" type="date" value={draft.endDate||''} onChange={(e)=>field('endDate',e.target.value)}/></div></div>
      <div><Label>Заметка</Label><Input className="mt-1.5" value={draft.note||''} onChange={(e)=>field('note',e.target.value)} placeholder="Необязательно"/></div>
      {error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
    <DialogFooter className="justify-between"><div>{isEdit&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter>
  </DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Удалить отсутствие?" onConfirm={remove} busy={saving}/>
  </Dialog>;
}

function dateKey(date) {
  const value = new Date(date);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function mondayKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0,10)}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return dateKey(date);
}
function shiftWeek(key, delta) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + delta * 7);
  return dateKey(date);
}
function weekEnd(key) { const date = new Date(`${key}T00:00:00`); date.setDate(date.getDate() + 6); return dateKey(date); }
function weekRangeLabel(key) { return `${formatShortDate(key)} — ${formatDate(weekEnd(key))}`; }

export function CheckinsPage() {
  const checkins = useResource('checkins');
  const people = useResource('people');
  const [params, setParams] = useSearchParams();
  const requestedPerson = params.get('person');
  const team = people.data.filter((person) => person.type === 'team' && !['dismissed','transferred','on_leave'].includes(person.status));
  const currentWeek = mondayKey();
  const [mode, setMode] = React.useState(requestedPerson ? 'person' : 'week');
  const [week, setWeek] = React.useState(currentWeek);
  const [personId, setPersonId] = React.useState(requestedPerson || '');
  const [exportOpen, setExportOpen] = React.useState(false);
  const weekInputRef = React.useRef(null);

  React.useEffect(() => {
    if (requestedPerson) { setMode('person'); setPersonId(requestedPerson); }
  }, [requestedPerson]);
  React.useEffect(() => {
    if (!personId && team[0]?.id) setPersonId(team[0].id);
    if (personId && team.length && !team.some((person) => person.id === personId)) setPersonId(team[0]?.id || '');
  }, [team.length, personId]);

  const updateRecord = React.useCallback((saved) => {
    checkins.setData((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
    });
  }, [checkins.setData]);

  const saveField = React.useCallback(async ({ personId: ownerId, weekStart, record, field, value }) => {
    const clean = String(value || '').trim();
    if (!record && !clean) return null;
    const payload = record
      ? { personId: record.personId, weekStart: record.weekStart, did: record.did || '', willDo: record.willDo || '', blockers: record.blockers || '', [field]: clean }
      : { personId: ownerId, weekStart, did: '', willDo: '', blockers: '', [field]: clean };
    const saved = record ? await api.resource('checkins').update(record.id, payload) : await api.resource('checkins').create(payload);
    updateRecord(saved);
    return saved;
  }, [updateRecord]);

  const chooseMode = (next) => {
    setMode(next);
    const updated = new URLSearchParams(params);
    if (next === 'week') updated.delete('person');
    else if (personId) updated.set('person', personId);
    setParams(updated, { replace: true });
  };
  const choosePerson = (value) => {
    setPersonId(value);
    const updated = new URLSearchParams(params); updated.set('person', value); setParams(updated, { replace: true });
  };

  return <Page className="!max-w-[1400px]">
    <PageHeader title="Weekly" actions={<Button variant="outline" size="sm" onClick={()=>setExportOpen(true)}><Download className="h-4 w-4"/>Экспорт</Button>}/>
    <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="flex w-fit rounded-lg border bg-muted/25 p-1">
        <button type="button" onClick={()=>chooseMode('week')} className={`ui-focus-ring rounded-md px-3 py-1.5 text-xs font-medium ${mode==='week'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По неделям</button>
        <button type="button" onClick={()=>chooseMode('person')} className={`ui-focus-ring rounded-md px-3 py-1.5 text-xs font-medium ${mode==='person'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По сотрудникам</button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={()=>setWeek(shiftWeek(week,-1))} aria-label="Предыдущая неделя"><ChevronLeft className="h-4 w-4"/></Button>
        <label className="ui-focus-ring-within relative cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted" onClick={()=>{ try { weekInputRef.current?.showPicker?.(); } catch {} }}>
          <span>{weekRangeLabel(week)}{week===currentWeek?' · текущая':''}</span>
          <input ref={weekInputRef} type="date" value={week} onChange={(event)=>event.target.value&&setWeek(mondayKey(event.target.value))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Выбрать неделю"/>
        </label>
        <Button variant="ghost" size="icon-sm" onClick={()=>setWeek(shiftWeek(week,1))} aria-label="Следующая неделя"><ChevronRight className="h-4 w-4"/></Button>
      </div>
      <div className="flex justify-start lg:justify-end">{week!==currentWeek&&<Button variant="outline" size="sm" onClick={()=>setWeek(currentWeek)}>Текущая неделя</Button>}</div>
    </div>

    {checkins.loading || people.loading ? <Skeleton className="h-80"/> : mode === 'week' ? <WeeklyTable team={team} week={week} records={checkins.data} onSave={saveField}/> : <PersonWeeklyHistory team={team} personId={personId} onPersonChange={choosePerson} currentWeek={week} records={checkins.data} onSave={saveField}/>} 
    <WeeklyExportDialog open={exportOpen} onOpenChange={setExportOpen} records={checkins.data} people={team} selectedWeek={week}/>
  </Page>;
}

function WeeklyTable({ team, week, records, onSave }) {
  return <div className="surface overflow-x-auto"><div className="min-w-[1000px]">
    <div className="grid grid-cols-[minmax(190px,.8fr)_repeat(3,minmax(230px,1fr))] border-b bg-muted/30 text-[12px] font-semibold uppercase tracking-[.06em] text-muted-foreground"><div className="px-4 py-3">Сотрудник</div><div className="px-4 py-3">Что делал</div><div className="px-4 py-3">Что буду делать</div><div className="px-4 py-3">Что мешает</div></div>
    {team.length ? team.map((person) => { const record=records.find((item)=>item.personId===person.id&&item.weekStart===week)||null; return <div key={person.id} className="grid grid-cols-[minmax(190px,.8fr)_repeat(3,minmax(230px,1fr))] border-b last:border-0"><div className="flex items-start gap-2 p-4"><Avatar person={person} size="sm"/><div className="min-w-0"><div className="truncate text-xs font-medium">{person.name}</div><div className="mt-0.5 truncate text-[12px] text-muted-foreground">{person.role||'Сотрудник'}</div></div></div>{['did','willDo','blockers'].map((field)=><WeeklyCell key={field} personId={person.id} week={week} record={record} field={field} onSave={onSave}/>)}</div>; }) : <div className="p-8 text-center text-sm text-muted-foreground">В команде пока нет сотрудников.</div>}
  </div></div>;
}

function PersonWeeklyHistory({ team, personId, onPersonChange, currentWeek, records, onSave }) {
  const person = team.find((item)=>item.id===personId);
  const rows = records.filter((item)=>item.personId===personId).slice().sort((a,b)=>String(b.weekStart).localeCompare(String(a.weekStart)));
  if (person && !rows.some((item)=>item.weekStart===currentWeek)) rows.unshift({ id:'', personId, weekStart:currentWeek, did:'', willDo:'', blockers:'', __placeholder:true });
  return <div className="space-y-3">
    <Select value={personId || undefined} onValueChange={onPersonChange}><SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Выберите сотрудника"/></SelectTrigger><SelectContent>{team.map((item)=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
    <div className="surface overflow-x-auto"><div className="min-w-[1000px]">
      <div className="grid grid-cols-[170px_repeat(3,minmax(240px,1fr))] border-b bg-muted/30 text-[12px] font-semibold uppercase tracking-[.06em] text-muted-foreground"><div className="px-4 py-3">Период</div><div className="px-4 py-3">Что делал</div><div className="px-4 py-3">Что буду делать</div><div className="px-4 py-3">Что мешает</div></div>
      {rows.map((row)=><div key={row.id||row.weekStart} className="grid grid-cols-[170px_repeat(3,minmax(240px,1fr))] border-b last:border-0"><div className="p-4 text-xs"><div className="font-medium">{formatShortDate(row.weekStart)}</div><div className="mt-1 text-muted-foreground">— {formatDate(weekEnd(row.weekStart))}</div></div>{['did','willDo','blockers'].map((field)=><WeeklyCell key={field} personId={personId} week={row.weekStart} record={row.__placeholder?null:row} field={field} onSave={onSave}/>)}</div>)}
    </div></div>
  </div>;
}

function WeeklyCell({ personId, week, record, field, onSave }) {
  const [value,setValue]=React.useState(record?.[field]||'');
  const [state,setState]=React.useState('idle');
  const ref=React.useRef(null);
  React.useEffect(()=>setValue(record?.[field]||''),[record?.id,record?.[field],week,field]);
  const resize=()=>{const el=ref.current;if(!el)return;el.style.height='auto';el.style.height=`${el.scrollHeight}px`;};
  React.useLayoutEffect(resize,[value]);
  const save=async()=>{const before=record?.[field]||'';if(value.trim()===String(before).trim())return;setState('saving');try{await onSave({personId,weekStart:week,record,field,value});setState('saved');window.setTimeout(()=>setState('idle'),700);}catch{setState('error');}};
  return <div className={`cell-frame group relative min-h-[88px] border-l p-2 pb-6 transition-colors hover:bg-muted/20 focus-within:z-10 focus-within:bg-background ${state==='error'?'bg-destructive/5':''}`} onClick={(event)=>{if(event.target===event.currentTarget)ref.current?.focus();}}><textarea ref={ref} rows={1} value={value} onChange={(event)=>setValue(event.target.value)} onBlur={save} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.blur();}}} placeholder="—" aria-label={field==='did'?'Что делал':field==='willDo'?'Что буду делать':'Что мешает'} className="cell-input block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-xs leading-5 outline-none placeholder:text-muted-foreground/55"/>{state==='saving'&&<span className="absolute bottom-1.5 right-2 text-[12px] text-muted-foreground">сохраняю…</span>}{state==='saved'&&<span className="absolute bottom-1.5 right-2 text-[12px] text-emerald-600">сохранено</span>}</div>;
}

function WeeklyExportDialog({ open, onOpenChange, records, people, selectedWeek }) {
  const [from,setFrom]=React.useState(selectedWeek); const [to,setTo]=React.useState(weekEnd(selectedWeek)); const [person,setPerson]=React.useState('all'); const [format,setFormat]=React.useState('xlsx');
  React.useEffect(()=>{if(open){setFrom(selectedWeek);setTo(weekEnd(selectedWeek));}},[open,selectedWeek]);
  const exportRows=()=>{const rows=records.filter((item)=>{if(person!=='all'&&item.personId!==person)return false;const end=weekEnd(item.weekStart);return item.weekStart<=to&&end>=from;}).sort((a,b)=>String(a.weekStart).localeCompare(String(b.weekStart))).map((item)=>[people.find((p)=>p.id===item.personId)?.name||'Сотрудник',item.weekStart,weekEnd(item.weekStart),item.did||'',item.willDo||'',item.blockers||'']);if(!rows.length)return;downloadTable({headers:['Сотрудник','Неделя с','Неделя по','Что делал','Что буду делать','Что мешает'],rows,format,filename:`weekly_${from}_${to}`});onOpenChange(false);};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Экспорт Weekly</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>Период с</Label><Input className="mt-1.5" type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></div><div><Label>По</Label><Input className="mt-1.5" type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></div><div className="sm:col-span-2"><Label>Сотрудник</Label><Select value={person} onValueChange={setPerson}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все сотрудники</SelectItem>{people.map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="sm:col-span-2"><Label>Формат</Label><Select value={format} onValueChange={setFormat}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="xlsx">XLSX</SelectItem><SelectItem value="csv">CSV</SelectItem><SelectItem value="md">Markdown</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={exportRows} disabled={!from||!to||from>to}>Выгрузить</Button></DialogFooter></DialogContent></Dialog>;
}
