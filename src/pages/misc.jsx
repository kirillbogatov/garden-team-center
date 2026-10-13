import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, BookOpen, Check, ExternalLink, Monitor, Moon, Pencil, Plus, Search, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { Page, PageHeader, Section } from '@/components/page';
import { AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Skeleton, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { TaskStatusIcon } from '@/components/status';
import { MentionEditor, MentionText } from '@/components/mention-editor';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';
import { cn, formatDate, titleOf } from '@/lib/utils';
import { searchResultEntity, searchResultRoute } from '@/lib/search-result';
import { ACCENTS, DEFAULT_ACCENT, THEME_CHOICES, applyAppearance, normalizeTheme } from '@/lib/appearance';
import { DEFAULT_TIMEZONE, TIMEZONES } from '@/lib/timezones';

const groupLabels = {
  tasks:'Задачи', meetings:'Встречи', projects:'Проекты', team:'Команда', stakeholders:'Стейкхолдеры', issues:'Проблемы', goals:'Цели', agreements:'Договорённости', labs:'Мастерская и идеи', journal:'Журнал', processes:'Процессы', tools:'Инструменты', checkins:'Weekly', documents:'Документы',
};


export function SearchPage() {
  const navigate=useNavigate(); const [params,setParams]=useSearchParams(); const query=params.get('q') || ''; const [result,setResult]=React.useState(null); const [busy,setBusy]=React.useState(false);
  const setQuery=(value)=>{const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next,{replace:true});};
  React.useEffect(()=>{ if(!query.trim()){setResult(null);return;} const t=setTimeout(async()=>{setBusy(true);try{setResult(await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`));}finally{setBusy(false)}},220);return()=>clearTimeout(t)},[query]);
  const groups=React.useMemo(()=>{
    const raw=Object.entries(result?.groups||{}).filter(([,items])=>Array.isArray(items)&&items.length);
    const out=[];
    raw.forEach(([group,items])=>{
      if(group!=='people'){out.push([group,items]);return;}
      const team=items.filter((item)=>searchResultEntity(item)?.type==='team');
      const stakeholders=items.filter((item)=>searchResultEntity(item)?.type==='stakeholder');
      if(team.length)out.push(['team',team]);
      if(stakeholders.length)out.push(['stakeholders',stakeholders]);
    });
    return out;
  },[result]);
  const openItem=(group,item)=>{ const route=searchResultRoute(group,item); if(route) navigate(route); };
  return <Page narrow><PageHeader title="Поиск"/><div className="relative"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"/><Input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Что хотите найти?" className="h-12 rounded-xl pl-12 pr-4 text-base shadow-quiet"/></div><div className="mt-7">{busy?<div className="space-y-3"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div>:query&&!groups.length?<EmptyState icon={Search} title="Ничего не нашлось" description="Попробуйте более короткую формулировку или название сущности."/>:groups.map(([group,items])=><Section key={group} title={groupLabels[group]||group} className="mb-7"><div className="surface divide-y">{items.slice(0,8).map((item)=><div key={item.id} role="link" tabIndex={0} onClick={()=>openItem(group,item)} onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();openItem(group,item);}}} className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left hover:bg-muted/35">{group==='tasks'&&<TaskStatusIcon task={item}/>}<div className="min-w-0 flex-1"><div className="truncate text-sm font-medium"><MentionText text={titleOf(searchResultEntity(item))} onNavigate={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`)}/></div>{item.description&&<div className="mt-1 truncate text-xs text-muted-foreground"><MentionText text={item.description} onNavigate={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${encodeURIComponent(mentionId)}` : `/people/${encodeURIComponent(mentionId)}`)}/></div>}</div>{group!=='tasks'&&item.status&&<Badge variant="muted">{item.status}</Badge>}</div>)}</div></Section>)}</div></Page>;
}

export function SettingsPage() {
  const state=useEndpoint('/api/settings'); const storage=useEndpoint('/api/storage-info'); const [saving,setSaving]=React.useState(false); const [activeSection,setActiveSection]=React.useState('general'); const settings=state.data;
  const patch=async(body)=>{setSaving(true);try{const saved=await api.put('/api/settings',body);state.setData(saved);window.dispatchEvent(new CustomEvent('garden:settings-updated',{detail:saved}));return saved;}finally{setSaving(false)}};
  React.useEffect(()=>{ if(settings) applyAppearance(settings); },[settings?.theme,settings?.accentColor]);
  const chooseTheme=async(theme)=>{
    const previous={theme:settings?.theme,accentColor:settings?.accentColor};
    const accentColor=settings?.accentColor||DEFAULT_ACCENT;
    const next={theme,accentColor};
    applyAppearance(next);
    try{const saved=await patch({theme,accentColor});applyAppearance(saved);}catch{applyAppearance(previous);}
  };
  const chooseAccent=async(accentColor)=>{
    const previous={theme:settings?.theme,accentColor:settings?.accentColor};
    const next={theme:settings?.theme,accentColor};
    applyAppearance(next);
    try{const saved=await patch({accentColor});applyAppearance(saved);}catch{applyAppearance(previous);}
  };
  if(state.loading)return <Page><Skeleton className="h-80"/></Page>;
  const activeTheme=normalizeTheme(settings?.theme);
  const activeAccent=settings?.accentColor || DEFAULT_ACCENT;
  const sections=[
    {id:'general',label:'Общее'},
    {id:'appearance',label:'Оформление'},
    {id:'notifications',label:'Уведомления'},
    {id:'storage',label:'Хранение данных'},
  ];
  return <Page><PageHeader title="Настройки" actions={saving?<span className="text-xs text-muted-foreground">Сохраняю…</span>:null}/>
    <div className="kb-react-layout">
      <aside className="kb-react-sidebar">
        {sections.map((section)=><button key={section.id} type="button" onClick={()=>setActiveSection(section.id)} className={cn('kb-react-tree-row',activeSection===section.id&&'is-active')}><span className="min-w-0 flex-1 truncate">{section.label}</span></button>)}
      </aside>
      <section className="kb-react-main">
        {activeSection==='general'&&<Section title="Общее"><div className="surface divide-y">
          <SettingRow title="Приоритет задач" description="Стратегия по умолчанию для ранжирования задач в Ассистенте, поиске и списке задач." control={<Select value={settings?.taskPriorityMode || 'balanced'} onValueChange={(value)=>patch({taskPriorityMode:value})}><SelectTrigger className="w-52"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="balanced">Сбалансированная</SelectItem><SelectItem value="deadline">По срокам</SelectItem><SelectItem value="importance">По важности</SelectItem><SelectItem value="overdue">По просрочке</SelectItem></SelectContent></Select>}/>
          <SettingRow title="Часовой пояс" description="Используется для отображения времени, зависящего от часового пояса, например графика работы сотрудников." control={<Select value={settings?.timezone || DEFAULT_TIMEZONE} onValueChange={(value)=>patch({timezone:value})}><SelectTrigger className="w-56"><SelectValue/></SelectTrigger><SelectContent>{TIMEZONES.map((zone)=><SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}</SelectContent></Select>}/>
        </div></Section>}
        {activeSection==='appearance'&&<Section title="Оформление">
          <div className="surface divide-y">
            <div className="p-4">
              <div className="text-sm font-medium">Тема</div>
              <ThemeGroup value={activeTheme} onChange={chooseTheme}/>
            </div>
            <div className="p-4"><div className="mb-3 text-sm font-medium">Цвет акцента</div><AccentPicker value={activeAccent} onSelect={chooseAccent}/></div>
          </div>
        </Section>}
        {activeSection==='notifications'&&<Section title="Уведомления"><div className="surface divide-y">{Object.entries({task_assigned:'Новая задача',project_load_changed:'Изменилась загрузка',checkin_reminder:'Напоминание о Weekly',issue_created:'Новая проблема',lab_created:'Новый проект Мастерской или идея'}).map(([key,label])=><SettingRow key={key} title={label} control={<Switch checked={settings?.notificationEvents?.[key]!==false} onCheckedChange={(value)=>patch({notificationEvents:{...(settings.notificationEvents||{}),[key]:value}})}/>}/>)}</div></Section>}
        {activeSection==='storage'&&<Section title="Хранение данных"><div className="surface p-4 text-sm"><div className="font-medium">Локальное рабочее пространство</div><div className="mt-2 break-all text-xs leading-5 text-muted-foreground">{storage.data?.database||'SQLite'}</div></div></Section>}
      </section>
    </div>
  </Page>;
}

function AccentPicker({value,onSelect}) {
  return <div className="flex flex-wrap gap-2">{ACCENTS.map((accent)=><button type="button" key={accent.value} onClick={()=>onSelect(accent.value)} aria-label={accent.label} title={accent.label} aria-pressed={accent.value===value} className={cn('ui-focus-ring grid h-8 w-8 place-items-center rounded-full border transition-transform hover:scale-105',accent.value===value&&'ring-2 ring-primary ring-offset-2 ring-offset-background')}><span className="h-5 w-5 rounded-full" style={{backgroundColor:accent.diskLight}}/></button>)}</div>;
}

function ThemeGroup({ value, onChange }) {
  const themeIcons = {
    system: Monitor,
    'disk-light': Sun,
    noch: Moon,
  };
  return <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Выбор темы">
    {THEME_CHOICES.map((theme) => {
      const active = theme.value === value;
      const Icon = themeIcons[theme.value] || Monitor;
      return <button
        key={theme.value}
        type="button"
        onClick={() => onChange(theme.value)}
        aria-label={theme.label}
        title={theme.label}
        aria-pressed={active}
        className={cn(
          'ui-focus-ring inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
          active ? 'border-primary bg-primary/10 text-foreground' : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40'
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{theme.label}</span>
      </button>;
    })}
  </div>;
}

function SettingRow({title,description,control}){return <div className="flex items-center justify-between gap-6 p-4 max-sm:flex-col max-sm:items-start"><div><div className="text-sm font-medium">{title}</div>{description&&<div className="mt-1 text-xs text-muted-foreground">{description}</div>}</div><div className="shrink-0 max-sm:w-full">{control}</div></div>}

export function NotificationsPage() {
  const state=useEndpoint('/api/notifications'); const navigate=useNavigate();
  const markAll=async()=>{await api.post('/api/notifications/read-all',{});state.reload()};
  const mark=async(item)=>{if(!item.readAt){await api.put(`/api/notifications/${item.id}/read`,{});state.reload()} if(item.route)navigate(item.route)};
  return <Page narrow><PageHeader title="Уведомления" actions={state.data?.unreadCount?<Button variant="outline" size="sm" onClick={markAll}><Check className="h-4 w-4"/>Прочитать все</Button>:null}/>{state.loading?<Skeleton className="h-60"/>:state.data?.items?.length?<div className="surface divide-y">{state.data.items.map((n)=><button key={n.id} onClick={()=>mark(n)} className={`flex w-full gap-3 p-4 text-left hover:bg-muted/35 ${!n.readAt?'bg-accent/30':''}`}><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted"><Bell className="h-4 w-4 text-muted-foreground"/></span><div><div className="text-sm font-medium">{n.title||n.type||'Уведомление'}</div>{n.body&&<div className="mt-1 text-xs leading-5 text-muted-foreground">{n.body}</div>}<div className="mt-2 text-[12px] text-muted-foreground">{n.createdAt?formatDate(n.createdAt,{year:'numeric'}):''}</div></div></button>)}</div>:<EmptyState icon={Bell} title="Новых уведомлений нет"/>}</Page>;
}

export function AdminPage() {
  const users=useEndpoint('/api/admin/users');
  if(users.error?.status===403)return <Page narrow><EmptyState icon={ShieldCheck} title="Нет доступа" description="Администрирование доступно только администраторам."/></Page>;
  return <Page><PageHeader title="Администрирование"/>{users.loading?<Skeleton className="h-60"/>:<div className="surface overflow-hidden"><div className="grid grid-cols-[minmax(0,1fr)_180px_140px] border-b bg-muted/30 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[.06em] text-muted-foreground"><span>Пользователь</span><span>Роль</span><span>Статус</span></div>{users.data?.map((u)=><div key={u.id} className="grid grid-cols-[minmax(0,1fr)_180px_140px] items-center border-b px-4 py-3 last:border-0"><div className="flex items-center gap-3"><Avatar person={{name:u.displayName}} size="sm"/><div><div className="text-sm font-medium">{u.displayName}</div><div className="text-xs text-muted-foreground">@{u.username}</div></div></div><div className="text-xs text-muted-foreground">{(u.roles||[u.role]).filter(Boolean).join(', ')}</div><Badge variant={u.active?'success':'muted'}>{u.active?'Активен':'Отключён'}</Badge></div>)}</div>}</Page>;
}

export function KnowledgePage() {
  const state=useResource('kbDocs'); const folders=useResource('kbFolders'); const people=useResource('people'); const projects=useResource('projects');
  const [editing,setEditing]=React.useState(null); const [createOpen,setCreateOpen]=React.useState(false); const [query,setQuery]=usePersistentFilter('admin-knowledge', 'query', ''); const [folder,setFolder]=usePersistentFilter('admin-knowledge', 'folder', 'all');
  const items=state.data.filter((item)=>(folder==='all'||String(item.folderId||'none')===folder)&&`${item.title||''} ${item.markdown||''} ${item.url||''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  return <Page><PageHeader title="База знаний" actions={<Button data-primary-action="true" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Новый документ</Button>}/><div className="mb-5 flex flex-col gap-2 sm:flex-row"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Поиск по базе знаний"/></div><Select value={folder} onValueChange={setFolder}><SelectTrigger className="sm:min-w-[180px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все папки</SelectItem><SelectItem value="none">Без папки</SelectItem>{folders.data.map((f)=><SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent></Select></div>{state.loading?<div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-32"/><Skeleton className="h-32"/></div>:items.length?<div className="grid gap-3 sm:grid-cols-2">{items.map((item)=><KnowledgeCard key={item.id} item={item} folder={folders.data.find((f)=>f.id===item.folderId)} onEdit={()=>setEditing(item)}/>)}</div>:<EmptyState icon={BookOpen} title="База знаний пока пуста" description="Добавляйте сюда документы, инструкции и повторно используемый контекст." action={<Button onClick={()=>setCreateOpen(true)}>Создать документ</Button>}/>}<KnowledgeDialog open={Boolean(editing)} item={editing} folders={folders.data} people={people.data} projects={projects.data} onOpenChange={(open)=>!open&&setEditing(null)} onSaved={state.reload}/><KnowledgeDialog open={createOpen} item={null} folders={folders.data} people={people.data} projects={projects.data} onOpenChange={setCreateOpen} onSaved={state.reload}/></Page>;
}

function stripKnowledgeHtml(html='') { return String(html).replace(/<\s*br\s*\/?>/gi,'\n').replace(/<\/p>|<\/h[1-6]>/gi,'\n\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim(); }
function escapeKnowledgeHtml(value='') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function knowledgeTextToHtml(text='') { return String(text).split(/\n{2,}/).map((part)=>`<p>${escapeKnowledgeHtml(part).replace(/\n/g,'<br>')}</p>`).join('') || '<p><br></p>'; }
function KnowledgeCard({ item, folder, onEdit }) {
  const excerpt=item.docType==='link'?(item.url||''):(item.markdown||stripKnowledgeHtml(item.contentHtml||''));
  return <div className="surface p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left"><BookOpen className="mb-3 h-4 w-4 text-muted-foreground"/><div className="font-medium">{titleOf(item)}</div>{excerpt&&<div className="mt-2 truncate-2 text-xs leading-5 text-muted-foreground"><MentionText text={excerpt}/></div>}</button><Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать"><Pencil className="h-3.5 w-3.5"/></Button></div><div className="mt-3 flex items-center justify-between gap-2">{folder?<Badge variant="outline">{folder.title}</Badge>:<span/>}{item.docType==='link'&&item.url&&<a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Открыть<ExternalLink className="h-3 w-3"/></a>}</div></div>;
}
function KnowledgeDialog({ open, item, folders, people = [], projects = [], onOpenChange, onSaved }) {
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'kbDocs', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({ title: current?.title || '', docType: current?.docType || 'article', folderId: current?.folderId || 'none', url: current?.url || '', content: current?.markdown || stripKnowledgeHtml(current?.contentHtml || '') }),
    validate: (d) => {
      if (!d.title?.trim()) return 'Укажите название';
      if (d.docType === 'link' && !/^https?:\/\//i.test(d.url || '')) return 'Укажите корректную ссылку';
      return null;
    },
    buildPayload: (d) => d.docType === 'link'
      ? { title: d.title.trim(), folderId: d.folderId === 'none' ? null : d.folderId, docType: 'link', url: d.url.trim(), contentHtml: '', markdown: '' }
      : { title: d.title.trim(), folderId: d.folderId === 'none' ? null : d.folderId, docType: 'article', url: null, markdown: d.content || '', contentHtml: knowledgeTextToHtml(d.content || '') },
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{isEdit ? 'Редактировать документ' : 'Добавить документ'}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input className="mt-1.5" value={draft.title||''} onChange={(e)=>field('title',e.target.value)} autoFocus/></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Тип</Label><Select value={draft.docType||'article'} onValueChange={(v)=>field('docType',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="article">Статья</SelectItem><SelectItem value="link">Ссылка</SelectItem></SelectContent></Select></div><div><Label>Папка</Label><Select value={draft.folderId||'none'} onValueChange={(v)=>field('folderId',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без папки</SelectItem>{folders.map((f)=><SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent></Select></div></div>{draft.docType==='link'?<div><Label>Ссылка</Label><Input className="mt-1.5" type="url" value={draft.url||''} onChange={(e)=>field('url',e.target.value)} placeholder="https://…"/></div>:<div><Label>Содержимое</Label><MentionEditor className="mt-1.5" editorClassName="min-h-[260px]" value={draft.content||''} onChange={(value)=>field('content',value)} people={people} projects={projects} placeholder="Начните писать…" ariaLabel="Содержимое документа"/></div>}{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div><DialogFooter className="justify-between"><div>{isEdit&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить «${item?.title}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}

