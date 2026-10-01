import { afterEach, describe, expect, it } from 'vitest';
import { createThemeFromZipUrl, publishTheme, themeNumericId } from '@/lib/shopify/admin-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOnce(payload: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), { status })) as typeof fetch;
}

const ARGS = {
  shop: 'my-store.myshopify.com',
  accessToken: 'token-123',
  name: 'My theme',
  zipUrl: 'https://storage.example.com/theme.zip',
};

describe('themeNumericId', () => {
  it('parses Shopify GIDs', () => {
    expect(themeNumericId('gid://shopify/OnlineStoreTheme/1049083724')).toBe('1049083724');
    expect(themeNumericId('not-a-gid')).toBeNull();
  });
});

describe('createThemeFromZipUrl', () => {
  it('creates a theme and returns its id', async () => {
    mockFetchOnce({
      data: {
        themeCreate: {
          theme: { id: 'gid://shopify/OnlineStoreTheme/111' },
          userErrors: [],
        },
      },
    });
    const id = await createThemeFromZipUrl(ARGS);
    expect(id).toBe('gid://shopify/OnlineStoreTheme/111');
  });

  it('surfaces userErrors (e.g. missing theme write exemption)', async () => {
    mockFetchOnce({
      data: {
        themeCreate: {
          theme: null,
          userErrors: [{ field: ['source'], message: 'Access denied for themeCreate field.' }],
        },
      },
    });
    await expect(createThemeFromZipUrl(ARGS)).rejects.toThrow(
      /source: Access denied for themeCreate field/
    );
  });

  it('maps 401/403 to a reconnect message', async () => {
    mockFetchOnce({ errors: [{ message: 'bad token' }] }, 401);
    await expect(createThemeFromZipUrl(ARGS)).rejects.toThrow(/no longer authorized/);
  });

  it('maps 429 to a rate-limit message', async () => {
    mockFetchOnce({}, 429);
    await expect(createThemeFromZipUrl(ARGS)).rejects.toThrow(/rate limit/i);
  });
});

describe('publishTheme', () => {
  it('publishes without error on success', async () => {
    mockFetchOnce({ data: { themePublish: { userErrors: [] } } });
    await expect(
      publishTheme({ shop: ARGS.shop, accessToken: ARGS.accessToken, themeId: 'gid://shopify/OnlineStoreTheme/111' })
    ).resolves.toBeUndefined();
  });

  it('surfaces publish userErrors', async () => {
    mockFetchOnce({
      data: { themePublish: { userErrors: [{ message: 'Theme not found.' }] } },
    });
    await expect(
      publishTheme({ shop: ARGS.shop, accessToken: ARGS.accessToken, themeId: '123' })
    ).rejects.toThrow(/Theme not found/);
  });
});
