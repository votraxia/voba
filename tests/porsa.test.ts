import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPayment,
  isPaymentFailedEvent,
  isPaymentSucceededEvent,
  parsePaymentEvent,
  verifyWebhookSignature,
} from '../lib/billing/porsa';
import { createHmac } from 'node:crypto';

/**
 * Deterministic tests for the Porsa payment adapter (AGENTS.md §18: no live
 * payment calls in the default suite). `fetch` is stubbed for creation, and
 * webhook verification is exercised with locally computed HMAC signatures —
 * the exact scheme Porsa's blueprint mandates (HMAC-SHA256, timing-safe).
 */

const KEY = 'test-porsa-key';
const WEBHOOK_SECRET = 'whsec_test_porsa';

/** Sign a body the way Porsa's blueprint describes. */
function sign(raw: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

/** A successful payment-creation response body ({ data: {...} } shape). */
function paymentCreated(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: {
      id: 'pay_test_123',
      status: 'pending',
      checkout_url: 'https://checkout.porsa.io/pay/pay_test_123',
      ...overrides,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.PORSA_SECRET_KEY = KEY;
  process.env.PORSA_WEBHOOK_SECRET = WEBHOOK_SECRET;
  delete process.env.PORSA_API_BASE_URL;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORSA_SECRET_KEY;
  delete process.env.PORSA_WEBHOOK_SECRET;
  delete process.env.PORSA_API_BASE_URL;
});

const baseInput = {
  plan: 'monthly' as const,
  productName: 'Shopify Theme Builder — Monthly',
  amount: 999,
  currency: 'usd',
  userId: 'user-1',
  buyerEmail: 'user@example.com',
  successUrl: 'https://app.test/billing?checkout=success',
  cancelUrl: 'https://app.test/billing?checkout=cancelled',
  idempotencyKey: 'idem-1',
};

describe('createPayment', () => {
  it('throws a clear error when PORSA_SECRET_KEY is missing', async () => {
    delete process.env.PORSA_SECRET_KEY;
    await expect(createPayment(baseInput)).rejects.toThrow(/PORSA_SECRET_KEY is not set/);
  });

  it('POSTs to the payments endpoint with bearer auth and an idempotency key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(paymentCreated()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const payment = await createPayment(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.porsa.io/v1/payments');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-1');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.amount).toBe(999);
    expect(body.currency).toBe('usd');
    expect(body.metadata).toMatchObject({ insforge_user_id: 'user-1', plan: 'monthly' });

    expect(payment.id).toBe('pay_test_123');
    expect(payment.checkoutUrl).toContain('checkout.porsa.io');
  });

  it('honours PORSA_API_BASE_URL', async () => {
    process.env.PORSA_API_BASE_URL = 'https://sandbox.porsa.io/api/';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(paymentCreated()), { status: 201 })
    );
    await createPayment(baseInput);
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.porsa.io/api/v1/payments');
  });

  it('does not retry a 4xx — a rejected request would be rejected again', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"bad request"}', { status: 400 }));
    await expect(createPayment(baseInput)).rejects.toThrow(/Porsa rejected the payment \(400\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on a 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream down', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(paymentCreated()), { status: 201 })
      );

    const payment = await createPayment(baseInput);
    expect(payment.id).toBe('pay_test_123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a helpful error when the response has no checkout URL', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'pay_1' } }), { status: 201 })
    );
    await expect(createPayment(baseInput)).rejects.toThrow(/unreadable payment response/);
  });
});

describe('verifyWebhookSignature', () => {
  const raw = JSON.stringify({ type: 'payment.succeeded', data: { id: 'pay_1' } });

  it('accepts a correctly signed payload', () => {
    expect(verifyWebhookSignature(raw, sign(raw))).toBe(true);
  });

  it('accepts a t=timestamp,v1=hex style header', () => {
    const header = `t=1727600000,v1=${sign(raw)}`;
    expect(verifyWebhookSignature(raw, header)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    expect(verifyWebhookSignature(raw, sign(raw, 'wrong-secret'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(raw);
    const tampered = raw.replace('succeeded', 'failed');
    expect(verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(raw, null)).toBe(false);
  });

  it('rejects short/garbage signatures without throwing', () => {
    expect(verifyWebhookSignature(raw, 'x')).toBe(false);
    expect(verifyWebhookSignature(raw, '')).toBe(false);
  });
});

describe('parsePaymentEvent', () => {
  const succeeded = JSON.stringify({
    type: 'payment.succeeded',
    data: {
      id: 'pay_abc',
      status: 'succeeded',
      amount: 999,
      currency: 'usd',
      metadata: { insforge_user_id: 'user-1', plan: 'monthly' },
      current_period: { start: '2026-09-29T00:00:00Z', end: '2026-10-29T00:00:00Z' },
    },
  });

  it('parses a successful payment event', () => {
    const event = parsePaymentEvent(succeeded);
    expect(event).toMatchObject({
      type: 'payment.succeeded',
      paymentId: 'pay_abc',
      status: 'succeeded',
      periodStart: '2026-09-29T00:00:00.000Z',
      periodEnd: '2026-10-29T00:00:00.000Z',
    });
    expect(event?.metadata.plan).toBe('monthly');
    expect(event?.amount).toBe(999);
  });

  it('accepts a bare payload where data IS the payment', () => {
    const raw = JSON.stringify({
      type: 'payment.succeeded',
      id: 'pay_bare',
      status: 'succeeded',
      period_end: '2026-11-01T00:00:00Z',
    });
    const event = parsePaymentEvent(raw);
    expect(event?.paymentId).toBe('pay_bare');
    expect(event?.periodEnd).toBe('2026-11-01T00:00:00.000Z');
  });

  it('returns null for malformed JSON, a missing type, or a missing payment id', () => {
    expect(parsePaymentEvent('not json')).toBeNull();
    expect(parsePaymentEvent(JSON.stringify({ data: { id: 'pay_1' } }))).toBeNull();
    expect(parsePaymentEvent(JSON.stringify({ type: 'payment.succeeded' }))).toBeNull();
  });

  it('coerces non-string metadata values instead of passing them through', () => {
    const raw = JSON.stringify({
      type: 'payment.succeeded',
      id: 'pay_m',
      metadata: { plan: 'yearly', attempts: 2, nested: { a: 1 } },
    });
    expect(parsePaymentEvent(raw)?.metadata).toEqual({ plan: 'yearly' });
  });
});

describe('event classification', () => {
  it('treats success variants as paid', () => {
    for (const type of ['payment.succeeded', 'checkout.completed', 'payment.paid']) {
      expect(isPaymentSucceededEvent(type)).toBe(true);
    }
  });

  it('treats failure variants as failed', () => {
    for (const type of ['payment.failed', 'checkout.expired', 'payment.canceled', 'payment.declined']) {
      expect(isPaymentFailedEvent(type)).toBe(true);
    }
  });

  it('does not mix the two categories', () => {
    expect(isPaymentSucceededEvent('payment.failed')).toBe(false);
    expect(isPaymentFailedEvent('payment.succeeded')).toBe(false);
    expect(isPaymentSucceededEvent('refund.processed')).toBe(false);
  });
});
