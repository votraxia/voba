import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  Check,
  ClipboardList,
  CreditCard,
  FileCode2,
  GripVertical,
  History,
  ImagePlus,
  Landmark,
  Layers,
  MessageSquareText,
  MousePointerClick,
  Package,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { PLANS, formatPrice, type PlanId } from '@/lib/billing/plans';
import ClosingCtaActions from '@/components/landing/ClosingCtaActions';
import HeroComposer from '@/components/landing/HeroComposer';
import { LandingPromptProvider } from '@/components/landing/LandingPromptProvider';
import TemplateGrid from '@/components/landing/TemplateGrid';

/**
 * Public landing page (root `/`).
 *
 * Layout follows the reference composition — slim transparent nav, full-bleed
 * photographic hero, centred headline over a translucent composer, then a
 * content stack — but every section describes something this product actually
 * does: the real generation pipeline, the real inline-editing model, the real
 * Unsplash image matching, the real Shopify file set the exporter writes, and the
 * real plan limits. No invented testimonials, no fake UI screenshots.
 */

/** Photography in use on this page (Unsplash hotlinks, attribution in the footer). */
const photos = {
  hero: {
    src: 'https://images.unsplash.com/photo-1761196886761-6852c90b76e7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDg2MjIyfDB8MXxzZWFyY2h8MXx8Ym91dGlxdWUlMjBzdG9yZWZyb250JTIwd2FybSUyMGxpZ2h0fGVufDB8MHx8fDE3OTA2MzQxMjl8MA&ixlib=rb-4.1.0&q=75&w=2400',
    alt: 'A shopper pausing in front of a warmly lit boutique window at night',
    credit: { name: 'Elias Maurer', href: 'https://unsplash.com/@elmaurer' },
  },
  product: {
    src: 'https://images.unsplash.com/photo-1764072396689-953cc059db86?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDg2MjIyfDB8MXxzZWFyY2h8MXx8YXJ0aXNhbiUyMGNlcmFtaWNzJTIwc3R1ZGlvJTIwc2hlbHZlc3xlbnwwfDB8fHwxNzkwNjM0MDkxfDA&ixlib=rb-4.1.0&q=80&w=1200',
    alt: 'Handmade ceramic bowls arranged on studio shelves',
    label: 'Product detail',
    credit: { name: 'Khanh Do', href: 'https://unsplash.com/@donguyenkhanhs' },
  },
  editorial: {
    src: 'https://images.unsplash.com/photo-1753164597585-6d42636ea099?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDg2MjIyfDB8MXxzZWFyY2h8MXx8ZmFzaGlvbiUyMGRlc2lnbmVyJTIwd29ya2luZyUyMHN0dWRpbyUyMHNrZXRjaGVzfGVufDB8MHx8fDE3OTA2MzQwOTF8MA&ixlib=rb-4.1.0&q=80&w=1200',
    alt: 'Fashion sketches pinned across a studio grid board',
    label: 'Editorial & lookbook',
    credit: { name: 'Vitaly Gariev', href: 'https://unsplash.com/@silverblack' },
  },
  storefront: {
    src: 'https://images.unsplash.com/photo-1787413237528-9dd1197f4fdc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDg2MjIyfDB8MXxzZWFyY2h8M3x8Ym91dGlxdWUlMjBzdG9yZWZyb250JTIwd2FybSUyMGxpZ2h0fGVufDB8MHx8fDE3OTA2MzQxMjl8MA&ixlib=rb-4.1.0&q=80&w=1200',
    alt: 'Illuminated storefronts and design objects at night in Lisbon',
    label: 'Storefront & place',
    credit: { name: 'Timur Seyfelmlyukov', href: 'https://unsplash.com/@timurse' },
  },
};

/** Everything the app is genuinely built on. */
const stack = ['Shopify Liquid', 'Next.js', 'InsForge', 'Google Gemini', 'Unsplash', 'Porsa'];

