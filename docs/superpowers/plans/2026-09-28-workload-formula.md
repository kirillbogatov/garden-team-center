# Workload Formula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hour-range workload model with a flat per-mode weight (1/2/3) plus a fragmentation penalty (+0.5 per project beyond the first), in both the client and the independently-duplicated server implementation, and add a formula-explaining hint to the `/team-load` page header.

**Architecture:** Two parallel, hand-written implementations of the same pure scoring function already exist — `src/lib/domain.js` (client, ESM, no deps) and `server/domain/smart-search.js` (server, CJS, powers the assistant digest). Neither imports the other. This plan updates both to the identical new formula, updates every UI string that displayed the old hour ranges, and adds one new UI element (a formula tooltip). No new visualization component, no new stored fields — `memberLoads` on a project (`{personId: mode}`) is untouched; only how a numeric score is derived from it changes.

**Tech Stack:** Plain JS/JSX (React 19, no state library), Node's built-in `node:test` + `node:assert/strict` test runner (no Jest/Vitest/RTL in this repo), Radix-based `Tooltip` already in `src/components/ui.jsx`.

## Global Constraints

- Weights: `full: 3, half: 2, support: 1`.
- Fragmentation penalty: `0.5` per active project beyond the first (`0` when a person has 0 or 1 active project).
- Level thresholds on the resulting score: `0` → "Нет загрузки", `(0, 1.5)` → "Низкая", `[1.5, 3)` → "Средняя", `[3, 5]` → "Полная", `> 5` → "Перегруз". These five labels and their `tone` mapping (client: `muted/warning/success/danger`; server: `none/small/medium/full/overloaded`) are unchanged — only the score they're keyed off changes.
- No raw score/number is displayed anywhere in the UI except inside the new formula hint tooltip (which explains the formula in the abstract, not a specific person's number). Every existing "N ч/день" / "(6–8 часов)" style string is removed, not reworded.
- Client (`src/lib/domain.js`) and server (`server/domain/smart-search.js`) must implement the identical formula — this repo has an explicit client/server parity convention (see `ARCHITECTURE.md`), and `test/smart-search.test.js` exercises the server copy end-to-end through the assistant's natural-language digest.
- This repo has no bundler-based test runner for client ESM files (no Jest/Vitest/Babel register). Existing tests that touch `src/pages/*.jsx` (`test/client-parity.test.js`, `test/ui-pattern-consistency.test.js`) verify behavior by reading the file as text and asserting on the source (`fs.readFileSync` + `assert.match`/`assert.ok`). Follow that convention for the `resources.jsx` changes in this plan. `src/lib/domain.js` is the one exception: it has zero imports, so its new test loads it for real (see Task 1) rather than pattern-matching source text — do not use that vm-loading trick on any file that isn't dependency-free like this one.

---

### Task 1: Rewrite the client workload formula (`src/lib/domain.js`)

**Files:**
- Modify: `src/lib/domain.js:49-78`
- Test: `test/workload-formula.test.js` (new)

**Interfaces:**
- Produces: `PROJECT_LOAD_OPTIONS` (now `{ full: {weight:3,label}, half: {weight:2,label}, support: {weight:1,label} }`, no more `min`/`max`/`rangeLabel`), `LOAD_FRAGMENTATION_PENALTY` (`0.5`), `projectLoadLevel(score)` → `{label, tone}`, `personProjectLoadSummary(personId, projects)` → `{projects, score, level}` (no more `minHours`/`maxHours`). `normalizeProjectMemberLoad` is unchanged. These are consumed by Task 2 (`resources.jsx`).

- [ ] **Step 1: Write the failing test**

Create `test/workload-formula.test.js`. Since `src/lib/domain.js` has zero imports, it can be loaded for real execution from a plain CJS test via Node's `vm` module (strip the `export` keywords, run the rest as one script, pull the named bindings back out) — this gives genuine behavioral coverage instead of a source-text pattern match:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDomain() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/lib/domain.js'), 'utf8');
  const withoutExports = source.replace(/^export (function|const)/gm, '$1');
  const context = { module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(
    `${withoutExports}\nObject.assign(module.exports, { PROJECT_LOAD_OPTIONS, LOAD_FRAGMENTATION_PENALTY, projectLoadLevel, personProjectLoadSummary, normalizeProjectMemberLoad });`,
    context,
    { filename: 'domain.js' },
  );
  return context.module.exports;
}

