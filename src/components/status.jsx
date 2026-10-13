import * as React from 'react';
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui';
import { CheckCircle2, ChevronDown, CircleHelp, Lightbulb, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntityStatus } from '@/hooks/use-entity-status';
import {
  AGREEMENT_STATUS_LABEL, GOAL_STATUS_LABEL, ISSUE_STATUS_LABEL, PERSON_STATUS_LABEL,
  PROCESS_STATUS_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, TASK_STATUS_OPTIONS, LAB_STATUS_LABEL, IDEA_STATUS_LABEL,
} from '@/lib/domain';

const variantMap = {
  task: { todo: 'muted', in_progress: 'default', in_review: 'warning', paused: 'secondary', blocked: 'danger', done: 'success', archived: 'muted' },
  project: { active: 'success', paused: 'warning', done: 'muted', archived: 'muted' },
  person: { active: 'success', on_leave: 'warning', dismissed: 'muted', transferred: 'secondary' },
  issue: { open: 'warning', in_progress: 'default', paused: 'secondary', resolved: 'success' },
  process: { ok: 'success', attention: 'warning', broken: 'danger' },
  goal: { active: 'default', done: 'success', paused: 'warning' },
  agreement: { open: 'warning', done: 'success' },
  lab: { idea: 'muted', in_progress: 'default', paused: 'warning', done: 'success' },
  idea: { idea: 'muted', in_progress: 'default', paused: 'warning', done: 'success', rejected: 'danger' },
};

const labelsByKind = {
  task: { ...TASK_STATUS_LABEL, archived: 'Архив' },
  project: { ...PROJECT_STATUS_LABEL, archived: 'Архив' },
  person: PERSON_STATUS_LABEL,
  issue: ISSUE_STATUS_LABEL,
  process: PROCESS_STATUS_LABEL,
  goal: GOAL_STATUS_LABEL,
  agreement: AGREEMENT_STATUS_LABEL,
  lab: LAB_STATUS_LABEL,
  idea: IDEA_STATUS_LABEL,
  generic: {
    open: 'Открыто', closed: 'Закрыто', active: 'Активно', draft: 'Черновик', idea: 'Идея',
    in_progress: 'В работе', paused: 'На паузе', done: 'Готово', resolved: 'Решено',
    ok: 'Работает', attention: 'Есть проблемы', broken: 'Сломан',
  },
};

const TASK_STATUS_SYMBOL = {
  todo: '',
  in_progress: '◐',
  in_review: '◎',
  paused: 'Ⅱ',
  blocked: '×',
  done: '✓',
};

export function StatusBadge({ value, kind = 'generic', className }) {
  const labels = labelsByKind[kind] || labelsByKind.generic;
  const label = labels[value] || labelsByKind.generic[value] || value || 'Без статуса';
  const variant = variantMap[kind]?.[value]
    || ({ open: 'warning', active: 'success', in_progress: 'default', paused: 'warning', done: 'success', resolved: 'success', ok: 'success', attention: 'warning', broken: 'danger' }[value])
    || 'muted';
  return <Badge variant={variant} className={className}>{label}</Badge>;
}

export function TaskStatusGlyph({ status = 'todo', className }) {
  const value = TASK_STATUS_LABEL[status] ? status : 'todo';
  return <span aria-hidden="true" className={cn('task-status-glyph', `task-status-glyph-${value}`, className)}>{TASK_STATUS_SYMBOL[value] ?? '○'}</span>;
}

export function IdeaStatusGlyph({ status = 'idea', className }) {
  if (status === 'idea') return <span aria-hidden="true" className={cn('task-status-glyph', 'idea-status-glyph-idea', className)}><Lightbulb className="h-[15px] w-[15px]" strokeWidth={1.7}/></span>;
  if (status === 'rejected') return <span aria-hidden="true" className={cn('task-status-glyph', 'idea-status-glyph-rejected', className)}>×</span>;
  return <TaskStatusGlyph status={status} className={className} />;
}

