'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/components';

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
    ? 'text-white/70 hover:text-white'
    : 'text-[#4b5563] hover:text-[#111827]';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        overlay
          ? 'border-b border-transparent bg-transparent'
          : 'border-b border-[#eee7e3] bg-[#fffdfc]/85 backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-[1160px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="AI Shopify Theme Builder">
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl transition ${
              overlay ? 'bg-white/95 ring-1 ring-white/30' : 'bg-white ring-1 ring-[#eee7e3]'
            }`}
          >
            <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 rounded" priority />
          </span>
          <span
            className={`text-[15px] font-semibold tracking-[-0.01em] transition ${
              overlay ? 'text-white' : 'text-[#111827]'
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
          {/* Rendered from first paint for signed-out visitors; swaps to the
              dashboard door once auth confirms a signed-in user */}
          {!user && (
            <Link
              href="/sign-in"
              className={`hidden h-9 items-center rounded-full px-4 text-[14px] font-medium transition sm:inline-flex ${
                overlay
                  ? 'text-white/80 hover:bg-white/10 hover:text-white'
                  : 'text-[#374151] hover:bg-[#f6f2ef]'
              }`}
            >
              Log in
            </Link>
          )}
          <Link
            href={user ? '/dashboard' : '/sign-up'}
            className={`inline-flex h-9 items-center rounded-full px-4 text-[14px] font-semibold transition ${
              overlay
                ? 'bg-white text-[#111827] hover:bg-white/90'
                : 'bg-[#ff6747] text-white shadow-[0_10px_20px_rgba(255,103,71,0.24)] hover:bg-[#f85b3a]'
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
              overlay ? 'text-white hover:bg-white/10' : 'text-[#111827] hover:bg-[#f6f2ef]'
            }`}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-[#eee7e3] bg-[#fffdfc] px-6 py-4 lg:hidden">
          <nav className="flex flex-col" aria-label="Sections">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-[15px] font-medium text-[#374151]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth doors stay reachable on mobile, where the desktop buttons are hidden */}
          <div className="mt-3 flex items-center gap-2.5 border-t border-[#f1ebe7] pt-4">
            {user ? (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#ff6747] text-[15px] font-semibold text-white shadow-[0_10px_20px_rgba(255,103,71,0.24)]"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#e8e2de] text-[15px] font-semibold text-[#111827]"
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#ff6747] text-[15px] font-semibold text-white shadow-[0_10px_20px_rgba(255,103,71,0.24)]"
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
