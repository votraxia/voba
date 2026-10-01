import { NextRequest, NextResponse } from 'next/server';
import {
  SHOPIFY_SCOPES,
  exchangeCodeForToken,
  grantedScopesSatisfy,
  isValidShopDomain,
  verifyCallbackHmac,
  verifyStateBinding,
} from '@/lib/shopify/oauth';
import { upsertConnection } from '@/lib/shopify/connections';
import { getAdminClient } from '@/lib/billing/admin';

export const runtime = 'nodejs';

/**
 * Step 2 of Shopify OAuth (AGENTS.md §15). Shopify redirects here with
 * code/hmac/shop/state/timestamp. Every parameter is validated before the code
 * is exchanged: the `state` nonce against the httpOnly cookie, then the request
 * HMAC against the client secret (timing-safe). The access token is stored
 * server-side (never sent to the browser) and the merchant is redirected back
 * to the editor with the outcome in the query string.
 */

function redirectToEditor(origin: string, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'not-configured' });
  }

  const { code, shop, state } = Object.fromEntries(req.nextUrl.searchParams.entries());

  if (!code || !shop || !state) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'missing-params' });
  }
  if (!isValidShopDomain(shop)) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'bad-shop' });
  }

  // CSRF check: the state's nonce part must match the httpOnly cookie from the
  // install step, and the state's HMAC signature must verify, recovering the
  // user id the connection is attributed to (bound at install time).
  const cookieState = req.cookies.get('shopify_oauth_state')?.value ?? '';
  if (!cookieState) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'state-missing' });
  }

  const binding = verifyStateBinding(state, process.env.SHOPIFY_CLIENT_SECRET);
  if (!binding || binding.nonce !== cookieState) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'state-mismatch' });
  }
  const userId = binding.userId;

  // Return the merchant to the page they launched the connect from (the state
  // is signed, so this value is trusted; it was restricted to a relative path
  // at install time).
  const successPath = binding.returnTo.startsWith('/')
    ? binding.returnTo
    : '/dashboard';

  // Request-integrity check: Shopify signed every other query parameter.
  if (!verifyCallbackHmac(req.nextUrl.searchParams, process.env.SHOPIFY_CLIENT_SECRET)) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'bad-hmac' });
  }

  let token;
  try {
    token = await exchangeCodeForToken({
      shop,
      code,
      clientId: process.env.SHOPIFY_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    });
  } catch (err) {
    console.error('[shopify-oauth] token exchange failed:', err);
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'token-exchange' });
  }

  if (!grantedScopesSatisfy(token.scope, SHOPIFY_SCOPES)) {
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'missing-scopes' });
  }

  try {
    await upsertConnection({
      admin: getAdminClient(),
      userId,
      shopDomain: shop,
      shopName: shop.replace(/\.myshopify\.com$/, ''),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
    });
  } catch (err) {
    console.error('[shopify-oauth] saving connection failed:', err);
    return redirectToEditor(origin, '/dashboard', { shopify: 'error', reason: 'save-failed' });
  }

  const response = redirectToEditor(origin, successPath, { shopify: 'connected', shop });
  response.cookies.delete('shopify_oauth_state');
  return response;
}
