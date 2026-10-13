import * as React from 'react';
import { BookOpen, ChevronDown, ChevronUp, GripVertical, Maximize2, Plus, Trash2 } from 'lucide-react';
import { Button, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { api } from '@/lib/api';

function makeDraft() {
  return { id:`draft-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, text:'', color:'yellow', canEdit:true, _draft:true };
}


function StickyNoteEditor({ value, onChange, onBlur, placeholder }) {
  const ref = React.useRef(null);
  const autoHeightRef = React.useRef(0);
  const widthRef = React.useRef(0);
  const manuallyResizedRef = React.useRef(false);

  const fitToContent = React.useCallback(() => {
    const node = ref.current;
    if (!node || manuallyResizedRef.current) return;
    node.style.height = 'auto';
    const nextHeight = Math.max(72, node.scrollHeight);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = 'hidden';
    const rect = node.getBoundingClientRect();
    autoHeightRef.current = rect.height;
    widthRef.current = rect.width;
  }, []);

  React.useLayoutEffect(() => {
    fitToContent();
  }, [value, fitToContent]);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!autoHeightRef.current || manuallyResizedRef.current) return;
      const rect = node.getBoundingClientRect();
      if (widthRef.current && Math.abs(rect.width - widthRef.current) > 2) {
        widthRef.current = rect.width;
        requestAnimationFrame(fitToContent);
        return;
      }
      if (Math.abs(rect.height - autoHeightRef.current) <= 2) return;
      manuallyResizedRef.current = true;
      node.style.overflowY = 'auto';
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fitToContent]);

  return <Textarea
    ref={ref}
    className="sticky-note-editor"
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    placeholder={placeholder}
    rows={1}
  />;
}

function formatRelative(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'только что';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} мин назад`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} ч назад`;
  return date.toLocaleDateString('ru-RU', { day:'2-digit', month:'short' }).replace('.', '');
}

export function StickyNotes({ entityType, entityId, notesPrefix = '', onCountChange, addButtonRef, legacyNotes = [], onLegacyMigrated }) {
  const [notes, setNotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [draggedId, setDraggedId] = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);
  const timers = React.useRef(new Map());
  const notesRef = React.useRef(notes);
  notesRef.current = notes;
  const baseUrl = `/api/comments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
  const orderKey = `garden:sticky-order:${entityType}:${entityId}`;

  const sortWithStoredOrder = React.useCallback((items) => {
    let order = [];
    try { order = JSON.parse(localStorage.getItem(orderKey) || '[]'); } catch (_) {}
    if (!Array.isArray(order) || !order.length) return items;
    const rank = new Map(order.map((id,index)=>[String(id), index]));
    return [...items].sort((a,b)=>{
      const ar = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
      const br = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
      return ar - br;
    });
  }, [orderKey]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(baseUrl).then(async (items) => {
      if (cancelled) return;
      let next = Array.isArray(items) ? items : [];
      const legacy = (Array.isArray(legacyNotes) ? legacyNotes : [])
        .map((item)=>typeof item === 'string' ? { text:item } : item)
        .filter((item)=>String(item?.text || '').trim());
      if (legacy.length) {
        const known = new Set(next.map((item)=>String(item.text || '').trim()));
        const migrated = [];
        for (const item of legacy) {
          const text = String(item.text || '').trim();
          if (known.has(text)) continue;
          const created = await api.post(baseUrl, { text, color:item.color || 'yellow' });
          known.add(text);
          migrated.push(created);
        }
        if (migrated.length) next = [...next, ...migrated];
        await onLegacyMigrated?.();
      }
      if (cancelled) return;
      next = sortWithStoredOrder(next);
      setNotes(next);
      onCountChange?.(next.length);
    }).finally(()=>{ if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, [baseUrl, sortWithStoredOrder]);

  const addDraft = React.useCallback(() => {
    setNotes((current) => current.some((item)=>item._draft && !item.text.trim()) ? current : [makeDraft(), ...current]);
  }, []);

  React.useEffect(() => {
    if (!addButtonRef) return;
    addButtonRef.current = addDraft;
    return () => { if (addButtonRef.current === addDraft) addButtonRef.current = null; };
  }, [addButtonRef, addDraft]);

  const saveNote = React.useCallback(async (id, immediateText) => {
    const item = notesRef.current.find((note)=>note.id===id);
    if (!item) return;
    const text = immediateText ?? item.text ?? '';
    if (item._draft && !text.trim()) return;
    setNotes((current)=>current.map((note)=>note.id===id ? {...note,_saveState:'saving'} : note));
    try {
      if (item._draft) {
        const created = await api.post(baseUrl, { text:text.trim(), color:item.color || 'yellow' });
        setNotes((current)=>current.map((note)=>note.id===id ? {...created,_saveState:'saved'} : note));
        onCountChange?.(notesRef.current.filter((note)=>!note._draft).length + 1);
      } else {
        const updated = await api.put(`/api/comments/${encodeURIComponent(item.id)}`, { text });
        setNotes((current)=>current.map((note)=>note.id===id ? {...note,...updated,_saveState:'saved'} : note));
      }
      setTimeout(()=>setNotes((current)=>current.map((note)=>note.id===id ? {...note,_saveState:''} : note)), 900);
    } catch (_) {
      setNotes((current)=>current.map((note)=>note.id===id ? {...note,_saveState:'error'} : note));
    }
  }, [baseUrl, onCountChange]);

  const updateText = (id, text) => {
    setNotes((current)=>current.map((note)=>note.id===id ? {...note,text} : note));
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(()=>saveNote(id, text), 550));
  };

  const flush = (id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const item = notesRef.current.find((note)=>note.id===id);
    if (item && (!item._draft || item.text.trim())) saveNote(id, item.text);
  };

  const remove = async (id) => {
    const item = notesRef.current.find((note)=>note.id===id);
    if (!item) return;
    if (!item._draft && !confirm('Удалить стикер?')) return;
    if (!item._draft) await api.del(`/api/comments/${encodeURIComponent(id)}`);
    setNotes((current)=>current.filter((note)=>note.id!==id));
    onCountChange?.(Math.max(0, notesRef.current.filter((note)=>!note._draft).length - (item._draft ? 0 : 1)));
    if (expandedId===id) setExpandedId(null);
  };

  const moveToNotes = async (id) => {
    const item = notesRef.current.find((note)=>note.id===id);
    const text = String(item?.text || '').trim();
    if (!item || !text) return;
    if (!confirm('Перенести стикер в Журнал? После переноса стикер будет удалён.')) return;
    const noteText = notesPrefix ? `${notesPrefix}: ${text}` : text;
    const created = await api.resource('journal').create({ text:noteText, createdAt:new Date().toISOString() });
    try {
      if (!item._draft) await api.del(`/api/comments/${encodeURIComponent(id)}`);
      setNotes((current)=>current.filter((note)=>note.id!==id));
      onCountChange?.(Math.max(0, notesRef.current.filter((note)=>!note._draft).length - (item._draft ? 0 : 1)));
      if (expandedId===id) setExpandedId(null);
    } catch (error) {
      if (created?.id) try { await api.resource('journal').remove(created.id); } catch (_) {}
      throw error;
    }
  };

  const persistOrder = (items) => {
    const ids = items.filter((item)=>!item._draft).map((item)=>String(item.id));
    try { localStorage.setItem(orderKey, JSON.stringify(ids)); } catch (_) {}
  };

  const moveNote = (id, delta) => {
    setNotes((current)=>{
      const from = current.findIndex((item)=>item.id===id);
      const to = from + delta;
      if (from<0 || to<0 || to>=current.length || current[to]._draft) return current;
      const next=[...current];
      const [moved]=next.splice(from,1);
      next.splice(to,0,moved);
      persistOrder(next);
      return next;
    });
  };

  const dropOn = (targetId) => {
    if (!draggedId || draggedId===targetId) return;
    setNotes((current)=>{
      const from = current.findIndex((item)=>item.id===draggedId);
      const to = current.findIndex((item)=>item.id===targetId);
      if (from<0 || to<0) return current;
      const next=[...current];
      const [moved]=next.splice(from,1);
      next.splice(to,0,moved);
      persistOrder(next);
      return next;
    });
    setDraggedId(null);
  };

  if (loading) return <div className="sticky-notes-loading">Загрузка…</div>;

  const expandedNote = notes.find((note)=>note.id===expandedId) || null;

  return <div className="sticky-notes-list">
    {notes.map((note)=><article
      key={note.id}
      className={`sticky-note-card sticky-note-color-${note.color || 'yellow'} ${note._draft?'is-draft':''} ${draggedId===note.id?'is-dragging':''}`}
      onDragOver={(event)=>event.preventDefault()}
      onDrop={()=>dropOn(note.id)}
    >
      <div className="sticky-note-corner-actions">
        {!note._draft && <button
          type="button"
          className="sticky-note-drag-handle"
          draggable
          onDragStart={(event)=>{ setDraggedId(note.id); event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain', String(note.id)); }}
          onDragEnd={()=>setDraggedId(null)}
          title="Перетащить стикер"
          aria-label="Перетащить стикер"
        ><GripVertical className="h-3.5 w-3.5"/></button>}
        {!note._draft && notes.length > 1 && <>
          <button type="button" className="sticky-note-expand" onClick={()=>moveNote(note.id,-1)} title="Сдвинуть стикер выше" aria-label="Сдвинуть стикер выше"><ChevronUp className="h-3.5 w-3.5"/></button>
          <button type="button" className="sticky-note-expand" onClick={()=>moveNote(note.id,1)} title="Сдвинуть стикер ниже" aria-label="Сдвинуть стикер ниже"><ChevronDown className="h-3.5 w-3.5"/></button>
        </>}
        <button type="button" className="sticky-note-expand" onClick={()=>setExpandedId(note.id)} title="Развернуть на весь экран" aria-label="Развернуть на весь экран"><Maximize2 className="h-3.5 w-3.5"/></button>
        <button type="button" className="sticky-note-delete" onClick={()=>remove(note.id)} title="Удалить стикер" aria-label="Удалить стикер"><Trash2 className="h-3.5 w-3.5"/></button>
      </div>
      <StickyNoteEditor value={note.text || ''} onChange={(event)=>updateText(note.id,event.target.value)} onBlur={()=>flush(note.id)} placeholder="Напишите стикер…"/>
      <div className="sticky-note-footer">
        <span className="sticky-note-save-state">{note._saveState==='saving'?'Сохраняю…':note._saveState==='saved'?'Сохранено':note._saveState==='error'?'Не сохранено':note._draft?'':formatRelative(note.updatedAt || note.createdAt)}</span>
        <button type="button" className="sticky-note-notes" onClick={()=>moveToNotes(note.id)} disabled={!String(note.text||'').trim()}><BookOpen className="h-3.5 w-3.5"/><span>Перенести в журнал</span></button>
      </div>
    </article>)}
    {!notes.length && <button type="button" className="sticky-notes-empty" onClick={addDraft}><Plus className="h-4 w-4"/>Добавить первый стикер</button>}

    <Dialog open={!!expandedNote} onOpenChange={(open)=>{ if (!open) { if (expandedId) flush(expandedId); setExpandedId(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Редактировать заметку</DialogTitle></DialogHeader>
        {expandedNote && <Textarea
          className="sticky-note-expand-editor"
          value={expandedNote.text || ''}
          onChange={(event)=>updateText(expandedNote.id, event.target.value)}
          placeholder="Напишите стикер…"
          autoFocus
        />}
      </DialogContent>
    </Dialog>
  </div>;
}
