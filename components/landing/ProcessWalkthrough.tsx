'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Send,
  Sparkles,
  Wand2,
} from 'lucide-react';

/**
 * "How it works" — a real product visual instead of four description cards.
 *
 * The pipeline genuinely runs in stages (brief → plan → stream sections →
 * scoped edit → export), so rather than asking a visitor to read four boxes, we
 * show the builder UI at each stage and step through it. Every frame is drawn
 * from what the app actually does: the same chat panel, the same preview, the
 * same scoped-edit popover, the same export list.
 *
 * It auto-advances so the motion reads on its own, but every stage is also
 * selectable — a visitor who arrived mid-scroll can jump to the part they care
 * about, and pausing on hover keeps it from racing past.
 */

type StageId = 'brief' | 'plan' | 'build' | 'edit' | 'export';

interface Stage {
  id: StageId;
  /** Short label shown on the rail. */
  label: string;
  /** The one-line claim this stage proves. */
  caption: string;
  /** What the visitor is looking at in this frame. */
  detail: string;
}

const STAGES: Stage[] = [
  {
    id: 'brief',
    label: 'Brief',
    caption: 'Your sentence becomes a structured brief',
    detail:
      'Brand, audience, palette and type are written down first — so every page that follows stays on the same system.',
  },
  {
    id: 'plan',
    label: 'Plan',
    caption: 'Pages and sections are specified before a pixel is drawn',
    detail:
      'The model lists each page, the sections on it, and the photo each section needs. Nothing is improvised later.',
  },
  {
    id: 'build',
    label: 'Build',
    caption: 'Sections stream in as they validate',
    detail:
      'Each region is converted and checked on its own, then rendered into the preview. You watch the storefront assemble.',
  },
  {
    id: 'edit',
    label: 'Edit',
    caption: 'Click any element and change it in words',
    detail:
      'The heading keeps its ID, so the edit comes back as a patch for that element. Sibling sections are never touched.',
  },
  {
    id: 'export',
    label: 'Export',
    caption: 'One ZIP, structured the way Shopify expects',
    detail:
      'Liquid with schema blocks, editable settings, and presets — validated before the download is offered.',
  },
];

/** Real photography used inside the mock storefront preview. */
const photos = {
  hero: 'https://images.unsplash.com/photo-1609881582722-4a8ab7cd54d8?auto=format&fit=crop&w=640&q=70',
  bowl: 'https://images.unsplash.com/photo-1701383700322-007c0fe0a154?auto=format&fit=crop&w=220&q=70',
  stack: 'https://images.unsplash.com/photo-1660721671073-e139688fa3cf?auto=format&fit=crop&w=220&q=70',
  cups: 'https://images.unsplash.com/photo-1641302063626-add5862ed2fc?auto=format&fit=crop&w=220&q=70',
  mug: 'https://images.unsplash.com/photo-1680818080459-1b9ad0e9cd78?auto=format&fit=crop&w=220&q=70',
};

const AUTO_ADVANCE_MS = 5200;

/** A product tile in the mock storefront — real photo, not a gradient block. */
function ProductTile({ src, name, price }: { src: string; name: string; price: string }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#efe7e1] bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- static marketing mock; next/image adds no value at this size */}
      <img src={src} alt={name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
      <div className="px-2 py-1.5">
        <p className="truncate text-[9px] font-medium text-fg">{name}</p>
        <p className="text-[8.5px] text-muted">{price}</p>
      </div>
    </div>
  );
}

