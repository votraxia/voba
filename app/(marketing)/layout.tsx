import SiteFooter from '@/components/landing/SiteFooter';
import SiteHeader from '@/components/landing/SiteHeader';

/**
 * Public marketing shell. Deliberately separate from `(app)` — the product shell
 * renders the authenticated sidebar and auth gate, which has no place on a page
 * that signed-out visitors need to read.
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
