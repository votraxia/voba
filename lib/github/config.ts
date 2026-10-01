/**
 * Shared configuration + validation for the GitHub integration.
 *
 * Kept isomorphic (no `server-only`, no React) so the browser can validate a
 * repo slug or theme path the same way the server does — one set of rules, one
 * place to tighten (AGENTS.md §17).
 *
 * The GitHub token itself is read only by `lib/github/client.ts` (server-only)
 * and is never prefixed with `NEXT_PUBLIC_`, so it can never reach the browser
 * bundle (AGENTS.md §15).
 */

/** GitHub REST API root. Overridable for GitHub Enterprise Server. */
export const GITHUB_API_BASE = (
  process.env.GITHUB_API_BASE_URL?.trim() || 'https://api.github.com'
).replace(/\/+$/, '');

/** Pinned REST API version so behaviour can't drift under us. */
export const GITHUB_API_VERSION = '2022-11-28';

/**
 * Hard limits on a single push. A Shopify theme is a few dozen small text
 * files; these caps stop an oversized or malformed request from burning API
 * quota (or tripping GitHub's own tree limits) before any network call.
 */
export const MAX_PUSH_FILES = 300;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** Repo slugs are `owner/name` — GitHub allows [A-Za-z0-9._-] in each segment. */
const SLUG_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** True when a GitHub token is configured in the server environment. */
export function hasGitHubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

/**
 * Parse a user-typed `owner/name` slug (or a full github.com URL) into its two
 * segments. Returns null for anything that isn't a plausible repository
 * identifier — the value ends up in a request path, so it is validated here
 * rather than escaped and trusted downstream.
 */
export function parseRepoSlug(input: string): { owner: string; name: string } | null {
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!trimmed) return null;

  const parts = trimmed.split('/');
  if (parts.length !== 2) return null;

  const [owner, name] = parts;
  if (!SLUG_SEGMENT.test(owner) || !SLUG_SEGMENT.test(name)) return null;
  if (owner.length > 100 || name.length > 100) return null;
  return { owner, name };
}

/**
 * Validate a branch name. Rejects empty values, whitespace-only names, and
 * anything GitHub forbids (`..`, leading/trailing slashes, control characters),
 * so a bad branch can't be smuggled into a ref path.
 */
export function normalizeBranch(input: string, fallback = 'main'): string {
  const trimmed = input.trim().replace(/^refs\/heads\//i, '');
  if (!trimmed || trimmed.length > 255) return fallback;
  if (/[\s~^:?*[\\\u0000-\u001f]/.test(trimmed)) return fallback;
  if (trimmed.includes('..')) return fallback;
  if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.endsWith('.')) return fallback;
  if (trimmed.endsWith('.lock')) return fallback;
  return trimmed;
}

/**
 * Normalize an optional folder inside the repository that theme files are
 * written under. Returns '' for the repo root. Traversal segments, absolute
 * paths and backslashes are rejected rather than sanitized, so a bad value is
 * a clear 400 instead of a surprising write location.
 */
export function normalizeBasePath(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  if (trimmed.split('/').some((segment) => segment === '.' || segment === '..' || !segment)) {
    return '';
  }
  return trimmed.slice(0, 200);
}

/**
 * Validate one theme-relative file path. Only forward-slash, printable,
 * relative paths are allowed; this is the same rule set used to build the theme
 * ZIP, so a pushed path always matches what was exported.
 */
export function isSafeThemePath(path: string): boolean {
  if (!path || path.length > 255) return false;
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  if (/^[A-Za-z]:/.test(path)) return false; // windows drive letter
  if (/[\u0000-\u001f]/.test(path)) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Build a commit message from a user-supplied one plus a project fallback. */
export function buildCommitMessage(input: string | null | undefined, projectName: string): string {
  const trimmed = (input ?? '').trim().replace(/\s+/g, ' ');
  const fallback = `Update Shopify theme: ${(projectName || 'storefront').trim() || 'storefront'}`;
  const message = trimmed || fallback;
  return message.slice(0, 200);
}
