-- Grim Toll test project, patch 2: columns production has that the repo's .sql files don't create.
-- Run any time after supabase-stage1.sql. Safe to re-run.

alter table public.map_tokens add column if not exists conditions jsonb not null default '[]'::jsonb;

alter table public.maps add column if not exists walls jsonb not null default '[]'::jsonb;

alter table public.session_creatures
  add column if not exists sex        text  default '',
  add column if not exists age        text  default 'Adult',
  add column if not exists height     text  default 'Average',
  add column if not exists build      text  default 'Average',
  add column if not exists social     text  default 'Balanced',
  add column if not exists mental     text  default 'Balanced',
  add column if not exists skills     jsonb default '{}'::jsonb,
  add column if not exists armor      jsonb default '{}'::jsonb,
  add column if not exists held_items jsonb default '{}'::jsonb,
  add column if not exists body_type  text  default 'Humanoid',
  add column if not exists damage     jsonb not null default '{}'::jsonb,
  add column if not exists weapons    jsonb not null default '[]'::jsonb,
  add column if not exists equipment  jsonb not null default '[]'::jsonb;

-- characters.* (also in the earlier patch; repeated so this file stands alone)
alter table public.characters add column if not exists is_template      boolean default false;
alter table public.characters add column if not exists damage           jsonb   not null default '{}'::jsonb;
alter table public.characters add column if not exists last_campaign_id uuid;
alter table public.characters add column if not exists notes            text    not null default '';

-- The app listens for live changes to characters; the repo SQL only publishes tokens/creatures/campaigns/documents.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'characters') then
    alter publication supabase_realtime add table public.characters;
  end if;
end $$;
