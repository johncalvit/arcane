-- Core Rules: a numbered, published copy of the game config that every campaign
-- GM can review and merge into their own campaign's config.
--
--   * core_rules         one row per published version (full config as JSON)
--   * core_rules_owners  the accounts allowed to publish a new version
--
-- Everyone signed in can READ published Core Rules (so any GM can see that an
-- update exists and review it); only listed owners can PUBLISH. A campaign's own
-- config is still only writable by that campaign's GM (see
-- supabase-game-configs-rls.sql) — "applying" an update just means the GM saving
-- the merged result to their own config, so nothing here can touch another
-- GM's campaign.
--
-- Run this once in the Supabase SQL editor, then add yourself as an owner
-- (last statement below). The app shows your user id in the message you get the
-- first time you click "Publish Core Rules" without being an owner.

create table if not exists public.core_rules_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.core_rules (
  id           uuid primary key default gen_random_uuid(),
  version      integer not null unique,
  config       jsonb   not null,
  notes        text    not null default '',
  published_by uuid    references auth.users(id),
  published_at timestamptz not null default now()
);

alter table public.core_rules_owners enable row level security;
alter table public.core_rules        enable row level security;

-- An owner can see their own owner row (not strictly needed by the app, handy for debugging).
create policy "Owners see themselves"
  on public.core_rules_owners for select
  using (user_id = auth.uid());

create policy "Signed-in users read Core Rules"
  on public.core_rules for select
  using (auth.role() = 'authenticated');

create policy "Owners publish Core Rules"
  on public.core_rules for insert
  with check (
    published_by = auth.uid()
    and exists (select 1 from public.core_rules_owners o where o.user_id = auth.uid())
  );

-- No update/delete policies on purpose: published versions are immutable history.

-- ── Add yourself as an owner ─────────────────────────────────────────────────
-- Replace the id below with your own user id (the app prints it when you click
-- "Publish Core Rules" before this step), or look it up by email:
--
--   insert into public.core_rules_owners (user_id)
--   select id from auth.users where email = 'you@example.com';
--
-- insert into public.core_rules_owners (user_id) values ('PASTE-YOUR-USER-ID-HERE');
