import { insforge } from '@/lib/insforge';
import { buildCommitMessage } from './config';
import type { ThemeFile } from '@/lib/shopify/types';

/**
 * Browser-side helpers for the "Save theme to GitHub" flow (AGENTS.md §15: the
 * browser only ever talks to our own API routes — never to GitHub directly, and
 * never holding a token). `GITHUB_TOKEN` stays on the server; the client just
 * sends theme files and renders the result.
 */

/** Asynchronous bearer token for API calls, matching lib/projects.ts. */
async function authorizationHeader(): Promise<Record<string, string>> {
  const token = await insforge.getHttpClient().getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GitHub connection status, as returned by `GET /api/github/status`. */
export interface GitHubStatus {
  /** True when a server-side token is configured and working. */
  connected: boolean;
  account: { login: string; name: string | null } | null;
  repositories: Array<{
    fullName: string;
    isPrivate: boolean;
    defaultBranch: string;
    pushedAt: string | null;
  }>;
}

/** Result of a successful theme commit. */
export interface GitHubCommitResponse {
  ok: true;
  owner: string;
  name: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  fileCount: number;
  createdBranch: boolean;
}

/**
 * Convert built theme files into pushable `{ path, contents }` pairs. Binary
 * files (image assets kept as Uint8Array) are skipped — a Shopify theme's
 * sources and CSS are all text, and skipping keeps the payload JSON-safe.
 */
export function toPushFiles(files: ThemeFile[]): Array<{ path: string; contents: string }> {
  return files
    .filter((file) => typeof file.contents === 'string')
    .map((file) => ({ path: file.path, contents: file.contents as string }));
}

export async function fetchGitHubStatus(): Promise<GitHubStatus> {
  const res = await fetch('/api/github/status', { headers: await authorizationHeader() });
  if (!res.ok) {
    throw new Error('Could not check your GitHub connection.');
  }
  return (await res.json()) as GitHubStatus;
}

/**
 * Commit the theme to a repository. Throws with a server-provided message so
 * the dialog can show exactly what GitHub objected to.
 */
export async function commitThemeToGitHub(input: {
  repo: string;
  branch?: string;
  basePath?: string;
  message?: string;
  projectName: string;
  files: Array<{ path: string; contents: string }>;
}): Promise<GitHubCommitResponse> {
  const res = await fetch('/api/github/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authorizationHeader()),
    },
    body: JSON.stringify({
      repo: input.repo,
      branch: input.branch ?? '',
      basePath: input.basePath ?? '',
      message: buildCommitMessage(input.message, input.projectName),
      projectName: input.projectName,
      files: input.files,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Saving the theme to GitHub failed.');
  }
  return payload as GitHubCommitResponse;
}
