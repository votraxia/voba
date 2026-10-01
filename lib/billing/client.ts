import { insforge } from '@/lib/insforge';
import type { PlanId } from './plans';
import type { SubscriptionStatus } from './types';

/**
 * Client-side billing helpers — thin wrappers over the server billing routes.
 * They attach the InsForge access token so the server can authorize the caller.
 * No secrets here; all payment work happens server-side.
 */

/**
 * Entitlement as delivered over JSON. `maxProjects`/`remaining` arrive as `null`
 * for unlimited plans (Infinity isn't valid JSON).
 */
export interface EntitlementDTO {
  plan: PlanId;
  status: SubscriptionStatus;
  isPaid: boolean;
  maxProjects: number | null;
  projectCount: number;
  remaining: number | null;
  canCreateProject: boolean;
  canExport: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Bearer headers for our server routes. `getValidAccessToken()` returns the
 * current in-memory JWT (refreshing it first if it's about to expire), which is
 * the supported way to obtain the token from the browser SDK client.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await insforge.getHttpClient().getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Load the authoritative entitlement for the signed-in user. */
export async function fetchEntitlement(): Promise<EntitlementDTO> {
  const res = await fetch('/api/billing/subscription', {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? 'Failed to load subscription.');
  }
  return (await res.json()) as EntitlementDTO;
}

/**
 * Start checkout with Porsa for a paid plan and redirect the browser to the
 * hosted payment page (mobile money, cards, bank transfer, USSD). Resolves only
 * if the redirect couldn't be performed (error path).
 */
export async function startCheckout(plan: Exclude<PlanId, 'free'>): Promise<void> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ plan }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.error ?? 'Failed to start checkout.');
  }
  window.location.assign(payload.url as string);
}

/**
 * Cancel (or resume) the current subscription at period end. Returns after the
 * server has updated the local state; call `refresh()` on the subscription
 * context to pick it up. With Porsa, cancelling means the current paid period
 * simply is not renewed — access keeps running until `current_period_end`.
 */
export async function setCancelAtPeriodEnd(cancel: boolean): Promise<void> {
  const res = await fetch('/api/billing/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ resume: !cancel }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? 'Failed to update subscription.');
  }
}

/**
 * Open the payment provider's dashboard (payment history, receipts) in a new
 * tab. With Porsa, Merchant-of-Record invoicing lives on their side.
 */
export async function openBillingPortal(): Promise<void> {
  const res = await fetch('/api/billing/portal', {
    method: 'POST',
    headers: await authHeaders(),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.error ?? 'Failed to open billing portal.');
  }
  window.open(payload.url as string, '_blank', 'noopener,noreferrer');
}
