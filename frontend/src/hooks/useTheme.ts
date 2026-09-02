import { useState, useEffect } from 'react';
import { readStored, writeStored } from '../lib/storage';

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
  // Guarded read — see lib/storage.ts. Private mode and blocked site data both
  // throw here, and a theme preference is not worth a white screen.
  const value = readStored(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
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
      // Not fatal — the theme still applies for this session if it cannot be
      // persisted; only the preference across reloads is lost.
      writeStored(STORAGE_KEY, next);
      return next;
    });
  };

  return { theme, toggleTheme };
}
