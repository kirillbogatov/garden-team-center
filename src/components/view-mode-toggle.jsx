import * as React from 'react';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

function readStoredViewMode(storageKey, defaultMode) {
  if (typeof window === 'undefined') return defaultMode;
  try {
    const saved = window.localStorage.getItem(`garden:view:${storageKey}`);
    return saved === 'list' || saved === 'cards' ? saved : defaultMode;
  } catch {
    return defaultMode;
  }
}

export function useViewMode(storageKey, defaultMode = 'cards') {
  const [state, setState] = React.useState(() => ({
    storageKey,
    mode: readStoredViewMode(storageKey, defaultMode),
  }));

  // Resource catalog pages can reuse the same React component while only the
  // route/resource changes. Never carry the previous page's view into the next
  // one: resolve the new page's own persisted mode immediately.
  const mode = state.storageKey === storageKey
    ? state.mode
    : readStoredViewMode(storageKey, defaultMode);

  React.useEffect(() => {
    if (state.storageKey === storageKey) return;
    setState({ storageKey, mode: readStoredViewMode(storageKey, defaultMode) });
  }, [storageKey, defaultMode, state.storageKey]);

  const update = React.useCallback((next) => {
    if (next !== 'list' && next !== 'cards') return;
    setState({ storageKey, mode: next });
    try { window.localStorage.setItem(`garden:view:${storageKey}`, next); } catch {}
  }, [storageKey]);

  return [mode, update];
}

const DEFAULT_MODES = [
  { value: 'cards', label: 'Карточки', icon: LayoutGrid },
  { value: 'list', label: 'Список', icon: List },
];

export function ViewModeToggle({ value, onChange, className, modes = DEFAULT_MODES, ariaLabel = 'Вид данных' }) {
  return <div className={cn('view-mode-toggle inline-flex shrink-0 items-center', className)} role="group" aria-label={ariaLabel}>
    {modes.map((mode) => {
      const Icon = mode.icon;
      const active = value === mode.value;
      return <button key={mode.value} type="button" onClick={() => onChange(mode.value)} aria-label={mode.label} aria-pressed={active} title={mode.label} className={cn('view-mode-button ui-focus-ring grid h-8 w-8 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:text-foreground', active && 'is-active')}>
        <Icon className="h-4 w-4"/>
      </button>;
    })}
  </div>;
}

export function CompactSearchControl({ value = '', onChange, placeholder = 'Поиск', className, open: controlledOpen, onOpenChange }) {
  const [internalOpen, setInternalOpen] = React.useState(Boolean(value));
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback((next) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  }, [onOpenChange]);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (value && !open) setOpen(true);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const toggle = () => {
    if (open && value) {
      inputRef.current?.focus();
      return;
    }
    setOpen(!open);
  };

  return <div className={cn('compact-search-control', open && 'is-open', className)}>
    <div className={cn('compact-search-field', open && 'is-open')}>
      <Input ref={inputRef} value={value} onChange={(event)=>onChange?.(event.target.value)} placeholder={placeholder}/>
      {value && <button type="button" className="compact-search-clear ui-focus-ring" aria-label="Очистить поиск" onClick={()=>onChange?.('')}><X className="h-3.5 w-3.5"/></button>}
    </div>
    <button type="button" className={cn('compact-search-button ui-focus-ring', open && 'is-active')} aria-label={open ? 'Поиск открыт' : placeholder} title={placeholder} onClick={toggle}><Search className="h-4 w-4"/></button>
  </div>;
}
