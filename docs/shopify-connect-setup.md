# Shopify Connect — "Send to Shopify" setup

This feature lets a merchant connect their Shopify store once (OAuth) and then
send an exported theme straight to their store — no manual ZIP download/upload.

## How it works

1. **Export** — the project is converted into a Shopify theme ZIP and stored in
   InsForge Storage (existing flow, unchanged). The export dialog then offers
   **"Send to Shopify store"**.
2. **Connect** — the merchant enters `{store}.myshopify.com`. We redirect them
   to Shopify's OAuth authorize page (scopes: `write_themes,read_themes`).
   After approval, Shopify redirects back to our callback, we verify the state
   (signed binding of nonce + user + returnTo) and the callback HMAC, exchange
   the code for an access token, and store it **server-side only** in the
   `shopify_connections` table. The browser never sees the token.
3. **Push** — our server calls the Shopify Admin GraphQL mutation
   `themeCreate(source: <public ZIP URL>, name: …)`. Shopify downloads the ZIP
   from InsForge Storage and imports it as an **UNPUBLISHED** theme. The
   merchant can optionally tick "Also publish it live" which then calls
   `themePublish` (replaces the live theme — explicit opt-in).

Notes from shopify.dev:

- `themeCreate` only accepts `UNPUBLISHED` (default) or `DEVELOPMENT` roles, so
  "publish" is a separate, explicit step — matching how competitors (PageFly,
  GemPages) do it.
- The ZIP URL must be publicly reachable over HTTPS — InsForge Storage's public
  bucket URL satisfies this.
- Shopify may require a **protected-data / theme-write exemption** for public
  apps. Without it, `themeCreate`/`themePublish` return an access-denied
  userError which we surface verbatim in the dialog. Custom apps created in the
  Dev Dashboard for your own stores work without an exemption.

## Prerequisites

1. A Shopify Partner account → create an **app** in the Dev Dashboard
   (<https://dev.shopify.com>).
2. In the app's **Configuration**, add the redirect URI:
   `https://YOUR-APP-DOMAIN/api/shopify/oauth/callback`
   (for local dev: `http://localhost:3000/api/shopify/oauth/callback`).
3. Request the `write_themes` and `read_themes` scopes (already the app default
   in `lib/shopify/oauth.ts`).
4. Copy the **Client ID** and **Client secret**.

## Environment variables

```bash
SHOPIFY_CLIENT_ID=          # from the Dev Dashboard
SHOPIFY_CLIENT_SECRET=      # from the Dev Dashboard (server-only)
```

Both are required for the connect flow; without them the dialog explains that
Shopify connect is not configured. Add the same keys to Vercel (or the hosting
environment) for production, and make sure the production redirect URI is added
to the app configuration.

## Database

`migrations/20261001100000_create-shopify-connections.sql` creates
`shopify_connections` (one connection per user, token columns server-only via
RLS — the app reads it exclusively through the admin client on the server).
Apply with:

```bash
npx -y @insforge/cli db migrations up --all
```

## Files

| Path | Role |
| --- | --- |
| `lib/shopify/oauth.ts` | Authorize URL, signed state, HMAC verification, token exchange |
| `lib/shopify/admin-client.ts` | `themeCreate` / `themePublish` GraphQL calls |
| `lib/shopify/connections.ts` | Server-only token repository (upsert/read/delete) |
| `app/api/shopify/oauth/install/route.ts` | Step 1: authorize URL + state cookie |
| `app/api/shopify/oauth/callback/route.ts` | Step 2: verify + exchange + store |
| `app/api/shopify/connections/route.ts` | GET status / DELETE disconnect |
| `app/api/shopify/push/route.ts` | Push the ZIP to the store (themeCreate) |
| `lib/shopify/push-client.ts` | Browser helpers (install/status/push) |
| `components/editor/ShopifyPushDialog.tsx` | Connect + push UI |
| `components/editor/ExportDialog.tsx` | "Send to Shopify store" entry point |

## Security

- Access tokens are stored server-side and never returned to the browser.
- OAuth `state` = `nonce.userId.returnTo.hmac` — the nonce is mirrored in an
  httpOnly cookie (CSRF), the HMAC (keyed with the client secret) prevents
  attributing a connection to another account, and `returnTo` is constrained to
  same-site relative paths.
- The callback verifies the request HMAC over every query parameter
  (timing-safe compare) before exchanging the code.
- Pushes are authenticated, ownership-checked, and rate-limited (10/hour/user).
