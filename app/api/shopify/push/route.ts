import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { getAdminClient } from '@/lib/billing/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { createThemeFromZipUrl, publishTheme, themeNumericId } from '@/lib/shopify/admin-client';
import { resolveCredentials } from '@/lib/shopify/connections';

export const runtime = 'nodejs';

/**
 * "Send to Shopify" (AGENTS.md §10/§15): after the theme ZIP is exported and
 * stored, push it to the merchant's connected store server-side.
 *
 * Flow: authenticate the caller → verify they own the project → resolve their
 * stored Shopify connection (the access token never leaves the server) → call
 * `themeCreate` with the ZIP's public download URL (Shopify fetches and imports
 * it) → optionally `themePublish` to make it live.
 */

interface PushRequestBody {
  projectId?: unknown;
  projectName?: unknown;
  zipUrl?: unknown;
  publish?: unknown;
}

/** Rate limit: pushes are rare, expensive, and touch the merchant's store. */
const PUSH_LIMIT = 10;
const PUSH_WINDOW = 60 * 60; // per hour

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const limit = rateLimit(`shopify-push:${user.id}`, PUSH_LIMIT, PUSH_WINDOW);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many Shopify pushes. Please wait a while and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = (await req.json().catch(() => null)) as PushRequestBody | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const projectName = typeof body?.projectName === 'string' ? body.projectName : '';
  const zipUrl = typeof body?.zipUrl === 'string' ? body.zipUrl : '';
  const publish = body?.publish === true;

  if (!projectId) return badRequest('A project id is required.');
  if (!zipUrl) return badRequest('The exported theme ZIP URL is required.');
  if (!/^https:\/\//.test(zipUrl)) {
    return badRequest('The theme ZIP must be served over HTTPS so Shopify can download it.');
  }

  // The connection (and its access token) lives server-side; resolve it by the
  // authenticated user id — never trust a client-supplied token or shop domain.
  let connection: { shopDomain: string; accessToken: string } | null;
  try {
    connection = await resolveCredentials(getAdminClient(), user.id);
  } catch (err) {
    console.error('[shopify-push] connection lookup failed:', err);
    return Response.json({ error: 'Failed to load your Shopify connection.' }, { status: 500 });
  }
  if (!connection) {
    return Response.json(
      { error: 'Your Shopify store is not connected yet.', code: 'not_connected' },
      { status: 409 }
    );
  }

  const themeName = (projectName || 'AI Storefront theme').slice(0, 70);

  try {
    const themeId = await createThemeFromZipUrl({
      shop: connection.shopDomain,
      accessToken: connection.accessToken,
      name: themeName,
      zipUrl,
    });

    if (publish) {
      await publishTheme({ shop: connection.shopDomain, accessToken: connection.accessToken, themeId });
    }

    return Response.json({
      ok: true,
      shopDomain: connection.shopDomain,
      themeId: themeNumericId(themeId),
      published: publish,
    });
  } catch (err) {
    console.error('[shopify-push] themeCreate failed:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Shopify push failed.' },
      { status: 502 }
    );
  }
}
