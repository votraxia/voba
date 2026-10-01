import 'server-only';
import { getAdminClient, getUserScopedClient, hasAdminKey } from './admin';
import { computeEntitlement, subscriptionIsActive } from './entitlements';
import type { BillingInterval, PlanId } from './plans';
import type { Entitlement, Subscription, SubscriptionStatus } from './types';

/**
 * Server-side `subscriptions` repository. All access uses the admin client
 * (bypasses RLS) because writes happen in the Porsa webhook where there is no
 * user session, and reads back the row for server-side gating. Keep every query
 * here (AGENTS.md §14) — routes stay thin.
 */

const TABLE = 'subscriptions';

function unwrap<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row as T) ?? null;
}

/** Fetch a user's subscription row, or null if they've never subscribed. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await getAdminClient()
    .database.from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription.');
  }
  return unwrap<Subscription>(data);
}

/** Look up a subscription by its Porsa customer id (used from webhooks). */
export async function getSubscriptionByCustomer(
  customerId: string
): Promise<Subscription | null> {
  const { data, error } = await getAdminClient()
    .database.from(TABLE)
    .select('*')
    .eq('porsa_customer_id', customerId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription.');
  }
  return unwrap<Subscription>(data);
}

/** Count the projects a user owns. Drives the Free-plan limit check. */
export async function countUserProjects(userId: string): Promise<number> {
  const { data, error } = await getAdminClient()
    .database.from('projects')
    .select('id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message ?? 'Failed to count projects.');
  }
  return Array.isArray(data) ? data.length : 0;
}

export interface SubscriptionUpsert {
  userId: string;
  porsaCustomerId: string | null;
  porsaPaymentId: string | null;
  plan: PlanId;
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Insert or update the subscription row for a user (one row per user). Called
 * from the Porsa webhook after every relevant payment event so local state
 * always mirrors the provider. Uses `user_id` as the natural key.
 */
export async function upsertSubscription(input: SubscriptionUpsert): Promise<void> {
  const db = getAdminClient().database;
  const now = new Date().toISOString();

  const record = {
    user_id: input.userId,
    porsa_customer_id: input.porsaCustomerId,
    porsa_payment_id: input.porsaPaymentId,
    plan: input.plan,
    billing_interval: input.billingInterval,
    status: input.status,
    current_period_start: input.currentPeriodStart,
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    updated_at: now,
  };

  const existing = await getSubscription(input.userId);

  if (existing) {
    const { error } = await db.from(TABLE).update(record).eq('user_id', input.userId);
    if (error) throw new Error(error.message ?? 'Failed to update subscription.');
    return;
  }

  const { error } = await db.from(TABLE).insert([{ ...record, created_at: now }]);
  if (error) throw new Error(error.message ?? 'Failed to create subscription.');
}

/**
 * Persist just the Porsa customer id for a user (before a payment exists), so
 * their billing history stays on one customer record across payments.
 */
export async function ensureCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  const existing = await getSubscription(userId);
  const db = getAdminClient().database;
  const now = new Date().toISOString();

  if (existing) {
    if (existing.porsa_customer_id === customerId) return;
    const { error } = await db
      .from(TABLE)
      .update({ porsa_customer_id: customerId, updated_at: now })
      .eq('user_id', userId);
    if (error) throw new Error(error.message ?? 'Failed to save customer id.');
    return;
  }

  const { error } = await db.from(TABLE).insert([
    {
      user_id: userId,
      porsa_customer_id: customerId,
      plan: 'free',
      billing_interval: null,
      status: 'free',
      cancel_at_period_end: false,
      created_at: now,
      updated_at: now,
    },
  ]);
  if (error) throw new Error(error.message ?? 'Failed to save customer id.');
}

/** Load the authoritative entitlement for a user (subscription + project count). */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const [sub, projectCount] = await Promise.all([
    getSubscription(userId),
    countUserProjects(userId),
  ]);
  return computeEntitlement(sub, projectCount);
}

/**
 * Whether a user is on a paid plan right now.
 *
 * Deliberately narrower than `getEntitlement`: the AI model gate only needs
 * "is this paid", and it runs on every generation — a single subscription read is
 * enough and avoids counting the user's projects on each turn. Falls back to the
 * user-scoped client (RLS) when the admin key isn't configured, exactly like the
 * project-limit check.
 */
export async function isUserPaid(userId: string, accessToken: string | null): Promise<boolean> {
  if (hasAdminKey()) {
    return subscriptionIsActive(await getSubscription(userId));
  }
  if (!accessToken) return false;

  const { data, error } = await getUserScopedClient(accessToken)
    .database.from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw new Error(error.message ?? 'Failed to load subscription.');
  return subscriptionIsActive(unwrap<Subscription>(data));
}

/**
 * Entitlement without the admin key — reads via a user-scoped client so RLS
 * applies. Used by `POST /api/projects` when INSFORGE_ADMIN_KEY is not set, so
 * project creation still enforces the Free-plan limit (using the user's own
 * readable rows) instead of hard-failing on a missing server credential.
 * Reads only what the user can already read: their subscription row and their
 * own project count.
 */
export async function getEntitlementUserScoped(
  accessToken: string,
  userId: string
): Promise<Entitlement> {
  const db = getUserScopedClient(accessToken).database;

  const [subResult, countResult] = await Promise.all([
    db.from('subscriptions').select('*').eq('user_id', userId).limit(1),
    db.from('projects').select('id').eq('user_id', userId),
  ]);

  if (subResult.error) {
    throw new Error(subResult.error.message ?? 'Failed to load subscription.');
  }
  if (countResult.error) {
    throw new Error(countResult.error.message ?? 'Failed to count projects.');
  }

  const sub = unwrap<Subscription>(subResult.data);
  const count = Array.isArray(countResult.data) ? countResult.data.length : 0;
  return computeEntitlement(sub, count);
}
