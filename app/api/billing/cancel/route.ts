import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getSubscription, upsertSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Cancel (or resume) the signed-in user's subscription.
 *
 * Porsa's hosted model has no merchant-side "cancel" API call: a payment buys
 * exactly one period, and the next period only starts when the customer pays
 * again. Cancelling therefore means marking the row so it is NOT extended —
 * access keeps running until `current_period_end`, then lapses (enforced by the
 * expiry check in the subscription route). Resuming just clears the flag before
 * the period ends. The user's money and data are untouched either way.
 */
const bodySchema = z.object({ resume: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const resume = parsed.success ? parsed.data.resume === true : false;

  const sub = await getSubscription(user.id);
  if (!sub || sub.status === 'free' || sub.status === 'canceled') {
    return Response.json({ error: 'No active subscription to cancel.' }, { status: 400 });
  }

  try {
    await upsertSubscription({
      userId: user.id,
      porsaCustomerId: sub.porsa_customer_id,
      porsaPaymentId: sub.porsa_payment_id,
      plan: sub.plan,
      billingInterval: sub.billing_interval,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: !resume,
    });
    return Response.json({ ok: true, cancelAtPeriodEnd: !resume });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to update subscription.' },
      { status: 500 }
    );
  }
}
