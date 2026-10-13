import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, CircleDot, ExternalLink, FlaskConical, History, Lightbulb, Link2, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Sparkles, Target, Trash2, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/page';
import { SectionHeader, Tabs } from '@/components/patterns';
import { DetailSidebar, DetailSidebarToggle, useDetailSidebarState } from '@/components/detail-sidebar';
import { StickyNotes } from '@/components/sticky-notes';
import { EditableComments } from '@/components/editable-comments';
import { EditableMarkdownDescription } from '@/components/editable-markdown-description';
import { MentionEditor, MentionText } from '@/components/mention-editor';
import { MarkdownText } from '@/components/markdown';
import { VersionHistoryDialog } from '@/components/version-history';
import { ProgressTree } from '@/components/progress-tree';
import { ViewModeToggle, useViewMode } from '@/components/view-mode-toggle';
import { CatalogToolbar } from '@/components/catalog';
import { EntityRow } from '@/components/entity-row';
import {
  AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch, Textarea,
} from '@/components/ui';
import { IdeaStatusIcon, LabStatusIcon, StatusBadge } from '@/components/status';
import { IDEA_STATUS_LABEL, LAB_STATUS_LABEL, LAB_TYPE_LABEL, LAB_VISIBILITY_LABEL } from '@/lib/domain';
import { jiraLabelFromUrl, normalizeJiraUrl, normalizeMaterialUrl, MaterialServiceIcon } from '@/lib/link-preview';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';
import { formatDate, titleOf } from '@/lib/utils';

const LAB_PROGRESS = { idea: 15, in_progress: 35, paused: 35, done: 100 };
const labProgress = (status) => LAB_PROGRESS[status] ?? 15;

