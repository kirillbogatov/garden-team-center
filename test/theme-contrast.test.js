const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Mirrors CSS color-mix(in srgb, a P%, b (100-P)%): linear per-channel blend
// on raw sRGB bytes, same as the browser's srgb-space color-mix.
function mixHex(a, b, pctA) {
  const A = rgb(a).map((c) => c * 255);
  const B = rgb(b).map((c) => c * 255);
  const t = (100 - pctA) / 100;
  const mixed = A.map((c, i) => Math.round(c + (B[i] - c) * t));
  return '#' + mixed.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

// Полный реестр тем — должен совпадать с GARDEN_THEMES в public/js/lib/interactions.js.
// Все темы прогоняются через одну и ту же проверку — раньше тест покрывал только
// часть тем, и регрессия в остальных проходила мимо `npm test` незамеченной.
const ALL_THEMES = [
  'chernika', 'myata', 'lavanda', 'tuman',
  'grafit', 'khvoya', 'noch',
  'anuppuccin-latte', 'anuppuccin-mocha',
];

// AnuPpuccin Latte/Mocha поддерживают настройку акцентного цвета — должно
// совпадать с ACCENT_COLORS в public/js/lib/interactions.js. Каждый вариант
// переопределяет только завязанные на акцент токены (см. html.theme-X.accent-Y
// в style.css), остальные наследуются от базового блока темы.
const ACCENT_NAMES = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'lavender'];
const ACCENT_THEMES = ['anuppuccin-latte', 'anuppuccin-mocha'];

