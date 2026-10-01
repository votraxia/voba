-- AI Shopify Theme Builder — full SaaS schema (AGENTS.md §14)
-- Tables: projects, project_pages, project_messages, project_themes,
--         project_revisions, theme_exports, subscriptions
-- Every user-owned table is RLS-scoped to its owner via auth.uid().

-- ============================================================
-- projects — one row per user project
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  prompt text,
  status text not null default 'draft',
  thumbnail_url text,
  thumbnail_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- project_pages — generated page tabs (HTML per page)
-- ============================================================
create table if not exists public.project_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_key text not null,
  label text not null,
  type text not null,
  path text not null,
  html text not null default '',
  status text not null default 'idle',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, page_key)
);

create index if not exists project_pages_project_idx on public.project_pages (project_id, position);

alter table public.project_pages enable row level security;

drop policy if exists "project_pages_select_own" on public.project_pages;
create policy "project_pages_select_own" on public.project_pages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "project_pages_insert_own" on public.project_pages;
create policy "project_pages_insert_own" on public.project_pages
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "project_pages_update_own" on public.project_pages;
create policy "project_pages_update_own" on public.project_pages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "project_pages_delete_own" on public.project_pages;
create policy "project_pages_delete_own" on public.project_pages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- project_messages — AI chat history
-- ============================================================
create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_messages_project_idx on public.project_messages (project_id, position);

alter table public.project_messages enable row level security;

drop policy if exists "project_messages_select_own" on public.project_messages;
create policy "project_messages_select_own" on public.project_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "project_messages_insert_own" on public.project_messages;
create policy "project_messages_insert_own" on public.project_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "project_messages_delete_own" on public.project_messages;
create policy "project_messages_delete_own" on public.project_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- project_themes — ONE global stylesheet per project
-- ============================================================
create table if not exists public.project_themes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  css text not null default '',
  style_guide text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_themes enable row level security;

drop policy if exists "project_themes_select_own" on public.project_themes;
create policy "project_themes_select_own" on public.project_themes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "project_themes_insert_own" on public.project_themes;
create policy "project_themes_insert_own" on public.project_themes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "project_themes_update_own" on public.project_themes;
create policy "project_themes_update_own" on public.project_themes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "project_themes_delete_own" on public.project_themes;
create policy "project_themes_delete_own" on public.project_themes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- project_revisions — full page snapshots for undo/restore (AGENTS.md §8)
-- ============================================================
create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Update',
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_project_idx
  on public.project_revisions (project_id, created_at desc);

alter table public.project_revisions enable row level security;

drop policy if exists "project_revisions_select_own" on public.project_revisions;
create policy "project_revisions_select_own" on public.project_revisions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "project_revisions_insert_own" on public.project_revisions;
create policy "project_revisions_insert_own" on public.project_revisions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "project_revisions_delete_own" on public.project_revisions;
create policy "project_revisions_delete_own" on public.project_revisions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- theme_exports — one current Shopify ZIP export per project
-- ============================================================
create table if not exists public.theme_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_key text not null,
  download_url text not null,
  status text not null default 'ready',
  file_size bigint not null default 0,
  theme_version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.theme_exports enable row level security;

drop policy if exists "theme_exports_select_own" on public.theme_exports;
create policy "theme_exports_select_own" on public.theme_exports
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "theme_exports_insert_own" on public.theme_exports;
create policy "theme_exports_insert_own" on public.theme_exports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "theme_exports_update_own" on public.theme_exports;
create policy "theme_exports_update_own" on public.theme_exports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "theme_exports_delete_own" on public.theme_exports;
create policy "theme_exports_delete_own" on public.theme_exports
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- subscriptions — Stripe billing state, one row per user.
-- Users read their own row; ALL writes go through the server
-- (admin key / Stripe webhook), so there are no client write policies.
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free',
  billing_interval text,
  status text not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- updated_at triggers (skip if the system helper is absent)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'system' and p.proname = 'update_updated_at') then
    execute 'create or replace trigger projects_updated_at before update on public.projects
             for each row execute function system.update_updated_at()';
    execute 'create or replace trigger project_pages_updated_at before update on public.project_pages
             for each row execute function system.update_updated_at()';
    execute 'create or replace trigger project_themes_updated_at before update on public.project_themes
             for each row execute function system.update_updated_at()';
    execute 'create or replace trigger theme_exports_updated_at before update on public.theme_exports
             for each row execute function system.update_updated_at()';
    execute 'create or replace trigger subscriptions_updated_at before update on public.subscriptions
             for each row execute function system.update_updated_at()';
  end if;
end $$;