function StatusControl({ resource, id, status, validValues, fallback, glyphFor, labelFor, options, onStatusChange, onChanged, disabled, className, menuClassName = 'min-w-52', showLabel = false }) {
  const { current, busy, interactive, changeStatus } = useEntityStatus({ resource, id, status, validValues, fallback, onStatusChange, onChanged, disabled });
  const label = labelFor(current);

  if (!interactive) {
    if (showLabel) return <span className={cn('task-status-label-control is-static', className)}>{label}</span>;
    return <span className={cn('task-status-control task-status-control-static', className)} title={label} aria-label={label}>{glyphFor(current)}</span>;
  }

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn(showLabel ? 'task-status-label-control' : 'task-status-control', busy && 'opacity-60', className)}
        aria-label={`Изменить статус: ${label}`}
        title={showLabel ? undefined : label}
        disabled={busy}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {showLabel ? <>{label}<ChevronDown className="task-status-label-chevron h-4 w-4 text-muted-foreground"/></> : glyphFor(current)}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={menuClassName} onClick={(event) => event.stopPropagation()}>
      {options.map((value) => <DropdownMenuItem key={value} onSelect={() => changeStatus(value)} className="grid grid-cols-[24px_minmax(0,1fr)_18px] gap-2">
        {glyphFor(value)}
        <span>{labelFor(value)}</span>
        <span className="text-center text-xs text-muted-foreground">{value === current ? '✓' : ''}</span>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/**
 * Garden-style task status control. The glyph is intentionally the only visible
 * status representation; clicking the glyph opens the complete status menu.
 */
export function TaskStatusIcon({ task, taskId, status, onStatusChange, onChanged, disabled = false, className, showLabel = false }) {
  const id = taskId || task?.id;
  const incoming = status || task?.status || 'todo';
  return <StatusControl
    resource="tasks" id={id} status={incoming} fallback="todo"
    validValues={Object.keys(TASK_STATUS_LABEL)}
    options={TASK_STATUS_OPTIONS.map((item) => item.value)}
    glyphFor={(value) => <TaskStatusGlyph status={value} />}
    labelFor={(value) => TASK_STATUS_LABEL[value] || value}
    onStatusChange={onStatusChange} onChanged={onChanged} disabled={disabled} className={className} showLabel={showLabel}
  />;
}

export function IdeaStatusIcon({ lab, labId, status, onChanged, disabled = false, className }) {
  const id = labId || lab?.id;
  const incoming = status || lab?.status || 'idea';
  return <StatusControl
    resource="labs" id={id} status={incoming} fallback="idea"
    validValues={Object.keys(IDEA_STATUS_LABEL)}
    options={Object.keys(IDEA_STATUS_LABEL)}
    glyphFor={(value) => <IdeaStatusGlyph status={value} />}
    labelFor={(value) => IDEA_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

export function LabStatusIcon({ lab, labId, status, onChanged, disabled = false, className, showLabel = false }) {
  const id = labId || lab?.id;
  const incoming = status || lab?.status || 'idea';
  return <StatusControl
    resource="labs" id={id} status={incoming} fallback="idea"
    validValues={Object.keys(LAB_STATUS_LABEL)}
    options={Object.keys(LAB_STATUS_LABEL)}
    glyphFor={(value) => <IdeaStatusGlyph status={value} />}
    labelFor={(value) => LAB_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48" showLabel={showLabel}
  />;
}

const ISSUE_TO_TASK_STATUS = { open: 'todo', in_progress: 'in_progress', paused: 'paused', resolved: 'done' };
const ISSUE_STATUS_ORDER = ['open', 'in_progress', 'paused', 'resolved'];

export function IssueStatusIcon({ issue, issueId, status, onChanged, disabled = false, className }) {
  const id = issueId || issue?.id;
  const incoming = status || issue?.status || 'open';
  return <StatusControl
    resource="issues" id={id} status={incoming} fallback="open"
    validValues={Object.keys(ISSUE_STATUS_LABEL)}
    options={ISSUE_STATUS_ORDER}
    glyphFor={(value) => <TaskStatusGlyph status={ISSUE_TO_TASK_STATUS[value] || 'todo'} />}
    labelFor={(value) => ISSUE_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

const PROCESS_STATUS_ORDER = ['ok', 'attention', 'broken'];
const PROCESS_STATUS_SYMBOL = { ok: '✓', attention: '!', broken: '×' };

/**
 * "attention" gets its own exclamation glyph rather than borrowing the task
 * "paused" symbol (Ⅱ) - a process with problems isn't paused, it's flagged.
 */
export function ProcessStatusGlyph({ status = 'ok', className }) {
  const value = PROCESS_STATUS_LABEL[status] ? status : 'ok';
  return <span aria-hidden="true" className={cn('task-status-glyph', `process-status-glyph-${value}`, className)}>{PROCESS_STATUS_SYMBOL[value] ?? '○'}</span>;
}

export function ProcessStatusIcon({ process, processId, status, onChanged, disabled = false, className }) {
  const id = processId || process?.id;
  const incoming = status || process?.status || 'ok';
  return <StatusControl
    resource="processes" id={id} status={incoming} fallback="ok"
    validValues={Object.keys(PROCESS_STATUS_LABEL)}
    options={PROCESS_STATUS_ORDER}
    glyphFor={(value) => <ProcessStatusGlyph status={value} />}
    labelFor={(value) => PROCESS_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

const PROJECT_TO_TASK_STATUS = { active: 'in_progress', paused: 'paused', done: 'done' };

export function ProjectStatusIcon({ project, projectId, status, onChanged, disabled = false, className, showLabel = false }) {
  const id = projectId || project?.id;
  const incoming = status || project?.status || 'active';
  return <StatusControl
    resource="projects" id={id} status={incoming} fallback="active"
    validValues={Object.keys(PROJECT_STATUS_LABEL)}
    options={Object.keys(PROJECT_STATUS_LABEL)}
    glyphFor={(value) => <TaskStatusGlyph status={PROJECT_TO_TASK_STATUS[value] || 'todo'} />}
    labelFor={(value) => PROJECT_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48" showLabel={showLabel}
  />;
}

export function AgreementStatusIcon({ agreement, agreementId, status, onChanged, disabled = false, className }) {
  const id = agreementId || agreement?.id;
  const incoming = (status || agreement?.status) === 'done' ? 'done' : 'open';
  return <StatusControl
    resource="agreements" id={id} status={incoming} fallback="open"
    validValues={['open', 'done']}
    options={['open', 'done']}
    glyphFor={(value) => <TaskStatusGlyph status={value === 'done' ? 'done' : 'todo'} />}
    labelFor={(value) => AGREEMENT_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-44"
  />;
}

export function AgreementStatusCheckbox({ agreement, agreementId, status, onChanged, disabled = false, className }) {
  const id = agreementId || agreement?.id;
  const incoming = (status || agreement?.status) === 'done' ? 'done' : 'open';
  const { current, busy, changeStatus } = useEntityStatus({ resource: 'agreements', id, status: incoming, fallback: 'open', validValues: ['open', 'done'], onChanged, disabled });
  const checked = current === 'done';
  const toggle = async (event) => {
    event.stopPropagation();
    if (disabled || !id || busy) return;
    await changeStatus(checked ? 'open' : 'done');
  };
  return <label className={cn('agreement-status-check', busy && 'opacity-60', className)} title={checked ? 'Выполнено' : 'Отметить выполненной'} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
    <input type="checkbox" checked={checked} onChange={toggle} disabled={disabled || !id || busy} aria-label={checked ? 'Выполнено' : 'Отметить выполненной'} />
  </label>;
}



export const SOLUTION_STATUS_LABEL = {
  effective: 'Эффективно',
  ineffective: 'Неэффективно',
  untested: 'Не проверялось',
};

const SOLUTION_STATUS_OPTIONS = ['effective', 'ineffective', 'untested'];
const SOLUTION_STATUS_ICON = {
  effective: CheckCircle2,
  ineffective: XCircle,
  untested: CircleHelp,
};

/**
 * Compact icon-only status used for issue solution options. The visible row
 * stays quiet; the complete label is exposed in tooltip/title and dropdown.
 */
export function SolutionStatusIcon({ value = 'untested', onChange, disabled = false, className }) {
  const current = SOLUTION_STATUS_LABEL[value] ? value : 'untested';
  const CurrentIcon = SOLUTION_STATUS_ICON[current];
  const label = SOLUTION_STATUS_LABEL[current];
  const trigger = <button
    type="button"
    className={cn('solution-status-control', `solution-status-${current}`, className)}
    aria-label={`Статус варианта решения: ${label}`}
    title={label}
    disabled={disabled}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
  ><CurrentIcon className="h-4 w-4"/></button>;

  if (disabled || typeof onChange !== 'function') return <span className={cn('solution-status-control solution-status-static', `solution-status-${current}`, className)} title={label} aria-label={label}><CurrentIcon className="h-4 w-4"/></span>;

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-48" onClick={(event)=>event.stopPropagation()}>
      {SOLUTION_STATUS_OPTIONS.map((status) => {
        const Icon = SOLUTION_STATUS_ICON[status];
        return <DropdownMenuItem key={status} onSelect={()=>onChange(status)} className="grid grid-cols-[24px_minmax(0,1fr)_18px] gap-2">
          <span className={cn('solution-status-menu-icon', `solution-status-${status}`)}><Icon className="h-4 w-4"/></span>
          <span>{SOLUTION_STATUS_LABEL[status]}</span>
          <span className="text-center text-xs text-muted-foreground">{status===current?'✓':''}</span>
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export { TASK_STATUS_OPTIONS };
