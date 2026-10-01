import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { hasGitHubToken } from '@/lib/github/config';
import { GitHubError, getViewer, listRepositories } from '@/lib/github/client';

export const runtime = 'nodejs';

/**
 * GitHub connection status for the signed-in user (AGENTS.md §15).
 *
 * Returns whether a token is configured, which account it belongs to, and the
 * repositories the user can push to. The token itself never appears in the
 * response — only the public login and repo metadata. When no token is
 * configured we return `connected: false` instead of an error, so the UI can
 * explain the missing key rather than showing a failure.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const limit = rateLimit(`github-status:${user.id}`, 60, 60 * 60);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many GitHub checks. Please wait a while and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!hasGitHubToken()) {
    return Response.json({ connected: false, account: null, repositories: [] });
  }

  try {
    const [viewer, repositories] = await Promise.all([getViewer(), listRepositories()]);
    return Response.json({ connected: true, account: viewer, repositories });
  } catch (err) {
    console.error('[github-status] failed:', err);
    if (err instanceof GitHubError && err.status === 401) {
      return Response.json(
        { error: err.message, code: 'invalid_token' },
        { status: 401 }
      );
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to reach GitHub.' },
      { status: 502 }
    );
  }
}
