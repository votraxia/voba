import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Server-only Porsa client (AGENTS.md §15: secrets never reach the browser).
 *
 * Porsa (https://porsa.io) is the payment layer for this app. Per their developer
 * blueprint (https://porsa.io/blue-prints/developer-commerce-api):
 *
 * - Payments are created server-side with an API key and completed on Porsa's
 *   hosted checkout (Merchant of Record — Porsa handles tax/compliance).
 * - Every payment state change is delivered as a webhook signed with
 *   HMAC-SHA256 over the raw body; verification MUST use a timing-safe compare.
 * - Payment creation accepts an idempotency key so a retried request can never
 *   double-charge.
 *
 * Two product facts shape this adapter:
 * - Recurring billing is "Coming Soon" on every Porsa plan (their pricing page),
 *   so a subscription here is modeled as ONE payment per period. The webhook
 *   extends `current_period_end`; the billing page offers renewal when it lapses.
 * - The exact REST path/field names are pinned in ONE place (`PAYMENT_ENDPOINT`,
 *   `mapPaymentResponse`); align them with the API section of your Porsa
 *   dashboard and no other file changes.
 */

/** Resolved per call so the override works in every environment. */
function paymentEndpoint(): string {
  const base = (process.env.PORSA_API_BASE_URL ?? 'https://api.porsa.io').replace(/\/+$/, '');
  return `${base}/v1/payments`;
}

export function hasPorsaKey(): boolean {
  return Boolean(process.env.PORSA_SECRET_KEY);
}

/** True when the webhook signing secret is configured. */
export function hasPorsaWebhookSecret(): boolean {
  return Boolean(process.env.PORSA_WEBHOOK_SECRET);
}

function secretKey(): string {
  const key = process.env.PORSA_SECRET_KEY;
  if (!key) {
    throw new Error(
      'PORSA_SECRET_KEY is not set. Add it to .env.local (see docs/billing-setup.md).'
    );
  }
  return key;
}

/** The signing secret Porsa uses for webhook signatures (dashboard → webhooks). */
export function getWebhookSecret(): string {
  const secret = process.env.PORSA_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'PORSA_WEBHOOK_SECRET is not set. Add it to .env.local (see docs/billing-setup.md).'
    );
  }
  return secret;
}

export interface CreatePaymentInput {
  /** Our plan id — echoed back in the webhook so we know what was bought. */
  plan: 'monthly' | 'yearly';
  /** Human label shown on Porsa's hosted checkout. */
  productName: string;
  /** Smallest currency unit (cents), from `PLANS`. */
  amount: number;
  currency: string;
  /** Our InsForge user id — the webhook's stable way to attribute the payment. */
  userId: string;
  buyerEmail: string;
  /** Absolute URLs. Porsa redirects the buyer here when they finish or abort. */
  successUrl: string;
  cancelUrl: string;
  /** Idempotency key (we use a per-checkout UUID). Same key → same payment. */
  idempotencyKey: string;
}

export interface PorsaPayment {
  /** Porsa's payment id (e.g. `pay_...`). Persisted on our subscription row. */
  id: string;
  /** The hosted checkout URL to redirect the buyer to. */
  checkoutUrl: string;
  /** Provider status at creation time (usually `pending`). */
  status: string;
}

/**
 * Create a hosted-checkout payment. One retry on network failure/5xx (payments
 * are idempotent via the key, so a retry can't double-charge); 4xx fails fast.
 */
export async function createPayment(input: CreatePaymentInput): Promise<PorsaPayment> {
  const key = secretKey();
  const body = {
    // Amounts are sent in minor units with an explicit currency — the same
    // convention as our PLANS catalog, so no conversion happens here.
    amount: input.amount,
    currency: input.currency,
    description: input.productName,
    payment_method_types: ['mobile_money', 'card', 'bank_transfer'],
    customer: { email: input.buyerEmail || undefined },
    metadata: { insforge_user_id: input.userId, plan: input.plan },
    redirect: { success_url: input.successUrl, cancel_url: input.cancelUrl },
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(paymentEndpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastError = err;
      continue; // Network error — the idempotency key makes a retry safe.
    }

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const mapped = mapPaymentResponse(json);
      if (mapped) return mapped;
      throw new Error('Porsa returned an unreadable payment response.');
    }

    const detail = await res.text().catch(() => '');
    if (res.status < 500) {
      // Our request was wrong — retrying would just fail again.
      throw new Error(`Porsa rejected the payment (${res.status}): ${detail.slice(0, 300)}`);
    }
    lastError = new Error(`Porsa error ${res.status}: ${detail.slice(0, 300)}`);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not reach Porsa. Please try again.');
}

