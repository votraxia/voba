'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUp, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/components';
import { startingPoints } from '@/components/starting-points';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import UpgradeDialog from '@/components/billing/UpgradeDialog';
import { takePendingPrompt } from '@/lib/pending-prompt';
import { createProject, ProjectLimitError } from '@/lib/projects';

/**
 * Authenticated home: describe a store and go straight into the builder. This is
 * where the landing page's hero composer hands off — a visitor who typed a prompt
 * before signing up finds it already in the box when they arrive.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { entitlement, refresh: refreshEntitlement } = useSubscription();
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore a prompt typed on the landing page before signing up. Read after an
  // await so the state update never happens synchronously inside the effect (the
  // same pattern the subscription provider uses for its initial load).
  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    (async () => {
      const pending = takePendingPrompt();
      await Promise.resolve();
      if (!active || !pending) return;
      setPrompt(pending);
      // Focus after paint so the restored text is on screen before the caret lands.
      window.setTimeout(() => promptRef.current?.focus(), 0);
    })();
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  async function startProject(rawPrompt: string) {
    const trimmed = rawPrompt.trim();
    if (!trimmed || submitting) return;

    // Fast-path: if we already know the Free limit is reached, show the upgrade
    // dialog without a round-trip. The server still enforces this authoritatively.
    if (entitlement && !entitlement.canCreateProject) {
      setUpgradeOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject(trimmed);
      router.push(`/editor/${project.id}`);
    } catch (err) {
      if (err instanceof ProjectLimitError) {
        // Server rejected creation — surface the upgrade dialog and resync usage.
        setUpgradeOpen(true);
        void refreshEntitlement();
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  function applySuggestion(nextPrompt: string) {
    setPrompt(nextPrompt);
    setError(null);
    promptRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-app px-8 py-12">
      <div className="mx-auto w-full max-w-[860px]">
        <header className="mb-8">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Start a new Shopify theme
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-fg-2">
            Describe the storefront you want. You can refine every section, image, and
            label inside the editor.
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void startProject(prompt);
          }}
          className="rounded-2xl border border-line bg-card p-4 shadow-[var(--app-shadow-md)]"
        >
          <textarea
            ref={promptRef}
            aria-label="Describe a Shopify page or theme"
            placeholder="Ask me to build a Shopify page or theme…"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void startProject(prompt);
              }
            }}
            disabled={submitting}
            className="h-[92px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-fg outline-none placeholder:text-fg-2 disabled:opacity-60"
          />
          <div className="flex items-end justify-between gap-4">
            <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent-line bg-accent-soft px-3 text-xs font-medium text-danger">
              <Sparkles size={14} strokeWidth={2} />
              Pages, sections, and Liquid schema generated together
            </span>
            <button
              type="submit"
              aria-label="Generate the storefront"
              disabled={submitting || !prompt.trim()}
              className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-[var(--app-shadow-md)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <ArrowUp size={22} strokeWidth={2} />
              )}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 text-sm font-medium text-danger">{error}</p>
        )}

        <div className="mb-6 mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
            Or start from a page
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {startingPoints.map((point) => {
            const Icon = point.icon;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => applySuggestion(point.prompt)}
                disabled={submitting}
                className="group flex min-h-[100px] items-center justify-between gap-4 rounded-2xl border border-line bg-card p-4 text-left shadow-[var(--app-shadow-sm)] transition hover:border-accent-line hover:shadow-[var(--app-shadow-md)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-4">
                  <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${point.colour}`}>
                    <Icon size={24} strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold leading-6 text-fg">
                      {point.title}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-fg-2">
                      {point.desc}
                    </span>
                  </span>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-fg transition group-hover:translate-x-1 group-hover:border-accent-line group-hover:text-accent-text">
                  <ArrowRight size={19} strokeWidth={1.8} />
                </span>
              </button>
            );
          })}
        </div>

        <Link
          href="/projects"
          className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-line bg-accent-soft px-6 py-5 transition hover:border-accent-line"
        >
          <span className="flex items-center gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card text-accent-text">
              <FolderOpen size={20} strokeWidth={1.9} />
            </span>
            <span>
              <span className="block text-[15px] font-bold text-fg">Your projects</span>
              <span className="mt-0.5 block text-[13px] text-fg-2">
                Reopen a storefront, restore a revision, or export its theme.
              </span>
            </span>
          </span>
          <ArrowRight size={18} strokeWidth={2} className="shrink-0 text-accent-text" />
        </Link>
      </div>

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="You’ve reached your project limit"
        description="The Free plan includes 2 projects. Upgrade to create unlimited projects and export Shopify themes."
      />
    </div>
  );
}
