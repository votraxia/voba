'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme selection (obsidian · porcelain · cobalt).
 *
 * The three palettes are pure CSS — swapping `data-theme` on <html> re-points
 * every semantic token (see app/globals.css), so no component re-renders or
 * re-fetches to change appearance.
 *
 * FOUC is prevented by an inline script in the root layout that writes the
 * attribute before first paint; this provider only keeps React in sync with it
 * and persists the choice.
 */

export const THEMES = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    hint: 'Dark & focused',
    // The three dots that actually preview each palette.
    swatch: ['#0d0f0e', '#1c201d', '#c7f36b'],
  },
  {
    id: 'porcelain',
    label: 'Porcelain',
    hint: 'Light & calm',
    swatch: ['#f5f3ee', '#ffffff', '#5f8f12'],
  },
  {
    id: 'cobalt',
    label: 'Midnight Cobalt',
    hint: 'Bold & technical',
    swatch: ['#0a1220', '#16243c', '#ff8a3d'],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'obsidian';
const STORAGE_KEY = 'theme-builder:theme';

/** Narrow an untrusted stored value to a known theme id. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

interface ThemeValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the attribute the no-flash script already set, so the first
  // client render matches the DOM and React doesn't report a mismatch.
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document === 'undefined') return DEFAULT_THEME;
    const current = document.documentElement.getAttribute('data-theme');
    return isThemeId(current) ? current : DEFAULT_THEME;
  });

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / blocked storage — the theme still applies for this
      // session, it just won't be remembered.
    }
  }, []);

  // Follow the OS only while the visitor hasn't chosen for themselves.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setTheme('porcelain');
      else setTheme('obsidian');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [setTheme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

/**
 * Runs before paint to set the stored theme, preventing a flash of the default
 * palette. Kept as a string so the root layout can inline it.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='obsidian'&&t!=='porcelain'&&t!=='cobalt'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'porcelain':'obsidian';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;
