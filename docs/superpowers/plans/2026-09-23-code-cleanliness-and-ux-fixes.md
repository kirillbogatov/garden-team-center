# Code Cleanliness & UI/UX Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding from the 2026-09-23 code-cleanliness and UI/UX audit: the badge contrast bug, `window.confirm()` usage, the four duplicated status-icon components, the ~20 duplicated CRUD dialogs, the duplicate tab implementation, the triplicated text-matching helpers, assorted dead code/misplaced helpers, and the 5,841-line `styles.css` duplication/`!important` sprawl — without changing any observable product behavior.

**Architecture:** Extract shared hooks/components for the duplicated patterns (`useEntityStatus`+`StatusControl`, `useCrudDialogForm`+`AlertDialog`), consolidate the accidental duplicate implementations (tabs, text-matching), delete dead code, and do a conservative dead-CSS-elimination pass on `styles.css` (remove genuinely superseded/unused rules and safely-droppable `!important`s — this is **not** a visual redesign, since no browser/screenshot tooling is available in this environment to verify one).

**Tech Stack:** React 19, Tailwind CSS 3, Radix UI primitives, `class-variance-authority`, Node's built-in test runner (`node --test`, plain `assert`-based, mostly static text/regex assertions over source files — see existing `test/theme-contrast.test.js` and `test/ui-pattern-consistency.test.js` for the house style).

## Global Constraints

- No visual/behavioral regressions: every existing test in `test/` must keep passing (`npm test` — 207 tests at baseline, commit `d66c0a8`). Run it after every task.
- Preserve Russian-language user-facing strings verbatim (error messages, confirm texts, labels) unless a task explicitly says to change one.
- Follow the existing test house style: plain `node:test` + `node:assert/strict`, reading source files as text with `fs.readFileSync` and asserting patterns — do not introduce a new test framework or a DOM-rendering test.
- Do not touch `node_modules/`, `public/`, or `GardenData/`.
- Commit after each task with `git add <touched files> && git commit`. Never `git add -A` blindly — review `git status` first.
- The CSS task (Task 9) must not change any selector's final computed declarations for any still-referenced class — only remove rules for selectors that are provably dead/superseded, and drop `!important` only where removing it cannot change the cascade outcome (i.e., no later rule of equal-or-higher specificity targets the same property on the same selector).

---

## File Structure

New files this plan creates:
- `src/hooks/use-entity-status.js` — shared optimistic-status-change hook (Task 4).
- `src/hooks/use-crud-dialog-form.js` — shared create/edit/delete dialog state hook (Task 6).
- `server/domain/text-match.js` — shared `escapeRe`/`containsPhrase`/`norm`/`stemRu` (Task 2).
- `src/lib/link-preview.js` — Jira-link + material/service-icon helpers extracted from `tasks.jsx` (Task 3).
- `src/lib/goal-progress.js` — domain math extracted from `goal-tree.js` (Task 3).

Modified: `src/components/ui.jsx`, `src/components/status.jsx`, `src/lib/appearance.js`, `src/lib/domain.js`, `src/lib/utils.js`, `src/lib/goal-tree.js`, `src/components/assistant.jsx`, `src/components/search-palette.jsx`, `server/routes/search.js`, `server/domain/smart-search.js`, `src/pages/{resources,tasks,technology,operations,knowledge-tools,misc,workspace,journal,admin}.jsx`, `src/styles.css`, `test/theme-contrast.test.js`, `test/ui-pattern-consistency.test.js`.

---

### Task 1: Fix the Badge/`text-primary` contrast bug

**Files:**
- Modify: `src/components/ui.jsx:123-135` (`badgeVariants`)
- Modify: `test/theme-contrast.test.js` (add computed-contrast test)

**Problem:** `badgeVariants.default` is `'border-transparent bg-primary/10 text-primary'` (`ui.jsx:126`). `--primary` is tuned to be used as a **background** (paired with a separately-computed `--primary-foreground`), not as foreground text over a near-white/near-background surface. Measured contrast on the default theme+accent (`disk-light` + `green`) is ~2.74:1; several accents (`yellow` 1.43:1, `peach` 2.34:1) fail WCAG AA (4.5:1) badly. `accent-foreground` is already correctly darkened per-theme for exactly this situation — reuse it instead of inventing a new token.

**Interfaces:**
- Consumes: nothing new — `--accent-foreground` already exists per theme (verified present in every `html.theme-*` block by the existing `all Garden appearance themes are represented by semantic token blocks` test).
- Produces: `badgeVariants.default` uses `text-accent-foreground` instead of `text-primary`. No prop/signature changes to `Badge`.

- [ ] **Step 1: Write the failing test**

Add to `test/theme-contrast.test.js` (after the existing tests, same file, same `css`/`token` helpers already defined at the top):

