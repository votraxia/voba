'use client';

import { ArrowUpRight } from 'lucide-react';
import { startingPoints } from '@/components/starting-points';
import { useLandingPrompt } from './LandingPromptProvider';

/**
 * The four storefront pages the builder produces, shown as what they actually
 * are: a small rendered page. Each thumbnail is a real layout sketch with real
 * photography rather than an icon and a paragraph, because the whole promise of
 * the product is the page — so the page is what we show.
 *
 * Clicking still fills the hero composer with that page's real brief, exactly as
 * the previous grid did, so the section keeps leading somewhere real.
 */

/** Real Unsplash photography used in the page thumbnails. */
const photos = {
  hero: 'https://images.unsplash.com/photo-1609881582722-4a8ab7cd54d8?auto=format&fit=crop&w=480&q=70',
  bowl: 'https://images.unsplash.com/photo-1701383700322-007c0fe0a154?auto=format&fit=crop&w=180&q=70',
  stack: 'https://images.unsplash.com/photo-1660721671073-e139688fa3cf?auto=format&fit=crop&w=180&q=70',
  cups: 'https://images.unsplash.com/photo-1641302063626-add5862ed2fc?auto=format&fit=crop&w=180&q=70',
  mug: 'https://images.unsplash.com/photo-1680818080459-1b9ad0e9cd78?auto=format&fit=crop&w=180&q=70',
  maker: 'https://images.unsplash.com/photo-1609881583302-61548332039c?auto=format&fit=crop&w=480&q=70',
};

const STORE_NAME = 'Clayhouse';

/** Shared mini-header so every page reads as the same storefront. */
function MiniHeader() {
  return (
    <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
      <span className="text-[7.5px] font-semibold text-fg">{STORE_NAME}</span>
      <span className="flex gap-2 text-[6px] text-muted">
        <span>Shop</span>
        <span>Cart</span>
      </span>
    </div>
  );
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small marketing thumbnail; next/image is heavier than the visual gain here
    <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
  );
}

/** Home: hero, then a featured row. */
function HomeThumb() {
  return (
    <>
      <MiniHeader />
      <div className="relative h-[62px]">
        <Thumb src={photos.hero} alt="A potter holding a freshly thrown clay pot" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute bottom-1.5 left-2 text-[7px] font-semibold text-fg">
          Thrown this week
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {[photos.bowl, photos.stack, photos.mug].map((src, i) => (
          <div key={src} className="overflow-hidden rounded-[3px] border border-line">
            <Thumb src={src} alt={`Featured product ${i + 1}`} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Product: gallery beside the buy box. */
function ProductThumb() {
  return (
    <>
      <MiniHeader />
      <div className="grid grid-cols-[1.15fr_1fr] gap-1.5 p-1.5">
        <div className="overflow-hidden rounded-[3px]">
          <Thumb src={photos.stack} alt="A stack of bowls and a vase" />
        </div>
        <div className="flex flex-col py-0.5">
          <span className="text-[7px] font-semibold leading-tight text-fg">
            Stoneware serving set
          </span>
          <span className="mt-0.5 text-[6px] text-muted">$96.00</span>
          <span className="mt-1 h-1.5 w-full rounded-full border border-line" />
          <span className="mt-1 h-1.5 w-4/5 rounded-full bg-surface" />
          <span className="mt-auto h-3 w-full rounded-full bg-accent" />
        </div>
      </div>
      <div className="flex gap-1 px-1.5 pb-1.5">
        {[photos.cups, photos.mug].map((src, i) => (
          <div key={src} className="h-8 flex-1 overflow-hidden rounded-[3px] border border-line">
            <Thumb src={src} alt={`Gallery image ${i + 1}`} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Collection: filters above a dense grid. */
function CollectionThumb() {
  return (
    <>
      <MiniHeader />
      <div className="px-2 pt-1.5">
        <span className="text-[7px] font-semibold text-fg">All tableware</span>
        <div className="mt-1 flex gap-1">
          {['All', 'Bowls', 'Mugs', 'Sets'].map((f, i) => (
            <span
              key={f}
              className={`rounded-full px-1.5 py-0.5 text-[5.5px] ${
                i === 0 ? 'bg-fg text-fg' : 'border border-line text-muted'
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {[photos.bowl, photos.stack, photos.cups, photos.mug, photos.hero, photos.maker].map(
          (src, i) => (
            <div key={`${src}-${i}`} className="overflow-hidden rounded-[3px] border border-line">
              <Thumb src={src} alt={`Collection product ${i + 1}`} />
            </div>
          )
        )}
      </div>
    </>
  );
}

/** Cart: line items beside an order summary. */
function CartThumb() {
  return (
    <>
      <MiniHeader />
      <div className="grid grid-cols-[1.3fr_1fr] gap-1.5 p-1.5">
        <div className="space-y-1">
          {[photos.bowl, photos.mug].map((src, i) => (
            <div key={src} className="flex gap-1 rounded-[3px] border border-line p-1">
              <div className="h-6 w-6 shrink-0 overflow-hidden rounded-[2px]">
                <Thumb src={src} alt={`Cart item ${i + 1}`} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[5.5px] font-medium text-fg">
                  {i === 0 ? 'Breakfast bowl' : 'Pour-over mug'}
                </span>
                <span className="text-[5px] text-muted">Qty 1</span>
              </div>
              <span className="text-[5.5px] text-fg">{i === 0 ? '$42' : '$28'}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 rounded-[3px] bg-elevated p-1.5">
          <span className="text-[6px] font-semibold text-fg">Summary</span>
          {['Subtotal', 'Shipping', 'Total'].map((row, i) => (
            <div key={row} className="flex justify-between">
              <span className={`text-[5px] ${i === 2 ? 'font-semibold text-fg' : 'text-muted'}`}>
                {row}
              </span>
              <span className="text-[5px] text-fg">{i === 2 ? '$70.00' : '—'}</span>
            </div>
          ))}
          <span className="mt-0.5 block h-3 w-full rounded-full bg-accent" />
        </div>
      </div>
    </>
  );
}

const RENDERERS: Record<string, () => React.ReactNode> = {
  home: HomeThumb,
  product: ProductThumb,
  collection: CollectionThumb,
  cart: CartThumb,
};

export default function PageShowcase() {
  const { applyStartingPoint } = useLandingPrompt();

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {startingPoints.map((point) => {
        const Render = RENDERERS[point.id];
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => applyStartingPoint(point.prompt)}
            className="group text-left"
          >
            {/* The page itself, drawn to scale */}
            <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_10px_24px_rgba(31,41,55,0.05)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_22px_44px_rgba(31,41,55,0.12)]">
              <Render />
            </div>

            <div className="mt-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-fg">{point.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-5 text-fg-2">{point.desc}</p>
              </div>
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition group-hover:bg-accent-soft group-hover:text-accent-text">
                <ArrowUpRight size={14} strokeWidth={2.2} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
