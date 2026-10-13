import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { ViewModeToggle, CompactSearchControl } from '@/components/view-mode-toggle';
import { cn } from '@/lib/utils';

export function CatalogToolbar({ query, onQueryChange, placeholder = 'Поиск', children, viewMode, onViewModeChange, viewModes, viewAriaLabel, className }) {
  const hasViewSwitch = Boolean(viewMode && onViewModeChange);
  return <div className={cn('catalog-toolbar', hasViewSwitch && 'has-view-switch', className)} data-filter-bar="true">
    {!hasViewSwitch && <div className="catalog-toolbar-search relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query ?? ''} onChange={(event)=>onQueryChange?.(event.target.value)} placeholder={placeholder} className="pl-9"/></div>}
    <div className="catalog-toolbar-controls">
      {children}
      {hasViewSwitch && <>
        <CompactSearchControl value={query ?? ''} onChange={onQueryChange} placeholder={placeholder}/>
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={viewModes} ariaLabel={viewAriaLabel}/>
      </>}
    </div>
  </div>;
}

export function CatalogList({ children, className }) {
  return <div className={cn('catalog-list entity-list', className)}>{children}</div>;
}

export function CatalogRow({ leading, title, meta, trailing, onClick, className, children }) {
  const Comp = onClick ? 'button' : 'div';
  return <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={cn('catalog-row entity-row', onClick && 'is-clickable', className)}>
    {leading && <div className="catalog-row-leading">{leading}</div>}
    <div className="catalog-row-main">
      {title != null && <div className="catalog-row-title">{title}</div>}
      {meta != null && <div className="catalog-row-meta">{meta}</div>}
      {children}
    </div>
    {trailing && <div className="catalog-row-trailing">{trailing}</div>}
  </Comp>;
}

export function CatalogCardGrid({ children, className }) {
  return <div className={cn('catalog-card-grid entity-card-grid', className)}>{children}</div>;
}

export function CatalogCard({ children, onClick, className, ...props }) {
  const Comp = onClick ? 'button' : 'div';
  return <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={cn('catalog-card entity-card', onClick && 'is-clickable', className)} {...props}>{children}</Comp>;
}
