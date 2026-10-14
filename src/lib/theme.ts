// Appearance settings: theme, accent color, text size, contrast, corner style and motion.
// Stored per device in localStorage and applied to <html> as a class (dark) and data attributes
// that index.css reads. public/theme-init.js applies the same values before the first paint.
export type ThemePref = 'system' | 'light' | 'dark';
export type Accent = 'leaf' | 'lime' | 'steel' | 'slate';
export type TextSize = 'default' | 'large' | 'xl';
export type Contrast = 'standard' | 'high';
export type Corners = 'rounded' | 'square';
export type MotionPref = 'system' | 'reduce';

export interface Appearance {
  theme: ThemePref;
  accent: Accent;
  text: TextSize;
  contrast: Contrast;
  corners: Corners;
  motion: MotionPref;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', accent: 'leaf', text: 'default', contrast: 'standard', corners: 'rounded', motion: 'system' };

export const ACCENTS: Array<{ id: Accent; label: string; light: string; dark: string }> = [
  // The default: leaf green in light mode, the brighter sprout green in dark mode.
  { id: 'leaf', label: 'Fresh green', light: '#6baa75', dark: '#84dd63' },
  { id: 'lime', label: 'Lime', light: '#cbff4d', dark: '#cbff4d' },
  { id: 'steel', label: 'Steel', light: '#69747c', dark: '#69747c' },
  { id: 'slate', label: 'Charcoal', light: '#545454', dark: '#545454' },
];

const KEY = 'fw-appearance';
const OPTIONS: { [K in keyof Appearance]: readonly Appearance[K][] } = {
  theme: ['system', 'light', 'dark'],
  accent: ['leaf', 'lime', 'steel', 'slate'],
  text: ['default', 'large', 'xl'],
  contrast: ['standard', 'high'],
  corners: ['rounded', 'square'],
  motion: ['system', 'reduce'],
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

export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  const dark = a.theme === 'dark' || (a.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  const attrs: Record<string, string | null> = {
    'data-accent': a.accent === 'leaf' ? null : a.accent,
    'data-text': a.text === 'default' ? null : a.text,
    'data-contrast': a.contrast === 'high' ? 'high' : null,
    'data-corners': a.corners === 'square' ? 'square' : null,
    'data-motion': a.motion === 'reduce' ? 'reduce' : null,
  };
  for (const [name, value] of Object.entries(attrs)) {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  }
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
