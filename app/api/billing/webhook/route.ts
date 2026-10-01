import { NextRequest } from 'next/server';
import {
  isPaymentFailedEvent,
  isPaymentSucceededEvent,
  parsePaymentEvent,
  verifyWebhookSignature,
} from '@/lib/billing/porsa';
import { getSubscriptionByCustomer, upsertSubscription } from '@/lib/billing/subscriptions';
import type { BillingInterval, PlanId } from '@/lib/billing/plans';

export const runtime = 'nodejs';

/**
 * Porsa webhook — the source of truth for subscription state (their blueprint:
 * "always store the raw payload", "validate the signature... timing-safe").
 *
 * Every payment event is HMAC-verified against the raw body, then mirrored into
 * the `subscriptions` table so permissions (project limit, export, premium
 * models) update automatically. Because Porsa recurring billing is not GA yet,
 * each successful payment = one billing period: the event's period dates (or a
 * computed interval) extend `current_period_end`, and an expired period drops
 * the entitlement until the user pays again — all computed from data Porsa
 * itself sends, with no local clock-based grants.
 *
 * The raw request body is required for signature verification, so it is read
 * with `req.text()` (App Router route handlers do not pre-parse the body).
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-porsa-signature') ?? req.headers.get('x-signature');
  const raw = await req.text();

  if (!verifyWebhookSignature(raw, signature)) {
    // An unverifiable payload is untrusted — never process it.
    return Response.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    const event = parsePaymentEvent(raw);
    if (!event) {
      // Malformed payloads are acknowledged so Porsa stops retrying them.
      return Response.json({ received: true, ignored: 'unparseable' });
    }

    if (isPaymentSucceededEvent(event.type)) {
      await syncPaidPayment(event);
    } else if (isPaymentFailedEvent(event.type)) {
      await syncFailedPayment(event);
    }
    // Unhandled event types are acknowledged so Porsa stops retrying.
    return Response.json({ received: true });
  } catch (err) {
    // Return 500 so Porsa retries transient failures (e.g. a DB hiccup).
    return Response.json(
      { error: err instanceof Error ? err.message : 'Webhook handler failed.' },
      { status: 500 }
    );
  }
}

/** Persist the state a successful payment implies. */
async function syncPaidPayment(event: NonNullable<ReturnType<typeof parsePaymentEvent>>) {
  const userId = await resolveUserId(event);
  if (!userId) return; // Nothing to attribute the payment to — skip, don't guess.

  const plan = planFromMetadata(event.metadata.plan);
  const interval = intervalForPlan(plan);
  // Provider-reported period wins; otherwise compute it from the plan interval
  // measured from now (first payment may also omit period fields).
  const now = new Date();
  const start = event.periodStart ?? now.toISOString();
  const end =
    event.periodEnd ??
    addInterval(start, interval) ??
    addInterval(now.toISOString(), interval);

  await upsertSubscription({
    userId,
    porsaCustomerId: event.metadata.porsa_customer_id ?? null,
    porsaPaymentId: event.paymentId,
    plan,
    billingInterval: interval,
    status: 'active',
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
  });
}

/** Persist the state a definitively failed payment implies (access ends). */
async function syncFailedPayment(event: NonNullable<ReturnType<typeof parsePaymentEvent>>) {
  const userId = await resolveUserId(event);
  if (!userId) return;

  const existing = await getSubscriptionByCustomer(event.metadata.porsa_customer_id ?? '');
  await upsertSubscription({
    userId,
    porsaCustomerId: event.metadata.porsa_customer_id ?? existing?.porsa_customer_id ?? null,
    porsaPaymentId: event.paymentId,
    plan: 'free',
    billingInterval: null,
    status: 'canceled',
    currentPeriodStart: existing?.current_period_start ?? null,
    currentPeriodEnd: existing?.current_period_end ?? null,
    cancelAtPeriodEnd: false,
  });
}

/**
 * Attribute an event to a user: metadata first (stamped at checkout), then the
 * stored customer mapping.
 */
async function resolveUserId(
  event: NonNullable<ReturnType<typeof parsePaymentEvent>>
): Promise<string | null> {
  const metaUserId = event.metadata.insforge_user_id;
  if (metaUserId) return metaUserId;

  if (event.metadata.porsa_customer_id) {
    const existing = await getSubscriptionByCustomer(event.metadata.porsa_customer_id);
    if (existing) return existing.user_id;
  }
  return null;
}

function planFromMetadata(value: string | undefined): PlanId {
  if (value === 'monthly' || value === 'yearly') return value;
  return 'free';
}

function intervalForPlan(plan: PlanId): BillingInterval | null {
  if (plan === 'yearly') return 'year';
  if (plan === 'monthly') return 'month';
  return null;
}

/** Add one billing interval to an ISO instant, or null when interval is null. */
function addInterval(iso: string, interval: BillingInterval | null): string | null {
  if (!interval) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (interval === 'month') d.setMonth(d.getMonth() + 1);
  if (interval === 'year') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}


