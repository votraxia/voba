/**
 * Unsplash image handling inside the sanitize pipeline (replaces ImageKit).
 *
 * The model emits each image with a `data-image-prompt` attribute describing
 * the ideal photo and a placeholder `src`. The ASYNC resolution to real
 * Unsplash photos happens server-side in `unsplash-server.ts` (search API with
 * caching); this module holds the SYNCHRONOUS pieces that run inside
 * `sanitizeGeneratedHtml` on every path (streaming preview, final document,
 * patched HTML, inline edits):
 *
 * - strips `data-image-prompt` markers once consumed so persisted HTML stays
 *   clean (the prompt text is preserved in `data-image-alt-prompt` for re-search);
 * - leaves real image URLs (Unsplash hotlinks, user-pasted URLs, data: URIs)
 *   untouched, so re-sanitizing edited HTML is safe and idempotent.
 */

import { isUnsplashImageUrl, withUnsplashSize } from './unsplash';

const PLACEHOLDER_HOST = /(images\.unsplash\.com|picsum\.photos|placehold|via\.placeholder)/i;

function attr(tag: string, name: string): string | null {
  const m =
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) ||
    new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  return m ? m[1] : null;
}

function hasUnresolvedPrompt(tag: string): boolean {
  const src = attr(tag, 'src') ?? '';
  if (src.startsWith('data:')) return false;
  if (isUnsplashImageUrl(src)) return false;
  return PLACEHOLDER_HOST.test(src) || Boolean(attr(tag, 'data-image-prompt'));
}

/**
 * Synchronous image pass for the sanitizer. Marks model-requested images that
 * still carry a placeholder `src` with `data-unsplash-pending` so the preview
 * can show a tasteful loading state, and records the prompt in
 * `data-image-prompt` (kept for the async resolver and re-resolution later).
 *
 * This pass never performs network I/O and never invents URLs.
 */
export function applyUnsplashToHtml(html: string): string {
  if (!html || !/<img\b/i.test(html)) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!hasUnresolvedPrompt(tag)) return tag;
    // Normalize the marker attribute casing and drop width/height-less
    // placeholders' explicit sizes only when obviously bogus.
    const prompt = attr(tag, 'data-image-prompt') ?? attr(tag, 'alt') ?? '';
    let next = tag;
    if (prompt && !attr(next, 'data-image-prompt')) {
      next = next.replace(/^<img/i, `<img data-image-prompt="${prompt.replace(/"/g, '&quot;')}"`);
    }
    if (!attr(next, 'data-unsplash-pending')) {
      next = next.replace(/^<img/i, '<img data-unsplash-pending="1"');
    }
    return next;
  });
}

/** True when the tag is a model-requested image awaiting resolution. */
export function isPendingUnsplashImage(tag: string): boolean {
  return attr(tag, 'data-unsplash-pending') === '1' && Boolean(attr(tag, 'data-image-prompt'));
}

export { withUnsplashSize };
