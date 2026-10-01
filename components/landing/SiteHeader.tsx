'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/components';
import ThemeSwitcher from '@/components/theme/ThemeSwitcher';

const navigation = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Templates', href: '#templates' },
  { label: 'Export', href: '#export' },
  { label: 'Pricing', href: '#pricing' },
];

/**
 * Landing page header. Sits transparently over the hero photograph and switches
 * to a solid, blurred bar once the page scrolls, so the nav stays legible on both
 * the dark hero and the light sections below.
 */
export default function SiteHeader() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const overlay = !scrolled;
  const linkTone = overlay
    ? 'text-fg/70 hover:text-fg'
    : 'text-fg-2 hover:text-fg';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        overlay
          ? 'border-b border-transparent bg-transparent'
          : 'border-b border-line bg-app/85 backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-[1160px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="AI Shopify Theme Builder">
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl transition ${
              overlay ? 'bg-elevated/95 ring-1 ring-line-strong' : 'bg-card ring-1 ring-line'
            }`}
          >
            <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 rounded" priority />
          </span>
          <span
            className={`text-[15px] font-semibold tracking-[-0.01em] transition ${
              overlay ? 'text-fg' : 'text-fg'
            }`}
          >
            Theme Builder
          </span>
        </Link>

        <nav className="mx-auto hidden items-center gap-8 lg:flex" aria-label="Sections">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className={`text-[14px] transition-colors ${linkTone}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeSwitcher />
          {/* Rendered from first paint for signed-out visitors; swaps to the
              dashboard door once auth confirms a signed-in user */}
          {!user && (
            <Link
              href="/sign-in"
              className={`hidden h-9 items-center rounded-full px-4 text-[14px] font-medium transition sm:inline-flex ${
                overlay
                  ? 'text-fg/80 hover:bg-elevated/10 hover:text-fg'
                  : 'text-fg-2 hover:bg-elevated'
              }`}
            >
              Log in
            </Link>
          )}
          <Link
            href={user ? '/dashboard' : '/sign-up'}
            className={`inline-flex h-9 items-center rounded-full px-4 text-[14px] font-semibold transition ${
              overlay
                ? 'bg-card text-fg hover:bg-elevated/90'
                : 'bg-accent text-accent-fg shadow-[var(--app-shadow-md)] hover:bg-accent-hover'
            }`}
          >
            {user ? 'Open dashboard' : 'Start building'}
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={`grid h-9 w-9 place-items-center rounded-full transition lg:hidden ${
              overlay ? 'text-fg hover:bg-elevated/10' : 'text-fg hover:bg-elevated'
            }`}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-line bg-app px-6 py-4 lg:hidden">
          <nav className="flex flex-col" aria-label="Sections">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-[15px] font-medium text-fg-2"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth doors stay reachable on mobile, where the desktop buttons are hidden */}
          <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-4">
            {user ? (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg shadow-[0_10px_20px_color-mix(in_srgb,var(--app-accent)_2400%,transparent)]"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line text-[15px] font-semibold text-fg"
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg shadow-[0_10px_20px_color-mix(in_srgb,var(--app-accent)_2400%,transparent)]"
                >
                  Start building
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
