import { describe, it, expect } from 'vitest';
import { applyPatchOperations, sanitizePatchOperations } from '@/lib/ai/patch';
import type { PatchOperation } from '@/lib/ai/events';

/**
 * Scoped-edit tests (AGENTS.md §8: edits are structured operations applied
 * in place — the page is never regenerated for a small change).
 */

const PAGE = `
<section data-builder-section-id="hero-main" class="p-8">
  <h1 data-builder-element-id="hero-heading">Old heading</h1>
  <p data-builder-element-id="hero-sub">Subtitle</p>
  <img data-builder-element-id="hero-img" src="https://images.unsplash.com/old.jpg" alt="old">
  <a data-builder-element-id="hero-cta" href="/products">Shop</a>
</section>
<footer data-builder-section-id="site-footer">Footer</footer>`;

describe('applyPatchOperations', () => {
  it('set_text replaces text content of the target', () => {
    const ops: PatchOperation[] = [
      { op: 'set_text', targetId: 'hero-heading', text: 'New heading' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).toContain('New heading');
    expect(out).not.toContain('Old heading');
    // Sibling content untouched.
    expect(out).toContain('Subtitle');
  });

  it('set_classes replaces the class list only', () => {
    const ops: PatchOperation[] = [
      { op: 'set_classes', targetId: 'hero-main', className: 'p-12 bg-white' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).toContain('class="p-12 bg-white"');
    expect(out).not.toContain('p-8"');
  });

  it('set_attribute updates a single attribute', () => {
    const ops: PatchOperation[] = [
      { op: 'set_attribute', targetId: 'hero-cta', name: 'href', value: '/collections/all' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).toContain('href="/collections/all"');
  });

  it('replace_inner swaps the children of the target', () => {
    const ops: PatchOperation[] = [
      { op: 'replace_inner', targetId: 'site-footer', html: '<p>New footer</p>' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).toContain('New footer');
    expect(out).not.toContain('Footer');
  });

  it('replace_outer swaps the whole element', () => {
    const ops: PatchOperation[] = [
      {
        op: 'replace_outer',
        targetId: 'hero-sub',
        html: '<p data-builder-element-id="hero-sub">Brand new subtitle</p>',
      },
    ];
    const out = applyPatchOperations(PATCHED_PAGE_OUTER, ops);
    expect(out).toContain('Brand new subtitle');
  });

  it('matches targets by section id too', () => {
    const ops: PatchOperation[] = [
      { op: 'set_text', targetId: 'site-footer', text: '© 2026' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).toContain('© 2026');
  });

  it('skips unknown target ids and preserves the rest of the page', () => {
    const ops: PatchOperation[] = [
      { op: 'set_text', targetId: 'does-not-exist', text: 'ghost' },
      { op: 'set_text', targetId: 'hero-heading', text: 'Still works' },
    ];
    const out = applyPatchOperations(PAGE, ops);
    expect(out).not.toContain('ghost');
    expect(out).toContain('Still works');
  });

  it('returns the html unchanged when no ops are given', () => {
    expect(applyPatchOperations(PAGE, [])).toBe(PAGE);
  });
});

// Helper page with the exact element replace_outer expects, so the test is
// independent of DOM serialization quirks.
const PATCHED_PAGE_OUTER = `
<section data-builder-section-id="hero-main" class="p-8">
  <h1 data-builder-element-id="hero-heading">Old heading</h1>
  <p data-builder-element-id="hero-sub">Subtitle</p>
</section>`;

describe('sanitizePatchOperations', () => {
  it('sanitizes html inside replace ops (strips scripts)', () => {
    const ops = sanitizePatchOperations([
      { op: 'replace_inner', targetId: 'x', html: '<p>ok</p><script>alert(1)</script>' },
    ]);
    expect(JSON.stringify(ops)).not.toContain('script');
    expect(JSON.stringify(ops)).toContain('<p>ok</p>');
  });

  it('neutralizes unsafe urls in set_attribute src/href', () => {
    const ops = sanitizePatchOperations([
      { op: 'set_attribute', targetId: 'x', name: 'href', value: 'javascript:alert(1)' },
      { op: 'set_attribute', targetId: 'x', name: 'src', value: 'data:text/html,<h1>x</h1>' },
    ]);
    expect(ops.every((op) => op.op !== 'set_attribute' || op.value === '#')).toBe(true);
  });

  it('lets safe values through untouched', () => {
    const ops = sanitizePatchOperations([
      { op: 'set_attribute', targetId: 'x', name: 'href', value: '/products/1' },
      { op: 'set_text', targetId: 'y', text: 'plain text' },
    ]);
    expect(ops).toHaveLength(2);
  });
});
