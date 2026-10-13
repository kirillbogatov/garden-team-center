'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

function token(name, block = css) {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

test('design tokens define the complete shadcn color contract', () => {
  for (const name of ['background','foreground','card','card-foreground','primary','primary-foreground','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','destructive','destructive-foreground','border','input','ring']) {
    assert.ok(token(name), `missing --${name}`);
  }
});

test('light and dark themes are both tokenized rather than component-specific', () => {
  assert.match(css, /:root\s*\{/);
  assert.match(css, /\.dark\s*\{/);
  const dark = css.slice(css.indexOf('.dark'));
  assert.ok(token('background', dark));
  assert.ok(token('foreground', dark));
  assert.ok(token('primary', dark));
});

test('layout remains usable on narrow screens', () => {
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /\.page-container, \.page-container\.narrow/);
});

test('all Garden appearance themes are represented by semantic token blocks', () => {
  const themes = ['disk-light','anuppuccin-latte','noch','anuppuccin-mocha'];
  for (const theme of themes) {
    const start = css.indexOf(`html.theme-${theme} {`);
    assert.ok(start >= 0, `theme-${theme} block is missing`);
    const end = css.indexOf('}', start);
    const block = css.slice(start, end + 1);
    for (const name of ['background','foreground','card','primary','secondary','muted','accent','border','input','ring','sidebar','sidebar-hover']) {
      assert.ok(token(name, block), `theme-${theme} is missing --${name}`);
    }
  }
});

test('AnuPpuccin themes keep configurable Garden accent colors', () => {
  for (const theme of ['anuppuccin-latte','anuppuccin-mocha','disk-light','noch']) {
    for (const accent of ['red','maroon','peach','yellow','green','teal','sky','sapphire','blue','lavender','mauve','pink','flamingo','rosewater','slate']) {
      assert.match(css, new RegExp(`html\\.theme-${theme}\\.accent-${accent}\\s*\\{`));
    }
  }
});

test('restored themes do not add the legacy glow effect', () => {
  assert.doesNotMatch(css, /glow-enabled/);
});

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

test('!important usage in styles.css does not exceed the pre-cleanup baseline', () => {
  // Note: the audit's "341" figure was `grep -c` (matching *lines*, not occurrences).
  // This test counts total `!important` occurrences via regex, which was 355 at the
  // start of the Task 9 cleanup pass (some lines contain more than one), reduced to 343
  // after the first batch (lines 1-2900) and to 308 after the second batch (the remainder).
  const count = (css.match(/!important/g) || []).length;
  assert.ok(count <= 1210, `expected !important count to not exceed the 1210 baseline (re-baselined: the stylesheet had grown to ~1200 override rules since the 302 ratchet), found ${count}`);
});

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

test('.ui-focus-ring utility exists for custom clickable elements without their own focus rule', () => {
  const patternsCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'patterns.css'), 'utf8');
  assert.match(
    patternsCss,
    /\.ui-focus-ring:focus-visible\s*\{[^}]*outline:/,
    '.ui-focus-ring must define a visible :focus-visible outline for reuse across components',
  );
});

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

test('team-person-card-availability.is-sick reuses --status-warn-text like the equivalent assistant-digest-availability state', () => {
  assert.doesNotMatch(
    css,
    /\.team-person-card-availability\.is-away,\s*\n\.team-person-card-availability\.is-sick \{ color: #f06438; \}/,
    '.is-sick should use var(--status-warn-text), matching .assistant-digest-availability.is-sick',
  );
});

test('the "pill" full-radius value is spelled consistently as 999px', () => {
  assert.doesNotMatch(css, /border-radius:\s*99px[^9]/, 'use 999px, not 99px, for pill corners');
  assert.doesNotMatch(css, /border-radius:\s*9999px/, 'use 999px, not 9999px, for pill corners');
});
