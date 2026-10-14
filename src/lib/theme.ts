export type ThemePref = 'system' | 'light' | 'dark';

export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem('fw-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem('fw-theme', pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

/** Keep "system" in sync when the OS switches between light and dark. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
