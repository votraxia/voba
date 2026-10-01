import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { getAdminClient } from '@/lib/billing/admin';
import { deleteConnection, getConnectionInfo } from '@/lib/shopify/connections';

export const runtime = 'nodejs';

/**
 * Shopify connection status for the signed-in user (AGENTS.md §14/§15).
 *
 *   GET    — connection metadata for the editor UI (shop domain/name, never
 *            tokens — the access token never leaves the server).
 *   DELETE — disconnect: removes the stored token entirely.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const info = await getConnectionInfo(getAdminClient(), user.id);
    return Response.json({ connected: Boolean(info), connection: info });
  } catch (err) {
    console.error('[shopify-connections] load failed:', err);
    return Response.json({ error: 'Failed to load the Shopify connection.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await deleteConnection(getAdminClient(), user.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[shopify-connections] delete failed:', err);
    return Response.json({ error: 'Failed to remove the Shopify connection.' }, { status: 500 });
  }
}
