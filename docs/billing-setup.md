# Billing & subscriptions setup (Porsa + InsForge)

This wires up the subscription system: Free / Monthly ($9.99) / Yearly ($99.99)
plans, Porsa hosted checkout, webhooks, and server-enforced project limits.
Complete these one-time steps before the feature works.

Porsa (https://porsa.io) is a Merchant-of-Record payment platform for African
markets: mobile money (M-Pesa, MTN, Orange, Airtel), cards, bank transfer, and
USSD. Porsa handles tax, compliance, and invoicing — you never touch card data.

> **How billing works with Porsa.** Automatic recurring billing is "Coming Soon"
> on Porsa's plans, so a subscription here is one payment per period: paying for
> Monthly buys 30 days, Yearly buys 365. The webhook extends
> `current_period_end` on every successful payment; when a period lapses, the
> entitlement drops to Free and the billing page offers "pay for the next
> period". This is enforced from Porsa's own event data — no local grants.

## 1. Create the `subscriptions` table (InsForge)

Run the SQL migrations in `migrations/` (the CLI applies them all):

```bash
npx -y @insforge/cli db migrations up --all
```

One row per user; only the user can read their own row, and only the service
key (webhook / server routes) can write it. The payment-provider columns are
`porsa_customer_id` and `porsa_payment_id`.

## 2. Porsa dashboard

1. Create a Porsa account and a business (https://porsa.io).
2. **API access requires the Expansion plan** (per Porsa's pricing page) — API
   access + advanced webhooks are gated on it. Contact Porsa sales if the API
   section is not visible in your dashboard.
3. Copy the **secret API key** (server-only) from the dashboard's API section.
4. Register a **webhook endpoint** pointing at
   `https://<your-domain>/api/billing/webhook` and subscribe to the payment
   lifecycle events (`payment.succeeded`, `payment.failed`, and their
   `checkout.*` aliases — all are handled). Copy the endpoint's **signing
   secret**.

## 3. Environment variables (`.env.local`, server-only)

```bash
# Porsa — never expose these to the browser (no NEXT_PUBLIC_ prefix).
PORSA_SECRET_KEY=<secret API key from the dashboard>
PORSA_WEBHOOK_SECRET=<webhook signing secret>

# Optional overrides
# PORSA_API_BASE_URL=https://api.porsa.io     # sandbox/proxy override
# PORSA_DASHBOARD_URL=https://dashboard.porsa.io  # "Manage billing" link target

# InsForge admin (service) key — the `api_key` from .insforge/project.json.
# Server-only: bypasses RLS, used by the webhook and project-limit routes.
INSFORGE_ADMIN_KEY=ik_xxx

# Public base URL used for checkout success/cancel redirects.
# Optional in dev (falls back to the request origin / http://localhost:3000).
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 4. Local webhook testing

```bash
# Sign a payload the way Porsa does (HMAC-SHA256 over the raw body) and deliver it:
node -e '
const { createHmac } = require("crypto");
const body = JSON.stringify({
  type: "payment.succeeded",
  data: { id: "pay_test", status: "succeeded",
    metadata: { insforge_user_id: "<USER_ID>", plan: "monthly" },
    current_period: { start: new Date().toISOString(),
      end: new Date(Date.now() + 30*864e5).toISOString() } }
});
const sig = createHmac("sha256", process.env.PORSA_WEBHOOK_SECRET).update(body).digest("hex");
fetch("http://localhost:3000/api/billing/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-porsa-signature": `t=0,v1=${sig}` },
  body }).then(r => r.text()).then(console.log);
'
```

The user's subscription row flips to `active` and their entitlement unlocks.

## 5. How enforcement works

- **Project limit** — creation goes through `POST /api/projects`, which verifies
  the user's token, computes their entitlement (subscription + live project
  count), and rejects Free users at 2 projects with HTTP 402. The client maps
  402 to an upgrade dialog. The browser cannot bypass this.
- **Shopify export** — gated in the editor by the server-provided entitlement
  (`canExport`); Free users see the upgrade dialog instead of the export flow.
- **Premium AI models** — gated server-side per request (`lib/ai/model-access.ts`)
  from the same entitlement.
- **Sync** — the webhook mirrors every Porsa payment event into the
  `subscriptions` table, so permissions update automatically after checkout or
  a failure. A lapsed period is dropped by the entitlement check itself.
- **Cancel** — with Porsa there is no provider-side cancel call; cancelling
  marks the period as not-to-be-renewed, and access runs until
  `current_period_end`. Paying again at any time continues the subscription.

## 6. Aligning the API contract

Porsa's REST paths/field names are pinned in ONE file, `lib/billing/porsa.ts`
(`paymentEndpoint`, `mapPaymentResponse`, `parsePaymentEvent`). If your
dashboard's API reference shows different paths or field names, adjust there —
no other file needs to change. The checkout route sends an idempotency key so
network retries can never double-charge.
