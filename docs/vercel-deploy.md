# Deploying to Vercel

The app is a standard Next.js 16 App Router project, so it deploys to Vercel
with zero code changes. `vercel.json` pins the install/build commands; Vercel
detects the framework automatically.

## 1. Import the repository

1. Push this repo to GitHub (Freebuff's Changes panel can commit and push).
2. Go to https://vercel.com/import, pick the repo, and accept the defaults.
   Vercel reads `vercel.json` and runs `npm install` → `next build`.

Every branch/PR gets a preview deployment with a shareable URL; merges to the
production branch deploy to production.

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables (or
`vercel env add KEY production` from the CLI). Values differ from the sandbox
`.env.local` — production needs its own InsForge URL/anon key or you will point
production users at your dev backend.

Required:

```bash
NEXT_PUBLIC_INSFORGE_URL=https://<your-project>.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=<browser-safe anon key>
AI_PROVIDER=cometapi
AI_MODEL=gemini-2.5-flash
COMETAPI_KEY=<server-only>
UNSPLASH_ACCESS_KEY=<server-only>
```

Optional / recommended in production:

```bash
# Public origin used for Porsa checkout success/cancel redirects. Without it the app
# falls back to the request origin, which is your Vercel domain.
NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app

PORSA_SECRET_KEY=<secret API key>
PORSA_WEBHOOK_SECRET=whsec_xxx
INSFORGE_ADMIN_KEY=ik_xxx          # server-side entitlement + webhook reads
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=theme-exports
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=project-thumbnails

# Raise the AI request timeout for slow models (ms; defaults 120s non-stream /
# 90s to-first-byte on streams).
COMETAPI_TIMEOUT_MS=180000
COMETAPI_STREAM_TIMEOUT_MS=180000
```

Server-only keys (`COMETAPI_KEY`, `UNSPLASH_ACCESS_KEY`, `PORSA_*`,
`INSFORGE_ADMIN_KEY`) must never be exposed to the browser — do not give them a
`NEXT_PUBLIC_` prefix (AGENTS.md §15).

## 3. Porsa webhook

Point the webhook endpoint at the production domain:

```text
https://<your-app>.vercel.app/api/billing/webhook
```

Subscribe to the payment lifecycle events listed in
[docs/billing-setup.md](./billing-setup.md) and copy the signing secret into
`PORSA_WEBHOOK_SECRET`.

## 4. Post-deploy checks

1. Open `https://<your-app>.vercel.app/` — the marketing page should render.
2. Sign in and create a project; confirm the InsForge backend is reachable.
3. Generate a page (exercises the AI route and Unsplash resolution).
4. Export a Shopify theme (exercises the admin-key entitlement check).

## CLI deploys (optional)

```bash
npm i -g vercel
vercel link
vercel env add COMETAPI_KEY production
vercel --prod
```

The Hobby plan is free for personal/non-commercial use; commercial use requires
the Pro plan (https://vercel.com/pricing).
