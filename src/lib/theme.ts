// Appearance settings: theme, accent color, font, text size, spacing, contrast, corner style and motion.
// Stored per device in localStorage and applied to <html> as a class (dark) and data attributes
// that index.css reads. public/theme-init.js applies the same values before the first paint.
export type ThemePref = 'system' | 'light' | 'dark' | 'grey' | 'graphite' | 'green' | 'forest' | 'mono';
export type Accent = 'leaf' | 'green' | 'lime' | 'steel' | 'slate';
export type FontPref = 'system' | 'nunito' | 'atkinson' | 'lexend' | 'serif' | 'mono';
export type TextSize = 'default' | 'large' | 'xl';
export type Spacing = 'normal' | 'wide';
export type Contrast = 'standard' | 'high';
export type Corners = 'rounded' | 'square';
export type MotionPref = 'system' | 'reduce';

export interface Appearance {
  theme: ThemePref;
  accent: Accent;
  font: FontPref;
  text: TextSize;
  spacing: Spacing;
  contrast: Contrast;
  corners: Corners;
  motion: MotionPref;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  accent: 'leaf',
  font: 'system',
  text: 'default',
  spacing: 'normal',
  contrast: 'standard',
  corners: 'rounded',
  motion: 'system',
};

/** The colors here are only for the previews in Settings; the real palettes are in index.css. */
export const THEMES: Array<{ id: ThemePref; label: string; hint: string; dark: boolean | null; bg: string; surface: string; fg: string; accent: string }> = [
  { id: 'system', label: 'Match device', hint: 'Light or dark, like your device', dark: null, bg: '#ffffff', surface: '#181b19', fg: '#141714', accent: '#6baa75' },
  { id: 'light', label: 'Light', hint: 'Clean and bright', dark: false, bg: '#ffffff', surface: '#ffffff', fg: '#141714', accent: '#6baa75' },
  { id: 'dark', label: 'Dark', hint: 'Easy on the eyes at night', dark: true, bg: '#0f110f', surface: '#181b19', fg: '#ffffff', accent: '#84dd63' },
  { id: 'grey', label: 'Grey', hint: 'Soft light grey', dark: false, bg: '#eceeef', surface: '#f8f9f9', fg: '#141714', accent: '#6baa75' },
  { id: 'graphite', label: 'Graphite', hint: 'Dark grey', dark: true, bg: '#232526', surface: '#2e3133', fg: '#ffffff', accent: '#84dd63' },
  { id: 'green', label: 'Green', hint: 'Fresh, light green', dark: false, bg: '#e9f3eb', surface: '#f8fcf8', fg: '#132016', accent: '#6baa75' },
  { id: 'forest', label: 'Dark green', hint: 'Deep forest green', dark: true, bg: '#0b1a10', surface: '#12271a', fg: '#ffffff', accent: '#84dd63' },
  { id: 'mono', label: 'Mono', hint: 'Black and white only', dark: false, bg: '#ffffff', surface: '#ffffff', fg: '#000000', accent: '#141714' },
];

export const ACCENTS: Array<{ id: Accent; label: string; light: string | null; dark: string | null }> = [
  // The theme's own accent: green in most themes, black in Mono.
  { id: 'leaf', label: 'Theme default', light: null, dark: null },
  { id: 'green', label: 'Fresh green', light: '#6baa75', dark: '#84dd63' },
  { id: 'lime', label: 'Lime', light: '#cbff4d', dark: '#cbff4d' },
  { id: 'steel', label: 'Steel', light: '#69747c', dark: '#69747c' },
  { id: 'slate', label: 'Charcoal', light: '#545454', dark: '#545454' },
];

/** Fonts. The three web fonts are bundled with the app and only downloaded when picked. */
export const FONTS: Array<{ id: FontPref; label: string; hint: string; stack: string }> = [
  { id: 'system', label: 'System font', hint: 'Your device default', stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'nunito', label: 'Nunito', hint: 'Rounded and friendly', stack: "'Nunito Variable', ui-rounded, system-ui, sans-serif" },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', hint: 'Designed for low vision', stack: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { id: 'lexend', label: 'Lexend', hint: 'Made for easier reading', stack: "'Lexend Variable', system-ui, sans-serif" },
  { id: 'serif', label: 'Serif', hint: 'Classic, like a book', stack: "ui-serif, Georgia, Cambria, 'Times New Roman', serif" },
  { id: 'mono', label: 'Monospace', hint: 'Typewriter style', stack: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', Menlo, Consolas, monospace" },
];

const KEY = 'fw-appearance';
const OPTIONS: { [K in keyof Appearance]: readonly Appearance[K][] } = {
  theme: ['system', 'light', 'dark', 'grey', 'graphite', 'green', 'forest', 'mono'],
  accent: ['leaf', 'green', 'lime', 'steel', 'slate'],
  font: ['system', 'nunito', 'atkinson', 'lexend', 'serif', 'mono'],
  text: ['default', 'large', 'xl'],
  spacing: ['normal', 'wide'],
  contrast: ['standard', 'high'],
  corners: ['rounded', 'square'],
  motion: ['system', 'reduce'],
};

// Browser toolbar color (Android, installed app) for each theme; "system" keeps the two defaults in index.html.
const TOOLBAR: Partial<Record<ThemePref, string>> = {
  light: '#ffffff',
  dark: '#0f110f',
  grey: '#eceeef',
  graphite: '#232526',
  green: '#e9f3eb',
  forest: '#0b1a10',
  mono: '#ffffff',
};

export function getAppearance(): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Appearance, string>>;
    // Older versions stored only the theme.
    const legacy = localStorage.getItem('fw-theme');
    if (!saved.theme && legacy) saved.theme = legacy;
    for (const k of Object.keys(OPTIONS) as Array<keyof Appearance>) {
      const v = saved[k];
      if (v && (OPTIONS[k] as readonly string[]).includes(v)) (out as unknown as Record<string, string>)[k] = v;
    }
  } catch {
    // storage blocked or corrupt: defaults
  }
  return out;
}

export function isDarkTheme(theme: ThemePref): boolean {
  const t = THEMES.find((x) => x.id === theme);
  return t?.dark ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  root.classList.toggle('dark', isDarkTheme(a.theme));
  const attrs: Record<string, string | null> = {
    'data-theme': a.theme === 'system' || a.theme === 'light' || a.theme === 'dark' ? null : a.theme,
    'data-accent': a.accent === 'leaf' ? null : a.accent,
    'data-font': a.font === 'system' ? null : a.font,
    'data-text': a.text === 'default' ? null : a.text,
    'data-spacing': a.spacing === 'wide' ? 'wide' : null,
    'data-contrast': a.contrast === 'high' ? 'high' : null,
    'data-corners': a.corners === 'square' ? 'square' : null,
    'data-motion': a.motion === 'reduce' ? 'reduce' : null,
  };
  for (const [name, value] of Object.entries(attrs)) {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  }
  const toolbar = TOOLBAR[a.theme];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.default ??= m.content;
    m.content = toolbar ?? m.dataset.default;
  });
}

export function setAppearance(patch: Partial<Appearance>): Appearance {
  const next = { ...getAppearance(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem('fw-theme', next.theme);
  } catch {
    /* ignore */
  }
  applyAppearance(next);
  return next;
}

export function getThemePref(): ThemePref {
  return getAppearance().theme;
}

export function setThemePref(pref: ThemePref): void {
  setAppearance({ theme: pref });
}

/** Keep "system" in sync when the OS switches between light and dark. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const a = getAppearance();
    if (a.theme === 'system') applyAppearance(a);
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
