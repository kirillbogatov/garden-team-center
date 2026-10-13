import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bookmark, Check, ChevronRight, Pencil, Search, Trash2, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/page';
import {
  AlertDialog, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Skeleton, Switch,
} from '@/components/ui';
import { MentionEditor } from '@/components/mention-editor';
import { MarkdownText } from '@/components/markdown';
import { useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { mentionRoute } from '@/lib/mention-route';

function relativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  if (abs < 60_000) return 'только что';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date);
}

function toDatetimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function JournalEntry({ entry, onEdit, onDelete, onPin, people, projects, navigate, target }) {
  return <article
    id={`journal-entry-${entry.id}`}
    className={cn('group transition-colors', target && 'journal-entry-target ring-2 ring-primary/20')}
    onClick={() => onEdit(entry)}
  >
    <div className="journal-entry-header">
      <span className="text-[12px] text-muted-foreground">{relativeDate(entry.createdAt)}</span>
      <div className="journal-entry-actions opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('h-7 w-7', entry.attentionPinned && 'text-primary opacity-100')}
          title={entry.attentionPinned ? 'Убрать с главной страницы' : 'Показывать на главной странице'}
          aria-label={entry.attentionPinned ? 'Убрать запись с главной страницы' : 'Показывать запись на главной странице'}
          onClick={(event) => { event.stopPropagation(); onPin(entry); }}
        ><Bookmark className={cn('h-3.5 w-3.5', entry.attentionPinned && 'fill-current')}/></Button>
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Редактировать" aria-label="Редактировать" onClick={(event) => { event.stopPropagation(); onEdit(entry); }}><Pencil className="h-3.5 w-3.5"/></Button>
        <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить" aria-label="Удалить" onClick={(event) => { event.stopPropagation(); onDelete(entry); }}><Trash2 className="h-3.5 w-3.5"/></Button>
      </div>
    </div>
    <MarkdownText className="journal-entry-body text-sm leading-6 text-foreground" text={entry.text} onNavigate={(kind, id) => navigate(mentionRoute(kind, id) || '/journal')}/>
  </article>;
}

function EditJournalDialog({ entry, open, onOpenChange, onSaved, onDeleted, people, projects }) {
  const { draft, field, saving, save, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'journal', open, item: entry, onOpenChange, onSaved,
    buildDraft: (current) => ({ text: current?.text || '', date: toDatetimeLocal(current?.createdAt) }),
    validate: (d) => (!String(d.text || '').trim() ? 'Текст записи обязателен' : null),
    buildPayload: (d) => {
      const payload = { text: d.text.trim() };
      if (d.date) payload.createdAt = new Date(d.date).toISOString();
      return payload;
    },
  });

  const [removing, setRemoving] = React.useState(false);
  const busy = saving || removing;
  const remove = async () => {
    if (!entry) return;
    setRemoving(true);
    try {
      await api.resource('journal').remove(entry.id);
      onDeleted?.(entry.id);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally { setRemoving(false); }
  };

  const submit = (event) => { event.preventDefault(); save(); };

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle>Редактировать запись</DialogTitle></DialogHeader>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Текст</Label>
              <MentionEditor value={draft.text || ''} onChange={(value) => field('text', value)} people={people} projects={projects} placeholder="Текст записи" autoFocus ariaLabel="Текст записи"/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="journal-edit-date">Дата</Label>
              <Input id="journal-edit-date" type="datetime-local" value={draft.date || ''} onChange={(event) => field('date', event.target.value)}/>
            </div>
          </div>
          <DialogFooter className="mt-6 justify-between sm:justify-between">
            <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={busy}><Trash2 className="h-4 w-4"/>Удалить</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button type="submit" disabled={busy || !String(draft.text || '').trim()}>Сохранить</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Удалить запись?"
      description="Запись исчезнет из журнала. Это действие нельзя отменить."
      onConfirm={remove}
      busy={removing}
    />
  </>;
}

