-- ============================================================
-- Arcane RPG — Stage 2: Documents (help / campaign notes / map notes)
-- Paste into Supabase SQL Editor and run.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS
-- One shared table for all three: 'global' (app-wide help, no
-- campaign_id), 'campaign' (GM worldbuilding notes), and 'map'
-- (GM-only notes pinned to a spot on a specific map). Body is
-- Markdown, rendered client-side with headings as collapsible
-- sections and [[Other Doc Title]] links resolved between any
-- two documents regardless of scope.
-- ────────────────────────────────────────────────────────────
create table public.documents (
  id                  uuid primary key default uuid_generate_v4(),
  scope               text not null check (scope in ('global', 'campaign', 'map')),
  campaign_id         uuid references public.campaigns(id) on delete cascade,
  map_id              uuid references public.maps(id) on delete cascade,
  x_pct               float,  -- pin position on the map, scope='map' only
  y_pct               float,
  title               text not null,
  body                text not null default '',
  visible_to_players  boolean not null default false,  -- scope='campaign' only; global is always everyone, map is always GM-only
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  -- campaign/map-scoped docs must actually belong to a campaign; a map doc
  -- must also name the map it's pinned to. Global docs carry neither.
  constraint documents_scope_shape check (
    (scope = 'global'   and campaign_id is null and map_id is null) or
    (scope = 'campaign' and campaign_id is not null and map_id is null) or
    (scope = 'map'      and campaign_id is not null and map_id is not null)
  )
);

create trigger set_updated_at before update on public.documents
  for each row execute procedure public.set_updated_at();

alter publication supabase_realtime add table public.documents;

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table public.documents enable row level security;

-- Anyone signed in can read global docs (help content — everyone sees
-- everything, per design).
create policy "Everyone can view global docs"
  on public.documents for select
  using (scope = 'global');

-- Any GM (of any campaign) can manage global docs — there's no separate
-- "site admin" role in this app; GM is already the trusted-editor tier
-- everywhere else (game_configs, maps, etc.), so this reuses that bar
-- rather than inventing a new one.
create policy "GMs can manage global docs"
  on public.documents for all
  using (
    scope = 'global' and
    exists (select 1 from public.campaigns where gm_id = auth.uid())
  );

-- Campaign docs: the GM always sees their own; players only when the GM
-- has flipped visible_to_players on.
create policy "Campaign members can view visible campaign docs"
  on public.documents for select
  using (
    scope = 'campaign' and
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = documents.campaign_id
        and (c.gm_id = auth.uid() or (cm.user_id = auth.uid() and documents.visible_to_players))
    )
  );

create policy "GMs can manage campaign docs"
  on public.documents for all
  using (
    scope = 'campaign' and
    exists (select 1 from public.campaigns where id = documents.campaign_id and gm_id = auth.uid())
  );

-- Map docs: GM-only, always — no player-visible path at all.
create policy "GMs can manage map docs"
  on public.documents for all
  using (
    scope = 'map' and
    exists (select 1 from public.campaigns where id = documents.campaign_id and gm_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- STORAGE — document images (shared portraits/scenes/maps-within-notes)
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('documents', 'documents', true)
  on conflict (id) do nothing;

create policy "Document images are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'documents');

create policy "Authenticated users can upload document images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "Authenticated users can delete document images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
