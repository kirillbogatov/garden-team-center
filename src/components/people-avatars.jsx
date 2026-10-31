import * as React from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';

// Shared compact presentation for groups; names remain available on hover and focus.
export function PeopleAvatars({ people = [], limit = 5, size = 'xs', linked = false, className }) {
  const unique = people.filter((person, index, all) => person && all.findIndex((item) => item?.id ? item.id === person.id : item === person) === index);
  if (!unique.length) return null;
  const visible = unique.slice(0, limit);
  const hidden = unique.slice(limit);
  return <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
    {visible.map((person, index) => {
      const avatar = <Avatar person={person} size={size}/>;
      return <Tooltip key={person.id || index} content={person.name}>
        {linked && person.id
          ? <Link to={`/people/${encodeURIComponent(person.id)}`} aria-label={person.name} className="inline-flex shrink-0 rounded-full ui-focus-ring">{avatar}</Link>
          : <span tabIndex={0} aria-label={person.name} className="inline-flex shrink-0 rounded-full ui-focus-ring">{avatar}</span>}
      </Tooltip>;
    })}
    {hidden.length > 0 && <Tooltip content={hidden.map((person) => person.name).join(', ')}><span tabIndex={0} aria-label={`Ещё ${hidden.length}: ${hidden.map((person) => person.name).join(', ')}`} className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-xs ui-focus-ring">+{hidden.length}</span></Tooltip>}
  </span>;
}
