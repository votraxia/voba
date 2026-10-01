# GitHub Setup — "Save theme to GitHub"

Lets a merchant commit their generated Shopify theme straight into a GitHub
repository, so the theme source is versioned and ready for review or CI. It sits
next to "Send to Shopify": the ZIP installs the theme, GitHub keeps the source
under control.

## 1. Create a token

Use a **fine-grained personal access token** so the app can only touch the
repositories you pick:

1. Open <https://github.com/settings/personal-access-tokens/new>.
2. **Token name**: e.g. `AI Shopify Theme Builder`.
3. **Expiration**: 90 days is plenty (re-push when it expires).
4. **Repository access**: *Only select repositories* → choose the repo (or repos)
   you want to commit themes into.
5. **Permissions → Repository permissions → Contents**: **Read and write**.
   Nothing else is needed — the app never reads issues, PRs, or secrets.
6. Generate, then copy the token (it is shown only once).

A classic PAT (`https://github.com/settings/tokens/new`) with the `repo` scope
also works, but it grants far more access than this feature needs — prefer the
fine-grained token above.

## 2. Add the key

In this project's environment settings (Settings → Environment), add:

```bash
GITHUB_TOKEN=github_pat_11AA...
```

The token is **server-only**: it is read exclusively by `lib/github/client.ts`
(marked `server-only`) and is never prefixed with `NEXT_PUBLIC_`, so it can
never reach the browser bundle. The editor UI only ever receives the account
login and repository metadata.

Optionally, for GitHub Enterprise Server, point the client at your instance:

```bash
GITHUB_API_BASE_URL=https://github.yourcompany.com/api/v3
```

## 3. Use it

1. In the editor, export the project to Shopify as usual (the export builds and
   validates the theme).
2. On the success screen choose **Save theme to GitHub**.
3. Pick a repository, branch, and an optional folder (e.g. `themes/my-store`).
4. **Commit theme to GitHub** — one commit containing every text theme file.

## How the commit is made

The push uses the Git Data API so the whole theme lands in a **single atomic
commit** rather than one commit per file:

1. read the branch head (`git/ref/heads/{branch}`),
2. write one tree containing every theme file, based on the current tree so the
   rest of the repository is preserved,
3. create the commit,
4. fast-forward the branch ref — or create the branch if it doesn't exist yet.

The ref update is sent with `force: false`, so a push never discards commits
someone else landed in the meantime.

## Limits and safety

- Max **300 files** and **4 MB** per push (a Shopify theme is far below this);
  each file must be under 512 KB.
- Paths are validated (no absolute paths, no `..`, no backslashes), so a push can
  only write inside the chosen folder.
- Both endpoints require a signed-in user (`requireUser`) and are rate-limited
  (30 commits and 60 status checks per hour, per user).
- GitHub error messages (bad repo, missing access, rate limit) are surfaced to
  the user verbatim.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "GitHub isn't connected yet" | `GITHUB_TOKEN` is not set in the environment. |
| "The GitHub token was rejected" | Token expired, revoked, or copied with whitespace. |
| "Resource not accessible" / 403 | The token has no **Contents: Read and write** on that repo, or the repo isn't in the token's repository selection. |
| "repository or branch was not found" | Typo in the name, or the token can't see that repo (private repos need explicit selection). |
| "no repositories the token can push to" | The account has no repos the token can write to, and all listed repos were archived. |
| GitHub rate limit | GitHub's per-token limit was hit; wait a minute. |

## Troubleshooting locally

`GET /api/github/status` returns `{ connected, account, repositories }` and
`POST /api/github/push` performs the commit. Both return `401` when called
without a bearer token.
