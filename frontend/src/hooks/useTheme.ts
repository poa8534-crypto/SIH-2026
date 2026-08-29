import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme_override';

/**
 * Stamps `data-theme` on <html>, which is what the palette in index.css
 * keys off. Previously this toggled a `.light` class while the stylesheet
 * scoped light values to `:root.light`; the attribute is used now so both
 * themes are addressable by the same mechanism and neither is the implicit
 * default in CSS.
 */
function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Drop the class the previous implementation left behind, so a stale
  // value in a hot-reloaded page cannot keep overriding the attribute.
  document.documentElement.classList.remove('light');
}

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // private mode / storage disabled
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? 'light');

  // Apply on mount and whenever the theme changes, so the attribute is
  // present before first paint of the shell rather than one tick later.
  useEffect(() => {
    apply(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* not fatal — the theme still applies for this session */
      }
      return next;
    });
  };

  return { theme, toggleTheme };
}
