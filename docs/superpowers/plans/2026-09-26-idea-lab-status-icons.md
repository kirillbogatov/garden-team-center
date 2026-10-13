# Idea/Lab Status Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ideas and workshop-project ("Мастерская") list rows a clickable status glyph to the left of the title, matching the existing task-status pattern, and drop the redundant text badge from that row.

**Architecture:** Reuse the existing generic `StatusControl`/`useEntityStatus` machinery (already resource-agnostic) by adding two thin wrapper components, `IdeaStatusIcon`/`LabStatusIcon`, plus one shared glyph component `IdeaStatusGlyph` that delegates to the existing `TaskStatusGlyph` for the three status values (`in_progress`/`paused`/`done`) whose meaning and color already match tasks, and special-cases the two values with no task analog (`idea` → 💡, `rejected` → muted ×). Wire the new icon into `LabListRow`'s `leading` slot (replacing the `StatusBadge` there) in `src/pages/workspace.jsx`.

**Tech Stack:** React (no new dependencies), plain CSS, existing `node --test` source-assertion test style used by this codebase (`test/client-parity.test.js`, `test/use-entity-status.test.js` — these assert against the raw file text rather than rendering components; follow that convention, don't introduce a new render-testing setup).

## Global Constraints

- Text-glyph style only (no lucide icons) for these statuses, confirmed by user.
- The `idea`/"Новая"/"Идея" status glyph is the emoji 💡, not the task's dashed-circle "todo" glyph.
- The `rejected`/"Отклонена" status (ideas only, no lab equivalent) uses the same "×" character as the task `blocked` glyph, but in a muted gray, not red — it must look visually distinct from `blocked`.
- Card view (`LabCard`) and `WorkshopDetailPage` keep their existing `<StatusBadge>` — this plan only touches the **list** row (`LabListRow`).
- No server-side changes — status values are validated client-side only (see `src/lib/domain.js`'s `IDEA_STATUS_LABEL`/`LAB_STATUS_LABEL`, already complete).
- Spec: `docs/superpowers/specs/2026-09-26-idea-lab-status-icons-design.md`.

---

### Task 1: Add `IdeaStatusGlyph`, `IdeaStatusIcon`, `LabStatusIcon` to `status.jsx` + CSS

**Files:**
- Modify: `src/components/status.jsx` (add after `TaskStatusGlyph`, ~line 61, and after `TaskStatusIcon`, ~line 110)
- Modify: `src/styles.css` (add after `.task-status-glyph-done`, ~line 713)
- Test: `test/use-entity-status.test.js`

**Interfaces:**
- Consumes: `StatusControl` (existing, `src/components/status.jsx`, signature `{ resource, id, status, validValues, fallback, glyphFor, labelFor, options, onStatusChange, onChanged, disabled, className, menuClassName }`), `TaskStatusGlyph` (existing, `{ status, className }`), `IDEA_STATUS_LABEL`/`LAB_STATUS_LABEL` (existing, already imported in this file at the top from `@/lib/domain`).
- Produces: `IdeaStatusGlyph({ status, className })`, `IdeaStatusIcon({ lab, labId, status, onChanged, disabled, className })`, `LabStatusIcon({ lab, labId, status, onChanged, disabled, className })` — all exported from `src/components/status.jsx`. `IdeaStatusIcon`/`LabStatusIcon` both accept `status` values matching the keys of `IDEA_STATUS_LABEL`/`LAB_STATUS_LABEL` respectively (`idea`/`in_progress`/`paused`/`done`, plus `rejected` for ideas only).

- [ ] **Step 1: Write the failing test**

Open `test/use-entity-status.test.js` and change the `for (const name of [...])` loop in the first test to also cover the two new components:

```js
test('TaskStatusIcon, IssueStatusIcon, ProcessStatusIcon, AgreementStatusIcon, IdeaStatusIcon, LabStatusIcon share one StatusControl implementation', () => {
  assert.match(status, /function StatusControl\(/);
  for (const name of ['TaskStatusIcon', 'IssueStatusIcon', 'ProcessStatusIcon', 'AgreementStatusIcon', 'IdeaStatusIcon', 'LabStatusIcon']) {
    const start = status.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, `${name} not found`);
    const end = status.indexOf('\n}', start);
    const body = status.slice(start, end);
    assert.match(body, /<StatusControl/, `${name} should delegate to StatusControl`);
  }
  assert.match(hook, /export function useEntityStatus/);
});
```

Also append a second new test to the same file, asserting the glyph choices this spec requires:

```js
test('idea/lab status glyphs cover the new idea (💡) and rejected (muted ×) symbols', () => {
  const start = status.indexOf('export function IdeaStatusGlyph(');
  assert.ok(start >= 0, 'IdeaStatusGlyph not found');
  const end = status.indexOf('\n}', start);
  const body = status.slice(start, end);
  assert.match(body, /💡/);
  assert.match(body, /idea-status-glyph-rejected/);
  assert.match(body, /<TaskStatusGlyph/, 'should delegate in_progress/paused/done to the existing task glyph');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/use-entity-status.test.js`
Expected: FAIL — `IdeaStatusIcon not found` (first test) and `IdeaStatusGlyph not found` (second test).

- [ ] **Step 3: Implement the glyph component**

In `src/components/status.jsx`, insert immediately after the closing brace of `TaskStatusGlyph` (currently ends at line 61):

```js
export function IdeaStatusGlyph({ status = 'idea', className }) {
  if (status === 'idea') return <span aria-hidden="true" className={cn('task-status-glyph', 'idea-status-glyph-idea', className)}>💡</span>;
  if (status === 'rejected') return <span aria-hidden="true" className={cn('task-status-glyph', 'idea-status-glyph-rejected', className)}>×</span>;
  return <TaskStatusGlyph status={status} className={className} />;
}
```

(`in_progress`/`paused`/`done` are valid keys in `TASK_STATUS_LABEL` too, so the delegated `TaskStatusGlyph` call renders the matching blue ◐ / amber Ⅱ / green ✓ without duplicating the symbol table.)

- [ ] **Step 4: Implement the two icon wrappers**

Insert immediately after the closing brace of `TaskStatusIcon` (currently ends at line 110):

```js
export function IdeaStatusIcon({ lab, labId, status, onChanged, disabled = false, className }) {
  const id = labId || lab?.id;
  const incoming = status || lab?.status || 'idea';
  return <StatusControl
    resource="labs" id={id} status={incoming} fallback="idea"
    validValues={Object.keys(IDEA_STATUS_LABEL)}
    options={Object.keys(IDEA_STATUS_LABEL)}
    glyphFor={(value) => <IdeaStatusGlyph status={value} />}
    labelFor={(value) => IDEA_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

export function LabStatusIcon({ lab, labId, status, onChanged, disabled = false, className }) {
  const id = labId || lab?.id;
  const incoming = status || lab?.status || 'idea';
  return <StatusControl
    resource="labs" id={id} status={incoming} fallback="idea"
    validValues={Object.keys(LAB_STATUS_LABEL)}
    options={Object.keys(LAB_STATUS_LABEL)}
    glyphFor={(value) => <IdeaStatusGlyph status={value} />}
    labelFor={(value) => LAB_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}
```

Both resources are `'labs'` because ideas and workshop projects are the same backend collection, discriminated by `entityType` (see `docs/superpowers/specs/2026-09-26-idea-lab-status-icons-design.md`, Context section).

- [ ] **Step 5: Add the CSS**

In `src/styles.css`, insert immediately after the `.task-status-glyph-done { color: #3f9364; font-size: 18px; }` rule (currently line 713):

```css
.idea-status-glyph-idea { font-size: 15px; }
.idea-status-glyph-rejected { color: hsl(var(--muted-foreground)); font-size: 22px; font-weight: 500; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/use-entity-status.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Commit**

```bash
git add src/components/status.jsx src/styles.css test/use-entity-status.test.js
git commit -m "feat: add IdeaStatusIcon/LabStatusIcon status glyphs"
```

---

### Task 2: Wire the icon into the ideas/workshop list row, drop the text badge there

**Files:**
- Modify: `src/pages/workspace.jsx` (`LabsPage`'s list-view render call, and `LabListRow`, currently lines 78 and 115-123)
- Test: `test/client-parity.test.js`

**Interfaces:**
- Consumes: `IdeaStatusIcon`, `LabStatusIcon` (from Task 1, `src/components/status.jsx`, signature `{ lab, labId, status, onChanged, disabled, className }`), `state.reload` (existing, `useResource('labs')` return value in `LabsPage`, already used the same way `TaskEntityRow`'s `onStatusChanged` prop is fed `state.reload`/`tasks.reload` elsewhere — see `src/pages/home.jsx:55`, `src/pages/resources.jsx:632`).
- Produces: `LabListRow` gains a `leading` icon and drops its `<StatusBadge>`; no change to `LabListRow`'s exported shape (it's a local, unexported function), but its prop list gains `onStatusChanged`.

- [ ] **Step 1: Write the failing test**

Append to `test/client-parity.test.js`:

```js
test('idea and workshop-project status is a Garden-style clickable icon in the list row', () => {
  const status = read('src/components/status.jsx');
  const workspace = read('src/pages/workspace.jsx');
  assert.match(status, /export function IdeaStatusIcon/);
  assert.match(status, /export function LabStatusIcon/);
  const listRowStart = workspace.indexOf('function LabListRow(');
  const listRowEnd = workspace.indexOf('\n}', listRowStart);
  const listRow = workspace.slice(listRowStart, listRowEnd);
  assert.match(listRow, /leading=\{isIdea \? <IdeaStatusIcon/);
  assert.doesNotMatch(listRow, /<StatusBadge/);
  assert.match(workspace, /<LabListRow key=\{item\.id\}[\s\S]*?onStatusChanged=\{state\.reload\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — `leading={isIdea ? <IdeaStatusIcon` not found (current `LabListRow` has no `leading` prop and still renders `<StatusBadge>`).

- [ ] **Step 3: Import the new icons**

In `src/pages/workspace.jsx`, change line 13 from:

```js
import { StatusBadge } from '@/components/status';
```

to:

```js
import { IdeaStatusIcon, LabStatusIcon, StatusBadge } from '@/components/status';
```

(`StatusBadge` stays imported — `LabCard` and `WorkshopDetailPage` still use it.)

- [ ] **Step 4: Pass `onStatusChanged` from `LabsPage` into `LabListRow`**

In `src/pages/workspace.jsx`, the list-view render call (currently line 78, inside the `viewMode === 'cards' ? ... : <div className="entity-list">{items.map(...)}</div>` ternary) changes from:

```jsx
<LabListRow key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} onOpen={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)}/>
```

to:

```jsx
<LabListRow key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} onOpen={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)} onStatusChanged={state.reload}/>
```

- [ ] **Step 5: Rewrite `LabListRow`**

Replace the current `LabListRow` function (lines 115-123):

```jsx
function LabListRow({ item, isIdea, author, onOpen, onEdit, onDelete }) {
  return <EntityRow
    className={isIdea ? undefined : 'workshop-list-row'}
    onOpen={isIdea ? undefined : onOpen}
    title={<MentionText text={item.title}/>}
    meta={isIdea ? [author?.name || 'Автор не указан'] : []}
    trailing={<div className="workshop-list-trailing flex items-center gap-1">{author&&<Avatar person={author} size="xs"/>}{!isIdea&&<div className="workshop-list-tree hidden justify-center lg:flex"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}<StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/>{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать идею"><Pencil className="h-3.5 w-3.5"/></Button>}{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Удалить идею"><Trash2 className="h-3.5 w-3.5"/></Button>}</div>}
  />;
}
```

with:

```jsx
function LabListRow({ item, isIdea, author, onOpen, onEdit, onDelete, onStatusChanged }) {
  return <EntityRow
    className={isIdea ? undefined : 'workshop-list-row'}
    onOpen={isIdea ? undefined : onOpen}
    leading={isIdea ? <IdeaStatusIcon labId={item.id} status={item.status || 'idea'} onChanged={onStatusChanged}/> : <LabStatusIcon labId={item.id} status={item.status || 'idea'} onChanged={onStatusChanged}/>}
    title={<MentionText text={item.title}/>}
    meta={isIdea ? [author?.name || 'Автор не указан'] : []}
    trailing={<div className="workshop-list-trailing flex items-center gap-1">{author&&<Avatar person={author} size="xs"/>}{!isIdea&&<div className="workshop-list-tree hidden justify-center lg:flex"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать идею"><Pencil className="h-3.5 w-3.5"/></Button>}{isIdea&&<Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Удалить идею"><Trash2 className="h-3.5 w-3.5"/></Button>}</div>}
  />;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Run the full client test suite for regressions**

Run: `npm run test:client`
Expected: PASS. If anything unrelated fails, stop and investigate before continuing (per `superpowers:systematic-debugging`) — don't paper over a pre-existing failure.

- [ ] **Step 8: Manual verification in the running app**

Start the API server (`npm start`) and the Vite dev server (`npm run dev`) in two terminals, open the app in a browser, and check:
1. Open `/ideas`, switch to "Список" (list) view. Confirm each row shows a small glyph left of the title (💡 for "Новая", ◐/Ⅱ/✓ for in-progress/paused/done, muted × for "Отклонена" if any test data has that status) and no text badge.
2. Click a glyph — confirm a dropdown opens listing all 5 idea statuses with a checkmark on the current one, and selecting a different one updates the glyph in place without a full page reload.
3. Repeat on `/workshop` list view — confirm the same interaction with the 4 lab statuses (no "Отклонена" option), and that the "growth tree" and avatar in the trailing area still render correctly.
4. Confirm card view (`/ideas` and `/workshop` in "cards" mode) still shows the original text `<StatusBadge>` — unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/pages/workspace.jsx test/client-parity.test.js
git commit -m "feat: show clickable status icon in idea/workshop list rows"
```
