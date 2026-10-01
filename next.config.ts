import type { NextConfig } from "next";

/**
 * Security headers (AGENTS.md §15). The app renders untrusted, AI-generated
 * HTML inside a sandboxed iframe and talks to InsForge/ImageKit/Stripe — so we
 * lock down framing, referrers, and script/object sources while allowing the
 * specific external origins the product needs (ImageKit image delivery,
 * Unsplash/Picsum placeholders in previews, and Stripe's inline frames).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      // Next.js needs inline/eval scripts in dev; keep prod tight but allow the
      // inline bootstrap Next emits.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    // Generated storefronts and this marketing page pull real photography from
    // Unsplash (hotlinked, per their API guidelines). next/image asks for the
    // exact hostname rather than trusting every remote source.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
