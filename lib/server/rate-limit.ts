import 'server-only';

/**
 * In-memory fixed-window rate limiter (AGENTS.md §15: rate-limit generation,
 * editing, image generation, and exports). Keyed per user per action so one
 * account can't burn through the AI provider's quota or hammer export
 * conversion. A per-process map is deliberate: the app is deployed as a single
 * Next.js server, and correctness across many instances can be added later by
 * swapping the store without touching call sites.
 */

interface WindowState {
  /** Timestamps (ms) of accepted hits inside the current window. */
  hits: number[];
}

const windows = new Map<string, WindowState>();

/** Last sweep time — old entries are pruned lazily to bound memory. */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, state] of windows) {
    state.hits = state.hits.filter((t) => now - t < 60 * 60 * 1000);
    if (state.hits.length === 0) windows.delete(key);
  }
}

export interface RateLimitResult {
  /** True when the request is allowed (and the hit was recorded). */
  ok: boolean;
  /** Max hits per the window. */
  limit: number;
  /** Seconds until the oldest hit leaves the window (for Retry-After). */
  retryAfterSeconds: number;
}

/**
 * Record one hit for `key` under a `limit`-per-`windowSeconds` sliding window.
 * Returns `ok: false` (without recording) when the limit is exceeded.
 */
export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const state = windows.get(key) ?? { hits: [] };
  const cutoff = now - windowSeconds * 1000;
  const recent = state.hits.filter((t) => t > cutoff);

  if (recent.length >= limit) {
    windows.set(key, { hits: recent });
    const oldest = recent[0] ?? now;
    return {
      ok: false,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - now) / 1000)),
    };
  }

  recent.push(now);
  windows.set(key, { hits: recent });
  return { ok: true, limit, retryAfterSeconds: 0 };
}

/**
 * One client request to the AI generation stream. Generous enough for a real
 * design session (a page turn every ~6s sustained) but tight enough to stop
 * abuse of the provider quota.
 */
export const AI_GENERATION_LIMIT = 40;
/** Sliding window (seconds) for AI generation turns. */
export const AI_GENERATION_WINDOW = 10 * 60;

/** One Shopify section conversion request (the export streams many regions). */
export const SHOPIFY_SECTION_LIMIT = 300;
/** Sliding window (seconds) for Shopify section conversion. */
export const SHOPIFY_SECTION_WINDOW = 15 * 60;
