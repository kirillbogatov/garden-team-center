import * as React from 'react';
import { cn } from '@/lib/utils';

export function SectionHeader({ title, description, actions, className, compact = false, as: Tag = 'div' }) {
  if (!title && !description && !actions) return null;
  return <Tag className={cn('ui-section-header', compact && 'is-compact', className)}>
    <div className="ui-section-header-copy">
      {title && <h2 className="ui-section-header-title">{title}</h2>}
      {description && <p className="ui-section-header-description">{description}</p>}
    </div>
    {actions && <div className="ui-section-header-actions">{actions}</div>}
  </Tag>;
}

export function Tabs({ items, value, onValueChange, ariaLabel, className, tabClassName }) {
  return <div className={cn('ui-tabs', className)} role="tablist" aria-label={ariaLabel}>
    {items.map((item) => {
      const tabValue = item.value ?? item[0];
      const label = item.label ?? item[1];
      const count = item.count ?? item[2];
      const active = value === tabValue;
      return <button
        key={tabValue}
        type="button"
        role="tab"
        aria-selected={active}
        className={cn('ui-tab', active && 'is-active', tabClassName)}
        onClick={() => onValueChange(tabValue)}
      >
        <span>{label}</span>
        {Number(count) > 0 && <span className={cn('ui-tab-count', item.tone === 'warning' && 'is-warning')}>{count}</span>}
      </button>;
    })}
  </div>;
}
