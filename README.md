<img width="1672" height="941" alt="Full Stack Shopify Theme Builder_2" src="https://github.com/user-attachments/assets/d5777d9a-9ec1-47fe-a4ac-dcc6f8b8f074" />

# AI Shopify Theme Builder

AI Shopify Theme Builder is a Next.js app for generating Shopify storefront concepts from prompts, previewing them in real time, editing sections inline, and exporting the result into Shopify-friendly theme assets.

## Requirements

- Node.js 20 or newer
- npm
- An InsForge project
- A CometAPI key (https://www.cometapi.com) for the AI models
- An Unsplash API access key (free — https://unsplash.com/developers)
- Optional: a Porsa account (https://porsa.io) for billing
- Optional: a GitHub fine-grained personal access token for committing themes

## Install

```bash
npm install
```

## Create `.env.local`

Create the local environment file:

```bash
cp .env.example .env.local
```

Then fill in the values below.

### Required keys

```bash
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
AI_PROVIDER=cometapi
AI_MODEL=gemini-2.5-flash
COMETAPI_KEY=
UNSPLASH_ACCESS_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional keys

```bash
PORSA_SECRET_KEY=
PORSA_WEBHOOK_SECRET=
INSFORGE_ADMIN_KEY=
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=theme-exports
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=project-thumbnails
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
GITHUB_TOKEN=
```

`SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` enable "Send to Shopify": the
merchant connects their store once via OAuth and exported themes are installed
directly on their store (see [docs/shopify-connect-setup.md](./docs/shopify-connect-setup.md)).

`GITHUB_TOKEN` enables "Save theme to GitHub": the exported theme is committed to
a repository in a single atomic commit, so the source is versioned and ready for
CI (see [docs/github-setup.md](./docs/github-setup.md)).

## How To Get Each API Key

### InsForge public keys

Get these from your InsForge project dashboard:

- `NEXT_PUBLIC_INSFORGE_URL`: your project API base URL
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`: your browser-safe publishable anon key

These are safe for client-side use and are required for authentication and app data access.

### InsForge admin key

Use this only for server-side features like billing webhooks and enforced project limits:

- `INSFORGE_ADMIN_KEY`

Get it from your local InsForge project config or InsForge admin/project settings. Keep it server-only and never expose it in browser code.

### CometAPI key

All AI calls go through [CometAPI](https://www.cometapi.com), a model aggregator
that exposes 500+ models (Gemini, GPT, Claude, DeepSeek, Grok, ...) behind one
OpenAI-compatible endpoint and one key.

1. Create an account at https://www.cometapi.com and copy an API key from the
dashboard (https://apidoc.cometapi.com).
2. Set it as `COMETAPI_KEY`.

Recommended defaults:

```bash
AI_PROVIDER=cometapi
AI_MODEL=gemini-2.5-flash
```

`AI_MODEL` accepts any model id from CometAPI's catalog (browse it with
`GET https://api.cometapi.com/v1/models`). Switching models is an env change
only — no code changes. `COMETAPI_KEY` is **server-only**; it must never be
prefixed `NEXT_PUBLIC_` or read from browser code.

Optional overrides:

```bash
COMETAPI_BASE_URL=https://api.cometapi.com/v1
```

#### Choosing a model per project

Each project can use a different model. The editor's top bar has a **model
picker** backed by a curated catalog in `lib/ai/models.ts` (Gemini, Claude,
DeepSeek and GPT text models) so a project can trade speed for quality without
changing any configuration. The choice is saved on the project (`projects.ai_model`)
and applies to its next generation, edit, and Shopify section conversion.

`AI_MODEL` stays the deployment default: it is used for any request that does not
name a model. The catalog is also the allowlist — the API rejects any model id
outside it, so a client can never make the server call an arbitrary model.

### Unsplash access key

Photos in generated storefronts come from the Unsplash API. Create a free application at https://unsplash.com/developers, then set:

- `UNSPLASH_ACCESS_KEY`: the application's **Access Key** (server-only — it must never appear in `NEXT_PUBLIC_*` variables or browser code)

Demo keys are rate-limited to 50 API requests/hour, so search results are cached server-side; image delivery itself (`images.unsplash.com`) is unlimited hotlinking and does not count against the quota. Photographer attribution is preserved on every resolved photo per the API guidelines.

### Porsa keys

Needed only if you want billing flows locally. Payments run through
[Porsa](https://porsa.io), a Merchant-of-Record gateway (mobile money, cards,
bank transfer, USSD) that hosts the checkout page and handles tax/compliance:

- `PORSA_SECRET_KEY`: the secret API key from your Porsa dashboard (API access
  requires Porsa's Expansion plan)
- `PORSA_WEBHOOK_SECRET`: the webhook endpoint's signing secret (see
  [docs/billing-setup.md](./docs/billing-setup.md))

Recurring billing is one payment per period: paying Monthly buys 30 days and
Yearly buys 365; the webhook extends the period on each successful payment.

### GitHub token

Needed only if you want to commit generated themes to a repository. Create a
**fine-grained** personal access token (https://github.com/settings/personal-access-tokens/new)
with **Contents: Read and write** on only the repositories you choose, then set
its value as `GITHUB_TOKEN`.

`GITHUB_TOKEN` is **server-only** — it is read exclusively by the server-side
GitHub client and never reaches browser code. The editor shows the account login
and the repository list, never the token. Optional override for GitHub
Enterprise Server:

```bash
GITHUB_API_BASE_URL=https://github.yourcompany.com/api/v3
```

## Run Locally

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local Run Steps

1. Install dependencies with `npm install`.
2. Create `.env.local` from `.env.example`.
3. Add your InsForge URL and anon key.
4. Add `AI_PROVIDER`, `AI_MODEL`, and `COMETAPI_KEY`.
5. Optionally add Porsa, GitHub, and InsForge admin values.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.
8. Sign in or sign up.
9. Create a project and test generation.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run smoke:backend
npm run smoke:images
```

`npm run test` runs the unit suite (sanitizer, scoped-edit patches, Shopify
theme validation, ZIP writer, rate limiter, Unsplash URL helpers, CometAPI
response parsing) with no live AI or network calls.
`npm run smoke:backend` verifies the provisioned InsForge backend end-to-end
(sign-up, project/page/theme/revision writes under RLS, ownership isolation,
admin cleanup) — it needs the env vars below and creates + deletes its own
test data. `npm run smoke:images` checks the live Unsplash image-resolution
route (auth, hotlink-safe URL, sizing, attribution, cache) against a running
dev server.

## Setup Guides

For full backend provisioning and feature setup, see:

- [projectsetup.md](./projectsetup.md)
- [docs/vercel-deploy.md](./docs/vercel-deploy.md) — deploy this app to Vercel
- [docs/billing-setup.md](./docs/billing-setup.md)
- [docs/shopify-connect-setup.md](./docs/shopify-connect-setup.md) — "Send to Shopify" OAuth
- [docs/github-setup.md](./docs/github-setup.md) — "Save theme to GitHub"
- [docs/shopify-export-setup.md](./docs/shopify-export-setup.md)
- [docs/projects-thumbnails-setup.md](./docs/projects-thumbnails-setup.md)
- [docs/revisions-setup.md](./docs/revisions-setup.md)

## InsForge backend (provisioned)

This repo is linked to the InsForge project **AI-Shopify-template-builder**
(`.insforge/project.json`, CLI: `npx -y @insforge/cli current`). The full SaaS
schema — `projects`, `project_pages`, `project_messages`, `project_themes`,
`project_revisions`, `theme_exports`, `subscriptions`, each with owner-only RLS
via `auth.uid()` — lives in `migrations/` and is applied with:

```bash
npx -y @insforge/cli db migrations up --all
```

Public storage buckets: `theme-exports` and `project-thumbnails`.
`.env.local` carries `NEXT_PUBLIC_INSFORGE_URL`, `NEXT_PUBLIC_INSFORGE_ANON_KEY`
(browser-safe), and `INSFORGE_ADMIN_KEY` (server-only, from
`.insforge/project.json`).
