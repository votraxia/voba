# Revisions & version history setup

The builder saves a full page snapshot every time the AI changes the build, so
users can undo and restore any previous state (AGENTS.md §8: every accepted
edit must create a revision). The table is provisioned automatically by the
repository's migration `migrations/20260928202105_create-saas-tables.sql` —
this doc explains how it works and how to verify it.

## 1. What gets provisioned

```sql
create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Update',
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_revisions enable row level security;

create policy "project_revisions_select_own" on public.project_revisions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "project_revisions_insert_own" on public.project_revisions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "project_revisions_delete_own" on public.project_revisions
  for delete to authenticated using (user_id = (select auth.uid()));
```

If you provisioned the backend before this feature existed, apply it with:

```bash
npx -y @insforge/cli db migrations up --all
```

## 2. How it works

- **Automatic snapshots** — before every AI turn the current pages are copied
  into a `pre-turn` snapshot. When the turn completes and persists, that
  snapshot is written as a revision labeled with the user's prompt.
- **Manual snapshots** — the "Save version" action captures the current state
  on demand.
- **Restore is reversible** — restoring a revision first snapshots the current
  state as "Before restore", then rewrites the project's pages to match.
- **History is capped** — the editor shows the last 30 revisions, newest first.

## 3. Where the code lives

| Concern | File |
| --- | --- |
| Repository (all DB access) | `lib/revisions.ts` |
| Pre-turn snapshot + persist integration | `components/editor/BuilderContext.tsx` |
| History popover / restore UI | `components/editor/EditorTopBar.tsx` |

## 4. Verify

1. Generate a page with the AI.
2. Open the **Version history** (clock icon) in the editor top bar — a revision
   labeled with your prompt should appear.
3. Make another change, then **Restore** the first revision — the preview
   reverts, and a "Before restore" entry is added.
4. Reload the page — the restored state persists (revisions rewrite
   `project_pages`, not just the client state).
