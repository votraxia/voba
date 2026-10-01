import Image from 'next/image';
import Link from 'next/link';

const productLinks = [
  { label: 'New project', href: '/dashboard' },
  { label: 'Projects', href: '/projects' },
  { label: 'Billing', href: '/billing' },
];

/** Everything the product is actually built on — no invented logos. */
const stack = [
  'Shopify Liquid',
  'Next.js',
  'InsForge',
  'Google Gemini',
  'Unsplash',
  'Porsa',
];

/** Required attribution for the photographs used on this page. */
const photoCredits = [
  { name: 'Elias Maurer', href: 'https://unsplash.com/@elmaurer' },
  { name: 'Khanh Do', href: 'https://unsplash.com/@donguyenkhanhs' },
  { name: 'Vitaly Gariev', href: 'https://unsplash.com/@silverblack' },
  { name: 'Timur Seyfelmlyukov', href: 'https://unsplash.com/@timurse' },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#eee7e3] bg-[#fffdfc]">
      <div className="mx-auto grid max-w-[1160px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white ring-1 ring-[#eee7e3]">
              <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 rounded" />
            </span>
            <span className="text-[15px] font-semibold text-[#111827]">Theme Builder</span>
          </Link>
          <p className="mt-4 max-w-[320px] text-[14px] leading-6 text-[#6b7280]">
            Describe a storefront, edit it section by section, and export a Shopify
            theme you can upload as-is.
          </p>
        </div>

        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#9aa2af]">
            Product
          </h2>
          <ul className="mt-4 space-y-2.5">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[14px] text-[#4b5563] transition hover:text-[#111827]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#9aa2af]">
            Built on
          </h2>
          <ul className="mt-4 space-y-2.5">
            {stack.map((item) => (
              <li key={item} className="text-[14px] text-[#4b5563]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-[#f1ebe7]">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-3 px-6 py-6 text-[13px] text-[#9aa2af] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 AI Shopify Theme Builder</p>
          <p>
            Photography by{' '}
            {photoCredits.map((credit, index) => (
              <span key={credit.href}>
                {index > 0 && ', '}
                <a
                  href={credit.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[#6b7280] underline decoration-[#e8e2de] underline-offset-2 transition hover:text-[#111827]"
                >
                  {credit.name}
                </a>
              </span>
            ))}{' '}
            on Unsplash
          </p>
        </div>
      </div>
    </footer>
  );
}
