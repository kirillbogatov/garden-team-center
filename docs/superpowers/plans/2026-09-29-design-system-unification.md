# Design System Unification (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the concrete, evidence-backed design-consistency bugs found in a full-codebase audit — a border-token mixup that makes form controls nearly invisible, a real focus-visibility accessibility gap, one duplicated hardcoded color, and radius-literal drift — without touching layout, behavior, or anything that requires a subjective design call.

**Architecture:** This is a token- and CSS-class-level pass, not a component rewrite. Every task either (a) repoints a class from the wrong CSS variable to the right one, (b) adds a missing `:focus-visible`/`:focus-within` rule using the outline convention the codebase already established (`outline: 2px solid hsl(var(--ring) / .35)`), or (c) normalizes a literal value. Regression tests are grep-based assertions against the source files themselves (the same style already used in `test/theme-contrast.test.js:56-58`), since the bugs are "wrong token/wrong literal referenced in source," not runtime behavior.

**Tech Stack:** Plain CSS custom properties (`src/styles.css`, `src/patterns.css`), React/JSX (`src/components/*.jsx`, `src/pages/*.jsx`), Node's built-in test runner (`node --test`, wired up as `npm run test:client`).

## Global Constraints

- Every change must render correctly across all 4 themes (`disk-light`, `anuppuccin-latte`, `noch`, `anuppuccin-mocha` — see `src/lib/appearance.js:1-6`) and both color modes (light/dark) — verify with `npm run test:client` after every task, plus one manual look in the running app in at least one light and one dark theme (`npm run dev`, then switch themes in Settings) before the final commit of the plan.
- Reuse existing tokens (`--input`, `--ring`, `--status-ok-text`, `--status-warn-text`) — do not invent new colors in this plan. Any consolidation that would require inventing/choosing a new brand color is explicitly deferred (see "Deferred to Phase 2" at the end of this document), not guessed at here.
- Never raise the `!important` count in `src/styles.css` above its current value. Task 7 ratchets the test ceiling down to match reality (302) specifically to enforce this going forward.
- New shared CSS lives in `src/patterns.css` (per its own header comment: "Keep this file authoritative for reusable patterns"); page-specific fixes stay in `src/styles.css` next to the rules they patch.
- Follow existing naming conventions: kebab-case classes, `ui-*` prefix only for cross-page primitives meant for reuse (matches `ui-section-header`, `ui-tabs`, `ui-tab` already in `patterns.css`).

---

### Task 1: Point shared form primitives at `--input`, not `--border`

**Why:** `--border` (light theme: HSL `221.3 16% 80.4%`) sits at ~1.35:1 contrast against `--background` (`220 22% 92%`) — far below the WCAG 1.4.11 minimum of 3:1 for UI-component boundaries. `--input` (`228.5 11.1% 54.1%`) exists specifically for this and measures ~3.1:1. `src/components/mention-editor.jsx:273` already uses `border-input` correctly; `ui.jsx` and `people-field.jsx` use `border-border/NN` instead — a token mixup that makes every default Button, Input, Textarea, SelectTrigger, and the people multi-select combobox render with an almost-invisible boundary in the light theme.

**Files:**
- Modify: `src/components/ui.jsx:89,91,110,115,200`
- Modify: `src/components/people-field.jsx:70`
- Test: `test/theme-contrast.test.js`

