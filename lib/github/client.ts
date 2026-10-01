import 'server-only';

import {
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  MAX_FILE_BYTES,
  MAX_PUSH_FILES,
  MAX_TOTAL_BYTES,
  isSafeThemePath,
  normalizeBasePath,
  normalizeBranch,
  parseRepoSlug,
} from './config';

/**
 * Server-only GitHub REST client (AGENTS.md §15).
 *
 * Used by the "Save theme to GitHub" flow so a generated Shopify theme can be
 * committed straight into the user's repository — version control for the
 * theme source, which the ZIP download alone doesn't give you.
 *
 * SECURITY: the token is read from `GITHUB_TOKEN` here and nowhere else. This
 * module is `server-only`, the routes that call it authenticate the caller with
 * `requireUser` and rate-limit them, and no exported value ever contains the
 * token — callers get repository metadata and commit SHAs, nothing secret.
 *
 * We deliberately use the low-level Git Data API (blobs → tree → commit → ref)
 * rather than the Contents API: a theme is ~30–80 files, and the Contents API
 * would make one commit per file. One tree write produces a single, atomic
 * commit containing the whole theme.
 */

export class GitHubError extends Error {
  /** GitHub's HTTP status, or 0 for a network/timeout failure. */
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** A repository the configured token can write to. */
export interface GitHubRepository {
  /** `owner/name` — the value users recognize and type. */
  fullName: string;
  /** Whether the repo is private (matters for how we describe the push). */
  isPrivate: boolean;
  defaultBranch: string;
  /** Last push time, used to sort/label the picker. */
  pushedAt: string | null;
}

/** The authenticated GitHub account behind `GITHUB_TOKEN`. */
export interface GitHubViewer {
  login: string;
  name: string | null;
}

/** Result of committing a theme to a repository. */
export interface GitHubCommitResult {
  owner: string;
  name: string;
  branch: string;
  /** Short SHA shown in the UI. */
  commitSha: string;
  /** Web URL of the new commit. */
  commitUrl: string;
  /** How many theme files were written. */
  fileCount: number;
  /** True when the branch had to be created for this commit. */
  createdBranch: boolean;
}

/** One file in a push. Contents are always text (Shopify theme sources). */
export interface GitHubPushFile {
  path: string;
  contents: string;
}

/** The token, or a clear error naming the env var to set. */
function requireToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new GitHubError(
      'GitHub is not connected yet. Add a GITHUB_TOKEN in your environment settings.'
    );
  }
  return token;
}

/** URL-encode a single path segment (branch names may contain slashes). */
function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

/**
 * One authenticated GitHub API call. Returns the parsed JSON body, or throws a
 * GitHubError carrying GitHub's own message so the UI can surface something
 * actionable (e.g. "Resource not accessible by integration").
 */
async function githubFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Resolve the token BEFORE the network call so a missing-token error is not
  // swallowed by the generic "could not reach GitHub" catch below.
  const token = requireToken();
  const url = `${GITHUB_API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        Authorization: `Bearer ${token}`,
        'User-Agent': 'ai-shopify-theme-builder',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new GitHubError('Could not reach GitHub. Please try again.', 0);
  }

  if (res.status === 204) return {} as T;

  const payload = (await res.json().catch(() => null)) as T | GitHubErrorBody | null;

  if (res.ok) return payload as T;

  const detail = (payload as GitHubErrorBody | null)?.message ?? '';
  if (res.status === 401) {
    throw new GitHubError(
      'The GitHub token was rejected. Create a new one and update GITHUB_TOKEN.',
      res.status
    );
  }
  if (res.status === 403) {
    const limited = /rate limit/i.test(detail);
    throw new GitHubError(
      limited
        ? 'GitHub is rate limiting this token right now. Please try again in a minute.'
        : `GitHub denied the request${detail ? `: ${detail}` : '.'}`,
      res.status
    );
  }
  if (res.status === 404) {
    throw new GitHubError(
      'That repository or branch was not found. Check the name and that the token can access it.',
      res.status
    );
  }
  throw new GitHubError(detail || `GitHub request failed (HTTP ${res.status}).`, res.status);
}

/** Identify the account the token belongs to (used by the status endpoint). */
export async function getViewer(): Promise<GitHubViewer> {
  const data = await githubFetch<{ login?: string; name?: string | null }>('/user');
  if (!data?.login) {
    throw new GitHubError('GitHub did not return an account for this token.');
  }
  return { login: data.login, name: data.name ?? null };
}

interface RepoListItem {
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  pushed_at?: string | null;
  archived?: boolean;
}

/**
 * Repositories the token can push to, most recently pushed first. Archived
 * repos are excluded — a push to one fails with an opaque 403.
 */
export async function listRepositories(limit = 50): Promise<GitHubRepository[]> {
  const items = await githubFetch<RepoListItem[]>(
    `/user/repos?per_page=${Math.min(Math.max(limit, 1), 100)}&sort=pushed&affiliation=owner,collaborator,organization_member`
  );
  if (!Array.isArray(items)) return [];

  return items
    .filter((repo) => repo.full_name && !repo.archived)
    .slice(0, limit)
    .map((repo) => ({
      fullName: repo.full_name as string,
      isPrivate: Boolean(repo.private),
      defaultBranch: repo.default_branch || 'main',
      pushedAt: repo.pushed_at ?? null,
    }));
}

/** HEAD commit of a branch, or null when the branch does not exist yet. */
async function getBranchHead(
  owner: string,
  name: string,
  branch: string
): Promise<string | null> {
  try {
    const data = await githubFetch<{ object?: { sha?: string } }>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/git/ref/heads/${encodeSegment(branch)}`
    );
    return data?.object?.sha ?? null;
  } catch (err) {
    // 404 = no such branch. 409 = the repository is still empty (GitHub reports
    // "Git Repository is empty" with a 409 rather than a 404 for an unborn
    // branch). Both mean the same thing here: there is no commit to build on,
    // so the push must create the branch as the repo's first commit.
    if (err instanceof GitHubError && (err.status === 404 || err.status === 409)) return null;
    throw err;
  }
}

