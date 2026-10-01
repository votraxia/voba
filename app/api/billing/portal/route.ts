import { NextRequest } from 'next/server';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Open the billing portal for the signed-in user.
 *
 * With Porsa there is no merchant-hosted customer portal session to mint: the
 * customer's receipts, payment methods, and payment history live in their Porsa
 * checkout emails and the merchant dashboard. The dashboard URL is returned so
 * the billing page can link to it; invoice copies are included on every hosted
 * receipt Porsa sends (Merchant of Record — Porsa owns invoicing).
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const sub = await getSubscription(user.id);
  if (!sub?.porsa_customer_id) {
    return Response.json(
      { error: 'No billing account yet. Subscribe to a plan first.' },
      { status: 400 }
    );
  }

  return Response.json({
    url: process.env.PORSA_DASHBOARD_URL ?? 'https://dashboard.porsa.io',
  });
}
