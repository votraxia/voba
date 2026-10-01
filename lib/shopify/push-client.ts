import { insforge } from '@/lib/insforge';

/**
 * Browser-side helpers for the "Send to Shopify" flow (AGENTS.md §14: browser
 * code only talks to our API routes, never to Shopify or the token table).
 * The OAuth access token lives server-side in `shopify_connections` and is
 * never returned to the client.
 */

/** Asynchronous bearer token for API calls, matching lib/projects.ts. */
async function authorizationHeader(): Promise<Record<string, string>> {
  const token = await insforge.getHttpClient().getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Public metadata about the caller's Shopify connection (no secrets). */
export interface ShopifyConnectionStatus {
  connected: boolean;
  connection: {
    shopDomain: string;
    shopName: string | null;
    connectedAt: string;
    hasRefreshToken: boolean;
  } | null;
}

/** Result of a successful server-side theme push. */
export interface ShopifyPushResult {
  ok: true;
  shopDomain: string;
  themeId: string | null;
  published: boolean;
}

/** Where the browser lands after the Shopify OAuth round-trip. */
export async function beginShopifyConnect(input: {
  shop: string;
  returnTo: string;
}): Promise<{ authorizeUrl: string }> {
  const res = await fetch('/api/shopify/oauth/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authorizationHeader()),
    },
    body: JSON.stringify({ shop: input.shop, returnTo: input.returnTo }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Could not start the Shopify connection.');
  }
  if (typeof payload?.authorizeUrl !== 'string') {
    throw new Error('Shopify connection could not be started. Please try again.');
  }
  return { authorizeUrl: payload.authorizeUrl };
}

export async function fetchShopifyConnection(): Promise<ShopifyConnectionStatus> {
  const res = await fetch('/api/shopify/connections', {
    headers: await authorizationHeader(),
  });
  if (!res.ok) {
    throw new Error('Failed to load the Shopify connection.');
  }
  return (await res.json()) as ShopifyConnectionStatus;
}

export async function disconnectShopify(): Promise<void> {
  const res = await fetch('/api/shopify/connections', {
    method: 'DELETE',
    headers: await authorizationHeader(),
  });
  if (!res.ok) {
    throw new Error('Failed to disconnect the Shopify store.');
  }
}

/**
 * Push an exported theme ZIP to the connected store. The ZIP must already be
 * exported (its public download URL is what Shopify fetches).
 */
export async function pushThemeToShopify(input: {
  projectId: string;
  projectName: string;
  zipUrl: string;
  publish: boolean;
}): Promise<ShopifyPushResult> {
  const res = await fetch('/api/shopify/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authorizationHeader()),
    },
    body: JSON.stringify({
      projectId: input.projectId,
      projectName: input.projectName,
      zipUrl: input.zipUrl,
      publish: input.publish,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (payload?.code === 'not_connected') {
    const err = new Error(payload?.error ?? 'Connect your Shopify store first.');
    err.name = 'ShopifyNotConnectedError';
    throw err;
  }
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Sending the theme to Shopify failed.');
  }
  return payload as ShopifyPushResult;
}
