# Employee page: two-column layout, "О сотруднике", "Обратить внимание"

## Context

`PersonDetailPage` (`src/pages/resources.jsx:589-742`) renders a team member's/stakeholder's profile as a vertical stack of `.person-card` sections (`.person-card-stack`, `src/styles.css:3512`): hero (photo/name/role), then — only when `isTeam` (`person.type === 'team'`) — "Контакты", "Загрузка" (workload), "Развитие" (development tabs), and finally "Связи" (tasks/issues/meetings/journal/agreements tabs, shown for everyone).

This spec covers three changes to the `isTeam` branch only (stakeholders are unaffected):
1. "Загрузка" and "Развитие" become a two-column row instead of two full-width stacked cards.
2. "Контакты" is renamed to "О сотруднике" and moves to after that row (was before it).
3. A new "Обратить внимание" section is added right after the hero card, visible only to teamleads/admins, surfacing signals about the employee.

## Layout reorder

New order for `isTeam` profiles: hero → **Обратить внимание** (conditional) → two-column row [**Загрузка** | **Развитие**] → **О сотруднике** → Связи (unchanged, outside the `isTeam` branch).

`.person-card-stack` is `display:grid; gap:22px` with one implicit column, so each direct child already spans full width. Add a new wrapper class:

```css
.person-card-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
@media (max-width: 720px) {
  .person-card-row { grid-template-columns: 1fr; }
}
```

Wrap the existing "Загрузка" and "Развитие" `<section className="person-card">` elements in `<div className="person-card-row">...</div>`. No changes to their internal markup.

"Контакты" section: only the `SectionHeader title` string changes to `"О сотруднике"` and its position moves (JSX reordered), content unchanged.

## "Обратить внимание" section

### Visibility

Rendered only when `isTeam` is true, the viewing user is a teamlead/admin, and at least one signal is present (see below — no signals means the section is omitted entirely, not shown empty).

Teamlead check reuses the existing predicate currently private to `assistant.jsx:109-111`:
```js
function isTeamlead(user) {
  return user?.role === 'teamlead' || user?.role === 'admin' || user?.roles?.includes?.('teamlead') || user?.roles?.includes?.('admin');
}
```
Move it to `src/lib/domain.js` as an exported function, update `assistant.jsx` to import it from there instead of defining it locally (no behavior change there).

`PersonDetailPage` currently takes no props and has no access to the current user. `AppRoutes` (`src/App.jsx:34`) already holds `user` (from `AuthGate`) but doesn't pass it to `/people/:id`. Change:
```js
<Route path="/people/:id" element={<PersonDetailPage user={user}/>}/>
```
and `export function PersonDetailPage({ user })` in `resources.jsx`, using `isTeamlead(user)` for the gate.

### Signals

Computed inline in `PersonDetailPage` from data already loaded via `state.data` (no new API calls):

| Signal | Condition |
|---|---|
| No tasks on an active project | For each project in `summary.projects` (active projects the person is staffed on, from existing `personProjectLoadSummary`), check whether any task in `tasks` has `!archivedAt && status !== 'done' && task.projectId === project.id`. One row per project with none. Paused/done projects are never checked (not in `summary.projects`, which is already filtered to `status === 'active'`). |
| Incomplete workload | `summary.level.tone === 'muted'` (covers both "Низкая" and "Нет загрузки" levels from `projectLoadLevel`). |
| Overload | `summary.level.tone === 'danger'` ("Перегруз"). |
| Active issues | `openIssues.length > 0` (already computed at `resources.jsx:624`); show the count. |
| Vacation starting soon | Among `vacations`, find entries with `type === 'vacation'` whose `startDate` falls in `(today, today+7 days]` (strictly in the future, within 7 days — a vacation already in progress is not "coming soon"). Show the start date. |

Each present signal renders as one row: an icon (reuse `TriangleAlert`, already imported) + short label text, styled with the existing `.person-card` / `Badge`-tone conventions (danger for overload, warning for the rest) rather than a new component system. Layout: simple stacked rows inside a `.person-card`, each row `flex items-center gap-2`, tone-colored icon.

### Out of scope

- No new backend/API work — everything derives from the existing `/api/people/:id/profile` payload already fetched by `state`.
- No settings/toggle to configure thresholds (7-day vacation window, "muted" tone for incomplete load) — hardcoded per this spec; revisit if it needs to become configurable later.
- No signal persistence/dismissal — recomputed on every render from live data.
- Stakeholder profiles: entirely unaffected (section and reorder are inside the existing `isTeam &&` branch).

## Testing

Manual check in the running app, logged in as a teamlead/admin:
- Open a team member with an active project and zero open tasks on it → signal shows.
- Open a team member with `summary.level.tone === 'muted'` / `'danger'` → matching signal shows.
- Open a team member with an unresolved issue linked → signal shows with correct count.
- Open a team member with a vacation starting in ≤7 days → signal shows with the correct date; one starting in 8+ days or already in progress → no signal.
- Confirm the section is absent when no signals apply, and absent entirely when logged in as a non-teamlead viewing the same profile.
- Confirm the Загрузка/Развитие two-column row and the "О сотруднике" renamed/repositioned section render correctly at desktop and below 720px width.
