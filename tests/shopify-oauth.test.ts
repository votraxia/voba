import { describe, it, expect } from 'vitest';
import {
  SHOPIFY_SCOPES,
  buildAuthorizeUrl,
  buildState,
  createStateNonce,
  exchangeCodeForToken,
  grantedScopesSatisfy,
  isValidShopDomain,
  verifyCallbackHmac,
  verifyStateBinding,
} from '@/lib/shopify/oauth';
import { createHmac } from 'node:crypto';

const SECRET = 'test-client-secret';

/** Build a signed Shopify-style callback query for tests. */
function signedCallback(params: Record<string, string>): URLSearchParams {
  const query = new URLSearchParams(params);
  const message = Array.from(query.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  query.set('hmac', createHmac('sha256', SECRET).update(message).digest('hex'));
  return query;
}

describe('shop domain validation', () => {
  it('accepts valid myshopify.com subdomains', () => {
    expect(isValidShopDomain('my-store.myshopify.com')).toBe(true);
    expect(isValidShopDomain('a-b-c.myshopify.com')).toBe(true);
  });

  it('rejects look-alike domains, subpaths, and non-strings', () => {
    expect(isValidShopDomain('evil.example.com')).toBe(false);
    expect(isValidShopDomain('my-store.evil.com')).toBe(false);
    expect(isValidShopDomain('sub.my-store.myshopify.com')).toBe(false);
    expect(isValidShopDomain('https://my-store.myshopify.com')).toBe(false);
    expect(isValidShopDomain(undefined)).toBe(false);
    expect(isValidShopDomain(null)).toBe(false);
  });
});

describe('authorize URL', () => {
  it('builds the authorize URL with the required parameters', () => {
    const url = new URL(
      buildAuthorizeUrl({
        shop: 'my-store.myshopify.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/api/shopify/oauth/callback',
        state: 'nonce-abc',
      })
    );
    expect(url.origin).toBe('https://my-store.myshopify.com');
    expect(url.pathname).toBe('/admin/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('scope')).toBe(SHOPIFY_SCOPES);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/shopify/oauth/callback'
    );
    expect(url.searchParams.get('state')).toBe('nonce-abc');
  });
});

describe('state binding', () => {
  it('round-trips nonce, user id, and returnTo', () => {
    const nonce = createStateNonce();
    const state = buildState({
      nonce,
      userId: 'user-1',
      returnTo: '/editor/abc?tab=home',
      clientSecret: SECRET,
    });
    const binding = verifyStateBinding(state, SECRET);
    expect(binding).toEqual({
      nonce,
      userId: 'user-1',
      returnTo: '/editor/abc?tab=home',
    });
  });

  it('rejects a tampered user id', () => {
    const nonce = createStateNonce();
    const state = buildState({ nonce, userId: 'user-1', returnTo: '/editor', clientSecret: SECRET });
    const parts = state.split('.');
    const forged = `${parts[0]}.attacker-user.${parts[2]}.${parts[3]}`;
    expect(verifyStateBinding(forged, SECRET)).toBeNull();
  });

  it('rejects a wrong secret and malformed values', () => {
    const state = buildState({ nonce: 'n', userId: 'u', returnTo: '/r', clientSecret: SECRET });
    expect(verifyStateBinding(state, 'other-secret')).toBeNull();
    expect(verifyStateBinding('garbage', SECRET)).toBeNull();
    expect(verifyStateBinding('a.b.c', SECRET)).toBeNull();
  });
});

describe('callback HMAC', () => {
  it('accepts a correctly signed callback', () => {
    const query = signedCallback({
      code: 'auth-code',
      shop: 'my-store.myshopify.com',
      state: 'nonce-abc',
      timestamp: '1730000000',
    });
    expect(verifyCallbackHmac(query, SECRET)).toBe(true);
  });

  it('rejects a tampered parameter and a wrong secret', () => {
    const query = signedCallback({
      code: 'auth-code',
      shop: 'my-store.myshopify.com',
      state: 'nonce-abc',
      timestamp: '1730000000',
    });
    query.set('shop', 'attacker.myshopify.com');
    expect(verifyCallbackHmac(query, SECRET)).toBe(false);

    const original = signedCallback({
      code: 'auth-code',
      shop: 'my-store.myshopify.com',
      state: 'nonce-abc',
      timestamp: '1730000000',
    });
    expect(verifyCallbackHmac(original, 'not-the-secret')).toBe(false);
  });

  it('rejects a missing hmac', () => {
    const query = new URLSearchParams({ code: 'x', shop: 'my-store.myshopify.com' });
    expect(verifyCallbackHmac(query, SECRET)).toBe(false);
  });
});

describe('scope satisfaction', () => {
  it('accepts exact and write-satisfies-read grants', () => {
    expect(grantedScopesSatisfy('write_themes,read_themes', SHOPIFY_SCOPES)).toBe(true);
    expect(grantedScopesSatisfy('write_themes', 'write_themes,read_themes')).toBe(true);
    expect(grantedScopesSatisfy('write_themes', SHOPIFY_SCOPES)).toBe(true);
  });

  it('rejects missing required scopes', () => {
    expect(grantedScopesSatisfy('read_themes', SHOPIFY_SCOPES)).toBe(false);
    expect(grantedScopesSatisfy('', SHOPIFY_SCOPES)).toBe(false);
  });
});

describe('token exchange mapping', () => {
  it('maps an expiring token response', async () => {
    const fetchMock = globalThis.fetch as unknown as ((...args: unknown[]) => unknown);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          access_token: 'at-123',
          scope: 'write_themes',
          refresh_token: 'rt-456',
          expires_in: 86400,
        }),
        { status: 200 }
      )) as typeof fetch;
    try {
      const result = await exchangeCodeForToken({
        shop: 'my-store.myshopify.com',
        code: 'code',
        clientId: 'id',
        clientSecret: 'secret',
      });
      expect(result.accessToken).toBe('at-123');
      expect(result.refreshToken).toBe('rt-456');
      expect(result.expiresAt).toBeTruthy();
      expect(grantedScopesSatisfy(result.scope, SHOPIFY_SCOPES)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch as typeof fetch;
      void fetchMock;
    }
  });

  it('maps an offline (non-expiring) token response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: 'at-offline', scope: 'write_themes' }), {
        status: 200,
      })) as typeof fetch;
    try {
      const result = await exchangeCodeForToken({
        shop: 'my-store.myshopify.com',
        code: 'code',
        clientId: 'id',
        clientSecret: 'secret',
      });
      expect(result.accessToken).toBe('at-offline');
      expect(result.refreshToken).toBeNull();
      expect(result.expiresAt).toBeNull();
    } finally {
      globalThis.fetch = originalFetch as typeof fetch;
    }
  });

  it('throws a clear error when Shopify rejects the code', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('invalid_request', { status: 400 })) as typeof fetch;
    try {
      await expect(
        exchangeCodeForToken({
          shop: 'my-store.myshopify.com',
          code: 'bad',
          clientId: 'id',
          clientSecret: 'secret',
        })
      ).rejects.toThrow(/rejected the authorization code/);
    } finally {
      globalThis.fetch = originalFetch as typeof fetch;
    }
  });
});
