import { describe, it, expect } from 'vitest';
import { validateTheme } from '@/lib/shopify/validate';
import { createZip } from '@/lib/shopify/zip';
import type { ThemeBuild, ThemeFile } from '@/lib/shopify/types';

/**
 * Shopify export tests (AGENTS.md §10/§11): structural validation blocks broken
 * themes, and the ZIP writer produces a real, parseable archive.
 */

const SCHEMA_LIQUID = `{% schema %}{ "name": "Hero", "settings": [] }{% endschema %}`;

function makeBuild(overrides: ThemeFile[] = []): ThemeBuild {
  const files: ThemeFile[] = [
    { path: 'layout/theme.liquid', contents: '<html>{{ content_for_layout }}</html>' },
    { path: 'config/settings_schema.json', contents: '[]' },
    { path: 'config/settings_data.json', contents: '{}' },
    { path: 'templates/index.json', contents: '{"sections":{"hero":{"type":"hero-main"}}}' },
    { path: 'templates/product.json', contents: '{"sections":{"main":{"type":"main-product"}}}' },
    { path: 'templates/collection.json', contents: '{"sections":{"main":{"type":"main-collection"}}}' },
    { path: 'templates/cart.json', contents: '{"sections":{"main":{"type":"main-cart"}}}' },
    { path: 'snippets/meta-tags.liquid', contents: '<meta>' },
    { path: 'sections/hero-main.liquid', contents: `<section>${SCHEMA_LIQUID}</section>` },
    { path: 'sections/main-product.liquid', contents: `<div>${SCHEMA_LIQUID}</div>` },
    { path: 'sections/main-collection.liquid', contents: `<div>${SCHEMA_LIQUID}</div>` },
    { path: 'sections/main-cart.liquid', contents: `<div>${SCHEMA_LIQUID}</div>` },
    { path: 'assets/tailwind.css', contents: '.x{}' },
    { path: 'locales/en.default.json', contents: '{}' },
    { path: 'templates/customers/login.liquid', contents: 'form' },
    ...overrides,
  ];
  return { files, imageUrls: [] };
}

describe('validateTheme', () => {
  it('accepts a complete, valid theme with zero issues', () => {
    expect(validateTheme(makeBuild())).toEqual([]);
  });

  it('flags a missing required file', () => {
    const build = makeBuild();
    build.files = build.files.filter((f) => f.path !== 'layout/theme.liquid');
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file === 'layout/theme.liquid')).toBe(true);
  });

  it('flags an empty required folder', () => {
    const build = makeBuild();
    build.files = build.files.filter((f) => !f.path.startsWith('locales/'));
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file.startsWith('locales/'))).toBe(true);
  });

  it('flags a template referencing a missing section', () => {
    const build = makeBuild();
    const idx = build.files.find((f) => f.path === 'templates/index.json');
    if (idx && typeof idx.contents === 'string') {
      idx.contents = '{"sections":{"hero":{"type":"missing-section"}}}';
    }
    const issues = validateTheme(build);
    expect(issues.some((i) => i.message.includes('missing-section'))).toBe(true);
  });

  it('flags a section missing its {% schema %} block', () => {
    const build = makeBuild([{ path: 'sections/broken.liquid', contents: '<div>no schema</div>' }]);
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file === 'sections/broken.liquid')).toBe(true);
  });

  it('flags invalid JSON in a template', () => {
    const build = makeBuild([{ path: 'templates/custom.json', contents: '{oops' }]);
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file === 'templates/custom.json' && i.message === 'Invalid JSON.')).toBe(true);
  });

  it('flags unsafe absolute zip paths', () => {
    const build = makeBuild([{ path: '/etc/passwd', contents: 'x' }]);
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file === '/etc/passwd')).toBe(true);
  });

  it('flags traversal paths', () => {
    const build = makeBuild([{ path: 'assets/../../secrets.txt', contents: 'x' }]);
    const issues = validateTheme(build);
    expect(issues.some((i) => i.file.includes('..'))).toBe(true);
  });
});

describe('createZip', () => {
  function readEntryNames(bytes: Uint8Array): string[] {
    // Parse the central directory: walk EOCD -> central dir entries.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Find EOCD signature from the end.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(offset, true)).toBe(0x02014b50);
      const nameLen = view.getUint16(offset + 28, true);
      names.push(new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen)));
      offset += 46 + nameLen;
    }
    return names;
  }

  it('produces a zip whose central directory lists every file', () => {
    const files: ThemeFile[] = [
      { path: 'layout/theme.liquid', contents: '<html></html>' },
      { path: 'config/settings_schema.json', contents: '[]' },
      { path: 'assets/logo.png', contents: new Uint8Array([1, 2, 3, 4]) },
    ];
    const bytes = createZip(files);
    // ZIP local file header signature is at offset 0.
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    const names = readEntryNames(bytes);
    expect(names).toEqual([
      'layout/theme.liquid',
      'config/settings_schema.json',
      'assets/logo.png',
    ]);
  });

  it('round-trips file contents through a real unzip path (CRC + stored bytes)', async () => {
    const { execSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync, readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const files: ThemeFile[] = [
      { path: 'sections/hero.liquid', contents: '<section>hello world</section>' },
      { path: 'assets/bin.dat', contents: new Uint8Array([9, 8, 7, 6, 5]) },
    ];
    const bytes = createZip(files);

    const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
    const zipPath = join(dir, 'theme.zip');
    writeFileSync(zipPath, bytes);
    execSync(`unzip -q ${zipPath} -d ${join(dir, 'out')}`);

    expect(readdirSync(join(dir, 'out'))).toEqual(['assets', 'sections']);
    expect(
      readFileSync(join(dir, 'out', 'sections', 'hero.liquid'), 'utf8')
    ).toBe('<section>hello world</section>');
    expect(
      Uint8Array.from(readFileSync(join(dir, 'out', 'assets', 'bin.dat')))
    ).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
  });
});
