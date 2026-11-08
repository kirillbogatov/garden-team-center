import { Avatar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { cn } from '@/lib/utils';

export function TaskAssigneeSelect({ people, value, onChange, className, disabled }) {
  const assigneeId = value || 'none';
  const options = people.filter((person) => person.type === 'team' || person.id === assigneeId);

  return (
    <Select value={assigneeId} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label="Исполнитель"
        className={cn('min-w-0 max-w-full focus-visible:ring-2 focus-visible:ring-ring', className)}
      >
        <SelectValue/>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Без исполнителя</SelectItem>
        {assigneeId !== 'none' && !options.some((person) => person.id === assigneeId) && (
          <SelectItem value={assigneeId} disabled>Исполнитель недоступен</SelectItem>
        )}
        {options.map((person) => (
          <SelectItem key={person.id} value={person.id} textValue={person.name}>
            <span className="inline-flex max-w-full items-center gap-2 align-middle" title={person.name}>
              <span aria-hidden="true"><Avatar person={person} size="xs" className="align-middle"/></span>
              <span className="min-w-0 truncate">{person.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
