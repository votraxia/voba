import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, AI_GENERATION_LIMIT, AI_GENERATION_WINDOW } from '@/lib/server/rate-limit';

/**
 * Rate limiter tests (AGENTS.md §15: rate-limit generation, editing, image
 * generation, and exports). Windows are real-time based, so these tests use
 * distinct keys and small assertions on count/behavior rather than timing.
 */
describe('rateLimit', () => {
  beforeEach(() => {
    // Distinct keys per test avoid cross-test interference without exposing
    // a reset hook in the production module.
  });

  it('allows requests under the limit', () => {
    const key = `test-under-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60).ok).toBe(true);
    }
  });

  it('blocks the request over the limit and reports retry-after', () => {
    const key = `test-over-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('isolates keys independently', () => {
    const a = `test-iso-a-${Math.random()}`;
    const b = `test-iso-b-${Math.random()}`;
    expect(rateLimit(a, 1, 60).ok).toBe(true);
    expect(rateLimit(a, 1, 60).ok).toBe(false);
    expect(rateLimit(b, 1, 60).ok).toBe(true);
  });

  it('tracks generation constants sanely', () => {
    expect(AI_GENERATION_LIMIT).toBeGreaterThanOrEqual(10);
    expect(AI_GENERATION_WINDOW).toBeGreaterThanOrEqual(60);
  });
});
