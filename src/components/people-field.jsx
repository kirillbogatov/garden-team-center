import * as React from 'react';
import { Users, X } from 'lucide-react';
import { Avatar, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

export function PeopleField({ people, value, onChange, label, placeholder = 'Начните вводить имя…', className }) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const selectedIds = value || [];
  const selectedPeople = selectedIds.map((id) => people.find((person) => person.id === id)).filter(Boolean);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const availablePeople = people.filter((person) => !selectedIds.includes(person.id));
  const filteredPeople = normalizedQuery
    ? availablePeople.filter((person) => person.name.toLocaleLowerCase('ru').includes(normalizedQuery))
    : availablePeople;
  const remainingTeamIds = people.filter((person) => person.type === 'team' && !['dismissed','transferred','on_leave'].includes(person.status) && !selectedIds.includes(person.id)).map((person) => person.id);
  const showTeamOption = remainingTeamIds.length > 0 && (!normalizedQuery || 'команда'.includes(normalizedQuery));
  const suggestions = [
    ...(showTeamOption ? [{ kind: 'team' }] : []),
    ...filteredPeople.map((person) => ({ kind: 'person', person })),
  ];

  React.useEffect(() => { setActive(0); }, [query, open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const removePerson = (id) => onChange(selectedIds.filter((itemId) => itemId !== id));

  const choose = (item) => {
    if (item.kind === 'team') onChange([...selectedIds, ...remainingTeamIds]);
    else if (!selectedIds.includes(item.person.id)) onChange([...selectedIds, item.person.id]);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.max(0, Math.min(current + 1, suggestions.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && suggestions[active]) choose(suggestions[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !query && selectedIds.length) {
      removePerson(selectedIds[selectedIds.length - 1]);
    }
  };

  return <div className={cn(label ? 'space-y-1.5' : null, className)}>
    {label && <Label>{label}</Label>}
    <div ref={containerRef} className="relative">
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[8px] border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        {selectedPeople.map((person) => (
          <span key={person.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-1 pr-2 text-[12px]">
            <Avatar person={person} size="xs"/>
            <span className="max-w-[140px] truncate">{person.name}</span>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); removePerson(person.id); }}
              aria-label={`Убрать ${person.name}`}
              className="text-muted-foreground hover:text-foreground"
            ><X className="h-3 w-3"/></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedPeople.length ? '' : placeholder}
          className="min-w-[120px] flex-1 border-0 bg-transparent p-1 text-[14px] outline-none placeholder:text-muted-foreground/65"
        />
      </div>
      {open && <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
        {suggestions.length ? suggestions.map((item, index) => (
          <button
            type="button"
            key={item.kind === 'team' ? '__team' : item.person.id}
            onMouseDown={(event) => { event.preventDefault(); choose(item); }}
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ui-focus-ring', index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
          >
            {item.kind === 'team'
              ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted"><Users className="h-3.5 w-3.5"/></span>
              : <Avatar person={item.person} size="sm"/>}
            <span className="min-w-0 flex-1 truncate">{item.kind === 'team' ? 'Команда' : item.person.name}</span>
          </button>
        )) : <div className="p-3 text-xs text-muted-foreground">Никого не найдено.</div>}
      </div>}
    </div>
  </div>;
}
