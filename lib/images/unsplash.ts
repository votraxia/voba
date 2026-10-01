/**
 * Unsplash image URL helpers (replaces ImageKit as the image layer).
 *
 * Isomorphic on purpose: the URL builders run in the route handler (rewriting
 * generated HTML), in the client, and mirrored inside the sandboxed preview
 * iframe. This module deals ONLY with public `images.unsplash.com` delivery
 * URLs — it never touches the API access key, which stays server-only.
 *
 * Unsplash API facts (https://unsplash.com/documentation):
 * - The API REQUIRES hotlinking: use the `images.unsplash.com` URLs the API
 *   returns and keep their `ixid` parameter (it reports photo views to the
 *   photographer — removing it violates the API Guidelines).
 * - Image URLs are dynamically resizable via imgix params (`w`, `h`, `fit`,
 *   `crop`, `dpr`, `fm`, `q`, `auto=format`) — no API call needed.
 * - Attribution is REQUIRED: photo credit ("Photo by <name> on Unsplash")
 *   must be shown near the photo or in a credits section.
 * - Search API rate limits: 50 requests/hour on demo keys (1000 in
 *   production) — so results MUST be cached server-side.
 */

/** True when a URL points at Unsplash's public image CDN. */
export function isUnsplashImageUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\/([a-z0-9-]+\.)?images\.unsplash\.com\//i.test(url);
}

/** True when a URL is an Unsplash photo page (unsplash.com/photos/...). */
export function isUnsplashPhotoPageUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\/unsplash\.com\/photos\//i.test(url);
}

/**
 * Apply a dynamic-resize transformation to an Unsplash image URL while
 * preserving the required `ixid`/`ixlib` tracking params. Safe to call with
 * non-Unsplash URLs (returns them unchanged).
 */
export function withUnsplashSize(url: string, width?: number, height?: number): string {
  if (!url || !isUnsplashImageUrl(url)) return url;
  try {
    const parsed = new URL(url);
    if (width && width > 0) parsed.searchParams.set('w', String(Math.round(width)));
    if (height && height > 0) parsed.searchParams.set('h', String(Math.round(height)));
    // Sensible defaults that keep crops looking right at any aspect.
    if ((width && height) || parsed.searchParams.has('h')) {
      parsed.searchParams.set('fit', 'crop');
    }
    parsed.searchParams.set('q', parsed.searchParams.get('q') ?? '80');
    parsed.searchParams.set('auto', parsed.searchParams.get('auto') ?? 'format');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Filesystem-safe, readable filename slug for an image prompt. */
export function slugifyImageName(text: string): string {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'image';
}

/** Extract a compact search query from a long, vivid image description. */
export function searchQueryFromPrompt(prompt: string): string {
  // Keep it keyword-like: strip filler words, cap length so the search API
  // gets a focused query rather than a sentence.
  const cleaned = (prompt || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(
      /\b(with|and|the|a|an|of|on|in|for|to|by|photo|image|picture|style|lighting|soft|shadows?|mood|setting)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'storefront product').slice(0, 80).trim();
}
