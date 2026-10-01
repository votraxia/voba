import 'server-only';
import { createAdminClient, createClient } from '@insforge/sdk';
import { bearerToken as bearerTokenImpl } from '@/lib/server/insforge-server';

/**
 * Server-only InsForge clients for the billing layer.
 *
 * The ADMIN client uses the `ik_` api key from `.insforge/project.json`. It
 * bypasses RLS, so it is used exclusively on the server — for the Porsa webhook
 * (no user session) to write the `subscriptions` table, and for server-side
 * project-limit enforcement. It must NEVER be imported into client code; the
 * `server-only` guard turns that into a build error (AGENTS.md §15).
 *
 * The USER client is scoped to a caller's access token so we can resolve the
 * authenticated user id from a bearer token without trusting the client.
 */

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;

function requireBaseUrl(): string {
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_INSFORGE_URL is not set. Add it to .env.local.');
  }
  return baseUrl;
}

let admin: ReturnType<typeof createAdminClient> | null = null;

/** True when an admin key is configured in the environment. */
export function hasAdminKey(): boolean {
  return Boolean(process.env.INSFORGE_ADMIN_KEY);
}

/** Admin (service-role) InsForge client. Bypasses RLS — server use only. */
export function getAdminClient() {
  if (admin) return admin;

  const apiKey = process.env.INSFORGE_ADMIN_KEY;
  if (!apiKey) {
    throw new Error(
      'INSFORGE_ADMIN_KEY is not set. Copy the `api_key` from .insforge/project.json ' +
        'into .env.local (server-only — see docs/billing-setup.md).'
    );
  }
  admin = createAdminClient({ baseUrl: requireBaseUrl(), apiKey });
  return admin;
}

/**
 * A request-scoped InsForge client authorized by the caller's access token
 * (RLS applies). Used as a FALLBACK for reads when the admin key is absent —
 * e.g. entitlement checks on `POST /api/projects` still work: RLS lets a user
 * count their own projects; they fall back to the Free plan for their
 * subscription row, which they can also read under the "read own subscription"
 * policy.
 */
export function getUserScopedClient(accessToken: string) {
  return createClient({
    baseUrl: requireBaseUrl(),
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? '',
    accessToken,
  });
}

/**
 * Resolve the signed-in user from a bearer access token. Creates a per-request
 * client seeded with the token and asks InsForge who it belongs to; a null
 * return means the token is missing, invalid, or expired.
 */
export async function getUserFromToken(
  accessToken: string | null
): Promise<{ id: string; email: string } | null> {
  if (!accessToken) return null;

  const scoped = getUserScopedClient(accessToken);
  const { data, error } = await scoped.auth.getCurrentUser();
  if (error || !data) return null;

  // getCurrentUser may return the user directly or wrapped in `{ user }`.
  const record = data as Record<string, unknown>;
  const candidate =
    'user' in record && record.user ? (record.user as Record<string, unknown>) : record;
  if (!candidate || typeof candidate.id !== 'string') return null;

  return {
    id: candidate.id,
    email: typeof candidate.email === 'string' ? candidate.email : '',
  };
}

/** Extract the bearer token from an incoming request's Authorization header. */
export function bearerToken(req: Request): string | null {
  return bearerTokenImpl(req);
}
