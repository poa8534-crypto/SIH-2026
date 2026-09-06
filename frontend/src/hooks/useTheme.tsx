import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { readStored, writeStored } from '../lib/storage';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme_override';

/**
 * Stamps `data-theme` on <html>, which is what the palette in index.css
 * keys off. Also syncs the .dark and .light classes for any native Tailwind utilities.
 */
function apply(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }
}

function stored(): Theme | null {
  const value = readStored(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => stored() ?? 'light');

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    writeStored(STORAGE_KEY, next);
    apply(next);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;

  // Safe fallback for isolated unit tests or render trees without ThemeProvider
  const currentTheme = stored() ?? 'light';
  return {
    theme: currentTheme,
    toggleTheme: () => {
      const next = currentTheme === 'dark' ? 'light' : 'dark';
      writeStored(STORAGE_KEY, next);
      apply(next);
    },
    setTheme: (next: Theme) => {
      writeStored(STORAGE_KEY, next);
      apply(next);
    },
  };
}
