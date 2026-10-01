# Project Setup

This guide walks through the full local setup for the AI Shopify Theme Builder, including environment variables, InsForge provisioning, optional billing, Shopify export storage, and project thumbnails.

## 1. Prerequisites

- Node.js 20 or newer
- npm
- An InsForge project
- A CometAPI key (https://www.cometapi.com)
- An Unsplash API access key
- Optional: Porsa account (https://porsa.io) for billing

## 2. Install dependencies

```bash
npm install
```

## 3. Create local environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then update `.env.local`.

### Required for core app usage

```bash
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
AI_PROVIDER=cometapi
AI_MODEL=gemini-2.5-flash
COMETAPI_KEY=
```

### Optional but recommended

```bash
UNSPLASH_ACCESS_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=theme-exports
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=project-thumbnails
```

### Required for billing flows

```bash
PORSA_SECRET_KEY=
PORSA_WEBHOOK_SECRET=
INSFORGE_ADMIN_KEY=
```

## 4. InsForge setup

### Public client values

Add these from your InsForge project:

- `NEXT_PUBLIC_INSFORGE_URL`: your InsForge API base URL
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`: your publishable anon key

### Admin key

For billing webhooks and server-enforced project limits, copy the `api_key` from `.insforge/project.json` into:

```bash
INSFORGE_ADMIN_KEY=
```

Keep this server-only. Never expose it to browser code.

## 5. AI provider setup

All AI calls go through [CometAPI](https://www.cometapi.com), which exposes 500+
models from every major lab through one OpenAI-compatible endpoint and one key.
The adapter lives in `lib/ai/providers/cometapi.ts`; the active provider and
model are read from environment variables so no model name is hardcoded.

1. Create an account at https://www.cometapi.com
2. Copy an API key from the dashboard (API reference: https://apidoc.cometapi.com)
3. Set it in `.env.local`:

```bash
AI_PROVIDER=cometapi
AI_MODEL=gemini-2.5-flash
COMETAPI_KEY=your_key_here
```

Supported provider in code:

- `AI_PROVIDER=cometapi`

`AI_MODEL` accepts any id from CometAPI's catalog. List them with:

```bash
curl https://api.cometapi.com/v1/models -H "Authorization: Bearer $COMETAPI_KEY"
```

Switching to a different model (for example a Claude or GPT model) only requires
changing `AI_MODEL` — no code changes. `COMETAPI_KEY` is server-only: it is read
by the server modules that call the provider and must never be exposed to the
browser (never prefix it `NEXT_PUBLIC_`).

Optional override for a proxy or self-hosted gateway:

```bash
COMETAPI_BASE_URL=https://api.cometapi.com/v1
```

### Per-project model selection

Users pick a model per project from the picker in the editor top bar. The catalog
lives in `lib/ai/models.ts` and is the allowlist for the API, so the picker and
the accepted model ids always match. The selection is stored in
`projects.ai_model` (added by
`migrations/20260929060000_add-project-ai-model.sql`) and applies to the
project's next generation, inline edit, and Shopify section conversion.

Notes:

- `AI_MODEL` remains the default for requests that don't name a model.
- A null `ai_model` (every existing project) means "use the default" — no
  backfill is needed.
- Output token ceilings differ per model. The adapter asks for a generous budget
  and, if a model rejects it, retries once with the ceiling the provider reports,
  remembering it for that model (`lib/ai/providers/cometapi.ts`). This is why
  models like `gpt-4o` (16k) work alongside Gemini (32k).

## 6. Unsplash image setup

Storefront photography is resolved from the Unsplash API. Create a free
application at https://unsplash.com/developers and set its Access Key:

```bash
UNSPLASH_ACCESS_KEY=your_access_key
```

This key is **server-only** (used by `/api/images/resolve` and the AI route's
image resolution); it must never be prefixed `NEXT_PUBLIC_`.

How it works:
- The AI marks every image it wants with a `data-image-prompt` description.
- The server matches each prompt to a real Unsplash photo (search API, cached)
  and rewrites the `<img src>` to a hotlink-safe `images.unsplash.com` URL.
- Image delivery from `images.unsplash.com` does NOT count against the API
  rate limit (50 req/hour on demo keys — only `api.unsplash.com` calls do).
- Photographer attribution is carried on every resolved photo per the Unsplash
  API guidelines.

## 7. Billing setup

Billing requires a Porsa account (Expansion plan for API access) and InsForge
admin access.

Read and complete:

- [docs/billing-setup.md](./docs/billing-setup.md)

That includes:

- creating the `subscriptions` table
- configuring Porsa webhook events (payment lifecycle)
- setting `PORSA_SECRET_KEY`
- setting `PORSA_WEBHOOK_SECRET`
- setting `INSFORGE_ADMIN_KEY`

## 8. Shopify export setup

To enable export downloads, complete:

- [docs/shopify-export-setup.md](./docs/shopify-export-setup.md)

That provisions:

- a public InsForge storage bucket, default `theme-exports`
- the `theme_exports` table

If you use a custom bucket name, set:

```bash
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=your-bucket-name
```

## 9. Project thumbnail setup

To enable dashboard preview thumbnails, complete:

- [docs/projects-thumbnails-setup.md](./docs/projects-thumbnails-setup.md)

That provisions:

- a public InsForge storage bucket, default `project-thumbnails`
- `thumbnail_url` and `thumbnail_key` columns on `projects`

If you use a custom bucket name, set:

```bash
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=your-bucket-name
```

## 10. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## 11. Validation commands

Run the available checks:

```bash
npm run lint
```

Also useful:

```bash
npm run build
```

## 12. Recommended manual test flow

After setup, verify these paths:

1. Sign up or sign in.
2. Create a project from a prompt.
3. Confirm the editor opens.
4. Trigger AI generation and verify streamed output appears in preview.
5. Switch the AI model in the model picker and confirm the next generation
   succeeds (the choice should survive a page reload).
6. Confirm the projects page loads existing projects.
7. Confirm generated storefront images resolve to real `images.unsplash.com` photos.
8. If billing is configured, verify checkout and portal routes work.
9. If Shopify export is configured, verify an export record and downloadable file are created.
10. If thumbnails are configured, verify project cards eventually show a saved preview image.

## 13. Current scripts

From `package.json`:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run smoke:backend
```

`npm run test` is the deterministic unit suite (no live AI calls).
`npm run smoke:backend` checks the live InsForge backend (auth, RLS-isolated
CRUD, admin cleanup) and cleans up after itself.

## 14. Provisioned InsForge backend

The linked InsForge project (`AI-Shopify-template-builder`) is provisioned by
the migrations in `migrations/`:

- Tables: `projects` (including the selected `ai_model`),
  `project_pages`, `project_messages`, `project_themes`,
  `project_revisions` (undo/restore snapshots), `theme_exports`,
  `subscriptions` — all owner-scoped with RLS (`auth.uid()`), and `user_id`
  defaults to `auth.uid()` so browser SDK inserts satisfy the policies.
- Public storage buckets: `theme-exports`, `project-thumbnails`.
- Auth: email verification is disabled for development
  (`require_email_verification = false` in `insforge.toml`); re-enable it for
  production via `npx -y @insforge/cli config apply` after flipping the flag.

Re-provision on a fresh backend with:

```bash
npx -y @insforge/cli db migrations up --all
npx -y @insforge/cli storage create-bucket theme-exports
npx -y @insforge/cli storage create-bucket project-thumbnails
```
