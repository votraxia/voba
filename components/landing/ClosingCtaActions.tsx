'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components';

/**
 * Auth-aware buttons for the landing page's closing call to action. They render
 * immediately for the signed-out majority (including in the static HTML) and
 * only switch to the dashboard door once auth confirms a signed-in user.
 */
export default function ClosingCtaActions() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/sign-up"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-7 text-[15px] font-semibold text-accent-fg shadow-[0_18px_36px_rgba(255,103,71,0.32)] transition hover:bg-accent-hover sm:w-auto"
        >
          Create free account
          <ArrowRight size={18} strokeWidth={2.2} />
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line px-7 text-[15px] font-semibold text-fg/85 transition hover:border-line hover:bg-elevated/5 sm:w-auto"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link
        href="/dashboard"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-7 text-[15px] font-semibold text-accent-fg shadow-[0_18px_36px_rgba(255,103,71,0.32)] transition hover:bg-accent-hover sm:w-auto"
      >
        Open dashboard
        <ArrowRight size={18} strokeWidth={2.2} />
      </Link>
      <a
        href="#how-it-works"
        className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line px-7 text-[15px] font-semibold text-fg/85 transition hover:border-line hover:bg-elevated/5 sm:w-auto"
      >
        See how it works
      </a>
    </div>
  );
}
