import { insforge } from './insforge';

/**
 * Client-side helper that returns Authorization headers for our server routes.
 * `getValidAccessToken()` returns the current in-memory JWT (refreshing it
 * first if it's about to expire) — the supported way to obtain the token from
 * the browser SDK client. Used by the AI stream, export conversion, project
 * creation, and billing calls so every server route can authenticate callers.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await insforge.getHttpClient().getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
