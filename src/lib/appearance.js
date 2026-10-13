export const THEMES = [
  { value: 'disk-light', label: 'Светлая', mode: 'light', base: '#FFFFFF', accent: '#FFD43B' },
  { value: 'noch', label: 'Тёмная', mode: 'dark', base: '#080C11', accent: '#5B9BF8' },
];

export const THEME_CHOICES = [
  { value: 'system', label: 'Как в системе' },
  { value: 'disk-light', label: 'Светлая' },
  { value: 'noch', label: 'Тёмная' },
];

const LEGACY_THEME_ALIASES = {
  'anuppuccin-latte': 'disk-light',
  'anuppuccin-mocha': 'noch',
};
const LEGACY_THEME_VALUES = Object.keys(LEGACY_THEME_ALIASES);

export const ACCENT_THEMES = new Set(['disk-light', 'noch', 'system']);
export const ACCENTS = [
  { value: 'red', label: 'Красный', latte: '#D20F39', mocha: '#F38BA8', diskLight: '#FF4D4F', diskDark: '#FF6B6D' },
  { value: 'maroon', label: 'Бордовый', latte: '#E64553', mocha: '#EBA0AC', diskLight: '#CC4A65', diskDark: '#E06B82' },
  { value: 'peach', label: 'Персиковый', latte: '#FE640B', mocha: '#FAB387', diskLight: '#FF8A3D', diskDark: '#FFA15F' },
  { value: 'yellow', label: 'Жёлтый', latte: '#DF8E1D', mocha: '#F9E2AF', diskLight: '#FFD43B', diskDark: '#FFD95A' },
  { value: 'green', label: 'Зелёный', latte: '#40A02B', mocha: '#A6E3A1', diskLight: '#4CAF72', diskDark: '#66C88A' },
  { value: 'teal', label: 'Бирюзовый', latte: '#179299', mocha: '#94E2D5', diskLight: '#26A69A', diskDark: '#45C0B5' },
  { value: 'sky', label: 'Небесный', latte: '#04A5E5', mocha: '#89DCEB', diskLight: '#42A5F5', diskDark: '#64B7FA' },
  { value: 'sapphire', label: 'Сапфировый', latte: '#209FB5', mocha: '#74C7EC', diskLight: '#3584E4', diskDark: '#5B9AF0' },
  { value: 'blue', label: 'Синий', latte: '#1E66F5', mocha: '#89B4FA', diskLight: '#377DFF', diskDark: '#5B95FF' },
  { value: 'lavender', label: 'Лавандовый', latte: '#7287FD', mocha: '#B4BEFE', diskLight: '#7B7FE5', diskDark: '#989BF0' },
  { value: 'mauve', label: 'Мальва', latte: '#8839EF', mocha: '#CBA6F7', diskLight: '#9B59B6', diskDark: '#B574CF' },
  { value: 'pink', label: 'Розовый', latte: '#EA76CB', mocha: '#F5C2E7', diskLight: '#E567A8', diskDark: '#F080BC' },
  { value: 'flamingo', label: 'Фламинго', latte: '#DD7878', mocha: '#F2CDCD', diskLight: '#E2777A', diskDark: '#EF9093' },
  { value: 'rosewater', label: 'Розовая вода', latte: '#DC8A78', mocha: '#F5E0DC', diskLight: '#CF8178', diskDark: '#E19A92' },
  { value: 'slate', label: 'Графитовый', latte: '#586174', mocha: '#A6ADC8', diskLight: '#6B7280', diskDark: '#9298A3' },
];

export const DEFAULT_THEME = 'disk-light';
export const DEFAULT_ACCENT = 'sky';
export const THEME_VALUES = ['system', ...THEMES.map((theme) => theme.value)];
export const ACCENT_VALUES = ACCENTS.map((accent) => accent.value);

let systemThemeCleanup = null;
let currentAppearance = { theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT };

export function normalizeTheme(value) {
  if (THEME_VALUES.includes(value)) return value;
  return LEGACY_THEME_ALIASES[value] || DEFAULT_THEME;
}

export function resolveTheme(value) {
  const normalized = normalizeTheme(value);
  if (normalized !== 'system') return normalized;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'noch';
  return 'disk-light';
}

export function themeMeta(value) {
  const resolved = resolveTheme(value);
  return THEMES.find((theme) => theme.value === resolved) || THEMES[0];
}

export function isDarkTheme(value) {
  return themeMeta(value).mode === 'dark';
}

export function themeSupportsAccent(value) {
  return ACCENT_THEMES.has(normalizeTheme(value));
}

export function readStoredAppearance() {
  let theme = DEFAULT_THEME;
  let accentColor = DEFAULT_ACCENT;
  try {
    const storedTheme = localStorage.getItem('garden-theme');
    const storedAccent = localStorage.getItem('garden-accent');
    theme = normalizeTheme(storedTheme);
    accentColor = ACCENT_VALUES.includes(storedAccent) ? storedAccent : DEFAULT_ACCENT;
  } catch {}
  return { theme, accentColor };
}

function syncSystemThemeListener(preferredTheme) {
  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }
  if (preferredTheme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => applyAppearance(currentAppearance, { persistLocal: false, syncListener: false });
  media.addEventListener?.('change', onChange);
  systemThemeCleanup = () => media.removeEventListener?.('change', onChange);
}

export function applyAppearance(value = {}, options = {}) {
  const root = document.documentElement;
  const preferredTheme = normalizeTheme(value.theme);
  const theme = resolveTheme(preferredTheme);
  const accentColor = ACCENT_VALUES.includes(value.accentColor) ? value.accentColor : DEFAULT_ACCENT;
  const dark = isDarkTheme(theme);
  currentAppearance = { theme: preferredTheme, accentColor };

  [...THEME_VALUES, ...LEGACY_THEME_VALUES].forEach((name) => root.classList.remove(`theme-${name}`));
  ACCENT_VALUES.forEach((name) => root.classList.remove(`accent-${name}`));
  root.classList.remove('dark', 'theme-dark');

  root.classList.add(`theme-${theme}`);
  if (dark) root.classList.add('dark', 'theme-dark');
  if (themeSupportsAccent(preferredTheme)) root.classList.add(`accent-${accentColor}`);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeMeta(theme).base);

  if (options.syncListener !== false) syncSystemThemeListener(preferredTheme);

  if (options.persistLocal !== false) {
    try {
      localStorage.setItem('garden-theme', preferredTheme);
      localStorage.setItem('garden-accent', accentColor);
    } catch {}
  }
  return { theme: preferredTheme, accentColor };
}

export function applyStoredAppearance() {
  return applyAppearance(readStoredAppearance(), { persistLocal: false });
}
