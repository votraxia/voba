-- Per-project AI model selection.
--
-- Stores the CometAPI model id a project generates with, so the choice follows
-- the project across devices and sessions. Nullable with no default: a null
-- value means "no explicit choice yet" and the app falls back to its standard
-- default model. Adding the column is backwards compatible, so existing
-- projects keep generating exactly as before.
--
-- Values are validated against the curated model catalog at the API boundary
-- (lib/ai/models.ts), not by a database constraint, so retiring or adding a
-- model never requires a migration.

alter table public.projects
  add column if not exists ai_model text;

comment on column public.projects.ai_model is
  'CometAPI model id used for this project''s generation; null = app default.';
