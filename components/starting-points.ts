import { Box, Grid3x3, LayoutTemplate, ShoppingCart } from 'lucide-react';

/**
 * The four storefront pages the builder can start from (product spec §"First
 * version pages"). Shared by the landing page's hero composer and the in-app
 * dashboard, so both surfaces offer the same written briefs and drive the same
 * real generation flow.
 */
const startingPoints = [
  {
    id: 'home',
    label: 'Home page',
    title: 'Landing page',
    desc: 'Hero, featured products, and a closing call to action.',
    icon: LayoutTemplate,
    colour: 'bg-[#fff0ec] text-[#f05a32]',
    prompt:
      'Build a high-converting Shopify home page for a modern direct-to-consumer brand: a full-width hero with a lifestyle photo, a featured collection grid, a brand story block, customer reviews, and a strong newsletter call to action.',
  },
  {
    id: 'product',
    label: 'Product page',
    title: 'Product page',
    desc: 'Gallery, variants, add-to-cart, and related products.',
    icon: Box,
    colour: 'bg-[#f0e9ff] text-[#7c5cf0]',
    prompt:
      'Build a Shopify product page with a large image gallery, price and variant selectors, add-to-cart, shipping and returns details, and a related products row.',
  },
  {
    id: 'collection',
    label: 'Collection page',
    title: 'Collection page',
    desc: 'Filterable product grid with sorting and pagination.',
    icon: Grid3x3,
    colour: 'bg-[#eaffef] text-[#2f9e5d]',
    prompt:
      'Build a Shopify collection page with a filterable product grid, sorting controls, pagination, and a collection header that explains the edit.',
  },
  {
    id: 'cart',
    label: 'Cart page',
    title: 'Cart page',
    desc: 'Line items, order summary, and a clear checkout path.',
    icon: ShoppingCart,
    colour: 'bg-[#fff7e7] text-[#c47c0a]',
    prompt:
      'Build a Shopify cart page with editable line items, an order summary, a promo code field, trust badges, and a prominent checkout button.',
  },
];

export type StartingPoint = (typeof startingPoints)[number];

export { startingPoints };
