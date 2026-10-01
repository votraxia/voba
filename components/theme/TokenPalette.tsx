'use client';

import { THEMES, useTheme } from './ThemeProvider';

/**
 * Live token browser for the design system page.
 *
 * Swatches read their colour from the actual CSS custom property, so this
 * doubles as a regression check: switch themes and the whole palette repaints.
 * It replaces the old hardcoded coral ramp, which had drifted from the real
 * values.
 */

interface TokenGroup {
  title: string;
  tokens: { name: string; varName: string; note?: string }[];
}

const GROUPS: TokenGroup[] = [
  {
    title: 'Surfaces',
    tokens: [
      { name: 'Background', varName: '--app-bg' },
      { name: 'Surface', varName: '--app-surface' },
      { name: 'Card', varName: '--app-card' },
      { name: 'Elevated', varName: '--app-elevated' },
      { name: 'Line', varName: '--app-line' },
      { name: 'Line strong', varName: '--app-line-strong' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { name: 'Foreground', varName: '--app-fg' },
      { name: 'Secondary', varName: '--app-fg-2' },
      { name: 'Muted', varName: '--app-muted' },
      { name: 'On accent', varName: '--app-accent-fg' },
    ],
  },
  {
    title: 'Accent & status',
    tokens: [
      { name: 'Accent', varName: '--app-accent' },
      { name: 'Accent hover', varName: '--app-accent-hover' },
      { name: 'Success', varName: '--app-success' },
      { name: 'Warning', varName: '--app-warning' },
      { name: 'Danger', varName: '--app-danger' },
      { name: 'Info', varName: '--app-info' },
    ],
  },
];

export default function TokenPalette() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      {/* Theme selector — the palette below reflects whichever is active */}
      <div className="mb-8 flex flex-wrap gap-3">
        {THEMES.map((item) => {
          const active = item.id === theme;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-base border px-4 py-3 text-left transition ${
                active
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-card hover:border-line-strong'
              }`}
            >
              <span className="flex gap-1" aria-hidden>
                {item.swatch.map((color) => (
                  <span
                    key={color}
                    className="h-6 w-6 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span>
                <span className="block text-sm font-semibold text-fg">{item.label}</span>
                <span className="block text-xs text-muted">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="mb-10">
          <h3 className="text-h4 mb-4 text-fg">{group.title}</h3>
          <div className="flex flex-wrap gap-4">
            {group.tokens.map((token) => (
              <div key={token.varName} className="text-center">
                <div
                  className="mb-2 h-16 w-16 rounded-base shadow-[var(--app-shadow-sm)] ring-1 ring-black/5"
                  style={{ backgroundColor: `var(${token.varName})` }}
                />
                <p className="font-mono text-xs text-fg-2">{token.name}</p>
                <p className="font-mono text-[11px] text-muted">{token.varName}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