function project(id, mode, personId) {
  return { id, name: id, status: 'active', memberIds: [personId], memberLoads: { [personId]: mode } };
}

test('PROJECT_LOAD_OPTIONS exposes flat weights, not hour ranges', () => {
  const { PROJECT_LOAD_OPTIONS, LOAD_FRAGMENTATION_PENALTY } = loadDomain();
  assert.deepEqual(Object.keys(PROJECT_LOAD_OPTIONS).sort(), ['full', 'half', 'support']);
  assert.equal(PROJECT_LOAD_OPTIONS.full.weight, 3);
  assert.equal(PROJECT_LOAD_OPTIONS.half.weight, 2);
  assert.equal(PROJECT_LOAD_OPTIONS.support.weight, 1);
  assert.equal(PROJECT_LOAD_OPTIONS.full.min, undefined);
  assert.equal(PROJECT_LOAD_OPTIONS.full.rangeLabel, undefined);
  assert.equal(LOAD_FRAGMENTATION_PENALTY, 0.5);
});

test('personProjectLoadSummary sums weights and adds the fragmentation penalty', () => {
  const { personProjectLoadSummary } = loadDomain();
  const personId = 'p1';

  assert.equal(personProjectLoadSummary(personId, []).score, 0);
  assert.equal(personProjectLoadSummary(personId, []).level.label, 'Нет загрузки');

  const oneSupport = [project('a', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, oneSupport).score, 1);
  assert.equal(personProjectLoadSummary(personId, oneSupport).level.label, 'Низкая');

  const oneHalf = [project('a', 'half', personId)];
  assert.equal(personProjectLoadSummary(personId, oneHalf).score, 2);
  assert.equal(personProjectLoadSummary(personId, oneHalf).level.label, 'Средняя');

  const oneFull = [project('a', 'full', personId)];
  assert.equal(personProjectLoadSummary(personId, oneFull).score, 3);
  assert.equal(personProjectLoadSummary(personId, oneFull).level.label, 'Полная');

  // Фултайм + саппорт: 3+1=4, n=2, +0.5 => 4.5 => Полная
  const fullPlusSupport = [project('a', 'full', personId), project('b', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, fullPlusSupport).score, 4.5);
  assert.equal(personProjectLoadSummary(personId, fullPlusSupport).level.label, 'Полная');

  // Два парт-тайма + саппорт: 2+2+1=5, n=3, +1.0 => 6.0 => Перегруз
  const twoHalvesPlusSupport = [project('a', 'half', personId), project('b', 'half', personId), project('c', 'support', personId)];
  assert.equal(personProjectLoadSummary(personId, twoHalvesPlusSupport).score, 6);
  assert.equal(personProjectLoadSummary(personId, twoHalvesPlusSupport).level.label, 'Перегруз');

  // Четыре саппорта: 1x4=4, n=4, +1.5 => 5.5 => Перегруз (the case the old hour-range model got wrong)
  const fourSupports = ['a', 'b', 'c', 'd'].map((id) => project(id, 'support', personId));
  assert.equal(personProjectLoadSummary(personId, fourSupports).score, 5.5);
  assert.equal(personProjectLoadSummary(personId, fourSupports).level.label, 'Перегруз');

  // Paused projects don't count
  const pausedOnly = [{ ...project('a', 'full', personId), status: 'paused' }];
  assert.equal(personProjectLoadSummary(personId, pausedOnly).score, 0);
});

