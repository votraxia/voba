-- Follow-up migration: `user_id` DEFAULT auth.uid() on every user-owned table.
-- The app inserts through the browser SDK WITHOUT specifying user_id (the
-- column default fills it in), and the RLS WITH CHECK then matches.

alter table public.projects           alter column user_id set default auth.uid();
alter table public.project_pages      alter column user_id set default auth.uid();
alter table public.project_messages   alter column user_id set default auth.uid();
alter table public.project_themes     alter column user_id set default auth.uid();
alter table public.project_revisions  alter column user_id set default auth.uid();
alter table public.theme_exports      alter column user_id set default auth.uid();
