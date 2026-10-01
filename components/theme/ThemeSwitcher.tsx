'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, useTheme } from './ThemeProvider';

/**
 * Theme switcher. Shows each theme as its own three-dot preview rather than a
 * generic swatch, so the choice is legible before it is made.
 *
 * Closes on outside click and Escape; the trigger reflects the active theme.
 */
export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = THEMES.find((item) => item.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Theme: ${active.label}. Change theme`}
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg transition hover:border-line-strong"
      >
        <span className="flex gap-1" aria-hidden>
          {active.swatch.map((color) => (
            <span
              key={color}
              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
        <span className="hidden sm:inline">{active.label}</span>
        <Palette size={15} strokeWidth={1.9} className="text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-[var(--app-shadow-lg)]"
        >
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            UI mode
          </p>
          {THEMES.map((item) => {
            const selected = item.id === theme;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setTheme(item.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-elevated"
              >
                <span className="flex shrink-0 gap-1" aria-hidden>
                  {item.swatch.map((color) => (
                    <span
                      key={color}
                      className="h-5 w-5 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-fg">{item.label}</span>
                  <span className="block text-[12px] text-muted">{item.hint}</span>
                </span>
                {selected && <Check size={15} strokeWidth={3} className="shrink-0 text-accent-text" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
