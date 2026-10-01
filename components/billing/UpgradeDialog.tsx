'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { PAID_PLANS, formatPrice } from '@/lib/billing/plans';
import { startCheckout } from '@/lib/billing/client';

/**
 * Reusable upgrade modal shown when a Free user hits the project limit or tries
 * to export. Presents the Monthly and Yearly plans and starts Porsa checkout
 * for the chosen one. Purely presentational beyond the checkout call.
 */
interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export default function UpgradeDialog({
  open,
  onClose,
  title = 'Upgrade to unlock more',
  description = 'You’re on the Free plan. Upgrade to create unlimited projects and export Shopify themes.',
}: UpgradeDialogProps) {
  const [busy, setBusy] = useState<null | 'monthly' | 'yearly'>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  async function choose(plan: 'monthly' | 'yearly') {
    if (busy) return;
    setError('');
    setBusy(plan);
    try {
      await startCheckout(plan);
      // On success the browser navigates to Porsa's hosted checkout; nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--app-shadow-lg)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Sparkles size={20} fill="currentColor" strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-base font-bold text-fg">{title}</h2>
              <p className="mt-0.5 text-sm text-fg-2">{description}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy !== null}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          {PAID_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-2xl border border-line bg-app p-5"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-fg">{plan.name}</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-fg">
                    {formatPrice(plan.amount, plan.currency)}
                  </span>
                  <span className="text-sm text-fg-2">/{plan.interval}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{plan.tagline}</p>
              </div>
              <ul className="mb-5 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13px] text-fg-2">
                    <Check size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void choose(plan.id as 'monthly' | 'yearly')}
                disabled={busy !== null}
                className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg shadow-[var(--app-shadow-md)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === plan.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  `Choose ${plan.name}`
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="px-6 pb-5 text-center text-sm font-medium text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}
