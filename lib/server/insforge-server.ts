import 'server-only';

/**
 * Shared server-only InsForge helpers. Deduplicated here (rather than imported
 * from lib/billing/admin.ts) so non-billing routes don't pull billing code.
 */

/** Extract the bearer token from an incoming request's Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** InsForge API base URL, guaranteed non-empty on the server. */
export function requireInsForgeUrl(): string {
  const url = process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_INSFORGE_URL is not set. Add it to .env.local.');
  }
  return url;
}
