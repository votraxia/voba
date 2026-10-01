import { NextRequest, NextResponse } from 'next/server';
import { buildAuthorizeUrl, buildState, createStateNonce, isValidShopDomain } from '@/lib/shopify/oauth';
import { requireUser } from '@/lib/server/auth';

export const runtime = 'nodejs';

/**
 * Step 1 of Shopify OAuth (AGENTS.md §15): the signed-in merchant gives us their
 * shop domain; we hand back Shopify's authorization URL to redirect them to.
 *
 * The `state` parameter carries `nonce.userId.signature` (HMAC'd with the app
 * secret) and the nonce is mirrored in an httpOnly cookie — the callback route
 * requires the cookie, the nonce, and the signature to all match, which blocks
 * login-CSRF and state tampering (binding the connection to the right user).
 */
export async function POST(req: NextRequest) {
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    return Response.json(
      { error: 'Shopify connect is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    { shop?: unknown; returnTo?: unknown } | null;
  const shop = body?.shop;

  if (!isValidShopDomain(shop)) {
    return Response.json(
      { error: 'Enter your store address, e.g. my-store.myshopify.com.' },
      { status: 400 }
    );
  }

  // Where to send the merchant after Shopify redirects back. Only same-site
  // relative paths are accepted — never an off-site redirect target.
  const rawReturnTo = typeof body?.returnTo === 'string' ? body.returnTo : '';
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo
    : '/dashboard';

  const nonce = createStateNonce();
  const state = buildState({
    nonce,
    userId: user.id,
    returnTo,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const redirectUri = `${req.nextUrl.origin}/api/shopify/oauth/callback`;

  const response = NextResponse.json({
    authorizeUrl: buildAuthorizeUrl({
      shop,
      clientId: process.env.SHOPIFY_CLIENT_ID,
      redirectUri,
      state,
    }),
  });

  // The raw nonce rides in an httpOnly cookie for the callback to compare
  // against the state's nonce part. Short-lived: consumed within 10 minutes.
  response.cookies.set('shopify_oauth_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  return response;
}
