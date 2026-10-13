# Workload formula: weighted score with fragmentation penalty

## Context

Team workload is currently modeled as an hour range per project assignment. `PROJECT_LOAD_OPTIONS` (`src/lib/domain.js:49-53`) maps each mode to `{min, max, label, rangeLabel}` (e.g. `full: {min:6, max:8, rangeLabel:'6–8 часов'}`). `personProjectLoadSummary` (`src/lib/domain.js:72-78`) sums `min`/`max` across the person's active-project assignments and `projectLoadLevel(maxHours)` (`src/lib/domain.js:64-70`) buckets the summed `maxHours` into a level (`Нет загрузки` / `Низкая` / `Средняя` / `Полная` / `Перегруз`) using fixed hour thresholds (`LOAD_NORM_MIN_HOURS=8`, `LOAD_NORM_MAX_HOURS=10`, plus inline `5`/`1`).

This produces a known distortion: the model only sums upper bounds, so it can't distinguish someone concentrated on one project from someone spread thin across several. Four "support" assignments (2h×4=8h) and one full-time assignment plus one support assignment (8h+2h=10h) land in different buckets today only by coincidence of the exact hour math, and in general the model has no notion that spreading across more projects costs something (context-switching) beyond the raw hours.

This spec replaces the hour range with a flat per-mode weight plus an explicit fragmentation penalty, and removes hour-based copy from the UI everywhere it appears (no feature request for a new visualization — an earlier scale/pip-chart exploration was rejected in favor of keeping today's plain badge).

## Formula

Per-mode weight, replacing `min`/`max`:

| Mode | Weight | Label |
|---|---|---|
| `full` | 3 | Фултайм |
| `half` | 2 | Парт-тайм |
| `support` | 1 | Саппорт |

For a person with `n` active-project assignments and per-assignment weights `w_i`:

```
score = Σw_i + 0.5 × max(0, n − 1)
```

The `0.5` per project beyond the first is the fragmentation penalty — flat, not tied to any one project, doesn't apply when `n ≤ 1`.

Level thresholds on `score`:

| Range | Label | tone |
|---|---|---|
| `score === 0` | Нет загрузки | muted |
| `0 < score < 1.5` | Низкая | muted |
| `1.5 ≤ score < 3` | Средняя | warning |
| `3 ≤ score ≤ 5` | Полная | success |
| `score > 5` | Перегруз | danger |

Worked examples (weight sum → +penalty → score → level):
- Фултайм + саппорт: 3+1=4, n=2, +0.5 → **4.5 → Полная**
- Два парт-тайма + саппорт: 2+2+1=5, n=3, +1.0 → **6.0 → Перегруз**
- Четыре саппорта: 1×4=4, n=4, +1.5 → **5.5 → Перегруз**
- Три парт-тайма: 2×3=6, n=3, +1.0 → **7.0 → Перегруз**
- Фултайм + парт-тайм: 3+2=5, n=2, +0.5 → **5.5 → Перегруз**

Note the fix versus today: four support assignments no longer lands in the same bucket as "one full-time project" — fragmentation across 4 projects now scores higher (5.5, Перегруз) than concentrating on 1-2 (4.5, Полная), even though the raw weight sum is the same or lower.

## `src/lib/domain.js` changes

Replace lines 49-78:

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
  const score = weights.reduce((sum, w) => sum + w, 0) + (active.length > 1 ? LOAD_FRAGMENTATION_PENALTY * (active.length - 1) : 0);
  return { projects: active, score, level: projectLoadLevel(score) };
}
```

`minHours`/`maxHours` are gone from the returned summary — callers use `summary.level` only (no caller currently reads `summary.minHours`/`summary.maxHours` for anything other than display text, which is being removed per the "Text changes" section below).

## Server-side duplicate: `server/domain/smart-search.js`

This logic is **independently duplicated** on the server for the assistant's person digest and team digest (no shared import — client is ESM under `src/`, server is CJS). It must be updated in lockstep or the assistant ("как дела у Х", "загрузка команды") will disagree with `/team-load` and the person page about the same person's level.

Replace `PROJECT_LOAD_OPTIONS` / `projectLoadConfig` / `projectLoadLevel` (`server/domain/smart-search.js:29-46`):

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

(Server keeps its own tone vocabulary — `overloaded`/`full`/`medium`/`small`/`none` — used by `assistant-load-level.is-*` CSS classes; only `.is-overloaded` is actually styled today, `src/styles.css:4633`. Unchanged by this spec.)

Two call sites compute the score inline and both need the fragmentation term added:

- Person digest (`server/domain/smart-search.js:684-705`): `loadItems` map drops `maxHours: cfg.max` (no longer needed once `meta` stops showing hours — see below) and `totalMaxHours` becomes:
  ```js
  const score = projects.length ? loadItems.reduce((sum, item) => sum + item.weight, 0) + (projects.length > 1 ? LOAD_FRAGMENTATION_PENALTY * (projects.length - 1) : 0) : 0;
  ```
  (`loadItems` items need a `weight: cfg.weight` field for this sum, replacing the old `maxHours: cfg.max`.)
- Team digest (`server/domain/smart-search.js:778-782`): same shape — sum `weight` across the person's active projects, add the fragmentation term based on that project count, then `projectLoadLevel(score)`.

## Text changes (drop hour ranges, no numbers anywhere except the formula hint)

Every place that currently renders an hour range or a raw score number switches to showing only the mode label. No new numeric display is introduced (the fragmentation-penalty visualization idea — a pip/segment scale — was explored and rejected in favor of keeping today's plain level badge unchanged).

- `src/pages/resources.jsx:886` `LoadSummary`: drop the `до {summary.maxHours} ч/день` line entirely; per-project row becomes `{option.label}` (drop the `· {option.rangeLabel}` suffix).
- `src/pages/resources.jsx:969` `ProjectLoadDialog` select items: `{option.label} ({option.rangeLabel})` → `{option.label}`.
- `src/pages/resources.jsx:981` `PersonLoadDialog` select items: same change.
- `src/pages/resources.jsx:857` `personLoadShares`: `hours: option.max` → `weight: option.weight`; the `total`/`raw`/`percent` computation below it (lines 858-863) is unchanged, just fed the new field name. `PersonLoadBreakdown` itself (865-870) needs no changes beyond this — it already renders percentages, not raw numbers.
- `server/domain/smart-search.js:688`: `meta: \`${cfg.label} (${cfg.rangeLabel})\`` → `meta: cfg.label`. Test at `test/smart-search.test.js:587-590` currently asserts `'Парт-тайм (3–5 часов)'` / `'Саппорт (1–2 часа)'` — update to `'Парт-тайм'` / `'Саппорт'`.

