# Status icons for ideas and workshop projects (list view)

## Context

Tasks already have a click-to-change status control in list rows: `TaskEntityRow` (`src/components/entity-row.jsx`) renders `TaskStatusIcon` in the row's `leading` slot — a small colored glyph to the left of the title. Clicking it opens a `DropdownMenu` listing every status (glyph + label + checkmark on the current one); picking one calls `useEntityStatus` (`src/hooks/use-entity-status.js`), which optimistically updates and persists via `api.resource('tasks').update(id, { status })`.

Ideas and workshop projects (`LabsPage`, `src/pages/workspace.jsx`, both `entityType: 'idea'` and other `labs` items, resource `labs`) don't have this. Today their list row (`LabListRow`) shows status only as a static text `<StatusBadge>` in the row's `trailing` slot, and status can only be changed by opening the edit dialog (`IdeaCrudDialog` / `EditWorkshopProjectDialog`). Per `docs/superpowers/specs/2026-09-26-ideas-crud-status-linking-design.md`, this was explicitly out of scope there ("No inline quick status-changer ... status changes only happen through the edit dialog") — this spec adds it.

This spec covers the **list view only**. Card view (`LabCard`) and the detail page (`WorkshopDetailPage`) keep their existing `StatusBadge` unchanged.

## Statuses and glyphs

Idea statuses (`IDEA_STATUS_LABEL`, `src/lib/domain.js`): `idea` (Новая), `in_progress` (В работе), `paused` (Отложена), `done` (Готово), `rejected` (Отклонена).

Workshop project statuses (`LAB_STATUS_LABEL`): `idea` (Идея), `in_progress` (В работе), `paused` (Приостановлено), `done` (Готово) — no `rejected`.

Both use the same **text-glyph style** as tasks (not lucide icons), reusing the task color palette where the meaning matches:

| status | glyph | color | note |
|---|---|---|---|
| `idea` | 💡 | (native emoji color) | new, per user request — not the task "todo" dashed circle |
| `in_progress` | ◐ | blue (`#4f83cc`, same as task) | |
| `paused` | Ⅱ | amber (`#b08a30`, same as task) | |
| `done` | ✓ | green (`#3f9364`, same as task) | |
| `rejected` (idea only) | × | muted gray (`hsl(var(--muted-foreground))`) | same symbol as task's `blocked`, but muted color instead of red — no task-status analog exists for "rejected", and red would visually collide with `blocked`'s meaning |

## Implementation

### `src/components/status.jsx`

- Add `IDEA_STATUS_SYMBOL = { idea: '💡', in_progress: '◐', paused: 'Ⅱ', done: '✓', rejected: '×' }` and `LAB_STATUS_SYMBOL` (same minus `rejected`).
- Add `IdeaStatusGlyph`/`LabStatusGlyph`, mirroring `TaskStatusGlyph`: render the symbol in a `<span aria-hidden>` with classes `idea-status-glyph` / `idea-status-glyph-${status}` (and `lab-status-glyph` / `lab-status-glyph-${status}`).
- Add `IdeaStatusIcon`/`LabStatusIcon`, mirroring `TaskStatusIcon`: thin wrappers around the existing generic `StatusControl`, with `resource="labs"`, `validValues`/`options` from `Object.keys(IDEA_STATUS_LABEL)` / `Object.keys(LAB_STATUS_LABEL)`, `fallback="idea"`. No changes needed to `StatusControl` or `useEntityStatus` — both are already resource-agnostic.

### `src/styles.css`

Add `.idea-status-glyph-*` / `.lab-status-glyph-*` rules alongside the existing `.task-status-glyph-*` block (~line 686), same sizing/color approach. The `idea` glyph (emoji) needs no color rule; `in_progress`/`paused`/`done` copy the task colors; `rejected` gets its own muted-gray rule.

### `src/pages/workspace.jsx` — `LabListRow`

- Remove `<StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/>` from `trailing`.
- Pass `leading={isIdea ? <IdeaStatusIcon labId={item.id} status={item.status||'idea'} onChanged={onStatusChanged}/> : <LabStatusIcon labId={item.id} status={item.status||'idea'} onChanged={onStatusChanged}/>}` to `EntityRow` (new prop threaded down from `LabsPage`, same `onChanged`-triggers-refetch pattern the tasks list already uses).
- `EntityRow`'s existing `leading` wrapper already calls `event.stopPropagation()`, so this doesn't conflict with the row's own `onOpen` (workshop projects navigate to `/workshop/:id`; ideas have no `onOpen`).

### Out of scope

- Card view (`LabCard`) and `WorkshopDetailPage` keep the existing text `StatusBadge` — unchanged.
- No server-side changes — status is validated client-side only, same as the existing `rejected` addition.

## Testing

- Manual check in the running app: in both the Ideas list and the Workshop list, confirm the glyph appears left of the title, clicking it opens the status dropdown, and selecting a status persists (refresh confirms) and updates the glyph without a full page reload.
