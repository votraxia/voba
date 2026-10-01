import {
  Check,
  FileCode2,
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';

/**
 * The builder's trust features, shown as real interface fragments instead of
 * icon-and-paragraph cards.
 *
 * Each visual is the actual artifact the feature produces — a revision entry you
 * can restore, a section's schema block, a sandboxed preview's locked-down
 * origin — so a visitor sees the mechanism, not a claim about it.
 */

/** Revision history: real entries with a restorable target. */
function RevisionVisual() {
  const entries = [
    { label: 'Warmer hero headline', time: 'Just now', current: true },
    { label: 'Replaced collection photo', time: '4m ago' },
    { label: 'Removed the promo bar', time: '11m ago' },
    { label: 'Generated home page', time: '18m ago' },
  ];

  return (
    <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-line bg-card shadow-[var(--app-shadow-md)]">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className="text-[11.5px] font-semibold text-fg">Version history</span>
        <span className="rounded-full bg-elevated px-2 py-0.5 text-[9.5px] font-medium text-muted">
          4 saved
        </span>
      </div>
      <ul className="p-1.5">
        {entries.map((entry) => (
          <li
            key={entry.label}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
              entry.current ? 'bg-accent-soft' : ''
            }`}
          >
            {/* Timeline rail — makes the sequence readable at a glance */}
            <span className="relative flex h-full w-3 shrink-0 justify-center">
              <span
                className={`mt-1 h-2 w-2 rounded-full ring-2 ${
                  entry.current
                    ? 'bg-accent ring-accent-soft'
                    : 'bg-[#d6cdc6] ring-transparent'
                }`}
              />
              {!entry.current && <span className="absolute top-4 h-full w-px bg-surface" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium text-fg">
                {entry.label}
              </span>
              <span className="text-[10px] text-muted">{entry.time}</span>
            </span>
            {entry.current ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold text-accent-text">
                Current
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-text">
                <RotateCcw size={9} strokeWidth={2.6} />
                Restore
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A real Liquid section's schema block — the reason the export is editable. */
function LiquidVisual() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#2b3446] bg-app shadow-[0_18px_40px_rgba(12,17,32,0.28)]">
      <div className="flex items-center gap-1.5 border-b border-line px-3.5 py-2.5">
        <FileCode2 size={12} strokeWidth={2} className="text-[#ff8a5c]" />
        <span className="font-mono text-[11px] text-fg/70">sections/home-hero.liquid</span>
        <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[9.5px] font-medium text-success">
          Schema valid
        </span>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[10.5px] leading-[1.75] text-fg/70">
        <code>{`{% schema %}
{
  "name": "Home hero",
  "settings": [
    { "type": "text",
      "id": "heading",
      "label": "Heading" },
    { "type": "image_picker",
      "id": "image",
      "label": "Hero image" },
    { "type": "range",
      "id": "height",
      "min": 400, "max": 900,
      "step": 20, "unit": "px",
      "label": "Height" }
  ],
  "presets": [
    { "name": "Home hero" }
  ]
}
{% endschema %}`}</code>
      </pre>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-2">
        {['Text setting', 'Image picker', 'Range slider'].map((control) => (
          <span key={control} className="text-[10px] text-fg/40">
            {control}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The sandbox: the preview's own origin, with the block list made concrete. */
function SandboxVisual() {
  const blocked = ['<script>', 'eval()', 'onclick handlers', 'remote fetch'];

  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-card shadow-[var(--app-shadow-md)]">
      {/* Fake browser chrome with the sandbox origin, which is the actual trick */}
      <div className="flex items-center gap-2 border-b border-line bg-elevated px-3 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]/80" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]/80" />
        <span className="ml-1 flex items-center gap-1 rounded-md bg-card px-2 py-0.5 font-mono text-[9.5px] text-fg-2 ring-1 ring-[#f1ebe7]">
          <ShieldCheck size={9} strokeWidth={2.4} className="text-success" />
          builder://sandbox
        </span>
      </div>

      <div className="p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Never executed
        </p>
        <ul className="mt-2 space-y-1.5">
          {blocked.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 rounded-lg border border-danger-soft bg-danger-soft px-2.5 py-1.5"
            >
              <span className="font-mono text-[10px] text-danger line-through">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-fg-2">
          <ImageIcon size={11} strokeWidth={2} className="shrink-0 text-success" />
          Images load. Scripts do not.
        </p>
      </div>
    </div>
  );
}

/** Product/collection selectors becoming real Shopify pickers. */
function SelectorVisual() {
  const rows = [
    { label: 'Products', value: 'Featured collection · 4 items' },
    { label: 'Collections', value: 'Tableware (automated)' },
    { label: 'Menu', value: 'Main navigation · 3 links' },
  ];

  return (
    <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-line bg-card shadow-[var(--app-shadow-md)]">
      <div className="border-b border-line px-3.5 py-2.5">
        <span className="text-[11.5px] font-semibold text-fg">Featured collection</span>
      </div>
      <div className="space-y-2.5 p-3.5">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[10px] font-medium text-fg-2">{row.label}</p>
            <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2">
              <ShoppingBag size={11} strokeWidth={2} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-fg">
                {row.value}
              </span>
              <Check size={11} strokeWidth={3} className="shrink-0 text-success" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line bg-elevated px-3.5 py-2">
        <p className="text-[10px] text-muted">
          Real Shopify resources — swap them without touching the design.
        </p>
      </div>
    </div>
  );
}

/**
 * Alternating rows: visual on one side, a short claim on the other. Replaces a
 * six-card grid with four mechanisms you can actually look at.
 */
export default function FeatureShowcase() {
  const rows = [
    {
      eyebrow: 'Undo',
      title: 'Every change is a version you can go back to',
      body: 'Each accepted edit saves the page behind it, so a bad direction costs one click rather than a lost afternoon.',
      visual: <RevisionVisual />,
    },
    {
      eyebrow: 'Output',
      title: 'Sections arrive with a schema, not just markup',
      body: 'Headings become settings, image slots become pickers, repeating content becomes blocks — with presets for the theme editor.',
      visual: <LiquidVisual />,
      flip: true,
    },
    {
      eyebrow: 'Safety',
      title: 'Generated code is treated as untrusted',
      body: 'The preview renders in an isolated origin with a strict policy. A section cannot run a script, reach the network, or see your keys.',
      visual: <SandboxVisual />,
    },
    {
      eyebrow: 'Ownership',
      title: 'Your catalogue stays yours, not painted into the design',
      body: 'Products, collections, and menus are references, not copies. Change the selection in Shopify and the theme follows.',
      visual: <SelectorVisual />,
      flip: true,
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      {rows.map((row) => (
        <div
          key={row.eyebrow}
          className={`flex flex-col items-center gap-8 lg:flex-row lg:gap-14 ${
            row.flip ? 'lg:flex-row-reverse' : ''
          }`}
        >
          <div className="flex w-full flex-1 items-center justify-center lg:w-0">
            {row.visual}
          </div>
          <div className="max-w-[440px] flex-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-accent-text">
              {row.eyebrow}
            </span>
            <h3 className="mt-3 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-fg sm:text-[28px]">
              {row.title}
            </h3>
            <p className="mt-3.5 text-[15px] leading-7 text-fg-2">{row.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
