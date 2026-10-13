# People picker: shared autocomplete/chip field

## Problem

Six places in the app let a user pick one or more people for a form (meeting participants, event driver/guest, issue "affected people", task-adjacent flows). Each is an independent, hand-rolled implementation of a scrollable checkbox/button list with avatars:

- `src/pages/operations.jsx` — `CreateMeetingDialog`, "Участники" (inline JSX, button rows)
- `src/pages/technology.jsx` — local `PeopleSelector` component, reused 3×: `EventDialog` ("Драйвер / гость"), `PeopleDialog`, `MeetingDialog` ("Участники")
- `src/components/assistant.jsx` — local `PeopleChecklist` component, reused 2×: quick meeting create ("Участники"), quick issue create ("Причастные люди")

None of these are shared; each is a separate copy with slightly different markup (buttons vs. native checkboxes) and sizing. None scale well once the people list grows — there's no way to search, and no way to add a person without scrolling through everyone.

Separately, in the "Добавить встречу" modal (`operations.jsx`), the "Дата" field sits in a 50/50 grid column next to "Тип" and renders far wider than a date input needs, leaving obvious dead space.

## Goals

1. Replace all six list-based people pickers with one shared, searchable, multi-select chip input.
2. Typing filters people by name; selecting adds a removable chip. Multiple people can be added in the same field.
3. A "Команда" (Team) option in the suggestions adds every `type: "team"` person at once (as individual chips, not a separate aggregate tag).
4. Fix the "Дата" field width in the "Добавить встречу" modal so it doesn't dominate its grid column.

## Non-goals

- No changes to the people/employee data source, API, or the `Person` shape.
- No new dependency (no combobox/cmdk/react-select) — build on existing primitives.
- No change to which people are eligible for which form (all six forms search the full `people` list — team + stakeholder — per explicit decision below).
- Date-field width fix is scoped to the "Добавить встречу" modal only, not the other duplicate date rows in `technology.jsx`/`assistant.jsx`.

## Design

### 1. Shared component: `PeopleField`

New file: `src/components/people-field.jsx`, exporting `PeopleField`.

```jsx
<PeopleField
  people={people}        // full list passed by the parent (already fetched via useResource('people'))
  value={selectedIds}    // string[] of person ids
  onChange={setSelectedIds}
  label="Участники"
  placeholder="Начните вводить имя…"
/>
```

Behavior:
- Selected people render as removable chips (small `Avatar` + name + × button) inside the field container, with the text input following them on the same line(s) — a standard tag-input layout.
- Typing opens an absolute-positioned dropdown below the field, filtered by case-insensitive substring match against `person.name`, excluding people already selected.
- A **"Команда"** row is always the first suggestion when it matches the current query (or the query is empty). Selecting it adds every person with `type: "team"` not already in `value`, as individual chips.
- Keyboard support: `↓`/`↑` move the highlighted suggestion, `Enter` selects it, `Backspace` on an empty input removes the last chip, `Escape` closes the dropdown.
- No matches: dropdown shows "Никого не найдено."
- Clicking outside the field closes the dropdown (mirrors the pattern already used by the `@mention` suggestion dropdown in `src/components/mention-editor.jsx`, which is the closest existing reference for a type-to-filter dropdown in this codebase).

### 2. Date field fix (`operations.jsx`, `CreateMeetingDialog` only)

Current: the "Тип"/"Дата" row uses `grid gap-4 sm:grid-cols-2`, giving "Дата" a ~308px column it doesn't need.

Fix: change that row's grid to `sm:grid-cols-[1fr_160px]` — "Тип" keeps the flexible column, "Дата" is pinned to a fixed ~160px column. This mirrors the fixed-width-date convention already present in `technology.jsx` (`sm:grid-cols-[1fr_160px]` pairing a date input with a fixed-width sibling field), just with the narrow slot assigned to the field that doesn't need room.

### 3. Rollout

| File | Change |
|---|---|
| `src/components/people-field.jsx` | New — `PeopleField` component |
| `src/pages/operations.jsx` | `CreateMeetingDialog`: swap the participants list for `PeopleField`; apply the Date grid-column fix |
| `src/pages/technology.jsx` | Delete local `PeopleSelector`; replace its 3 usages (`EventDialog`, `PeopleDialog`, `MeetingDialog`) with `PeopleField` |
| `src/components/assistant.jsx` | Delete local `PeopleChecklist`; replace its 2 usages (quick meeting create, quick issue create) with `PeopleField` |

Each call site keeps its own state and label; only the rendered control and the prop names (`selected`/`onToggle` → `value`/`onChange`) change. No data-layer or API changes.

## Testing

No component test framework currently covers these forms. Verification is manual, via the dev server, for each of the 6 replaced pickers:
- Typing filters suggestions correctly; already-selected people are excluded.
- "Команда" adds all `type: "team"` people not yet selected.
- Chips can be removed individually; `Backspace` on empty input removes the last chip.
- Keyboard navigation (`↑`/`↓`/`Enter`/`Escape`) works.
- Clicking outside closes the dropdown.
- In the "Добавить встречу" modal specifically: the "Дата" field renders at its new fixed width and the "Тип"/"Дата" row stays visually balanced.
