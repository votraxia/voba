'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Download,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { useAuth } from '@/components';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import {
  openBillingPortal,
  setCancelAtPeriodEnd,
  startCheckout,
} from '@/lib/billing/client';
import {
  FREE_PROJECT_LIMIT,
  PLANS,
  formatPrice,
  type PlanId,
} from '@/lib/billing/plans';

/** Pretty labels for subscription statuses. */
const STATUS_LABEL: Record<string, string> = {
  free: 'Free',
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past due',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  paused: 'Paused',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BillingPage() {
  const { loading: authLoading } = useAuth();
  const { entitlement, loading, refresh } = useSubscription();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Derive the checkout-result banner from the return URL on first render, so we
  // don't setState inside an effect.
  const [banner] = useState<'success' | 'cancelled' | null>(() => {
    if (typeof window === 'undefined') return null;
    const checkout = new URLSearchParams(window.location.search).get('checkout');
    return checkout === 'success' ? 'success' : checkout === 'cancelled' ? 'cancelled' : null;
  });

  // After a successful checkout, refresh entitlement so permissions reflect the
  // just-completed webhook, then clean the query string from the URL.
  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get('checkout');
    if (checkout === 'success') void refresh();
    if (checkout) window.history.replaceState({}, '', '/billing');
  }, [refresh]);

  if (authLoading || (loading && !entitlement)) {
    return (
      <div className="grid min-h-screen place-items-center bg-app text-fg-2">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 size={18} className="animate-spin text-accent" />
          Loading billing…
        </div>
      </div>
    );
  }

  const plan: PlanId = entitlement?.plan ?? 'free';
  const isPaid = entitlement?.isPaid ?? false;
  const status = entitlement?.status ?? 'free';
  const projectCount = entitlement?.projectCount ?? 0;
  const maxProjects = entitlement?.maxProjects ?? FREE_PROJECT_LIMIT;
  const cancelAtPeriodEnd = entitlement?.cancelAtPeriodEnd ?? false;
  const periodEnd = entitlement?.currentPeriodEnd ?? null;

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setError('');
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    await run('cancel', async () => {
      await setCancelAtPeriodEnd(true);
      await refresh();
    });
  }
  async function resume() {
    await run('resume', async () => {
      await setCancelAtPeriodEnd(false);
      await refresh();
    });
  }

  const usagePct =
    isPaid || !maxProjects ? 100 : Math.min(100, Math.round((projectCount / maxProjects) * 100));

  // With Porsa there is no auto-renewal: a lapsed or cancel-flagged period is
  // continued by paying for the next one. Point that action at the current plan.
  const renewalPlan: 'monthly' | 'yearly' | null =
    entitlement && (entitlement.plan === 'monthly' || entitlement.plan === 'yearly')
      ? entitlement.plan
      : 'monthly';

  return (
    <div className="min-h-screen bg-app px-8 py-10">
      <div className="mx-auto max-w-[960px]">
        <header className="mb-8">
          <h1 className="text-[28px] font-bold leading-tight text-fg">Billing &amp; plans</h1>
          <p className="mt-1 text-sm text-fg-2">
            Manage your subscription, usage, and payment details.
          </p>
        </header>

        {banner === 'success' && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-success-soft bg-success-soft px-4 py-3 text-sm font-medium text-success">
            <CheckCircle2 size={18} /> Subscription active — welcome to Pro!
          </div>
        )}
        {banner === 'cancelled' && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-warning-soft bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
            <Info size={18} /> Checkout cancelled — no changes were made.
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-danger-soft bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {/* Current plan summary */}
        <section className="mb-6 rounded-2xl border border-line bg-card p-6 shadow-[0_10px_24px_rgba(31,41,55,0.035)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl ${
                  isPaid ? 'bg-elevated text-warning' : 'bg-accent-soft text-accent'
                }`}
              >
                {isPaid ? <Crown size={22} strokeWidth={1.9} /> : <CreditCard size={22} strokeWidth={1.9} />}
              </span>
              <div>
                <p className="text-lg font-bold text-fg">{PLANS[plan].name} plan</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      status === 'active' || status === 'trialing'
                        ? 'bg-success-soft text-success'
                        : status === 'past_due' || status === 'unpaid'
                          ? 'bg-danger-soft text-danger'
                          : 'bg-elevated text-fg-2'
                    }`}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </span>
                  {isPaid && (
                    <span className="text-xs text-fg-2">
                      {cancelAtPeriodEnd ? 'Ends on ' : 'Paid until '}
                      {formatDate(periodEnd)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isPaid && (
                <button
                  onClick={() => void run('portal', openBillingPortal)}
                  disabled={busy !== null}
                  className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-medium text-accent-fg transition hover:bg-accent-soft disabled:opacity-60"
                >
                  {busy === 'portal' ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  Manage Billing
                </button>
              )}
              {isPaid && !cancelAtPeriodEnd && (
                <button
                  onClick={() => void cancel()}
                  disabled={busy !== null}
                  className="flex h-10 items-center gap-2 rounded-xl border border-danger-soft bg-card px-4 text-sm font-medium text-danger transition hover:bg-danger-soft disabled:opacity-60"
                >
                  {busy === 'cancel' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  Cancel subscription
                </button>
              )}
              {isPaid && cancelAtPeriodEnd && (
                <button
                  onClick={() => void resume()}
                  disabled={busy !== null}
                  className="flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:opacity-60"
                >
                  {busy === 'resume' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Resume subscription
                </button>
              )}
            </div>
          </div>

          {cancelAtPeriodEnd && (
            <p className="mt-4 rounded-xl border border-warning-soft bg-warning-soft px-4 py-3 text-sm text-warning">
              Your subscription ends on {formatDate(periodEnd)} and won’t be renewed. You’ll keep Pro access until then.
            </p>
          )}
        </section>

        {isPaid && cancelAtPeriodEnd && (
          <section className="mb-6 rounded-2xl border border-warning-soft bg-warning-soft p-5">
            <p className="text-sm font-medium text-warning">
              Your plan won’t renew. Pay again anytime to continue Pro after {formatDate(periodEnd)}.
            </p>
            <button
              onClick={() => void run('renew', () => startCheckout(renewalPlan))}
              disabled={busy !== null}
              className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:opacity-60"
            >
              {busy === 'renew' ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              Pay for the next period now
            </button>
          </section>
        )}

        {/* Usage */}
        <section id="usage" className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_24px_rgba(31,41,55,0.035)]">
            <p className="text-sm font-semibold text-fg">Project usage</p>
            <p className="mt-1 text-2xl font-bold text-fg">
              {projectCount}
              <span className="text-base font-medium text-muted">
                {' '}/ {isPaid ? '∞' : maxProjects}
              </span>
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-fg-2">
              {isPaid ? 'Unlimited projects on your plan.' : `${Math.max(0, maxProjects - projectCount)} remaining on Free.`}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_24px_rgba(31,41,55,0.035)]">
            <p className="text-sm font-semibold text-fg">Shopify export</p>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`grid h-9 w-9 place-items-center rounded-xl ${
                  entitlement?.canExport ? 'bg-success-soft text-success' : 'bg-elevated text-muted'
                }`}
              >
                <Download size={18} strokeWidth={1.9} />
              </span>
              <p className="text-sm font-medium text-fg">
                {entitlement?.canExport ? 'Enabled' : 'Disabled on Free'}
              </p>
            </div>
            <p className="mt-3 text-xs text-fg-2">
              {entitlement?.canExport
                ? 'Export any project as a Shopify theme ZIP.'
                : 'Upgrade to export projects as Shopify theme ZIP files.'}
            </p>
          </div>
        </section>

        {/* Pricing / plan switching */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-fg">Plans</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {(['free', 'monthly', 'yearly'] as PlanId[]).map((id) => {
              const p = PLANS[id];
              const isCurrent = plan === id;
              const isPaidPlan = id !== 'free';
              return (
                <div
                  key={id}
                  className={`flex flex-col rounded-2xl border bg-card p-5 shadow-[0_10px_24px_rgba(31,41,55,0.035)] ${
                    isCurrent ? 'border-accent ring-1 ring-accent-line' : 'border-line'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-fg">{p.name}</p>
                    {isCurrent && (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-fg">
                      {formatPrice(p.amount, p.currency)}
                    </span>
                    {p.interval && <span className="text-sm text-fg-2">/{p.interval}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{p.tagline}</p>
                  <ul className="my-4 space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-fg-2">
                        <Check size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    {isCurrent ? (
                      <button
                        disabled
                        className="h-10 w-full rounded-xl border border-line bg-elevated text-sm font-medium text-muted"
                      >
                        Current plan
                      </button>
                    ) : isPaidPlan ? (
                      <button
                        onClick={() => void run(`checkout-${id}`, () => startCheckout(id as 'monthly' | 'yearly'))}
                        disabled={busy !== null}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg transition hover:bg-accent-hover disabled:opacity-60"
                      >
                        {busy === `checkout-${id}` ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : isPaid ? (
                          'Switch plan'
                        ) : (
                          'Upgrade'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => void run('portal', openBillingPortal)}
                        disabled={busy !== null || !isPaid}
                        className="h-10 w-full rounded-xl border border-line bg-card text-sm font-medium text-accent-fg transition hover:bg-accent-soft disabled:opacity-50"
                        title={isPaid ? 'Cancel your paid plan to return to Free' : ''}
                      >
                        {isPaid ? 'Downgrade' : 'Included'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
