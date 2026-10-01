import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCommitMessage,
  hasGitHubToken,
  isSafeThemePath,
  normalizeBasePath,
  normalizeBranch,
  parseRepoSlug,
} from '@/lib/github/config';
import { GitHubError, commitThemeFiles, getViewer, listRepositories } from '@/lib/github/client';

const originalFetch = globalThis.fetch;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
});

/** Route a stubbed fetch by method + URL so multi-step flows can be asserted. */
function mockFetch(routes: Array<{ match: RegExp; status?: number; payload: unknown }>) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });

    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ message: `No stub for ${method} ${url}` }), {
        status: 500,
      });
    }
    return new Response(JSON.stringify(route.payload), { status: route.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

describe('parseRepoSlug', () => {
  it('accepts owner/name and github.com URLs', () => {
    expect(parseRepoSlug('votraxia/shopify-theme-builder')).toEqual({
      owner: 'votraxia',
      name: 'shopify-theme-builder',
    });
    expect(parseRepoSlug(' https://github.com/octo/My_Theme.git ')).toEqual({
      owner: 'octo',
      name: 'My_Theme',
    });
  });

  it('rejects anything that is not exactly two safe segments', () => {
    expect(parseRepoSlug('owner')).toBeNull();
    expect(parseRepoSlug('a/b/c')).toBeNull();
    expect(parseRepoSlug('own er/repo')).toBeNull();
    expect(parseRepoSlug('owner/repo?x=1')).toBeNull();
    expect(parseRepoSlug('../../etc/passwd')).toBeNull();
    expect(parseRepoSlug('')).toBeNull();
  });
});

describe('normalizeBranch', () => {
  it('keeps valid names and strips the ref prefix', () => {
    expect(normalizeBranch('main')).toBe('main');
    expect(normalizeBranch('  refs/heads/feature/theme  ')).toBe('feature/theme');
  });

  it('falls back when the name is unusable', () => {
    expect(normalizeBranch('')).toBe('main');
    expect(normalizeBranch('   ')).toBe('main');
    expect(normalizeBranch('bad..branch')).toBe('main');
    expect(normalizeBranch('/leading')).toBe('main');
    expect(normalizeBranch('trailing/')).toBe('main');
    expect(normalizeBranch('has space')).toBe('main');
    expect(normalizeBranch('theme.lock')).toBe('main');
    expect(normalizeBranch('', 'release')).toBe('release');
  });
});

describe('normalizeBasePath', () => {
  it('normalizes folders and defaults to the repo root', () => {
    expect(normalizeBasePath(' themes/my-store/ ')).toBe('themes/my-store');
    expect(normalizeBasePath('/themes/')).toBe('themes');
    expect(normalizeBasePath('')).toBe('');
    expect(normalizeBasePath(undefined)).toBe('');
  });

  it('rejects traversal instead of sanitizing it', () => {
    expect(normalizeBasePath('../secrets')).toBe('');
    expect(normalizeBasePath('themes/../../etc')).toBe('');
    expect(normalizeBasePath('themes//nested')).toBe('');
  });
});

describe('isSafeThemePath', () => {
  it('accepts theme-relative paths', () => {
    expect(isSafeThemePath('sections/home-hero.liquid')).toBe(true);
    expect(isSafeThemePath('config/settings_data.json')).toBe(true);
  });

  it('rejects absolute, traversal and control-character paths', () => {
    expect(isSafeThemePath('/etc/passwd')).toBe(false);
    expect(isSafeThemePath('../outside.liquid')).toBe(false);
    expect(isSafeThemePath('sections/../../outside.liquid')).toBe(false);
    expect(isSafeThemePath('windows\\path.liquid')).toBe(false);
    expect(isSafeThemePath('C:/windows')).toBe(false);
    expect(isSafeThemePath('bad\u0000name.liquid')).toBe(false);
    expect(isSafeThemePath('')).toBe(false);
  });
});

describe('buildCommitMessage', () => {
  it('uses the message when given, otherwise a project-derived fallback', () => {
    expect(buildCommitMessage('  Ship   the  hero ', 'Store')).toBe('Ship the hero');
    expect(buildCommitMessage('', 'My Store')).toBe('Update Shopify theme: My Store');
    expect(buildCommitMessage(null, '')).toBe('Update Shopify theme: storefront');
  });

  it('caps the message length', () => {
    expect(buildCommitMessage('x'.repeat(500), 'Store')).toHaveLength(200);
  });
});

describe('hasGitHubToken', () => {
  it('reflects the environment', () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    expect(hasGitHubToken()).toBe(true);
    process.env.GITHUB_TOKEN = '   ';
    expect(hasGitHubToken()).toBe(false);
  });
});

describe('getViewer / listRepositories', () => {
  it('returns the authenticated account', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    mockFetch([{ match: /\/user$/, payload: { login: 'votraxia', name: 'Victor' } }]);
    await expect(getViewer()).resolves.toEqual({ login: 'votraxia', name: 'Victor' });
  });

  it('skips archived repositories', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    mockFetch([
      {
        match: /\/user\/repos/,
        payload: [
          { full_name: 'a/one', private: false, default_branch: 'main', archived: false },
          { full_name: 'a/two', archived: true },
        ],
      },
    ]);
    await expect(listRepositories()).resolves.toEqual([
      { fullName: 'a/one', isPrivate: false, defaultBranch: 'main', pushedAt: null },
    ]);
  });

  it('maps a rejected token to an actionable message', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    mockFetch([{ match: /\/user$/, status: 401, payload: { message: 'Bad credentials' } }]);
    await expect(getViewer()).rejects.toThrow(/token was rejected/);
  });

  it('explains rate limiting', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    mockFetch([
      { match: /\/user$/, status: 403, payload: { message: 'API rate limit exceeded' } },
    ]);
    await expect(getViewer()).rejects.toThrow(/rate limiting/);
  });

  it('refuses to call GitHub when no token is configured', async () => {
    process.env.GITHUB_TOKEN = '';
    await expect(getViewer()).rejects.toThrow(/GITHUB_TOKEN/);
  });
});

