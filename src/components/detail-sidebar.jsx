import * as React from 'react';
import { createPortal } from 'react-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export function useDetailSidebarState(storageKey, defaultOpen = true) {
  const [initialStored] = React.useState(() => {
    try { return localStorage.getItem(storageKey); } catch (_) { return null; }
  });
  const [open, setOpen] = React.useState(() => {
    if (initialStored === 'closed') return false;
    if (initialStored === 'open') return true;
    return defaultOpen;
  });

  const setPersistedOpen = React.useCallback((next) => {
    setOpen((current) => {
      const value = typeof next === 'function' ? next(current) : Boolean(next);
      try { localStorage.setItem(storageKey, value ? 'open' : 'closed'); } catch {}
      return value;
    });
  }, [storageKey]);

  return [open, setPersistedOpen, initialStored == null];
}

export function DetailSidebarToggle({ open, onOpenChange, title, showLabel, hideLabel, className }) {
  const showText = showLabel || `Показать ${String(title || 'сайдбар').toLocaleLowerCase('ru')}`;
  const hideText = hideLabel || 'Скрыть сайдбар';
  const label = open ? hideText : showText;
  return <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn('detail-sidebar-top-toggle', open && 'is-open', className)}
    onClick={() => onOpenChange(!open)}
    aria-label={label}
    title={label}
    aria-pressed={open}
  >
    {open ? <PanelRightClose className="h-4 w-4"/> : <PanelRightOpen className="h-4 w-4"/>}
  </Button>;
}

export function DetailSidebar({ open, onOpenChange, title, children, className, showLabel, hideLabel, headerActions = null, count = 0, showEdgeToggle = true }) {
  const showText = showLabel || `Показать ${String(title || 'сайдбар').toLocaleLowerCase('ru')}`;
  const hideText = hideLabel || 'Скрыть сайдбар';
  const sidebar = <>
    {showEdgeToggle && !open && <Button variant="ghost" size="icon" className="detail-sidebar-edge-toggle" onClick={() => onOpenChange(true)} aria-label={count ? `${showText} (${count})` : showText} title={showText}><PanelRightOpen className="h-4 w-4"/></Button>}
    <aside className={cn('detail-sidebar-drawer', open && 'is-open', className)} aria-hidden={!open}>
      <div className="detail-sidebar-header">
        <div className="detail-sidebar-title">{title}</div>
        {headerActions && <div className="detail-sidebar-header-actions">{headerActions}</div>}
      </div>
      <div className="detail-sidebar-scroll">{children}</div>
    </aside>
  </>;
  return typeof document === 'undefined' ? sidebar : createPortal(sidebar, document.body);
}

export function DetailSidebarSection({ title, children, className }) {
  return <section className={cn('detail-sidebar-section', className)}>
    {title && <div className="detail-sidebar-section-title">{title}</div>}
    {children}
  </section>;
}
