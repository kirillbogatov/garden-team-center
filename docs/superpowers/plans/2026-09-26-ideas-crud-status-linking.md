# Ideas: edit/delete icons, rejected status, project linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ideas on the "Идеи" page (`LabsPage` in `src/pages/workspace.jsx`, `mode="ideas"`) edit and delete icons on their row/card, a 5th "Отклонена" (rejected) status, and the ability to attach an idea to either a Мастерская (workshop) project or a real work project.

**Architecture:** A new `IdeaCrudDialog` (built on the existing `useCrudDialogForm` hook, same shape as `ProjectCrudDialog`/`ResourceCrudDialog`) handles idea create+edit+delete in one dialog. Pencil/Trash2 icon buttons are added to the existing idea list row and idea card. A standalone delete confirm (`AlertDialog`) lets the Trash2 icon delete directly, without requiring the edit dialog to be opened first. No backend code changes are needed — the generic `PUT/DELETE /api/labs/:id` routes already accept arbitrary fields and are already ownership-checked.

**Tech Stack:** React (no build-time type checking), `useCrudDialogForm` hook, `node:test` for both API tests and source-text "consistency" tests (this repo's established style for frontend checks — see `test/crud-dialog-consistency.test.js`, `test/no-native-confirm.test.js`, etc. — none of the existing test files render JSX; they all assert against raw source text).

## Global Constraints

- Reference spec: `docs/superpowers/specs/2026-09-26-ideas-crud-status-linking-design.md` — every task below implements one part of it.
- `LAB_STATUS_LABEL` (workshop projects' 4 statuses) must NOT change — only `IDEA_STATUS_LABEL` gains the 5th "Отклонена"/`rejected` status.
- No new detail page/route for ideas. No inline quick status-changer. No backlink UI on `ProjectDetailPage`/`WorkshopDetailPage`.
- Follow the existing guarded-title convention for any `AlertDialog` that is mounted unconditionally (i.e., even while its own `item`/target is `null`): `` `Удалить «${item ? titleOf(item) : ''}»?` `` — never `titleOf(item)` unguarded, per `test/no-native-confirm.test.js`.
- Run `npm test` after every task; all pre-existing tests must stay green alongside the new ones.

---

### Task 1: Add the "Отклонена" (rejected) idea status

**Files:**
- Modify: `src/lib/domain.js:46`
- Modify: `src/components/status.jsx:20`
- Test: `test/ideas-crud-consistency.test.js` (new file — created in this task, extended in later tasks)

**Interfaces:**
- Produces: `IDEA_STATUS_LABEL.rejected === 'Отклонена'` (consumed by Task 3's status `<Select>` and by `StatusBadge`/the existing status filter dropdown, both of which already iterate `Object.entries(IDEA_STATUS_LABEL)` / `labelsByKind.idea`).

- [ ] **Step 1: Write the failing test**

Create `test/ideas-crud-consistency.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ideas gain a fifth "rejected" status; workshop projects keep their existing four', () => {
  const domain = read('src/lib/domain.js');
  const status = read('src/components/status.jsx');
  assert.match(domain, /IDEA_STATUS_LABEL = \{[^}]*rejected: 'Отклонена'/);
  assert.doesNotMatch(domain, /LAB_STATUS_LABEL = \{[^}]*rejected/);
  assert.match(status, /idea: \{[^}]*rejected: 'danger'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="rejected"` (or `node --test test/ideas-crud-consistency.test.js`)
Expected: FAIL — `IDEA_STATUS_LABEL`/`variantMap.idea` don't contain `rejected` yet.

- [ ] **Step 3: Implement**

In `src/lib/domain.js`, change line 46 from:
```js
export const IDEA_STATUS_LABEL = { idea: 'Новая', in_progress: 'В работе', paused: 'Отложена', done: 'Готово' };
```
to:
```js
export const IDEA_STATUS_LABEL = { idea: 'Новая', in_progress: 'В работе', paused: 'Отложена', done: 'Готово', rejected: 'Отклонена' };
```

In `src/components/status.jsx`, change line 20 from:
```js
  idea: { idea: 'muted', in_progress: 'default', paused: 'warning', done: 'success' },
```
to:
```js
  idea: { idea: 'muted', in_progress: 'default', paused: 'warning', done: 'success', rejected: 'danger' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ideas-crud-consistency.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain.js src/components/status.jsx test/ideas-crud-consistency.test.js
git commit -m "feat: add rejected status for ideas"
```

---

### Task 2: API regression test for idea→work-project linking and the rejected status

This task adds a regression test only — no production code changes. The generic collection routes (`server/routes/crud.js` → `server/application/resource-service.js`) already accept and persist arbitrary fields on `labs` records and are already ownership-checked (see `server/access-control.js`'s `isOwnItem('labs', ...)`), so a new `projectId` field and a `status: 'rejected'` value round-trip with zero backend changes. This test locks that behavior in so a future change (e.g., adding field whitelisting to `labs`) can't silently break it.

**Files:**
- Modify: `test/api.test.js` (append new test after the existing `'Lab ideas attach to a project and comments can be created'` test, currently ending at line 115)

**Interfaces:**
- Consumes: the `request(url, options)` helper already defined at the top of `test/api.test.js` (returns `{ response, body }`, reuses the module-level admin session cookie).

- [ ] **Step 1: Write the test**

Insert after the test ending at `test/api.test.js:115` (the `'Lab ideas attach to a project and comments can be created'` test):

```js
test('idea can link to a work project via projectId and take the rejected status', async () => {
  const project = (await request('/api/projects', {
    method: 'POST', body: { name: 'Ideas Target Project', status: 'active', projectKey: 'IDPJ' },
  })).body;
  const idea = await request('/api/labs', {
    method: 'POST', body: { title: 'Linked idea', entityType: 'idea', projectId: project.id, status: 'idea', private: false },
  });
  assert.equal(idea.response.status, 201);
  assert.equal(idea.body.projectId, project.id);
  assert.equal(idea.body.labProjectId, undefined);

  const rejected = await request(`/api/labs/${encodeURIComponent(idea.body.ideaKey)}`, { method: 'PUT', body: { status: 'rejected' } });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.status, 'rejected');
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- --test-name-pattern="rejected status"` (or `node --test test/api.test.js`)
Expected: PASS immediately (this confirms the generic CRUD routes need no backend change for this feature).

- [ ] **Step 3: Commit**

```bash
git add test/api.test.js
git commit -m "test: cover idea projectId linking and rejected status via the API"
```

---

### Task 3: `IdeaCrudDialog` — create+edit dialog with the attach-to-project field

**Files:**
- Modify: `src/pages/workspace.jsx`
- Test: `test/ideas-crud-consistency.test.js` (extend)

**Interfaces:**
- Consumes: `useCrudDialogForm({ resource, open, item, buildDraft, validate, buildPayload, onOpenChange, onSaved, mapSaveError })` from `src/hooks/use-crud-dialog-form.js` (returns `{ isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen }` — already used elsewhere in this file for `CreateLabDialog`/`EditWorkshopProjectDialog`). `IDEA_STATUS_LABEL` from `src/lib/domain.js` (already imported in this file). `titleOf` from `src/lib/utils.js` (already imported).
- Produces: `function IdeaCrudDialog({ open, onOpenChange, item, people, projects, workshopProjects, onSaved })` — a single component used for both create (`item={null}`) and edit (`item={<idea record>}`). Later tasks pass `workshopProjects` = `labs` items where `entityType !== 'idea'`, and `projects` = the `projects` resource's `.data` (real work projects — same array already passed to `MentionEditor` elsewhere in this file).

- [ ] **Step 1: Write the failing test**

Extend `test/ideas-crud-consistency.test.js` (append these two tests):

```js
test('IdeaCrudDialog exists, shares useCrudDialogForm, and guards its delete-confirm title', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /function IdeaCrudDialog/);
  assert.match(workspace, /title=\{`Удалить идею «\$\{item \? titleOf\(item\) : ''\}»\?`\}/);
});

test('idea attach-to-project field offers Мастерская and work-project options, mutually exclusive', () => {
  const workspace = read('src/pages/workspace.jsx');
  for (const label of ['Без проекта', 'Проект Мастерской', 'Рабочий проект']) {
    assert.ok(workspace.includes(label), `attach-to-project option "${label}" is missing`);
  }
});

test('"Только идеи без проектов" filter also considers a linked work project', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /!item\.labProjectId && !item\.projectId/);
});

test('idea creation no longer goes through the shared isIdea-branched CreateLabDialog', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.doesNotMatch(workspace, /CreateLabDialog[\s\S]{0,40}isIdea/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ideas-crud-consistency.test.js`
Expected: FAIL — `IdeaCrudDialog` doesn't exist yet, `CreateLabDialog` is still `isIdea`-branched, filter still reads `!item.labProjectId` alone.

- [ ] **Step 3: Implement — imports and state**

In `src/pages/workspace.jsx`, change the icon import (line 3) from:
```js
import { ArrowLeft, CalendarDays, ExternalLink, FlaskConical, History, Lightbulb, MessageSquare, Pencil, Plus, Search, Sparkles } from 'lucide-react';
```
to:
```js
import { ArrowLeft, CalendarDays, ExternalLink, FlaskConical, History, Lightbulb, MessageSquare, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
```

Change the `ui` import (line 12) from:
```js
import { Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
```
to:
```js
import { AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
```

In `LabsPage`, change the `onlyUnassigned` filter line (line 51) from:
```js
    .filter((item) => !isIdea || !onlyUnassigned || !item.labProjectId)
```
to:
```js
    .filter((item) => !isIdea || !onlyUnassigned || (!item.labProjectId && !item.projectId))
```

- [ ] **Step 4: Implement — `IdeaCrudDialog` component**

Add this new function in `src/pages/workspace.jsx`, directly after the `CreateLabDialog` function (which Task 3 Step 5 below is about to simplify — add `IdeaCrudDialog` right after it either way):

```jsx
function IdeaCrudDialog({ open, onOpenChange, item, people, projects, workshopProjects, onSaved }) {
  const isEdit = Boolean(item?.id);
  const { draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'labs', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({
      title: current?.title || '',
      description: current?.description || '',
      status: current?.status || 'idea',
      authorId: current?.authorId || 'none',
      private: Boolean(current?.private),
      linkType: current?.projectId ? 'project' : current?.labProjectId ? 'lab' : 'none',
      labProjectId: current?.labProjectId || 'none',
      projectId: current?.projectId || 'none',
    }),
    validate: (d) => (!String(d.title || '').trim() ? 'Укажите название идеи.' : null),
    buildPayload: (d) => ({
      entityType: 'idea',
      title: d.title.trim(),
      description: d.description || '',
      ...(isEdit ? { status: d.status || 'idea' } : {}),
      authorId: d.authorId === 'none' ? null : d.authorId,
      private: Boolean(d.private),
      labProjectId: d.linkType === 'lab' ? (d.labProjectId === 'none' ? null : d.labProjectId) : null,
      projectId: d.linkType === 'project' ? (d.projectId === 'none' ? null : d.projectId) : null,
    }),
    mapSaveError: (e) => e?.message || 'Не удалось сохранить идею.',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{isEdit ? 'Редактировать идею' : 'Новая идея'}</DialogTitle></DialogHeader><div className="mt-3 space-y-4">
    <div><Label>Название</Label><Input className="mt-1.5" autoFocus value={draft.title || ''} onChange={(e)=>field('title', e.target.value)} placeholder="Коротко сформулируйте мысль"/></div>
    <div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description || ''} onChange={(value)=>field('description', value)} people={people} projects={projects} placeholder="Контекст, гипотеза, ожидаемый результат…" ariaLabel="Описание идеи"/></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label>Автор</Label><Select value={draft.authorId || 'none'} onValueChange={(value)=>field('authorId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{people.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      {isEdit && <div><Label>Статус</Label><Select value={draft.status || 'idea'} onValueChange={(value)=>field('status', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(IDEA_STATUS_LABEL).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label>Привязать к</Label><Select value={draft.linkType || 'none'} onValueChange={(value)=>field('linkType', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без проекта</SelectItem><SelectItem value="lab">Проект Мастерской</SelectItem><SelectItem value="project">Рабочий проект</SelectItem></SelectContent></Select></div>
      {draft.linkType === 'lab' && <div><Label>Проект Мастерской</Label><Select value={draft.labProjectId || 'none'} onValueChange={(value)=>field('labProjectId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не выбран</SelectItem>{workshopProjects.map((p)=><SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>}
      {draft.linkType === 'project' && <div><Label>Рабочий проект</Label><Select value={draft.projectId || 'none'} onValueChange={(value)=>field('projectId', value)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не выбран</SelectItem>{projects.map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.private)} onChange={(e)=>field('private', e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]"/><span>Приватная идея</span></label>
    {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
  </div><DialogFooter className="justify-between"><div>{isEdit && <Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving || !String(draft.title || '').trim()}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить идею «${item ? titleOf(item) : ''}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}
```

- [ ] **Step 5: Implement — simplify `CreateLabDialog` to workshop-only**

Replace the `CreateLabDialog` function (originally at lines 83-92) — currently branched on an `isIdea` prop — with a workshop-only version:

```jsx
function CreateLabDialog({ open, onOpenChange, people, projects, onCreated }) {
  const { draft, field, saving, save } = useCrudDialogForm({
    resource: 'labs', open, item: null, onOpenChange, onSaved: onCreated,
    buildDraft: () => ({ title: '', description: '', author: 'none' }),
    validate: (d) => (!String(d.title || '').trim() ? 'Укажите название' : null),
    buildPayload: (d) => ({ entityType: 'project', title: d.title.trim(), description: d.description || '', authorId: d.author === 'none' ? null : d.author, status: 'idea', private: false }),
  });
  const submit = (e) => { e.preventDefault(); save(); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Новый проект Мастерской</DialogTitle></DialogHeader><div className="mt-5 space-y-4"><div className="space-y-1.5"><Label>Название</Label><Input autoFocus value={draft.title||''} onChange={(e)=>field('title',e.target.value)} placeholder="Что вы хотите попробовать?"/></div><div className="space-y-1.5"><Label>Описание</Label><MentionEditor value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} placeholder="Контекст, гипотеза, ожидаемый результат…" ariaLabel="Описание"/></div><div className="space-y-1.5"><Label>Автор</Label><Select value={draft.author||'none'} onValueChange={(value)=>field('author',value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Не указан</SelectItem>{people.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" type="button" onClick={()=>onOpenChange(false)}>Отмена</Button><Button disabled={saving||!String(draft.title||'').trim()}>Создать проект</Button></DialogFooter></form></DialogContent></Dialog>;
}
```

- [ ] **Step 6: Implement — wire the create dialog in `LabsPage`**

In `LabsPage`, add state for the workshop-projects list (used by `IdeaCrudDialog`'s attach-to-project field) right after the existing `const team = ...` line:
```js
  const workshopProjectOptions = state.data.filter((item) => item.entityType !== 'idea');
```

Replace the single dialog-mount line (originally line 69):
```jsx
    <CreateLabDialog open={createOpen} onOpenChange={setCreateOpen} isIdea={isIdea} people={people.data} projects={projects.data} onCreated={()=>state.reload()}/>
```
with:
```jsx
    {isIdea
      ? <IdeaCrudDialog open={createOpen} onOpenChange={setCreateOpen} item={null} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      : <CreateLabDialog open={createOpen} onOpenChange={setCreateOpen} people={people.data} projects={projects.data} onCreated={()=>state.reload()}/>}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/ideas-crud-consistency.test.js`
Expected: PASS

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: PASS — confirm nothing else in `test/client-parity.test.js` (which reads `workspace.jsx`'s source text) or `test/crud-dialog-consistency.test.js` broke.

- [ ] **Step 9: Commit**

```bash
git add src/pages/workspace.jsx test/ideas-crud-consistency.test.js
git commit -m "feat: add IdeaCrudDialog with attach-to-project field for ideas"
```

---

### Task 4: Edit/delete icons on the idea row and card, standalone delete confirm

**Files:**
- Modify: `src/pages/workspace.jsx`
- Test: `test/ideas-crud-consistency.test.js` (extend)

**Interfaces:**
- Consumes: `IdeaCrudDialog` and `workshopProjectOptions` from Task 3. `api.resource('labs').remove(id)` from `src/lib/api.js` (already imported as `api` in this file).
- Produces: `LabsPage` gains `editingIdea`/`setEditingIdea`, `deleteTarget`/`setDeleteTarget`, `deleting`/`setDeleting` state, and a new `LabCard` component (extracted from the inline card JSX) with signature `function LabCard({ item, isIdea, author, navigate, onEdit, onDelete })`.

- [ ] **Step 1: Write the failing test**

Extend `test/ideas-crud-consistency.test.js` (append):

```js
test('LabsPage wires edit/delete icons for ideas in both card and list views', () => {
  const workspace = read('src/pages/workspace.jsx');
  assert.match(workspace, /editingIdea/);
  assert.match(workspace, /deleteTarget/);
  const trashCount = (workspace.match(/<Trash2/g) || []).length;
  assert.ok(trashCount >= 2, 'expected a Trash2 icon in both the idea card and the idea list row');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ideas-crud-consistency.test.js`
Expected: FAIL — no `editingIdea`/`deleteTarget` state and no `<Trash2` usages yet (the icon is only imported, not rendered).

- [ ] **Step 3: Implement — state and delete handler**

In `LabsPage`, add state next to the existing `const [createOpen, setCreateOpen] = React.useState(false);` line:
```js
  const [editingIdea, setEditingIdea] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
```

Add a delete handler in the same component body (near the other `const` declarations, before the `return`):
```js
  const confirmDeleteIdea = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await api.resource('labs').remove(deleteTarget.id); setDeleteTarget(null); await state.reload(); }
    finally { setDeleting(false); }
  };
```

- [ ] **Step 4: Implement — extract `LabCard` and add icons**

Replace the inline card-rendering ternary branch (the `viewMode === 'cards' ? <div className="entity-card-grid ...">...</div> : ...` portion of the big render line) so cards render via a new `LabCard` component instead of inline JSX. The full render line changes from:

```jsx
{state.loading ? (viewMode === 'list' ? <div className="space-y-2"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-44"/><Skeleton className="h-44"/></div>) : items.length ? (viewMode === 'cards' ? <div className="entity-card-grid md:grid-cols-2">{items.map((item)=><button key={item.id} onClick={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} className="entity-card text-left"><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-4 w-4"/></span><StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/></div><div className={isIdea?'':'mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4'}><div><h3 className="entity-card-title mt-4"><MentionText text={item.title}/></h3><p className="entity-card-description truncate-2">{item.description ? <MentionText text={item.description}/> : 'Без описания'}</p><div className="entity-card-meta flex flex-wrap items-center gap-2"><Avatar person={person(item.authorId)} size="xs"/><span>{person(item.authorId)?.name || 'Автор не указан'}</span>{!isIdea&&<><span>·</span><span>{LAB_TYPE_LABEL[item.projectType || 'pet'] || 'Другое'}</span></>}{item.private&&<><span>·</span><span>Приватно</span></>}</div></div>{!isIdea&&<div className="lab-growth-tree-react self-center opacity-90"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}</div></button>)}</div> : <div className="entity-list">{items.map((item)=><LabListRow key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} onOpen={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)}/>)}</div>) : <EmptyState icon={Icon} title={isIdea?'Идей не найдено':'Проектов не найдено'} description="Попробуйте изменить фильтры или поисковый запрос."/>}
```

to:

```jsx
{state.loading ? (viewMode === 'list' ? <div className="space-y-2"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-44"/><Skeleton className="h-44"/></div>) : items.length ? (viewMode === 'cards' ? <div className="entity-card-grid md:grid-cols-2">{items.map((item)=><LabCard key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} navigate={navigate} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)}/>)}</div> : <div className="entity-list">{items.map((item)=><LabListRow key={item.id} item={item} isIdea={isIdea} author={person(item.authorId)} onOpen={()=>!isIdea&&navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} onEdit={()=>setEditingIdea(item)} onDelete={()=>setDeleteTarget(item)}/>)}</div>) : <EmptyState icon={Icon} title={isIdea?'Идей не найдено':'Проектов не найдено'} description="Попробуйте изменить фильтры или поисковый запрос."/>}
```

Add the extracted `LabCard` component right after `LabsPage` (before `LabListRow`):

```jsx
function LabCard({ item, isIdea, author, navigate, onEdit, onDelete }) {
  const Icon = isIdea ? Lightbulb : FlaskConical;
  const body = <>
    <div className="flex items-start justify-between gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-4 w-4"/></span>
      <div className="flex shrink-0 items-center gap-1">
        <StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/>
        {isIdea && <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Редактировать идею"><Pencil className="h-3.5 w-3.5"/></Button>}
        {isIdea && <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Удалить идею"><Trash2 className="h-3.5 w-3.5"/></Button>}
      </div>
    </div>
    <div className={isIdea?'':'mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4'}>
      <div>
        <h3 className="entity-card-title mt-4"><MentionText text={item.title}/></h3>
        <p className="entity-card-description truncate-2">{item.description ? <MentionText text={item.description}/> : 'Без описания'}</p>
        <div className="entity-card-meta flex flex-wrap items-center gap-2">
          <Avatar person={author} size="xs"/><span>{author?.name || 'Автор не указан'}</span>
          {!isIdea && <><span>·</span><span>{LAB_TYPE_LABEL[item.projectType || 'pet'] || 'Другое'}</span></>}
          {item.private && <><span>·</span><span>Приватно</span></>}
        </div>
      </div>
      {!isIdea && <div className="lab-growth-tree-react self-center opacity-90"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}
    </div>
  </>;
  if (isIdea) return <div className="entity-card text-left">{body}</div>;
  return <button onClick={()=>navigate(`/workshop/${encodeURIComponent(item.blueprintKey || item.id)}`)} className="entity-card text-left">{body}</button>;
}
```

- [ ] **Step 5: Implement — icons on the list row**

Replace `LabListRow` (originally lines 73-81):
```jsx
function LabListRow({ item, isIdea, author, onOpen }) {
  return <EntityRow
    className={isIdea ? undefined : 'workshop-list-row'}
    onOpen={isIdea ? undefined : onOpen}
    title={<MentionText text={item.title}/>}
    meta={isIdea ? [author?.name || 'Автор не указан'] : []}
    trailing={<div className="workshop-list-trailing flex items-center">{author&&<Avatar person={author} size="xs"/>}{!isIdea&&<div className="workshop-list-tree hidden justify-center lg:flex"><ProgressTree progress={labProgress(item.status || 'idea')} seed={item.id} compact label="Стадия проекта"/></div>}<StatusBadge value={item.status || 'idea'} kind={isIdea?'idea':'lab'}/></div>}
  />;
}
```
with:
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

- [ ] **Step 6: Implement — mount `IdeaCrudDialog` (edit mode) and the standalone delete `AlertDialog`**

Change the dialog-mount block added in Task 3 Step 6 from:
```jsx
    {isIdea
      ? <IdeaCrudDialog open={createOpen} onOpenChange={setCreateOpen} item={null} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      : <CreateLabDialog open={createOpen} onOpenChange={setCreateOpen} people={people.data} projects={projects.data} onCreated={()=>state.reload()}/>}
```
to:
```jsx
    {isIdea ? <>
      <IdeaCrudDialog open={createOpen} onOpenChange={setCreateOpen} item={null} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      <IdeaCrudDialog open={Boolean(editingIdea)} onOpenChange={(next)=>!next&&setEditingIdea(null)} item={editingIdea} people={people.data} projects={projects.data} workshopProjects={workshopProjectOptions} onSaved={()=>state.reload()}/>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next)=>!next&&setDeleteTarget(null)} title={`Удалить идею «${deleteTarget ? titleOf(deleteTarget) : ''}»?`} onConfirm={confirmDeleteIdea} busy={deleting}/>
    </> : <CreateLabDialog open={createOpen} onOpenChange={setCreateOpen} people={people.data} projects={projects.data} onCreated={()=>state.reload()}/>}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/ideas-crud-consistency.test.js`
Expected: PASS

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/pages/workspace.jsx test/ideas-crud-consistency.test.js
git commit -m "feat: add edit/delete icons to idea cards and list rows"
```

---

### Task 5: Manual verification in the running app

No automated test replaces this — the consistency tests only check source text, not rendered/runtime behavior.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify the golden path**

In the browser, navigate to `/ideas` and check:
1. Create a new idea via "Добавить идею" — set an author, attach it to a "Проект Мастерской", save. It appears in the list with status "Новая".
2. Switch to list view (toolbar view toggle) — the same idea row shows Pencil and Trash2 icons.
3. Click Pencil (from either card or list view) — `IdeaCrudDialog` opens pre-filled, including the "Проект Мастерской" attach-to selection. Change status to "Отклонена", switch attach-to to "Рабочий проект" and pick one, save. The badge turns red/"Отклонена" and the workshop-project link is gone (replaced by the work-project link).
4. Click Trash2 — a confirm dialog appears without opening the edit form; confirm — the idea disappears from the list and `state.reload()` refreshes without a page reload.
5. Toggle "Только идеи без проектов" — an idea attached to a work project (not just a Мастерская project) is correctly excluded.

- [ ] **Step 3: Verify workshop projects are unaffected**

Navigate to `/workshop` — creating/editing a workshop project still works exactly as before (4 statuses, no rejected status, cards still navigate to `/workshop/:id` on click, no edit/delete icons added there).

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm test`
Expected: PASS
