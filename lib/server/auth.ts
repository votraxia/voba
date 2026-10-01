import 'server-only';
import { createClient } from '@insforge/sdk';
import { bearerToken, requireInsForgeUrl } from './insforge-server';

/**
 * Server-only request authentication for API routes (AGENTS.md §15: every
 * server operation verifies project ownership / user identity).
 *
 * Resolves the signed-in user from the `Authorization: Bearer <jwt>` header
 * using an InsForge client scoped to that token — so a route can never act on
 * behalf of an unauthenticated or forged caller.
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Resolve the authenticated user from a request's bearer token, or null when
 * the token is missing/invalid/expired.
 */
export async function requireUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const scoped = createClient({
    baseUrl: requireInsForgeUrl(),
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? '',
    accessToken: token,
  });

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