export function JournalPage() {
  const entriesState = useResource('journal');
  const peopleState = useResource('people');
  const projectsState = useResource('projects');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = usePersistentFilter('journal', 'query', '');
  const [onlyPinned, setOnlyPinned] = usePersistentFilter('journal', 'onlyPinned', false);
  const [editEntry, setEditEntry] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const targetRef = params.get('entry');
  const targetEntry = React.useMemo(() => entriesState.data.find((entry) => entry.id === targetRef || entry.noteKey === targetRef) || null, [entriesState.data, targetRef]);
  const targetId = targetEntry?.id || null;

  const announce = (value) => {
    setMessage(value);
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 1800);
  };

  const sorted = React.useMemo(() => [...entriesState.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [entriesState.data]);
  const shown = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    return sorted.filter((entry) => {
      if (onlyPinned && !entry.attentionPinned) return false;
      if (q && !String(entry.text || '').toLocaleLowerCase('ru').includes(q)) return false;
      return true;
    });
  }, [sorted, query, onlyPinned]);

  React.useEffect(() => {
    if (!targetRef || entriesState.loading || !targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`journal-entry-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const next = new URLSearchParams(params);
      next.delete('entry');
      window.setTimeout(() => setParams(next, { replace: true }), 1800);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [targetId, targetRef, entriesState.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await api.resource('journal').create({ text: value, createdAt: new Date().toISOString() });
      setText('');
      await entriesState.reload();
      announce('Запись добавлена');
    } finally { setBusy(false); }
  };

  const pin = async (entry) => {
    const next = !entry.attentionPinned;
    await api.resource('journal').update(entry.id, { attentionPinned: next });
    if (next) {
      try {
        const settings = await api.get('/api/settings');
        const hidden = { ...(settings.attentionHiddenUntil || {}) };
        delete hidden[`journal:${entry.id}`];
        await api.put('/api/settings', { attentionHiddenUntil: hidden });
      } catch { /* pin itself is already saved */ }
    }
    await entriesState.reload();
    announce(next ? 'Запись будет показана на главной странице' : 'Запись убрана с главной страницы');
  };

  const askDelete = (entry) => setEditEntry({ ...entry, _deleteRequested: true });

  return <Page narrow>
    <PageHeader title="Журнал"/>

    <section className="journal-minimal-composer mb-8">
      <MentionEditor
        value={text}
        onChange={setText}
        people={peopleState.data}
        projects={projectsState.data}
        placeholder="Заметки о @сотрудниках, @проектах и вообще"
        submitOnEnter
        onSubmit={create}
        ariaLabel="Новая запись в журнале"
        className="journal-composer-editor"
      />
      <Button type="button" size="icon" className="journal-composer-submit !rounded-full" onClick={create} disabled={busy || !text.trim()} aria-label="Записать в журнал" title="Записать в журнал"><ChevronRight className="h-4 w-4"/></Button>
    </section>

    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="journal-section-title text-sm">История записей</h2>
        <span className="text-xs text-muted-foreground">{sorted.length}</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={onlyPinned} onCheckedChange={setOnlyPinned} aria-label="Только закрепленные"/>
            <span>Только закрепленные</span>
          </label>
          <div className="flex items-center gap-1">
          {searchOpen && <div className="relative mr-1 w-64 max-w-[52vw]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
            <Input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 pr-8 text-xs" placeholder="Поиск по журналу"/>
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Очистить поиск"><X className="h-3.5 w-3.5"/></button>}
          </div>}
          <Button variant={searchOpen ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => { setSearchOpen((value) => !value); if (searchOpen) setQuery(''); }} title="Поиск по журналу" aria-label="Поиск по журналу"><Search className="h-4 w-4"/></Button>
          </div>
        </div>
      </div>

      {entriesState.loading ? <div className="space-y-3"><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/></div>
        : shown.length ? <div className="journal-entry-list">{shown.map((entry) => <div key={entry.id} className="journal-entry-row"><JournalEntry
          entry={entry}
          target={targetId === entry.id}
          onEdit={setEditEntry}
          onDelete={askDelete}
          onPin={pin}
          people={peopleState.data}
          projects={projectsState.data}
          navigate={navigate}
        /></div>)}</div>
        : <div className="border-y border-dashed px-6 py-12 text-center"><div className="text-sm font-medium">{query ? 'Ничего не найдено' : 'Записей пока нет'}</div><div className="mt-1 text-xs text-muted-foreground">{query ? 'Попробуйте другой запрос.' : 'Добавьте первую запись выше.'}</div></div>}
    </section>

    <EditJournalDialog
      entry={editEntry}
      open={Boolean(editEntry) && !Boolean(editEntry?._deleteRequested)}
      onOpenChange={(open) => { if (!open) setEditEntry(null); }}
      onSaved={async () => { await entriesState.reload(); announce('Сохранено'); }}
      onDeleted={async () => { await entriesState.reload(); announce('Запись удалена'); }}
      people={peopleState.data}
      projects={projectsState.data}
    />

    <Dialog open={Boolean(editEntry?._deleteRequested)} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Удалить запись?</DialogTitle></DialogHeader>
        <p className="text-sm leading-6 text-muted-foreground">Запись исчезнет из журнала. Это действие нельзя отменить.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditEntry(null)}>Отмена</Button>
          <Button variant="destructive" onClick={async () => { const id = editEntry.id; await api.resource('journal').remove(id); setEditEntry(null); await entriesState.reload(); announce('Запись удалена'); }}>Удалить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div aria-live="polite" className={cn('pointer-events-none fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg transition-opacity', message ? 'opacity-100' : 'opacity-0')}><Check className="h-3.5 w-3.5 text-primary"/>{message}</div>
  </Page>;
}
