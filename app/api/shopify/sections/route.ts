import { NextRequest } from 'next/server';
import { getAIProvider } from '@/lib/ai';
import { shopifySectionsRequestSchema } from '@/lib/ai/schema';
import { requireUser } from '@/lib/server/auth';
import {
  SHOPIFY_SECTION_LIMIT,
  SHOPIFY_SECTION_WINDOW,
  rateLimit,
} from '@/lib/server/rate-limit';
import { resolveModelAccess } from '@/lib/ai/model-access';
import { bearerToken } from '@/lib/server/insforge-server';

export const runtime = 'nodejs';

/**
 * Thin streaming route for AI Shopify section conversion (AGENTS.md §5/§15). The
 * export runs client-side, but AI calls must stay on the server (keys never
 * reach the browser). The caller is authenticated and rate-limited per user.
 * The client splits each designed page into regions and POSTs them here; we
 * convert each region into a structured Shopify section spec with the active
 * provider and stream one NDJSON result per region so the export dialog can
 * show real, per-section progress. A per-region failure is reported (never
 * fatal) so the client can fall back to a raw section for just that piece.
 */

/** How many section conversions to run at once. Balances speed vs. rate limits. */
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  // The provider quota is server-side and expensive — authenticate + throttle.
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const limit = rateLimit(`shopify-sections:${user.id}`, SHOPIFY_SECTION_LIMIT, SHOPIFY_SECTION_WINDOW);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many export conversions. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = shopifySectionsRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { model, brandName, styleGuide, sections } = parsed.data;

  let provider;
  try {
    // Convert with the same model the project was designed with (schema-validated
    // against the curated catalog), so sections match the pages they came from —
    // and the caller's plan is re-checked server-side, since export already
    // requires a paid plan but the model gate must not rely on that.
    const access = await resolveModelAccess(user.id, bearerToken(req), model);
    provider = getAIProvider(access.model);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'AI provider unavailable.' },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const abort = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      // Simple worker pool: pull from a shared cursor until the queue drains.
      let cursor = 0;
      const total = sections.length;
      send({ type: 'start', total });

      const worker = async () => {
        while (cursor < sections.length && !abort.aborted) {
          const item = sections[cursor++];
          try {
            const spec = await provider.generateShopifySection({
              brandName,
              styleGuide,
              pageType: item.pageType,
              pageLabel: item.pageLabel,
              role: item.role,
              html: item.html,
              abortSignal: abort,
            });
            send({ type: 'section', ref: item.ref, spec });
          } catch (err) {
            send({
              type: 'section_error',
              ref: item.ref,
              message: err instanceof Error ? err.message : 'Section conversion failed.',
            });
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
        send({ type: 'done' });
      } catch (err) {
        if (!abort.aborted) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Conversion failed.' });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
