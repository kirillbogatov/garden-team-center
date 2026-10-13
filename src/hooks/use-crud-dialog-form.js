import * as React from 'react';
import { api } from '@/lib/api';

/**
 * @param {object} opts
 * @param {string} opts.resource - api.resource(name) key
 * @param {boolean} opts.open
 * @param {object|null} opts.item - existing item when editing, null/undefined when creating
 * @param {(item: object|null) => object} opts.buildDraft - initial draft shape from `item` (or defaults when null)
 * @param {(draft: object) => string|null} opts.validate - return an error message, or null if valid
 * @param {(draft: object) => object} opts.buildPayload - draft -> API payload
 * @param {(id: string|object) => (string|object)} [opts.resolveId] - defaults to item?.id; pass e.g. resourceRef(resource, item) when a resource uses a composite ref
 * @param {() => void} opts.onOpenChange
 * @param {(saved: object) => Promise<void>|void} [opts.onSaved] - called with the created/updated entity after a successful save
 * @param {{ save?: string, remove?: string }} [opts.forbiddenMessages] - custom 403 copy; defaults to generic Russian copy
 * @param {(e: any) => string} [opts.mapSaveError] - custom save-error copy (e.g. distinguishing 409/400); defaults to the 403/generic fallback below
 */
export function useCrudDialogForm({ resource, open, item, buildDraft, validate, buildPayload, resolveId, onOpenChange, onSaved, forbiddenMessages = {}, mapSaveError }) {
  const isEdit = Boolean(item?.id);
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(item));
    setError('');
  }, [open, item?.id]);

  const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const id = () => (resolveId ? resolveId(item) : item?.id);

  const save = async () => {
    const validationError = validate(draft);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload(draft);
      const result = isEdit ? await api.resource(resource).update(id(), payload) : await api.resource(resource).create(payload);
      onOpenChange(false);
      await onSaved?.(result);
    } catch (e) {
      setError(mapSaveError ? mapSaveError(e) : (e?.status === 403 ? (forbiddenMessages.save || 'Недостаточно прав для изменения') : 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    setSaving(true);
    try {
      await api.resource(resource).remove(id());
      onOpenChange(false);
      await onSaved?.();
    } catch (e) {
      setError(e?.status === 403 ? (forbiddenMessages.remove || 'Недостаточно прав для удаления') : 'Не удалось удалить');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  return { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen };
}
