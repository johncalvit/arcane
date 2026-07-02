-- ============================================================
-- Arcane RPG — Supabase Schema
-- Paste this into the Supabase SQL Editor and run it.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ────────────────────────────────────────────────────────────
-- PROFILES
-- One row per user, extends auth.users
-- ────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ────────────────────────────────────────────────────────────
-- CAMPAIGNS
-- A GM's game world; everything else belongs to one.
-- ────────────────────────────────────────────────────────────
create table public.campaigns (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  gm_id       uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ────────────────────────────────────────────────────────────
-- CAMPAIGN MEMBERS
-- Links players to campaigns with a role.
-- ────────────────────────────────────────────────────────────
create table public.campaign_members (
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('gm', 'player')) default 'player',
  joined_at    timestamptz default now(),
  primary key (campaign_id, user_id)
);


-- ────────────────────────────────────────────────────────────
-- GAME CONFIGS
-- Stores arcane-config.json content per campaign.
-- ────────────────────────────────────────────────────────────
create table public.game_configs (
  id           uuid primary key default uuid_generate_v4(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  config       jsonb not null default '{}',
  version      integer not null default 1,
  updated_at   timestamptz default now(),
  updated_by   uuid references public.profiles (id) on delete set null
);


-- ────────────────────────────────────────────────────────────
-- CHARACTERS
-- One row per player character.
-- Identity fields are top-level for easy roster queries;
-- gameplay data lives in JSONB for flexibility.
-- ────────────────────────────────────────────────────────────
create table public.characters (
  id           uuid primary key default uuid_generate_v4(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  species      text,
  body_type    text,
  sex          text,
  age          text,
  height       text,
  build        text,
  social       text,
  mental       text,
  stats        jsonb not null default '{}',
  features     jsonb not null default '[]',
  skills       jsonb not null default '[]',
  weapons      jsonb not null default '[]',
  equipment    jsonb not null default '[]',
  armor        jsonb not null default '{}',
  held_items   jsonb not null default '{}',
  avatar_url   text,
  version      integer not null default 1,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);


-- ────────────────────────────────────────────────────────────
-- MAPS
-- Campaign map images; image files live in Supabase Storage.
-- ────────────────────────────────────────────────────────────
create table public.maps (
  id           uuid primary key default uuid_generate_v4(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  name         text not null,
  image_url    text not null,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz default now()
);


-- ────────────────────────────────────────────────────────────
-- CAMPAIGN BOOKS
-- A named collection of pages/chapters for a campaign.
-- ────────────────────────────────────────────────────────────
create table public.campaign_books (
  id           uuid primary key default uuid_generate_v4(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  title        text not null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);


-- ────────────────────────────────────────────────────────────
-- CAMPAIGN PAGES
-- Rich text pages (Quill delta JSON) inside a book.
-- parent_id enables nested chapters/sections.
-- ────────────────────────────────────────────────────────────
create table public.campaign_pages (
  id           uuid primary key default uuid_generate_v4(),
  book_id      uuid not null references public.campaign_books (id) on delete cascade,
  parent_id    uuid references public.campaign_pages (id) on delete cascade,
  title        text not null,
  content      jsonb not null default '{"ops":[]}',
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);


-- ────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- Automatically keeps updated_at current on writes.
-- ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.campaigns
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at before update on public.game_configs
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at before update on public.characters
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at before update on public.campaign_books
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at before update on public.campaign_pages
  for each row execute procedure public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — enable on all tables
-- ────────────────────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.campaigns        enable row level security;
alter table public.campaign_members enable row level security;
alter table public.game_configs     enable row level security;
alter table public.characters       enable row level security;
alter table public.maps             enable row level security;
alter table public.campaign_books   enable row level security;
alter table public.campaign_pages   enable row level security;


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — profiles
-- ────────────────────────────────────────────────────────────
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — campaigns
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view campaigns"
  on public.campaigns for select
  using (
    auth.uid() = gm_id or
    exists (
      select 1 from public.campaign_members
      where campaign_id = campaigns.id and user_id = auth.uid()
    )
  );

create policy "GMs can insert campaigns"
  on public.campaigns for insert
  with check (auth.uid() = gm_id);

create policy "GMs can update their campaigns"
  on public.campaigns for update
  using (auth.uid() = gm_id);

create policy "GMs can delete their campaigns"
  on public.campaigns for delete
  using (auth.uid() = gm_id);


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — campaign_members
-- ────────────────────────────────────────────────────────────
create policy "Members can view campaign membership"
  on public.campaign_members for select
  using (
    auth.uid() = user_id or
    exists (
      select 1 from public.campaigns
      where id = campaign_members.campaign_id and gm_id = auth.uid()
    )
  );

create policy "GMs can manage campaign membership"
  on public.campaign_members for all
  using (
    exists (
      select 1 from public.campaigns
      where id = campaign_members.campaign_id and gm_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — game_configs
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view game config"
  on public.game_configs for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = game_configs.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GMs can manage game config"
  on public.game_configs for all
  using (
    exists (
      select 1 from public.campaigns
      where id = game_configs.campaign_id and gm_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — characters
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view characters"
  on public.characters for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = characters.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "Players can insert their own characters"
  on public.characters for insert
  with check (auth.uid() = user_id);

create policy "Players can update their own characters"
  on public.characters for update
  using (auth.uid() = user_id);

create policy "Players can delete their own characters"
  on public.characters for delete
  using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — maps
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view maps"
  on public.maps for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = maps.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GMs can manage maps"
  on public.maps for all
  using (
    exists (
      select 1 from public.campaigns
      where id = maps.campaign_id and gm_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — campaign_books
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view books"
  on public.campaign_books for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = campaign_books.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GMs can manage books"
  on public.campaign_books for all
  using (
    exists (
      select 1 from public.campaigns
      where id = campaign_books.campaign_id and gm_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — campaign_pages
-- ────────────────────────────────────────────────────────────
create policy "Campaign members can view pages"
  on public.campaign_pages for select
  using (
    exists (
      select 1 from public.campaign_books b
      join public.campaigns c on c.id = b.campaign_id
      left join public.campaign_members cm on cm.campaign_id = c.id
      where b.id = campaign_pages.book_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GMs can manage pages"
  on public.campaign_pages for all
  using (
    exists (
      select 1 from public.campaign_books b
      join public.campaigns c on c.id = b.campaign_id
      where b.id = campaign_pages.book_id
        and c.gm_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS
-- Run these in the Supabase dashboard under Storage,
-- or uncomment if your project has the storage schema enabled.
-- ────────────────────────────────────────────────────────────
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);
-- insert into storage.buckets (id, name, public) values ('maps', 'maps', false);
