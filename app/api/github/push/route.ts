import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { buildCommitMessage, hasGitHubToken } from '@/lib/github/config';
import { GitHubError, commitThemeFiles, type GitHubPushFile } from '@/lib/github/client';

export const runtime = 'nodejs';

/**
 * Commit the current theme to a GitHub repository (AGENTS.md §15).
 *
 * The browser sends the already-built theme files; the server validates them,
 * then writes a single commit through the Git Data API using the server-only
 * `GITHUB_TOKEN`. Nothing about the token crosses the wire in either direction.
 */

interface PushRequestBody {
  repo?: unknown;
  branch?: unknown;
  basePath?: unknown;
  message?: unknown;
  projectName?: unknown;
  files?: unknown;
}

/** Rate limit: commits are rare and consume the token's API quota. */
const PUSH_LIMIT = 30;
const PUSH_WINDOW = 60 * 60; // per hour

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/** Narrow the untrusted `files` array to well-formed string entries. */
function parseFiles(value: unknown): GitHubPushFile[] | null {
  if (!Array.isArray(value)) return null;
  const files: GitHubPushFile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { path, contents } = entry as { path?: unknown; contents?: unknown };
    if (typeof path !== 'string' || typeof contents !== 'string') return null;
    files.push({ path, contents });
  }
  return files;
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const limit = rateLimit(`github-push:${user.id}`, PUSH_LIMIT, PUSH_WINDOW);
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many GitHub commits. Please wait a while and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!hasGitHubToken()) {
    return Response.json(
      {
        error: 'GitHub is not connected yet. Add a GITHUB_TOKEN in your environment settings.',
        code: 'not_configured',
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as PushRequestBody | null;
  const repo = typeof body?.repo === 'string' ? body.repo : '';
  const branch = typeof body?.branch === 'string' ? body.branch : '';
  const basePath = typeof body?.basePath === 'string' ? body.basePath : '';
  const message = typeof body?.message === 'string' ? body.message : '';
  const projectName = typeof body?.projectName === 'string' ? body.projectName : '';

  if (!repo) return badRequest('Choose a repository to commit the theme to.');
  const files = parseFiles(body?.files);
  if (!files || files.length === 0) {
    return badRequest('There are no theme files to commit.');
  }

  try {
    const result = await commitThemeFiles({
      repo,
      branch,
      basePath,
      message: buildCommitMessage(message, projectName),
      files,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GitHubError) {
      console.error('[github-push] failed:', err.status, err.message);
      // 4xx from GitHub means the request itself was wrong (bad repo, no
      // access, bad branch) — surface it as a client error the user can fix.
      const status = err.status >= 400 && err.status < 500 ? 400 : 502;
      return Response.json({ error: err.message }, { status });
    }
    console.error('[github-push] unexpected failure:', err);
    return Response.json({ error: 'The GitHub commit failed.' }, { status: 500 });
  }
}