function readThemeTokens(css, name) {
  const match = css.match(new RegExp(`html\\.theme-${name}\\{([^}]*)\\}`));
  assert.ok(match, `theme-${name} token block is missing`);
  const t = {};
  for (const m of match[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2];
  return t;
}

// Акцентный вариант переопределяет только 10 завязанных на акцент токенов —
// остальные (границы, поверхности, текст) читаем из базового блока темы.
function readAccentTokens(css, theme, accent) {
  const match = css.match(new RegExp(`html\\.theme-${theme}\\.accent-${accent}\\{([^}]*)\\}`));
  assert.ok(match, `theme-${theme}.accent-${accent} override block is missing`);
  const base = readThemeTokens(css, theme);
  const t = { ...base };
  for (const m of match[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2];
  return t;
}

test('every theme keeps AA contrast (4.5:1) for all four text tiers and accent-text on every surface', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  const surfaces = ['--bg-base', '--bg-sidebar', '--bg-elevated', '--bg-elevated-2', '--bg-hover', '--bg-active', '--bg-input'];
  for (const name of ALL_THEMES) {
    const t = readThemeTokens(css, name);
    // --text-disabled is styled onto real, non-disabled content throughout the app
    // (group counters, calendar day-of-week labels, breadcrumb separators, kbd hints —
    // see UX-audit-Garden-themes.md §1.1), so it must clear the same 4.5:1 bar as any
    // other text tier, not the relaxed bar WCAG allows for genuinely disabled controls.
    for (const fg of ['--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled', '--accent-text']) {
      for (const bg of surfaces) {
        if (!t[fg] || !t[bg]) continue;
        const ratio = contrast(t[fg], t[bg]);
        assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, expected >= 4.5:1`);
      }
    }
    assert.ok(contrast(t['--accent-fg'], t['--accent']) >= 4.5, `${name}: accent foreground must meet AA`);
    assert.ok(contrast(t['--primary-fg'], t['--primary-bg']) >= 4.5, `${name}: primary button text must meet AA`);
  }
});

test('every theme keeps a visible (>=2.9:1) border on real interactive controls', () => {
  // WCAG 1.4.11 asks for >=3:1 on the boundary of a UI component that has no other
  // visual affordance — an empty text input's border is exactly that case (see
  // UX-audit-Garden-themes.md §1.3). 2.9 gives floating-point rounding a little room.
  // --border is the token actually used on inputs, buttons, seg-toggles etc., so
  // only it is held to the strict AA non-text bar here.
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  for (const name of ALL_THEMES) {
    const t = readThemeTokens(css, name);
    const bgInput = t['--bg-input'] || t['--bg-elevated'];
    if (!t['--border'] || !bgInput) continue;
    const ratio = contrast(t['--border'], bgInput);
    assert.ok(ratio >= 2.9, `${name}: --border on --bg-input = ${ratio.toFixed(2)}:1, expected >= 2.9:1`);
  }
});

test('primary button fill (--border-soft lightened toward --bg-elevated) keeps AA contrast with --text-secondary in every theme', () => {
  // .btn-primary/.ui-button--primary fill with color-mix(--border-soft 70%, --bg-elevated 30%)
  // (see style.css/system.css) — a touch lighter than the neighboring secondary button's
  // --border-soft outline, so the pair still reads as related tones without the primary
  // looking heavier/darker than the outline next to it. Label color is --text-secondary
  // rather than --text-primary — full-strength text read brighter than the deliberately
  // muted fill. Neither token pairing is one of the 7 surfaces the text-tier test above
  // already checks --text-secondary against, so this needs its own guard.
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  for (const name of ALL_THEMES) {
    const t = readThemeTokens(css, name);
    if (!t['--border-soft'] || !t['--bg-elevated'] || !t['--text-secondary']) continue;
    const fill = mixHex(t['--border-soft'], t['--bg-elevated'], 70);
    const ratio = contrast(fill, t['--text-secondary']);
    assert.ok(ratio >= 4.5, `${name}: --text-secondary on primary-button fill (${fill}) = ${ratio.toFixed(2)}:1, expected >= 4.5:1`);
  }
});

test('every theme keeps decorative dividers (--border-soft) subtle but perceptible', () => {
  // --border-soft draws purely decorative structure — card outlines, list-row and
  // sidebar dividers, tab underlines (93 uses vs. --border's 27) — not the boundary
  // of a control someone needs to operate, so WCAG 1.4.11's 3:1 does not apply to it.
  // Regression: an earlier pass pushed --border-soft to the same ~3:1 bar as --border,
  // which made every card, badge and list row look outlined in a heavy, busy way.
  // It should still read as a line, not vanish into the surface — kept >=1.15:1 — but
  // must stay well under the "essential component" bar so it reads as calm structure.
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  for (const name of ALL_THEMES) {
    const t = readThemeTokens(css, name);
    const bgElevated = t['--bg-elevated'];
    if (!t['--border-soft'] || !bgElevated) continue;
    const ratio = contrast(t['--border-soft'], bgElevated);
    assert.ok(ratio >= 1.15, `${name}: --border-soft on --bg-elevated = ${ratio.toFixed(2)}:1, too faint to read as a divider`);
    assert.ok(ratio <= 2.2, `${name}: --border-soft on --bg-elevated = ${ratio.toFixed(2)}:1, too strong for a decorative divider`);
  }
});

test('every accent variant of AnuPpuccin Latte/Mocha keeps AA contrast for accent-text, accent-fg and primary-fg', () => {
  // readThemeTokens only ever matches the base html.theme-X{} block, so it is
  // blind to the html.theme-X.accent-Y{} overrides added for the accent picker —
  // this test exercises those combined selectors directly, the same way a real
  // page would resolve them (base declaration + more-specific override).
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  const surfaces = ['--bg-base', '--bg-sidebar', '--bg-elevated', '--bg-elevated-2', '--bg-hover', '--bg-active', '--bg-input'];
  for (const theme of ACCENT_THEMES) {
    for (const accent of ACCENT_NAMES) {
      const t = readAccentTokens(css, theme, accent);
      for (const bg of surfaces) {
        const ratio = contrast(t['--accent-text'], t[bg]);
        assert.ok(ratio >= 4.5, `${theme}.accent-${accent}: --accent-text on ${bg} = ${ratio.toFixed(2)}:1, expected >= 4.5:1`);
      }
      assert.ok(contrast(t['--accent-fg'], t['--accent']) >= 4.5, `${theme}.accent-${accent}: accent foreground must meet AA`);
      assert.ok(contrast(t['--primary-fg'], t['--primary-bg']) >= 4.5, `${theme}.accent-${accent}: primary button text must meet AA`);
    }
  }
});

test('theme swatches use exact bg-base and accent tokens with a vertical 50/50 split', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  // AnuPpuccin Latte/Mocha have their own rainbow-gradient swatch format (see the
  // dedicated test below) — a single fixed --accent color would misrepresent them,
  // since their accent is user-configurable rather than one fixed hue.
  for (const name of ALL_THEMES.filter((n) => !ACCENT_THEMES.includes(n))) {
    const vars = readThemeTokens(css, name);
    for (const k of Object.keys(vars)) vars[k] = vars[k].toUpperCase();
    const swatch = css.match(new RegExp(`\\[data-theme-swatch="${name}"\\]\\{[^}]*background:linear-gradient\\(90deg,([^ ]+) 0 50%,([^ ]+) 50% 100%\\)`));
    assert.ok(swatch, `${name}: swatch must be split vertically 50/50`);
    assert.strictEqual(swatch[1].toUpperCase(), vars['--bg-base'], `${name}: left half must equal --bg-base`);
    assert.strictEqual(swatch[2].toUpperCase(), vars['--accent'], `${name}: right half must equal --accent`);
  }
});

test('AnuPpuccin swatches show a smooth rainbow gradient of all 12 accents, not one fixed color', () => {
  // Запрошено пользователем: свотч AnuPpuccin Latte/Mocha в списке тем не должен
  // показывать один зафиксированный акцент (было — мальва/фиолетовый) — акцент
  // у AnuPpuccin настраиваемый, и свотч должен это отражать. Правая половина —
  // плавный градиент по всем 12 официальным акцентам Catppuccin в порядке
  // ACCENT_NAMES, тем же цветом, что и --accent конкретной связки темы+акцента
  // (html.theme-X.accent-Y в этом же style.css, см. readAccentTokens выше).
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
  for (const theme of ACCENT_THEMES) {
    const baseVars = readThemeTokens(css, theme);
    const swatch = css.match(new RegExp(`\\[data-theme-swatch="${theme}"\\]\\{[^}]*background:linear-gradient\\(90deg,([^)]+)\\)`));
    assert.ok(swatch, `${theme}: swatch gradient not found`);
    const stops = swatch[1].split(',').map((s) => s.trim());
    assert.strictEqual(stops[0].toUpperCase(), `${baseVars['--bg-base'].toUpperCase()} 0 50%`, `${theme}: left half must equal --bg-base`);
    const colorStops = stops.slice(1);
    assert.strictEqual(colorStops.length, ACCENT_NAMES.length, `${theme}: expected one gradient stop per accent (${ACCENT_NAMES.length})`);
    colorStops.forEach((stop, i) => {
      const [hex] = stop.split(' ');
      const expected = readAccentTokens(css, theme, ACCENT_NAMES[i])['--accent'];
      assert.strictEqual(hex.toUpperCase(), expected.toUpperCase(), `${theme}: gradient stop ${i} (${ACCENT_NAMES[i]}) must equal --accent for accent "${ACCENT_NAMES[i]}"`);
    });
    assert.match(colorStops[colorStops.length - 1], /100%$/, `${theme}: gradient must end at 100%`);
  }
});