/** The storefront preview pane. Content changes per stage. */
function Preview({ stage }: { stage: StageId }) {
  return (
    <div className="relative min-w-0 bg-elevated p-3.5">
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        {/* Store header */}
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-[11px] font-semibold tracking-[-0.01em] text-fg">
            Clayhouse
          </span>
          <span className="hidden items-center gap-3 text-[9px] text-fg-2 sm:flex">
            <span>Shop</span>
            <span>Journal</span>
            <span>About</span>
          </span>
          <span className="text-[9px] font-medium text-fg">Cart · 0</span>
        </div>

        {stage === 'brief' && (
          <div className="px-4 py-8 text-center">
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
              Clayhouse
            </p>
            <p className="mx-auto mt-1 max-w-[240px] text-[10px] leading-4 text-fg-2">
              Small-batch stoneware, thrown and glazed by hand in a two-person studio.
            </p>
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {['#c2603f', '#e8d5c4', '#f7f3ef', '#3f3a36', '#8a9a8b'].map((hex) => (
                <span
                  key={hex}
                  className="h-5 w-5 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <p className="mt-2 text-[8.5px] tracking-[0.08em] text-muted">
              PALETTE LOCKED
            </p>
          </div>
        )}

        {stage === 'plan' && (
          <div className="px-3.5 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
              Home page · 6 sections
            </p>
            <ul className="mt-2 space-y-1.5">
              {[
                { name: 'theme-header', img: true },
                { name: 'home-hero', img: true },
                { name: 'featured-collection', img: true },
                { name: 'brand-story', img: false },
                { name: 'testimonials', img: false },
                { name: 'newsletter', img: false },
              ].map((section, i) => (
                <li
                  key={section.name}
                  className="flex items-center gap-2 rounded-lg border border-line bg-[#fdfbf9] px-2.5 py-1.5"
                >
                  <span className="w-4 shrink-0 text-[8px] font-mono text-muted">{i + 1}</span>
                  <FileCode2 size={10} strokeWidth={2} className="shrink-0 text-accent" />
                  <span className="flex-1 truncate font-mono text-[9px] text-fg-2">
                    {section.name}.liquid
                  </span>
                  {section.img ? (
                    <ImageIcon size={9} strokeWidth={2.4} className="shrink-0 text-success" />
                  ) : (
                    <span className="shrink-0 text-[8px] text-muted">text</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stage === 'build' && (
          <div>
            <div className="relative border-b border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- marketing mock */}
              <img
                src={photos.hero}
                alt="A potter holding a freshly thrown clay pot"
                className="h-[104px] w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute bottom-2.5 left-3">
                <p className="text-[12px] font-semibold text-fg">Thrown this week</p>
                <p className="mt-0.5 text-[8.5px] text-fg/75">Each piece signed underneath</p>
              </div>
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[8px] font-medium text-fg backdrop-blur">
                <Loader2 size={8} className="animate-spin" />
                validating
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 px-3 pb-3 pt-2.5">
              <ProductTile src={photos.bowl} name="Breakfast bowl" price="$42" />
              <ProductTile src={photos.stack} name="Serving set" price="$96" />
              <ProductTile src={photos.cups} name="Tumbler pair" price="$34" />
              <ProductTile src={photos.mug} name="Pour-over mug" price="$28" />
            </div>
          </div>
        )}

        {stage === 'edit' && (
          <div className="px-3.5 py-3.5">
            <div className="relative">
              <p className="rounded-md bg-elevated px-2 py-1 text-center text-[13px] font-semibold tracking-[-0.02em] text-fg">
                Thrown this week
              </p>
              {/* Selection outline + id badge: how a selected element looks */}
              <span className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-accent" />
              <span className="absolute -top-4 left-0 rounded-t bg-accent px-1.5 py-0.5 text-[7.5px] font-semibold text-accent-fg">
                home-hero-heading
              </span>
            </div>
            <p className="mt-3 text-center text-[10px] leading-4 text-fg-2">
              Each piece signed underneath, fired slowly for a softer matte glaze.
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-full bg-accent px-2.5 text-[8.5px] font-semibold text-accent-fg">
                Shop new pieces
              </span>
              <span className="inline-flex h-5 items-center rounded-full border border-line px-2.5 text-[8.5px] font-medium text-fg-2">
                Our studio
              </span>
            </div>
          </div>
        )}

        {stage === 'export' && (
          <div className="px-3.5 py-3">
            <div className="rounded-lg border border-line bg-[#fdfbf9] p-2.5">
              <p className="flex items-center justify-between text-[9px] font-semibold text-fg">
                clayhouse-shopify-theme.zip
                <span className="font-mono font-normal text-muted">2.4 MB</span>
              </p>
              <div className="mt-2.5 space-y-1">
                {[
                  { path: 'layout/theme.liquid', n: 'liquid' },
                  { path: 'sections/home-hero.liquid', n: 'liquid' },
                  { path: 'sections/featured-collection.liquid', n: 'liquid' },
                  { path: 'templates/index.json', n: 'json' },
                  { path: 'config/settings_schema.json', n: 'json' },
                  { path: 'snippets/card-product.liquid', n: 'liquid' },
                ].map((file) => (
                  <div key={file.path} className="flex items-center gap-1.5">
                    <Check size={9} strokeWidth={3} className="shrink-0 text-success" />
                    <span className="truncate font-mono text-[8.5px] text-fg-2">
                      {file.path}
                    </span>
                    <span className="ml-auto shrink-0 text-[7.5px] text-muted">{file.n}</span>
                  </div>
                ))}
                <p className="pt-0.5 text-[8px] text-muted">+ 41 more files · all validated</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The chat pane — mirrors the real builder's chat panel. */
function Chat({ stage }: { stage: StageId }) {
  return (
    <div className="flex w-[186px] shrink-0 flex-col border-r border-line bg-card max-sm:w-full">
      <div className="flex-1 space-y-2.5 overflow-hidden p-2.5">
        {/* The user's prompt — always present, it is the input to everything */}
        <div className="flex justify-end">
          <p className="max-w-[150px] rounded-lg rounded-br-sm bg-accent-soft px-2 py-1.5 text-[9px] leading-[1.5] text-accent-fg-2">
            A warm, editorial store for small-batch stoneware. Calm, tactile, not luxury-loud.
          </p>
        </div>

        {stage === 'brief' && (
          <div className="rounded-lg rounded-bl-sm bg-elevated px-2 py-2">
            <p className="text-[8.5px] font-semibold text-fg">Brief written</p>
            <dl className="mt-1.5 space-y-1">
              {[
                ['Industry', 'Homeware · ceramics'],
                ['Audience', 'Design-led buyers, 28–45'],
                ['Mood', 'Warm editorial, tactile'],
                ['Type', 'Serif display + neutral sans'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="w-[42px] shrink-0 text-[7.5px] text-muted">{k}</dt>
                  <dd className="text-[7.5px] leading-3 text-fg-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {stage === 'plan' && (
          <>
            <div className="rounded-lg rounded-bl-sm bg-elevated px-2 py-2">
              <p className="text-[8.5px] font-semibold text-fg">Page spec ready</p>
              <p className="mt-1 text-[7.5px] leading-3 text-fg-2">
                5 pages · 6 sections on home · 4 photo slots resolved
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] text-muted">
              <Sparkles size={9} className="text-accent" />
              Building sections…
            </div>
          </>
        )}

        {stage === 'build' && (
          <>
            <div className="rounded-lg rounded-bl-sm bg-elevated px-2 py-2">
              <p className="text-[8.5px] font-semibold text-fg">Streaming sections</p>
              <ul className="mt-1.5 space-y-1">
                {['theme-header', 'home-hero', 'featured-collection'].map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <Check size={9} strokeWidth={3} className="shrink-0 text-success" />
                    <span className="font-mono text-[7.5px] text-fg-2">{s}</span>
                  </li>
                ))}
                <li className="flex items-center gap-1.5">
                  <Loader2 size={9} className="shrink-0 animate-spin text-accent" />
                  <span className="font-mono text-[7.5px] text-muted">brand-story</span>
                </li>
              </ul>
            </div>
          </>
        )}

        {stage === 'edit' && (
          <>
            <div className="flex justify-end">
              <p className="max-w-[150px] rounded-lg rounded-br-sm bg-accent-soft px-2 py-1.5 text-[9px] leading-[1.5] text-accent-fg-2">
                Make the headline warmer and shorter.
              </p>
            </div>
            <div className="rounded-lg rounded-bl-sm bg-elevated px-2 py-2">
              <p className="text-[8.5px] font-semibold text-fg">Patched 1 element</p>
              <p className="mt-1 font-mono text-[7.5px] leading-3 text-fg-2">
                set_text → home-hero-heading
              </p>
              <p className="mt-1 text-[7.5px] text-muted">5 sibling sections untouched</p>
            </div>
          </>
        )}

        {stage === 'export' && (
          <>
            <div className="rounded-lg rounded-bl-sm bg-elevated px-2 py-2">
              <p className="text-[8.5px] font-semibold text-fg">Theme validated</p>
              <p className="mt-1 text-[7.5px] leading-3 text-fg-2">
                47 files · every section has a schema block and presets
              </p>
            </div>
            <div className="rounded-lg bg-app px-2 py-1.5 text-center text-[8.5px] font-semibold text-fg">
              Download ZIP
            </div>
          </>
        )}
      </div>

      {/* Composer — real affordance, present in every stage */}
      <div className="border-t border-line p-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5">
          <span className="flex-1 text-[8px] text-muted">Describe a change…</span>
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-accent">
            <Send size={7} strokeWidth={2.6} className="text-fg" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ProcessWalkthrough() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement | null>(null);

  const stage = STAGES[index];

  // Auto-advance so the motion explains itself. Pauses on hover/focus so it can
  // be read at a human pace, and respects reduced-motion by not animating.
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(
      () => setIndex((i) => (i + 1) % STAGES.length),
      AUTO_ADVANCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [index, paused]);

  const go = (next: number) => setIndex((next + STAGES.length) % STAGES.length);

  return (
    <div
      ref={regionRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Stage rail — every stage is directly selectable */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGES.map((item, i) => {
          const active = i === index;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => go(i)}
              aria-current={active ? 'step' : undefined}
              className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                active
                  ? 'bg-fg text-fg'
                  : 'text-muted hover:bg-accent-soft hover:text-accent'
              }`}
            >
              <span
                className={`font-mono text-[10px] ${active ? 'text-fg/60' : 'text-muted'}`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {item.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous stage"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
          >
            <ChevronLeft size={15} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next stage"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
          >
            <ChevronRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* The product frame */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-card shadow-[0_30px_60px_-24px_rgba(31,41,55,0.22)]">
        <div className="flex items-center gap-2 border-b border-line bg-elevated px-3.5 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2 w-2 rounded-full bg-[#febc2e]/80" />
          <span className="h-2 w-2 rounded-full bg-[#28c840]/80" />
          <span className="ml-2 text-[11px] font-medium text-fg-2">Clayhouse · Home</span>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-medium text-success">
            <span className="h-1 w-1 rounded-full bg-success" />
            Saved
          </span>
        </div>

        <div className="flex flex-col sm:flex-row">
          <Chat stage={stage.id} />
          <div className="min-w-0 flex-1">
            <Preview stage={stage.id} />
          </div>
        </div>
      </div>

      {/* What this stage proves */}
      <div className="mt-5 flex items-start gap-2.5" aria-live="polite">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft">
          {stage.id === 'edit' ? (
            <MousePointerClick size={13} strokeWidth={2} className="text-accent" />
          ) : (
            <Wand2 size={13} strokeWidth={2} className="text-accent" />
          )}
        </span>
        <div>
          <p className="text-[15px] font-semibold text-fg">{stage.caption}</p>
          <p className="mt-1 max-w-[640px] text-[14px] leading-6 text-fg-2">{stage.detail}</p>
        </div>
      </div>
    </div>
  );
}