test('projectLoadLevel thresholds', () => {
  const { projectLoadLevel } = loadDomain();
  assert.equal(projectLoadLevel(0).label, 'Нет загрузки');
  assert.equal(projectLoadLevel(0.5).label, 'Низкая');
  assert.equal(projectLoadLevel(1.5).label, 'Средняя');
  assert.equal(projectLoadLevel(2.9).label, 'Средняя');
  assert.equal(projectLoadLevel(3).label, 'Полная');
  assert.equal(projectLoadLevel(5).label, 'Полная');
  assert.equal(projectLoadLevel(5.01).label, 'Перегруз');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workload-formula.test.js`
Expected: FAIL — `PROJECT_LOAD_OPTIONS.full.weight` is `undefined` (current code has `min`/`max`/`rangeLabel` instead), and `personProjectLoadSummary(...).score` is `undefined` (current code returns `minHours`/`maxHours`).

- [ ] **Step 3: Replace the workload model in `src/lib/domain.js`**

Replace lines 49-78 (from `export const PROJECT_LOAD_OPTIONS` through the end of `personProjectLoadSummary`) with:

```js
export const PROJECT_LOAD_OPTIONS = {
  full: { weight: 3, label: 'Фултайм' },
  half: { weight: 2, label: 'Парт-тайм' },
  support: { weight: 1, label: 'Саппорт' },
};

export function normalizeProjectMemberLoad(value) {
  const rawMode = value && typeof value === 'object' ? value.mode : value;
  return { mode: PROJECT_LOAD_OPTIONS[rawMode] ? rawMode : 'full' };
}

// Score = sum of per-project weights + 0.5 per active project beyond the first, a flat
// cost for context-switching that isn't tied to any one project.
export const LOAD_FRAGMENTATION_PENALTY = 0.5;
export const LOAD_LOW_MAX = 1.5;
export const LOAD_MEDIUM_MAX = 3;
export const LOAD_FULL_MAX = 5;

export function projectLoadLevel(score) {
  if (score > LOAD_FULL_MAX) return { label: 'Перегруз', tone: 'danger' };
  if (score >= LOAD_MEDIUM_MAX) return { label: 'Полная', tone: 'success' };
  if (score >= LOAD_LOW_MAX) return { label: 'Средняя', tone: 'warning' };
  if (score > 0) return { label: 'Низкая', tone: 'muted' };
  return { label: 'Нет загрузки', tone: 'muted' };
}

export function personProjectLoadSummary(personId, projects = []) {
  const active = projects.filter((project) => project.status === 'active' && (project.memberIds || []).includes(personId));
  const weights = active.map((project) => PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((project.memberLoads || {})[personId]).mode].weight);
  const score = weights.reduce((sum, weight) => sum + weight, 0) + (active.length > 1 ? LOAD_FRAGMENTATION_PENALTY * (active.length - 1) : 0);
  return { projects: active, score, level: projectLoadLevel(score) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workload-formula.test.js`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Fix the now-broken references in `src/pages/resources.jsx`**

`resources.jsx` reads `option.max`/`option.rangeLabel`/`summary.maxHours`, all of which no longer exist after Step 3 — this step must land in the same commit as Step 3 or the team-load page and person page render `undefined`.

In `personLoadShares` (`src/pages/resources.jsx:854-863`), replace:

```js
const LOAD_SERIES_COUNT = 8;
// Share of the person's max daily hours per project; largest-remainder rounding keeps the total at exactly 100%.
function personLoadShares(projects, personId) {
  const items = projects.map((project)=>{const option=PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode];return { project, option, hours: option.max };});
  const total = items.reduce((sum, item)=>sum + item.hours, 0) || 1;
  const withRaw = items.map((item)=>({ ...item, raw: item.hours / total * 100 }));
  withRaw.forEach((item)=>{ item.percent = Math.floor(item.raw); });
  let rest = 100 - withRaw.reduce((sum, item)=>sum + item.percent, 0);
  [...withRaw].sort((a, b)=>(b.raw - b.percent) - (a.raw - a.percent)).forEach((item)=>{ if (rest > 0) { item.percent += 1; rest -= 1; } });
  return withRaw;
}
```

with:

```js
const LOAD_SERIES_COUNT = 8;
// Share of the person's load weight per project; largest-remainder rounding keeps the total at exactly 100%.
function personLoadShares(projects, personId) {
  const items = projects.map((project)=>{const option=PROJECT_LOAD_OPTIONS[normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode];return { project, option, weight: option.weight };});
  const total = items.reduce((sum, item)=>sum + item.weight, 0) || 1;
  const withRaw = items.map((item)=>({ ...item, raw: item.weight / total * 100 }));
  withRaw.forEach((item)=>{ item.percent = Math.floor(item.raw); });
  let rest = 100 - withRaw.reduce((sum, item)=>sum + item.percent, 0);
  [...withRaw].sort((a, b)=>(b.raw - b.percent) - (a.raw - a.percent)).forEach((item)=>{ if (rest > 0) { item.percent += 1; rest -= 1; } });
  return withRaw;
}
```

In `LoadSummary` (`src/pages/resources.jsx:886`), replace the function body:

```jsx
function LoadSummary({ summary, projects, personId }) {
  return <div className="surface p-4"><div className="flex items-center justify-between gap-3"><Badge variant={summary.level.tone}>{summary.level.label}</Badge><span className="text-xs text-muted-foreground">до {summary.maxHours} ч/день</span></div><div className="mt-4 space-y-2">{summary.projects.length?summary.projects.map((project)=>{const mode=normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode;const option=PROJECT_LOAD_OPTIONS[mode];return <div key={project.id} className="flex items-center justify-between gap-3 text-sm"><Link to={`/projects/${encodeURIComponent(projectRef(project))}`} className="truncate font-medium hover:underline">{project.name}</Link><span className="shrink-0 text-xs text-muted-foreground">{option.label} · {option.rangeLabel}</span></div>}):<span className="text-sm text-muted-foreground">Нет активной проектной загрузки.</span>}</div></div>;
}
```

with:

```jsx
function LoadSummary({ summary, projects, personId }) {
  return <div className="surface p-4"><div className="flex items-center justify-between gap-3"><Badge variant={summary.level.tone}>{summary.level.label}</Badge></div><div className="mt-4 space-y-2">{summary.projects.length?summary.projects.map((project)=>{const mode=normalizeProjectMemberLoad((project.memberLoads||{})[personId]).mode;const option=PROJECT_LOAD_OPTIONS[mode];return <div key={project.id} className="flex items-center justify-between gap-3 text-sm"><Link to={`/projects/${encodeURIComponent(projectRef(project))}`} className="truncate font-medium hover:underline">{project.name}</Link><span className="shrink-0 text-xs text-muted-foreground">{option.label}</span></div>}):<span className="text-sm text-muted-foreground">Нет активной проектной загрузки.</span>}</div></div>;
}
```

In both `ProjectLoadDialog` (`src/pages/resources.jsx:969`) and `PersonLoadDialog` (`src/pages/resources.jsx:981`), the identical select-item text `{option.label} ({option.rangeLabel})` appears once each — replace both occurrences with `{option.label}` (a single find-and-replace-all for that exact substring across the file is safe: it's the same text with the same fix in both places, and does not appear anywhere else).

- [ ] **Step 6: Run the full client-facing test suite**

Run: `node --test test/workload-formula.test.js test/client-parity.test.js test/ui-pattern-consistency.test.js`
Expected: PASS. (These two existing suites only assert on label strings like `'Фултайм'`/`'Парт-тайм'`/`'Саппорт'` and section titles, not on `rangeLabel`/hours — confirmed by reading both files — so they should already pass unmodified.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain.js src/pages/resources.jsx test/workload-formula.test.js
git commit -m "feat: switch workload score to flat weights + fragmentation penalty"
```

---

### Task 2: Mirror the formula on the server (`server/domain/smart-search.js`)

**Files:**
- Modify: `server/domain/smart-search.js:29-51,683-705,778-782`
- Test: `test/smart-search.test.js:565-593` (existing, update expectations)

**Interfaces:**
- Consumes: nothing from Task 1 (independent module, per the spec's parity note — this is a deliberate duplication, not a shared import).
- Produces: `projectLoadLevel(score)`, `projectLoadSummary(score)`, `projectLoadConfig(value)`, `fragmentationPenalty(projectCount)` (new small helper, used by both digest builders below to avoid writing the same ternary twice).

- [ ] **Step 1: Update the failing test expectations first**

In `test/smart-search.test.js`, the test `'person digest exposes workload by project and all mentioned issues and agreements'` (lines 565-593) uses a person with one `half` (weight 2) + one `support` (weight 1) project. Under the new formula that's `2 + 1 = 3`, `n = 2`, `+0.5` penalty `= 3.5`, which is `>= 3` → **"Полная"** (`tone: 'full'`) — under the old hour model it was `5 + 2 = 7` → "Средняя". Update the assertions:

```js
  const result = ask(makeEngine({ projects, issues, agreements }), 'Как дела у Дуайта');
  const load = result.digest.sections.find((section) => section.title === 'Загрузка');
  assert.ok(load);
  assert.equal(load.layout, 'project-load');
  assert.equal(load.summary.variant, 'load-level');
  assert.equal(load.summary.tone, 'full');
  assert.equal(load.summary.text, 'Полная');
  assert.deepEqual(load.summary.action, { label: 'Изменить загрузку', command: 'openPersonLoadModal', arg: personId });
  assert.deepEqual(load.items.map((item) => [item.title, item.meta]), [
    ['Проект A', 'Парт-тайм'],
    ['Проект B', 'Саппорт'],
  ]);
```

(Only the four lines `summary.tone`, `summary.text`, and the two `meta` strings inside the `deepEqual` array change — everything else in that test is untouched.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/smart-search.test.js`
Expected: FAIL on the `'person digest exposes workload...'` test — actual `summary.tone` is still `'medium'`, actual `meta` is still `'Парт-тайм (3–5 часов)'`.

- [ ] **Step 3: Replace the load model and helpers in `server/domain/smart-search.js`**

Replace lines 29-51:

```js
const PROJECT_LOAD_OPTIONS = {
  full: { max: 8, label: 'Фултайм', rangeLabel: '6–8 часов' },
  half: { max: 5, label: 'Парт-тайм', rangeLabel: '3–5 часов' },
  support: { max: 2, label: 'Саппорт', rangeLabel: '1–2 часа' },
};

function projectLoadConfig(value) {
  const raw = value && typeof value === 'object' ? value.mode : value;
  return PROJECT_LOAD_OPTIONS[raw] || PROJECT_LOAD_OPTIONS.full;
}

function projectLoadLevel(maxHours) {
  if (maxHours > 10) return { label: 'Перегруз', tone: 'overloaded' };
  if (maxHours >= 8) return { label: 'Полная', tone: 'full' };
  if (maxHours >= 5) return { label: 'Средняя', tone: 'medium' };
  if (maxHours >= 1) return { label: 'Низкая', tone: 'small' };
  return { label: 'Нет загрузки', tone: 'none' };
}

function projectLoadSummary(maxHours) {
  const level = projectLoadLevel(maxHours);
  return { variant: 'load-level', tone: level.tone, text: level.label };
}
```

with:

```js
const PROJECT_LOAD_OPTIONS = {
  full: { weight: 3, label: 'Фултайм' },
  half: { weight: 2, label: 'Парт-тайм' },
  support: { weight: 1, label: 'Саппорт' },
};
const LOAD_FRAGMENTATION_PENALTY = 0.5;

function projectLoadConfig(value) {
  const raw = value && typeof value === 'object' ? value.mode : value;
  return PROJECT_LOAD_OPTIONS[raw] || PROJECT_LOAD_OPTIONS.full;
}

// Flat cost for spreading across more than one active project — not tied to any single project.
function fragmentationPenalty(projectCount) {
  return projectCount > 1 ? LOAD_FRAGMENTATION_PENALTY * (projectCount - 1) : 0;
}

function projectLoadLevel(score) {
  if (score > 5) return { label: 'Перегруз', tone: 'overloaded' };
  if (score >= 3) return { label: 'Полная', tone: 'full' };
  if (score >= 1.5) return { label: 'Средняя', tone: 'medium' };
  if (score > 0) return { label: 'Низкая', tone: 'small' };
  return { label: 'Нет загрузки', tone: 'none' };
}

function projectLoadSummary(score) {
  const level = projectLoadLevel(score);
  return { variant: 'load-level', tone: level.tone, text: level.label };
}
```

- [ ] **Step 4: Update the person-digest load calculation**

Replace lines 683-705 (from `const projects = visibleItems('projects'...` through the end of the `'Загрузка'` section object):

```js
    const projects = visibleItems('projects', user).filter((project) => project.status === 'active' && (project.memberIds || []).includes(id));
    const loadItems = projects.map((project) => {
      const cfg = projectLoadConfig((project.memberLoads || {})[id]);
      return {
        title: project.name,
        meta: `${cfg.label} (${cfg.rangeLabel})`,
        maxHours: cfg.max,
        open: { route: `/projects/${encodeURIComponent(project.projectKey || project.id)}` },
      };
    });

    const totalMaxHours = loadItems.reduce((sum, item) => sum + item.maxHours, 0);

    const sections = [
      {
        title: 'Загрузка',
        count: loadItems.length,
        items: loadItems,
        more: 0,
        layout: 'project-load',
        summary: {
          ...projectLoadSummary(totalMaxHours),
          action: { label: 'Изменить загрузку', command: 'openPersonLoadModal', arg: id },
        },
        emptyText: 'Нет активных проектов',
      },
```

with:

```js
    const projects = visibleItems('projects', user).filter((project) => project.status === 'active' && (project.memberIds || []).includes(id));
    const loadItems = projects.map((project) => {
      const cfg = projectLoadConfig((project.memberLoads || {})[id]);
      return {
        title: project.name,
        meta: cfg.label,
        weight: cfg.weight,
        open: { route: `/projects/${encodeURIComponent(project.projectKey || project.id)}` },
      };
    });

    const loadScore = loadItems.reduce((sum, item) => sum + item.weight, 0) + fragmentationPenalty(loadItems.length);

    const sections = [
      {
        title: 'Загрузка',
        count: loadItems.length,
        items: loadItems,
        more: 0,
        layout: 'project-load',
        summary: {
          ...projectLoadSummary(loadScore),
          action: { label: 'Изменить загрузку', command: 'openPersonLoadModal', arg: id },
        },
        emptyText: 'Нет активных проектов',
      },
```

- [ ] **Step 5: Update the team-digest load calculation**

Replace lines 778-782:

```js
    const loadItems = people.map((person) => {
      const maxHours = projects
        .filter((project) => (project.memberIds || []).includes(person.id))
        .reduce((sum, project) => sum + projectLoadConfig((project.memberLoads || {})[person.id]).max, 0);
      const level = projectLoadLevel(maxHours);
```

with:

```js
    const loadItems = people.map((person) => {
      const personProjects = projects.filter((project) => (project.memberIds || []).includes(person.id));
      const score = personProjects.reduce((sum, project) => sum + projectLoadConfig((project.memberLoads || {})[person.id]).weight, 0) + fragmentationPenalty(personProjects.length);
      const level = projectLoadLevel(score);
```

(The next line, `return { title: person.name, meta: level.label, ...`, is unchanged — leave it as-is.)

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/smart-search.test.js`
Expected: PASS (all tests in the file, including the updated one and the unrelated `'"загрузка у <человека>" returns only the workload section'` test at line 783, which only checks section titles and is unaffected).

- [ ] **Step 7: Commit**

```bash
git add server/domain/smart-search.js test/smart-search.test.js
git commit -m "feat: mirror weighted workload formula in the assistant's smart search"
```

---

### Task 3: Add the formula hint to the `/team-load` page header

**Files:**
- Modify: `src/pages/resources.jsx:1-5` (imports), `src/pages/resources.jsx:570` (`TeamLoadPage`)
- Test: `test/workload-formula.test.js` (append to the file created in Task 1)

**Interfaces:**
- Consumes: `Tooltip` from `@/components/ui` (existing, `src/components/ui.jsx:155-156`), `Info` from `lucide-react` (existing dependency, not yet imported in this file). No consumers — this is a leaf UI addition.

- [ ] **Step 1: Write the failing test**

Append to `test/workload-formula.test.js` (this one reads `resources.jsx` as text, per the repo's established convention for files that can't be executed directly under `node --test` — see Global Constraints):

```js
test('the /team-load page header explains the workload formula', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const resources = fs.readFileSync(path.join(__dirname, '..', 'src/pages/resources.jsx'), 'utf8');
  assert.match(resources, /import \{[^}]*\bTooltip\b[^}]*\} from '@\/components\/ui'/);
  assert.match(resources, /import \{[^}]*\bInfo\b[^}]*\} from 'lucide-react'/);
  assert.match(resources, /aria-label="Как считается загрузка"/);
  assert.match(resources, /Фултайм — 3, Парт-тайм — 2, Саппорт — 1/);
  assert.match(resources, /0\.5 за каждый проект сверх первого/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workload-formula.test.js`
Expected: FAIL — none of the four patterns exist yet in `resources.jsx`.

- [ ] **Step 3: Import `Tooltip` and `Info`**

In `src/pages/resources.jsx`, the icon import (line 3-5) currently reads:

```js
import {
  ArrowLeft, BriefcaseBusiness, CalendarPlus, Check, ChevronDown, CircleDot, Copy, TriangleAlert, Clock3, ExternalLink, Gauge, Goal, Handshake, History, Link2, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, Users, Workflow, Wrench, X,
} from 'lucide-react';
```

Add `Info` to that list (alphabetical position doesn't matter here, the file doesn't enforce it — append it): `..., History, Info, Link2, ...`.

The `@/components/ui` import (lines 9-11) currently reads:

```js
import {
  AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch, Textarea,
} from '@/components/ui';
```

Add `Tooltip` to that list: `..., Switch, Textarea, Tooltip,`.

- [ ] **Step 4: Add the hint to `TeamLoadPage`'s `PageHeader`**

Replace (`src/pages/resources.jsx:570`):

```jsx
    <PageHeader title="Загрузка" description="Распределение загрузки команды по проектам."/>
```

with:

```jsx
    <PageHeader
      title={<span className="inline-flex items-center gap-1.5">Загрузка
        <Tooltip content={<div className="max-w-[260px] space-y-1">
          <div>Загрузка = сумма весов режимов (Фултайм — 3, Парт-тайм — 2, Саппорт — 1) + 0.5 за каждый проект сверх первого.</div>
          <div className="text-muted-foreground">Низкая &lt; 1.5 · Средняя 1.5–3 · Полная 3–5 · Перегруз &gt; 5</div>
        </div>}>
          <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" aria-label="Как считается загрузка"/>
        </Tooltip>
      </span>}
      description="Распределение загрузки команды по проектам."
    />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/workload-formula.test.js`
Expected: PASS (all tests, including the new header test)

- [ ] **Step 6: Run the full suite once**

Run: `node --test`
Expected: PASS across the whole repo (this is the final task of the plan — confirms nothing else references the removed `min`/`max`/`rangeLabel`/`minHours`/`maxHours` fields).

- [ ] **Step 7: Commit**

```bash
git add src/pages/resources.jsx test/workload-formula.test.js
git commit -m "feat: add formula hint to the team workload page header"
```
