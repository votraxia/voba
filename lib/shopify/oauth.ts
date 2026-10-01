import 'server-only';
import crypto from 'node:crypto';

/**
 * Shopify OAuth (authorization code grant) for a standalone app — implemented
 * exactly per shopify.dev/docs/apps/build/authentication-authorization/
 * authenticate-standalone-apps:
 *
 *   1. Redirect the merchant to https://{shop}/admin/oauth/authorize with
 *      client_id, scope, redirect_uri and a random `state` nonce.
 *   2. Shopify redirects back with code/hmac/shop/state/timestamp; verify the
 *      state against the stored nonce and the HMAC over every other parameter.
 *   3. POST the code to https://{shop}/admin/oauth/access_token to exchange it
 *      for an access token.
 *
 * Offline tokens do not expire; "expiring" tokens include a refresh token and
 * `expires_in`. Both shapes are supported here (AGENTS.md §15: server-only).
 */

/** Scopes needed to install and publish a theme. Nothing more. */
export const SHOPIFY_SCOPES = 'write_themes,read_themes';

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // expiring tokens last 24h

export class ShopifyOAuthError extends Error {}

/** Shop domains are always `{sub}.myshopify.com`. Rejects everything else. */
export function isValidShopDomain(shop: unknown): shop is string {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

/** Cryptographically-random OAuth state nonce. */
export function createStateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Build the OAuth `state` value: `nonce.userId.returnTo.signature`, where
 * signature is an HMAC of the first three parts keyed with the app's client
 * secret and `returnTo` is base64url-encoded (so it never contains a dot).
 * The nonce (mirrored in an httpOnly cookie) stops login-CSRF; the signature
 * stops a crafted state from attributing the connection to another account;
 * `returnTo` sends the merchant back to the exact editor page they left.
 */
export function buildState(input: {
  nonce: string;
  userId: string;
  returnTo: string;
  clientSecret: string;
}): string {
  const returnToB64 = Buffer.from(input.returnTo, 'utf8').toString('base64url');
  const message = `${input.nonce}.${input.userId}.${returnToB64}`;
  const signature = crypto.createHmac('sha256', input.clientSecret).update(message).digest('hex');
  return `${message}.${signature}`;
}

/**
 * Verify a state value returned by Shopify: split it, re-sign the recovered
 * parts, and compare signatures timing-safely. Returns the bound values, or
 * null when tampered with or malformed.
 */
export function verifyStateBinding(
  state: string,
  clientSecret: string
): { nonce: string; userId: string; returnTo: string } | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;

  const [nonce, userId, returnToB64, signature] = parts;
  if (!nonce || !userId || !returnToB64 || !signature) return null;

  const message = `${nonce}.${userId}.${returnToB64}`;
  const expectedSig = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    return null;
  }

  const returnTo = Buffer.from(returnToB64, 'base64url').toString('utf8');
  return { nonce, userId, returnTo };
}

/**
 * Build the authorization URL the merchant is redirected to. `redirectUri` must
 * exactly match a redirect allowlisted in the app's Dev Dashboard config.
 */
export function buildAuthorizeUrl(input: {
  shop: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `https://${input.shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the callback's `hmac` query parameter: Shopify signs every parameter
 * EXCEPT `hmac` itself, sorted alphabetically, joined as k=v with &. The
 * comparison must be timing-safe (AGENTS.md §15).
 */
export function verifyCallbackHmac(query: URLSearchParams, clientSecret: string): boolean {
  const hmac = query.get('hmac') ?? '';
  if (!hmac) return false;

  const message = Array.from(query.entries())
    .filter(([key]) => key !== 'hmac')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  const digestBuf = Buffer.from(digest, 'utf8');
  const hmacBuf = Buffer.from(hmac, 'utf8');
  return digestBuf.length === hmacBuf.length && crypto.timingSafeEqual(digestBuf, hmacBuf);
}

/** Normalized result of a token exchange. */
export interface ShopifyTokenResult {
  accessToken: string;
  scope: string;
  /** Present only for "expiring" tokens (expiring=1 exchanges). */
  refreshToken: string | null;
  /** When the access token expires, or null for offline (non-expiring) tokens. */
  expiresAt: Date | null;
}

interface RawTokenResponse {
  access_token?: unknown;
  scope?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

/** True when every scope the app requested was granted. */
export function grantedScopesSatisfy(granted: string, requested: string): boolean {
  const grantedSet = new Set(
    granted
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return requested
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((scope) => {
      if (grantedSet.has(scope)) return true;
      // Shopify grants write_* together with its read_* twin; a returned
      // write_* satisfies a requested read_*.
      return scope.startsWith('read_') && grantedSet.has(`write_${scope.slice(5)}`);
    });
}

/**
 * Exchange an authorization code for an access token. Tolerant of both offline
 * (non-expiring) and expiring token responses.
 */
export async function exchangeCodeForToken(input: {
  shop: string;
  code: string;
  clientId: string;
  clientSecret: string;
}): Promise<ShopifyTokenResult> {
  let res: Response;
  try {
    res = await fetch(`https://${input.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    throw new ShopifyOAuthError(
      'Could not reach Shopify to complete the connection. Please try again.',
      { cause }
    );
  }

  if (!res.ok) {
    throw new ShopifyOAuthError(
      `Shopify rejected the authorization code (HTTP ${res.status}). Start the connection again.`
    );
  }

  const raw = (await res.json().catch(() => null)) as RawTokenResponse | null;
  const accessToken = typeof raw?.access_token === 'string' ? raw.access_token : '';
  if (!accessToken) {
    throw new ShopifyOAuthError('Shopify returned an unreadable token response.');
  }

  const expiresIn = Number(raw?.expires_in);
  const refreshToken = typeof raw?.refresh_token === 'string' ? raw.refresh_token : null;

  return {
    accessToken,
    scope: typeof raw?.scope === 'string' ? raw.scope : '',
    refreshToken,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : refreshToken
          ? new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)
          : null,
  };
}
