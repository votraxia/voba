import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { createPayment, hasPorsaKey } from '@/lib/billing/porsa';
import { appOrigin } from '@/lib/billing/server-utils';
import { PLANS } from '@/lib/billing/plans';
import { ensureCustomerId, getSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Create a Porsa payment for a plan (AGENTS.md §5: thin route, §15: the Porsa
 * secret key stays server-side).
 *
 * The plan name, interval, and amount all come from our own `PLANS` catalog and
 * are sent inline to Porsa — no predefined provider prices to keep in sync.
 * Porsa hosts the checkout page (mobile money, cards, bank transfer, USSD) and
 * notifies us by webhook; the buyer comes back to /billing?checkout=success.
 */
const bodySchema = z.object({ plan: z.enum(['monthly', 'yearly']) });

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid plan.' }, { status: 400 });
  }

  const plan = PLANS[parsed.data.plan];
  if (!plan.interval) {
    return Response.json({ error: 'Selected plan is not billable.' }, { status: 400 });
  }

  if (!hasPorsaKey()) {
    return Response.json(
      {
        error:
          'Payments are not configured (PORSA_SECRET_KEY missing). See docs/billing-setup.md.',
      },
      { status: 503 }
    );
  }

  try {
    const existing = await getSubscription(user.id);

    const origin = appOrigin(req);
    // A fresh UUID per checkout: same retry → same payment (Porsa idempotency),
    // a new checkout → a new payment.
    const payment = await createPayment({
      plan: plan.id as 'monthly' | 'yearly',
      productName: `Shopify Theme Builder — ${plan.name}`,
      amount: plan.amount,
      currency: plan.currency,
      userId: user.id,
      buyerEmail: user.email,
      successUrl: `${origin}/billing?checkout=success`,
      cancelUrl: `${origin}/billing?checkout=cancelled`,
      idempotencyKey: crypto.randomUUID(),
    });

    // Remember the customer id once, so billing history stays attributable.
    const customerId = existing?.porsa_customer_id ?? `user_${user.id}`;
    if (!existing?.porsa_customer_id) {
      await ensureCustomerId(user.id, customerId);
    }

    return Response.json({ url: payment.checkoutUrl });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to start checkout.' },
      { status: 500 }
    );
  }
}
