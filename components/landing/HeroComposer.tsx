'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, Loader2, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components';
import { useSubscription } from '@/components/billing/SubscriptionProvider';
import { startingPoints } from '@/components/starting-points';
import { useLandingPrompt } from './LandingPromptProvider';

/**
 * The landing page's prompt composer: the one control a visitor actually uses.
 * It starts a real project (route handler → InsForge → builder), so nothing here
 * is decorative — the "+" button opens the four real page starting points, and
 * the right-hand chip reports the visitor's actual plan and remaining projects.
 */
export default function HeroComposer() {
  const {
    prompt,
    setPrompt,
    submitting,
    error,
    submit,
    applyStartingPoint,
    registerComposer,
  } = useLandingPrompt();
  const { user } = useAuth();
  const { entitlement } = useSubscription();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  let planSummary = 'Free plan';
  if (user && entitlement) {
    if (entitlement.isPaid) {
      planSummary = 'Unlimited projects';
    } else if (entitlement.remaining !== null && entitlement.remaining > 0) {
      planSummary = `${entitlement.remaining} of ${entitlement.maxProjects} projects left`;
    } else {
      planSummary = 'Project limit reached';
    }
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="relative mx-auto w-full max-w-[720px] rounded-[26px] border border-line bg-card/[0.08] p-2.5 shadow-[0_28px_70px_rgba(6,9,18,0.5)] backdrop-blur-xl"
      >
        <label className="sr-only" htmlFor="landing-prompt">
          Describe the Shopify store you want to build
        </label>
        <textarea
          id="landing-prompt"
          ref={registerComposer}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={submitting}
          rows={2}
          placeholder="Describe your store — e.g. handmade ceramics, warm editorial feel…"
          className="h-[76px] w-full resize-none bg-transparent px-3.5 pt-3 text-[15px] leading-6 text-fg outline-none placeholder:text-fg/45 disabled:opacity-60"
        />

        <div className="flex items-center gap-2 pl-1.5">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Start from a page template"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-fg/85 transition hover:border-line hover:bg-elevated/10"
            >
              <Plus size={17} strokeWidth={2} />
            </button>

            {menuOpen && (
              <div className="absolute bottom-12 left-0 z-20 w-[290px] overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-[0_24px_50px_rgba(15,23,36,0.28)]">
                <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Start from a page
                </p>
                {startingPoints.map((point) => {
                  const Icon = point.icon;
                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        applyStartingPoint(point.prompt);
                      }}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent-soft"
                    >
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${point.colour}`}
                      >
                        <Icon size={16} strokeWidth={1.9} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-semibold text-fg">
                          {point.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-fg-2">
                          {point.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p className="hidden text-[13px] text-fg/45 sm:block">
            Home · Product · Collection · Cart · Custom
          </p>

          <div className="ml-auto flex items-center gap-2">
            <span
              title="Your current plan and remaining projects"
              className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-fg/75 sm:inline-flex"
            >
              <Sparkles size={13} strokeWidth={2} />
              {planSummary}
            </span>
            <button
              type="submit"
              aria-label="Generate the storefront"
              disabled={submitting || !prompt.trim()}
              className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-fg shadow-[var(--app-shadow-md)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-elevated/25 disabled:text-accent-fg/60 disabled:shadow-none"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowUp size={19} strokeWidth={2.1} />
              )}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <p className="mx-auto mt-3 max-w-[720px] text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* Signup / login doors — rendered by default (a landing page's audience is
          signed-out visitors, so they paint with the static HTML) and hidden only
          once auth confirms a signed-in user */}
      {!user && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-card px-6 text-[14px] font-semibold text-fg shadow-[0_14px_30px_rgba(6,9,18,0.35)] transition hover:bg-elevated/90 sm:w-auto"
          >
            Create free account
            <ArrowRight size={16} strokeWidth={2.2} />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-line px-6 text-[14px] font-semibold text-fg/85 transition hover:border-line hover:bg-elevated/10 sm:w-auto"
          >
            Log in
          </Link>
        </div>
      )}

      <p className="mt-4 text-center text-[13px] text-fg/55">
        Starts on the Free plan — 2 projects included, no card needed. Theme export
        unlocks on a paid plan.
      </p>
    </div>
  );
}
