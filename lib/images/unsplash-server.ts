import 'server-only';

import { searchQueryFromPrompt, withUnsplashSize } from './unsplash';

/**
 * Server-only Unsplash photo resolver (AGENTS.md §15: API keys never reach the
 * browser). The AI emits `data-image-prompt` descriptions; this module turns
 * each prompt into a real, hotlink-safe Unsplash photo URL via the search API.
 *
 * Caching is essential: demo keys allow 50 API requests/hour, so identical
 * prompts are served from a per-process TTL cache. The cache is best-effort —
 * on any failure the caller falls back to the model's original placeholder.
 */

const API_BASE = 'https://api.unsplash.com';
const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? '';

/** Cache TTL (ms) — search results are stable for short sessions. */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Max cached queries; LRU-ish eviction keeps memory bounded. */
const CACHE_MAX_ENTRIES = 500;

interface CachedResult {
  /** Original raw URL (resized per-request at read time). */
  rawUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoUrl: string;
  expiresAt: number;
}

const searchCache = new Map<string, CachedResult>();

export interface UnsplashPhoto {
  /** Hotlink-safe image URL sized for the slot (ixid preserved). */
  url: string;
  /** Full-resolution original (for export/credits). */
  rawUrl: string;
  /** Photographer display name, e.g. "Ante Samarzija". */
  photographerName: string;
  /** Link to the photographer's Unsplash profile (attribution requirement). */
  photographerUrl: string;
  /** Unsplash photo page. */
  photoUrl: string;
}

function pruneCache(now: number): void {
  for (const [key, entry] of searchCache) {
    if (entry.expiresAt <= now) searchCache.delete(key);
  }
  // Evict oldest entries when still over the cap.
  while (searchCache.size > CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

/** True when the Unsplash search API is usable (key configured). */
export function isUnsplashConfigured(): boolean {
  return ACCESS_KEY.length > 0;
}

/**
 * Search Unsplash for the best photo matching a natural-language prompt.
 * Returns null on any failure (rate limit, network, no results) — callers must
 * degrade gracefully.
 */
export async function searchUnsplashPhoto(
  prompt: string,
  options: { width?: number; height?: number; orientation?: 'landscape' | 'portrait' | 'squarish' } = {}
): Promise<UnsplashPhoto | null> {
  if (!ACCESS_KEY) return null;

  const query = searchQueryFromPrompt(prompt);
  const cacheKey = `${query}|${options.orientation ?? 'landscape'}`;
  const now = Date.now();

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached,
      url: withUnsplashSize(cached.rawUrl, options.width, options.height),
    };
  }
  pruneCache(now);

  try {
    const params = new URLSearchParams({
      query,
      per_page: '5',
      orientation: options.orientation ?? 'landscape',
      content_filter: 'high',
    });
    const res = await fetch(`${API_BASE}/search/photos?${params.toString()}`, {
      headers: {
        Authorization: `Client-ID ${ACCESS_KEY}`,
        'Accept-Version': 'v1',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // 403/429 → rate limit or permission issue; do not hammer the API.
      return null;
    }

    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        width: number;
        height: number;
        urls: { raw: string; full: string; regular: string; small: string; thumb: string };
        user: { name: string; links: { html: string } };
        links: { html: string };
      }>;
    };

    const results = data.results ?? [];
    if (results.length === 0) return null;

    // Pick the result whose aspect ratio best matches the requested slot.
    const targetRatio =
      options.width && options.height ? options.width / options.height : 16 / 9;
    const best = results.reduce((a, b) =>
      Math.abs(a.width / a.height - targetRatio) <= Math.abs(b.width / b.height - targetRatio)
        ? a
        : b
    );

    const entry: CachedResult = {
      rawUrl: best.urls.raw,
      photographerName: best.user.name,
      photographerUrl: best.user.links.html,
      photoUrl: best.links.html,
      expiresAt: now + CACHE_TTL_MS,
    };
    searchCache.set(cacheKey, entry);

    return {
      ...entry,
      url: withUnsplashSize(entry.rawUrl, options.width, options.height),
    };
  } catch {
    // Network/timeout/parse failure — graceful degradation.
    return null;
  }
}

