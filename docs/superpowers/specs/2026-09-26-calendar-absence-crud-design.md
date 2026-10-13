# Calendar page: create/edit/delete absences (отпуск/отгул/больничный)

## Context

The Calendar page (`CalendarPage` in `src/pages/operations.jsx`) renders meetings, birthdays, and absences (отпуск/отгул/больничный) for the current month, sourced from `GET /api/calendar/month`. Absences are read from the generic `vacations` collection (`{ id, personId, type: 'vacation'|'sick'|'dayoff', startDate, endDate, note }`) and rendered as horizontal bars spanning their date range. Today there is no way to create an absence from the UI, and clicking an absence bar navigates to `/people/:personId` — there is no edit/delete form.

The `vacations` collection already has full CRUD support server-side:
- Generic REST routes (create/update/delete) with ownership + role-based permission checks in `server/access-control.js` and `server/application/resource-service.js`.
- Permission levels come from `user.access.vacations` (one of `none` / `own_read` / `own_manage` / `all_own_manage` / `all_manage`), exposed via `GET /api/auth/me` as `{ user: { personId, access: { vacations: <level>, ... } } }`.
  - `manage` capability ≥ 1 (`own_manage`, `all_own_manage`, `all_manage`) → can create/edit/delete **their own** absences (`item.personId === user.personId`).
  - `manage` capability ≥ 2 (`all_manage`) → can create/edit/delete **anyone's** absences and choose the person.

No backend or data-model changes are needed — this is a frontend-only feature, reusing the existing `useCrudDialogForm` hook and `AlertDialog` delete-confirm pattern already used throughout the app (e.g. `ResourceCrudDialog` in `src/pages/resources.jsx`).

## Scope

This spec covers only the three absence types (`vacation`, `sick`, `dayoff`). Meetings and birthdays keep their current click behavior (navigate to the meeting/person) — untouched.

## UI changes (`src/pages/operations.jsx`)

### Permission helpers

In `CalendarPage`, add `const me = useEndpoint('/api/auth/me')` and derive:
```js
const vacAccess = me.data?.user?.access?.vacations || 'none';
const canManageOwnAbsences = ['own_manage','all_own_manage','all_manage'].includes(vacAccess);
const canManageAllAbsences = vacAccess === 'all_manage';
const canEditAbsence = (item) => canManageAllAbsences || (canManageOwnAbsences && item.personId === me.data?.user?.personId);
```

### "Добавить отсутствие" button

Added to `PageHeader`'s `actions`, next to the month navigation controls, shown only when `canManageOwnAbsences`. Opens `AbsenceDialog` in create mode (`item: null`), defaulting to today's date for both start/end and, when not `canManageAllAbsences`, the current user as the (fixed) person.

### Click behavior on absence bars

The `barItems`/`weekBars` segment buttons (currently `onClick: () => navigate('/people/:id')`) change to:
```js
onClick: canEditAbsence(item) ? () => openEdit(item) : () => navigate(`/people/${encodeURIComponent(item.personId)}`)
```
`openEdit(item)` sets the dialog's `item` state and opens it.

### `AbsenceDialog` (new component, colocated with `CalendarPage`)

Props: `open, item, onOpenChange, onSaved, people, canManageAll, currentPersonId`. Built on `useCrudDialogForm({ resource: 'vacations', open, item, onOpenChange, onSaved, buildDraft, validate, buildPayload })`, following the exact shape `ResourceCrudDialog` (`resources.jsx`) uses.

- **Тип** — `Select` with 3 options: Отпуск (`vacation`) / Больничный (`sick`) / Отгул (`dayoff`).
- **Сотрудник** — when `canManageAll`: `Select` listing active team members (`people.filter(p => p.type==='team' && !['dismissed','transferred'].includes(p.status))`), labeled by name. Otherwise: fixed to `currentPersonId`, rendered as static (non-editable) text with the person's name — no `Select` shown.
- **Начало / Окончание** — two `<Input type="date">` in a 2-column grid.
- **Заметка** — optional `Input` (or `Textarea`), free text.
- Validation: person required; both dates required; `endDate >= startDate` else "Дата окончания раньше даты начала".
- `buildPayload`: `{ type, personId, startDate, endDate, note: note.trim() || null }`.
- Footer: destructive **Удалить** button (only when editing, and only when `canEditAbsence(item)` — i.e. the same permission check that allowed opening the dialog for edit in the first place) wired to `useCrudDialogForm`'s `remove`/`confirmOpen`/`setConfirmOpen`, with an `AlertDialog` confirm (`Удалить отсутствие?`); Cancel; Save.
- Error display: same inline `rounded-md bg-destructive/10` block pattern as other dialogs, using `mapSaveError` to show "Недостаточно прав для изменения" on a 403.

### Data refresh

`onSaved` reloads the calendar month data (`state.reload()`) so the grid reflects the new/edited/deleted absence immediately.

## Out of scope

- No changes to `server/routes/aggregates.js`, `server/access-control.js`, `server/application/resource-service.js`, or the `vacations` data model — all required permission/CRUD logic already exists.
- No overlap/conflict validation for a person having two absences on the same day.
- No change to meeting/birthday click behavior.
- No new detail page/route for absences — dialog-only, matching the existing pattern for lightweight resources.

## Testing

- Manual check in the running app, for both an `all_manage` user (e.g. admin/teamlead) and an `own_manage`-only user:
  - Create an absence (each of the 3 types), confirm it renders as a bar in the correct date range.
  - Click an editable absence bar → edit dialog opens pre-filled → change dates/note → save → grid updates.
  - Delete an absence via the dialog → bar disappears from the grid.
  - As an `own_manage`-only user, confirm the person field is fixed to self and clicking another person's absence bar falls back to navigating to their profile (not the edit dialog).