Nothing else reads `rangeLabel`, `min`, or `max` off `PROJECT_LOAD_OPTIONS` (confirmed via repo-wide search).

## New: formula hint on `/team-load`

The only new UI element. On `TeamLoadPage` (`src/pages/resources.jsx:569-570`), add a small info affordance next to the `PageHeader` title:

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

Requires importing `Tooltip` from `@/components/ui` and `Info` from `lucide-react` in `resources.jsx` (neither is currently imported there). No other page gets this hint — scope is the dedicated `/team-load` page only, per the "раздел «Загрузка»" the request named.

## Tests to update

- `test/smart-search.test.js:565-593`: with `half` (weight 2) + `support` (weight 1), `n=2` → score `2+1+0.5=3.5` → **Полная** (`tone:'full'`, was `tone:'medium'`/`'Средняя'`). Update the `summary.tone`/`summary.text` assertions and the `items.map(...meta)` assertions (drop hour ranges, per "Text changes" above).
- No other test in the repo asserts hour values or the old thresholds (`test/client-parity.test.js:86-95` and `test/ui-pattern-consistency.test.js:39` only check label strings/section titles/routes, unaffected).

## Out of scope

- No new visualization component (scale/pip chart) — explored interactively and dropped in favor of the existing plain badge.
- No change to `PersonAttentionSection`'s incomplete/overload signals (`src/pages/resources.jsx:648-649`) beyond the level they read now meaning something different — the `tone === 'muted'` / `tone === 'danger'` checks keep working unchanged since tone names are preserved.
- No change to how `memberLoads` is stored (`{personId: mode}` on the project) — only how a summed score is derived from it.