const steps = [
  {
    icon: MessageSquareText,
    title: 'Describe the store',
    body: 'Write what you sell and how it should feel. The builder reads it as a brief: brand, industry, audience, and design direction.',
  },
  {
    icon: ClipboardList,
    title: 'Plan the pages',
    body: 'It writes a structured brief and a page specification first — palette, typography, sections, and the images each section needs.',
  },
  {
    icon: Layers,
    title: 'Generate section by section',
    body: 'Sections stream into a sandboxed preview as each one validates, so you watch the storefront build instead of staring at a spinner.',
  },
  {
    icon: History,
    title: 'Edit, revise, export',
    body: 'Select any heading or section and describe the change. Every accepted edit becomes a revision you can restore, and the theme exports when it is right.',
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: 'Sandboxed preview',
    body: 'Generated markup renders inside an isolated iframe behind a strict CSP. Scripts, eval, event handlers, and remote calls never reach the preview.',
  },
  {
    icon: MousePointerClick,
    title: 'Scoped inline edits',
    body: 'Select a heading or a whole section and describe the change. The model returns a patch for that stable element id — never a regenerated page.',
  },
  {
    icon: History,
    title: 'Revisions and undo',
    body: 'Each accepted edit is saved as a revision with the page snapshot behind it, so any earlier version is one click away.',
  },
  {
    icon: Camera,
    title: 'Real photography',
    body: 'Every image slot carries a description of the photo it needs, matched to a real Unsplash photo at the right aspect ratio — credit preserved.',
  },
  {
    icon: FileCode2,
    title: 'Liquid, not static HTML',
    body: 'Designed sections convert to Liquid with a schema block, editable settings, blocks for repeatable content, and presets for the theme editor.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Theme-editor ready',
    body: 'Headings become text settings, card rows become blocks, products and collections become selectors, and navigation becomes link lists.',
  },
];

const exportGuarantees = [
  'Upload-ready ZIP: every file Shopify expects is in the right place — drop it into Online Store → Themes and publish.',
  'Sections arrive pre-wired for the theme editor: edit text, images, and colors without touching code.',
  'Products, collections, and menus become simple pickers and dropdowns you control — nothing is locked into the design.',
  'Fast, optimized styles are built in — no slow third-party scripts on your store.',
  'Every file is checked before download, so the upload works the first time.',
];

const pricingPlans = [PLANS.free, PLANS.monthly, PLANS.yearly];

/** Merchant-friendly stat block under the export copy — every number is real. */
const exportStats = [
  { value: '0', label: 'code required' },
  { value: '5', label: 'page templates' },
  { value: '1', label: 'ZIP to upload' },
  { value: '100%', label: 'editable in Shopify' },
];

/** Per-plan billing note shown under the price. */
const priceNote: Record<PlanId, string> = {
  free: 'Free forever.',
  monthly: 'Billed monthly · cancel anytime.',
  yearly: `≈ ${formatPrice(Math.round(PLANS.yearly.amount / 12), PLANS.yearly.currency)}/mo · billed ${formatPrice(PLANS.yearly.amount, PLANS.yearly.currency)} yearly`,
};

