import { NextRequest } from 'next/server';
import { getAIProvider } from '@/lib/ai';
import { aiRequestSchema } from '@/lib/ai/schema';
import { sanitizeGeneratedHtml, sanitizeThemeCss } from '@/lib/ai/sanitize';
import { sanitizePatchOperations } from '@/lib/ai/patch';
import { encodeEvent, type AIStreamEvent, type BuilderPage } from '@/lib/ai/events';
import { requireUser } from '@/lib/server/auth';
import {
  AI_GENERATION_LIMIT,
  AI_GENERATION_WINDOW,
  rateLimit,
} from '@/lib/server/rate-limit';
import { resolveUnsplashImagesInHtml } from '@/lib/images/unsplash-server';
import { downgradeNotice, resolveModelAccess } from '@/lib/ai/model-access';
import { bearerToken } from '@/lib/server/insforge-server';

export const runtime = 'nodejs';

/**
 * Thin streaming route handler (AGENTS.md §5: route handlers stay thin — no AI
 * or business logic here). It authenticates the caller, rate-limits per user,
 * validates input, delegates to the active AI provider, and streams NDJSON
 * events back to the builder client (AGENTS.md §15: AI keys stay server-side
 * and every request verifies the user).
 */
export async function POST(req: NextRequest) {
  // Authenticate first — the AI provider quota must never be spendable by an
  // unauthenticated caller.
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // Per-user sliding window so one account can't exhaust the provider quota.
  const limit = rateLimit(`ai:${user.id}`, AI_GENERATION_LIMIT, AI_GENERATION_WINDOW);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many generations. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = aiRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { model, messages, pages, activePageId, activePageHtml, theme } = parsed.data;

  // Set by the plan gate below: a Free user's premium model was swapped for the
  // default, and the reason is surfaced as a chat message rather than swallowed.
  let accessNotice: string | null = null;

  let provider;
  try {
    // `model` is the project's picker selection, already constrained to the
    // curated catalog by the request schema — the client cannot name an
    // arbitrary model. Omitted → the deployment default (AI_MODEL). Either way
    // the caller's plan is checked server-side, so a Free account can never run
    // a premium model (AGENTS.md §15).
    const access = await resolveModelAccess(user.id, bearerToken(req), model);
    accessNotice = downgradeNotice(access.downgradedFrom);
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
      const send = (event: AIStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));

      try {
        if (accessNotice) send({ type: 'message', text: accessNotice });

        // Phase 1 — decide what to say and whether to build one page.
        const plan = await provider.planTurn({
          messages,
          existingPages: pages,
          activePageId,
          abortSignal: abort,
        });

        send({ type: 'message', text: plan.reply });

        if (plan.plannedPages.length > 0) {
          send({ type: 'plan', pages: plan.plannedPages });
        }

        // The open page, if we were given its current HTML — the only page we can
        // apply a scoped edit to this turn.
        const openPage = activePageId ? pages.find((p) => p.id === activePageId) ?? null : null;
        const canEdit = plan.action === 'edit_page' && openPage != null && !!activePageHtml;

        // The project's shared style guide keeps every page on one design system.
        let styleGuide = theme?.styleGuide ?? null;

        if (canEdit && openPage) {
          // Phase 2a — scoped edit: change only the requested pieces of the open
          // page instead of regenerating it.
          const patch = await provider.editPage({
            page: openPage,
            html: activePageHtml as string,
            styleGuide,
            messages,
            abortSignal: abort,
          });
          if (patch.operations.length > 0) {
            send({
              type: 'page_patch',
              pageId: openPage.id,
              operations: sanitizePatchOperations(patch.operations),
            });
          } else {
            // The model couldn't produce a valid patch — tell the user instead
            // of silently doing nothing.
            send({
              type: 'message',
              text: "I couldn't apply that edit to the page — the change was too ambiguous for the current layout. Try describing it more specifically (e.g. which section or text to change).",
            });
          }
        } else {
          // Phase 2b — generate exactly one page, if requested. An `edit_page`
          // with no usable HTML falls back to a full generation of the open page.
          const target: BuilderPage | null | undefined =
            plan.action === 'generate_page'
              ? plan.targetPage ?? plan.plannedPages[0] ?? null
              : plan.action === 'edit_page'
                ? plan.targetPage ?? openPage ?? null
                : null;

          if (target) {
            // Ensure the project has ONE global theme before its first page, so
            // every page shares the same design, colours, logo, and components.
            if (!theme) {
              try {
                const generated = await provider.generateTheme({ messages, abortSignal: abort });
                styleGuide = generated.styleGuide;
                send({ type: 'theme', css: sanitizeThemeCss(generated.css), styleGuide: generated.styleGuide });
              } catch {
                // Non-fatal — fall back to generating the page without a shared theme.
              }
            }

            const siblingPages = plan.plannedPages.length > 0 ? plan.plannedPages : pages;
            send({ type: 'page_start', page: target });
            let html = '';
            for await (const chunk of provider.streamPage({ page: target, siblingPages, styleGuide, messages, abortSignal: abort })) {
              if (abort.aborted) break;
              html += chunk;
              // Stream the small incremental chunk — the client accumulates and
              // sanitizes for the live preview. Avoids re-sending the whole
              // (growing) document on every tick.
              send({ type: 'page_delta', pageId: target.id, chunk });
            }
            // Final authoritative document: sanitize, then resolve every
            // `data-image-prompt` slot to a real Unsplash photo server-side
            // (the Unsplash access key never leaves the server).
            const sanitized = sanitizeGeneratedHtml(html);
            const resolved = await resolveUnsplashImagesInHtml(sanitized);
            send({ type: 'page_end', pageId: target.id, html: resolved.html });
          }
        }

        send({ type: 'done' });
      } catch (err) {
        if (!abort.aborted) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' });
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
