import * as React from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

function versionTitle(entityType, data = {}) {
  if (entityType === 'meetings') return data.title || 'Встреча';
  return data.title || data.name || 'Без названия';
}

export function VersionHistoryDialog({ open, onOpenChange, entityType, entityId, onRestored }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!open || !entityType || !entityId) return;
    setLoading(true); setError('');
    try { setItems(await api.get(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`)); }
    catch (e) { setError(e?.message || 'Не удалось загрузить историю версий'); }
    finally { setLoading(false); }
  }, [open, entityType, entityId]);

  React.useEffect(() => { load(); }, [load]);

  const restore = async (entry) => {
    if (!confirm(`Восстановить версию ${entry.version}? Текущее состояние будет сохранено в истории.`)) return;
    setBusy(`restore:${entry.version}`); setError('');
    try {
      const restored = await api.post(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${entry.version}/restore`, {});
      await onRestored?.(restored);
      await load();
    } catch (e) { setError(e?.message || 'Не удалось восстановить версию'); }
    finally { setBusy(null); }
  };

  const remove = async (entry) => {
    if (!confirm(`Удалить версию ${entry.version} из истории?`)) return;
    setBusy(`delete:${entry.version}`); setError('');
    try {
      await api.del(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${entry.version}`);
      await load();
    } catch (e) { setError(e?.status === 409 ? 'Текущую версию удалить нельзя' : (e?.message || 'Не удалось удалить версию')); }
    finally { setBusy(null); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-4 w-4"/>История версий</DialogTitle></DialogHeader>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {loading ? <div className="space-y-2">{[1,2,3].map((x)=><Skeleton key={x} className="h-24"/>)}</div> : items.length ? items.map((entry)=><div key={entry.version} className={`rounded-lg border p-3 ${entry.current?'bg-muted/35':''}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">Версия {entry.version}</strong>{entry.current&&<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">Текущая</span>}</div><div className="mt-1 text-sm">{entry.summary || 'Без описания изменений'}</div><div className="mt-1 truncate text-xs text-muted-foreground">{versionTitle(entityType, entry.data)}</div><div className="mt-1 text-[12px] text-muted-foreground">{entry.createdAt ? formatDate(entry.createdAt,{year:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}{entry.authorName ? ` · ${entry.authorName}` : ''}</div></div><div className="flex shrink-0 gap-1">{!entry.current&&<Button variant="ghost" size="icon-sm" aria-label={`Восстановить версию ${entry.version}`} disabled={Boolean(busy)} onClick={()=>restore(entry)}><RotateCcw className="h-3.5 w-3.5"/></Button>}{!entry.current&&<Button variant="ghost" size="icon-sm" aria-label={`Удалить версию ${entry.version}`} disabled={Boolean(busy)} onClick={()=>remove(entry)}><Trash2 className="h-3.5 w-3.5"/></Button>}</div></div>
        </div>) : <EmptyState title="История пока пуста" description="Версии появятся после изменений элемента."/>}
        {error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Закрыть</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
