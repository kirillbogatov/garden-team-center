import * as React from 'react';
import { goalTreeHtml } from '@/lib/goal-tree';
import { cn } from '@/lib/utils';

export function ProgressTree({ progress = 0, seed, compact = false, className, label = 'Прогресс' }) {
  const value = Math.max(0, Math.min(100, Number(progress) || 0));
  const html = React.useMemo(() => goalTreeHtml(value, compact ? 'compact' : 'regular', seed), [value, compact, seed]);
  return <div className={cn('garden-progress-tree', className)} aria-label={`${label} ${value}%`} dangerouslySetInnerHTML={{ __html: html }} />;
}