/** Payment methods Porsa checkout accepts, shown as chips under the cards. */
const paymentMethods = [
  { icon: Smartphone, label: 'Mobile money' },
  { icon: CreditCard, label: 'Card' },
  { icon: Landmark, label: 'Bank transfer' },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f05a32]">
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <LandingPromptProvider>
      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden bg-[#0c1120] px-6 pb-20 pt-32">
        <Image
          src={photos.hero.src}
          alt={photos.hero.alt}
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_16%_94%,rgba(255,103,71,0.34),transparent_58%),radial-gradient(90%_60%_at_88%_6%,rgba(139,109,245,0.22),transparent_60%),linear-gradient(180deg,rgba(9,13,24,0.88)_0%,rgba(9,13,24,0.6)_38%,rgba(9,13,24,0.9)_100%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-[860px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-[12.5px] font-medium text-white/80 backdrop-blur">
            <Sparkles size={14} strokeWidth={2} />
            AI Shopify theme builder
          </span>

          <h1 className="mt-7 text-[38px] font-medium leading-[1.05] tracking-[-0.035em] text-white sm:text-[52px] lg:text-[66px]">
            Describe your storefront.
            <br />
            Export a Shopify theme.
          </h1>

          <p className="mx-auto mt-6 max-w-[600px] text-[16px] leading-7 text-white/70">
            One prompt generates editable home, product, collection, cart, and custom
            pages — then converts them into Liquid sections and a ZIP you upload
            straight to Shopify.
          </p>

          <div className="mt-10">
            <HeroComposer />
          </div>
        </div>

        <a
          href={photos.hero.credit.href}
          target="_blank"
          rel="noreferrer noopener"
          className="absolute bottom-5 right-6 hidden text-[12px] text-white/40 transition hover:text-white/70 sm:block"
        >
          Photo: {photos.hero.credit.name} / Unsplash
        </a>
      </section>

      {/* Stack band — an honest stand-in for a logo wall */}
      <section className="border-b border-[#f1ebe7] bg-[#fffdfc]">
        <div className="mx-auto flex max-w-[1160px] flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-center sm:gap-8">
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#9aa2af]">
            Built with
          </span>
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {stack.map((item) => (
              <li key={item} className="text-[14px] font-medium text-[#6b7280]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 bg-[#fffdfc] px-6 py-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="max-w-[760px]">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
              One sentence in. A theme you can upload out.
            </h2>
            <p className="mt-5 text-[16px] leading-7 text-[#6b7280]">
              The pipeline is deliberately split into four constrained steps, so the
              design stays consistent across pages and nothing ships before it
              validates.
            </p>
          </div>

          <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff3ef] text-[#f05a32]">
                      <Icon size={20} strokeWidth={1.9} />
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-[#c9c1bb]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[17px] font-semibold text-[#111827]">{step.title}</h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 border-y border-[#f1ebe7] bg-[#fff8f5] px-6 py-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="max-w-[760px]">
            <Eyebrow>Inside the builder</Eyebrow>
            <h2 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
              What makes the export trustworthy.
            </h2>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-[#f0e5e0] bg-white p-6 shadow-[0_10px_24px_rgba(31,41,55,0.035)]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff3ef] text-[#f05a32]">
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-5 text-[16px] font-semibold text-[#111827]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Templates */}
      <section id="templates" className="scroll-mt-24 bg-[#fffdfc] px-6 py-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[620px]">
              <Eyebrow>Starting points</Eyebrow>
              <h2 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
                Home, product, collection, cart — plus any custom page.
              </h2>
              <p className="mt-5 text-[16px] leading-7 text-[#6b7280]">
                Pick a page to fill the composer with a complete brief, then keep adding
                pages. They share one theme stylesheet, so the storefront stays
                consistent as it grows.
              </p>
            </div>
            <a
              href="#pricing"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#eee7e3] bg-white px-5 text-[14px] font-semibold text-[#111827] transition hover:border-[#ffd4c7] hover:text-[#f05a32]"
            >
              See what plans include
              <ArrowRight size={16} strokeWidth={2.1} />
            </a>
          </div>

          <div className="mt-12">
            <TemplateGrid />
          </div>
        </div>
      </section>

      {/* Photography */}
      <section className="border-y border-[#f1ebe7] bg-[#fff8f5] px-6 py-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="max-w-[720px]">
            <Eyebrow>Imagery</Eyebrow>
            <h2 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
              Real photography, matched to the slot.
            </h2>
            <p className="mt-5 text-[16px] leading-7 text-[#6b7280]">
              The model describes the photo each section needs — “hand-thrown stoneware
              on a sunlit shelf” — and the builder searches Unsplash for a match that
              fits the slot’s aspect ratio, then keeps the photographer’s credit. No
              grey placeholder boxes, no guessed URLs.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[photos.product, photos.editorial, photos.storefront].map((photo) => (
              <figure key={photo.src} className="overflow-hidden rounded-2xl border border-[#f0e5e0] bg-white">
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="flex items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[14px] font-semibold text-[#111827]">{photo.label}</span>
                  <a
                    href={photo.credit.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[12px] text-[#9aa2af] transition hover:text-[#f05a32]"
                  >
                    {photo.credit.name} / Unsplash
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Export */}
      <section id="export" className="relative scroll-mt-24 overflow-hidden bg-[#090e1b] px-6 py-24">
        {/* Vercel-style blueprint grid, faded out towards the edges */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.055) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 38%, black 30%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 38%, black 30%, transparent 78%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_50%_at_15%_18%,rgba(255,103,71,0.14),transparent_62%),radial-gradient(45%_45%_at_88%_82%,rgba(139,109,245,0.13),transparent_62%)]"
        />

        <div className="relative mx-auto grid max-w-[1160px] gap-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#ffb3a1]">
              <Package size={13} strokeWidth={2.2} />
              Export
            </span>
            <h2 className="mt-5 text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-white sm:text-[40px]">
              A Shopify theme,
              <br />
              not a static site.
            </h2>
            <p className="mt-5 max-w-[500px] text-[16px] leading-7 text-white/60">
              Your design converts into a real Shopify theme — every section lands in the
              theme editor ready to edit: text, images, colors, and blocks. No code
              needed.
            </p>

            <ul className="mt-8 space-y-3.5">
              {exportGuarantees.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-6 text-white/70">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ff6747]/15 text-[#ff9e7a] ring-1 ring-[#ff6747]/30">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-[500px] border-t border-white/[0.08] pt-5 text-[13px] leading-6 text-white/40">
              All the standard templates Shopify expects are filled in automatically, so
              the upload never fails on a missing file.
            </p>

            {/* Numbers as trust — every stat is real */}
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.08] ring-1 ring-white/[0.06] sm:grid-cols-4">
              {exportStats.map((stat) => (
                <div key={stat.label} className="bg-[#0c1424] px-4 py-4">
                  <p className="font-mono text-[21px] font-semibold leading-none tracking-[-0.01em] text-white">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-[11.5px] leading-4 text-white/45">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ff6747] px-6 text-[14px] font-semibold text-white shadow-[0_14px_30px_rgba(255,103,71,0.3)] transition hover:bg-[#f85b3a]"
              >
                Build your theme
                <ArrowRight size={16} strokeWidth={2.2} />
              </Link>
              <span className="text-[13px] text-white/40">Download the ZIP, upload it to Shopify — done.</span>
            </div>
          </div>

          {/* What merchants get: the Shopify theme editor, not code */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-x-10 -top-10 bottom-1/3 bg-[radial-gradient(55%_55%_at_50%_35%,rgba(255,103,71,0.16),transparent_70%)]"
            />

            <div className="absolute -right-2 -top-4 z-10 hidden items-center gap-1.5 rounded-full border border-white/10 bg-[#0d1526]/95 px-3 py-1.5 text-[12px] font-medium text-white/75 shadow-[0_14px_34px_rgba(0,0,0,0.5)] backdrop-blur lg:flex">
              <SlidersHorizontal size={12} strokeWidth={2.2} className="text-[#ffb3a1]" />
              Edit everything visually
            </div>
            <div className="absolute -bottom-4 -left-2 z-10 hidden items-center gap-1.5 rounded-full border border-white/10 bg-[#0d1526]/95 px-3 py-1.5 text-[12px] font-medium text-white/75 shadow-[0_14px_34px_rgba(0,0,0,0.5)] backdrop-blur lg:flex">
              <MousePointerClick size={12} strokeWidth={2.2} className="text-[#6ee7a0]" />
              Click a section to edit it
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_48px_90px_-30px_rgba(0,0,0,0.65)]">
              <div className="flex items-center gap-2 border-b border-[#eee7e3] bg-[#fafafa] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
                <span className="ml-3 text-[12px] font-medium text-[#6b7280]">
                  Shopify · Theme editor
                </span>
                <span className="ml-auto hidden rounded-full bg-[#35b86b]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#1f9d55] ring-1 ring-[#35b86b]/20 sm:inline-block">
                  Autosaved
                </span>
              </div>

              <div className="grid grid-cols-[1fr_150px] sm:grid-cols-[1fr_220px]">
                {/* Storefront preview with the header section selected */}
                <div className="min-w-0 bg-[#f6f2ef] p-4">
                  <div className="overflow-hidden rounded-xl border border-[#eee7e3] bg-white">
                    <div className="relative border-b border-[#eee7e3] px-4 py-3 outline outline-2 -outline-offset-2 outline-[#ff6747]">
                      <span className="absolute -top-2.5 left-3 rounded-full bg-[#ff6747] px-2 py-0.5 text-[9px] font-semibold text-white">
                        Theme header
                      </span>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-[#111827]">Storefront</span>
                        <span className="hidden items-center gap-3 text-[10.5px] text-[#6b7280] sm:flex">
                          <span>Home</span>
                          <span>Shop</span>
                          <span>About</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#111827]">
                          <ShoppingBag size={13} strokeWidth={2} />
                          <span className="grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#ff6747] px-1 text-[8px] font-semibold text-white">
                            2
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-4 text-center">
                      <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">
                        Ceramics, made by hand
                      </p>
                      <p className="mx-auto mt-1 max-w-[220px] text-[10.5px] leading-4 text-[#6b7280]">
                        Small-batch pieces thrown in our studio.
                      </p>
                      <span className="mt-2.5 inline-flex rounded-full bg-[#ff6747] px-3 py-1 text-[9.5px] font-semibold text-white">
                        Shop the collection
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                      {[
                        { name: 'Stoneware bowl', price: '$38', tone: 'from-[#ffe5de] to-[#ffd4c7]' },
                        { name: 'Linen dress', price: '$120', tone: 'from-[#f0e9ff] to-[#ddd2f8]' },
                        { name: 'Ceramic vase', price: '$46', tone: 'from-[#e8f3ee] to-[#cfe9dd]' },
                      ].map((product) => (
                        <div key={product.name} className="overflow-hidden rounded-lg border border-[#f0e5e0]">
                          <div className={`aspect-[4/3] w-full bg-gradient-to-br ${product.tone}`} />
                          <div className="px-1.5 py-1.5">
                            <p className="truncate text-[9.5px] font-medium text-[#111827]">{product.name}</p>
                            <p className="text-[9px] text-[#9aa2af]">{product.price}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Editor sidebar: the settings every section exports with */}
                <div className="border-l border-[#eee7e3] bg-white">
                  <div className="flex items-center justify-between border-b border-[#eee7e3] px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-[#111827]">Theme header</span>
                    <SlidersHorizontal size={12} strokeWidth={2} className="text-[#9aa2af]" />
                  </div>
                  <div className="space-y-3 px-3.5 py-3">
                    <div>
                      <p className="text-[10px] font-medium text-[#6b7280]">Brand name</p>
                      <div className="mt-1 rounded-md border border-[#e8e2de] px-2 py-1.5 text-[11px] leading-4 text-[#111827]">
                        Storefront
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-[#6b7280]">Show cart link</p>
                      <span className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full bg-[#ff6747]">
                        <span className="absolute right-0.5 h-3 w-3 rounded-full bg-white shadow-sm" />
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-medium text-[#6b7280]">Logo image</p>
                      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-dashed border-[#d9d2cc] px-2 py-1.5 text-[10.5px] text-[#9aa2af]">
                        <ImagePlus size={11} strokeWidth={2} />
                        Choose image
                      </div>
                    </div>

                    <div className="border-t border-[#f1ebe7] pt-3">
                      <p className="text-[10px] font-medium text-[#6b7280]">Menu links</p>
                      <div className="mt-1.5 space-y-1">
                        {['Home', 'Shop', 'About'].map((label) => (
                          <div
                            key={label}
                            className="flex items-center gap-1.5 rounded-md border border-[#f0e5e0] bg-white px-2 py-1.5"
                          >
                            <GripVertical size={11} strokeWidth={2} className="shrink-0 text-[#c9c1bb]" />
                            <span className="text-[10.5px] text-[#4b5563]">{label}</span>
                          </div>
                        ))}
                        <div className="rounded-md border border-dashed border-[#d9d2cc] px-2 py-1.5 text-center text-[10px] font-medium text-[#9aa2af]">
                          + Add link
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[#eee7e3] bg-[#fafafa] px-4 py-2.5">
                <span className="flex items-center gap-2 text-[11px] text-[#6b7280]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#35b86b] opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#35b86b]" />
                  </span>
                  Changes save automatically
                </span>
                <span className="text-[10.5px] text-[#9aa2af]">Text · images · blocks · menus</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 bg-[#fffdfc] px-6 py-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="mx-auto max-w-[640px] text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f3e0d8] bg-[#fff3ef] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f05a32]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff6747]" />
              Pricing
            </span>
            <h2 className="mt-5 text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
              Start free. Pay when you export.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#6b7280]">
              Build and edit on the Free plan — no credit card required. Upgrade when
              you are ready to download the Shopify theme.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => {
              const highlighted = plan.id === 'monthly';

              const card = (
                <div
                  className={`flex h-full flex-col rounded-[20px] p-7 lg:p-8 ${
                    highlighted
                      ? 'bg-white'
                      : 'border border-[#eee7e3] bg-white shadow-[0_10px_24px_rgba(31,41,55,0.04)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-semibold text-[#111827]">{plan.name}</p>
                    {highlighted && (
                      <span className="rounded-full bg-gradient-to-r from-[#ff6747] to-[#ff8a5c] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_6px_16px_rgba(255,103,71,0.35)]">
                        Most popular
                      </span>
                    )}
                    {plan.id === 'yearly' && (
                      <span className="rounded-full bg-[#e9f9f0] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1f9d55] ring-1 ring-[#c9efd9]">
                        Save ~17%
                      </span>
                    )}
                  </div>

                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-[38px] font-semibold tracking-[-0.03em] text-[#111827]">
                      {formatPrice(plan.amount, plan.currency)}
                    </span>
                    <span className="text-[14px] text-[#9aa2af]">
                      {plan.interval ? `/${plan.interval}` : 'forever'}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[13px] text-[#9aa2af]">{priceNote[plan.id]}</p>

                  <div className="my-6 border-t border-[#f1ebe7]" />

                  <ul className="flex-1 space-y-3.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-[14px] leading-6 text-[#4b5563]">
                        <span className="mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#e9f9f0] text-[#1f9d55]">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {feature}
                      </li>
                    ))}
                    {!plan.canExport && (
                      <li className="flex gap-2.5 text-[14px] leading-6 text-[#9aa2af]">
                        <span className="mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#f5f1ef] text-[#b9b2ac]">
                          <X size={11} strokeWidth={3} />
                        </span>
                        Theme export not included
                      </li>
                    )}
                  </ul>

                  <Link
                    href={plan.id === 'free' ? '/dashboard' : '/billing'}
                    className={`mt-8 inline-flex h-11 items-center justify-center rounded-full text-[14px] font-semibold transition ${
                      highlighted
                        ? 'bg-gradient-to-b from-[#ff7a52] to-[#ff6747] text-white shadow-[0_14px_28px_rgba(255,103,71,0.35)] hover:from-[#ff6a40] hover:to-[#f85b3a]'
                        : 'border border-[#e8e2de] bg-white text-[#111827] hover:border-[#ffb49e] hover:text-[#f05a32]'
                    }`}
                  >
                    {plan.id === 'free' ? 'Start building free' : `Choose ${plan.name}`}
                  </Link>

                  <p className="mt-3.5 text-center text-[12px] text-[#9aa2af]">
                    {plan.id === 'free' ? 'No credit card required' : 'Secure checkout · Cancel anytime'}
                  </p>
                </div>
              );

              return highlighted ? (
                <div
                  key={plan.id}
                  className="rounded-[22px] bg-gradient-to-b from-[#ff8a5c] via-[#ff6747] to-[#8b6df5] p-px shadow-[0_36px_80px_-28px_rgba(255,103,71,0.5)] lg:-my-5"
                >
                  {card}
                </div>
              ) : (
                <div key={plan.id} className="transition duration-200 hover:-translate-y-0.5">
                  {card}
                </div>
              );
            })}
          </div>

          {/* Friction removal — payment methods and reassurance, Cal.com-style */}
          <div className="mt-14 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <span
                    key={method.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#eee7e3] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#6b7280]"
                  >
                    <Icon size={13} strokeWidth={2} className="text-[#f05a32]" />
                    {method.label}
                  </span>
                );
              })}
            </div>
            <p className="max-w-[560px] text-center text-[13.5px] leading-6 text-[#9aa2af]">
              Payments are processed by Porsa — cancel anytime from the billing page. The
              annual plan saves about 17% against monthly.
            </p>
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-[#fffdfc] px-6 pb-24">
        <div className="relative isolate mx-auto max-w-[1160px] overflow-hidden rounded-[32px] bg-[#0f1724] px-8 py-16 text-center">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_50%_120%,rgba(255,103,71,0.32),transparent_60%)]"
          />
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[40px]">
            Start with a sentence.
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-7 text-white/65">
            Describe the storefront you want. Edit it section by section. Export a
            Shopify theme you can upload without a build step.
          </p>
          <div className="mt-9 flex justify-center">
            <ClosingCtaActions />
          </div>
          <p className="mt-6 text-[13px] text-white/45">
            Free plan includes 2 projects · Theme export on a paid plan
          </p>
        </div>
      </section>
    </LandingPromptProvider>
  );
}
