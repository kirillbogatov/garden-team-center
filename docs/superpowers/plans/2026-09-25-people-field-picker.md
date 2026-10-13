# Shared people-picker field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three duplicated "scrollable checkbox list of people" widgets with one shared, searchable, multi-select chip field (`PeopleField`), and fix the oversized "Дата" input in the "Добавить встречу" modal.

**Architecture:** A single new component, `src/components/people-field.jsx`, renders a text input that filters `people` by name as the user types, shows matches (plus an always-available "Команда" row that bulk-adds every `type: "team"` person) in a dropdown, and renders selections as removable chips inside the field. It's a drop-in replacement for the three existing pickers — call sites swap `selected`/`onToggle` props for `value`/`onChange` (a plain string-id array), no other state changes required.

**Tech Stack:** React (no new dependency — no combobox/cmdk/react-select), existing `Avatar`/`Label`/`cn` primitives, Tailwind utility classes, `lucide-react` icons. Verification uses this repo's existing static source-assertion test style (`node --test`, `fs.readFileSync` + regex/string assertions — there is no component-rendering test setup in this project, so don't add one).

## Global Constraints

- No new npm dependency — spec explicitly rules out combobox/cmdk/react-select/downshift.
- Search scope is the full `people` list (`type: "team"` and `"stakeholder"`) in all six call sites, replacing any per-form team-only filtering that existed before (e.g. `assistant.jsx`'s old `.filter(p => p.type === 'team')`).
- "Команда" adds every `type: "team"` person as individual chips — it is not a separate aggregate tag.
- The Date-field width fix (`sm:grid-cols-[1fr_160px]`) is scoped to `CreateMeetingDialog` in `src/pages/operations.jsx` only — do not touch the date rows in `technology.jsx` or `assistant.jsx`.
- Preserve every literal Russian string that existing tests assert on verbatim — in particular `'Драйвер / гость'` must still appear in `src/pages/technology.jsx` (checked by `test/architecture.test.js`).
- Follow existing code style in each file: no semicolon-free style, inline JSX, `cn(...)` for conditional classes, arrow-function event handlers matching neighboring code.

---

### Task 1: Create the shared `PeopleField` component

**Files:**
- Create: `src/components/people-field.jsx`
- Create: `test/people-field-consistency.test.js`

**Interfaces:**
- Produces: `export function PeopleField({ people, value, onChange, label, placeholder, className })` where `people` is `Person[]` (each with `id`, `name`, `type`), `value` is `string[]` of selected ids, `onChange(nextIds: string[])` replaces the full selection (used both for single add/remove and for the bulk "Команда" add), `label` is an optional string rendered above the field exactly like the old `<Label>` usage, `placeholder` defaults to `'Начните вводить имя…'`.
- Consumes: `Avatar`, `Label` from `@/components/ui`; `cn` from `@/lib/utils`; `Users`, `X` from `lucide-react`.

- [ ] **Step 1: Write the failing consistency test**

Create `test/people-field-consistency.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared PeopleField component exists and implements search + team bulk-add', () => {
  const field = read('src/components/people-field.jsx');
  assert.match(field, /export function PeopleField/);
  assert.match(field, /'Команда'/);
  assert.match(field, /type === 'team'/);
  assert.match(field, /Никого не найдено/);
  assert.doesNotMatch(field, /cmdk|downshift|react-select/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/people-field-consistency.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open '.../src/components/people-field.jsx'`

- [ ] **Step 3: Implement `PeopleField`**

Create `src/components/people-field.jsx`:

```jsx
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
  const remainingTeamIds = people.filter((person) => person.type === 'team' && !selectedIds.includes(person.id)).map((person) => person.id);
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
      setActive((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); }
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
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[8px] border border-border/90 bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
        onClick={() => inputRef.current?.focus()}
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
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm', index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/people-field-consistency.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/people-field.jsx test/people-field-consistency.test.js
git commit -m "feat: add shared PeopleField searchable multi-select component"
```

---

### Task 2: Wire `PeopleField` into the "Добавить встречу" modal and fix the Date column width

**Files:**
- Modify: `src/pages/operations.jsx:1-100` (import block, `CreateMeetingDialog`)
- Test: `test/people-field-consistency.test.js` (append)

**Interfaces:**
- Consumes: `PeopleField` from Task 1 (`import { PeopleField } from '@/components/people-field'`), signature `<PeopleField people={people} value={ids} onChange={(ids) => ...} label="..." />`.

- [ ] **Step 1: Write the failing test**

Append to `test/people-field-consistency.test.js`:

```js
test('operations.jsx uses the shared PeopleField for meeting participants and narrows the Date column', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.match(operations, /<PeopleField label="Участники"/);
  assert.match(operations, /sm:grid-cols-\[1fr_160px\]/);
  assert.doesNotMatch(operations, /togglePerson/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/people-field-consistency.test.js`
Expected: FAIL on the new test (the import/usage/grid-column changes below don't exist yet)

- [ ] **Step 3: Edit `src/pages/operations.jsx`**

In the top import block, drop the now-unused `Check` icon and add the `PeopleField` import:

```jsx
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleDot, Download, ExternalLink, History, Link2, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { DetailAsideField, DetailHeader, DetailLayout, Page, PageHeader, Section } from '@/components/page';
import { DetailSidebar, DetailSidebarSection, useDetailSidebarState } from '@/components/detail-sidebar';
import { VersionHistoryDialog } from '@/components/version-history';
import { MentionEditor } from '@/components/mention-editor';
import { PeopleField } from '@/components/people-field';
import { Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
```

In `CreateMeetingDialog`, remove the `togglePerson` helper:

```jsx
// delete this line entirely:
// const togglePerson = (id) => field('participantIds', (draft.participantIds||[]).includes(id) ? draft.participantIds.filter((itemId) => itemId !== id) : [...(draft.participantIds||[]), id]);
```

Replace the dialog body (the `grid gap-4 sm:grid-cols-2` Тип/Дата row and the Участники block) with:

```jsx
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Добавить встречу</DialogTitle><DialogDescription>Встреча появится в разделе «Встречи» и в календаре.</DialogDescription></DialogHeader>
    <div className="grid gap-4 py-1">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1.5"><Label>Тип</Label><Select value={draft.type||'club'} onValueChange={(value)=>field('type', value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{MEETING_TYPE_OPTIONS.map((item)=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="new-meeting-date">Дата</Label><Input id="new-meeting-date" type="date" value={draft.date||''} onChange={(e)=>field('date', e.target.value)}/></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="new-meeting-title">Название</Label><Input id="new-meeting-title" value={draft.title||''} onChange={(e)=>field('title', e.target.value)} placeholder="Например, синк по проекту"/></div>
      <div className="space-y-1.5"><Label>Проект (необязательно)</Label><Select value={draft.projectId || '__none'} onValueChange={(projectId)=>field('projectId', projectId==='__none' ? '' : projectId)}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger><SelectContent><SelectItem value="__none">—</SelectItem>{projects.map((project)=><SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
      <PeopleField label="Участники" people={people} value={draft.participantIds||[]} onChange={(ids)=>field('participantIds', ids)}/>
      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving ? 'Создаю…' : 'Создать встречу'}</Button></DialogFooter>
  </DialogContent></Dialog>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/people-field-consistency.test.js`
Expected: PASS (both tests)

- [ ] **Step 5: Run the existing architecture test to make sure nothing else broke**

Run: `node --test test/architecture.test.js test/accessibility-consistency.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/operations.jsx test/people-field-consistency.test.js
git commit -m "refactor: use PeopleField for meeting participants, narrow Date column"
```

---

### Task 3: Wire `PeopleField` into `technology.jsx`, remove local `PeopleSelector`

**Files:**
- Modify: `src/pages/technology.jsx` (import block, `EventDialog`, `PeopleDialog`, `MeetingDialog`; delete `PeopleSelector`)
- Test: `test/people-field-consistency.test.js` (append)

**Interfaces:**
- Consumes: `PeopleField` from Task 1, same signature as Task 2.

- [ ] **Step 1: Write the failing test**

Append to `test/people-field-consistency.test.js`:

```js
test('technology.jsx uses the shared PeopleField and drops the local PeopleSelector', () => {
  const technology = read('src/pages/technology.jsx');
  assert.match(technology, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.doesNotMatch(technology, /function PeopleSelector/);
  assert.match(technology, /<PeopleField label="Драйвер \/ гость"/);
  assert.match(technology, /<PeopleField label="Участники"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/people-field-consistency.test.js`
Expected: FAIL on the new test

- [ ] **Step 3: Edit `src/pages/technology.jsx`**

Add the import after the `@/components/ui` import block:

```jsx
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { PeopleField } from '@/components/people-field';
```
(i.e. add `import { PeopleField } from '@/components/people-field';` as its own line right after the existing `} from '@/components/ui';` block, before `import { useCrudDialogForm }...` — keep the existing import order otherwise.)

In `EventDialog`, delete the `togglePerson` line:

```jsx
// delete: const togglePerson = (id) => field('personIds', (draft.personIds||[]).includes(id) ? draft.personIds.filter((itemId) => itemId !== id) : [...(draft.personIds||[]), id]);
```

and replace `<PeopleSelector people={people} selected={draft.personIds||[]} onToggle={togglePerson}/>` with:

```jsx
<PeopleField label="Драйвер / гость" people={people} value={draft.personIds||[]} onChange={(ids) => field('personIds', ids)}/>
```

In `PeopleDialog`, delete the `toggle` line:

```jsx
// delete: const toggle = (id) => setSelected((value) => value.includes(id) ? value.filter((itemId) => itemId !== id) : [...value, id]);
```

and replace `<PeopleSelector people={people} selected={selected} onToggle={toggle}/>` with:

```jsx
<PeopleField label="Драйвер / гость" people={people} value={selected} onChange={setSelected}/>
```

Delete the `PeopleSelector` function entirely:

```jsx
// delete the whole function:
// function PeopleSelector({ people, selected, onToggle, title = 'Драйвер / гость' }) {
//   return <div className="space-y-1.5"><Label>{title}</Label><div className="max-h-52 overflow-y-auto rounded-lg border bg-card p-1">{people.length ? people.map((person) => {
//     const active = selected.includes(person.id);
//     return <button type="button" key={person.id} onClick={() => onToggle(person.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50 ${active ? 'bg-accent/60' : ''}`}><Avatar person={person} size="sm"/><span className="min-w-0 flex-1 truncate">{person.name}</span>{active && <Check className="h-4 w-4 text-primary"/>}</button>;
//   }) : <div className="p-3 text-xs text-muted-foreground">Список людей пуст.</div>}</div></div>;
// }
```

In `MeetingDialog`, delete the `togglePerson` line:

```jsx
// delete: const togglePerson = (id) => field('participantIds', (draft.participantIds||[]).includes(id) ? draft.participantIds.filter((itemId) => itemId !== id) : [...(draft.participantIds||[]), id]);
```

and replace `<PeopleSelector title="Участники" people={people} selected={draft.participantIds||[]} onToggle={togglePerson}/>` with:

```jsx
<PeopleField label="Участники" people={people} value={draft.participantIds||[]} onChange={(ids) => field('participantIds', ids)}/>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/people-field-consistency.test.js`
Expected: PASS (all tests so far)

- [ ] **Step 5: Run the existing architecture test to confirm the technology-page feature checks still pass**

Run: `node --test test/architecture.test.js`
Expected: PASS — specifically the `'технology route restores the Garden event-planning workflow'` test, which requires `'Драйвер / гость'` to still literally appear in the file.

- [ ] **Step 6: Commit**

```bash
git add src/pages/technology.jsx test/people-field-consistency.test.js
git commit -m "refactor: use PeopleField in technology.jsx, remove local PeopleSelector"
```

---

### Task 4: Wire `PeopleField` into `assistant.jsx`, remove local `PeopleChecklist`

**Files:**
- Modify: `src/components/assistant.jsx` (import block, `AssistantCreateDialog`; delete `PeopleChecklist`)
- Test: `test/people-field-consistency.test.js` (append)

**Interfaces:**
- Consumes: `PeopleField` from Task 1, same signature as Task 2.

- [ ] **Step 1: Write the failing test**

Append to `test/people-field-consistency.test.js`:

```js
test('assistant.jsx uses the shared PeopleField and drops the local PeopleChecklist', () => {
  const assistant = read('src/components/assistant.jsx');
  assert.match(assistant, /import \{ PeopleField \} from '@\/components\/people-field'/);
  assert.doesNotMatch(assistant, /function PeopleChecklist/);
  assert.match(assistant, /<PeopleField label="Участники"/);
  assert.match(assistant, /<PeopleField label="Причастные люди"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/people-field-consistency.test.js`
Expected: FAIL on the new test

- [ ] **Step 3: Edit `src/components/assistant.jsx`**

Add the import after the `MentionEditor` import:

```jsx
import { MentionEditor, MentionText } from '@/components/mention-editor';
import { PeopleField } from '@/components/people-field';
```

Delete the `toggleId` helper in `AssistantCreateDialog`:

```jsx
// delete:
// const toggleId = (key, id) => setForm((current) => {
//   const list = Array.isArray(current[key]) ? current[key] : [];
//   return { ...current, [key]: list.includes(id) ? list.filter((value) => value !== id) : [...list, id] };
// });
```

Replace the two `PeopleChecklist` usages:

```jsx
<PeopleField label="Участники" people={people} value={form.participantIds || []} onChange={(ids) => set('participantIds', ids)}/>
```

(replacing `<PeopleChecklist label="Участники" people={people} selected={form.participantIds || []} onToggle={(id) => toggleId('participantIds', id)}/>`), and:

```jsx
<PeopleField label="Причастные люди" people={people} value={form.relatedPersonIds || []} onChange={(ids) => set('relatedPersonIds', ids)}/>
```

(replacing `<PeopleChecklist label="Причастные люди" people={people} selected={form.relatedPersonIds || []} onToggle={(id) => toggleId('relatedPersonIds', id)}/>`).

Delete the `PeopleChecklist` function entirely:

```jsx
// delete: function PeopleChecklist({ label, people, selected, onToggle }) { return <Field label={label}><div className="max-h-40 overflow-auto rounded-md border p-1">{people.filter((p) => p.type === 'team').map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={selected.includes(person.id)} onChange={() => onToggle(person.id)}/><Avatar person={person} size="xs"/><span>{person.name}</span></label>)}</div></Field>; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/people-field-consistency.test.js`
Expected: PASS (all four tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant.jsx test/people-field-consistency.test.js
git commit -m "refactor: use PeopleField in assistant quick-create dialog, remove local PeopleChecklist"
```

---

### Task 5: Full-suite check and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite**

Run: `npm run test:client`
Expected: PASS — this runs `test/architecture.test.js`, `test/theme-contrast.test.js`, and `test/search-natural-language.test.js`; confirm none regressed.

- [ ] **Step 2: Run the full test command**

Run: `npm test`
Expected: PASS — runs every file under `test/`, including the new `test/people-field-consistency.test.js` and the pre-existing suites (`crud-dialog-consistency`, `ui-pattern-consistency`, `accessibility-consistency`, etc.).

- [ ] **Step 3: Start the dev server**

Run: `npm run dev` (background)
Then open the app in a browser.

- [ ] **Step 4: Manually verify all six replaced pickers**

For each of: "Добавить встречу" (Meetings page), "Новое мероприятие" (Technology page), "Драйверы и гости" (Technology page), "Запланировать встречу" (Technology page), Assistant quick "Новая встреча", Assistant quick "Новая проблема" — confirm:
- Typing a name filters the dropdown to matching people, excluding already-selected people.
- Selecting a person adds a removable chip with avatar + name.
- Selecting "Команда" adds every `type: "team"` person not yet selected, each as its own chip.
- Clicking a chip's × removes just that person; `Backspace` in an empty input removes the last chip.
- `↑`/`↓` move the highlighted suggestion, `Enter` selects it, `Escape` closes the dropdown.
- Clicking outside the field closes the dropdown.
- Typing something that matches nobody shows "Никого не найдено."

- [ ] **Step 5: Manually verify the Date field fix**

Open "Добавить встречу" specifically and confirm the "Дата" input now renders at a fixed, compact width next to "Тип" instead of stretching to half the dialog.

- [ ] **Step 6: Report results**

If everything passes, the feature is complete — no further commit needed for this task. If anything fails, fix it in the relevant task's files and re-run the affected tests before re-verifying manually.
