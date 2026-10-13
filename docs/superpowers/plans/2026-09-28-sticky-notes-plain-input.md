# Sticky Notes Plain-Input Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sticky-note component (`src/components/sticky-notes.jsx`) render each note as a plain application input field instead of a colored post-it card, while keeping autosave, drag reorder, delete, and "move to notes"; add unlimited vertical resize and a fullscreen edit mode.

**Architecture:** Single-file React component change plus its co-located stylesheet block. No backend or data-model changes — the `color` field already defaults server-side (`server/routes/comments.js:70`) when omitted, so the frontend simply stops reading/writing it. Verification follows this repo's existing convention: static source-text assertions in `test/client-parity.test.js` (there is no component-rendering test harness in this codebase — see `test/` directory, which is entirely `node:test` + regex assertions on file contents).

**Tech Stack:** React 19, Radix UI `Dialog` (already wrapped in `src/components/ui.jsx`), lucide-react icons, plain CSS (`src/styles.css`), `node --test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-28-sticky-notes-plain-input-design.md`.
- Keep the `sticky-note-card` class name — `test/client-parity.test.js:412` asserts on it.
- No backend/API changes; do not touch `server/routes/comments.js`.
- Do not remove the existing `confirm('Удалить стикер?')` safety check on delete.
- Existing behaviors that must keep working unchanged: autosave debounce (`updateText`/`saveNote`/`flush`), drag-and-drop reorder (`persistOrder`/`dropOn`), the "В заметки" move garden, the empty-state button, the loading state.

---

### Task 1: Strip color and bold/italic formatting from the sticky-note component