/** Pull `id` + hosted checkout `url` out of the documented response shapes. */
function mapPaymentResponse(json: Record<string, unknown> | null): PorsaPayment | null {
  if (!json) return null;
  const inner = (json.data ?? json) as Record<string, unknown>;
  const id = typeof inner.id === 'string' ? inner.id : null;
  const checkoutUrl =
    (typeof inner.checkout_url === 'string' && inner.checkout_url) ||
    (typeof inner.url === 'string' && inner.url) ||
    (typeof (inner.redirect as Record<string, unknown> | undefined)?.url === 'string' &&
      ((inner.redirect as Record<string, unknown>).url as string)) ||
    null;
  if (!id || !checkoutUrl) return null;
  return {
    id,
    checkoutUrl,
    status: typeof inner.status === 'string' ? inner.status : 'pending',
  };
}

/**
 * Timing-safe HMAC-SHA256 verification of a webhook (the blueprint's own rule:
 * "validate the signature... timing-safe comparison to prevent timing attacks").
 * Accepts the common header shapes: `t=<ts>,v1=<hex>` or a bare hex digest.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  if (!hasPorsaWebhookSecret()) {
    // Without the signing secret configured, no payload can be trusted.
    return false;
  }
  const expected = createHmac('sha256', getWebhookSecret()).update(rawBody).digest('hex');

  const candidates = new Set<string>([header]);
  for (const part of header.split(',')) {
    const value = part.slice(part.indexOf('=') + 1).trim();
    if (value && part.includes('=')) candidates.add(value);
  }

  for (const candidate of candidates) {
    const a = Buffer.from(candidate.toLowerCase(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** A payment event Porsa sends to our webhook endpoint. */
export interface PorsaPaymentEvent {
  type: string;
  paymentId: string;
  status: string;
  /** ISO instant the paid period starts/ends; null when the provider omits it. */
  periodStart: string | null;
  periodEnd: string | null;
  metadata: Record<string, string>;
  amount: number | null;
  currency: string | null;
}

/**
 * Normalize a webhook payload. Porsa's blueprint promises "comprehensive
 * webhook events for every payment state transition" as
 * `{ type, data: { payment } }`; the payment object is read tolerantly
 * (`data` may BE the payment, matching their bare-payload variants).
 */
export function parsePaymentEvent(rawBody: string): PorsaPaymentEvent | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = typeof json.type === 'string' ? json.type : null;
  if (!type) return null;

  const inner = (json.data ?? json) as Record<string, unknown>;
  const payment = (inner.payment ?? inner) as Record<string, unknown>;
  const paymentId = typeof payment.id === 'string' ? payment.id : null;
  if (!paymentId) return null;

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string') metadata[k] = v;
  }

  const period = (payment.current_period ?? payment.period ?? {}) as Record<string, unknown>;
  const toIso = (v: unknown): string | null => {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  return {
    type,
    paymentId,
    status: typeof payment.status === 'string' ? payment.status : '',
    periodStart: toIso(period.start ?? payment.period_start),
    periodEnd: toIso(period.end ?? payment.period_end),
    metadata,
    amount: typeof payment.amount === 'number' ? payment.amount : null,
    currency: typeof payment.currency === 'string' ? payment.currency : null,
  };
}

/** True when this event type means "the customer paid". */
export function isPaymentSucceededEvent(type: string): boolean {
  return /^(payment|checkout)\.(succeeded|completed|paid)$/.test(type);
}

/** True when this event type means the payment definitively failed. */
export function isPaymentFailedEvent(type: string): boolean {
  return /^(payment|checkout)\.(failed|declined|expired|canceled|cancelled)$/.test(type);
}
