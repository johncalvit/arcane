-- ============================================================
-- Arcane RPG — Stage 1 Map Schema
-- Paste into Supabase SQL Editor and run.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Add active map + scale to campaigns and maps
-- ────────────────────────────────────────────────────────────
alter table public.campaigns
  add column if not exists active_map_id uuid references public.maps(id) on delete set null;

alter table public.maps
  add column if not exists scale_pixels_per_foot float,
  add column if not exists scale_calibrated boolean default false,
  add column if not exists description text;

-- ────────────────────────────────────────────────────────────
-- MAP TOKENS
-- Tracks everything on the map: characters, creatures, items
-- ────────────────────────────────────────────────────────────
create table public.map_tokens (
  id            uuid primary key default uuid_generate_v4(),
  map_id        uuid not null references public.maps(id) on delete cascade,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  entity_type   text not null check (entity_type in ('character','creature','item')),
  entity_id     uuid,           -- character or creature id (null for items)
  label         text not null,  -- display name under token
  avatar_url    text,           -- image for character/creature tokens
  item_category text,           -- 'weapon','armor','potion','chest','scroll','misc' for items
  x_pct         float not null default 50,  -- position as % of map width
  y_pct         float not null default 50,  -- position as % of map height
  visible       boolean not null default true,  -- GM can hide from players
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create trigger set_updated_at before update on public.map_tokens
  for each row execute procedure public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- SESSION CREATURES
-- GM-managed monsters/NPCs for a campaign session
-- ────────────────────────────────────────────────────────────
create table public.session_creatures (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  species     text not null,
  label       text not null,  -- e.g. "Goblin 1"
  avatar_url  text,
  stats       jsonb not null default '{}',
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- ENABLE REALTIME
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.map_tokens;
alter publication supabase_realtime add table public.session_creatures;
alter publication supabase_realtime add table public.campaigns;

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table public.map_tokens      enable row level security;
alter table public.session_creatures enable row level security;

-- map_tokens: campaign members can view visible tokens;
-- GM can see and manage all tokens including hidden ones
create policy "Members see visible tokens"
  on public.map_tokens for select
  using (
    visible = true and
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = map_tokens.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GM sees all tokens"
  on public.map_tokens for select
  using (
    exists (
      select 1 from public.campaigns
      where id = map_tokens.campaign_id and gm_id = auth.uid()
    )
  );

create policy "GM manages all tokens"
  on public.map_tokens for all
  using (
    exists (
      select 1 from public.campaigns
      where id = map_tokens.campaign_id and gm_id = auth.uid()
    )
  );

create policy "Players move their own token"
  on public.map_tokens for update
  using (
    entity_type = 'character' and
    entity_id in (
      select id from public.characters where user_id = auth.uid()
    )
  );

-- session_creatures: GM manages; members view
create policy "Members view creatures"
  on public.session_creatures for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = session_creatures.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GM manages creatures"
  on public.session_creatures for all
  using (
    exists (
      select 1 from public.campaigns
      where id = session_creatures.campaign_id and gm_id = auth.uid()
    )
  );

-- Maps storage bucket policies (if not already created)
insert into storage.buckets (id, name, public)
  values ('maps', 'maps', true)
  on conflict (id) do nothing;

create policy "Maps are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'maps');

create policy "GM can upload maps"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'maps');

create policy "GM can delete maps"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'maps');
