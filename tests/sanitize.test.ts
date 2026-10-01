import { describe, it, expect } from 'vitest';
import { sanitizeGeneratedHtml, sanitizeThemeCss } from '@/lib/ai/sanitize';

/**
 * Sanitizer tests (AGENTS.md §9: generated storefront code is untrusted).
 * These verify the exact vectors the product spec calls out: scripts, event
 * handlers, javascript:/data:text/html URLs, and stray <style> blocks.
 */
describe('sanitizeGeneratedHtml', () => {
  it('removes script blocks and lone script tags', () => {
    const html = '<p>ok</p><script>alert(1)</script><script src="https://evil.example/x.js"></script>';
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).not.toContain('<script');
    expect(clean).toContain('<p>ok</p>');
  });

  it('strips inline event handlers', () => {
    const html = '<img src="a.jpg" onerror="alert(1)"><div onclick="steal()">x</div><a href="#" onmouseover=track()>y</a>';
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).not.toMatch(/on(error|click|mouseover)/i);
  });

  it('neutralizes javascript: and data:text/html URLs', () => {
    const html = '<a href="javascript:alert(1)">x</a><iframe src="data:text/html,<h1>bad"></iframe>';
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('data:text/html');
  });

  it('removes style blocks but keeps markup', () => {
    const html = '<section class="p-4"><style>.x{color:red}</style><h1>Hi</h1></section>';
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).not.toContain('<style');
    expect(clean).toContain('<h1>Hi</h1>');
  });

  it('strips markdown code fences the model may emit', () => {
    const html = '```html\n<p>hello</p>\n```';
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).toBe('<p>hello</p>');
  });

  it('keeps safe markup untouched', () => {
    const html = '<section data-builder-section-id="hero-main" class="p-8"><h1 data-builder-element-id="h">Hello</h1></section>';
    expect(sanitizeGeneratedHtml(html)).toContain('data-builder-section-id="hero-main"');
  });
});

describe('sanitizeThemeCss', () => {
  it('removes @import fetches', () => {
    const css = '@import url("https://evil.example/x.css");\n:root{--brand:#f00}';
    const clean = sanitizeThemeCss(css);
    expect(clean).not.toContain('@import');
    expect(clean).toContain('--brand:#f00');
  });

  it('neutralizes expression() and javascript: vectors', () => {
    const css = '.x{width:expression(alert(1));background:url("javascript:alert(2)")}';
    const clean = sanitizeThemeCss(css);
    expect(clean).not.toContain('expression(');
    expect(clean).not.toContain('javascript:');
  });

  it('strips <style> wrappers and code fences', () => {
    const css = '```css\n<style>:root{--brand:#000}</style>\n```';
    const clean = sanitizeThemeCss(css);
    expect(clean).toBe(':root{--brand:#000}');
  });
});
