import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Palette guard (AGENTS.md §17: keep the styling system coherent).
 *
 * The app expresses colour through semantic tokens, so a literal hex in a
 * component is almost always drift — the palette drifted once already, when
 * 215 hardcoded values were replaced by tokens and a few survivors remained in
 * sidebar, chat and billing surfaces.
 *
 * This test fails on any NEW literal colour so drift can't silently return.
 * A short allow-list covers the three categories that legitimately need one:
 *   - macOS window dots in the mock browser chrome,
 *   - Google's brand colours on the sign-in button,
 *   - the Clayhouse storefront, which is a simulated CUSTOMER theme rendered
 *     inside our mock UI — it has its own brand and is not SaaS chrome.
 */

const ROOTS = ['app', 'components'];

/** Files allowed to contain literal colours, with the reason. */
const ALLOW: Record<string, string> = {
  'components/GoogleButton.tsx': 'Google brand colours on the sign-in button',
  'components/theme/ThemeProvider.tsx': 'defines the theme swatch previews',
  'components/landing/ProcessWalkthrough.tsx': 'Clayhouse mock storefront',
  'components/landing/FeatureShowcase.tsx': 'mock UI fragments + window dots',
  'components/landing/PageShowcase.tsx': 'Clayhouse mock storefront',
};

/**
 * macOS window chrome appears in several mock frames, not just one file, so it
 * is matched by value rather than by allow-listing every file that draws it.
 * These three are OS chrome, not brand colour.
 */
const WINDOW_DOTS = /#(ff5f57|febc2e|28c840)\b/gi;

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (full.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/** Matches hex colours and rgb()/rgba(), but not hex inside an Unsplash URL. */
const COLOR = /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;

describe('colour palette', () => {
  it('uses no literal colours outside the allow-list', () => {
    const violations: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const rel = file.replace(/\\/g, '/');
        if (ALLOW[rel]) continue;

        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          // Unsplash URLs are photography, not palette.
          if (line.includes('images.unsplash.com')) return;
          const hits = line.replace(WINDOW_DOTS, '').match(COLOR);
          if (hits) violations.push(`${rel}:${i + 1} → ${hits.join(', ')}`);
        });
      }
    }

    expect(violations, `literal colours found:\n${violations.join('\n')}`).toEqual([]);
  });

  it('has no nested var() in arbitrary values', () => {
    // A catch-all replacement once ran over its own output and produced
    // `shadow-[var(--app-shadow-[var(--app-shadow-sm)])]`. That is invalid CSS
    // and took down every route, so it is guarded explicitly.
    const bad: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const rel = file.replace(/\\/g, '/');
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/\w-\[[^\]]*\[/.test(line)) bad.push(`${rel}:${i + 1}`);
          });
      }
    }

    expect(bad, `nested arbitrary value:\n${bad.join('\n')}`).toEqual([]);
  });
});