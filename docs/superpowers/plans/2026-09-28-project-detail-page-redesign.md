# Project Detail Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-column Project detail page with a tabbed page (Описание/Контекст with Команда/Задачи/Проблемы/Ссылки/Заметки sub-tabs), a persistent inline-editable "Свойства" column, and a "⋯" menu (archive/restore, version history, delete) — giving projects the same archive + versioning capabilities tasks already have.

**Architecture:** Server-side: extend the existing generic `visibleItems`/`isVersioned` mechanisms (already used by tasks/labs/meetings/processes) to also cover `projects`, adding one new field (`archivedAt`) with zero schema migration (the store is a schemaless JSON-per-record table). Client-side: rewrite `ProjectDetailPage` in `src/pages/resources.jsx` following the exact patterns already established by `TaskDetailPage` (src/pages/tasks.jsx) and `PersonDetailPage` (same file) — reusable `Tabs` component, `DropdownMenu` "⋯" action menu, `useEntityStatus`-backed status icon, embedded `StickyNotes`, `VersionHistoryDialog`.

**Tech Stack:** React 19 (no TypeScript, plain JSX), Express + a schemaless SQLite JSON-record store, `node --test` for both real API integration tests (`test/api.test.js`) and source-content regression tests (`test/architecture.test.js`, `test/client-parity.test.js` — this repo's established way of pinning JSX structure since there is no component-rendering test harness).

## Global Constraints

- No new dependencies, no TypeScript, no new test framework — testing follows the two patterns already in this repo: real HTTP integration tests in `test/api.test.js`, and source-content regression assertions (`read(file)` + `assert.match`/`.includes`) in `test/architecture.test.js` / `test/client-parity.test.js`.
- All new UI copy is in Russian, matching the exact strings already used for the equivalent Task-detail feature: "Архивировать проект" / "Восстановить из архива" / "История версий" / "Удалить" / "Добавить стикер".
- Reuse existing CSS classes wherever the shape already matches (`task-relations-list`, `task-relation-row`, `task-relation-main`, `task-relation-title`, `task-relation-kind`, `task-relations-empty`, `entity-detail-aside-field`, `entity-detail-aside-label`, `entity-detail-aside-value`); add new CSS only for the one genuinely new interaction (click-to-edit project key).
- `server/index.js` must stay ≤ 250 lines (enforced by `test/architecture.test.js`) — none of these tasks touch it.
- The project-create dialog (`ProjectCrudDialog`) stays as the *only* remaining entry point for editing via dialog, and only for creating new projects; editing an existing project happens entirely inline on its detail page.
- Archived projects are excluded from default listing/selection everywhere via the shared `visibleItems` filter (one place, not per-call-site patches), but remain reachable and restorable from their own detail page by direct link — no dedicated "archived projects" browse view is being built.

---

## Task 1: Backend — exclude archived projects from default lists

**Files:**
- Modify: `server/access-control.js:114-118`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: existing `visibleItems(name, user, opts = {})` in `server/access-control.js`.
- Produces: `visibleItems('projects', user)` now filters out `archivedAt`-set projects by default (same contract tasks already have); `visibleItems('projects', user, { includeArchived: true })` keeps them. No new exported symbols.

- [ ] **Step 1: Write the failing test**

Add to `test/api.test.js`, right after the existing `'historical versions can be deleted but the current version is protected'` test (around line 249-253):

```js
test('archived projects are excluded from the default project list but stay reachable directly', async () => {
  const created = await request('/api/projects', {
    method: 'POST', body: { name: 'Archivable Project', status: 'active', projectKey: 'ARCP' },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const archived = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: new Date().toISOString() } });
  assert.equal(archived.response.status, 200);
  assert.ok(archived.body.archivedAt);

  const list = await request('/api/projects');
  assert.equal(list.response.status, 200);
  assert.ok(!list.body.some((p) => p.id === id), 'archived project should not appear in the default list');

  const direct = await request(`/api/projects/${id}`);
  assert.equal(direct.response.status, 200);
  assert.equal(direct.body.id, id);

  const restored = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: null } });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.archivedAt, null);

  const listAfterRestore = await request('/api/projects');
  assert.ok(listAfterRestore.body.some((p) => p.id === id), 'restored project should reappear in the default list');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api`
Expected: FAIL on `assert.ok(!list.body.some((p) => p.id === id), ...)` — the archived project is still in the default list today.

- [ ] **Step 3: Write minimal implementation**

In `server/access-control.js`, change line 116 from:

```js
if (name === 'tasks' && !opts.includeArchived) items = items.filter((item) => !item.archivedAt);
```

to:

```js
if ((name === 'tasks' || name === 'projects') && !opts.includeArchived) items = items.filter((item) => !item.archivedAt);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/access-control.js test/api.test.js
git commit -m "feat: exclude archived projects from default project lists"
```

---

## Task 2: Backend — enable version history for projects

**Files:**
- Modify: `server/application/resource-service.js:25`
- Modify: `server/versioning.js`
- Modify: `server/routes/versions.js` (its own separate `VERSIONED` allowlist — found while implementing; not just `resource-service.js`'s `isVersioned`)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: existing `recordCreate`/`recordUpdate` wiring in `resource-service.js` (already called generically from `create()`/`update()` for every resource — see `resource-service.js:198-199,257-263`), existing `db.versions.*` and `/api/versions/:entityType/:entityId[...]` routes.
- Produces: `GET /api/versions/projects/:id`, `POST /api/versions/projects/:id/:version/restore`, `DELETE /api/versions/projects/:id/:version` all start working. Two independent gates control this, both need `projects` added: `resource-service.js`'s `isVersioned` (controls whether create/update *record* a version) and `routes/versions.js`'s own local `VERSIONED` Set (controls whether the `/api/versions/...` routes will even resolve the entity — this second gate is easy to miss since it duplicates the same allowlist concept separately).

- [ ] **Step 1: Write the failing test**

Add to `test/api.test.js`, right after the new archive test from Task 1:

```js
test('project updates are versioned and project history can restore the prior state, including archiving', async () => {
  const created = await request('/api/projects', {
    method: 'POST', body: { name: 'Project version one', status: 'active', projectKey: 'PJV1' },
  });
  assert.equal(created.response.status, 201);
  const id = created.body.id;

  const edited = await request(`/api/projects/${id}`, { method: 'PUT', body: { name: 'Project version two', status: 'paused' } });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.name, 'Project version two');

  const history = await request(`/api/versions/projects/${id}`);
  assert.equal(history.response.status, 200);
  const original = history.body.find((entry) => entry.data.name === 'Project version one');
  assert.ok(original);

  const restored = await request(`/api/versions/projects/${id}/${original.version}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.name, 'Project version one');
  assert.equal(restored.body.projectKey, created.body.projectKey);

  const archived = await request(`/api/projects/${id}`, { method: 'PUT', body: { archivedAt: new Date().toISOString() } });
  assert.equal(archived.response.status, 200);
  const historyAfterArchive = await request(`/api/versions/projects/${id}`);
  assert.equal(historyAfterArchive.response.status, 200);
  assert.ok(historyAfterArchive.body[0].data.archivedAt, 'latest version should record the archived timestamp');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api`
Expected: FAIL with `history.body` empty and `original` being `undefined` (`assert.ok(original)` throws) — projects aren't versioned yet.

- [ ] **Step 3: Write minimal implementation**

In `server/application/resource-service.js`, change line 25 from:

```js
const isVersioned = (name, item) => name === 'tasks' || name === 'meetings' || name === 'processes' || (name === 'labs' && item?.entityType !== 'idea');
```

to:

```js
const isVersioned = (name, item) => name === 'tasks' || name === 'meetings' || name === 'processes' || name === 'projects' || (name === 'labs' && item?.entityType !== 'idea');
```

In `server/versioning.js`, add a `projects` entry to `LABELS` (after the `labs` entry, before `processes`):

```js
  projects: {
    name: 'название', description: 'описание', projectKey: 'ключ', status: 'статус',
    memberIds: 'участников', memberLoads: 'загрузку', externalLinks: 'ссылки', archivedAt: 'архив',
  },
```

In `creationSummary`, add a branch (after the `labs` line):

```js
  if (entityType === 'projects') return 'Создан проект';
```

In `isImportantChange`, add a branch (after the `labs` line):

```js
  if (entityType === 'projects') return fields.has('status') || fields.has('archivedAt');
```

In `server/routes/versions.js`, add `'projects'` to the route-level allowlist — this is a *separate* Set from `resource-service.js`'s `isVersioned`, and without it every `/api/versions/projects/...` route 404s regardless of the `isVersioned` change above:

```js
const VERSIONED = new Set(['tasks', 'labs', 'meetings', 'processes', 'projects']);
```

and add a `projectKey` restore case next to the existing `taskKey`/`meetingKey`/`processKey` ones in the restore handler (so restoring an old snapshot keeps the entity's current public key instead of overwriting it with whatever the snapshot had):

```js
    if (entityType === 'processes') restoredData.processKey = current.processKey;
    if (entityType === 'projects') restoredData.projectKey = current.projectKey;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/application/resource-service.js server/versioning.js test/api.test.js
git commit -m "feat: version projects the same way tasks/labs/meetings already are"
```

---

## Task 3: Frontend — export the shared task-sort helper for reuse

**Files:**
- Modify: `src/pages/tasks.jsx:57-65`
- Test: `test/client-parity.test.js`

**Interfaces:**
- Produces: `export function orderIndex(order, value)` and `export function taskSort(a, b)` from `src/pages/tasks.jsx`, importable as `import { taskSort } from '@/pages/tasks'`. `taskSort` keeps its existing signature/behavior exactly (status order → priority "high" first → overdue first → due date → title, all as already implemented) — this task only adds the `export` keyword, no logic changes.

- [ ] **Step 1: Write the failing test**

Add to `test/client-parity.test.js` (new test, anywhere after the existing task-list tests):

```js
test('task sort order is exported for reuse outside the tasks page', () => {
  const tasks = read('src/pages/tasks.jsx');
  assert.match(tasks, /export function orderIndex\(order, value\)/);
  assert.match(tasks, /export function taskSort\(a, b\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — both functions are currently declared without `export`.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/tasks.jsx`, change:

```js
function orderIndex(order, value) { const index = order.indexOf(value); return index === -1 ? order.length : index; }
function taskSort(a, b) {
```

to:

```js
export function orderIndex(order, value) { const index = order.indexOf(value); return index === -1 ? order.length : index; }
export function taskSort(a, b) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks.jsx test/client-parity.test.js
git commit -m "refactor: export taskSort/orderIndex for reuse on the project detail page"
```

---

## Task 4: Frontend — add a clickable Status icon for projects

**Files:**
- Modify: `src/components/status.jsx`
- Test: `test/client-parity.test.js`

**Interfaces:**
- Consumes: existing `StatusControl`, `TaskStatusGlyph`, `useEntityStatus`, `PROJECT_STATUS_LABEL` (from `@/lib/domain`, already imported in `status.jsx`).
- Produces: `export function ProjectStatusIcon({ project, projectId, status, onChanged, disabled, className })` — same call contract as `IssueStatusIcon`/`ProcessStatusIcon`: pass either `project` or `projectId`+`status`; `onChanged(updatedProject)` fires after a successful status change.

- [ ] **Step 1: Write the failing test**

Add to `test/client-parity.test.js`:

```js
test('project status is a Garden-style clickable icon, like task/issue/process status', () => {
  const status = read('src/components/status.jsx');
  assert.match(status, /export function ProjectStatusIcon/);
  assert.match(status, /resource="projects"/);
  assert.match(status, /PROJECT_TO_TASK_STATUS/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — `ProjectStatusIcon` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `src/components/status.jsx`, add this block right after `ProcessStatusIcon` (after its closing `}` around line 183, before the `AgreementStatusIcon` export):

```js
const PROJECT_TO_TASK_STATUS = { active: 'in_progress', paused: 'paused', done: 'done' };

export function ProjectStatusIcon({ project, projectId, status, onChanged, disabled = false, className }) {
  const id = projectId || project?.id;
  const incoming = status || project?.status || 'active';
  return <StatusControl
    resource="projects" id={id} status={incoming} fallback="active"
    validValues={Object.keys(PROJECT_STATUS_LABEL)}
    options={Object.keys(PROJECT_STATUS_LABEL)}
    glyphFor={(value) => <TaskStatusGlyph status={PROJECT_TO_TASK_STATUS[value] || 'todo'} />}
    labelFor={(value) => PROJECT_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/status.jsx test/client-parity.test.js
git commit -m "feat: add ProjectStatusIcon, a clickable status control for projects"
```

---

## Task 5: Frontend — ProjectDetailPage shell: inline title, "⋯" menu, Свойства column, tabs scaffold

This task replaces the whole `ProjectDetailPage` function with a version that has: inline-editable title, the "⋯" action menu (archive/restore, version history, delete) instead of "Редактировать", a "Свойства" aside (clickable status, click-to-edit key, load button), and the two top-level tabs (Описание working; Контекст showing only the Команда sub-tab for now — the remaining four sub-tabs are added in Task 6, so this task stays independently reviewable/testable without being a half-finished dead end: every control on the page works end to end).

**Files:**
- Modify: `src/pages/resources.jsx` (replace `export function ProjectDetailPage() { ... }`, currently lines 899-933)
- Modify: `src/pages/resources.jsx` (import list, lines 1-27)
- Modify: `src/styles.css` (new click-to-edit key style, near `.entity-detail-aside-value` at line 2774)
- Test: `test/client-parity.test.js`

**Interfaces:**
- Consumes: `taskSort` (Task 3, `@/pages/tasks`), `ProjectStatusIcon` (Task 4, `@/components/status`), existing `VersionHistoryDialog`, `ProjectLoadDialog`, `normalizeProjectMemberLoad`, `PROJECT_LOAD_OPTIONS`, `PROJECT_STATUS_LABEL`, `Tabs`, `DetailLayout`, `DetailAsideField`, `SectionHeader`, `MentionEditor`, `api`.
- Produces: a new local component `InlineProjectKeyEditor({ project, onSaved })` (used only inside `ProjectDetailPage`, not exported) — `onSaved(updatedProject)` fires after a successful key change.

- [ ] **Step 1: Write the failing test**

Add to `test/client-parity.test.js`:

```js
test('project detail page replaces Редактировать with a ⋯ menu offering archive, history and delete', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('export function ProjectDetailPage(');
  const end = resources.indexOf('\nfunction ProjectCrudDialog(');
  const page = resources.slice(start, end);
  assert.match(page, /aria-label="Действия"/);
  assert.match(page, /Архивировать проект/);
  assert.match(page, /Восстановить из архива/);
  assert.match(page, /История версий/);
  assert.match(page, /entityType="projects"/);
  assert.doesNotMatch(page, /Редактировать/);
  assert.match(page, /<ProjectStatusIcon/);
  assert.match(page, /InlineProjectKeyEditor/);
  assert.match(page, /ariaLabel="Разделы проекта"/);
  assert.match(page, /label:'Описание'/);
  assert.match(page, /label:'Контекст'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — none of this exists in the current `ProjectDetailPage`.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/resources.jsx`, update the lucide-react import (line 4) to add `Archive` and `ArchiveRestore`:

```js
  ArrowLeft, Archive, ArchiveRestore, BriefcaseBusiness, CalendarPlus, Check, ChevronDown, CircleDot, Copy, TriangleAlert, Clock3, ExternalLink, Gauge, Goal, Handshake, History, Info, Link2, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, Users, Workflow, Wrench, X,
```

Add `ProjectStatusIcon` to the `@/components/status` import (line 12):

```js
import { AgreementStatusCheckbox, IssueStatusIcon, ProcessStatusGlyph, ProcessStatusIcon, ProjectStatusIcon, SolutionStatusIcon, StatusBadge, TaskStatusGlyph, TaskStatusIcon } from '@/components/status';
```

Add the `taskSort` import (new line, right after the `CreateTaskDialog` import):

```js
import { CreateTaskDialog, taskSort } from '@/pages/tasks';
```

Replace the whole `export function ProjectDetailPage() { ... }` block (currently `src/pages/resources.jsx:899-933`) with:

```jsx
function InlineProjectKeyEditor({ project, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(project.projectKey || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setValue(project.projectKey || ''); }, [project.projectKey]);
  React.useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const cancel = () => { setValue(project.projectKey || ''); setError(''); setEditing(false); };
  const save = async () => {
    const next = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,4}$/.test(next)) { setError('Ключ проекта: от 1 до 4 латинских букв или цифр'); return; }
    if (next === project.projectKey) { setEditing(false); return; }
    setSaving(true); setError('');
    try {
      const updated = await api.resource('projects').update(project.id, { projectKey: next });
      await onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e?.status === 409 ? 'Такой ключ проекта уже используется' : e?.status === 400 ? 'Проверьте ключ проекта' : e?.status === 403 ? 'Недостаточно прав' : 'Не удалось сохранить ключ');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return <button type="button" className="entity-key-button" onClick={()=>setEditing(true)} aria-label="Изменить ключ проекта">{project.projectKey}</button>;

  return <div className="space-y-1">
    <Input
      ref={inputRef}
      className="uppercase"
      maxLength={4}
      value={value}
      disabled={saving}
      onChange={(e)=>{ setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); setError(''); }}
      onBlur={save}
      onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key==='Escape') { e.preventDefault(); cancel(); } }}
    />
    {error && <div className="text-[12px] text-destructive">{error}</div>}
  </div>;
}

export function ProjectDetailPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const state = useEndpoint(`/api/projects/${encodeURIComponent(id)}/detail`, [id]);
  const people = useResource('people');
  const allProjectsForMentions = useResource('projects');
  const [loadOpen, setLoadOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [pageTab, setPageTab] = React.useState('description');
  const [contextTab, setContextTab] = React.useState('team');
  if (state.loading) return <Page narrow><Skeleton className="h-80"/></Page>;
  if (!state.data) return <Page narrow><EmptyState title="Проект не найден"/></Page>;
  const { project, members = [] } = state.data;

  const patch = async (body) => {
    const updated = await api.resource('projects').update(project.id, body);
    state.setData({ ...state.data, project: { ...project, ...updated } });
    return updated;
  };
  const toggleArchive = () => patch({ archivedAt: project.archivedAt ? null : new Date().toISOString() });
  const remove = async () => { if (!confirm('Удалить проект?')) return; await api.resource('projects').remove(project.id); navigate('/projects'); };

  const contextTabs = [['team', 'Команда', members.length]];
  const contextTabBody = () => {
    if (contextTab === 'team') return <div className="task-relations-list">{members.length ? members.map((person)=>{
      const mode = normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;
      const load = PROJECT_LOAD_OPTIONS[mode];
      return <Link key={person.id} to={`/people/${person.id}`} className="task-relation-row">
        <div className="task-relation-main"><Avatar person={person} size="sm"/><div className="min-w-0"><div className="task-relation-title">{person.name}</div><div className="task-relation-kind">{person.role || 'Участник'} · {load.label}</div></div></div>
      </Link>;
    }) : <div className="task-relations-empty">Команда проекта не задана.</div>}</div>;
    return null;
  };

  return <Page narrow>
    <div className="mb-7 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={()=>navigate('/projects')}><ArrowLeft className="h-4 w-4"/>Проекты</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Действия"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchive}>{project.archivedAt ? <ArchiveRestore className="h-4 w-4"/> : <Archive className="h-4 w-4"/>}{project.archivedAt ? 'Восстановить из архива' : 'Архивировать проект'}</DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>setHistoryOpen(true)}><History className="h-4 w-4"/>История версий</DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem className="text-destructive" onSelect={remove}><Trash2 className="h-4 w-4"/>Удалить</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <MentionEditor
      value={project.name || ''}
      onChange={(name)=>state.setData({ ...state.data, project: { ...project, name } })}
      onBlur={(name)=>patch({ name: name.trim() })}
      people={people.data}
      projects={[]}
      singleLine
      editorClassName="things-task-detail-title task-title-mention-editor"
      ariaLabel="Название проекта"
    />

    <DetailLayout aside={<>
      <SectionHeader title="Свойства" compact/>
      <DetailAsideField label="Статус"><span className="inline-flex items-center gap-2"><ProjectStatusIcon project={project} onChanged={(updated)=>state.setData({ ...state.data, project: { ...project, ...updated } })}/><span>{PROJECT_STATUS_LABEL[project.status] || project.status}</span></span></DetailAsideField>
      <DetailAsideField label="Ключ"><InlineProjectKeyEditor project={project} onSaved={(updated)=>state.setData({ ...state.data, project: { ...project, ...updated } })}/></DetailAsideField>
      <div><Button variant="outline" size="sm" className="w-full" onClick={()=>setLoadOpen(true)}><Gauge className="h-4 w-4"/>Управлять загрузкой</Button></div>
    </>}>
      <Tabs ariaLabel="Разделы проекта" value={pageTab} onValueChange={setPageTab} items={[{value:'description',label:'Описание'},{value:'context',label:'Контекст'}]}/>
      {pageTab === 'description' && <MentionEditor value={project.description || ''} onChange={(value)=>state.setData({ ...state.data, project: { ...project, description: value } })} onBlur={(value)=>patch({ description: value })} people={people.data} projects={allProjectsForMentions.data} placeholder="Добавить описание…" editorClassName="entity-detail-copy" ariaLabel="Описание проекта"/>}
      {pageTab === 'context' && <div className="space-y-5">
        <Tabs ariaLabel="Контекст проекта" value={contextTab} onValueChange={setContextTab} items={contextTabs.map(([value,label,count])=>({value,label,count}))}/>
        {contextTabBody()}
      </div>}
    </DetailLayout>

    <VersionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} entityType="projects" entityId={project.id} onRestored={(restored)=>state.setData({ ...state.data, project: restored })}/>
    <ProjectLoadDialog open={loadOpen} project={project} people={people.data.filter((person)=>person.type==='team')} onOpenChange={setLoadOpen} onSaved={()=>state.reload()}/>
  </Page>;
}
```

Note: `tasks`, `issues`, and the link-management state/handlers from the old implementation are intentionally dropped here — they come back in Task 6 together with the sub-tabs that use them (Задачи, Проблемы, Ссылки), so nothing sits half-wired.

In `src/styles.css`, add this new rule right after `.entity-detail-aside-value { ... }` (after line 2774):

```css
.entity-key-button {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 6px;
  cursor: pointer;
  color: hsl(var(--foreground));
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.entity-key-button:hover { background: hsl(var(--muted)); }
.entity-key-button:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS. Also run `npm test` once to confirm no other suite (architecture/api/theme/search) regressed from the import/signature changes.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open a project's detail page in the browser, and confirm: the title is editable inline (click, type, click away, reload — change persisted); the "⋯" menu opens with Архивировать/История версий/Удалить; archiving hides the project from `/projects` and the menu item flips to "Восстановить из архива"; clicking the status icon in "Свойства" opens a dropdown and changes status; clicking the key text turns it into an editable input that validates and saves; the Описание/Контекст tabs switch, and Контекст currently shows only the Команда list.

- [ ] **Step 6: Commit**

```bash
git add src/pages/resources.jsx src/styles.css test/client-parity.test.js
git commit -m "feat: rewrite project detail page shell with inline editing and archive/history menu"
```

---

## Task 6: Frontend — Контекст sub-tabs: Задачи, Проблемы, Ссылки, Заметки

**Files:**
- Modify: `src/pages/resources.jsx` (extend `ProjectDetailPage`, written in Task 5)
- Test: `test/client-parity.test.js`

**Interfaces:**
- Consumes: `taskSort` (Task 3), `TaskList`, `CompactList`, `StickyNotes` (all already defined/imported in `resources.jsx`).
- Produces: no new exports; `ProjectDetailPage`'s `contextTabs`/`contextTabBody` now cover all five sub-tabs, and the "Цели" (goals) section that existed on the old page is gone for good (never reintroduced).

- [ ] **Step 1: Write the failing test**

Add to `test/client-parity.test.js`:

```js
test('project context tab covers team, active sorted tasks, open issues, links and embedded notes', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('export function ProjectDetailPage(');
  const end = resources.indexOf('\nfunction ProjectCrudDialog(');
  const page = resources.slice(start, end);
  for (const label of ["'team', 'Команда'", "'tasks', 'Задачи'", "'issues', 'Проблемы'", "'links', 'Ссылки'", "'notes', 'Заметки'"]) {
    assert.ok(page.includes(label), `${label} context sub-tab is missing`);
  }
  assert.match(page, /!task\.archivedAt && task\.status !== 'done'/);
  assert.match(page, /\.sort\(taskSort\)/);
  assert.match(page, /issue\.status !== 'resolved'/);
  assert.match(page, /entityType="project"/);
  assert.match(page, /<StickyNotes/);
  assert.doesNotMatch(page, /title="Цели"/);
  assert.doesNotMatch(page, /goalProgress|goals\.length/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — Task 5 only wired the Команда sub-tab.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/resources.jsx`, inside `ProjectDetailPage` (written in Task 5):

Replace:

```jsx
  const { project, members = [] } = state.data;
```

with:

```jsx
  const { project, tasks = [], members = [], issues = [] } = state.data;
  const externalLinks = Array.isArray(project.externalLinks) ? project.externalLinks : [];
  const activeTasks = tasks.filter((task)=>!task.archivedAt && task.status !== 'done').sort(taskSort);
  const openIssues = issues.filter((issue)=>issue.status !== 'resolved');
```

Replace:

```jsx
  const patch = async (body) => {
    const updated = await api.resource('projects').update(project.id, body);
    state.setData({ ...state.data, project: { ...project, ...updated } });
    return updated;
  };
  const toggleArchive = () => patch({ archivedAt: project.archivedAt ? null : new Date().toISOString() });
  const remove = async () => { if (!confirm('Удалить проект?')) return; await api.resource('projects').remove(project.id); navigate('/projects'); };

  const contextTabs = [['team', 'Команда', members.length]];
```

with:

```jsx
  const [linkName, setLinkName] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkError, setLinkError] = React.useState('');
  const [linkBusy, setLinkBusy] = React.useState(false);
  const addStickyRef = React.useRef(null);
  const [stickyCount, setStickyCount] = React.useState(0);

  const patch = async (body) => {
    const updated = await api.resource('projects').update(project.id, body);
    state.setData({ ...state.data, project: { ...project, ...updated } });
    return updated;
  };
  const toggleArchive = () => patch({ archivedAt: project.archivedAt ? null : new Date().toISOString() });
  const remove = async () => { if (!confirm('Удалить проект?')) return; await api.resource('projects').remove(project.id); navigate('/projects'); };
  const saveExternalLinks = async (links) => { setLinkBusy(true); setLinkError(''); try { await patch({ externalLinks: links }); } finally { setLinkBusy(false); } };
  const addExternalLink = async (event) => { event.preventDefault(); const name = linkName.trim(), url = linkUrl.trim(); if (!name || !url) { setLinkError('Укажите название и ссылку'); return; } if (!/^https?:\/\//i.test(url)) { setLinkError('Ссылка должна начинаться с http:// или https://'); return; } await saveExternalLinks([...externalLinks, { name, url }]); setLinkName(''); setLinkUrl(''); };
  const removeExternalLink = async (index) => saveExternalLinks(externalLinks.filter((_, itemIndex)=>itemIndex!==index));

  const contextTabs = [
    ['team', 'Команда', members.length],
    ['tasks', 'Задачи', activeTasks.length],
    ['issues', 'Проблемы', openIssues.length],
    ['links', 'Ссылки', externalLinks.length],
    ['notes', 'Заметки', stickyCount],
  ];
```

Note: `[project]` note above — since `project` is now referenced before `useState` calls in the middle of the function, keep the existing `if (state.loading) ...` / `if (!state.data) ...` early returns and the `const { project, ... }` destructure exactly where they already sit in Task 5's version (before these new `useState` calls) — React hooks must still run unconditionally on every render, so declare `linkName`/`linkUrl`/`linkError`/`linkBusy`/`addStickyRef`/`stickyCount` with the other `useState`/`useRef` calls near the top of the component, *above* the `if (state.loading)` early return, not after it. Adjust the placement accordingly: move these five `useState`/`useRef` declarations up to sit alongside `loadOpen`/`historyOpen`/`pageTab`/`contextTab` at the top of `ProjectDetailPage`, before the loading/empty early returns.

Replace the `contextTabBody` function body from Task 5:

```jsx
  const contextTabBody = () => {
    if (contextTab === 'team') return <div className="task-relations-list">{members.length ? members.map((person)=>{
      const mode = normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;
      const load = PROJECT_LOAD_OPTIONS[mode];
      return <Link key={person.id} to={`/people/${person.id}`} className="task-relation-row">
        <div className="task-relation-main"><Avatar person={person} size="sm"/><div className="min-w-0"><div className="task-relation-title">{person.name}</div><div className="task-relation-kind">{person.role || 'Участник'} · {load.label}</div></div></div>
      </Link>;
    }) : <div className="task-relations-empty">Команда проекта не задана.</div>}</div>;
    return null;
  };
```

with:

```jsx
  const contextTabBody = () => {
    if (contextTab === 'team') return <div className="task-relations-list">{members.length ? members.map((person)=>{
      const mode = normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;
      const load = PROJECT_LOAD_OPTIONS[mode];
      return <Link key={person.id} to={`/people/${person.id}`} className="task-relation-row">
        <div className="task-relation-main"><Avatar person={person} size="sm"/><div className="min-w-0"><div className="task-relation-title">{person.name}</div><div className="task-relation-kind">{person.role || 'Участник'} · {load.label}</div></div></div>
      </Link>;
    }) : <div className="task-relations-empty">Команда проекта не задана.</div>}</div>;

    if (contextTab === 'tasks') return <TaskList items={activeTasks} empty="Нет активных задач" navigate={navigate} onStatusChanged={state.reload} people={people.data} projects={allProjectsForMentions.data}/>;

    if (contextTab === 'issues') return <CompactList items={openIssues} empty="Нет открытых проблем" href={(item)=>`/issues/${encodeURIComponent(resourceRef('issues', item))}`} meta={(item)=><StatusBadge value={item.status} kind="issue"/>}/>;

    if (contextTab === 'links') return <div className="space-y-3">
      {externalLinks.length ? <div className="task-relations-list">{externalLinks.map((link,index)=><div key={`${link.url}:${index}`} className="task-relation-row"><a href={link.url} target="_blank" rel="noreferrer" className="task-relation-main"><Link2 className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="task-relation-title">{link.name || link.title || link.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/></a><Button variant="ghost" size="icon-sm" aria-label="Удалить ссылку" onClick={()=>removeExternalLink(index)} disabled={linkBusy}><Trash2 className="h-3.5 w-3.5"/></Button></div>)}</div> : <div className="task-relations-empty">Внешних ссылок пока нет.</div>}
      <form onSubmit={addExternalLink} className="grid gap-2 sm:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto]"><Input value={linkName} onChange={(e)=>setLinkName(e.target.value)} placeholder="Название"/><Input value={linkUrl} onChange={(e)=>setLinkUrl(e.target.value)} placeholder="https://…" inputMode="url"/><Button type="submit" variant="secondary" disabled={linkBusy}>Добавить</Button></form>
      {linkError && <div className="text-xs text-destructive">{linkError}</div>}
    </div>;

    if (contextTab === 'notes') return <div>
      <div className="task-tab-toolbar"><span className="task-tab-subtitle">Стикеры</span><Button variant="ghost" size="sm" onClick={()=>addStickyRef.current?.()}><Plus className="h-4 w-4"/>Добавить стикер</Button></div>
      <StickyNotes entityType="project" entityId={project.id} notesPrefix={project.name || ''} addButtonRef={addStickyRef} onCountChange={setStickyCount}/>
    </div>;

    return null;
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS. Also run `npm test` once for the full suite.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open a project with several tasks (some done/archived, some not) and issues (some resolved, some not). Confirm: Задачи sub-tab shows only non-done/non-archived tasks, in the same priority/overdue-first order as the Tasks page; Проблемы sub-tab shows only unresolved issues; Ссылки sub-tab can add/remove a link; Заметки sub-tab shows an embedded sticky board (not a sidebar drawer), "Добавить стикер" creates a note, and the tab's count badge updates; the old "Цели" section is gone.

- [ ] **Step 6: Commit**

```bash
git add src/pages/resources.jsx test/client-parity.test.js
git commit -m "feat: fill in project context sub-tabs (tasks, issues, links, notes)"
```

---

## Task 7: Frontend — simplify ProjectCrudDialog to create-only

Now that editing happens entirely inline on the detail page, `ProjectCrudDialog`'s edit-mode code (delete button/confirmation, `isEdit` ternaries) is unreachable dead code — the dialog is only ever opened from `ProjectsPage`'s "Создать проект" button with `project=null`.

**Files:**
- Modify: `src/pages/resources.jsx` (the `ProjectCrudDialog` function, currently around line 935-968, and its one remaining call site in `ProjectsPage`)
- Test: `test/client-parity.test.js`

**Interfaces:**
- Consumes: `useCrudDialogForm` (unchanged hook).
- Produces: `ProjectCrudDialog({ open, onOpenChange, onSaved, people, projects })` — the `project` prop is removed since it was always `null` in the only remaining call site.

- [ ] **Step 1: Write the failing test**

Add to `test/client-parity.test.js`:

```js
test('project create dialog no longer carries dead edit/delete code paths', () => {
  const resources = read('src/pages/resources.jsx');
  const start = resources.indexOf('function ProjectCrudDialog(');
  const end = resources.indexOf('function ProjectLoadDialog(');
  const dialog = resources.slice(start, end);
  assert.match(dialog, /function ProjectCrudDialog\(\{ open, onOpenChange, onSaved, people = \[\], projects = \[\] \}\)/);
  assert.doesNotMatch(dialog, /isEdit/);
  assert.doesNotMatch(dialog, /Удалить проект/);
  assert.doesNotMatch(dialog, /AlertDialog/);
  assert.match(dialog, /<DialogTitle>Новый проект<\/DialogTitle>/);
  assert.doesNotMatch(resources, /<ProjectCrudDialog[^>]*project=/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-parity.test.js`
Expected: FAIL — the dialog still has the full edit/delete code path and its call site still passes `project=`.

- [ ] **Step 3: Write minimal implementation**

Replace the whole `function ProjectCrudDialog({ open, onOpenChange, project, onSaved, people = [], projects = [] }) { ... }` block with:

```jsx
function ProjectCrudDialog({ open, onOpenChange, onSaved, people = [], projects = [] }) {
  const { draft, field, saving, error, save } = useCrudDialogForm({
    resource: 'projects', open, item: null, onOpenChange, onSaved,
    buildDraft: () => ({ name: '', projectKey: '', description: '', status: 'active' }),
    validate: (d) => {
      const key = String(d.projectKey || '').trim().toUpperCase();
      if (!d.name?.trim()) return 'Укажите название';
      if (!/^[A-Z0-9]{1,4}$/.test(key)) return 'Ключ проекта: от 1 до 4 латинских букв или цифр';
      return null;
    },
    buildPayload: (d) => ({
      name: d.name.trim(), projectKey: String(d.projectKey || '').trim().toUpperCase(),
      description: String(d.description || '').trim(), status: d.status, memberIds: [], memberLoads: {},
    }),
    forbiddenMessages: { save: 'Недостаточно прав' },
    mapSaveError: (e) => e?.status === 409 ? 'Такой ключ проекта уже используется' : e?.status === 400 ? 'Проверьте ключ проекта' : e?.status === 403 ? 'Недостаточно прав' : 'Не удалось сохранить проект',
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Новый проект</DialogTitle><DialogDescription>Ключ используется как идентификатор проекта и как префикс новых задач.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Название</Label><Input className="mt-1.5" value={draft.name||''} onChange={(e)=>field('name',e.target.value)} autoFocus/></div><div><Label>Ключ проекта</Label><Input className="mt-1.5 uppercase" maxLength={4} value={draft.projectKey||''} onChange={(e)=>field('projectKey',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="KODE"/><div className="mt-1 text-[12px] text-muted-foreground">До 4 латинских букв или цифр.</div></div><div><Label>Описание</Label><MentionEditor className="mt-1.5" value={draft.description||''} onChange={(value)=>field('description',value)} people={people} projects={projects} ariaLabel="Описание"/></div><div><Label>Статус</Label><Select value={draft.status||'active'} onValueChange={(v)=>field('status',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(PROJECT_STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>{error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></DialogFooter></DialogContent></Dialog>;
}
```

In `ProjectsPage` (the only remaining call site), change:

```jsx
    <ProjectCrudDialog open={createOpen} onOpenChange={setCreateOpen} project={null} onSaved={()=>projects.reload()} people={people.data} projects={projects.data}/>
```

to:

```jsx
    <ProjectCrudDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={()=>projects.reload()} people={people.data} projects={projects.data}/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client-parity.test.js`
Expected: PASS. Also run `npm test` once for the full suite (the only remaining reference to `project=` on a `ProjectCrudDialog` tag is gone).

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, go to `/projects`, click "Создать проект", fill the form, save, and confirm the new project opens/lists correctly.

- [ ] **Step 6: Commit**

```bash
git add src/pages/resources.jsx test/client-parity.test.js
git commit -m "refactor: drop dead edit/delete code from the now create-only ProjectCrudDialog"
```

---

## Task 8: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task only runs the existing suites and a manual end-to-end pass.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: PASS, zero failures, across `test/api.test.js`, `test/architecture.test.js`, `test/client-parity.test.js`, `test/theme-contrast.test.js`, `test/search-natural-language.test.js`.

- [ ] **Step 2: Manual end-to-end walkthrough**

Run: `npm run dev`. On a project's detail page, in order:
1. Edit the title and description inline; reload the page; confirm both persisted.
2. Change the status via the "Свойства" icon; confirm it persisted and the icon/label updated.
3. Click the key, change it to a value already used by another project; confirm the inline "уже используется" error appears and nothing saved; then set it to a valid unused value and confirm it saved.
4. Switch to Контекст → Команда/Задачи/Проблемы/Ссылки/Заметки; confirm each shows the right filtered/sorted content and Заметки's sticky board works (add/edit/delete a note).
5. Open "⋯" → "История версий"; confirm the edits from steps 1-3 show up and a restore works.
6. Open "⋯" → "Архивировать проект"; confirm the project disappears from `/projects` and from a task/meeting's project picker, but this detail page (same URL) still opens and the menu now offers "Восстановить из архива"; restore it and confirm it reappears everywhere.
7. Open "⋯" → "Удалить" on a disposable test project; confirm it navigates back to `/projects` and the project is gone.
8. On `/projects`, click "Создать проект" and confirm project creation still works.

- [ ] **Step 3: Commit (only if step 1 or 2 required fixes)**

```bash
git add -A
git commit -m "fix: address regressions found in full project-page pass"
```

If nothing needed fixing, skip this step — there is nothing to commit.