export function LabsPage({ mode }) {
  const isIdea = mode === 'ideas';
  const navigate = useNavigate();
  const state = useResource('labs');
  const people = useResource('people');
  const projects = useResource('projects');
  const [query, setQuery] = usePersistentFilter(isIdea ? 'ideas' : 'workshop', 'query', '');
  const [status, setStatus] = usePersistentFilter(isIdea ? 'ideas' : 'workshop', 'status', 'all');
  const [type, setType] = usePersistentFilter(isIdea ? 'ideas' : 'workshop', 'type', 'all');
  const [author, setAuthor] = usePersistentFilter(isIdea ? 'ideas' : 'workshop', 'author', 'all');
  const [onlyUnassigned, setOnlyUnassigned] = usePersistentFilter(isIdea ? 'ideas' : 'workshop', 'onlyUnassigned', isIdea);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingIdea, setEditingIdea] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [viewMode, setViewMode] = useViewMode(isIdea ? 'ideas' : 'workshop', isIdea ? 'cards' : 'list');


  const team = people.data.filter((person) => person.type === 'team');
  const workshopProjectOptions = state.data.filter((item) => item.entityType !== 'idea');
  const labels = isIdea ? IDEA_STATUS_LABEL : LAB_STATUS_LABEL;
  const items = state.data
    .filter((item) => isIdea ? item.entityType === 'idea' : item.entityType !== 'idea')
    .filter((item) => status === 'all' || (item.status || 'idea') === status)
    .filter((item) => isIdea || type === 'all' || (item.projectType || 'pet') === type)
    .filter((item) => author === 'all' || item.authorId === author)
    .filter((item) => !isIdea || !onlyUnassigned || (!item.labProjectId && !item.projectId))
    .filter((item) => titleOf(item).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

  const person = (id)=>people.data.find((p)=>p.id===id);
  const confirmDeleteIdea = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await api.resource('labs').remove(deleteTarget.id); setDeleteTarget(null); await state.reload(); }
    finally { setDeleting(false); }
  };
  const title = isIdea ? 'Идеи' : 'Мастерская';
  const Icon = isIdea ? Lightbulb : FlaskConical;

  return <Page className={isIdea ? undefined : 'workshop-page'}>
    <PageHeader title={title} actions={<Button onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>{isIdea?'Добавить идею':'Создать проект'}</Button>}/>
    <CatalogToolbar query={query} onQueryChange={setQuery} placeholder={`Поиск: ${title.toLocaleLowerCase('ru')}`} viewMode={viewMode} onViewModeChange={setViewMode}>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="xl:min-w-[170px]" aria-label="Фильтр по статусу"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{isIdea?'Все идеи':'Все проекты'}</SelectItem>{Object.entries(labels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      {!isIdea && <Select value={type} onValueChange={setType}><SelectTrigger className="xl:min-w-[165px]" aria-label="Фильтр по типу"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все типы</SelectItem>{Object.entries(LAB_TYPE_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>}
      <Select value={author} onValueChange={setAuthor}><SelectTrigger className="xl:min-w-[190px]" aria-label="Фильтр по автору"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все сотрудники</SelectItem>{team.map((item)=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      {isIdea && <label className="flex shrink-0 items-center gap-2 px-1 text-sm text-muted-foreground"><Switch checked={onlyUnassigned} onCheckedChange={setOnlyUnassigned}/><span>Только идеи без проектов</span></label>}
    </CatalogToolbar>
    <div key={viewMode} className="view-mode-transition">{state.loading ? (viewMode === 'list' ? <div className="space-y-2"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-44"/><Skeleton className="h-44"/></div>) : items.length ? (viewMode === 'cards' ? <div className="entity-card-grid md:grid-cols-2">{items.map((item)=><LabCard key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} navigate={navigate} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)}/>)}</div> : <div className="entity-list">{items.map((item)=><LabListRow key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} onOpen={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)} onStatusChanged={state.reload}/>)}</div>) : <EmptyState icon={Icon} title={isIdea?'Идей не найдено':'Проектов не найдено'} description="Попробуйте изменить фильтры или поисковый запрос."/>}</div>
    {isIdea ? <>
      <IdeaCrudDialog open={createOpen} onOpenChange={setCreateOpen} item={null} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      <IdeaCrudDialog open={Boolean(editingIdea)} onOpenChange={(next)=>!next&&setEditingIdea(null)} item={editingIdea} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next)=>!next&&setDeleteTarget(null)} title={`Удалить идею «${deleteTarget ? titleOf(deleteTarget) : ''}»?`} onConfirm={confirmDeleteIdea} busy={deleting}/>
    </> : <CreateLabDialog open={createOpen} onOpenChange={setCreateOpen} people={people.data} projects={projects.data} onCreated={()=>state.reload()}/>}
  </Page>;
}

function LabCard({ item, isIdea, author, navigate, onEdit, onDelete }) {
  const Icon = isIdea ? Lightbulb : FlaskConical;
  const body = <>
    <div className="flex items-start justify-between gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-4 w-4"/></span>
      <div className="flex shrink-0 items-center gap-1">
        <StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/>
        {isIdea && <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать идею"><Pencil className="h-3.5 w-3.5"/></Button>}
        {isIdea && <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Удалить идею"><Trash2 className="h-3.5 w-3.5"/></Button>}
      </div>
    </div>
    <div className={isIdea?'':'mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4'}>
      <div>
        <h3 className="entity-card-title mt-4"><MentionText text={item.title}/></h3>
        <p className="entity-card-description truncate-2">{item.description ? <MentionText text={item.description}/> : 'Без описания'}</p>
        <div className="entity-card-meta flex flex-wrap items-center gap-2">
          <Avatar person={author} size="xs"/><span>{author?.name || 'Автор не указан'}</span>
          {!isIdea && <><span>·</span><span>{LAB_TYPE_LABEL[item.projectType || 'pet'] || 'Другое'}</span></>}
          {item.visibility === 'me' && <><span>·</span><span>Приватный</span></>}
        </div>
      </div>
      {!isIdea && <div className="lab-growth-tree-react self-center opacity-90"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}
    </div>
  </>;
  if (isIdea) return <div className="entity-card text-left">{body}</div>;
  return <button onClick={()=>navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} className="entity-card text-left">{body}</button>;
}

function LabListRow({ item, isIdea, author, onOpen, onEdit, onDelete, onStatusChanged }) {
  return <EntityRow
    className={isIdea ? undefined : 'workshop-list-row'}
    onOpen={isIdea ? undefined : onOpen}
    leading={isIdea ? <IdeaStatusIcon labId={item.id} status={item.status || 'idea'} onChanged={onStatusChanged}/> : <LabStatusIcon labId={item.id} status={item.status || 'idea'} onChanged={onStatusChanged}/>}
    title={<MentionText text={item.title}/>}
    meta={isIdea ? [author?.name || 'Автор не указан'] : [LAB_TYPE_LABEL[item.projectType || 'pet'] || 'Другое']}
    trailing={<div className="flex items-center gap-1">{author&&<Avatar person={author} size="xs"/>}{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать идею"><Pencil className="h-3.5 w-3.5"/></Button>}{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Удалить идею"><Trash2 className="h-3.5 w-3.5"/></Button>}</div>}
  />;
}

function CreateLabDialog({ open, onOpenChange, people, projects, onCreated }) {
  const { draft, field, saving, save } = useCrudDialogForm({
    resource: 'labs', open, item: null, onOpenChange, onSaved: onCreated,
    buildDraft: () => ({ title: '', description: '', author: 'none', visibility: 'team' }),
    validate: (d) => (!String(d.title || '').trim() ? 'Укажите название' : null),
    buildPayload: (d) => ({ entityType: 'project', title: d.title.trim(), description: d.description || '', authorId: d.author === 'none' ? null : d.author, status: 'idea', visibility: d.visibility || 'team' }),
  });
  const submit = (e) => { e.preventDefault(); save(); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Новый проект Мастерской</DialogTitle></DialogHeader><div className="mt-5 space-y-4"><div className="space-y-1.5"><Label>Название</Label><Input autoFocus value={draft.title||''} onChange={(e)=>field('title',e.target.value)} placeholder="Что вы хотите попробовать?"/></div><div className="space-y-1.5"><Label>Описание</Label><MentionEditor value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} placeholder="Контекст, гипотеза, ожидаемый результат…" ariaLabel="Описание"/></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Автор</Label><Select value={draft.author||'none'} onValueChange={(value)=>field('author',value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{people.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Видимость</Label><Select value={draft.visibility || 'team'} onValueChange={(value)=>field('visibility', value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(LAB_VISIBILITY_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></div><DialogFooter><Button variant="outline" type="button" onClick={()=>onOpenChange(false)}>Отмена</Button><Button disabled={saving||!String(draft.title||'').trim()}>Создать проект</Button></DialogFooter></form></DialogContent></Dialog>;
}

function IdeaCrudDialog({ open, onOpenChange, item, people, projects, workshopProjects, presetLabProjectId, onSaved }) {
  const isEdit = Boolean(item?.id);
  const { draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'labs', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({
      title: current?.title || '',
      description: current?.description || '',
      status: current?.status || 'idea',
      authorId: current?.authorId || 'none',
      visibility: current?.visibility || 'team',
      linkType: current?.projectId ? 'project' : (current?.labProjectId || (!current && presetLabProjectId)) ? 'lab' : 'none',
      labProjectId: current?.labProjectId || (!current && presetLabProjectId) || 'none',
      projectId: current?.projectId || 'none',
    }),
    validate: (d) => (!String(d.title || '').trim() ? 'Укажите название идеи.' : null),
    buildPayload: (d) => ({
      entityType: 'idea',
      title: d.title.trim(),
      description: d.description || '',
      ...(isEdit ? { status: d.status || 'idea' } : {}),
      authorId: d.authorId === 'none' ? null : d.authorId,
      visibility: d.visibility || 'team',
      labProjectId: d.linkType === 'lab' ? (d.labProjectId === 'none' ? null : d.labProjectId) : null,
      projectId: d.linkType === 'project' ? (d.projectId === 'none' ? null : d.projectId) : null,
    }),
    mapSaveError: (e) => e?.message || 'Не удалось сохранить идею.',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{isEdit ? 'Редактировать идею' : 'Новая идея'}</DialogTitle></DialogHeader><div className="mt-3 space-y-4">
    <div><Label>Название</Label><Input className="mt-1.5" autoFocus value={draft.title || ''} onChange={(e)=>field('title', e.target.value)} placeholder="Коротко сформулируйте мысль"/></div>
    <div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description || ''} onChange={(value)=>field('description', value)} people={people} projects={projects} placeholder="Контекст, гипотеза, ожидаемый результат…" ariaLabel="Описание идеи"/></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label>Автор</Label><Select value={draft.authorId || 'none'} onValueChange={(value)=>field('authorId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{people.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      {isEdit && <div><Label>Статус</Label><Select value={draft.status || 'idea'} onValueChange={(value)=>field('status', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(IDEA_STATUS_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label>Привязать к</Label><Select value={draft.linkType || 'none'} onValueChange={(value)=>field('linkType', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem><SelectItem value="lab">Проект Мастерской</SelectItem><SelectItem value="project">Рабочий проект</SelectItem></SelectContent></Select></div>
      {draft.linkType === 'lab' && <div><Label>Проект Мастерской</Label><Select value={draft.labProjectId || 'none'} onValueChange={(value)=>field('labProjectId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не выбран</SelectItem>{workshopProjects.map((p)=><SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>}
      {draft.linkType === 'project' && <div><Label>Рабочий проект</Label><Select value={draft.projectId || 'none'} onValueChange={(value)=>field('projectId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не выбран</SelectItem>{projects.map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div><Label>Видимость</Label><Select value={draft.visibility || 'team'} onValueChange={(value)=>field('visibility', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(LAB_VISIBILITY_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
  </div><DialogFooter className="justify-between"><div>{isEdit && <Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving || !String(draft.title || '').trim()}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить идею «${item ? titleOf(item) : ''}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}

export function WorkshopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lab = useEndpoint(`/api/labs/${encodeURIComponent(id)}`, [id]);
  const labsList = useResource('labs');
  const people = useResource('people');
  const projects = useResource('projects');
  const goals = useResource('goals');
  const issues = useResource('issues');
  const comments = useEndpoint(`/api/comments/lab/${encodeURIComponent(id)}`, [id]);
  const [saving, setSaving] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState('ideas');
  const [createIdeaOpen, setCreateIdeaOpen] = React.useState(false);
  const [editingIdea, setEditingIdea] = React.useState(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkTitle, setLinkTitle] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkError, setLinkError] = React.useState('');
  const [linkEditingUrl, setLinkEditingUrl] = React.useState(null);
  const [relationOpen, setRelationOpen] = React.useState(false);
  const [relationType, setRelationType] = React.useState('jira');
  const [jiraUrl, setJiraUrl] = React.useState('');
  const [goalKey, setGoalKey] = React.useState('none');
  const [issueId, setIssueId] = React.useState('none');
  const [relationError, setRelationError] = React.useState('');
  const [sidebarOpen, setSidebarOpen, sidebarHasNoPreference] = useDetailSidebarState('garden-workshop-detail-sidebar', false);
  const addStickyRef = React.useRef(null);

  const item = lab.data;
  const author = people.data.find((p) => p.id === item?.authorId);
  const linkedIdeas = labsList.data.filter((entry) => entry.entityType === 'idea' && entry.labProjectId === item?.id);
  const workshopProjectOptions = labsList.data.filter((entry) => entry.entityType !== 'idea');
  const links = Array.isArray(item?.links) ? item.links.filter((entry) => entry?.url) : [];
  const linkedGoalKeys = Array.isArray(item?.goalKeys) ? item.goalKeys : [];
  const linkedGoals = linkedGoalKeys.map((gid) => goals.data.find((goal) => goal.goalKey === gid)).filter(Boolean);
  const linkedIssueIds = Array.isArray(item?.issueIds) ? item.issueIds : [];
  const linkedIssues = linkedIssueIds.map((iid) => issues.data.find((issue) => issue.id === iid)).filter(Boolean);
  const jiraLinks = Array.isArray(item?.jiraLinks)
    ? item.jiraLinks.map((entry) => typeof entry === 'string' ? { url: entry, label: jiraLabelFromUrl(entry) } : entry).filter((entry) => entry?.url)
    : [];

  const patch = async (body) => { if (!item) return null; setSaving(true); try { const updated = await api.resource('labs').update(item.id, body); lab.setData(updated); return updated; } finally { setSaving(false); } };
  const addComment = async (e) => { e.preventDefault(); if (!comment.trim()) return; await api.post(`/api/comments/lab/${item.id}`, { text: comment.trim() }); setComment(''); comments.reload(); };
  const remove = async () => { if (!confirm('Удалить проект?')) return; await api.resource('labs').remove(item.id); navigate('/workshop'); };
  const toggleArchive = async () => patch({ archivedAt: item.archivedAt ? null : new Date().toISOString() });
  const mentionNavigate = (kind, mentionId) => navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`);

  const resetLinkDialog = () => { setLinkTitle(''); setLinkUrl(''); setLinkError(''); setLinkEditingUrl(null); };
  const openLinkDialog = () => { resetLinkDialog(); setLinkOpen(true); };
  const editLink = (entry) => { setLinkTitle(entry.title || ''); setLinkUrl(entry.url || ''); setLinkError(''); setLinkEditingUrl(entry.url); setLinkOpen(true); };
  const saveLink = async () => {
    const title = linkTitle.trim();
    const url = normalizeMaterialUrl(linkUrl);
    if (!title) { setLinkError('Укажите название ссылки.'); return; }
    if (!url) { setLinkError('Укажите корректную ссылку.'); return; }
    if (links.some((entry) => entry.url === url && entry.url !== linkEditingUrl)) { setLinkError('Эта ссылка уже добавлена.'); return; }
    const nextLinks = linkEditingUrl
      ? links.map((entry) => entry.url === linkEditingUrl ? { title, url } : entry)
      : [...links, { title, url }];
    await patch({ links: nextLinks });
    setLinkOpen(false);
    resetLinkDialog();
  };
  const removeLink = async (url) => patch({ links: links.filter((entry) => entry.url !== url) });

  const resetRelationDialog = () => { setRelationType('jira'); setJiraUrl(''); setGoalKey('none'); setIssueId('none'); setRelationError(''); };
  const openRelationDialog = () => { resetRelationDialog(); setRelationOpen(true); };
  const saveRelation = async () => {
    setRelationError('');
    if (relationType === 'jira') {
      const normalized = normalizeJiraUrl(jiraUrl);
      if (!normalized) { setRelationError('Укажите корректную ссылку.'); return; }
      if (jiraLinks.some((entry) => entry.url === normalized)) { setRelationError('Эта ссылка уже добавлена.'); return; }
      await patch({ jiraLinks: [...jiraLinks, { url: normalized, label: jiraLabelFromUrl(normalized) }] });
    } else if (relationType === 'goal') {
      if (goalKey === 'none') { setRelationError('Выберите цель.'); return; }
      if (linkedGoalKeys.includes(goalKey)) { setRelationError('Эта цель уже связана с проектом.'); return; }
      await patch({ goalKeys: [...linkedGoalKeys, goalKey] });
    } else {
      if (issueId === 'none') { setRelationError('Выберите проблему.'); return; }
      if (linkedIssueIds.includes(issueId)) { setRelationError('Эта проблема уже связана с проектом.'); return; }
      await patch({ issueIds: [...linkedIssueIds, issueId] });
    }
    setRelationOpen(false);
    resetRelationDialog();
  };
  const removeJiraLink = async (url) => patch({ jiraLinks: jiraLinks.filter((entry) => entry.url !== url) });
  const removeGoalLink = async (gid) => patch({ goalKeys: linkedGoalKeys.filter((entry) => entry !== gid) });
  const removeIssueLink = async (iid) => patch({ issueIds: linkedIssueIds.filter((entry) => entry !== iid) });

  const handleStickyCountChange = React.useCallback((count) => {
    if (sidebarHasNoPreference && count > 0) setSidebarOpen(true);
  }, [sidebarHasNoPreference]);

  if (lab.loading) return <Page narrow className="task-detail-page detail-page-shell"><div className="space-y-4"><Skeleton className="h-8 w-3/4"/><Skeleton className="h-5 w-1/2"/><Skeleton className="h-56 w-full"/></div></Page>;
  if (!item) return <Page narrow><EmptyState title="Проект не найден" action={<Button onClick={()=>navigate('/workshop')}>К Мастерской</Button>}/></Page>;

  return <Page narrow className={`task-detail-page detail-page-shell ${sidebarOpen ? 'has-detail-sidebar' : ''}`}>
    <div className="mb-7 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={()=>navigate('/workshop')}><ArrowLeft className="h-4 w-4"/>Мастерская</Button>
      <div className="detail-page-header-actions">
        {saving && <span className="text-xs text-muted-foreground" aria-live="polite">Сохраняю…</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggleArchive}>{item.archivedAt ? <ArchiveRestore className="h-4 w-4"/> : <Archive className="h-4 w-4"/>}{item.archivedAt ? 'Восстановить из архива' : 'Архивировать проект'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История версий</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem className="text-destructive" onSelect={remove}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DetailSidebarToggle open={sidebarOpen} onOpenChange={setSidebarOpen} title="Заметки на полях" showLabel="Показать панель стикеров" hideLabel="Скрыть панель стикеров"/>
      </div>
    </div>

    <MentionEditor value={item.title || ''} onChange={(title)=>lab.setData({...item,title})} onBlur={(title)=>patch({title:title.trim()})} people={people.data} projects={[]} singleLine editorClassName="things-task-detail-title task-title-mention-editor" ariaLabel="Название проекта"/>

    <div className="task-detail-workspace-grid">
      <div className="task-detail-main">
        <header className="things-task-detail-header task-detail-reference-header task-detail-unboxed-header">
          <div className="task-detail-reference-section task-detail-description-section">
            <SectionHeader title="Описание" compact/>
            <EditableMarkdownDescription value={item.description || ''} onChange={(value)=>lab.setData({...item,description:value})} onSave={(value)=>patch({description:value})} people={people.data} projects={projects.data} placeholder="Добавить описание…" className="things-task-detail-description task-detail-reference-description" editorClassName="things-task-detail-description task-detail-reference-description" onNavigate={(kind,id)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(id)}` : `/people/${encodeURIComponent(id)}`)} ariaLabel="Описание проекта"/>
          </div>
          <div className="task-detail-reference-section task-detail-description-section">
            <SectionHeader title="Практическая ценность" compact/>
            <MentionEditor value={item.practicalValue || ''} onChange={(value)=>lab.setData({...item,practicalValue:value})} onBlur={(value)=>patch({practicalValue:value})} people={people.data} projects={projects.data} placeholder="Какую пользу принесёт результат?" editorClassName="things-task-detail-description task-detail-reference-description" ariaLabel="Практическая ценность проекта"/>
          </div>
        </header>

        <div className="task-detail-layout py-7">
          
          <div className="task-detail-content-card">
            <Tabs
              className="task-context-tabs"
              ariaLabel="Разделы проекта"
              value={detailTab}
              onValueChange={setDetailTab}
              items={[
                {value:'ideas',label:'Идеи',count:linkedIdeas.length},
                {value:'links',label:'Ссылки',count:links.length},
                {value:'relations',label:'Связи',count:linkedGoals.length + linkedIssues.length + jiraLinks.length},
                {value:'discussion',label:'Обсуждение',count:comments.data?.length || 0},
              ]}
            />
            <div className="task-detail-tab-panel">
              {detailTab==='ideas' && <div className="task-detail-tab-content">
                <div className="task-tab-toolbar"><span className="task-tab-subtitle">Идеи проекта</span><Button variant="ghost" size="sm" onClick={()=>setCreateIdeaOpen(true)}><Plus className="h-4 w-4"/>Добавить идею</Button></div>
                {linkedIdeas.length ? <div className="task-relations-list">{linkedIdeas.map((idea)=><div key={idea.id} className="task-relation-row">
                  <div className="task-relation-main" role="button" tabIndex={0} onClick={()=>setEditingIdea(idea)} onKeyDown={(event)=>{ if (event.key==='Enter') setEditingIdea(idea); }}>
                    <span onClick={(event)=>event.stopPropagation()}><IdeaStatusIcon labId={idea.id} status={idea.status||'idea'} onChanged={labsList.reload}/></span>
                    <div className="min-w-0"><div className="task-relation-title"><MentionText text={idea.title}/></div></div>
                  </div>
                </div>)}</div> : <button type="button" onClick={()=>setCreateIdeaOpen(true)} className="task-relations-empty">Добавить первую идею</button>}
              </div>}
              {detailTab==='links' && <div className="task-detail-tab-content">
                <div className="task-tab-toolbar"><span className="task-tab-subtitle">Ссылки</span><Button variant="ghost" size="sm" onClick={openLinkDialog}><Plus className="h-4 w-4"/>Добавить ссылку</Button></div>
                {links.length ? <div className="task-relations-list">{links.map((entry)=><div key={entry.url} className="task-relation-row"><a href={entry.url} target="_blank" rel="noreferrer" className="task-relation-main"><MaterialServiceIcon url={entry.url}/><div className="min-w-0"><div className="task-relation-title">{entry.title || entry.url}</div></div><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></a><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Редактировать ссылку" title="Редактировать ссылку" onClick={()=>editLink(entry)}><Pencil className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon-sm" aria-label="Удалить ссылку" title="Удалить ссылку" onClick={()=>removeLink(entry.url)}><X className="h-4 w-4"/></Button></div></div>)}</div> : <button type="button" onClick={openLinkDialog} className="task-relations-empty">Добавить первую ссылку</button>}
              </div>}
              {detailTab==='relations' && <div className="task-detail-tab-content">
                <div className="task-tab-toolbar"><span className="task-tab-subtitle">Связанные элементы</span><Button variant="ghost" size="sm" onClick={openRelationDialog}><Plus className="h-4 w-4"/>Добавить связь</Button></div>
                {(linkedGoals.length || linkedIssues.length || jiraLinks.length) ? <div className="task-relations-list">
                  {linkedGoals.map((goal)=><div key={`goal:${goal.id}`} className="task-relation-row"><Link to={`/goals/${encodeURIComponent(goal.goalKey)}`} className="task-relation-main"><Target className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Цель</div><div className="task-relation-title">{goal.title || goal.name || goal.goalKey || goal.id}</div></div></Link><Button variant="ghost" size="icon-sm" aria-label="Удалить связь с целью" title="Удалить связь" onClick={()=>removeGoalLink(goal.goalKey)}><X className="h-4 w-4"/></Button></div>)}
                  {linkedIssues.map((issue)=><div key={`issue:${issue.id}`} className="task-relation-row"><Link to={`/issues/${encodeURIComponent(issue.issueKey || issue.id)}`} className="task-relation-main"><CircleDot className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Проблема</div><div className="task-relation-title">{issue.title || issue.issueKey || issue.id}</div></div></Link><Button variant="ghost" size="icon-sm" aria-label="Удалить связь с проблемой" title="Удалить связь" onClick={()=>removeIssueLink(issue.id)}><X className="h-4 w-4"/></Button></div>)}
                  {jiraLinks.map((entry)=><div key={`jira:${entry.url}`} className="task-relation-row"><a href={entry.url} target="_blank" rel="noreferrer" className="task-relation-main"><Link2 className="h-4 w-4"/><div className="min-w-0"><div className="task-relation-kind">Jira</div><div className="task-relation-title">{String(entry.label || jiraLabelFromUrl(entry.url)).replace(/^Jira\s*[·:\-]\s*/i, '')}</div></div></a><Button variant="ghost" size="icon-sm" aria-label="Удалить Jira-ссылку" title="Удалить связь" onClick={()=>removeJiraLink(entry.url)}><X className="h-4 w-4"/></Button></div>)}
                </div> : <button type="button" onClick={openRelationDialog} className="task-relations-empty">Добавить первую связь</button>}
              </div>}
              {detailTab==='discussion' && <div className="task-detail-tab-content task-discussion-tab">
                <div className="space-y-4">
                  {comments.data?.length ? <EditableComments comments={comments.data} onChanged={comments.reload} people={people.data} projects={projects.data} onNavigateMention={mentionNavigate}/> : <div className="task-tab-empty-copy">Пока нет комментариев.</div>}
                  <form onSubmit={addComment} className="task-comments-form"><MentionEditor className="min-w-0 flex-1" editorClassName="min-h-[72px] task-comments-editor" value={comment} onChange={setComment} people={people.data} projects={projects.data} placeholder="Написать комментарий..." ariaLabel="Комментарий"/><div className="task-comments-actions"><Button type="submit" variant="secondary" size="sm" disabled={!comment.trim()}>Отправить</Button></div></form>
                </div>
              </div>}
            </div>
          </div>
        </div>
      </div>
      <aside className="task-properties-column" aria-label="Свойства проекта">
        <SectionHeader title="Свойства" compact className="task-properties-title"/>
        <div className="task-properties-list">
          <div className="task-property-row"><span className="task-property-label">Статус</span><div className="task-attribute-item"><LabStatusIcon labId={item.id} status={item.status || 'idea'} onChanged={(updated)=>lab.setData(updated)} showLabel/></div></div>
          <div className="task-property-row"><span className="task-property-label">Тип</span><div className="task-attribute-item"><Select value={item.projectType || 'pet'} onValueChange={(value)=>patch({projectType:value})}><SelectTrigger className="things-task-meta-select is-quiet task-meta-compact"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(LAB_TYPE_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Автор</span><div className="task-attribute-item"><Select value={item.authorId || 'none'} onValueChange={(value)=>patch({authorId:value==='none'?null:value})}><SelectTrigger className="things-task-meta-select is-quiet"><span>{author?.name || 'Не указан'}</span><span className="sr-only"><SelectValue/></span></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{people.data.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="task-property-row"><span className="task-property-label">Видимость</span><div className="task-attribute-item"><Select value={item.visibility || 'team'} onValueChange={(value)=>patch({visibility:value})}><SelectTrigger className="things-task-meta-select is-quiet task-meta-compact"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(LAB_VISIBILITY_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
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
      <StickyNotes entityType="lab" entityId={item.id} notesPrefix={item.title || ''} addButtonRef={addStickyRef} onCountChange={handleStickyCountChange}/>
    </DetailSidebar>

    <VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="labs" entityId={item.id} onRestored={(restored)=>lab.setData(restored)}/>

    <IdeaCrudDialog open={createIdeaOpen} onOpenChange={setCreateIdeaOpen} item={null} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} presetLabProjectId={item.id} onSaved={()=>labsList.reload()}/>
    <IdeaCrudDialog open={Boolean(editingIdea)} onOpenChange={(next)=>!next&&setEditingIdea(null)} item={editingIdea} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>labsList.reload()}/>

    <Dialog open={linkOpen} onOpenChange={(open)=>{ setLinkOpen(open); if (!open) resetLinkDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{linkEditingUrl ? 'Редактировать ссылку' : 'Добавить ссылку'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="lab-link-title">Название</Label><Input id="lab-link-title" value={linkTitle} onChange={(e)=>{setLinkTitle(e.target.value);setLinkError('');}} placeholder="Например, Макеты в Figma" autoFocus/></div>
          <div className="space-y-2"><Label htmlFor="lab-link-url">Ссылка</Label><Input id="lab-link-url" value={linkUrl} onChange={(e)=>{setLinkUrl(e.target.value);setLinkError('');}} placeholder="https://…" inputMode="url"/></div>
          {linkError && <p className="text-sm text-destructive">{linkError}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={()=>setLinkOpen(false)}>Отмена</Button><Button onClick={saveLink} disabled={!linkTitle.trim() || !linkUrl.trim()}>{linkEditingUrl ? 'Сохранить' : 'Добавить'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={relationOpen} onOpenChange={(open)=>{ setRelationOpen(open); if (!open) resetRelationDialog(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Добавить связь</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Тип связи</Label><Select value={relationType} onValueChange={(value)=>{ setRelationType(value); setRelationError(''); }}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="jira">Jira-тикет</SelectItem><SelectItem value="goal">Цель</SelectItem><SelectItem value="issue">Проблема</SelectItem></SelectContent></Select></div>
          {relationType === 'jira' ? <div className="space-y-2"><Label htmlFor="lab-jira-link">Ссылка на Jira-тикет</Label><Input id="lab-jira-link" value={jiraUrl} onChange={(e)=>setJiraUrl(e.target.value)} placeholder="https://company.atlassian.net/browse/ABC-123" inputMode="url" autoFocus/></div> : relationType === 'goal' ? <div className="space-y-2"><Label>Цель</Label><Select value={goalKey} onValueChange={setGoalKey}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите цель"/></SelectTrigger><SelectContent><SelectItem value="none">Выберите цель…</SelectItem>{goals.data.filter((goal)=>goal.goalKey && !linkedGoalKeys.includes(goal.goalKey)).map((goal)=><SelectItem key={goal.goalKey} value={goal.goalKey}>{goal.title || goal.name || goal.goalKey}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>Проблема</Label><Select value={issueId} onValueChange={setIssueId}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите проблему"/></SelectTrigger><SelectContent><SelectItem value="none">Выберите проблему…</SelectItem>{issues.data.filter((issue)=>!linkedIssueIds.includes(issue.id)).map((issue)=><SelectItem key={issue.id} value={issue.id}>{issue.title || issue.issueKey || issue.id}</SelectItem>)}</SelectContent></Select></div>}
          {relationError && <p className="text-sm text-destructive">{relationError}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={()=>setRelationOpen(false)}>Отмена</Button><Button onClick={saveRelation}>Добавить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Page>;
}

export function JournalPage() {
  const state=useResource('journal'); const people=useResource('people'); const projects=useResource('projects'); const [text,setText]=React.useState(''); const [busy,setBusy]=React.useState(false);
  const add=async(e)=>{e.preventDefault();if(!text.trim())return;setBusy(true);try{await api.resource('journal').create({text:text.trim(),createdAt:new Date().toISOString()});setText('');state.reload();}finally{setBusy(false)}};
  const entries=[...state.data].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return <Page narrow><PageHeader title="Журнал"/><form onSubmit={add} className="surface mb-7 p-3"><MentionEditor value={text} onChange={setText} people={people.data} projects={projects.data} placeholder="Что важно сохранить? Можно упомянуть человека или проект…" editorClassName="min-h-[100px] border-0 bg-transparent shadow-none focus-visible:ring-0"/><div className="flex justify-end border-t pt-3"><Button size="sm" disabled={!text.trim()||busy}>Записать</Button></div></form>{entries.length?<div className="grouped-section-card journal-grouped-list">{entries.map((entry)=><article key={entry.id} className="journal-grouped-row"><MarkdownText className="text-sm leading-6" text={entry.text}/><div className="mt-2 text-[12px] text-muted-foreground">{entry.createdAt?formatDate(entry.createdAt,{year:'numeric'}):''}</div></article>)}</div>:null}</Page>;
}
