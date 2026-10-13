import * as React from 'react';
import { api } from '@/lib/api';

export function useEntityStatus({ resource, id, status, validValues, fallback, onStatusChange, onChanged, disabled = false }) {
  const incoming = validValues.includes(status) ? status : fallback;
  const [current, setCurrent] = React.useState(incoming);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setCurrent(validValues.includes(status) ? status : fallback);
  }, [status]);

  const interactive = !disabled && (Boolean(id) || typeof onStatusChange === 'function');

  const changeStatus = async (next) => {
    if (!validValues.includes(next) || next === current || busy) return;
    const previous = current;
    setCurrent(next);
    setBusy(true);
    try {
      let updated = null;
      if (onStatusChange) updated = await onStatusChange(next);
      else if (id) updated = await api.resource(resource).update(id, { status: next });
      await onChanged?.(updated || { id, status: next });
    } catch (error) {
      setCurrent(previous);
      console.error(`Failed to update ${resource} status`, error);
    } finally {
      setBusy(false);
    }
  };

  return { current, busy, interactive, changeStatus };
}
