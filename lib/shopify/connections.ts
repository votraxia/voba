import 'server-only';
import type { createAdminClient } from '@insforge/sdk';

/**
 * Server-only repository for `shopify_connections` (AGENTS.md §14). The table
 * holds the store's OAuth access token, so it is NEVER read by browser code —
 * the server resolves it by the authenticated user's id, and only ever hands
 * back shop metadata (domain + name), never tokens.
 */

/** The admin-client type used across the server layer (see lib/billing/admin.ts). */
export type ShopifyAdminClient = ReturnType<typeof createAdminClient>;

/** The shape pushed to clients: connection metadata without secrets. */
export interface ShopifyConnectionInfo {
  shopDomain: string;
  shopName: string | null;
  connectedAt: string;
  /** True when the stored token carries a refresh token (expiring token). */
  hasRefreshToken: boolean;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  shop_domain: string;
  shop_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  connected_at: string;
  updated_at: string;
}

/** Narrow a raw row to its public metadata (token never leaves the server). */
function toInfo(row: ConnectionRow): ShopifyConnectionInfo {
  return {
    shopDomain: row.shop_domain,
    shopName: row.shop_name,
    connectedAt: row.connected_at,
    hasRefreshToken: Boolean(row.refresh_token),
  };
}

/**
 * Insert or update the user's connection. Called from the OAuth callback after
 * the code has been exchanged; the access token is stored server-side only.
 */
export async function upsertConnection(input: {
  admin: ShopifyAdminClient;
  userId: string;
  shopDomain: string;
  shopName: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string;
}): Promise<void> {
  const values = {
    shop_domain: input.shopDomain,
    shop_name: input.shopName,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    scope: input.scope,
    updated_at: new Date().toISOString(),
  };

  // Single connection per user (unique user_id): update, else insert.
  const { data: updated, error: updateError } = await input.admin.database
    .from('shopify_connections')
    .update(values)
    .eq('user_id', input.userId)
    .select();

  if (updateError) {
    throw new Error(updateError.message ?? 'Failed to save the Shopify connection.');
  }
  if (Array.isArray(updated) && updated.length > 0) return;

  const { error: insertError } = await input.admin.database
    .from('shopify_connections')
    .insert([{ user_id: input.userId, ...values }]);

  if (insertError) {
    throw new Error(insertError.message ?? 'Failed to save the Shopify connection.');
  }
}

/** Fetch the user's raw connection row, or null when not connected. */
export async function getConnectionRow(
  admin: ShopifyAdminClient,
  userId: string
): Promise<ConnectionRow | null> {
  const { data, error } = await admin.database
    .from('shopify_connections')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load the Shopify connection.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ConnectionRow | undefined) ?? null;
}

/** Public metadata for the user's connection (no secrets), or null. */
export async function getConnectionInfo(
  admin: ShopifyAdminClient,
  userId: string
): Promise<ShopifyConnectionInfo | null> {
  const row = await getConnectionRow(admin, userId);
  return row ? toInfo(row) : null;
}

/**
 * Resolve the credentials needed to push a theme for a user, or null when not
 * connected. Later: refresh expiring tokens here when the stored one is near
 * expiry (the refresh token is stored alongside).
 */
export async function resolveCredentials(
  admin: ShopifyAdminClient,
  userId: string
): Promise<{ shopDomain: string; accessToken: string } | null> {
  const row = await getConnectionRow(admin, userId);
  if (!row) return null;
  return { shopDomain: row.shop_domain, accessToken: row.access_token };
}

/** Delete the user's connection (disconnect). */
export async function deleteConnection(admin: ShopifyAdminClient, userId: string): Promise<void> {
  const { error } = await admin.database
    .from('shopify_connections')
    .delete()
    .eq('user_id', userId);
  if (error) {
    throw new Error(error.message ?? 'Failed to remove the Shopify connection.');
  }
}
