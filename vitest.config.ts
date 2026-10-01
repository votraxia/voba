import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit-test config for the builder's pure logic layers (AGENTS.md §18):
 * AI output validation, sanitization, patch application, Shopify theme
 * validation, and ZIP creation. No live AI calls — everything is deterministic.
 *
 * The `server-only` package throws when imported outside a React Server
 * Components bundle, so it is aliased to a no-op for tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
