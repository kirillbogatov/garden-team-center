import * as React from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import { MentionEditor } from '@/components/mention-editor';
import { MarkdownText } from '@/components/markdown';
import { api } from '@/lib/api';

export function EditableComments({ comments = [], onChanged, people = [], projects = [], onNavigateMention }) {
  const [editingId, setEditingId] = React.useState(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const begin = (comment) => { setEditingId(comment.id); setText(comment.text || ''); };
  const cancel = () => { setEditingId(null); setText(''); };
  const save = async (comment) => {
    const next = text.trim(); if (!next) return;
    setBusy(true); try { await api.put(`/api/comments/${encodeURIComponent(comment.id)}`, { text: next }); cancel(); await onChanged?.(); } finally { setBusy(false); }
  };
  const remove = async (comment) => {
    if (!confirm('Удалить комментарий?')) return;
    setBusy(true); try { await api.del(`/api/comments/${encodeURIComponent(comment.id)}`); if (editingId===comment.id) cancel(); await onChanged?.(); } finally { setBusy(false); }
  };

  return <div className="space-y-4">{comments.map((comment)=><div key={comment.id} className="flex gap-3"><Avatar person={{name:comment.authorDisplayName}} size="sm"/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="text-xs font-medium">{comment.authorDisplayName}</div>{comment.canEdit&&<div className="flex gap-1">{editingId===comment.id?<><Button type="button" variant="ghost" size="icon-sm" onClick={()=>save(comment)} disabled={busy||!text.trim()} aria-label="Сохранить комментарий"><Check className="h-3.5 w-3.5"/></Button><Button type="button" variant="ghost" size="icon-sm" onClick={cancel} disabled={busy} aria-label="Отменить редактирование"><X className="h-3.5 w-3.5"/></Button></>:<><Button type="button" variant="ghost" size="icon-sm" onClick={()=>begin(comment)} disabled={busy} aria-label="Редактировать комментарий"><Pencil className="h-3.5 w-3.5"/></Button><Button type="button" variant="ghost" size="icon-sm" onClick={()=>remove(comment)} disabled={busy} aria-label="Удалить комментарий"><Trash2 className="h-3.5 w-3.5"/></Button></>}</div>}</div>{editingId===comment.id?<MentionEditor className="mt-1" editorClassName="min-h-[72px]" value={text} onChange={setText} people={people} projects={projects} autoFocus ariaLabel="Комментарий"/>:<MarkdownText className="mt-1 text-sm leading-6" text={comment.text} onNavigate={onNavigateMention}/>}</div></div>)}</div>;
}
