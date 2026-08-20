import { useEffect, useState } from 'react';

const STORAGE_KEY = 'watermonkey-theme';
const VALID = ['system', 'light', 'dark'];

function resolveIsDark(theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', resolveIsDark(theme));
}

/**
 * System/light/dark theme selection (SPEC §6.13), persisted locally. Applies
 * the `dark` class Tailwind's `dark:` variants already key off of throughout
 * the app — no component styling changes needed, just something that
 * actually toggles the class.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(stored) ? stored : 'system';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return [theme, setThemeState];
}
