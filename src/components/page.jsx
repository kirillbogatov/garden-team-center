import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/patterns';

export function Page({ children, narrow = false, className }) {
  return <div className={cn('page-container', narrow && 'narrow', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, actions, children }) {
  return <header className="page-header mb-7 flex flex-col gap-3.5 md:flex-row md:items-start md:justify-between">
    <div className="min-w-0">
      {eyebrow && <div className="page-header-context">{eyebrow}</div>}
      <h1 className="text-balance text-[32px] font-medium leading-[1.2] tracking-[-0.02em]">{title}</h1>
      {children}
    </div>
    {actions && <div className="page-header-actions flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
  </header>;
}

export function Section({ title, description, actions, children, className }) {
  return <section className={cn('page-section', className)}>
    <SectionHeader title={title} description={description} actions={actions}/>
    {children}
  </section>;
}


export function DetailHeader({ title, description, meta }) {
  return <header className="entity-detail-header">
    <h1 className="entity-detail-title">{title}</h1>
    {description && <div className="entity-detail-description">{description}</div>}
    {meta && <div className="entity-detail-meta">{meta}</div>}
  </header>;
}

export function DetailLayout({ children, aside }) {
  return <div className="entity-detail-layout"><div className="entity-detail-main">{children}</div>{aside && <aside className="entity-detail-aside">{aside}</aside>}</div>;
}

export function DetailAsideField({ label, children }) {
  if (children === undefined || children === null || children === '') return null;
  return <div className="entity-detail-aside-field"><div className="entity-detail-aside-label">{label}</div><div className="entity-detail-aside-value">{children}</div></div>;
}
