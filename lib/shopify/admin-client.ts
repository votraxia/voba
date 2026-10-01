import 'server-only';

/**
 * Minimal Shopify Admin GraphQL client for theme install + publish. Authenticated
 * with the store's OAuth access token via `X-Shopify-Access-Token`.
 *
 *   themeCreate — creates an UNPUBLISHED theme from a public ZIP URL (Shopify
 *                 fetches and extracts it; no upload from our side needed).
 *   themePublish — makes an existing theme the store's live theme.
 *
 * Both require `write_themes`; note Shopify additionally requires a protected-
 * data exemption for theme write access on public apps — without it the
 * mutations return access-denied userErrors, which we surface verbatim.
 */

const API_VERSION = '2026-01';

export class ShopifyAdminError extends Error {}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string }>;
}

/** POST one GraphQL document to the store's Admin API. */
async function graphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new ShopifyAdminError(
      'Could not reach the Shopify Admin API. Please try again.',
      { cause }
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyAdminError(
      'The Shopify connection is no longer authorized. Reconnect your store and try again.'
    );
  }
  if (res.status === 429) {
    throw new ShopifyAdminError(
      'Shopify is rate limiting this store right now. Please try again in a moment.'
    );
  }
  if (!res.ok) {
    throw new ShopifyAdminError(`Shopify Admin API error (HTTP ${res.status}).`);
  }

  const payload = (await res.json().catch(() => null)) as GraphQLResponse<T> | null;
  if (payload?.errors?.length) {
    throw new ShopifyAdminError(payload.errors[0]?.message ?? 'Shopify Admin API error.');
  }
  if (!payload?.data) {
    throw new ShopifyAdminError('Shopify returned an unreadable response.');
  }
  return payload.data;
}

/** Flatten a mutation's userErrors into one thrown message. */
function assertNoUserErrors(
  userErrors: Array<{ field?: string[] | null; message: string }> | undefined,
  fallback: string
): void {
  if (userErrors && userErrors.length > 0) {
    const detail = userErrors
      .map((e) => (e.field?.length ? `${e.field.join('.')}: ${e.message}` : e.message))
      .join('; ');
    throw new ShopifyAdminError(detail || fallback);
  }
}

/**
 * Create an UNPUBLISHED theme on the store from a publicly-downloadable ZIP URL.
 * Returns the numeric theme id Shopify assigned.
 */
export async function createThemeFromZipUrl(input: {
  shop: string;
  accessToken: string;
  name: string;
  zipUrl: string;
}): Promise<string> {
  const data = await graphql<{
    themeCreate: {
      theme: { id: string } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    input.shop,
    input.accessToken,
    `mutation themeCreate($source: URL!, $name: String!) {
  themeCreate(source: $source, name: $name) {
    theme { id }
    userErrors { field message }
  }
}`,
    { source: input.zipUrl, name: input.name }
  );

  assertNoUserErrors(data.themeCreate?.userErrors, 'Shopify could not create the theme.');
  const themeId = data.themeCreate?.theme?.id;
  if (!themeId) {
    throw new ShopifyAdminError('Shopify did not return the created theme.');
  }
  return themeId;
}

/** Parse a `gid://shopify/OnlineStoreTheme/123` GID into its numeric id. */
export function themeNumericId(gid: string): string | null {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : null;
}

/**
 * Publish (make live) an existing theme on the store. Only the merchant should
 * ever see this happen to their live theme, so the push dialog asks before
 * calling this.
 */
export async function publishTheme(input: {
  shop: string;
  accessToken: string;
  themeId: string;
}): Promise<void> {
  const data = await graphql<{
    themePublish: {
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    input.shop,
    input.accessToken,
    `mutation themePublish($themeId: ID!) {
  themePublish(themeId: $themeId) {
    userErrors { field message }
  }
}`,
    { themeId: input.themeId }
  );

  assertNoUserErrors(data.themePublish?.userErrors, 'Shopify could not publish the theme.');
}