```js
function hslTripleToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

function parseHslToken(value) {
  const match = String(value || '').match(/(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) return null;
  return hslTripleToRgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

function relativeLuminance([r, g, b]) {
  const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(rgbA, rgbB) {
  const [l1, l2] = [relativeLuminance(rgbA), relativeLuminance(rgbB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

test('badge default variant text meets WCAG AA contrast against its background on every theme+accent', () => {
  const themes = ['disk-light', 'anuppuccin-latte', 'noch', 'anuppuccin-mocha'];
  const accents = ['red', 'yellow', 'green', 'sky', 'pink'];
  for (const theme of themes) {
    for (const accent of accents) {
      const start = css.indexOf(`html.theme-${theme}.accent-${accent} {`);
      if (start < 0) continue;
      const end = css.indexOf('}', start);
      const block = css.slice(start, end + 1);
      const themeStart = css.indexOf(`html.theme-${theme} {`);
      const themeEnd = css.indexOf('}', themeStart);
      const themeBlock = css.slice(themeStart, themeEnd + 1);
      const fg = parseHslToken(token('accent-foreground', block) || token('accent-foreground', themeBlock));
      const bg = parseHslToken(token('background', themeBlock));
      if (!fg || !bg) continue;
      const ratio = contrastRatio(fg, bg);
      assert.ok(ratio >= 4.5, `theme-${theme}.accent-${accent}: --accent-foreground vs --background contrast is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A3 "badge default variant"`
Expected: the new assertion FAILs for at least one theme+accent combo (reproducing the audit's measured ~2.7:1 for `disk-light`+`green` using `--primary`, once you temporarily point the test at `token('primary', ...)` to confirm — then switch it to `accent-foreground` per Step 1's final form above, which should PASS once Step 3 is applied). If the accent-foreground contrast already passes even before the component fix, that's expected — the component fix (Step 3) is what makes the *actual rendered badge* use this already-passing token instead of the failing `--primary` one.

- [ ] **Step 3: Apply the fix**

In `src/components/ui.jsx:126`, change:
```js
default: 'border-transparent bg-primary/10 text-primary',
```
to:
```js
default: 'border-transparent bg-primary/10 text-accent-foreground',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -20`
Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.jsx test/theme-contrast.test.js
git commit -m "fix: badge default variant uses accent-foreground instead of low-contrast primary text"
```

---

### Task 2: Consolidate triplicated text-matching helpers

**Files:**
- Create: `server/domain/text-match.js`
- Modify: `server/routes/search.js:8-26` (remove local `norm`/`stemRu`/`escapeRe`/`containsPhrase`, import from `text-match.js`, keep re-exporting `norm`/`stemRu` at `search.js:1122` since other modules destructure them off the `search` object returned by this route module)
- Modify: `server/domain/smart-search.js:224-243` (remove local `escapeRe`/`containsPhrase`, import from `text-match.js`; keep its own `startsWithPhrase`/`startsWithCommandWord` since those are genuinely specific to this module, but rewrite them to call the shared `escapeRe`)
- Modify: `src/components/assistant.jsx:80,151` (remove local `norm`/`escapeRe`, import from `src/lib/utils.js`)
- Modify: `src/lib/utils.js` (add `norm`/`escapeRe`)

**Interfaces:**
- Produces (`server/domain/text-match.js`, CommonJS, matches this codebase's server module style):
```js
'use strict';

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  return new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'i').test(text);
}

function norm(s) {
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').replace(/@(?=[a-zа-я0-9])/gi, '').trim();
}

function stemRu(word) {
  return norm(word).replace(/(ами|ями|ого|ему|ому|ыми|ими|ов|ев|ей|ах|ях|ью|ям|ам|а|я|ы|и|у|ю|е|ь)$/i, '');
}

module.exports = { escapeRe, containsPhrase, norm, stemRu };
```
- Produces (`src/lib/utils.js`, ESM, additions only — keep every existing export as-is):
```js
export function norm(value) {
  return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
}

export function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```
  (These match `assistant.jsx`'s current definitions exactly — moving them must not change behavior for any existing `assistant.jsx` caller.)
- Consumes: `server/routes/search.js` and `server/domain/smart-search.js` both `require('../domain/text-match')` (adjust relative path per each file's location) and destructure `{ escapeRe, containsPhrase, norm, stemRu }` — but `search.js` must keep its own `findStemPhrase` (uses `stemRu` from the shared module) and every other search-specific function untouched; `search.js:1122`'s export block still exports `norm, stemRu, ...` so other modules that destructure them off `search` keep working unchanged.

- [ ] **Step 1: Write the failing test**

Create `test/text-match.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeRe, containsPhrase, norm, stemRu } = require('../server/domain/text-match');

test('escapeRe escapes regex metacharacters so phrase matching is literal', () => {
  assert.equal(escapeRe('C++'), 'C\\+\\+');
  assert.match(new RegExp(escapeRe('a.b(c)')), /a\\\.b\\\(c\\\)/);
});

test('containsPhrase matches whole words only, not substrings', () => {
  assert.ok(containsPhrase('задача важная', 'задача'));
  assert.ok(!containsPhrase('задачами', 'задача'));
});

test('norm lowercases and folds ё to е', () => {
  assert.equal(norm('Ёлка'), 'елка');
});

test('stemRu strips common Russian case endings', () => {
  assert.equal(stemRu('задачи'), stemRu('задача'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/text-match.test.js`
Expected: FAIL — `Cannot find module '../server/domain/text-match'`.

- [ ] **Step 3: Create the shared module and wire up callers**

Create `server/domain/text-match.js` with the exact content in the Interfaces section above.

In `server/routes/search.js`, replace lines 8-26 (the `norm`, `stemRu`, `escapeRe`, `containsPhrase` definitions) with:
```js
const { escapeRe, containsPhrase, norm, stemRu } = require('../domain/text-match');
```
Leave `findStemPhrase` (originally starting at line 33) and everything below it untouched — it already calls `stemRu`/`escapeRe` by name, which now resolve to the imported ones.

In `server/domain/smart-search.js`, replace lines 224-226 (the local `escapeRe` function) and lines 241-243 (the local `containsPhrase` function) with a single import near the top of the file (alongside the existing `require`s):
```js
const { escapeRe, containsPhrase } = require('./text-match');
```
Leave `startsWithPhrase` (`:231-233`) and `startsWithCommandWord` (`:237-239`) in place — they call `escapeRe`, which now resolves to the shared one.

In `src/lib/utils.js`, append the `norm`/`escapeRe` exports from the Interfaces section (keep all existing exports unchanged).

In `src/components/assistant.jsx`, delete the local `function norm(value) {...}` at line 80 and `function escapeRe(value) {...}` at line 151, and add `norm` and `escapeRe` to the existing `import { ... } from '@/lib/utils'` at the top of the file.

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npm test 2>&1 | tail -30`
Expected: all tests pass (the new `text-match.test.js` plus the full existing 207).

- [ ] **Step 5: Commit**

```bash
git add server/domain/text-match.js server/routes/search.js server/domain/smart-search.js src/lib/utils.js src/components/assistant.jsx test/text-match.test.js
git commit -m "refactor: consolidate triplicated text-matching helpers into shared modules"
```

---

### Task 3: Remove dead code and split misplaced helpers

Three independent, small cleanups — one subagent, one commit per sub-part is fine, or bundle into one commit; keep the diffs separable in the message.

**Files:**
- Modify: `src/lib/domain.js` (remove dead `meetingLifecycle` export, OR use it — see below)
- Modify: `src/pages/operations.jsx:36-38`
- Create: `src/lib/link-preview.js`
- Modify: `src/pages/tasks.jsx` (remove extracted helpers, import from new module)
- Create: `src/lib/goal-progress.js`
- Modify: `src/lib/goal-tree.js` (remove extracted domain functions, keep only the SVG-art generator)
- Modify any file importing `goalProgress`/`goalTreeStage` from `src/lib/goal-tree.js` to import from `src/lib/goal-progress.js` instead (search for `from '@/lib/goal-tree'` and `from '@/lib/goal-progress'` usages first — grep before editing).

**3a — dead `meetingLifecycle` export.** `src/lib/domain.js:100-103` defines `meetingLifecycle(meeting, todayKey)` returning `'upcoming' | 'completed' | 'missed'`, but nothing imports it — `operations.jsx:36-38` re-derives the same three branches inline using `meetingIsPast`/`meetingHasOutcomeRecords`/`meetingIsMissed`. Use the existing export instead of deleting it (it's a clean, correct API — the bug is that a caller was never wired up, not that the function shouldn't exist):

In `src/pages/operations.jsx`, add `meetingLifecycle` to the existing `import { ... } from '@/lib/domain'` (line 11), then replace the three-branch filter body at lines 36-38:
```js
if (period === 'upcoming') return !meetingIsPast(meeting, today);
if (period === 'completed') return meetingIsPast(meeting, today) && meetingHasOutcomeRecords(meeting);
if (period === 'missed') return meetingIsMissed(meeting, today);
```
with:
```js
if (period === 'upcoming') return meetingLifecycle(meeting, today) === 'upcoming';
if (period === 'completed') return meetingLifecycle(meeting, today) === 'completed';
if (period === 'missed') return meetingLifecycle(meeting, today) === 'missed';
```
This is behavior-preserving: `meetingLifecycle` returns `'upcoming'` exactly when `!meetingIsPast`, `'missed'` exactly when past-and-no-outcome, `'completed'` exactly when past-and-has-outcome — the same three predicates, just computed once instead of three times. `meetingIsPast`/`meetingHasOutcomeRecords`/`meetingIsMissed` may now be unused in `operations.jsx` — remove them from the import at line 11 only if grep confirms no other use in that file (line 78 still uses `meetingIsMissed` directly for a different purpose — check before removing it from the import).

**3b — extract Jira/material-link helpers out of `tasks.jsx`.** These have nothing to do with tasks; they're generic URL-classification helpers.

Create `src/lib/link-preview.js`. Move `jiraLabelFromUrl`, `normalizeJiraUrl`, `normalizeMaterialUrl` (currently `tasks.jsx:477-512`) verbatim into it as named exports, plus `MaterialLetterIcon` and `MaterialServiceIcon` (`tasks.jsx:514-548`) as named exports — these are JSX components, so `link-preview.js` must have a `.jsx`-compatible setup: name it `src/lib/link-preview.jsx` instead (this project's build already handles `.jsx` for any file with JSX; check `vite.config.js` — if it restricts JSX parsing to files under `src/pages`/`src/components`, place icon components inline in the new file regardless, since Vite's React plugin parses JSX by file content in this stack, not by directory).

In `tasks.jsx`, delete the moved function bodies (lines 477-548) and add:
```js
import { jiraLabelFromUrl, normalizeJiraUrl, normalizeMaterialUrl, MaterialLetterIcon, MaterialServiceIcon } from '@/lib/link-preview';
```
(`MaterialServiceIcon` needs `Link2, FileSpreadsheet, Presentation, FileText, Cloud, Figma, Github, Gitlab, BookOpen, PanelsTopLeft` from `lucide-react`, and `MaterialLetterIcon` needs none — move exactly the imports these two components use from `tasks.jsx`'s existing `lucide-react` import into the new file; leave them in `tasks.jsx`'s import too if other code in that file still uses them — grep first.)

**3c — split `goal-tree.js`.** Lines 2-31 are pure domain math (`goalProgress`, `goalTreeStage`); lines 42-372 are an SVG tree-art generator (geometry, species/stage tables, path generation). Create `src/lib/goal-progress.js` containing exactly the lines-2-31 functions as named exports. Delete those same lines from `src/lib/goal-tree.js`, which now contains only the art generator; if the art generator calls `goalProgress`/`goalTreeStage` internally, add `import { goalProgress, goalTreeStage } from './goal-progress';` at the top of `goal-tree.js`. Grep the whole `src/` tree for `from '@/lib/goal-tree'` or `from './goal-tree'` — any importer that only uses `goalProgress`/`goalTreeStage` (not the art generator) should be repointed to `@/lib/goal-progress`.

- [ ] **Step 1: Grep before editing (do this first, not a test — there is no failing-test step for a pure code-motion refactor)**

```bash
grep -rn "meetingIsPast\|meetingIsMissed\|meetingHasOutcomeRecords" src/pages/operations.jsx
grep -rn "jiraLabelFromUrl\|normalizeJiraUrl\|normalizeMaterialUrl\|MaterialLetterIcon\|MaterialServiceIcon" src/
grep -rn "from '@/lib/goal-tree'\|from '\./goal-tree'" src/
grep -rn "goalProgress\|goalTreeStage" src/
```
Use the output to decide exactly what stays imported where, per the instructions above.

- [ ] **Step 2: Apply 3a, 3b, 3c**

- [ ] **Step 3: Run tests**

Run: `npm test 2>&1 | tail -30`
Expected: all pass. (`test/architecture.test.js` and `test/client-parity.test.js` do text-match assertions against page files — re-run and read any failure carefully; if either asserts on the literal presence of `jiraLabelFromUrl` etc. inside `tasks.jsx`'s file text, that assertion is now legitimately about the import line instead of the function definition, which the plan permits — but if a test fails here, STOP and report rather than editing the test to force a pass.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain.js src/pages/operations.jsx src/lib/link-preview.jsx src/pages/tasks.jsx src/lib/goal-progress.js src/lib/goal-tree.js
git commit -m "refactor: wire up unused meetingLifecycle, extract link-preview and goal-progress helpers"
```

---

### Task 4: Extract `useEntityStatus` + `StatusControl`, collapse the 4 duplicated status components

**Files:**
- Create: `src/hooks/use-entity-status.js`
- Modify: `src/components/status.jsx:67-245` (replace `TaskStatusIcon`, `IssueStatusIcon`, `ProcessStatusIcon`, `AgreementStatusIcon`, `AgreementStatusCheckbox` bodies with thin wrappers over a new shared `StatusControl`)

**Note on scope:** `SolutionStatusIcon` (`status.jsx:266-295`) looks similar at a glance but is a genuinely different pattern — it's a fully controlled component (`value`/`onChange` props, no internal `useState`, no API call, no busy/rollback) used for editing a list of solution options before the parent form saves. Leave it untouched.

**Interfaces:**
- Produces (`src/hooks/use-entity-status.js`):
```js
import * as React from 'react';
import { api } from '@/lib/api';

export function useEntityStatus({ resource, id, status, validValues, fallback, onStatusChange, onChanged, disabled = false }) {
  const incoming = validValues.includes(status) ? status : fallback;
  const [current, setCurrent] = React.useState(incoming);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setCurrent(validValues.includes(status) ? status : fallback);
  }, [status]);

  const interactive = !disabled && (Boolean(id) || typeof onStatusChange === 'function');

  const changeStatus = async (next) => {
    if (!validValues.includes(next) || next === current || busy) return;
    const previous = current;
    setCurrent(next);
    setBusy(true);
    try {
      let updated = null;
      if (onStatusChange) updated = await onStatusChange(next);
      else if (id) updated = await api.resource(resource).update(id, { status: next });
      await onChanged?.(updated || { id, status: next });
    } catch (error) {
      setCurrent(previous);
      console.error(`Failed to update ${resource} status`, error);
    } finally {
      setBusy(false);
    }
  };

  return { current, busy, interactive, changeStatus };
}
```
- Produces (`StatusControl`, added to `status.jsx`, used internally by the 5 wrappers — not necessarily exported, but export it too since it may be independently useful):
```jsx
function StatusControl({ resource, id, status, validValues, fallback, glyphFor, labelFor, options, onStatusChange, onChanged, disabled, className, menuClassName = 'min-w-52' }) {
  const { current, busy, interactive, changeStatus } = useEntityStatus({ resource, id, status, validValues, fallback, onStatusChange, onChanged, disabled });
  const label = labelFor(current);

  if (!interactive) {
    return <span className={cn('task-status-control task-status-control-static', className)} title={label} aria-label={label}>{glyphFor(current)}</span>;
  }

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn('task-status-control', busy && 'opacity-60', className)}
        aria-label={`Изменить статус: ${label}`}
        title={label}
        disabled={busy}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {glyphFor(current)}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={menuClassName} onClick={(event) => event.stopPropagation()}>
      {options.map((value) => <DropdownMenuItem key={value} onSelect={() => changeStatus(value)} className="grid grid-cols-[24px_minmax(0,1fr)_18px] gap-2">
        {glyphFor(value)}
        <span>{labelFor(value)}</span>
        <span className="text-center text-xs text-muted-foreground">{value === current ? '✓' : ''}</span>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
```
- Consumes: `TASK_STATUS_LABEL`, `TASK_STATUS_OPTIONS`, `ISSUE_STATUS_LABEL`, `PROCESS_STATUS_LABEL`, `AGREEMENT_STATUS_LABEL` (all already imported in `status.jsx` from `@/lib/domain`).

Rewrite each of the four dropdown-based components as thin wrappers (exact behavior preserved — same `id`/prop fallbacks, same glyph mapping tables, same default statuses):

```jsx
export function TaskStatusIcon({ task, taskId, status, onStatusChange, onChanged, disabled = false, className }) {
  const id = taskId || task?.id;
  const incoming = status || task?.status || 'todo';
  return <StatusControl
    resource="tasks" id={id} status={incoming} fallback="todo"
    validValues={Object.keys(TASK_STATUS_LABEL)}
    options={TASK_STATUS_OPTIONS.map((item) => item.value)}
    glyphFor={(value) => <TaskStatusGlyph status={value} />}
    labelFor={(value) => TASK_STATUS_LABEL[value] || value}
    onStatusChange={onStatusChange} onChanged={onChanged} disabled={disabled} className={className}
  />;
}

const ISSUE_TO_TASK_STATUS = { open: 'todo', in_progress: 'in_progress', paused: 'paused', resolved: 'done' };
const ISSUE_STATUS_ORDER = ['open', 'in_progress', 'paused', 'resolved'];

export function IssueStatusIcon({ issue, issueId, status, onChanged, disabled = false, className }) {
  const id = issueId || issue?.id;
  const incoming = status || issue?.status || 'open';
  return <StatusControl
    resource="issues" id={id} status={incoming} fallback="open"
    validValues={Object.keys(ISSUE_STATUS_LABEL)}
    options={ISSUE_STATUS_ORDER}
    glyphFor={(value) => <TaskStatusGlyph status={ISSUE_TO_TASK_STATUS[value] || 'todo'} />}
    labelFor={(value) => ISSUE_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

const PROCESS_TO_TASK_STATUS = { ok: 'done', attention: 'paused', broken: 'blocked' };
const PROCESS_STATUS_ORDER = ['ok', 'attention', 'broken'];

export function ProcessStatusIcon({ process, processId, status, onChanged, disabled = false, className }) {
  const id = processId || process?.id;
  const incoming = status || process?.status || 'ok';
  return <StatusControl
    resource="processes" id={id} status={incoming} fallback="ok"
    validValues={Object.keys(PROCESS_STATUS_LABEL)}
    options={PROCESS_STATUS_ORDER}
    glyphFor={(value) => <TaskStatusGlyph status={PROCESS_TO_TASK_STATUS[value] || 'todo'} />}
    labelFor={(value) => PROCESS_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-48"
  />;
}

export function AgreementStatusIcon({ agreement, agreementId, status, onChanged, disabled = false, className }) {
  const id = agreementId || agreement?.id;
  const incoming = status === 'done' ? 'done' : 'open';
  return <StatusControl
    resource="agreements" id={id} status={incoming} fallback="open"
    validValues={['open', 'done']}
    options={['open', 'done']}
    glyphFor={(value) => <TaskStatusGlyph status={value === 'done' ? 'done' : 'todo'} />}
    labelFor={(value) => AGREEMENT_STATUS_LABEL[value] || value}
    onChanged={onChanged} disabled={disabled} className={className} menuClassName="min-w-44"
  />;
}
```

`AgreementStatusCheckbox` keeps its distinct checkbox markup (it is not a dropdown), but delegates its state logic to the same hook instead of hand-rolling it:
```jsx
export function AgreementStatusCheckbox({ agreement, agreementId, status, onChanged, disabled = false, className }) {
  const id = agreementId || agreement?.id;
  const incoming = status === 'done' ? 'done' : 'open';
  const { current, busy, changeStatus } = useEntityStatus({ resource: 'agreements', id, status: incoming, fallback: 'open', validValues: ['open', 'done'], onChanged, disabled });
  const checked = current === 'done';
  const toggle = async (event) => {
    event.stopPropagation();
    if (disabled || !id || busy) return;
    await changeStatus(checked ? 'open' : 'done');
  };
  return <label className={cn('agreement-status-check', busy && 'opacity-60', className)} title={checked ? 'Выполнено' : 'Отметить выполненной'} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
    <input type="checkbox" checked={checked} onChange={toggle} disabled={disabled || !id || busy} aria-label={checked ? 'Выполнено' : 'Отметить выполненной'} />
  </label>;
}
```
Note: the hook's `interactive` gate isn't used here since the checkbox computes its own `disabled || !id || busy` — this preserves the original's exact disabled logic (the original never checked `interactive` for a non-id+no-onStatusChange case because the checkbox has no `onStatusChange` prop at all).

Add `import { useEntityStatus } from '@/hooks/use-entity-status';` to `status.jsx`'s imports.

- [ ] **Step 1: Write a behavioral test (not present before — the components had none; add coverage for the hook itself since it's the new shared surface)**

Create `test/use-entity-status.test.js`. Since this project has no DOM-rendering test setup, test the hook's pure decision logic isn't feasible via rendering — instead add a static-shape test confirming the four wrappers now delegate to one shared implementation (matches this repo's existing static-analysis test style):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const status = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'status.jsx'), 'utf8');
const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'hooks', 'use-entity-status.js'), 'utf8');

test('TaskStatusIcon, IssueStatusIcon, ProcessStatusIcon, AgreementStatusIcon share one StatusControl implementation', () => {
  assert.match(status, /function StatusControl\(/);
  for (const name of ['TaskStatusIcon', 'IssueStatusIcon', 'ProcessStatusIcon', 'AgreementStatusIcon']) {
    const start = status.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, `${name} not found`);
    const end = status.indexOf('\n}', start);
    const body = status.slice(start, end);
    assert.match(body, /<StatusControl/, `${name} should delegate to StatusControl`);
  }
  assert.match(hook, /export function useEntityStatus/);
});

test('AgreementStatusCheckbox reuses useEntityStatus instead of its own optimistic-update state', () => {
  const start = status.indexOf('export function AgreementStatusCheckbox(');
  const end = status.indexOf('\n}', start);
  const body = status.slice(start, end);
  assert.match(body, /useEntityStatus\(/);
  assert.doesNotMatch(body, /React\.useState/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/use-entity-status.test.js`
Expected: FAIL — `src/hooks/use-entity-status.js` doesn't exist yet / `status.jsx` doesn't contain `StatusControl`.

- [ ] **Step 3: Implement** per the Interfaces section above (create the hook file, rewrite the five components in `status.jsx`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -30`
Expected: all pass, including the two new tests. Manually re-verify each rewritten component still special-cases correctly by re-reading the diff against the original behavior described in this task (glyph maps, default fallback status, menu width classes) — there is no rendering test here, so this manual diff check is the safety net.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-entity-status.js src/components/status.jsx test/use-entity-status.test.js
git commit -m "refactor: extract useEntityStatus + StatusControl, collapse 4 duplicated status components"
```

---

### Task 5: Add a shared `AlertDialog`, replace all 9 `window.confirm()` call sites

**Files:**
- Modify: `src/components/ui.jsx` (add `AlertDialog`)
- Modify: `src/pages/admin.jsx:31`, `src/pages/misc.jsx:131`, `src/pages/knowledge-tools.jsx:108,141,176`, `src/pages/resources.jsx:203,508,804`, `src/pages/technology.jsx:110`

**Interfaces:**
- Produces (append to `src/components/ui.jsx`, after the existing `Dialog`/`DialogFooter` block):
```jsx
export function AlertDialog({ open, onOpenChange, title, description, confirmLabel = 'Удалить', cancelLabel = 'Отмена', busyLabel = 'Удаляю…', destructive = true, onConfirm, busy = false }) {
  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
```
- Consumes: nothing new — built entirely from primitives already in `ui.jsx` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `Button`).

**Two call-site patterns exist — apply the matching one to each of the 9 sites:**

**Pattern A — delete button lives inside an existing edit `Dialog`** (`resources.jsx:174-213` `ResourceCrudDialog`, `resources.jsx:508` person dialog, `resources.jsx:804` project dialog, `misc.jsx:131`, `knowledge-tools.jsx:108,141,176`, `admin.jsx:31`). Worked example for `ResourceCrudDialog` (`resources.jsx:174-213`):

Before (`resources.jsx:203`):
```js
const remove=async()=>{if(!isEdit||!window.confirm(`Удалить «${titleOf(item)}»?`))return;setSaving(true);try{await api.resource(resource).remove(resourceRef(resource,item));onOpenChange(false);await onSaved?.();}catch(e){setError(e?.status===403?'Недостаточно прав для удаления':'Не удалось удалить');}finally{setSaving(false);}};
```
After — split the confirm from the action, add local state for the alert, and render `<AlertDialog>` as a sibling of the outer `Dialog`'s `DialogContent` (both dialogs can be open in sequence; Radix handles nested/sibling dialogs fine since they're independent `Dialog` roots):
```js
const [confirmOpen, setConfirmOpen] = React.useState(false);
const remove = async () => {
  setSaving(true);
  try { await api.resource(resource).remove(resourceRef(resource, item)); onOpenChange(false); await onSaved?.(); }
  catch (e) { setError(e?.status === 403 ? 'Недостаточно прав для удаления' : 'Не удалось удалить'); }
  finally { setSaving(false); setConfirmOpen(false); }
};
```
And change the delete `<Button>` in the `DialogFooter` from `onClick={remove}` to `onClick={() => setConfirmOpen(true)}`, and add right after the closing `</Dialog>` of the edit dialog (still inside the component's return, as a sibling):
```jsx
<AlertDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title={`Удалить «${titleOf(item)}»?`}
  onConfirm={remove}
  busy={saving}
/>
```
Apply the same transform (local `confirmOpen` state, move the confirm text into `AlertDialog`'s `title`, trigger via the existing delete button, render `<AlertDialog>` as a sibling of the component's main `Dialog`) to the other 7 Pattern-A sites, using each site's own existing confirm-message text as the new `title`, and each site's own `saving`/`busy` state variable as `AlertDialog`'s `busy` prop.

**Pattern B — delete triggered from a list row, no enclosing edit dialog** (`technology.jsx:109-119` `remove(item)`). Before:
```js
const remove = async (item) => {
  if (!window.confirm(`Удалить мероприятие «${item.topic || 'Без темы'}»?`)) return;
  setBusyId(item.id);
  try {
    await api.resource('technologyEvents').remove(item.id);
    events.setData((current) => current.filter((entry) => entry.id !== item.id));
    flash('Мероприятие удалено');
  } catch (error) {
    flash(error?.status === 403 ? 'Недостаточно прав для удаления мероприятия' : 'Не удалось удалить мероприятие');
  } finally { setBusyId(null); }
};
```
After — add `const [confirmTarget, setConfirmTarget] = React.useState(null);` near the component's other state, change every call site that invokes `remove(item)` (the row action) to instead call `setConfirmTarget(item)`, rename the original function body to the actual deletion (drop the `window.confirm` line, keep everything else, call it at the end via `setConfirmTarget(null)` in `finally`), and render one `<AlertDialog>` for the whole page (not per-row):
```jsx
<AlertDialog
  open={Boolean(confirmTarget)}
  onOpenChange={(open) => !open && setConfirmTarget(null)}
  title={`Удалить мероприятие «${confirmTarget?.topic || 'Без темы'}»?`}
  busy={busyId === confirmTarget?.id}
  onConfirm={async () => {
    const item = confirmTarget;
    setBusyId(item.id);
    try {
      await api.resource('technologyEvents').remove(item.id);
      events.setData((current) => current.filter((entry) => entry.id !== item.id));
      flash('Мероприятие удалено');
    } catch (error) {
      flash(error?.status === 403 ? 'Недостаточно прав для удаления мероприятия' : 'Не удалось удалить мероприятие');
    } finally { setBusyId(null); setConfirmTarget(null); }
  }}
/>
```
Place this `<AlertDialog>` in the page's top-level returned JSX (alongside other page-level dialogs, wherever `technology.jsx` already renders `EventDialog`/`MeetingDialog`).

- [ ] **Step 1: Write the failing test**

Create `test/no-native-confirm.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('no page uses the native window.confirm for destructive actions', () => {
  const files = ['src/pages/admin.jsx', 'src/pages/misc.jsx', 'src/pages/knowledge-tools.jsx', 'src/pages/resources.jsx', 'src/pages/technology.jsx'];
  for (const file of files) {
    assert.doesNotMatch(read(file), /window\.confirm\(/, `${file} still calls window.confirm`);
  }
});

test('ui.jsx exports a themed AlertDialog built on the shared Dialog primitive', () => {
  const ui = read('src/components/ui.jsx');
  assert.match(ui, /export function AlertDialog\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/no-native-confirm.test.js`
Expected: FAIL on both assertions (9 `window.confirm` matches across the 5 files; no `AlertDialog` export yet).

- [ ] **Step 3: Implement** the `AlertDialog` component and all 9 call-site conversions per the two patterns above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -30`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.jsx src/pages/admin.jsx src/pages/misc.jsx src/pages/knowledge-tools.jsx src/pages/resources.jsx src/pages/technology.jsx test/no-native-confirm.test.js
git commit -m "feat: replace window.confirm with themed AlertDialog on all 9 destructive actions"
```

---

### Task 6: Extract `useCrudDialogForm`, apply to the ~20 create/edit dialogs

This is the largest task — split into sub-steps by file group so no single diff is unreviewably large. Do the hook first (6a), then apply file-group by file-group (6b-6d), committing after each group.

**Files:**
- Create: `src/hooks/use-crud-dialog-form.js`
- Modify (6b): `src/pages/resources.jsx` (`ResourceCrudDialog` ~174-213, person dialog ~505-510, project dialog ~801-806)
- Modify (6c): `src/pages/tasks.jsx` (`CreateTaskDialog` ~453+), `src/pages/technology.jsx` (`EventDialog`/`MeetingDialog` ~224-296)
- Modify (6d): `src/pages/knowledge-tools.jsx` (`FolderDialog` ~71, `KnowledgeCreateDialog` ~104, `ToolDialog` ~172), `src/pages/misc.jsx` (~126), `src/pages/workspace.jsx` (`CreateLabDialog` ~82, `EditWorkshopProjectDialog` ~116), `src/pages/journal.jsx` (`EditJournalDialog` ~60), `src/pages/admin.jsx` (~19,24,42)

**Interfaces:**
- Produces (`src/hooks/use-crud-dialog-form.js`):
```js
import * as React from 'react';
import { api } from '@/lib/api';

/**
 * @param {object} opts
 * @param {string} opts.resource - api.resource(name) key
 * @param {boolean} opts.open
 * @param {object|null} opts.item - existing item when editing, null/undefined when creating
 * @param {(item: object|null) => object} opts.buildDraft - initial draft shape from `item` (or defaults when null)
 * @param {(draft: object) => string|null} opts.validate - return an error message, or null if valid
 * @param {(draft: object) => object} opts.buildPayload - draft -> API payload
 * @param {(id: string|object) => (string|object)} [opts.resolveId] - defaults to item?.id; pass e.g. resourceRef(resource, item) when a resource uses a composite ref
 * @param {() => void} opts.onOpenChange
 * @param {() => Promise<void>|void} [opts.onSaved]
 * @param {{ save?: string, remove?: string }} [opts.forbiddenMessages] - custom 403 copy; defaults to generic Russian copy
 */
export function useCrudDialogForm({ resource, open, item, buildDraft, validate, buildPayload, resolveId, onOpenChange, onSaved, forbiddenMessages = {} }) {
  const isEdit = Boolean(item?.id);
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(item));
    setError('');
  }, [open, item?.id]);

  const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const id = () => (resolveId ? resolveId(item) : item?.id);

  const save = async () => {
    const validationError = validate(draft);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload(draft);
      if (isEdit) await api.resource(resource).update(id(), payload);
      else await api.resource(resource).create(payload);
      onOpenChange(false);
      await onSaved?.();
    } catch (e) {
      setError(e?.status === 403 ? (forbiddenMessages.save || 'Недостаточно прав для изменения') : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    setSaving(true);
    try {
      await api.resource(resource).remove(id());
      onOpenChange(false);
      await onSaved?.();
    } catch (e) {
      setError(e?.status === 403 ? (forbiddenMessages.remove || 'Недостаточно прав для удаления') : 'Не удалось удалить');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  return { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen };
}
```
- Consumes: nothing beyond `api` — this hook intentionally does not know about `AlertDialog`; each dialog component wires `confirmOpen`/`setConfirmOpen` to its own `<AlertDialog>` (from Task 5) exactly as Task 5's Pattern A already established. Dialogs built in this task should use `AlertDialog` for delete from the start (do not reintroduce `window.confirm`).

**Worked example — `ResourceCrudDialog` fully migrated** (`resources.jsx:174-213`), showing the shape every other dialog in 6b/6c/6d should follow:
```jsx
function ResourceCrudDialog({ resource, item, open, onOpenChange, onSaved, projects, people = [], folders }) {
  const config = RESOURCE_CONFIG[resource];
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource, open, item, onOpenChange, onSaved,
    resolveId: (current) => resourceRef(resource, current),
    buildDraft: (current) => {
      if (resource === 'issues') return { title: current?.title || '', description: current?.description || '', status: current?.status || 'open', severity: current?.severity || 'normal', projectId: current?.projectId || 'none', affectedTarget: issueAffectedValue(current) };
      if (resource === 'processes') return { title: current?.title || '', status: current?.status || 'ok', expectedBehavior: current?.expectedBehavior || '', currentBehavior: current?.currentBehavior || '', fixText: (current?.fixOptions || []).map((x) => x.text).join('\n') };
      if (resource === 'goals') return { title: current?.title || '', description: current?.description || '', timeframe: current?.timeframe || '', status: current?.status || 'active', progress: String(current?.progress ?? 0), projectIds: [...(current?.projectIds || [])] };
      if (resource === 'agreements') return { text: current?.text || '', status: current?.status || 'open', date: current?.date || '', dueDate: current?.dueDate || '', projectId: current?.projectId || 'none' };
      return { title: current?.title || '', url: current?.url || '', folderId: current?.folderId || 'none', scope: current?.scope || '' };
    },
    validate: (d) => {
      const title = resource === 'agreements' ? String(d.text || '').trim() : String(d.title || '').trim();
      if (!title) return resource === 'agreements' ? 'Укажите текст договорённости' : 'Укажите название';
      if (resource === 'tools' && d.url && !/^https?:\/\//i.test(d.url)) return 'Укажите корректную ссылку';
      return null;
    },
    buildPayload: (d) => {
      const title = resource === 'agreements' ? String(d.text || '').trim() : String(d.title || '').trim();
      if (resource === 'issues') return { title, description: String(d.description || '').trim(), status: d.status, severity: d.severity, projectId: d.projectId === 'none' ? null : d.projectId, affectsTeam: d.affectedTarget === 'team', affectedPersonId: !['none', 'team'].includes(d.affectedTarget) ? d.affectedTarget : null };
      if (resource === 'processes') return { title, status: d.status, expectedBehavior: String(d.expectedBehavior || '').trim(), currentBehavior: String(d.currentBehavior || '').trim(), fixOptions: String(d.fixText || '').split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ id: item?.fixOptions?.[index]?.id || `fix_${Date.now().toString(36)}_${index}`, text, status: item?.fixOptions?.[index]?.status || 'unchecked' })) };
      if (resource === 'goals') return { title, description: String(d.description || '').trim(), timeframe: String(d.timeframe || '').trim(), status: d.status, progress: Math.max(0, Math.min(100, Number(d.progress || 0))), projectIds: d.projectIds || [] };
      if (resource === 'agreements') return { text: title, status: d.status, date: d.date || null, dueDate: d.dueDate || null, projectId: d.projectId === 'none' ? null : d.projectId };
      return { title, url: String(d.url || '').trim(), folderId: d.folderId === 'none' ? null : d.folderId, scope: String(d.scope || '').trim() || null };
    },
  });
  // ...JSX body is UNCHANGED from the original (lines 204-211: the resource-specific fields, the error banner) — only `draft`/`field`/`error` now come from the hook instead of local useState...
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>{isEdit?'Редактировать':'Добавить'} · {config.title}</DialogTitle><DialogDescription>Изменения сохраняются в общем рабочем пространстве.</DialogDescription></DialogHeader><div className="space-y-4">
    {/* ...unchanged resource-specific fields from the original lines 205-210, referencing draft/field exactly as before... */}
    {error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
  </div><DialogFooter className="justify-between"><div>{isEdit&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить «${titleOf(item)}»?`} onConfirm={remove} busy={saving}/>
  </Dialog>;
}
```

Apply the same transform shape (state → `useCrudDialogForm`, delete button → `setConfirmOpen(true)` + sibling `<AlertDialog>`, JSX fields untouched) to every dialog listed in 6b/6c/6d. Each dialog's own `buildDraft`/`validate`/`buildPayload` should be lifted directly from that dialog's existing `useEffect`/`save`/`remove` bodies — read each file's current implementation before converting it; do not guess field names.

- [ ] **Step 1 (6a): Write the failing test for the hook's existence and one dialog's migration**

Create `test/crud-dialog-consistency.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('useCrudDialogForm hook exists with the expected exports', () => {
  const hook = read('src/hooks/use-crud-dialog-form.js');
  assert.match(hook, /export function useCrudDialogForm/);
});

test('resource, task, technology, knowledge, workspace, journal and admin CRUD dialogs share useCrudDialogForm', () => {
  const files = ['src/pages/resources.jsx', 'src/pages/tasks.jsx', 'src/pages/technology.jsx', 'src/pages/knowledge-tools.jsx', 'src/pages/misc.jsx', 'src/pages/workspace.jsx', 'src/pages/journal.jsx', 'src/pages/admin.jsx'];
  for (const file of files) {
    assert.match(read(file), /useCrudDialogForm/, `${file} does not use the shared useCrudDialogForm hook`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/crud-dialog-consistency.test.js`
Expected: FAIL — hook file doesn't exist, no page imports it yet.

- [ ] **Step 3 (6a): Create the hook** exactly as in the Interfaces section.

- [ ] **Step 4 (6b): Migrate `resources.jsx`'s three dialogs** (`ResourceCrudDialog`, the person dialog ~505-510, the project dialog ~801-806) per the worked example. Run `npm test 2>&1 | tail -30` — expect all still-passing tests to pass (the new consistency test will still fail on files not yet migrated; that's expected mid-task, not a regression). Commit:
```bash
git add src/hooks/use-crud-dialog-form.js src/pages/resources.jsx test/crud-dialog-consistency.test.js
git commit -m "refactor: extract useCrudDialogForm, migrate resources.jsx CRUD dialogs"
```

- [ ] **Step 5 (6c): Migrate `tasks.jsx`'s `CreateTaskDialog` and `technology.jsx`'s `EventDialog`/`MeetingDialog`.** Read each dialog's current `useState`/`useEffect`/`save`/`remove` bodies first (they were not fully quoted in this plan — the audit only gave line ranges) and lift them into the hook's `buildDraft`/`validate`/`buildPayload` shape exactly as the worked example did for `ResourceCrudDialog`, preserving every field and every validation message verbatim. Run `npm test`. Commit:
```bash
git add src/pages/tasks.jsx src/pages/technology.jsx
git commit -m "refactor: migrate tasks.jsx and technology.jsx CRUD dialogs to useCrudDialogForm"
```

- [ ] **Step 6 (6d): Migrate the remaining 5 files** (`knowledge-tools.jsx`'s 3 dialogs, `misc.jsx`, `workspace.jsx`'s 2 dialogs, `journal.jsx`, `admin.jsx`'s create/edit account dialog — note `admin.jsx`'s delete at line 31 already became an `AlertDialog` in Task 5; only its save/create logic needs `useCrudDialogForm` here). Run `npm test`. Commit:
```bash
git add src/pages/knowledge-tools.jsx src/pages/misc.jsx src/pages/workspace.jsx src/pages/journal.jsx src/pages/admin.jsx
git commit -m "refactor: migrate remaining CRUD dialogs to useCrudDialogForm"
```

- [ ] **Step 7: Run full test suite one more time**

Run: `npm test 2>&1 | tail -10`
Expected: all pass, including `test/crud-dialog-consistency.test.js`.

---

### Task 7: Consolidate the duplicate tab implementation in `operations.jsx`

**Files:**
- Modify: `src/pages/operations.jsx:62` (and wherever `MEETING_PERIODS` is defined/used nearby)
- Modify: `src/styles.css:2101-2121` (remove `.entity-tabs`/`.entity-tab` block)
- Modify: `test/ui-pattern-consistency.test.js` (extend the existing "shared Tabs is the only tab implementation" test to also cover `operations.jsx`)

**Problem:** `operations.jsx:62` hand-rolls a second tab bar (`.entity-tabs`/`.entity-tab`, styled in `src/styles.css:2103-2118`) instead of using the shared `<Tabs>` from `src/components/patterns.jsx` (already correctly used in `tasks.jsx`/`resources.jsx` per `patterns.jsx:15-35`).

**Interfaces:**
- Consumes: `Tabs` from `@/components/patterns` (signature: `<Tabs items={[{value,label,count?}, ...]} value={...} onValueChange={...} ariaLabel={...} />` — see `patterns.jsx:15-35`, already read in full during planning).

- [ ] **Step 1: Write the failing test**

Extend the existing test in `test/ui-pattern-consistency.test.js` (the `'shared Tabs is the only tab implementation on task and person detail pages'` test, currently lines 9-20) — add `operations.jsx` to its checks:
```js
test('shared Tabs is the only tab implementation on task, person and meetings pages', () => {
  const tasks = read('src/pages/tasks.jsx');
  const resources = read('src/pages/resources.jsx');
  const operations = read('src/pages/operations.jsx');
  const patterns = read('src/components/patterns.jsx');
  assert.match(patterns, /export function Tabs/);
  assert.match(tasks, /<Tabs[\s\S]*?ariaLabel="Разделы задачи"/);
  assert.match(resources, /<Tabs[\s\S]*?ariaLabel="Развитие сотрудника"/);
  assert.match(resources, /<Tabs[\s\S]*?ariaLabel="Связи сотрудника"/);
  assert.match(operations, /<Tabs[\s\S]*?ariaLabel="Период встреч"/);
  for (const legacy of ['task-detail-tab"', 'person-development-tab"', 'person-relations-tab"']) {
    assert.ok(!(tasks + resources).includes(`className="${legacy}`));
  }
  assert.doesNotMatch(operations, /entity-tabs|entity-tab\b/);
});
```
Replace the original test of the same name (there will be a duplicate test name otherwise — remove the old one, this is its replacement, same file).

Also add:
```js
test('legacy .entity-tabs/.entity-tab selectors are gone from styles.css', () => {
  const css = read('src/styles.css');
  assert.ok(!css.includes('.entity-tabs'));
  assert.ok(!css.includes('.entity-tab '));
  assert.ok(!css.includes('.entity-tab.'));
  assert.ok(!css.includes('.entity-tab:'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ui-pattern-consistency.test.js`
Expected: FAIL — `operations.jsx` has no `<Tabs ariaLabel="Период встреч">` yet, still has `.entity-tabs` markup, and `styles.css` still has the legacy block.

- [ ] **Step 3: Implement**

In `operations.jsx`, find where `MEETING_PERIODS` is defined (an array of `[value, label]` pairs, used at line 62) and where `period`/`setPeriod` state lives. Replace line 62:
```jsx
<div className="entity-tabs">{MEETING_PERIODS.map(([value,label])=><button type="button" key={value} onClick={()=>setPeriod(value)} className={`entity-tab ${period===value?'is-active':''}`}>{label}</button>)}</div>
```
with:
```jsx
<Tabs items={MEETING_PERIODS.map(([value, label]) => ({ value, label }))} value={period} onValueChange={setPeriod} ariaLabel="Период встреч" />
```
Add `Tabs` to `operations.jsx`'s existing import from `@/components/patterns` (add the import line if none exists yet — check first).

In `src/styles.css`, delete the `.entity-tabs { ... }` and `.entity-tab { ... }` / `.entity-tab:hover` / `.entity-tab.is-active` / `.entity-tab.is-active::after` rules at lines 2101-2121 (read the exact block bounds before deleting — the grep in planning showed it starts at `:2103` and the `::after` rule continues a few lines past `:2118`; delete the complete block, nothing before or after it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/operations.jsx src/styles.css test/ui-pattern-consistency.test.js
git commit -m "refactor: migrate operations.jsx meeting-period filter to the shared Tabs component"
```

---

### Task 8: Fix focus-ring opacity inconsistency, add missing `aria-label`s, add `aria-live` to status text

Three small, independent accessibility fixes bundled in one task since each is a one-or-two-line change.

**Files:**
- Modify: `src/components/ui.jsx:110,115,185` (focus ring opacity)
- Modify: `src/pages/tasks.jsx:684` (icon-only button `aria-label`)
- Modify: `src/pages/operations.jsx:265` (calendar prev/next chevron `aria-label`s)
- Modify: `src/pages/tasks.jsx` (saving indicator `aria-live`)
- Modify: `src/components/search-palette.jsx:167` (searching indicator `aria-live`)

**8a — focus ring opacity.** `Button` uses `focus-visible:ring-2 focus-visible:ring-ring/20` (`ui.jsx:85`); `Input`/`Textarea`/`SelectTrigger` use `focus-visible:ring-2 focus-visible:ring-ring/12` (or `focus:ring-2 focus:ring-ring/12` for `SelectTrigger`, `ui.jsx:110,115,185`). Standardize on `/20` everywhere (the more visible one — better for accessibility, and it's what interactive buttons already use) by changing `ring-ring/12` → `ring-ring/20` at all three call sites.

**8b — missing `aria-label`s.** At `tasks.jsx:684`, the task-detail "more actions" trigger button (`<Button variant="ghost" size="icon"><MoreHorizontal/></Button>`) has no `aria-label`, unlike the equivalent buttons in `resources.jsx:308,626` (`aria-label="Действия"`) and `journal.jsx:225`. Add `aria-label="Действия"` to it. At `operations.jsx:265`, the calendar month prev/next chevron buttons have no `aria-label` — add `aria-label="Предыдущий месяц"` / `aria-label="Следующий месяц"` to the respective buttons (read the surrounding code first to identify which of the two buttons is prev vs next).

**8c — `aria-live` on async status text.** The "Сохраняю…" busy label in `tasks.jsx` (`:684` area — the task detail save indicator; read the surrounding component to find the exact element that renders this text) and the "Ищу…" label in `search-palette.jsx:167` are visual-only. Wrap each in an element with `aria-live="polite"` (add the attribute to the existing element that already renders the text, or wrap it in a `<span aria-live="polite">` if the text is a bare string in JSX — do not change any visible markup/classes).

- [ ] **Step 1: Write the failing test**

Create `test/accessibility-consistency.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Input, Textarea and SelectTrigger share the same focus-ring opacity as Button', () => {
  const ui = read('src/components/ui.jsx');
  assert.doesNotMatch(ui, /ring-ring\/12/, 'a lingering ring-ring/12 was found — focus ring opacity should be unified to /20');
});

test('icon-only action buttons carry an aria-label', () => {
  const tasks = read('src/pages/tasks.jsx');
  const operations = read('src/pages/operations.jsx');
  assert.match(tasks, /aria-label="Действия"[\s\S]{0,80}MoreHorizontal|MoreHorizontal[\s\S]{0,80}aria-label="Действия"/);
  assert.match(operations, /aria-label="Предыдущий месяц"/);
  assert.match(operations, /aria-label="Следующий месяц"/);
});

test('async status indicators are announced via aria-live', () => {
  assert.match(read('src/components/search-palette.jsx'), /aria-live="polite"[\s\S]{0,40}Ищу|Ищу[\s\S]{0,120}aria-live="polite"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/accessibility-consistency.test.js`
Expected: FAIL on all three.

- [ ] **Step 3: Implement** 8a, 8b, 8c per the descriptions above — read each exact surrounding block in `ui.jsx`/`tasks.jsx`/`operations.jsx`/`search-palette.jsx` before editing so the JSX stays syntactically valid (attribute insertion only, no structural changes).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.jsx src/pages/tasks.jsx src/pages/operations.jsx src/components/search-palette.jsx test/accessibility-consistency.test.js
git commit -m "fix: unify focus-ring opacity, add missing aria-labels and aria-live status announcements"
```

---

### Task 9: Conservative dead-CSS/`!important` elimination pass on `styles.css`

**Files:**
- Modify: `src/styles.css` (currently 5,841 lines after Tasks 1-8's edits removed the `.entity-tabs` block)

**Scope and safety constraint (read this before starting — it overrides ambition):** There is no browser or screenshot tool available in this environment, so **no visual verification of the result is possible**. This task is therefore strictly a **dead-code and provable-redundancy elimination pass**, not a redesign or a Tailwind migration:

1. **Superseded rules only.** A rule block is eligible for removal only if a *later* rule in the cascade targets the exact same selector (or a selector of equal-or-higher specificity matching the same elements) and sets the *same* properties — i.e., the earlier block's declarations are provably never the ones that win. The comment trail already flags many of these (`"Final X"` followed by later `"refinement"`/`"restore"`/`"correction"` passes on the same component — e.g. the task-detail rail rewritten at `:3571`, `:3819`, `:3993`, `:4349`, `:5092`, `:5262`, `:5476`, `:5581`, `:5598`, `:5625`, `:5691`). For each such run, read every block in the run fully, determine which declarations from earlier blocks are completely overwritten (same selector+property, later value wins) versus which still contribute (different property, or the selector isn't fully re-declared later), and delete only the fully-overwritten earlier blocks. Where a later block only *partially* overlaps an earlier one, leave both — do not guess.
2. **Unused selectors only.** A class selector may be deleted only if `grep -rn "the-exact-class-name" src/` (across `.jsx` and `.css`) shows zero remaining references anywhere, including in the file being edited.
3. **`!important` removal only where cascade-safe.** Remove `!important` from a declaration only when you can show, by reading the full selector list for that property in the surrounding cascade layer, that no other rule of equal-or-higher specificity targets the same selector+property — i.e. removing it cannot change which declaration wins. When in doubt, leave the `!important` in place; this task's goal is measurable reduction in count, not zero.
4. **No selector, property, or value may change** for anything that survives — this is deletion of dead weight, not editing of live rules.
5. Work in batches of ~500-800 lines at a time (the file is large; a single subagent pass over all 5,841 lines in one sitting risks missing cross-references) — after each batch, run the full test suite and check the running `grep -c '!important' src/styles.css` count is monotonically decreasing, never introduces a new problem.

**No new production code paths are created by this task** — it is subtractive only. Because of that, there is no "write a failing test first" step for the removals themselves; instead, the test asserts the *outcome metric* (fewer `!important`s, no legacy selector debt) without prescribing which lines specifically must go, so the task can be done incrementally and re-verified.

- [ ] **Step 1: Record the baseline metric**

Run: `grep -c '!important' src/styles.css` and record the number (audit measured 341 before this task; Task 7 already removed a few unrelated lines but not `!important`s, so the number should still be close to 341 at this task's start).

- [ ] **Step 2: Write the test**

Add to `test/theme-contrast.test.js` (or create `test/css-hygiene.test.js` if preferred — either is fine, keep it in the same static-read style):
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('!important usage in styles.css does not exceed the pre-cleanup baseline', () => {
  const count = (css.match(/!important/g) || []).length;
  assert.ok(count <= 341, `expected !important count to not exceed the 341 baseline, found ${count}`);
});
```
(This is intentionally a ceiling, not an exact target — it locks in "no regression" while this task incrementally improves the real number over time; a stricter follow-up test can lower the ceiling once this task's actual reduction is measured.)

- [ ] **Step 3: Run test to verify it currently passes (it should — 341 is the baseline, not yet a failure)**

Run: `node --test test/theme-contrast.test.js` (or the new file). Expected: PASS (this is a regression guard, not a TDD red step — there's nothing to make it fail first, since the goal is a ceiling that already holds).

- [ ] **Step 4: Do the elimination pass**, working through the file in the batches described in the Scope section, re-running `npm test` and `grep -c '!important' src/styles.css` after each batch.

- [ ] **Step 5: Final verification**

Run: `npm test 2>&1 | tail -10` and `grep -c '!important' src/styles.css`.
Expected: all tests pass; the `!important` count is lower than the recorded Step 1 baseline (report the exact before/after numbers and the line ranges touched in the commit message).

- [ ] **Step 6: Commit**

```bash
git add src/styles.css test/theme-contrast.test.js
git commit -m "refactor: remove provably-dead/superseded CSS rules and cascade-safe !important usages from styles.css"
```

(If, after a careful pass, very little turns out to be safely removable under these constraints — e.g. most `!important`s turn out to be load-bearing against Tailwind's own specificity — that is an acceptable, reportable outcome. Report the actual before/after count and which specific runs were consolidated; do not force removals that violate the safety constraint just to hit a bigger number.)

---

## Self-Review Notes

- **Spec coverage:** every finding from the 2026-09-23 audit report is covered by a task, except `sticky-notes.jsx` not using `MentionEditor` (flagged in the audit as a product decision, not a defect — deliberately excluded) and `SolutionStatusIcon` (re-examined during planning and found not to be duplicative — see Task 4's note).
- **Placeholder scan:** every task has concrete file:line targets and either complete code (new files/hooks/components) or a fully worked example plus an exact remaining-site list (dialogs, confirm sites) — no "add appropriate handling"-style steps.
- **Type/name consistency:** `useEntityStatus` (Task 4) and `useCrudDialogForm`/`AlertDialog` (Tasks 5-6) are defined once and referenced with the same names/signatures throughout; Task 6 explicitly depends on Task 5's `AlertDialog` and Task 4 is independent of both (order between 4 and 5 doesn't matter; 6 must come after 5).
- **Task ordering:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Tasks 1-4 are mutually independent (order among them doesn't matter); 5 before 6 (hard dependency); 7 and 8 are independent of everything else but come after 6 to avoid touching pages mid-CRUD-refactor; 9 last since it's the highest-risk, most time-consuming task and benefits from the codebase already being in its final JSX shape (fewer classNames churning under it).