/** Validate + cap the incoming file list before any network call. */
function prepareFiles(files: GitHubPushFile[]): GitHubPushFile[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new GitHubError('There are no theme files to push.');
  }
  if (files.length > MAX_PUSH_FILES) {
    throw new GitHubError(
      `This theme has ${files.length} files, which is over the ${MAX_PUSH_FILES}-file limit for one push.`
    );
  }

  let total = 0;
  const prepared: GitHubPushFile[] = [];
  for (const file of files) {
    const path = typeof file?.path === 'string' ? file.path.trim() : '';
    const contents = typeof file?.contents === 'string' ? file.contents : null;
    if (contents === null || !isSafeThemePath(path)) {
      throw new GitHubError('The theme file list contains an invalid path.');
    }
    const bytes = new TextEncoder().encode(contents).byteLength;
    if (bytes > MAX_FILE_BYTES) {
      throw new GitHubError(`${path} is too large to push to GitHub.`);
    }
    total += bytes;
    prepared.push({ path, contents });
  }

  if (total > MAX_TOTAL_BYTES) {
    throw new GitHubError('This theme is too large to push to GitHub in one commit.');
  }
  return prepared;
}

/**
 * Commit a theme's files to a repository branch in a single commit.
 *
 * Steps (Git Data API): read the branch head → write one tree containing every
 * theme file → create the commit → fast-forward the branch ref (or create the
 * branch when it doesn't exist yet). Passing the current tree as `base_tree`
 * means the rest of the repository is preserved and only theme files change.
 */
export async function commitThemeFiles(input: {
  /** `owner/name` — validated, never interpolated raw. */
  repo: string;
  branch?: string | null;
  /** Optional folder inside the repo, e.g. "themes/my-store". */
  basePath?: string | null;
  message: string;
  files: GitHubPushFile[];
}): Promise<GitHubCommitResult> {
  const slug = parseRepoSlug(input.repo);
  if (!slug) {
    throw new GitHubError('Enter a repository as owner/name, for example octocat/storefront.');
  }

  const branch = normalizeBranch(input.branch ?? '');
  const basePath = normalizeBasePath(input.basePath);
  const files = prepareFiles(input.files);
  const owner = slug.owner;
  const name = slug.name;

  const headSha = await getBranchHead(owner, name, branch);

  // One tree write uploads every file atomically. `content` is inlined, so no
  // per-file blob requests are needed for a theme-sized commit.
  const tree = await githubFetch<{ sha?: string }>(
    `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(headSha ? { base_tree: headSha } : {}),
        tree: files.map((file) => ({
          path: basePath ? `${basePath}/${file.path}` : file.path,
          mode: '100644',
          type: 'blob',
          content: file.contents,
        })),
      }),
    }
  );
  if (!tree?.sha) {
    throw new GitHubError('GitHub did not return a tree for this push.');
  }

  const commit = await githubFetch<{ sha?: string; html_url?: string }>(
    `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: input.message,
        tree: tree.sha,
        ...(headSha ? { parents: [headSha] } : {}),
      }),
    }
  );
  if (!commit?.sha) {
    throw new GitHubError('GitHub did not return a commit for this push.');
  }

  if (headSha) {
    // Fast-forward the existing branch to the new commit. `force: false` means a
    // push never discards commits somebody else landed in the meantime.
    await githubFetch<void>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/git/refs/heads/${encodeSegment(branch)}`,
      { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }
    );
  } else {
    await githubFetch<void>(`/repos/${encodeSegment(owner)}/${encodeSegment(name)}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return {
    owner,
    name,
    branch,
    commitSha: commit.sha.slice(0, 7),
    commitUrl: commit.html_url ?? `https://github.com/${owner}/${name}/commit/${commit.sha}`,
    fileCount: files.length,
    createdBranch: !headSha,
  };
}
