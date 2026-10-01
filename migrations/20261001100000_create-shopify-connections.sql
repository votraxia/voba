-- Shopify OAuth store connections (AGENTS.md §14/§15).
-- One connection per user; the merchant authorizes our standalone app through
-- Shopify's OAuth authorization-code flow and we persist the resulting access
-- token so "Send to Shopify" can install the theme server-side later.

create table if not exists public.shopify_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  shop_domain text not null,
  shop_name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopify_connections_user_idx
  on public.shopify_connections (user_id);

alter table public.shopify_connections enable row level security;

drop policy if exists "shopify_connections_select_own" on public.shopify_connections;
create policy "shopify_connections_select_own" on public.shopify_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "shopify_connections_insert_own" on public.shopify_connections;
create policy "shopify_connections_insert_own" on public.shopify_connections
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "shopify_connections_update_own" on public.shopify_connections;
create policy "shopify_connections_update_own" on public.shopify_connections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "shopify_connections_delete_own" on public.shopify_connections;
create policy "shopify_connections_delete_own" on public.shopify_connections
  for delete to authenticated
  using (user_id = (select auth.uid()));
