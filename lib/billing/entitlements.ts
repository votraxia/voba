import { getPlan, isPaidPlan, UNLIMITED } from './plans';
import type { Entitlement, Subscription, SubscriptionStatus } from './types';

/**
 * Pure entitlement logic — no I/O, no secrets. Given a subscription row (or
 * null) and the user's current project count, decide exactly what they can do.
 * This is the ONE place that answers "can this user create a project / export?"
 * so the server routes and the UI can never disagree.
 */

/**
 * A paid period that has lapsed no longer grants access. With Porsa each
 * payment buys one period and there is no auto-renewal yet, so this is what
 * ends an unpaid subscription: once `current_period_end` is in the past the
 * row keeps its history but reads as canceled.
 */
function periodHasLapsed(sub: Subscription): boolean {
  if (!sub.current_period_end) return false;
  const end = new Date(sub.current_period_end).getTime();
  return !Number.isNaN(end) && end <= Date.now();
}

/** Statuses that grant paid access. `past_due` keeps access during the grace period. */
const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

/** Whether a subscription grants paid access right now. */
export function subscriptionIsActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return isPaidPlan(sub.plan) && ACTIVE_STATUSES.includes(sub.status);
}

/**
 * Compute entitlements from a subscription row and live project count. When the
 * subscription is missing or lapsed, the user falls back to the Free plan.
 */
export function computeEntitlement(
  sub: Subscription | null,
  projectCount: number
): Entitlement {
  const active = sub !== null && subscriptionIsActive(sub) && !periodHasLapsed(sub);
  const planId = active && sub ? sub.plan : 'free';
  const plan = getPlan(planId);

  const remaining =
    plan.maxProjects === UNLIMITED
      ? UNLIMITED
      : Math.max(0, plan.maxProjects - projectCount);

  return {
    plan: planId,
    status: sub?.status ?? 'free',
    isPaid: active,
    maxProjects: plan.maxProjects,
    projectCount,
    remaining,
    canCreateProject: remaining > 0,
    canExport: plan.canExport,
    currentPeriodEnd: active ? sub?.current_period_end ?? null : null,
    cancelAtPeriodEnd: active ? sub?.cancel_at_period_end ?? false : false,
  };
}