**Interfaces:** None — this task only changes Tailwind class strings, no exported signatures change.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js` (after the existing `!important` test, so near line 113):

```js
test('shared form primitives reference --input, not the low-contrast --border token', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ui.jsx'), 'utf8');
  assert.doesNotMatch(
    uiSource,
    /border-border\/\d+/,
    'Button/Input/Textarea/SelectTrigger must use border-input — border-border is ~1.35:1 contrast against --background, below the WCAG 1.4.11 3:1 minimum for control boundaries',
  );
  const peopleFieldSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'people-field.jsx'), 'utf8');
  assert.doesNotMatch(
    peopleFieldSource,
    /border-border\/\d+/,
    'the people multi-select combobox must use border-input for the same reason',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL on the new test, reporting the `border-border/70`, `/80`, `/90` matches in `ui.jsx`.

- [ ] **Step 3: Fix `src/components/ui.jsx`**

Change (`buttonVariants`, around line 89-91):
```js
default: 'border border-border/70 bg-muted/75 text-foreground hover:bg-muted active:bg-muted/90',
```
to:
```js
default: 'border border-input bg-muted/75 text-foreground hover:bg-muted active:bg-muted/90',
```
and:
```js
outline: 'border border-border/80 bg-background hover:bg-muted/65',
```
to:
```js
outline: 'border border-input bg-background hover:bg-muted/65',
```

Change `Input` (line 110) `border border-border/90` → `border border-input`.

Change `Textarea` (line 115) `border border-border/90` → `border border-input`.

Change `SelectTrigger` (line 200) `border border-border/90` → `border border-input`.

- [ ] **Step 4: Fix `src/components/people-field.jsx:70`**

Change `border border-border/90` → `border border-input` in the combobox container className.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS (all tests, including the new one).

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`, open the app, switch to `disk-light` (or the default `anuppuccin-latte`) theme, and look at: any page with a visible `Button` (e.g. Meetings list), the `Input`/`Textarea` fields in a dialog (e.g. "Добавить документ" on a meeting detail page), and a `Select` trigger. Confirm the border is now visibly a thin gray outline instead of nearly invisible, and that nothing else about the control's size/padding shifted.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui.jsx src/components/people-field.jsx test/theme-contrast.test.js
git commit -m "fix: point shared form primitives at --input instead of low-contrast --border"
```

---

### Task 2: Fix the two duplicate dashed empty-state boxes and their missing focus state

**Why:** `.task-relations-empty` (`src/styles.css:895-905`) already correctly uses `--input` for its dashed border (fixed in a prior pass on the meeting-detail page). Two more click-to-add dashed boxes implementing the exact same pattern — `.task-plan-composer` (`src/styles.css:4204-4212`, wraps the inline "add subtask" input) and `.sticky-notes-empty` (`src/styles.css:4324-4336`, the "Добавить первый стикер" button in `src/components/sticky-notes.jsx:198`) — still reference `--border`, and `.sticky-notes-empty` additionally has no `:focus-visible` rule at all despite being a real `<button>`.

**Files:**
- Modify: `src/styles.css:4209` (`.task-detail-page .task-plan-composer`)
- Modify: `src/styles.css:4331,4337` (`.sticky-notes-empty`)
- Test: `test/theme-contrast.test.js`

**Interfaces:** None.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js`:

```js
test('dashed click-to-add empty states use --input for their border, matching .task-relations-empty', () => {
  assert.doesNotMatch(
    css,
    /\.task-plan-composer\s*\{[^}]*border:\s*1px dashed hsl\(var\(--border\)\)/,
    '.task-plan-composer should match .task-relations-empty and use --input',
  );
  assert.doesNotMatch(
    css,
    /\.sticky-notes-empty\s*\{[^}]*border:\s*1px dashed hsl\(var\(--border\)\)/,
    '.sticky-notes-empty should match .task-relations-empty and use --input',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL on the new test.

- [ ] **Step 3: Fix `.task-detail-page .task-plan-composer` (styles.css:4204-4212)**

Change:
```css
.task-detail-page .task-plan-composer {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  background: transparent;
}
```
to (only the border line changes):
```css
.task-detail-page .task-plan-composer {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed hsl(var(--input));
  border-radius: 8px;
  background: transparent;
}
```

- [ ] **Step 4: Fix `.sticky-notes-empty` (styles.css:4324-4337) and add its missing focus state**

Change:
```css
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
```
to:
```css
.sticky-notes-empty {
  display: flex;
  width: 100%;
  min-height: 72px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed hsl(var(--input));
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.sticky-notes-empty:hover { color: hsl(var(--foreground)); background: hsl(var(--muted) / .25); }
.sticky-notes-empty:focus-visible { outline: 2px solid hsl(var(--ring) / .35); outline-offset: -2px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`, open a task's "Подзадачи" composer and a person/team page's sticky notes panel (empty state), confirm the dashed border is now visible and Tab-focusing the "Добавить первый стикер" button shows an outline.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css test/theme-contrast.test.js
git commit -m "fix: unify dashed empty-state borders on --input, add missing sticky-notes focus ring"
```

---

### Task 3: Add a shared focus-ring utility and apply it to isolated components

**Why:** `src/styles.css:602` sets a global `:focus-visible { outline: none; }`, and every custom clickable element is expected to re-add its own outline — 20+ classes already do (`.catalog-row.is-clickable`, `.meeting-context-row`, `.person-profile-link`, etc., per the audit). Four small, reusable components have no such rule at all, so keyboard users tabbing through them get **no visible focus indicator**: `src/components/view-mode-toggle.jsx:24-25`, `src/components/search-palette.jsx:170,178`, `src/components/people-field.jsx:102` (a keyboard-navigable combobox — the sharpest gap), and `src/components/app-shell.jsx:53,210` (the entire left nav and the profile button).

**Files:**
- Modify: `src/patterns.css` (add shared utility)
- Modify: `src/components/view-mode-toggle.jsx:24-25`
- Modify: `src/components/search-palette.jsx:170,178`
- Modify: `src/components/people-field.jsx:102`
- Modify: `src/components/app-shell.jsx:53,210`
- Test: `test/theme-contrast.test.js`

**Interfaces:** Produces a new reusable class `.ui-focus-ring` (applies `outline: 2px solid hsl(var(--ring) / .35); outline-offset: 2px;` on `:focus-visible`) — later tasks in this plan (Task 4) consume this same class name.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js`:

```js
test('.ui-focus-ring utility exists for custom clickable elements without their own focus rule', () => {
  const patternsCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'patterns.css'), 'utf8');
  assert.match(
    patternsCss,
    /\.ui-focus-ring:focus-visible\s*\{[^}]*outline:/,
    '.ui-focus-ring must define a visible :focus-visible outline for reuse across components',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — `.ui-focus-ring` doesn't exist yet.

- [ ] **Step 3: Add the utility to `src/patterns.css`**

Append near the end of the file:

```css
/* Shared focus indicator for custom clickable elements that don't have their own
   :focus-visible rule. The global reset in styles.css disables the native outline;
   every custom interactive element needs one of these back. */
.ui-focus-ring:focus-visible { outline: 2px solid hsl(var(--ring) / .35); outline-offset: 2px; }
.ui-focus-ring-within:focus-within { outline: 2px solid hsl(var(--ring) / .35); outline-offset: -2px; }
```

- [ ] **Step 4: Apply it in `src/components/view-mode-toggle.jsx`**

Change line 24:
```jsx
<button type="button" onClick={() => onChange('cards')} aria-label="Карточки" aria-pressed={value === 'cards'} title="Карточки" className={cn('grid h-8 w-8 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:text-foreground', value === 'cards' && 'bg-muted text-foreground shadow-sm')}><LayoutGrid className="h-4 w-4"/></button>
```
to (add `'ui-focus-ring'` to the `cn(...)` call):
```jsx
<button type="button" onClick={() => onChange('cards')} aria-label="Карточки" aria-pressed={value === 'cards'} title="Карточки" className={cn('grid h-8 w-8 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:text-foreground ui-focus-ring', value === 'cards' && 'bg-muted text-foreground shadow-sm')}><LayoutGrid className="h-4 w-4"/></button>
```
Apply the same `ui-focus-ring` addition to the second button on line 25.

- [ ] **Step 5: Apply it in `src/components/search-palette.jsx`**

Line 170, add `ui-focus-ring` to the existing className string:
```jsx
className="mt-1 flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ui-focus-ring"
```
Line 178 (`PaletteItem`), add `'ui-focus-ring'` inside the existing `cn(...)` call:
```jsx
className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ui-focus-ring',active?'bg-accent text-accent-foreground':'hover:bg-accent/70 hover:text-accent-foreground')}
```

- [ ] **Step 6: Apply it in `src/components/people-field.jsx:102`**

```jsx
className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ui-focus-ring', index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
```

- [ ] **Step 7: Apply it in `src/components/app-shell.jsx`**

Line 53 (nav `NavLink`), add `ui-focus-ring` to the className function's returned string:
```jsx
className={({ isActive }) => cn('group flex h-10 items-center rounded-[8px] text-[14px] font-normal text-muted-foreground transition-colors hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground ui-focus-ring', collapsed ? 'w-full justify-center px-0' : 'gap-2.5 px-2.5', isActive && 'bg-[hsl(var(--sidebar-hover))] text-foreground')}
```
Line 210 (profile button):
```jsx
<button aria-label="Профиль" className={cn('flex h-10 min-w-0 items-center rounded-[8px] transition-colors hover:bg-[hsl(var(--sidebar-hover))] ui-focus-ring', collapsed && !mobile ? 'w-10 justify-center p-0' : 'w-full gap-2.5 px-2 text-left')}>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 9: Manual visual check**

Run: `npm run dev`, click into the page, then Tab through: the left nav links, the profile button at the bottom of the sidebar, the card/list view toggle (if visible on the current page), and open the search palette (`Cmd/Ctrl+K`) and arrow through its results. Confirm each shows a visible focus ring and nothing shifted position/size.

- [ ] **Step 10: Commit**

```bash
git add src/patterns.css src/components/view-mode-toggle.jsx src/components/search-palette.jsx src/components/people-field.jsx src/components/app-shell.jsx test/theme-contrast.test.js
git commit -m "fix: add missing focus-visible indicator to nav, search palette, and view toggles"
```

---

### Task 4: Apply the focus-ring utility to the remaining page-level gaps

**Why:** The same missing-focus-indicator issue recurs in three pages on custom `<button>`/`<label>` elements that have no dedicated CSS class to hang a fix on: the calendar event-type filter and the Weekly page's week/mode controls in `src/pages/operations.jsx`, the theme/accent picker buttons in `src/pages/misc.jsx`, and the inline people-assignment button in `src/pages/technology.jsx`.

**Files:**
- Modify: `src/pages/operations.jsx:358,511,512,516`
- Modify: `src/pages/misc.jsx:103,113`
- Modify: `src/pages/technology.jsx:221`
- Test: `test/theme-contrast.test.js`

**Interfaces:** Consumes `.ui-focus-ring` / `.ui-focus-ring-within` from Task 3.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js`:

```js
test('page-level custom buttons without a dedicated CSS class carry the shared focus-ring utility', () => {
  const spots = [
    ['src/pages/operations.jsx', /CALENDAR_EVENT_TYPES\.map[\s\S]{0,220}ui-focus-ring/],
    ['src/pages/operations.jsx', /chooseMode\('week'\)[\s\S]{0,120}ui-focus-ring/],
    ['src/pages/operations.jsx', /chooseMode\('person'\)[\s\S]{0,120}ui-focus-ring/],
    ['src/pages/operations.jsx', /<label className="ui-focus-ring-within relative cursor-pointer rounded-md px-2 py-1\.5 text-sm font-medium hover:bg-muted" onClick=\{\(\)=>\{ try \{ weekInputRef\.current\?\.showPicker\?\.\(\); \} catch \{\} \}\}>/],
    ['src/pages/misc.jsx', /function ThemeGroup[\s\S]{0,900}ui-focus-ring/],
    ['src/pages/misc.jsx', /function AccentPicker[\s\S]{0,900}ui-focus-ring/],
    ['src/pages/technology.jsx', /disabled=\{!canEdit\} onClick=\{onPeople\}[\s\S]{0,120}ui-focus-ring/],
  ];
  for (const [file, pattern] of spots) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, pattern, `${file} is missing the ui-focus-ring utility on a custom clickable element (pattern: ${pattern})`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — none of the seven spots have `ui-focus-ring` yet.

- [ ] **Step 3: Fix `src/pages/operations.jsx:358` (calendar event-type filter)**

Change:
```jsx
{CALENDAR_EVENT_TYPES.map((item)=><button type="button" key={item.key} aria-pressed={filters[item.key]} onClick={()=>toggleFilter(item.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition ${filters[item.key]?'border-border bg-muted/55 text-foreground':'border-transparent text-muted-foreground opacity-55 hover:opacity-85'}`}><span aria-hidden="true">{item.emoji}</span><span>{item.label}</span></button>)}
```
to:
```jsx
{CALENDAR_EVENT_TYPES.map((item)=><button type="button" key={item.key} aria-pressed={filters[item.key]} onClick={()=>toggleFilter(item.key)} className={`ui-focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition ${filters[item.key]?'border-border bg-muted/55 text-foreground':'border-transparent text-muted-foreground opacity-55 hover:opacity-85'}`}><span aria-hidden="true">{item.emoji}</span><span>{item.label}</span></button>)}
```

- [ ] **Step 4: Fix `src/pages/operations.jsx:511-512,516` (Weekly mode toggle + week picker)**

Change:
```jsx
<button type="button" onClick={()=>chooseMode('week')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode==='week'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По неделям</button>
<button type="button" onClick={()=>chooseMode('person')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode==='person'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По сотрудникам</button>
```
to:
```jsx
<button type="button" onClick={()=>chooseMode('week')} className={`ui-focus-ring rounded-md px-3 py-1.5 text-xs font-medium ${mode==='week'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По неделям</button>
<button type="button" onClick={()=>chooseMode('person')} className={`ui-focus-ring rounded-md px-3 py-1.5 text-xs font-medium ${mode==='person'?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground'}`}>По сотрудникам</button>
```
Change line 516 (the label wraps a hidden `<input>`, so it needs the `:focus-within` variant, exactly like `.meeting-detail-date-control` elsewhere in this codebase):
```jsx
<label className="relative cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted" onClick={()=>{ try { weekInputRef.current?.showPicker?.(); } catch {} }}>
```
to:
```jsx
<label className="ui-focus-ring-within relative cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted" onClick={()=>{ try { weekInputRef.current?.showPicker?.(); } catch {} }}>
```

- [ ] **Step 5: Fix `src/pages/misc.jsx:103,113` (theme and accent pickers)**

Change line 103:
```jsx
return <button type="button" key={theme.value} aria-pressed={selected} onClick={()=>onSelect(theme.value)} className={cn('flex min-h-[72px] items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/35',selected&&'border-primary ring-1 ring-primary/25')}>
```
to:
```jsx
return <button type="button" key={theme.value} aria-pressed={selected} onClick={()=>onSelect(theme.value)} className={cn('ui-focus-ring flex min-h-[72px] items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/35',selected&&'border-primary ring-1 ring-primary/25')}>
```
Change line 113's accent swatch button className from:
```jsx
className={cn('grid h-8 w-8 place-items-center rounded-full border transition-transform hover:scale-105',accent.value===value&&'ring-2 ring-primary ring-offset-2 ring-offset-background')}
```
to:
```jsx
className={cn('ui-focus-ring grid h-8 w-8 place-items-center rounded-full border transition-transform hover:scale-105',accent.value===value&&'ring-2 ring-primary ring-offset-2 ring-offset-background')}
```

- [ ] **Step 6: Fix `src/pages/technology.jsx:221` (inline people-assignment button)**

Change:
```jsx
<td className="p-2"><button type="button" disabled={!canEdit} onClick={onPeople} className="flex min-h-8 w-full items-center rounded-md px-2 text-left hover:bg-muted/50">
```
to:
```jsx
<td className="p-2"><button type="button" disabled={!canEdit} onClick={onPeople} className="ui-focus-ring flex min-h-8 w-full items-center rounded-md px-2 text-left hover:bg-muted/50">
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 8: Manual visual check**

Run: `npm run dev`, Tab through the calendar filter pills on `/calendar`, the week/person toggle and week picker on the Weekly page, the theme/accent pickers in Settings, and the people-assignment cell on a Technology roadmap row. Confirm each shows a focus ring on Tab.

- [ ] **Step 9: Commit**

```bash
git add src/pages/operations.jsx src/pages/misc.jsx src/pages/technology.jsx test/theme-contrast.test.js
git commit -m "fix: add missing focus-visible indicator to calendar, weekly, settings, and technology controls"
```

---

### Task 5: Consolidate the one unambiguous duplicate status color

**Why:** `.assistant-digest-availability.is-sick` (`src/styles.css:1880`) already uses `var(--status-warn-text)` for a person's "sick" availability state. `.team-person-card-availability.is-sick` (`src/styles.css:3751`) renders the exact same semantic state — a person's card badge when they're sick — but with a hardcoded, different hex (`#f06438`) instead of the token. This is a true duplicate (same state name, same concept, already tokenized once), not a judgment call about what color "warning" should be — so it's safe to fix now. Other color duplicates found in the audit (three different greens for "active/done/ok", the `tasks-important-filter` star color, `.ui-tab-count.is-warning`) require picking a canonical color across genuinely different semantics and are deliberately deferred — see "Deferred to Phase 2" below.

**Files:**
- Modify: `src/styles.css:3749-3751`
- Test: `test/theme-contrast.test.js`

**Interfaces:** None.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js`:

```js
test('team-person-card-availability.is-sick reuses --status-warn-text like the equivalent assistant-digest-availability state', () => {
  assert.doesNotMatch(
    css,
    /\.team-person-card-availability\.is-away,\s*\n\.team-person-card-availability\.is-sick \{ color: #f06438; \}/,
    '.is-sick should use var(--status-warn-text), matching .assistant-digest-availability.is-sick',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL.

- [ ] **Step 3: Fix `src/styles.css:3742-3756`**

Change:
```css
.team-person-card-availability {
```
context around line 3749-3751, change:
```css
.team-person-card-availability.is-active { color: #2ca84f; }
.team-person-card-availability.is-away,
.team-person-card-availability.is-sick { color: #f06438; }
```
to:
```css
.team-person-card-availability.is-active { color: #2ca84f; }
.team-person-card-availability.is-away,
.team-person-card-availability.is-sick { color: var(--status-warn-text); }
```

(Leave `.is-active`'s `#2ca84f` untouched — it's a different semantic from `--status-warn-text` and is one of the three-way green duplicates deferred to Phase 2, not fixed here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, open the People/Team roster page and find a person marked "sick" or "away" (or set one via admin data if none exists), confirm the card badge color still reads clearly in both a light and a dark theme.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css test/theme-contrast.test.js
git commit -m "fix: reuse --status-warn-text for team-person-card-availability sick/away state"
```

---

### Task 6: Normalize the three spellings of "pill" radius to one literal

**Why:** The audit found three different literal spellings for a fully-rounded ("pill") corner in `src/styles.css`: `border-radius: 99px` (line 621), `border-radius: 999px` (line 641, and the majority — 12 occurrences), and `border-radius: 9999px` (line 2880). All three render identically (any value ≥ half the element's height produces a full pill), so this is a pure literal-consistency fix with zero visual effect — safe to do mechanically.

**Files:**
- Modify: `src/styles.css:621,2880` (and any other `99px`/`9999px` occurrence found in Step 3)

**Interfaces:** None.

- [ ] **Step 1: Write the failing regression test**

Add to `test/theme-contrast.test.js`:

```js
test('the "pill" full-radius value is spelled consistently as 999px', () => {
  assert.doesNotMatch(css, /border-radius:\s*99px[^9]/, 'use 999px, not 99px, for pill corners');
  assert.doesNotMatch(css, /border-radius:\s*9999px/, 'use 999px, not 9999px, for pill corners');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL on both assertions.

- [ ] **Step 3: Find every occurrence and normalize**

Run: `grep -n "border-radius: *99px\|border-radius: *9999px" src/styles.css`
For each match reported, change the value to `999px` (e.g. `border-radius: 99px;` → `border-radius: 999px;`, `border-radius: 9999px;` → `border-radius: 999px;`). Do not touch any `border-radius` value that isn't one of these two literal outliers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css test/theme-contrast.test.js
git commit -m "chore: normalize pill border-radius literal to 999px everywhere"
```

---

### Task 7: Ratchet the `!important` ceiling down to the current actual count

**Why:** `test/theme-contrast.test.js:106-113` asserts the `!important` count stays `<= 308`, a baseline recorded after a prior cleanup pass (355 → 308). The actual current count is 302 — cleanup has stalled 6 below the ceiling, meaning up to 6 more `!important` declarations could be added anywhere in the app and CI would stay green. Since none of Tasks 1-6 add any `!important`, this is a safe, mechanical tightening that locks in the current state and prevents silent regression going forward.

**Files:**
- Modify: `test/theme-contrast.test.js:112`

**Interfaces:** None.

- [ ] **Step 1: Confirm the current count**

Run: `node -e "const fs=require('fs'); console.log((fs.readFileSync('src/styles.css','utf8').match(/!important/g)||[]).length);"`
Expected output: `302` (if Tasks 1-6 were completed exactly as specified above, none of them touch `!important` usage, so this should still read 302; if a different number comes back, use that number in Step 2 instead of 302).

- [ ] **Step 2: Tighten the assertion**

In `test/theme-contrast.test.js`, change:
```js
  const count = (css.match(/!important/g) || []).length;
  assert.ok(count <= 308, `expected !important count to not exceed the 308 baseline, found ${count}`);
```
to:
```js
  const count = (css.match(/!important/g) || []).length;
  assert.ok(count <= 302, `expected !important count to not exceed the 302 baseline (ratcheted down from 308 after the Task 9 cleanup pass stalled with headroom to spare), found ${count}`);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test/theme-contrast.test.js
git commit -m "test: ratchet !important ceiling down to the current actual count (308 -> 302)"
```

---

## Deferred to Phase 2 (needs its own plan, not bundled here)

Per the audit, these are real but larger or more subjective — each needs its own brainstorming/spec pass rather than being bundled into bite-sized mechanical tasks:

- **Three-way green color duplication** (`#3f9364` used twice, `#42a66b`, `#2ca84f`, plus the existing `--status-ok-text: #1a6b35` token — four different greens for "active/done/ok" states across `task-status-glyph-*`, `process-status-glyph-*`, `team-person-status-dot.is-active`, `team-person-card-availability.is-active`) — picking one canonical green is a design decision, not a mechanical fix.
- **`tasks-important-filter` star color** (`#e5ae22`) and **`.ui-tab-count.is-warning`** (`patterns.css:85-89`, `rgb()` literals with no per-theme variants) — different structural shape (background+text pair) from the existing text-only status tokens, and conflating "important" with "warning" is a semantic call.
- **Status glyph colors have no per-theme variants** — `task-status-glyph-*`/`process-status-glyph-*` hex values are defined once with no override in any of the 4 `html.theme-*` blocks, unlike the rest of the token system. Worth visually auditing under all 4 themes before deciding whether/how to extend.
- **6+ parallel "empty state" implementations** beyond the 3 fixed here (ad hoc Tailwind-only dashed boxes in `journal.jsx:242`, `knowledge-tools.jsx:66`, `resources.jsx:1145/1152/1161`, plus the differently-shaped `.person-card-empty` and text-only `.meeting-context-empty`) — consolidating these into one shared component changes markup, not just CSS, across 5+ pages.
- **3 parallel "pill metadata control" implementations** (`.things-task-meta-select`, `.meeting-detail-meta-select`, `.meeting-detail-date-control`) that could become one shared component.
- **5+ parallel "list row" implementations** (`EntityRow`/`unified-entity-row` vs `CatalogRow`/`entity-row` vs `.meeting-context-row` vs `.task-relation-row` vs `.task-plan-row` vs `.person-card-row` vs the 4 `.assistant-*-row` variants) — the biggest single inconsistency found, but a real refactor with cross-page behavioral risk; needs its own spec.
- **Radius scale**: beyond the pill-literal fix in Task 6, 12+ distinct non-pill radius values are in active use (1-12px plus two 17/18px outliers) with no canonical scale defined — deciding a scale and migrating to it is a larger, more visible change.
- **`!important` debt paydown**: 302 declarations remain, heavily concentrated in `.task-detail-page` layout-override rules (`styles.css` ~2969-3450) — reducing this requires editing the original rules those overrides stack on top of, which is real refactoring risk, not a mechanical fix.
- **Bare `<h2>` sections not using the shared `Section`/`SectionHeader`** (`tasks.jsx:277`, `journal.jsx:219`, `knowledge-tools.jsx:63`) — small, but changes visual rhythm on those pages and should be reviewed per-page.
