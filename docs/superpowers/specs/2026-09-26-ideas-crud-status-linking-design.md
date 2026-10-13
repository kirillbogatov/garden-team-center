# Ideas page: edit/delete icons, rejected status, project linking

## Context

Ideas (`/ideas`) and Мастерская/Workshop projects (`/workshop`) share one component, `LabsPage` in `src/pages/workspace.jsx`, discriminated by `item.entityType === 'idea'`. Today ideas support **create only**: there is no edit dialog, no delete action, and idea cards/rows are not clickable (workshop projects get all of that via `/workshop/:id` → `WorkshopDetailPage` → `EditWorkshopProjectDialog`, but ideas never navigate there).

This spec adds, for ideas only:
1. Edit and delete actions, as icons on the idea's row/card (no new detail page/route).
2. A 5th idea status, "Отклонена" (rejected).
3. The ability to attach an idea to either a Мастерская project or a work project (from the "Проекты" page).

Workshop projects (`mode="workshop"`) are unaffected by this spec except where explicitly noted (they keep their existing 4 statuses and their existing detail page/edit dialog).

## Data model changes

### Status

`src/lib/domain.js`:
```js
export const IDEA_STATUS_LABEL = { idea: 'Новая', in_progress: 'В работе', paused: 'Отложена', done: 'Готово', rejected: 'Отклонена' };
```
`LAB_STATUS_LABEL` (workshop projects) is untouched — it keeps its 4 existing values.

`src/components/status.jsx`:
- `variantMap.idea` gains `rejected: 'danger'` (red badge). `variantMap.lab` is untouched.
- No other change needed — `labelsByKind.idea` already points at `IDEA_STATUS_LABEL`, so the new label appears automatically in `StatusBadge` and in the status filter `<Select>` on the Ideas page (which renders `Object.entries(labels)`).

### Project linking

Idea records (collection `labs`, `entityType: 'idea'`) already support `labProjectId` (nullable FK into `labs`, pointing at a Мастерская project). This spec adds one new field:

- `projectId` (nullable FK into the `projects` collection — a real work project).

The two fields are **mutually exclusive**: an idea is linked to at most one of {a Мастерская project, a work project}, never both. This is enforced client-side in the dialog form (selecting one clears the other before save) — no server validation is added since the generic CRUD routes (`server/routes/crud.js`) already handle arbitrary fields on `labs` and no other code path sets both at once.

No backend code changes are required: `PUT /api/labs/:id` and `DELETE /api/labs/:id` already exist via the generic collection routes and are already ownership-checked (`isOwnItem('labs', item, user)`). `server/versioning.js` already tracks `labs` for version history, and `server/db.js`'s relation resolution for `labs`/`idea` already keys off `labProjectId` — that logic is unchanged; `projectId` is a plain field with no relation-graph behavior.

### "Только идеи без проектов" filter

`workspace.jsx`'s `onlyUnassigned` filter currently reads `!item.labProjectId`. It changes to `!item.labProjectId && !item.projectId`.

## UI changes

### Attach-to-project field (create + edit)

A single "Привязать к" control, composed of two selects:
1. A type select: **Без проекта** / **Проект Мастерской** / **Рабочий проект**.
2. A second select, shown only when a type other than "Без проекта" is chosen, listing:
   - Мастерская projects: `labs` items where `entityType !== 'idea'` (same list `AssistantCreateDialog` already builds as `workshopProjects`), labeled by `title`.
   - Work projects: the `projects` resource, labeled by `name` (same source `ProjectSelect` in `assistant.jsx` uses).

Changing the type select clears whichever of `labProjectId`/`projectId` is no longer relevant. This field is available in both the create and edit dialogs.

### `IdeaCrudDialog` (new; replaces the idea branch of `CreateLabDialog`)

A single dialog component, built on `useCrudDialogForm` (same hook/shape as `ProjectCrudDialog` in `resources.jsx`), handling both create and edit for ideas:

- Fields: title, description (`MentionEditor`), author, status (**edit only** — new ideas always start at `idea`/"Новая", matching today's behavior), the attach-to-project field above, and the existing "Приватная идея" checkbox.
- Footer: Cancel / Save, plus (edit mode only) a destructive "Удалить" button that opens an `AlertDialog` confirm (`Удалить идею «{title}»?`), following the exact pattern `ProjectCrudDialog` uses (`confirmOpen`/`setConfirmOpen`/`remove()` from `useCrudDialogForm`).

`CreateLabDialog` keeps handling workshop-project creation as-is (unchanged); only its `isIdea` branch is replaced by `IdeaCrudDialog` used in create mode (`item: null`).

### Edit/delete icons

Both the list row and the card view get a Pencil (edit) + Trash2 (delete) `icon-sm` ghost-button pair. Clicking either opens `IdeaCrudDialog` (edit mode) or the delete confirm, respectively — no navigation.

- **List row** (`LabListRow`): the icon pair is added to `EntityRow`'s `trailing` slot, alongside the existing avatar/status badge. `EntityRow`'s trailing wrapper already calls `event.stopPropagation()`, and ideas already pass `onOpen={undefined}`, so no extra propagation handling is needed.
- **Card view**: idea cards in `LabsPage` currently render as a `<button>` whose `onClick` is a no-op for ideas (`onClick={()=>!isIdea&&navigate(...)}`). Since ideas have no detail page to navigate to, the idea branch changes this element from `<button>` to a plain `<div className="entity-card text-left">` (identical visual styling, just not an interactive element), with the Pencil/Trash2 icon pair placed top-right next to the status badge — the same layout `ResourceCard` (`resources.jsx`) already uses for issues/goals/tools cards (`<div className="flex shrink-0 items-center gap-1">{badge}{onEdit && <Button variant="ghost" size="icon-sm">...}</div>`). Workshop-project cards keep rendering as `<button>` (they still navigate to `/workshop/:id`).

## Out of scope

- No idea detail page/route (`/ideas/:id`) — edit/delete stay dialog-only actions from the list/card view, matching the "icons in the row" ask.
- No inline quick status-changer (the dropdown-glyph pattern tasks/issues/processes have via `StatusControl`) — status changes only happen through the edit dialog.
- No "linked ideas" section added to `ProjectDetailPage` or `WorkshopDetailPage` (no reverse/backlink display of attached ideas).
- No changes to `server/access-control.js` — ideas already use owner-based access (`authorId`/admin), unchanged by this spec.

## Testing

- `test/api.test.js` already covers `labProjectId` on idea creation; add a case creating/updating an idea with `projectId` and one asserting `status: 'rejected'` round-trips through `PUT /api/labs/:id`.
- Manual check in the running app: create an idea, edit it (change status to "Отклонена", attach to a work project), delete it — from both card and list view.
