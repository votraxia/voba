import 'server-only';
import { isUserPaid } from '@/lib/billing/subscriptions';
import {
  DEFAULT_AI_MODEL,
  gateAIModelByPlan,
  getAIModelLabel,
  type ModelAccess,
} from './models';

/**
 * Server-side plan gate for the AI model a request may run.
 *
 * The picker locks premium models in the UI, but the UI is not a security
 * boundary (AGENTS.md §15) — the entitlement is re-read here from the
 * `subscriptions` row, so a hand-crafted request or a stale project row can
 * never spend a premium model on a Free plan.
 *
 * Two subtleties worth stating, both handled below:
 *
 * 1. When the request names no model, the deployment default `AI_MODEL` is what
 *    would run — so THAT is what gets gated. Otherwise a paid-only default
 *    would be silently reachable by every Free user.
 * 2. A Free user asking for a premium model is downgraded to the default rather
 *    than rejected. Failing outright would break a project that was generated
 *    while the account was paid; the downgrade is reported to the client so the
 *    user is told why quality changed.
 */

/** The model the server would run for this request before the plan is checked. */
export function effectiveModel(requested?: string | null): string {
  return requested ?? process.env.AI_MODEL ?? DEFAULT_AI_MODEL;
}

export interface ResolvedModelAccess extends ModelAccess {
  /** True when the plan check could not be completed and Free was assumed. */
  assumedFree: boolean;
}

/**
 * Resolve which model a user may run, given the model their request asked for.
 * Never throws: an entitlement read failure degrades to the Free plan, which is
 * the safe direction (a premium model must not run just because the check
 * failed to complete).
 */
export async function resolveModelAccess(
  userId: string,
  accessToken: string | null,
  requested?: string | null
): Promise<ResolvedModelAccess> {
  const model = effectiveModel(requested);

  let isPaid = false;
  let assumedFree = false;
  try {
    isPaid = await isUserPaid(userId, accessToken);
  } catch {
    // Fail closed: a subscription we couldn't read must not unlock a premium
    // model. The user still generates, just on the free default.
    assumedFree = true;
  }

  return { ...gateAIModelByPlan(model, isPaid), assumedFree };
}

/**
 * A short, user-facing note explaining a downgrade, or null when the request
 * runs the model it asked for. Shown as a chat message so a quality change is
 * never silent.
 */
export function downgradeNotice(downgradedFrom: string | null): string | null {
  if (!downgradedFrom) return null;
  return (
    `${getAIModelLabel(downgradedFrom)} is a Pro model, so I switched this ` +
    `project to ${getAIModelLabel(DEFAULT_AI_MODEL)}. Upgrade to use it again.`
  );
}
