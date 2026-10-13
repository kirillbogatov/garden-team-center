import * as React from 'react';
import { RotateCcw } from 'lucide-react';

const pill = 'flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-muted disabled:opacity-50';

// Постоянная пометка «это демо» и сброс к исходным данным. Живёт в отдельном
// React-корне, чтобы не вмешиваться в оболочку приложения.
export function DemoBadge({ onReset }) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const reset = () => {
    setBusy(true);
    onReset();
  };
  return <div
    role="status"
    className="fixed bottom-3 right-3 z-[90] flex items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 text-[12px] text-muted-foreground shadow-sm backdrop-blur"
  >
    {confirming
      ? <>
        <span>Удалить все ваши правки?</span>
        <button type="button" onClick={reset} disabled={busy} className={`${pill} text-destructive`}>Сбросить</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${pill} text-foreground`}>Отмена</button>
      </>
      : <>
        <span>Демо-версия</span>
        <button type="button" onClick={() => setConfirming(true)} className={`${pill} text-foreground`}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8}/>Сбросить
        </button>
      </>}
  </div>;
}