**Files:**
- Modify: `src/components/sticky-notes.jsx`
- Modify: `test/client-parity.test.js:399-413` (extend the existing sticky-notes test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `StickyNotes` component with the same exported signature
  `StickyNotes({ entityType, entityId, notesPrefix, onCountChange, addButtonRef, legacyNotes, onLegacyMigrated })` — unchanged. `makeDraft()` now returns `{ id, text:'', canEdit:true, _draft:true }` (no `color`). Later tasks (2, 3) build on this file.

- [ ] **Step 1: Write the failing assertions**

Open `test/client-parity.test.js` and replace the existing test body (lines 399-413) with:

```js
test('task detail uses shared tabs and the shared sticky-notes detail sidebar', () => {
  const tasks = read('src/pages/tasks.jsx');
  const patterns = read('src/components/patterns.jsx');
  const sidebar = read('src/components/detail-sidebar.jsx');
  const sticky = read('src/components/sticky-notes.jsx');
  assert.match(tasks, /<Tabs[\s\S]*?ariaLabel="Разделы задачи"/);
  for (const label of ['План','Ссылки','Связи','Обсуждение']) assert.ok(tasks.includes(`label:'${label}'`), `${label} tab missing`);
  assert.match(tasks, /planItems/);
  assert.match(tasks, /dropPlanItem/);
  assert.match(tasks, /<DetailSidebar/);
  assert.match(tasks, /<StickyNotes/);
  assert.match(patterns, /export function Tabs/);
  assert.match(sidebar, /detail-sidebar-drawer/);
  assert.match(sticky, /sticky-note-card/);
  // Plain-input redesign: no more colored card variants or bold/italic formatting.
  assert.doesNotMatch(sticky, /is-\$\{noteColor/);
  assert.doesNotMatch(sticky, /cycleColor/);
  assert.doesNotMatch(sticky, /sticky-note-formatbar/);
  assert.doesNotMatch(sticky, /from 'lucide-react'.*\bBold\b/s);
  assert.doesNotMatch(sticky, /color:\s*noteColor/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — the current file still contains `cycleColor`, `sticky-note-formatbar`, `is-${noteColor(...)}`, and `color:noteColor(...)`.

- [ ] **Step 3: Remove color and formatting code from the component**

In `src/components/sticky-notes.jsx`:

1. Replace the import line:
```js
import { Bold, BookOpen, Italic, Palette, Plus, Trash2 } from 'lucide-react';
```
with:
```js
import { BookOpen, Maximize2, Plus, Trash2 } from 'lucide-react';
```

2. Delete the `COLORS` array and `noteColor()` function entirely (currently lines 6-10).

3. Replace `makeDraft()`:
```js
function makeDraft() {
  return { id:`draft-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, text:'', canEdit:true, _draft:true };
}
```

4. In the load effect, replace the legacy-notes mapping and migration post call:
```js
      const legacy = (Array.isArray(legacyNotes) ? legacyNotes : [])
        .map((item)=>typeof item === 'string' ? { text:item } : item)
        .filter((item)=>String(item?.text || '').trim());
      if (legacy.length) {
        const known = new Set(next.map((item)=>String(item.text || '').trim()));
        const migrated = [];
        for (const item of legacy) {
          const text = String(item.text || '').trim();
          if (known.has(text)) continue;
          const created = await api.post(baseUrl, { text });
          known.add(text);
          migrated.push(created);
        }
        if (migrated.length) next = [...next, ...migrated];
        await onLegacyMigrated?.();
      }
```

5. In `saveNote`, remove the `color` field from both API calls:
```js
      if (item._draft) {
        const created = await api.post(baseUrl, { text:text.trim() });
        setNotes((current)=>current.map((note)=>note.id===id ? {...created,_saveState:'saved'} : note));
        onCountChange?.(notesRef.current.filter((note)=>!note._draft).length + 1);
      } else {
        const updated = await api.put(`/api/comments/${encodeURIComponent(item.id)}`, { text });
        setNotes((current)=>current.map((note)=>note.id===id ? {...note,...updated,_saveState:'saved'} : note));
      }
```

6. Delete the `cycleColor` function entirely (the one starting `const cycleColor = async (id) => {`).

7. Delete the `surround` function entirely (the one starting `const surround = (event, id, before, after=before) => {`).

Leave everything else (`updateText`, `flush`, `remove`, `moveToNotes`, `persistOrder`, `dropOn`, `formatRelative`) untouched for this step — the render (JSX) still references the old header/color markup and is fixed in Task 2.

- [ ] **Step 4: Run the test to verify the color/formatting assertions now pass**

Run: `node --test test/client-parity.test.js`
Expected: The `is-${noteColor`, `cycleColor`, `sticky-note-formatbar`, `Bold` and `color:noteColor` assertions PASS. (The overall test may still error at this point because the JSX still calls the now-deleted `noteColor`/`cycleColor` — that's expected; Task 2 fixes the render. Confirm via the error message that it's an `noteColor is not defined`-style reference, not a leftover of the removed patterns.)

- [ ] **Step 5: Commit**

```bash
git add src/components/sticky-notes.jsx test/client-parity.test.js
git commit -m "refactor: drop sticky-note color and bold/italic formatting"
```

---

### Task 2: Replace the card header with corner actions, move drag handling to the card, add fullscreen expand

**Files:**
- Modify: `src/components/sticky-notes.jsx`
- Modify: `test/client-parity.test.js` (extend the same test again)

**Interfaces:**
- Consumes: `makeDraft`, `updateText`, `flush`, `remove`, `moveToNotes`, `dropOn`, `formatRelative` from Task 1 (unchanged signatures).
- Produces: the component's JSX now renders `.sticky-note-corner-actions` (with `.sticky-note-expand` and `.sticky-note-delete` buttons) instead of `.sticky-note-head`; the `<article>` itself carries `draggable`/drag handlers; a new `expandedId` state and a `Dialog`-based fullscreen editor are added. Task 3 (CSS) styles these new class names.

- [ ] **Step 1: Write the failing assertions**

Append to the same test in `test/client-parity.test.js` (after the assertions added in Task 1):

```js
  assert.doesNotMatch(sticky, /sticky-note-head/);
  assert.match(sticky, /sticky-note-corner-actions/);
  assert.match(sticky, /sticky-note-expand/);
  assert.match(sticky, /Maximize2/);
  assert.match(sticky, /expandedId/);
  assert.match(sticky, /<Dialog /);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — the component still has `sticky-note-head` and no `sticky-note-corner-actions`/`expandedId`/`Dialog`.

- [ ] **Step 3: Update the import and add expand state**

Replace the `Button, Textarea` import:
```js
import { Button, Textarea } from '@/components/ui';
```
with:
```js
import { Button, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
```

Add an `expandedId` state next to `draggedId`:
```js
  const [draggedId, setDraggedId] = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);
```

- [ ] **Step 4: Close the expand dialog when its note is removed**

In `remove(id)`, after the `onCountChange?.(...)` call, add:
```js
    if (expandedId===id) setExpandedId(null);
```
so `remove` becomes:
```js
  const remove = async (id) => {
    const item = notesRef.current.find((note)=>note.id===id);
    if (!item) return;
    if (!item._draft && !confirm('Удалить стикер?')) return;
    if (!item._draft) await api.del(`/api/comments/${encodeURIComponent(id)}`);
    setNotes((current)=>current.filter((note)=>note.id!==id));
    onCountChange?.(Math.max(0, notesRef.current.filter((note)=>!note._draft).length - (item._draft ? 0 : 1)));
    if (expandedId===id) setExpandedId(null);
  };
```

Do the same in `moveToNotes(id)`, right after its `onCountChange?.(...)` call inside the `try` block:
```js
    try {
      if (!item._draft) await api.del(`/api/comments/${encodeURIComponent(id)}`);
      setNotes((current)=>current.filter((note)=>note.id!==id));
      onCountChange?.(Math.max(0, notesRef.current.filter((note)=>!note._draft).length - (item._draft ? 0 : 1)));
      if (expandedId===id) setExpandedId(null);
    } catch (error) {
```

- [ ] **Step 5: Replace the render**

Replace everything from `if (loading) return ...` to the end of the file with:

```js
  if (loading) return <div className="sticky-notes-loading">Загрузка…</div>;

  const expandedNote = notes.find((note)=>note.id===expandedId) || null;

  return <div className="sticky-notes-list">
    {notes.map((note)=><article
      key={note.id}
      className={`sticky-note-card ${note._draft?'is-draft':''} ${draggedId===note.id?'is-dragging':''}`}
      draggable={!note._draft}
      onDragStart={(event)=>{ if (event.target.closest('button')) { event.preventDefault(); return; } setDraggedId(note.id); event.dataTransfer.effectAllowed='move'; }}
      onDragEnd={()=>setDraggedId(null)}
      onDragOver={(event)=>event.preventDefault()}
      onDrop={()=>dropOn(note.id)}
      title={note._draft ? undefined : 'Перетащить стикер'}
    >
      <div className="sticky-note-corner-actions">
        <button type="button" className="sticky-note-expand" onClick={()=>setExpandedId(note.id)} title="Развернуть на весь экран" aria-label="Развернуть на весь экран"><Maximize2 className="h-3.5 w-3.5"/></button>
        <button type="button" className="sticky-note-delete" onClick={()=>remove(note.id)} title="Удалить стикер" aria-label="Удалить стикер"><Trash2 className="h-3.5 w-3.5"/></button>
      </div>
      <Textarea className="sticky-note-editor" value={note.text || ''} onChange={(event)=>updateText(note.id,event.target.value)} onBlur={()=>flush(note.id)} placeholder="Напишите заметку…" rows={4}/>
      <div className="sticky-note-footer">
        <span className="sticky-note-save-state">{note._saveState==='saving'?'Сохраняю…':note._saveState==='saved'?'Сохранено':note._saveState==='error'?'Не сохранено':note._draft?'':formatRelative(note.updatedAt || note.createdAt)}</span>
        <button type="button" className="sticky-note-notes" onClick={()=>moveToNotes(note.id)} disabled={!String(note.text||'').trim()}><BookOpen className="h-3.5 w-3.5"/><span>В заметки</span></button>
      </div>
    </article>)}
    {!notes.length && <button type="button" className="sticky-notes-empty" onClick={addDraft}><Plus className="h-4 w-4"/>Добавить первый стикер</button>}

    <Dialog open={!!expandedNote} onOpenChange={(open)=>{ if (!open) { if (expandedId) flush(expandedId); setExpandedId(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Стикер</DialogTitle></DialogHeader>
        {expandedNote && <Textarea
          className="sticky-note-expand-editor"
          value={expandedNote.text || ''}
          onChange={(event)=>updateText(expandedNote.id, event.target.value)}
          placeholder="Напишите заметку…"
          autoFocus
        />}
      </DialogContent>
    </Dialog>
  </div>;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/sticky-notes.jsx test/client-parity.test.js
git commit -m "feat: sticky notes get corner delete/expand actions and a fullscreen editor"
```

---

### Task 3: Restyle to a plain input field, remove the height cap, style new elements

**Files:**
- Modify: `src/styles.css:4162-4299` (the `/* Sticky notes — shared React implementation... */` block)

**Interfaces:**
- Consumes: class names produced by Task 2 (`sticky-note-card`, `sticky-note-corner-actions`, `sticky-note-expand`, `sticky-note-delete`, `sticky-note-editor`, `sticky-note-footer`, `sticky-note-save-state`, `sticky-note-notes`, `sticky-notes-empty`, `sticky-notes-loading`, `sticky-note-expand-editor`).
- Produces: nothing consumed by later tasks (this is the last code task).

- [ ] **Step 1: Replace the CSS block**

Replace the entire block from `/* Sticky notes — shared React implementation based on Garden Stable. */` through the `@media (prefers-reduced-motion: reduce)` rule that follows it (currently `src/styles.css:4162-4299`) with:

```css
/* Sticky notes — shared React implementation based on Garden Stable. */
.detail-sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sticky-notes-list {
  display: grid;
  gap: 9px;
  align-content: start;
}
.sticky-note-card {
  position: relative;
  min-width: 0;
  padding: 9px 10px 7px;
  border: 1px solid hsl(var(--border) / .9);
  border-radius: 8px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  cursor: grab;
  transition: border-color .14s ease, opacity .14s ease;
}
.sticky-note-card:hover,
.sticky-note-card:focus-within { border-color: hsl(var(--ring) / .5); }
.sticky-note-card.is-dragging { opacity: .42; cursor: grabbing; }
.sticky-note-card.is-draft { cursor: default; }
.sticky-note-corner-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transition: opacity .14s ease;
}
.sticky-note-card:hover .sticky-note-corner-actions,
.sticky-note-card:focus-within .sticky-note-corner-actions { opacity: 1; }
.sticky-note-corner-actions button {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: hsl(var(--background));
  cursor: pointer;
}
.sticky-note-expand { color: hsl(var(--muted-foreground)); }
.sticky-note-expand:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.sticky-note-delete { color: hsl(var(--muted-foreground) / .55); }
.sticky-note-delete:hover { background: hsl(var(--destructive) / .12); color: hsl(var(--destructive)); }
.sticky-note-editor,
.sticky-note-editor:hover,
.sticky-note-editor:focus,
.sticky-note-editor:focus-visible {
  display: block;
  width: 100%;
  min-height: 72px !important;
  padding: 2px 52px 2px 1px !important;
  border: 0 !important;
  border-radius: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
  resize: vertical;
  overflow: auto;
  background: transparent !important;
  color: inherit !important;
  cursor: text;
  font-size: 12px !important;
  line-height: 1.45 !important;
}
.sticky-note-editor::placeholder { color: hsl(var(--muted-foreground) / .65); }
.sticky-note-footer {
  display: flex;
  min-height: 22px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid hsl(var(--border) / .5);
}
.sticky-note-save-state { min-width: 0; font-size: 9px; color: hsl(var(--muted-foreground)); }
.sticky-note-notes {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 3px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 9.5px;
  cursor: pointer;
}
.sticky-note-notes:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.sticky-note-notes:disabled { opacity: .35; cursor: default; }
.sticky-notes-empty {
  display: flex;
  width: 100%;
  min-height: 72px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.sticky-notes-empty:hover { color: hsl(var(--foreground)); background: hsl(var(--muted) / .25); }
.sticky-notes-loading { padding: 8px 0; font-size: 12px; color: hsl(var(--muted-foreground)); }
.sticky-note-expand-editor,
.sticky-note-expand-editor:focus,
.sticky-note-expand-editor:focus-visible {
  min-height: min(70vh, 640px);
  resize: vertical;
  font-size: 13px;
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .sticky-note-card, .sticky-note-corner-actions { transition: none; }
}
```

This removes the `--sticky-yellow/pink/blue/green` variables and the four `.sticky-note-card.is-*` background rules (no longer referenced anywhere — confirmed by grepping `--sticky-` in `src/styles.css` before this change), drops `max-height: 220px` from the editor so it can be resized without limit, and adds styles for the new corner-action buttons and the fullscreen dialog's textarea.

- [ ] **Step 2: Run the CSS syntax test**

Run: `node --test test/css-syntax.test.js`
Expected: PASS (confirms the replacement block is syntactically valid and didn't break brace balance elsewhere in the file).

- [ ] **Step 3: Run the full client test suite**

Run: `node --test`
Expected: All tests PASS, including the sticky-notes assertions from Tasks 1-2.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "style: sticky notes look like a plain input field with unlimited resize"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL (Vite prints something like `http://localhost:5173`).

- [ ] **Step 2: Navigate to a sticky-notes panel**

Go to **Ресурсы** (Resources) → open any team member's person page → open the **«Стикеры»** side panel (toggle button near the top of the person page). This mounts `<StickyNotes entityType="person" ... />` (`src/pages/resources.jsx:765-772`).

- [ ] **Step 3: Verify the plain-input look**

- Confirm notes render as bordered fields matching the app's other inputs (no yellow/pink/blue/green backgrounds, no shadow).
- Click "Добавить стикер" (or the panel's `+` header action) and confirm a new empty field appears, ready to type.

- [ ] **Step 4: Verify corner actions**

- Hover over a note: confirm two small icons (expand, delete) fade in at the top-right corner, with a visible gap between them.
- Click delete on an existing (saved) note: confirm the `Удалить стикер?` browser confirm dialog appears; cancel it and confirm the note remains.

- [ ] **Step 5: Verify unlimited resize**

- Drag the note's bottom-right resize handle downward repeatedly. Confirm the field keeps growing past the old 220px cap with no upper limit.

- [ ] **Step 6: Verify the fullscreen expand**

- Click the expand icon. Confirm a centered modal opens over a dimmed backdrop with a large text field containing the same text.
- Type additional text in the modal; confirm the save-state indicator on the underlying card updates after closing (autosave still fires).
- Close the modal via the built-in close button, via clicking the backdrop, and via Escape — confirm each closes it and preserves the typed text back in the inline field.

- [ ] **Step 7: Verify drag reorder still works**

- Drag a note (grabbing it anywhere on its border/background, not on its text or buttons) and drop it onto another note. Confirm the order changes and persists after a page reload.

- [ ] **Step 8: Verify "В заметки" is unaffected**

- Type text into a note, click "В заметки". Confirm the confirm dialog appears, and on confirm the note is removed and the text appears in the Журнал/Заметки section.

No code changes result from this task — if any check fails, note which step failed and fix the relevant Task (1-3) before proceeding.
