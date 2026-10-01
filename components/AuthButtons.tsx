'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

/** Top-right auth cluster: sign in / sign up when logged out, user + sign out when logged in. */
export default function AuthButtons() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <div className="h-10 w-40 animate-pulse rounded-xl bg-neutral-100" />;
  }

  if (user) {
    const label = user.name || user.email;
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[180px] truncate text-sm font-medium text-fg sm:block">
          {label}
        </span>
        <button
          onClick={() => void signOut()}
          className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-[15px] font-medium text-accent-fg shadow-[0_10px_24px_rgba(31,41,55,0.04)] transition hover:bg-accent-soft"
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        className="grid h-10 place-items-center rounded-xl border border-line bg-card px-6 text-[15px] font-medium text-accent-fg shadow-[0_10px_24px_rgba(31,41,55,0.04)] transition hover:bg-accent-soft"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="grid h-10 place-items-center rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-fg shadow-[0_12px_22px_rgba(255,103,71,0.18)] transition hover:bg-accent-hover"
      >
        Sign up
      </Link>
    </>
  );
}
