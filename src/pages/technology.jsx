import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Download, MoreHorizontal,
  Plus, Trash2, Users, Video,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/page';
import { CompactSearchControl } from '@/components/view-mode-toggle';
import {
  AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, EmptyState, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton, Switch, Tooltip,
} from '@/components/ui';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { PeopleField } from '@/components/people-field';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { downloadTable } from '@/lib/tabular-export';

const MEETING_TYPES = [
  ['1:1', '1:1'], ['pr', 'PR'], ['club', 'Технологизация'], ['retro', 'Ретро'], ['project', 'Проект'], ['other', 'Другое'],
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();
const quarterOf = (dateKey) => {
  const month = Number(String(dateKey || '').slice(5, 7));
  return month >= 1 && month <= 12 ? Math.floor((month - 1) / 3) + 1 : null;
};

function filterEvents(items, year, quarter) {
  return [...(items || [])]
    .filter((item) => {
      if (!item?.plannedDate || Number(String(item.plannedDate).slice(0, 4)) !== Number(year)) return false;
      return quarter === 'all' || quarterOf(item.plannedDate) === Number(quarter);
    })
    .sort((a, b) => String(a.plannedDate || '').localeCompare(String(b.plannedDate || '')) || String(a.topic || '').localeCompare(String(b.topic || ''), 'ru'));
}

function meetingForEvent(item, meetings) {
  if (!item) return null;
  const topic = String(item.topic || '').trim().toLocaleLowerCase('ru');
  return (meetings || []).find((meeting) => {
    if (meeting?.sourceTechnologyEventId && String(meeting.sourceTechnologyEventId) === String(item.id)) return true;
    if (meeting?.type !== 'club') return false;
    return Boolean(topic
      && String(meeting.date || '').slice(0, 10) === String(item.plannedDate || '').slice(0, 10)
      && String(meeting.title || '').trim().toLocaleLowerCase('ru') === topic);
  }) || null;
}

function peopleNames(ids, people) {
  return (ids || []).map((id) => people.find((person) => person.id === id)?.name).filter(Boolean);
}

function Notice({ message }) {
  if (!message) return null;
  return <div role="status" className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{message}</div>;
}

export function TechnologyPage({ user }) {
  const navigate = useNavigate();
  const events = useResource('technologyEvents');
  const meetings = useResource('meetings');
  const people = useResource('people');
  const projects = useResource('projects');
  const [year, setYear] = usePersistentFilter('technology', 'year', currentYear());
  const [quarter, setQuarter] = usePersistentFilter('technology', 'quarter', 'all');
  const [completion, setCompletion] = usePersistentFilter('technology', 'completion', 'all');
  const [query, setQuery] = usePersistentFilter('technology', 'query', '');
  const [editing, setEditing] = React.useState(null);
  const [peopleFor, setPeopleFor] = React.useState(null);
  const [meetingFor, setMeetingFor] = React.useState(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [busyId, setBusyId] = React.useState(null);
  const [confirmTarget, setConfirmTarget] = React.useState(null);
  const labsAccess = user?.access?.labs || 'all_read';
  const meetingsAccess = user?.access?.meetings || 'all_read';
  const canManageLevel = (level) => ['own_manage', 'all_own_manage', 'all_manage'].includes(level);
  const canCreateEvent = canManageLevel(labsAccess);
  const canEditEvent = (item) => labsAccess === 'all_manage' || (canManageLevel(labsAccess) && item?.createdByUserId === user?.id);
  const canCreateMeeting = canManageLevel(meetingsAccess);

  const filtered = React.useMemo(() => filterEvents(events.data, year, quarter).filter((item) => {
    if (completion === 'planned' && item.completed) return false;
    if (completion === 'completed' && !item.completed) return false;
    const lower = query.trim().toLocaleLowerCase('ru');
    if (lower && !String(item.topic || '').toLocaleLowerCase('ru').includes(lower)) return false;
    return true;
  }), [events.data, year, quarter, completion, query]);
  const loading = events.loading || meetings.loading || people.loading;

  const flash = React.useCallback((text) => {
    setNotice(text);
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const patch = async (item, body) => {
    setBusyId(item.id);
    try {
      const saved = await api.resource('technologyEvents').update(item.id, body);
      events.setData((current) => current.map((entry) => entry.id === item.id ? saved : entry));
      return saved;
    } catch (error) {
      flash(error?.status === 403 ? 'Недостаточно прав для изменения мероприятия' : 'Не удалось сохранить изменения');
      throw error;
    } finally { setBusyId(null); }
  };

  const remove = (item) => setConfirmTarget(item);

  const scheduledMeeting = (item) => meetingForEvent(item, meetings.data);

  return <Page className="technology-page">
    <PageHeader
      title="План мероприятий"
      actions={canCreateEvent ? <Button onClick={() => setEditing({ plannedDate: todayKey(), topic: '', hours: 1, personIds: [], completed: false })}><Plus className="h-4 w-4"/>Добавить мероприятие</Button> : null}
    />

    <Notice message={notice}/>

    <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div className="flex items-center gap-2">
        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="w-[150px]" aria-label="Период"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Q1 {year}</SelectItem><SelectItem value="2">Q2 {year}</SelectItem>
            <SelectItem value="3">Q3 {year}</SelectItem><SelectItem value="4">Q4 {year}</SelectItem>
            <SelectItem value="all">Весь год</SelectItem>
          </SelectContent>
        </Select>
        {year !== currentYear() && <Button variant="outline" size="sm" onClick={() => setYear(currentYear())}>Текущий год</Button>}
      </div>

      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Предыдущий год" onClick={() => setYear((value) => value - 1)}><ChevronLeft className="h-4 w-4"/></Button>
        <div className="min-w-20 text-center text-sm font-semibold tabular-nums">{year}</div>
        <Button variant="ghost" size="icon-sm" aria-label="Следующий год" onClick={() => setYear((value) => value + 1)}><ChevronRight className="h-4 w-4"/></Button>
      </div>

      <div className="flex justify-start md:justify-end">
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><Download className="h-4 w-4"/>Экспорт</Button>
      </div>
    </div>

    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Select value={completion} onValueChange={setCompletion}>
        <SelectTrigger className="sm:w-[205px]" aria-label="Статус мероприятия"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="all">Все мероприятия</SelectItem><SelectItem value="planned">Запланировано</SelectItem><SelectItem value="completed">Проведено</SelectItem></SelectContent>
      </Select>
      <CompactSearchControl value={query} onChange={setQuery} placeholder="Поиск по теме" className="self-end sm:self-auto technology-search-control"/>
    </div>

    {loading ? <Skeleton className="h-72"/> : filtered.length ? <div className="surface overflow-x-auto">
      <table className="w-full min-w-[1000px] table-fixed text-left">
        <colgroup><col className="w-[190px]"/><col/><col className="w-[140px]"/><col className="w-[180px]"/><col className="w-[140px]"/><col className="w-[56px]"/></colgroup>
        <thead className="border-b bg-muted/30 text-[12px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
          <tr><th className="px-3 py-3">Плановая дата</th><th className="px-3 py-3">Тема</th><th className="px-3 py-3 text-center">Тайминг, ч</th><th className="px-3 py-3 text-center">Драйвер / гость</th><th className="px-3 py-3 text-center">Проведено</th><th className="px-3 py-3"/></tr>
        </thead>
        <tbody className="divide-y">
          {filtered.map((item) => <TechnologyRow
            key={item.id} item={item} people={people.data} meeting={scheduledMeeting(item)} busy={busyId === item.id}
            canEdit={canEditEvent(item)} canCreateMeeting={canCreateMeeting}
            onPatch={patch} onPeople={() => setPeopleFor(item)} onMeeting={() => setMeetingFor(item)}
            onOpenMeeting={(meeting) => navigate(`/meetings/${encodeURIComponent(meeting.meetingKey || meeting.id)}`)} onDelete={() => remove(item)}
          />)}
        </tbody>
      </table>
    </div> : <EmptyState icon={CalendarDays} title="На этот период мероприятий нет" description="Добавьте первое мероприятие или переключите год и квартал." action={canCreateEvent ? <Button onClick={() => setEditing({ plannedDate: todayKey(), topic: '', hours: 1, personIds: [], completed: false })}><Plus className="h-4 w-4"/>Добавить мероприятие</Button> : null}/>} 

    <EventDialog open={Boolean(editing)} item={editing} people={people.data} onOpenChange={(open) => !open && setEditing(null)} onSaved={(saved, isNew) => {
      events.setData((current) => isNew ? [...current, saved] : current.map((entry) => entry.id === saved.id ? saved : entry));
      setEditing(null); flash(isNew ? 'Мероприятие добавлено' : 'Мероприятие сохранено');
    }}/>
    <PeopleDialog open={Boolean(peopleFor)} item={peopleFor} people={people.data} onOpenChange={(open) => !open && setPeopleFor(null)} onSave={async (ids) => {
      if (!peopleFor) return; await patch(peopleFor, { personIds: ids }); setPeopleFor(null); flash('Участники обновлены');
    }}/>
    <MeetingDialog open={Boolean(meetingFor)} item={meetingFor} people={people.data} projects={projects.data} onOpenChange={(open) => !open && setMeetingFor(null)} onSaved={(saved) => {
      meetings.setData((current) => [...current, saved]); setMeetingFor(null); flash('Встреча создана'); navigate(`/meetings/${encodeURIComponent(saved.meetingKey || saved.id)}`);
    }}/>
    <ExportDialog open={exportOpen} onOpenChange={setExportOpen} events={events.data} people={people.data} initialYear={year} initialQuarter={quarter} onNotice={flash}/>
    <AlertDialog
      open={Boolean(confirmTarget)}
      onOpenChange={(open) => !open && setConfirmTarget(null)}
      title={`Удалить мероприятие «${confirmTarget?.topic || 'Без темы'}»?`}
      busy={busyId === confirmTarget?.id}
      onConfirm={async () => {
        const item = confirmTarget;
        setBusyId(item.id);
        try {
          await api.resource('technologyEvents').remove(item.id);
          events.setData((current) => current.filter((entry) => entry.id !== item.id));
          flash('Мероприятие удалено');
        } catch (error) {
          flash(error?.status === 403 ? 'Недостаточно прав для удаления мероприятия' : 'Не удалось удалить мероприятие');
        } finally { setBusyId(null); setConfirmTarget(null); }
      }}
    />
  </Page>;
}

function TechnologyRow({ item, people, meeting, busy, canEdit, canCreateMeeting, onPatch, onPeople, onMeeting, onOpenMeeting, onDelete }) {
  const [draft, setDraft] = React.useState({ plannedDate: item.plannedDate || '', topic: item.topic || '', hours: String(item.hours || 1) });
  React.useEffect(() => setDraft({ plannedDate: item.plannedDate || '', topic: item.topic || '', hours: String(item.hours || 1) }), [item.id, item.plannedDate, item.topic, item.hours]);
  const save = async (key) => {
    const raw = draft[key];
    let value = key === 'hours' ? Number(raw) : String(raw || '').trim();
    if (key === 'plannedDate' && !value) return setDraft((d) => ({ ...d, plannedDate: item.plannedDate || '' }));
    if (key === 'topic' && !value) return setDraft((d) => ({ ...d, topic: item.topic || '' }));
    if (key === 'hours' && (!Number.isInteger(value) || value <= 0)) return setDraft((d) => ({ ...d, hours: String(item.hours || 1) }));
    if (String(item[key] ?? '') === String(value)) return;
    try { await onPatch(item, { [key]: value }); } catch { setDraft((d) => ({ ...d, [key]: String(item[key] ?? '') })); }
  };
  const selectedPeople = (item.personIds || []).map((id) => people.find((person) => person.id === id)).filter(Boolean);
  return <tr className={item.completed ? 'bg-muted/20 text-muted-foreground' : ''}>
    <td className="cell-frame p-2"><input type="date" value={draft.plannedDate} disabled={busy || !canEdit} onChange={(e) => setDraft((d) => ({ ...d, plannedDate: e.target.value }))} onBlur={() => save('plannedDate')} className="cell-input technology-inline-input technology-date-input flex h-8 w-auto rounded-[12px] bg-transparent px-2 py-2 text-[16px] shadow-none disabled:cursor-not-allowed disabled:opacity-50"/></td>
    <td className="cell-frame p-2"><Input value={draft.topic} disabled={busy || !canEdit} onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))} onBlur={() => save('topic')} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="cell-input technology-inline-input h-8 bg-transparent px-2 font-normal shadow-none"/></td>
    <td className="cell-frame p-2"><Input type="number" min="1" step="1" value={draft.hours} disabled={busy || !canEdit} onChange={(e) => setDraft((d) => ({ ...d, hours: e.target.value }))} onBlur={() => save('hours')} className="cell-input technology-inline-input h-8 bg-transparent px-2 text-center shadow-none"/></td>
    <td className="p-2"><button type="button" disabled={!canEdit} onClick={onPeople} className="ui-focus-ring flex min-h-8 w-full items-center justify-center rounded-md px-2 text-center hover:bg-muted/50">
      {selectedPeople.length ? <div className="flex -space-x-1.5">{selectedPeople.slice(0, 4).map((person) => <Tooltip key={person.id} content={person.name}><span className="inline-flex rounded-full"><Avatar person={person} size="xs" className="ring-2 ring-card"/></span></Tooltip>)}{selectedPeople.length > 4 && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground ring-2 ring-card">+{selectedPeople.length - 4}</span>}</div> : <span className="text-xs text-muted-foreground">Добавить…</span>}
    </button></td>
    <td className="p-2 text-center"><div className="inline-flex items-center gap-2"><Switch checked={Boolean(item.completed)} disabled={busy || !canEdit} onCheckedChange={(checked) => onPatch(item, { completed: Boolean(checked) })}/></div></td>
    <td className="p-2 text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      {meeting ? <DropdownMenuItem onSelect={() => onOpenMeeting(meeting)}><Video className="h-4 w-4"/>Открыть встречу</DropdownMenuItem> : canCreateMeeting ? <DropdownMenuItem onSelect={onMeeting}>Запланировать встречу</DropdownMenuItem> : null}
      {canEdit && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu></td>
  </tr>;
}

function EventDialog({ open, item, people, onOpenChange, onSaved }) {
  const isNew = !item?.id;
  const { draft, field, saving, error, save } = useCrudDialogForm({
    resource: 'technologyEvents', open, item, onOpenChange,
    onSaved: (saved) => onSaved(saved, isNew),
    buildDraft: (current) => ({ plannedDate: current?.plannedDate || todayKey(), topic: current?.topic || '', hours: String(current?.hours || 1), personIds: current?.personIds || [] }),
    validate: (d) => {
      const hours = Number(d.hours);
      if (!d.plannedDate) return 'Укажите плановую дату';
      if (!d.topic.trim()) return 'Укажите тему мероприятия';
      if (!Number.isInteger(hours) || hours <= 0) return 'Тайминг должен быть целым числом часов больше нуля';
      return null;
    },
    buildPayload: (d) => ({ plannedDate: d.plannedDate, topic: d.topic.trim(), hours: Number(d.hours), personIds: d.personIds, ...(isNew ? { completed: false } : {}) }),
    mapSaveError: (e) => e?.status === 403 ? 'Недостаточно прав для сохранения мероприятия' : 'Не удалось сохранить мероприятие',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{isNew ? 'Добавить мероприятие' : 'Редактировать мероприятие'}</DialogTitle></DialogHeader>
    <div className="grid gap-4 py-1"><div className="grid gap-4 sm:grid-cols-[1fr_160px]"><div className="space-y-1.5"><Label htmlFor="tech-date">Плановая дата проведения</Label><Input id="tech-date" type="date" value={draft.plannedDate||''} onChange={(e) => field('plannedDate', e.target.value)}/></div><div className="space-y-1.5"><Label htmlFor="tech-hours">Тайминг, часов</Label><Input id="tech-hours" type="number" min="1" step="1" value={draft.hours||''} onChange={(e) => field('hours', e.target.value)}/></div></div><div className="space-y-1.5"><Label htmlFor="tech-topic">Тема</Label><Input id="tech-topic" autoFocus value={draft.topic||''} onChange={(e) => field('topic', e.target.value)} placeholder="Тема мероприятия"/></div><PeopleField label="Драйвер / гость" people={people} value={draft.personIds||[]} onChange={(ids) => field('personIds', ids)}/>{error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : isNew ? 'Добавить' : 'Сохранить'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function PeopleDialog({ open, item, people, onOpenChange, onSave }) {
  const [selected, setSelected] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) setSelected(item?.personIds || []); }, [open, item]);
  const save = async () => { setSaving(true); try { await onSave(selected); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Драйверы и гости</DialogTitle></DialogHeader><PeopleField label="Драйвер / гость" people={people} value={selected} onChange={setSelected}/><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : 'Готово'}</Button></DialogFooter></DialogContent></Dialog>;
}

function MeetingDialog({ open, item, people, projects, onOpenChange, onSaved }) {
  const { draft, field, saving, error, save } = useCrudDialogForm({
    resource: 'meetings', open, item: null, onOpenChange, onSaved,
    buildDraft: () => ({ type: 'club', date: item?.plannedDate || todayKey(), title: item?.topic || 'Мероприятие', projectId: '', participantIds: item?.personIds || [] }),
    validate: (d) => (!d.date ? 'Укажите дату встречи' : null),
    buildPayload: (d) => ({
      type: d.type, date: d.date, title: d.title.trim() || 'Встреча', projectId: d.projectId || null,
      participantIds: d.participantIds, notes: '', actionItems: [], prepNotes: '', documentLinks: [], sourceTechnologyEventId: item?.id,
    }),
    mapSaveError: (e) => e?.status === 403 ? 'Недостаточно прав для создания встречи' : 'Не удалось создать встречу',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Запланировать встречу в Garden</DialogTitle></DialogHeader>
    <div className="grid gap-4 py-1"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Тип</Label><Select value={draft.type||'club'} onValueChange={(type) => field('type', type)}><SelectTrigger className="w-full h-11 rounded-[12px] px-4 text-[16px]"><SelectValue/></SelectTrigger><SelectContent>{MEETING_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="meeting-date">Дата</Label><Input id="meeting-date" type="date" value={draft.date||''} onChange={(e) => field('date', e.target.value)}/></div></div><div className="space-y-1.5"><Label htmlFor="meeting-title">Название</Label><Input id="meeting-title" value={draft.title||''} onChange={(e) => field('title', e.target.value)}/></div>{!['1:1','pr'].includes(draft.type) && <div className="space-y-1.5"><Label>Проект (необязательно)</Label><Select value={draft.projectId || '__none'} onValueChange={(projectId) => field('projectId', projectId === '__none' ? '' : projectId)}><SelectTrigger className="w-full h-11 rounded-[12px] px-4 text-[16px]"><SelectValue placeholder="—"/></SelectTrigger><SelectContent><SelectItem value="__none">—</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>}<PeopleField label="Участники" people={people} value={draft.participantIds||[]} onChange={(ids) => field('participantIds', ids)}/>{error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Создаю…' : 'Создать встречу'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ExportDialog({ open, onOpenChange, events, people, initialYear, initialQuarter, onNotice }) {
  const [year, setYear] = React.useState(String(initialYear));
  const [quarter, setQuarter] = React.useState(initialQuarter);
  const [format, setFormat] = React.useState('xlsx');
  React.useEffect(() => { if (open) { setYear(String(initialYear)); setQuarter(initialQuarter); } }, [open, initialYear, initialQuarter]);
  const download = () => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) return onNotice('Укажите корректный год');
    const rows = filterEvents(events, numericYear, quarter).map((item) => [
      item.plannedDate || '', item.topic || '', Number(item.hours || 0), peopleNames(item.personIds, people).join(', '), item.completed ? 'Да' : 'Нет',
    ]);
    if (!rows.length) return onNotice('За выбранный период нет мероприятий');
    const suffix = quarter === 'all' ? `${numericYear}` : `${numericYear}_q${quarter}`;
    downloadTable({ headers: ['Плановая дата проведения', 'Тема', 'Тайминг, часов', 'Драйвер / гость', 'Проведено'], rows, format, filename: `technology_${suffix}` });
    onOpenChange(false); onNotice('Экспорт готов');
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Экспорт плана мероприятий</DialogTitle></DialogHeader><div className="grid gap-4 py-1"><div className="space-y-1.5"><Label htmlFor="export-year">Год</Label><Input id="export-year" type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)}/></div><div className="space-y-1.5"><Label>Квартал</Label><Select value={quarter} onValueChange={setQuarter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">Q1 {year}</SelectItem><SelectItem value="2">Q2 {year}</SelectItem><SelectItem value="3">Q3 {year}</SelectItem><SelectItem value="4">Q4 {year}</SelectItem><SelectItem value="all">Весь год</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Формат</Label><Select value={format} onValueChange={setFormat}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="xlsx">XLSX</SelectItem><SelectItem value="csv">CSV</SelectItem><SelectItem value="md">MD</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={download}><Download className="h-4 w-4"/>Выгрузить</Button></DialogFooter></DialogContent></Dialog>;
}
