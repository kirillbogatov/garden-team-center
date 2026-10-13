import * as React from 'react';
import { Avatar, Badge } from '@/components/ui';
import { TaskStatusIcon } from '@/components/status';
import { TASK_TYPE_LABEL } from '@/lib/domain';
import { cn, formatEventDate, isOverdue } from '@/lib/utils';
import { MentionText } from '@/components/mention-editor';

export function EntityRow({ leading, title, meta = [], trailing, onOpen, className, titleClassName, ariaLabel }) {
  const values = (Array.isArray(meta) ? meta : [meta]).filter((value) => value !== null && value !== undefined && value !== '');
  return <div
    role={onOpen ? 'link' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    onClick={onOpen}
    onKeyDown={onOpen ? (event)=>{ if (event.key === 'Enter') { event.preventDefault(); onOpen(); } } : undefined}
    aria-label={ariaLabel}
    className={cn('unified-entity-row', onOpen && 'is-clickable', className)}
  >
    {leading != null && <div className="unified-entity-row-leading" onClick={(event)=>event.stopPropagation()}>{leading}</div>}
    <div className={cn('unified-entity-row-title', titleClassName)}>{title}</div>
    {values.length > 0 && <div className="unified-entity-row-meta">{values.map((value,index)=><React.Fragment key={index}>{index > 0 && <span className="unified-entity-row-dot">·</span>}<span>{value}</span></React.Fragment>)}</div>}
    {trailing != null && <div className="unified-entity-row-trailing" onClick={(event)=>event.stopPropagation()}>{trailing}</div>}
  </div>;
}

export function TaskPriorityIcon({ priority = 'normal', className }) {
  const normalized = priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal';
  const activeBars = normalized === 'high' ? 3 : normalized === 'low' ? 1 : 2;
  const label = normalized === 'high' ? 'Высокий приоритет' : normalized === 'low' ? 'Низкий приоритет' : 'Обычный приоритет';
  return <span className={cn('task-linear-priority', `is-${normalized}`, className)} role="img" aria-label={label} title={label}>
    {[1,2,3].map((bar) => <span key={bar} className={cn('task-linear-priority-bar', bar <= activeBars && 'is-active')} />)}
  </span>;
}

export function overdueTaskDueLabel(value) {
  const key = String(value || '').slice(0, 10);
  if (!key) return '';
  const due = new Date(`${key}T00:00:00`);
  if (Number.isNaN(due.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - due.getTime()) / 86400000);
  return days > 0 ? `${days} дн. назад` : '';
}

export function TaskEntityRow({ task, onOpen, onStatusChanged, person, project, projectName: projectNameProp, assigneeName: assigneeNameProp, assigneePerson: assigneePersonProp, dueLabel: dueLabelProp, overdue: overdueProp, hideProject = false, className }) {
  const resolvedAssignee = assigneePersonProp ?? (task.assigneeIds?.length && person ? person(task.assigneeIds[0]) : null);
  const fallbackAssignee = !resolvedAssignee && assigneeNameProp ? { name: assigneeNameProp } : null;
  const assignee = resolvedAssignee || fallbackAssignee;
  const projectName = projectNameProp ?? (project ? project(task.projectId)?.name : '') ?? '';
  const effectiveProject = projectName || (task.taskType === 'development' ? TASK_TYPE_LABEL.development : '');
  const overdue = overdueProp ?? isOverdue(task.dueDate, task.status);
  const overdueDue = overdue && task.dueDate ? overdueTaskDueLabel(task.dueDate) : '';
  const rawDue = overdueDue || (dueLabelProp != null ? dueLabelProp : (task.dueDate ? formatEventDate(task.dueDate) : ''));
  const due = rawDue === 'Без срока' ? '' : rawDue;
  const statusControl = <TaskStatusIcon task={task.id ? task : undefined} taskId={task.id || task.entityId} status={task.status || 'todo'} onChanged={onStatusChanged} className="things-task-status"/>;
  return <EntityRow
    className={cn('task-entity-row', className)}
    onOpen={onOpen}
    leading={statusControl}
    title={<span className="flex min-w-0 items-center gap-2"><TaskPriorityIcon priority={task.priority}/><span className="min-w-0 truncate"><MentionText text={task.title || 'Без названия'} className="task-title-mention-text"/></span></span>}
    meta={[
      due ? <span className={overdue ? 'is-overdue' : ''}>{due}</span> : null,
      hideProject ? null : (effectiveProject || null),
    ]}
    trailing={assignee ? <span title={assignee.name || assigneeNameProp || 'Исполнитель'}><Avatar person={assignee} size="xs"/></span> : null}
  />;
}

export function MeetingEntityRow({ typeLabel, title, projectName, dateLabel, missed, participants = [], onOpen, className }) {
  return <EntityRow
    className={cn('meeting-entity-row', className)}
    onOpen={onOpen}
    leading={<span className="meeting-entity-row-date">{dateLabel}</span>}
    title={<span className="truncate">{title || 'Без названия'}</span>}
    meta={[<Badge key="type" variant="muted">{typeLabel || 'Другое'}</Badge>, projectName || null, missed ? <span className="text-amber-700 dark:text-amber-300">нет итогов</span> : null]}
    trailing={participants.length ? <div className="flex -space-x-1.5">{participants.slice(0,5).map((item)=><span key={item.id} className="contents">{item.avatar}</span>)}</div> : null}
  />;
}
