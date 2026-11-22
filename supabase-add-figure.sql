-- Full-body figure: a larger picture players see when they click a visible token.
-- Characters (and monster templates, which are characters) keep the storage path;
-- spawned monsters copy it from their template.
--
-- Run once in the Supabase SQL editor (safe to re-run) - in EVERY project the app
-- points at (production, and grim-toll-test), BEFORE deploying the app version that
-- reads these columns (v0.1.20261122f).

alter table public.characters        add column if not exists figure_url text;
alter table public.session_creatures add column if not exists figure_url text;