describe('commitThemeFiles', () => {
  const FILES = [
    { path: 'layout/theme.liquid', contents: '<html>' },
    { path: 'config/settings_data.json', contents: '{}' },
  ];

  it('writes one tree, one commit and fast-forwards the branch', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const calls = mockFetch([
      {
        match: /git\/ref\/heads\/main$/,
        payload: { object: { sha: 'base-sha' } },
      },
      { match: /git\/trees$/, payload: { sha: 'tree-sha' } },
      {
        match: /git\/commits$/,
        payload: { sha: 'commit-sha-1234567890', html_url: 'https://github.com/o/r/commit/x' },
      },
      { match: /git\/refs\/heads\/main$/, payload: {} },
    ]);

    const result = await commitThemeFiles({
      repo: 'o/r',
      branch: 'main',
      message: 'Ship it',
      files: FILES,
    });

    expect(result).toEqual({
      owner: 'o',
      name: 'r',
      branch: 'main',
      commitSha: 'commit-',
      commitUrl: 'https://github.com/o/r/commit/x',
      fileCount: 2,
      createdBranch: false,
    });

    const treeCall = calls.find((c) => c.url.endsWith('/git/trees'));
    expect(treeCall?.body).toMatchObject({
      base_tree: 'base-sha',
      tree: [
        { path: 'layout/theme.liquid', mode: '100644', type: 'blob', content: '<html>' },
        { path: 'config/settings_data.json', mode: '100644', type: 'blob', content: '{}' },
      ],
    });

    const commitCall = calls.find((c) => c.url.endsWith('/git/commits'));
    expect(commitCall?.body).toMatchObject({
      message: 'Ship it',
      tree: 'tree-sha',
      parents: ['base-sha'],
    });

    // The ref update must not force-push over somebody else's commits.
    const refCall = calls.find((c) => c.method === 'PATCH');
    expect(refCall?.body).toMatchObject({ sha: 'commit-sha-1234567890', force: false });
  });

  it('creates the branch when it does not exist yet', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const calls = mockFetch([
      { match: /git\/ref\/heads\/theme-start$/, status: 404, payload: { message: 'Not Found' } },
      { match: /git\/trees$/, payload: { sha: 'tree-sha' } },
      { match: /git\/commits$/, payload: { sha: 'first-commit-sha' } },
      { match: /git\/refs$/, payload: { ref: 'refs/heads/theme-start' } },
    ]);

    const result = await commitThemeFiles({
      repo: 'o/r',
      branch: 'theme-start',
      message: 'First theme',
      files: FILES,
    });

    expect(result.createdBranch).toBe(true);
    const commitCall = calls.find((c) => c.url.endsWith('/git/commits'));
    // The very first commit in a repo has no parent.
    expect(commitCall?.body).not.toHaveProperty('parents');
    const refCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/refs'));
    expect(refCall?.body).toEqual({ ref: 'refs/heads/theme-start', sha: 'first-commit-sha' });
  });

  it('writes theme files under the requested folder', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    const calls = mockFetch([
      { match: /git\/ref\/heads\//, payload: { object: { sha: 'base-sha' } } },
      { match: /git\/trees$/, payload: { sha: 'tree-sha' } },
      { match: /git\/commits$/, payload: { sha: 'sha' } },
      { match: /git\/refs\//, payload: {} },
    ]);

    await commitThemeFiles({
      repo: 'o/r',
      branch: 'main',
      basePath: 'themes/store',
      message: 'm',
      files: FILES,
    });

    const treeCall = calls.find((c) => c.url.endsWith('/git/trees'));
    expect((treeCall?.body as { tree: Array<{ path: string }> }).tree[0].path).toBe(
      'themes/store/layout/theme.liquid'
    );
  });

  it('rejects a bad repo slug before touching the network', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;

    await expect(
      commitThemeFiles({ repo: 'not a slug', message: 'm', files: FILES })
    ).rejects.toThrow(/owner\/name/);
    expect(called).toBe(false);
  });

  it('rejects unsafe file paths before touching the network', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;

    await expect(
      commitThemeFiles({
        repo: 'o/r',
        message: 'm',
        files: [{ path: '../escape.liquid', contents: 'x' }],
      })
    ).rejects.toBeInstanceOf(GitHubError);
    expect(called).toBe(false);
  });

  it('rejects an empty file list', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    await expect(commitThemeFiles({ repo: 'o/r', message: 'm', files: [] })).rejects.toThrow(
      /no theme files/i
    );
  });

  it('surfaces a missing repository as a 404-style error', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    mockFetch([
      { match: /git\/ref\/heads\//, status: 404, payload: { message: 'Not Found' } },
      { match: /git\/trees$/, status: 404, payload: { message: 'Repository not found' } },
    ]);

    const error = await commitThemeFiles({
      repo: 'o/missing',
      branch: 'main',
      message: 'm',
      files: FILES,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).status).toBe(404);
  });
});
