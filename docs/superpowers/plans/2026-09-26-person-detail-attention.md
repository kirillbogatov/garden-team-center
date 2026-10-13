# Employee Page: Two-Column Layout, "О сотруднике", "Обратить внимание" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the team-member profile page (`PersonDetailPage`, `src/pages/resources.jsx`), lay "Загрузка" and "Развитие" out as two columns, rename/move "Контакты" to "О сотруднике" below that row, and add a teamlead-only "Обратить внимание" section that surfaces workload/issue/vacation signals.

**Architecture:** Pure client-side change. A small pure predicate (`isTeamlead`) and a small pure date helper (`personUpcomingVacation`) move/land in `src/lib/domain.js` (already the home for this page's other pure helpers like `personProjectLoadSummary`). `user` (already available at the router level from `AuthGate`) gets threaded one level deeper, from `App.jsx` into `PersonDetailPage`, which didn't need it before. All signal computation stays inline in `PersonDetailPage`, reusing data the page already fetches (`state.data`) — no new API calls, no new server code.

**Tech Stack:** React 18 (function components, no class components), react-router-dom, Tailwind utility classes + a small amount of hand-written CSS in `src/styles.css` for structural grid layout (this codebase's established pattern for `.person-card*` classes), lucide-react icons. Test runner: Node's built-in `node:test` (`npm test`), used here only to confirm no regressions — this codebase does not have component-rendering tests for pages like this one; verification is `npm test` (static/consistency checks) plus manual browser testing, matching how prior specs in `docs/superpowers/specs/` were verified.

## Global Constraints

- Stakeholder profiles (`person.type !== 'team'`) must be completely unaffected — every change in this plan lives inside the existing `{isTeam && <>...</>}` block in `PersonDetailPage`, or is gated by `isTeam` in newly computed values.
- No new API endpoints or server changes — all data already arrives via the existing `/api/people/:id/profile` response (`state.data`).
- "Обратить внимание" renders nothing (not an empty-state card) when there are zero signals, and nothing at all for non-teamlead viewers.
- Vacation signal only counts `type === 'vacation'` entries whose `startDate` is strictly in the future and within 7 days — not vacations already in progress.
- Reuse the existing `Badge`/Tailwind tone vocabulary already used on this page (`danger` red / `warning` amber) instead of inventing new colors.

---

## Task 1: Move `isTeamlead` into `src/lib/domain.js` and add the vacation-lookahead helper

**Files:**
- Modify: `src/lib/domain.js` (add two exports near the other pure helpers, after `personProjectLoadSummary` at line 75)
- Modify: `src/components/assistant.jsx:109-111` (delete the local `isTeamlead`, import it instead)
- Test: `test/architecture.test.js` (existing suite — confirms nothing else broke; no new test file needed for this task)

**Interfaces:**
- Produces: `export function isTeamlead(user)` — returns `boolean`. Same signature/behavior as the function currently private to `assistant.jsx`.
- Produces: `export function personUpcomingVacation(personId, vacations = [], todayKey = localTodayKey(), withinDays = 7)` — returns the first vacation object (shape `{ id, type, personId, startDate, endDate, note? }`) from `vacations` matching `type === 'vacation'`, `personId` match, and `startDate` strictly after `todayKey` but within `withinDays` days of it; otherwise `null`.
- Consumes (Task 4): both functions above, imported from `@/lib/domain`.

- [ ] **Step 1: Add `isTeamlead` and `personUpcomingVacation` to `src/lib/domain.js`**

Insert right after the closing brace of `personProjectLoadSummary` (currently ending at line 75, right before `export function localTodayKey()`):

```js
export function isTeamlead(user) {
  return user?.role === 'teamlead' || user?.role === 'admin' || user?.roles?.includes?.('teamlead') || user?.roles?.includes?.('admin');
}
```

Then, after `export function localTodayKey() { ... }` (the function that already exists at line 77-83 in the file), add:

```js
export function personUpcomingVacation(personId, vacations = [], todayKey = localTodayKey(), withinDays = 7) {
  const today = new Date(`${todayKey}T00:00:00`);
  return (vacations || []).find((item) => {
    if (item.personId !== personId || item.type !== 'vacation') return false;
    const startKey = String(item.startDate || '').slice(0, 10);
    if (!startKey || startKey <= todayKey) return false;
    const diffDays = Math.round((new Date(`${startKey}T00:00:00`) - today) / 86400000);
    return diffDays > 0 && diffDays <= withinDays;
  }) || null;
}
```

(`localTodayKey` is already defined in this file and already used as a default-parameter pattern by `meetingIsPast`/`meetingIsMissed` two functions below it — follow that same pattern.)

- [ ] **Step 2: Remove the private copy from `assistant.jsx` and import the shared one**

In `src/components/assistant.jsx`, delete lines 109-111:

```js
function isTeamlead(user) {
  return user?.role === 'teamlead' || user?.role === 'admin' || user?.roles?.includes?.('teamlead') || user?.roles?.includes?.('admin');
}
```

Add `isTeamlead` to the existing domain import. `assistant.jsx` currently has no import from `@/lib/domain` — add a new import line right after the existing `@/lib/utils` import (line 17):

```js
import { isTeamlead } from '@/lib/domain';
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: same pass/fail state as before this change (no new failures — this is a pure refactor, `isTeamlead(user)` call sites and behavior in `assistant.jsx` are unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain.js src/components/assistant.jsx
git commit -m "refactor: move isTeamlead to lib/domain, add personUpcomingVacation helper"
```

---

## Task 2: Thread `user` into `PersonDetailPage`

**Files:**
- Modify: `src/App.jsx:34`
- Modify: `src/pages/resources.jsx:589`

**Interfaces:**
- Consumes: none new.
- Produces: `PersonDetailPage` now accepts a `user` prop (same shape as every other page that already receives it, e.g. `HomePage`, `TasksPage` — `{ id, role, roles, personId, access }`). Task 4 reads `user.role`/`user.roles` off this prop via `isTeamlead(user)`.

- [ ] **Step 1: Pass `user` on the route**

In `src/App.jsx`, change line 34 from:

```js
    <Route path="/people/:id" element={<PersonDetailPage/>}/>
```

to:

```js
    <Route path="/people/:id" element={<PersonDetailPage user={user}/>}/>
```

- [ ] **Step 2: Accept the prop in the component**

In `src/pages/resources.jsx`, change line 589 from:

```js
export function PersonDetailPage() {
```

to:

```js
export function PersonDetailPage({ user }) {
```

(No other line in the function needs to change yet — `user` is unused until Task 4 wires it into the attention-signal gate. This step alone will not trigger an unused-var lint failure because it's a destructured function parameter, not a local variable.)

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: same pass/fail state as before — `test/architecture.test.js` checks specific literal strings in `src/app.jsx`/other files unrelated to this route line; confirm it still passes.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/pages/resources.jsx
git commit -m "feat: thread current user into PersonDetailPage"
```

---

## Task 3: Two-column "Загрузка"/"Развитие" row + rename/move "Контакты" → "О сотруднике"

**Files:**
- Modify: `src/pages/resources.jsx:659-709` (the `{isTeam && <>...</>}` block)
- Modify: `src/styles.css` (add `.person-card-row` near the other `.person-card*` rules, after line 3593 — the blank line right before the `html .person-card .surface` rule)

**Interfaces:**
- Consumes: none new from other tasks.
- Produces: none consumed by later tasks (purely visual reorder).

- [ ] **Step 1: Add the two-column grid CSS**

In `src/styles.css`, insert this block right after `.person-card-empty-copy { ... }` (ends at line 3592) and before the blank-line-then-`html .person-card .surface` rule:

```css
.person-card-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
```

And inside the existing `@media (max-width: 720px) { ... }` block (currently lines 3609-3613), add one more rule alongside `.person-card { padding: 16px; }` etc.:

```css
  .person-card-row { grid-template-columns: 1fr; }
```

- [ ] **Step 2: Reorder and rename the JSX**

In `src/pages/resources.jsx`, the current block (lines 659-709) is:

```jsx
      {isTeam && <>
        <section className="person-card">
          <SectionHeader title="Контакты" compact/>
          <div className="person-contact-grid person-contact-grid--paired">
            <PersonContextItem label="Дата найма" value={person.hireDate?formatDate(person.hireDate):'Не указано'}/>
            <PersonContextItem label="Стаж" value={person.hireDate?personTenureLabel(person.hireDate):'Не указано'}/>
            <PersonContextItem label="Дата рождения" value={person.birthday?formatDate(person.birthday):'Не указано'}/>
            <PersonContextItem label="Город" value={person.city||'Не указано'}/>
            <PersonContextItem label="Рабочая почта" value={person.email?<a className="person-profile-link" href={`mailto:${person.email}`}>{person.email}</a>:'Не указано'}/>
            <PersonContextItem label="Тег в Telegram" value={person.telegram||'Не указано'}/>
            <PersonContextItem label="График работы" value={person.workStart&&person.workEnd?`${person.workStart}–${person.workEnd}`:'Не указано'}/>
            <PersonContextItem label="Локальное время" value={localTimeLabel(person)}/>
          </div>
        </section>

        <section className="person-card">
          <SectionHeader title="Загрузка" compact actions={<Button variant="ghost" size="sm" onClick={()=>setLoadOpen(true)}>Настроить</Button>}/>
          <div className="person-load-summary"><Badge variant={summary.level.tone}>{summary.level.label}</Badge><span className="text-xs text-muted-foreground">до {summary.maxHours} ч/день</span></div>
          {summary.projects.length ? <div className="surface overflow-hidden">{summary.projects.map((project)=>{const mode=normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;const option=PROJECT_LOAD_OPTIONS[mode];return <EntityRow key={project.id} onOpen={()=>navigate(`/projects/${encodeURIComponent(projectRef(project))}`)} title={project.name} meta={[`${option.label} · ${option.rangeLabel}`]}/>;})}</div> : <div className="person-card-empty"><div className="person-card-empty-title">Проектной загрузки нет</div><div className="person-card-empty-copy">Для сотрудника пока не настроена загрузка по проектам.</div></div>}
        </section>

        <section className="person-card person-development-card">
          <SectionHeader title="Развитие" compact/>
          <Tabs
            className="person-tabs"
            ariaLabel="Развитие сотрудника"
            value={developmentTab}
            onValueChange={setDevelopmentTab}
            items={[
              {value:'main',label:'Основное'},
              {value:'meetings',label:'1:1 / PR',count:developmentMeetings.length},
              {value:'technology',label:'Технологизация',count:developmentTasks.length+labs.length},
            ]}
          />
          <div className="person-development-tab-body">
            {developmentTab==='main'&&<div className="person-contact-grid">
              <PersonContextItem label="ИПР" value={person.iprUrl?<a href={person.iprUrl} target="_blank" rel="noreferrer" className="person-profile-link">открыть</a>:<span className="text-muted-foreground">не указано</span>}/>
              <PersonContextItem label="1:1" value={person.oneOnOneEveryMonths?personIntervalLabel(person.oneOnOneEveryMonths):'Не запланировано'}/>
              <PersonContextItem label="Скиллсет" value={person.skillsetUrl?<a href={person.skillsetUrl} target="_blank" rel="noreferrer" className="person-profile-link">открыть</a>:<span className="text-muted-foreground">не указано</span>}/>
              <PersonContextItem label="PR" value={person.prEveryMonths?personIntervalLabel(person.prEveryMonths):'Не запланировано'}/>
              <div className="person-development-notes">
                <PersonTextContext title="Сильные стороны / что нравится" text={person.strengthsLikes || person.developmentFocus} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
                <PersonTextContext title="Слабые стороны / что не нравится" text={person.weaknessesDislikes} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
              </div>
            </div>}
            {developmentTab==='meetings'&&<MeetingList items={developmentMeetings} empty="Нет встреч 1:1 / PR" navigate={navigate} people={allPeople.data} projects={allProjects.data}/>} 
            {developmentTab==='technology'&&<TechnologyDevelopmentList tasks={developmentTasks} labs={labs} navigate={navigate} onStatusChanged={state.reload} people={allPeople.data} projects={allProjects.data}/>} 
          </div>
        </section>

      </>}
```

Replace it with (same inner JSX, only reordered and the one title string changed — "Загрузка"/"Развитие" wrapped in a `.person-card-row` div, "Контакты"→"О сотруднике" moved after that div):

```jsx
      {isTeam && <>
        <div className="person-card-row">
          <section className="person-card">
            <SectionHeader title="Загрузка" compact actions={<Button variant="ghost" size="sm" onClick={()=>setLoadOpen(true)}>Настроить</Button>}/>
            <div className="person-load-summary"><Badge variant={summary.level.tone}>{summary.level.label}</Badge><span className="text-xs text-muted-foreground">до {summary.maxHours} ч/день</span></div>
            {summary.projects.length ? <div className="surface overflow-hidden">{summary.projects.map((project)=>{const mode=normalizeProjectMemberLoad((project.memberLoads||{})[person.id]).mode;const option=PROJECT_LOAD_OPTIONS[mode];return <EntityRow key={project.id} onOpen={()=>navigate(`/projects/${encodeURIComponent(projectRef(project))}`)} title={project.name} meta={[`${option.label} · ${option.rangeLabel}`]}/>;})}</div> : <div className="person-card-empty"><div className="person-card-empty-title">Проектной загрузки нет</div><div className="person-card-empty-copy">Для сотрудника пока не настроена загрузка по проектам.</div></div>}
          </section>

          <section className="person-card person-development-card">
            <SectionHeader title="Развитие" compact/>
            <Tabs
              className="person-tabs"
              ariaLabel="Развитие сотрудника"
              value={developmentTab}
              onValueChange={setDevelopmentTab}
              items={[
                {value:'main',label:'Основное'},
                {value:'meetings',label:'1:1 / PR',count:developmentMeetings.length},
                {value:'technology',label:'Технологизация',count:developmentTasks.length+labs.length},
              ]}
            />
            <div className="person-development-tab-body">
              {developmentTab==='main'&&<div className="person-contact-grid">
                <PersonContextItem label="ИПР" value={person.iprUrl?<a href={person.iprUrl} target="_blank" rel="noreferrer" className="person-profile-link">открыть</a>:<span className="text-muted-foreground">не указано</span>}/>
                <PersonContextItem label="1:1" value={person.oneOnOneEveryMonths?personIntervalLabel(person.oneOnOneEveryMonths):'Не запланировано'}/>
                <PersonContextItem label="Скиллсет" value={person.skillsetUrl?<a href={person.skillsetUrl} target="_blank" rel="noreferrer" className="person-profile-link">открыть</a>:<span className="text-muted-foreground">не указано</span>}/>
                <PersonContextItem label="PR" value={person.prEveryMonths?personIntervalLabel(person.prEveryMonths):'Не запланировано'}/>
                <div className="person-development-notes">
                  <PersonTextContext title="Сильные стороны / что нравится" text={person.strengthsLikes || person.developmentFocus} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
                  <PersonTextContext title="Слабые стороны / что не нравится" text={person.weaknessesDislikes} onNavigateMention={(kind, mentionId)=>navigate(kind === 'project' ? `/projects/${mentionId}` : `/people/${mentionId}`)}/>
                </div>
              </div>}
              {developmentTab==='meetings'&&<MeetingList items={developmentMeetings} empty="Нет встреч 1:1 / PR" navigate={navigate} people={allPeople.data} projects={allProjects.data}/>} 
              {developmentTab==='technology'&&<TechnologyDevelopmentList tasks={developmentTasks} labs={labs} navigate={navigate} onStatusChanged={state.reload} people={allPeople.data} projects={allProjects.data}/>} 
            </div>
          </section>
        </div>

        <section className="person-card">
          <SectionHeader title="О сотруднике" compact/>
          <div className="person-contact-grid person-contact-grid--paired">
            <PersonContextItem label="Дата найма" value={person.hireDate?formatDate(person.hireDate):'Не указано'}/>
            <PersonContextItem label="Стаж" value={person.hireDate?personTenureLabel(person.hireDate):'Не указано'}/>
            <PersonContextItem label="Дата рождения" value={person.birthday?formatDate(person.birthday):'Не указано'}/>
            <PersonContextItem label="Город" value={person.city||'Не указано'}/>
            <PersonContextItem label="Рабочая почта" value={person.email?<a className="person-profile-link" href={`mailto:${person.email}`}>{person.email}</a>:'Не указано'}/>
            <PersonContextItem label="Тег в Telegram" value={person.telegram||'Не указано'}/>
            <PersonContextItem label="График работы" value={person.workStart&&person.workEnd?`${person.workStart}–${person.workEnd}`:'Не указано'}/>
            <PersonContextItem label="Локальное время" value={localTimeLabel(person)}/>
          </div>
        </section>
      </>}
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: same pass/fail state as before — no existing test references "Контакты", `person-contact-grid--paired`, or these section titles by exact position, only `test/css-syntax.test.js` (validates `src/styles.css` parses) needs to keep passing given the new CSS block.

- [ ] **Step 4: Commit**

```bash
git add src/pages/resources.jsx src/styles.css
git commit -m "feat: two-column workload/development layout, rename Контакты to О сотруднике"
```

---

## Task 4: Add the "Обратить внимание" section

**Files:**
- Modify: `src/pages/resources.jsx` (imports at the top; new local component; signal computation in `PersonDetailPage`; render call after the hero `<section className="person-card person-card--hero">...</section>`, which currently ends at line 657)

**Interfaces:**
- Consumes: `isTeamlead(user)` and `personUpcomingVacation(personId, vacations)` from `@/lib/domain` (Task 1). `user` prop on `PersonDetailPage` (Task 2). `summary`, `openIssues`, `tasks`, `vacations`, `person`, `isTeam` — all already computed/destructured earlier in `PersonDetailPage` (lines 614-625).
- Produces: a new local component `PersonAttentionSection({ signals })` — `signals` is an array of `{ key: string, tone: 'warning' | 'danger', label: string }`. Not consumed elsewhere; this is the leaf of the feature.

- [ ] **Step 1: Add the signal-descriptor component**

In `src/pages/resources.jsx`, add this function right after `PersonTextContext` (which currently ends at line 771, right before `function LoadSummary({ summary, projects, personId }) {` at line 773):

```jsx
function PersonAttentionSection({ signals }) {
  if (!signals.length) return null;
  return <section className="person-card">
    <SectionHeader title="Обратить внимание" compact/>
    <div className="flex flex-col gap-2.5">
      {signals.map((signal) => <div key={signal.key} className={cn('flex items-center gap-2 text-sm', signal.tone === 'danger' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300')}>
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true"/>
        <span>{signal.label}</span>
      </div>)}
    </div>
  </section>;
}
```

- [ ] **Step 2: Import the new domain helpers**

In `src/pages/resources.jsx`, the existing `@/lib/domain` import (lines 24-27) is:

```js
import {
  AGREEMENT_STATUS_LABEL, GOAL_STATUS_LABEL, ISSUE_IMPORTANCE_LABEL, ISSUE_STATUS_LABEL, PERSON_STATUS_LABEL,
  PROCESS_STATUS_LABEL, PROJECT_LOAD_OPTIONS, PROJECT_STATUS_LABEL, MEETING_TYPE_LABEL, meetingDisplayTitle, normalizeProjectMemberLoad, personProjectLoadSummary,
} from '@/lib/domain';
```

Change it to:

```js
import {
  AGREEMENT_STATUS_LABEL, GOAL_STATUS_LABEL, ISSUE_IMPORTANCE_LABEL, ISSUE_STATUS_LABEL, PERSON_STATUS_LABEL,
  PROCESS_STATUS_LABEL, PROJECT_LOAD_OPTIONS, PROJECT_STATUS_LABEL, MEETING_TYPE_LABEL, isTeamlead, meetingDisplayTitle, normalizeProjectMemberLoad, personProjectLoadSummary, personUpcomingVacation,
} from '@/lib/domain';
```

- [ ] **Step 3: Compute the signals in `PersonDetailPage` and render the section**

In `src/pages/resources.jsx`, right after this existing line (currently line 625):

```js
  const openAgreements = agreements.filter((agreement)=>agreement.status !== 'done');
```

add:

```js
  const openTasks = tasks.filter((task)=>!task.archivedAt && task.status !== 'done');
  const attentionSignals = [];
  if (isTeam && isTeamlead(user)) {
    summary.projects.filter((project)=>!openTasks.some((task)=>task.projectId === project.id))
      .forEach((project)=>attentionSignals.push({ key: `no-tasks-${project.id}`, tone: 'warning', label: `Нет задач по активному проекту «${project.name}»` }));
    if (summary.level.tone === 'muted') attentionSignals.push({ key: 'incomplete-load', tone: 'warning', label: `Неполная загрузка: ${summary.level.label.toLowerCase()}` });
    if (summary.level.tone === 'danger') attentionSignals.push({ key: 'overload', tone: 'danger', label: `Перегруз: до ${summary.maxHours} ч/день` });
    if (openIssues.length) attentionSignals.push({ key: 'issues', tone: 'warning', label: `Активные проблемы: ${openIssues.length}` });
    const vacation = personUpcomingVacation(person.id, vacations);
    if (vacation) attentionSignals.push({ key: 'vacation', tone: 'warning', label: `Скоро в отпуск: с ${formatDate(vacation.startDate)}` });
  }
```

(`summary` is guaranteed non-null here whenever `isTeam` is true — it's computed at line 618 as `isTeam ? personProjectLoadSummary(...) : null`, and this whole block is itself gated by `isTeam &&`.)

Then render the section right after the hero `<section className="person-card person-card--hero">...</section>` closes (currently line 657, right before the blank line and `{isTeam && <>`):

```jsx
      <PersonAttentionSection signals={attentionSignals}/>
```

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: same pass/fail state as before this change.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`, open the app, log in, and navigate to `/people/:id` for a team member.

Check, as a teamlead/admin user:
- A team member staffed on an active project with zero open tasks shows the "Нет задач по активному проекту «...»" row (and that a *paused* project the person is staffed on does NOT produce this row).
- A team member with "Низкая"/"Нет загрузки" workload shows "Неполная загрузка: ...".
- A team member with "Перегруз" shows "Перегруз: до N ч/день" in red (`text-destructive`), distinct in color from the amber rows.
- A team member with an unresolved issue linked shows "Активные проблемы: N".
- A team member with a vacation starting within the next 7 days shows "Скоро в отпуск: с <date>"; one starting in 8+ days, or already in progress, shows nothing.
- A team member with none of the above shows no "Обратить внимание" section at all.

Then, log in (or switch) as a `member`-role (non-teamlead) user and confirm the section never appears, even for a profile that would show signals to a teamlead.

Finally, confirm visually: the "Загрузка"/"Развитие" row sits side by side on a normal desktop width and stacks to one column below 720px; "О сотруднике" renders below that row with its original two-column contact grid intact; stakeholder profiles (`/stakeholders` → a stakeholder's detail page) are unchanged (no attention section, no two-column row, no "О сотруднике" — they never had "Контакты" rendered to begin with... confirm this is still true, i.e. the whole `isTeam && <>...</>` gate still wraps everything as before).

- [ ] **Step 6: Commit**

```bash
git add src/pages/resources.jsx
git commit -m "feat: add teamlead-only Обратить внимание section to employee page"
```