/**
 * Resolve every `data-image-prompt` <img> in an HTML document to a real
 * Unsplash photo. Returns the rewritten HTML plus attribution info for each
 * resolved image (so pages can render required photographer credits).
 *
 * Idempotent: images already pointing at Unsplash (or any explicit URL the
 * model chose) are left untouched, so re-running on edited HTML is safe.
 */
export interface ResolvedImageAttribution {
  /** The original src the model emitted (usually a placeholder). */
  from: string;
  /** The resolved Unsplash URL. */
  to: string;
  photographerName: string;
  photographerUrl: string;
  photoUrl: string;
}

export async function resolveUnsplashImagesInHtml(
  html: string
): Promise<{ html: string; attributions: ResolvedImageAttribution[] }> {
  const attributions: ResolvedImageAttribution[] = [];
  if (!html || !isUnsplashConfigured() || !/<img\b/i.test(html)) {
    return { html, attributions };
  }

  // Collect all img tags first so identical prompts share one API call.
  const tagMatches = html.match(/<img\b[^>]*>/gi) ?? [];
  const promptToPhoto = new Map<string, UnsplashPhoto | null>();

  for (const tag of tagMatches) {
    const src = getAttr(tag, 'src') ?? '';
    const prompt = getAttr(tag, 'data-image-prompt');
    if (!prompt) continue; // Only model-requested images are resolved.
    if (src.startsWith('data:') || /^https?:\/\/([a-z0-9-]+\.)?images\.unsplash\.com\//i.test(src)) {
      continue; // Already resolved / user-set.
    }
    const key = prompt.trim().toLowerCase();
    if (!promptToPhoto.has(key)) {
      const width = numAttr(tag, 'width') ?? 1200;
      const height = numAttr(tag, 'height');
      promptToPhoto.set(key, await searchUnsplashPhoto(prompt, { width, height }));
    }
  }

  if (promptToPhoto.size === 0) {
    return { html, attributions };
  }

  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const prompt = getAttr(tag, 'data-image-prompt');
    if (!prompt) return tag;
    const key = prompt.trim().toLowerCase();
    if (!promptToPhoto.has(key)) return tag;
    const photo = promptToPhoto.get(key);
    if (!photo) return tag;

    const originalSrc = getAttr(tag, 'src') ?? '';
    const next = setAttr(tag, 'src', photo.url);
    // Record attribution for the caller (editor shows credits; export carries
    // them into the theme so merchant pages stay compliant).
    attributions.push({
      from: originalSrc,
      to: photo.url,
      photographerName: photo.photographerName,
      photographerUrl: photo.photographerUrl,
      photoUrl: photo.photoUrl,
    });
    return next;
  });

  return { html: out, attributions };
}

// ---------------------------------------------------------------------------
// Tiny HTML attribute helpers (regex-based — the sanitizer pipeline already
// treats generated HTML as untrusted text, and DOMParser is unavailable in
// some route runtimes).
// ---------------------------------------------------------------------------

function getAttr(tag: string, name: string): string | null {
  const m =
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) ||
    new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  return m ? m[1] : null;
}

function numAttr(tag: string, name: string): number | undefined {
  const v = getAttr(tag, name);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function setAttr(tag: string, name: string, value: string): string {
  const escaped = value.replace(/"/g, '&quot;');
  if (new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`, 'i').test(tag)) {
    return tag.replace(new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`, 'i'), `${name}="${escaped}"`);
  }
  if (new RegExp(`\\b${name}\\s*=\\s*'[^']*'`, 'i').test(tag)) {
    return tag.replace(new RegExp(`\\b${name}\\s*=\\s*'[^']*'`, 'i'), `${name}="${escaped}"`);
  }
  return tag.replace(/^<img/i, `<img ${name}="${escaped}"`);
}
