import * as React from 'react';
import { MentionEditor } from '@/components/mention-editor';
import { MarkdownText } from '@/components/markdown';
import { cn } from '@/lib/utils';

export function EditableMarkdownDescription({
  value = '',
  onChange,
  onSave,
  people = [],
  projects = [],
  placeholder = 'Добавить описание…',
  className,
  editorClassName,
  onNavigate,
  ariaLabel = 'Описание',
}) {
  const [editing, setEditing] = React.useState(false);
  const editStartValueRef = React.useRef(String(value || ''));

  const beginEdit = React.useCallback(() => {
    editStartValueRef.current = String(value || '');
    setEditing(true);
  }, [value]);

  const save = React.useCallback(async (nextValue) => {
    setEditing(false);
    const normalized = String(nextValue || '');
    if (normalized === editStartValueRef.current) return;
    await onSave?.(normalized);
    editStartValueRef.current = normalized;
  }, [onSave]);

  if (editing) {
    return <MentionEditor
      autoFocus
      value={value || ''}
      onChange={onChange}
      onBlur={save}
      people={people}
      projects={projects}
      placeholder={placeholder}
      editorClassName={editorClassName}
      ariaLabel={ariaLabel}
      richMarkdown
    />;
  }

  return <div
    role="button"
    tabIndex={0}
    className={cn('editable-markdown-description', className)}
    onClick={beginEdit}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        beginEdit();
      }
    }}
    aria-label={`Редактировать: ${ariaLabel}`}
  >
    {value
      ? <MarkdownText text={value} onNavigate={onNavigate}/>
      : <span className="text-muted-foreground">{placeholder}</span>}
  </div>;
}
