import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { searchUnsplashPhoto, isUnsplashConfigured } from '@/lib/images/unsplash-server';
import { withUnsplashSize } from '@/lib/images/unsplash';

export const runtime = 'nodejs';

/**
 * Resolve an image prompt to a real Unsplash photo (server-side — the Unsplash
 * access key never reaches the browser, AGENTS.md §15). Used by the editor's
 * in-preview "Find image" panel. The search API is rate-limited per account,
 * so this route is authenticated, per-user throttled, and results are cached
 * inside `searchUnsplashPhoto`.
 */
const bodySchema = z.object({
  prompt: z.string().min(1).max(400),
  width: z.number().int().positive().max(4000).optional(),
  height: z.number().int().positive().max(4000).optional(),
  orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
});

const RESOLVE_LIMIT = 60;
const RESOLVE_WINDOW = 10 * 60; // seconds

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const limit = rateLimit(`img-resolve:${user.id}`, RESOLVE_LIMIT, RESOLVE_WINDOW);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many image searches. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!isUnsplashConfigured()) {
    return Response.json(
      { error: 'Image search is not configured. Set UNSPLASH_ACCESS_KEY on the server.' },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { prompt, width, height, orientation } = parsed.data;
  const photo = await searchUnsplashPhoto(prompt, { width, height, orientation });
  if (!photo) {
    return Response.json(
      { error: 'No suitable photo found. Try a different description.' },
      { status: 404 }
    );
  }

  return Response.json({
    url: withUnsplashSize(photo.rawUrl, width ?? 1200, height),
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    photoUrl: photo.photoUrl,
  });
}
