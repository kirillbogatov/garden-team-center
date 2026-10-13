import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen, ChevronRight, Code2, ExternalLink, FileText, Folder, Image as ImageIcon,
  Italic, Link2, Pencil, Plus, Save, Table2, Trash2, Type, Wrench, Bold, List, ListOrdered,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/page';
import { CompactSearchControl } from '@/components/view-mode-toggle';
import {
  AlertDialog, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

function pluralRu(n, one, two, five) {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return two;
  return five;
}

function descendantIds(folders, parentId, out = new Set()) {
  for (const folder of folders.filter((item) => item.parentId === parentId)) {
    if (out.has(folder.id)) continue;
    out.add(folder.id); descendantIds(folders, folder.id, out);
  }
  return out;
}

function FolderTree({ folders, items, selected, onSelect }) {
  const renderBranch = (parentId = null, depth = 0) => folders
    .filter((folder) => (folder.parentId || null) === (parentId || null))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'))
    .map((folder) => {
      const count = items.filter((item) => item.folderId === folder.id).length;
      return <React.Fragment key={folder.id}>
        <button type="button" onClick={() => onSelect(folder.id)} className={cn('kb-react-tree-row', selected === folder.id && 'is-active')} style={{ paddingLeft: `${12 + depth * 18}px` }}>
          <Folder className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0 flex-1 truncate">{folder.title}</span>{count > 0 && <span className="text-[12px] tabular-nums text-muted-foreground">{count}</span>}
        </button>
        {renderBranch(folder.id, depth + 1)}
      </React.Fragment>;
    });
  return <>{renderBranch()}</>;
}

function FolderCatalogLayout({ title, icon: Icon, folders, items, selected, onSelect, onNewFolder, onEditFolder, actions, children, loading, emptyLabel = 'В этой папке пока ничего нет' }) {
  const [query, setQuery] = usePersistentFilter(`folder-${title}`, 'query', '');
  const selectedFolder = folders.find((folder) => folder.id === selected);
  const scopedItems = selected === 'all' ? items : items.filter((item) => item.folderId === selected);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const filtered = normalizedQuery
    ? scopedItems.filter((item) => [item.title, item.scope, item.url, item.markdown, item.contentHtml]
        .some((value) => String(value || '').toLocaleLowerCase('ru').includes(normalizedQuery)))
    : scopedItems;
  return <Page>
    <PageHeader title={title} actions={<><CompactSearchControl value={query} onChange={setQuery} placeholder={title === 'Инструменты' ? 'Поиск инструментов' : 'Поиск документов'}/>{actions}</>}/>
    <div className="kb-react-layout">
      <aside className="kb-react-sidebar">
        <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-medium text-muted-foreground">Папки</span><Button variant="ghost" size="icon-sm" onClick={onNewFolder} aria-label="Создать папку"><Plus className="h-3.5 w-3.5"/></Button></div>
        <button type="button" onClick={() => onSelect('all')} className={cn('kb-react-tree-row', selected === 'all' && 'is-active')}>
          <Icon className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0 flex-1 truncate">Все</span><span className="text-[12px] tabular-nums text-muted-foreground">{items.length}</span>
        </button>
        <div className="mt-1"><FolderTree folders={folders} items={items} selected={selected} onSelect={onSelect}/></div>
      </aside>
      <section className="kb-react-main">
        <div className="kb-react-section-head">
          <div><h2 className="text-lg font-semibold tracking-tight">{selectedFolder?.title || title}</h2><div className="mt-1 text-xs text-muted-foreground">{filtered.length} {pluralRu(filtered.length, title === 'Инструменты' ? 'инструмент' : 'документ', title === 'Инструменты' ? 'инструмента' : 'документа', title === 'Инструменты' ? 'инструментов' : 'документов')}</div></div>
          {selectedFolder && <Button variant="outline" size="sm" onClick={() => onEditFolder(selectedFolder)}><Pencil className="h-3.5 w-3.5"/>Редактировать папку</Button>}
        </div>
        {loading ? <div className="space-y-2"><Skeleton className="h-14"/><Skeleton className="h-14"/><Skeleton className="h-14"/></div> : filtered.length ? children(filtered) : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{normalizedQuery ? 'По вашему запросу ничего не найдено' : emptyLabel}</div>}
      </section>
    </div>
  </Page>;
}

function FolderDialog({ open, item, folders, items, resource, onOpenChange, onSaved }) {
  const { draft, field, saving, error, save, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource, open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({ title: current?.title || '', parentId: current?.parentId || 'none' }),
    validate: (d) => (!String(d.title || '').trim() ? 'Укажите название папки' : null),
    buildPayload: (d) => ({ title: d.title.trim(), parentId: d.parentId === 'none' ? null : d.parentId }),
  });
  const blocked = React.useMemo(() => { const set = item ? descendantIds(folders, item.id) : new Set(); if (item) set.add(item.id); return set; }, [folders, item?.id]);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const requestRemove = () => { if (!item) return; if (folders.some((folder) => folder.parentId === item.id) || items.some((entry) => entry.folderId === item.id)) { setDeleteError('Сначала переместите содержимое и вложенные папки'); return; } setDeleteError(''); setConfirmOpen(true); };
  const remove = async () => { setDeleting(true); try { await api.resource(resource).remove(item.id); onOpenChange(false); await onSaved?.('deleted'); } catch (e) { setDeleteError(e?.message || 'Не удалось удалить папку'); } finally { setDeleting(false); setConfirmOpen(false); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{item ? 'Редактировать папку' : 'Новая папка'}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input autoFocus className="mt-1.5" value={draft.title || ''} onChange={(e) => field('title', e.target.value)}/></div><div><Label>Родительская папка</Label><Select value={draft.parentId || 'none'} onValueChange={(value) => field('parentId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Корень</SelectItem>{folders.filter((folder) => !blocked.has(folder.id)).map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.title}</SelectItem>)}</SelectContent></Select></div>{(error || deleteError) && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error || deleteError}</div>}</div><DialogFooter className="justify-between"><div>{item && <Button variant="destructive" onClick={requestRemove} disabled={saving || deleting}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить папку «${item?.title}»?`} onConfirm={remove} busy={deleting}/>
  </Dialog>;
}

export function KnowledgePage() {
  const navigate = useNavigate(); const docs = useResource('kbDocs'); const folders = useResource('kbFolders');
  const [selected, setSelected] = usePersistentFilter('knowledge', 'folder', 'all'); const [folderDialog, setFolderDialog] = React.useState(null); const [docDialog, setDocDialog] = React.useState(null);
  const reload = async (deleted) => { await Promise.all([docs.reload(), folders.reload()]); if (deleted) setSelected('all'); };
  return <>
    <FolderCatalogLayout title="База знаний" icon={BookOpen} folders={folders.data} items={docs.data} selected={selected} onSelect={setSelected} onNewFolder={() => setFolderDialog({})} onEditFolder={(item) => setFolderDialog(item)} loading={docs.loading || folders.loading} actions={<><Button variant="outline" onClick={() => setFolderDialog({})}><Plus className="h-4 w-4"/>Создать папку</Button><Button data-primary-action="true" onClick={() => setDocDialog({})}><Plus className="h-4 w-4"/>Добавить документ</Button></>}>
      {(filtered) => <div className="kb-react-rows">{filtered.slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).map((doc) => <KnowledgeRow key={doc.id} doc={doc} folders={folders.data} onOpen={() => doc.docType === 'link' ? window.open(doc.url, '_blank', 'noopener,noreferrer') : navigate(`/knowledge/${encodeURIComponent(doc.slug || doc.id)}`)} onEdit={() => setDocDialog(doc)}/>)}</div>}
    </FolderCatalogLayout>
    <FolderDialog open={folderDialog !== null} item={folderDialog?.id ? folderDialog : null} folders={folders.data} items={docs.data} resource="kbFolders" onOpenChange={(open) => !open && setFolderDialog(null)} onSaved={reload}/>
    <KnowledgeCreateDialog open={docDialog !== null} item={docDialog?.id ? docDialog : null} folders={folders.data} selectedFolder={selected} onOpenChange={(open) => !open && setDocDialog(null)} onSaved={async (saved) => { await docs.reload(); if (saved?.docType === 'article') navigate(`/knowledge/${encodeURIComponent(saved.slug || saved.id)}`); }}/>
  </>;
}

function KnowledgeRow({ doc, folders, onOpen, onEdit }) {
  const folder = folders.find((item) => item.id === doc.folderId); const isLink = doc.docType === 'link';
  return <div className="kb-react-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted/65 text-muted-foreground">{isLink ? <ExternalLink className="h-4 w-4"/> : <FileText className="h-4 w-4"/>}</span>
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{doc.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{isLink ? 'Ссылка' : doc.updatedAt ? `Изменён ${formatDate(doc.updatedAt, { year: 'numeric' })}` : 'Статья'}</div></div>
    {folder && <span className="hidden max-w-44 truncate text-xs text-muted-foreground md:block">{folder.title}</span>}
    <Button variant="ghost" size="icon-sm" onClick={(event) => { event.stopPropagation(); onEdit(); }} aria-label="Редактировать"><Pencil className="h-3.5 w-3.5"/></Button>
    {isLink ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground"/>}
  </div>;
}

function KnowledgeCreateDialog({ open, item, folders, selectedFolder, onOpenChange, onSaved }) {
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'kbDocs', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({ title: current?.title || '', docType: current?.docType || 'article', folderId: current?.folderId || (selectedFolder !== 'all' ? selectedFolder : 'none'), url: current?.url || '' }),
    validate: (d) => {
      const title = String(d.title || '').trim();
      if (!title) return 'Укажите название';
      if (d.docType === 'link' && !/^https?:\/\//i.test(d.url || '')) return 'Укажите корректную ссылку';
      return null;
    },
    buildPayload: (d) => {
      const title = String(d.title || '').trim();
      return d.docType === 'link'
        ? { title, folderId: d.folderId === 'none' ? null : d.folderId, docType: 'link', url: String(d.url || '').trim(), contentHtml: '', markdown: '' }
        : { title, folderId: d.folderId === 'none' ? null : d.folderId, docType: 'article', url: null, contentHtml: item?.contentHtml || '<p><br></p>', markdown: item?.markdown || '' };
    },
    mapSaveError: (e) => e?.message || 'Не удалось сохранить',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{isEdit ? 'Редактировать документ' : 'Добавить документ'}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input autoFocus className="mt-1.5" value={draft.title || ''} onChange={(e) => field('title', e.target.value)}/></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Тип</Label><Select value={draft.docType || 'article'} onValueChange={(value) => field('docType', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="article">Статья</SelectItem><SelectItem value="link">Ссылка</SelectItem></SelectContent></Select></div><div><Label>Папка</Label><Select value={draft.folderId || 'none'} onValueChange={(value) => field('folderId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без папки</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.title}</SelectItem>)}</SelectContent></Select></div></div>{draft.docType === 'link' && <div><Label>Ссылка</Label><Input className="mt-1.5" type="url" value={draft.url || ''} onChange={(e) => field('url', e.target.value)} placeholder="https://…"/></div>}{error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div><DialogFooter className="justify-between"><div>{isEdit && <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : draft.docType === 'article' && !isEdit ? 'Создать' : 'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить «${item?.title}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}

function htmlToMarkdown(html = '') {
  if (typeof DOMParser === 'undefined') return '';
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
  const walk = (node) => {
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';
    const inner = [...node.childNodes].map(walk).join(''); const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n'; if (tag === 'strong' || tag === 'b') return `**${inner}**`; if (tag === 'em' || tag === 'i') return `*${inner}*`; if (tag === 'a') return `[${inner}](${node.getAttribute('href') || ''})`;
    if (tag === 'h1') return `# ${inner}\n\n`; if (tag === 'h2') return `## ${inner}\n\n`; if (tag === 'h3') return `### ${inner}\n\n`; if (tag === 'p' || tag === 'div') return `${inner}\n\n`; if (tag === 'pre') return `\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
    if (tag === 'li') { const parent = node.parentElement; const index = parent ? [...parent.children].indexOf(node) + 1 : 1; return `${parent?.tagName.toLowerCase() === 'ol' ? `${index}.` : '-'} ${inner}\n`; } if (tag === 'ul' || tag === 'ol') return `${inner}\n`;
    if (tag === 'img') return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
    return inner;
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').trim();
}

function insertHtmlAtSelection(html) { document.execCommand('insertHTML', false, html); }

export function KnowledgeDocumentPage() {
  const { id } = useParams(); const navigate = useNavigate(); const folders = useResource('kbFolders'); const [doc, setDoc] = React.useState(null); const [loading, setLoading] = React.useState(true); const [saving, setSaving] = React.useState(false); const [saveError, setSaveError] = React.useState(''); const editorRef = React.useRef(null); const lastSavedRef = React.useRef(null); const [savedAt, setSavedAt] = React.useState(null); const fileRef = React.useRef(null); const [title, setTitle] = React.useState(''); const [folderId, setFolderId] = React.useState('none'); const draftKey = `garden:kb-draft:${id}`; const [confirmOpen, setConfirmOpen] = React.useState(false); const [deleting, setDeleting] = React.useState(false);
  React.useEffect(() => { let live = true; setLoading(true); api.resource('kbDocs').get(id).then((value) => { if (!live) return; if (value.docType === 'link') { window.location.replace(value.url); return; } setDoc(value); setTitle(value.title || ''); setFolderId(value.folderId || 'none'); setLoading(false); }).catch(() => setLoading(false)); return () => { live = false; }; }, [id]);
  React.useEffect(() => { if (!doc || !editorRef.current) return; const serverSnapshot = JSON.stringify({ title: doc.title || '', folderId: doc.folderId || '', contentHtml: doc.contentHtml || '<p><br></p>' }); lastSavedRef.current = serverSnapshot; const stored = localStorage.getItem(draftKey); let html = doc.contentHtml || '<p><br></p>'; if (stored) { try { const draft = JSON.parse(stored); if (draft.contentHtml && JSON.stringify({ title: draft.title || '', folderId: draft.folderId || '', contentHtml: draft.contentHtml }) !== serverSnapshot && window.confirm('Найден локальный черновик. Восстановить его?')) { html = draft.contentHtml; setTitle(draft.title || doc.title || ''); setFolderId(draft.folderId || 'none'); } else localStorage.removeItem(draftKey); } catch { localStorage.removeItem(draftKey); } } editorRef.current.innerHTML = html; }, [doc?.id]);
  React.useEffect(() => { if (!doc) return undefined; const timer = setInterval(() => { if (!editorRef.current) return; const snapshot = JSON.stringify({ title, folderId: folderId === 'none' ? '' : folderId, contentHtml: editorRef.current.innerHTML }); if (snapshot === lastSavedRef.current) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, JSON.stringify({ ...JSON.parse(snapshot), updatedAt: Date.now() })); }, 1000); return () => clearInterval(timer); }, [doc?.id, title, folderId]);
  const command = (name, value) => { editorRef.current?.focus(); document.execCommand(name, false, value); };
  const handleEditorKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) return;
    const block = (selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest('p,div');
    if (!block || !editorRef.current.contains(block)) return;
    const before = document.createRange(); before.selectNodeContents(block); before.setEnd(selection.anchorNode, selection.anchorOffset);
    const text = before.toString();
    const match = text.match(/^\s*([-*+] |\d+\. )(.*)$/);
    if (!match || block.textContent !== text) return;
    event.preventDefault();
    const ordered = /^\d/.test(match[1]);
    const itemText = match[2];
    block.textContent = itemText || '\u200b';
    const list = document.createElement(ordered ? 'ol' : 'ul');
    const item = document.createElement('li'); item.textContent = itemText || '\u200b';
    list.appendChild(item); block.replaceWith(list);
    const range = document.createRange(); range.selectNodeContents(item); range.collapse(false);
    selection.removeAllRanges(); selection.addRange(range);
  };
  const insertLink = () => { const url = window.prompt('Ссылка'); if (url) command('createLink', url); };
  const insertCode = () => { editorRef.current?.focus(); const selection = window.getSelection()?.toString() || 'код'; insertHtmlAtSelection(`<pre><code>${selection.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre><p><br></p>`); };
  const insertTable = () => { const rows = Math.max(1, Math.min(12, Number(window.prompt('Строк (включая заголовок)', '3')) || 3)); const cols = Math.max(1, Math.min(8, Number(window.prompt('Столбцов', '3')) || 3)); const head = `<thead><tr>${Array.from({ length: cols }, (_, index) => `<th>Столбец ${index + 1}</th>`).join('')}</tr></thead>`; const body = `<tbody>${Array.from({ length: Math.max(0, rows - 1) }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('')}</tbody>`; editorRef.current?.focus(); insertHtmlAtSelection(`<table>${head}${body}</table><p><br></p>`); };
  const insertImage = (file) => { if (!file || !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => { editorRef.current?.focus(); insertHtmlAtSelection(`<figure><img src="${reader.result}" alt="${file.name.replace(/\.[^.]+$/, '')}"><figcaption><br></figcaption></figure><p><br></p>`); }; reader.readAsDataURL(file); };
  const save = async () => { if (!doc || !title.trim()) return; setSaving(true); setSaveError(''); try { const contentHtml = editorRef.current?.innerHTML || '<p><br></p>'; const saved = await api.resource('kbDocs').update(doc.id, { title: title.trim(), folderId: folderId === 'none' ? null : folderId, docType: 'article', url: null, contentHtml, markdown: htmlToMarkdown(contentHtml) }); lastSavedRef.current = JSON.stringify({ title: saved.title || title.trim(), folderId: saved.folderId || '', contentHtml: saved.contentHtml || contentHtml }); setSavedAt(new Date()); localStorage.removeItem(draftKey); setDoc(saved); } catch (error) { setSaveError(error?.status === 403 ? 'Недостаточно прав для сохранения документа' : (error?.message ? `Не удалось сохранить документ: ${error.message}` : 'Не удалось сохранить документ')); } finally { setSaving(false); } };
  const remove = async () => { if (!doc) return; setDeleting(true); try { await api.resource('kbDocs').remove(doc.id); localStorage.removeItem(draftKey); navigate('/knowledge'); } finally { setDeleting(false); setConfirmOpen(false); } };
  const exportMarkdown = () => { const md = htmlToMarkdown(editorRef.current?.innerHTML || ''); const blob = new Blob([`# ${title}\n\n${md}\n`], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${title || 'document'}.md`; a.click(); URL.revokeObjectURL(url); };
  if (loading) return <Page narrow><Skeleton className="h-[540px]"/></Page>; if (!doc) return <Page narrow><EmptyState icon={BookOpen} title="Документ не найден" action={<Button onClick={() => navigate('/knowledge')}>К базе знаний</Button>}/></Page>;
  return <Page className="kb-react-document-page">
    <div className="kb-react-breadcrumbs"><button type="button" onClick={() => navigate('/knowledge')}>База знаний</button><ChevronRight className="h-3 w-3"/><span>{doc.title}</span></div>
    <div className="kb-react-paper">
      <div className="kb-react-paper-meta"><Input className="kb-react-title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название документа"/><Select value={folderId} onValueChange={setFolderId}><SelectTrigger className="w-[220px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без папки</SelectItem>{folders.data.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.title}</SelectItem>)}</SelectContent></Select><Button onClick={save} disabled={saving}><Save className="h-4 w-4"/>{saving ? 'Сохраняю…' : 'Сохранить'}</Button></div>
      {savedAt && !saveError && <div className="mx-4 mt-2 text-xs text-muted-foreground">Сохранено на сервере: {savedAt.toLocaleTimeString('ru-RU')}</div>}
      {saveError && <div className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</div>}
      <div className="kb-react-toolbar">
        <Select defaultValue="p" onValueChange={(value) => command('formatBlock', value)}><SelectTrigger className="h-8 min-w-[132px] border-0 bg-transparent"><Type className="h-3.5 w-3.5"/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="p">Текст</SelectItem><SelectItem value="h1">Заголовок 1</SelectItem><SelectItem value="h2">Заголовок 2</SelectItem><SelectItem value="h3">Заголовок 3</SelectItem></SelectContent></Select>
        <ToolbarButton title="Жирный" onClick={() => command('bold')}><Bold className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Курсив" onClick={() => command('italic')}><Italic className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Маркированный список" onClick={() => command('insertUnorderedList')}><List className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Нумерованный список" onClick={() => command('insertOrderedList')}><ListOrdered className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Ссылка" onClick={insertLink}><Link2 className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Блок кода" onClick={insertCode}><Code2 className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Изображение" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4"/></ToolbarButton><ToolbarButton title="Таблица" onClick={insertTable}><Table2 className="h-4 w-4"/></ToolbarButton>
        <span className="flex-1"/><Button variant="ghost" size="sm" onClick={exportMarkdown}>Экспорт .md</Button><Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setConfirmOpen(true)} aria-label="Удалить документ"><Trash2 className="h-4 w-4"/></Button><input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = ''; }}/>
      </div>
      <article ref={editorRef} onKeyDown={handleEditorKeyDown} className="kb-react-editor" contentEditable suppressContentEditableWarning data-placeholder="Начните писать…"/>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Удалить документ из базы знаний?" onConfirm={remove} busy={deleting}/>
  </Page>;
}

function ToolbarButton({ title, onClick, children }) { return <button type="button" title={title} onMouseDown={(event) => { event.preventDefault(); onClick(); }} className="kb-react-tool">{children}</button>; }

export function ToolsPage() {
  const tools = useResource('tools'); const folders = useResource('toolFolders'); const [selected, setSelected] = usePersistentFilter('tools', 'folder', 'all'); const [folderDialog, setFolderDialog] = React.useState(null); const [toolDialog, setToolDialog] = React.useState(null);
  const reload = async (deleted) => { await Promise.all([tools.reload(), folders.reload()]); if (deleted) setSelected('all'); };
  return <>
    <FolderCatalogLayout title="Инструменты" icon={Wrench} folders={folders.data} items={tools.data} selected={selected} onSelect={setSelected} onNewFolder={() => setFolderDialog({})} onEditFolder={(item) => setFolderDialog(item)} loading={tools.loading || folders.loading} actions={<><Button variant="outline" onClick={() => setFolderDialog({})}><Plus className="h-4 w-4"/>Создать папку</Button><Button data-primary-action="true" onClick={() => setToolDialog({})}><Plus className="h-4 w-4"/>Добавить инструмент</Button></>}>
      {(filtered) => <div className="kb-react-rows">{filtered.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru')).map((tool) => <div key={tool.id} className="kb-react-row" role="button" tabIndex={0} onClick={() => window.open(tool.url, '_blank', 'noopener,noreferrer')} onKeyDown={(event) => { if (event.key === 'Enter') window.open(tool.url, '_blank', 'noopener,noreferrer'); }}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted/65 text-muted-foreground"><ExternalLink className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{tool.title}</div>{tool.scope && <div className="mt-0.5 truncate text-xs text-muted-foreground">{tool.scope}</div>}</div><span className="hidden max-w-56 truncate text-xs text-muted-foreground md:block">{folders.data.find((folder) => folder.id === tool.folderId)?.title || ''}</span><Button variant="ghost" size="icon-sm" onClick={(event) => { event.stopPropagation(); setToolDialog(tool); }} aria-label="Редактировать"><Pencil className="h-3.5 w-3.5"/></Button><ExternalLink className="h-3.5 w-3.5 text-muted-foreground"/></div>)}</div>}
    </FolderCatalogLayout>
    <FolderDialog open={folderDialog !== null} item={folderDialog?.id ? folderDialog : null} folders={folders.data} items={tools.data} resource="toolFolders" onOpenChange={(open) => !open && setFolderDialog(null)} onSaved={reload}/>
    <ToolDialog open={toolDialog !== null} item={toolDialog?.id ? toolDialog : null} folders={folders.data} selectedFolder={selected} onOpenChange={(open) => !open && setToolDialog(null)} onSaved={tools.reload}/>
  </>;
}

function ToolDialog({ open, item, folders, selectedFolder, onOpenChange, onSaved }) {
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'tools', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({ title: current?.title || '', url: current?.url || '', scope: current?.scope || '', folderId: current?.folderId || (selectedFolder !== 'all' ? selectedFolder : 'none') }),
    validate: (d) => {
      if (!String(d.title || '').trim()) return 'Укажите название';
      if (!/^https?:\/\//i.test(d.url || '')) return 'Укажите корректную ссылку';
      return null;
    },
    buildPayload: (d) => ({ ...(item?.id ? item : {}), title: d.title.trim(), url: d.url.trim(), scope: String(d.scope || '').trim(), folderId: d.folderId === 'none' ? null : d.folderId }),
    mapSaveError: (e) => e?.message || 'Не удалось сохранить',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{isEdit ? 'Редактировать инструмент' : 'Добавить инструмент'}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input autoFocus className="mt-1.5" value={draft.title || ''} onChange={(e) => field('title', e.target.value)}/></div><div><Label>Ссылка</Label><Input className="mt-1.5" type="url" value={draft.url || ''} onChange={(e) => field('url', e.target.value)} placeholder="https://…"/></div><div><Label>Область применения</Label><Input className="mt-1.5" value={draft.scope || ''} onChange={(e) => field('scope', e.target.value)}/></div><div><Label>Папка</Label><Select value={draft.folderId || 'none'} onValueChange={(value) => field('folderId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без папки</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.title}</SelectItem>)}</SelectContent></Select></div>{error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div><DialogFooter className="justify-between"><div>{isEdit && <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить «${item?.title}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}
