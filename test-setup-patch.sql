-- Grim Toll test project: tables the app uses that no other .sql file creates.
-- Run in the SQL editor AFTER supabase-schema.sql and supabase-stage1.sql, BEFORE
-- supabase-gm-update-characters.sql / supabase-fix-creature-damage-rls.sql / supabase-grants.sql.
-- Safe to re-run. Reconstructed from how the app uses these tables (best effort).

-- ── campaign_characters: link table (a character can be brought into campaigns) ──
create table if not exists public.campaign_characters (
  campaign_id  uuid not null references public.campaigns(id)  on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, character_id)
);
alter table public.campaign_characters enable row level security;

drop policy if exists "View character links" on public.campaign_characters;
create policy "View character links" on public.campaign_characters for select using (
  exists (select 1 from public.characters ch where ch.id = character_id and ch.user_id = auth.uid())
  or exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
  or exists (select 1 from public.campaign_members m where m.campaign_id = campaign_characters.campaign_id and m.user_id = auth.uid())
);

drop policy if exists "Add character links" on public.campaign_characters;
create policy "Add character links" on public.campaign_characters for insert with check (
  exists (select 1 from public.characters ch where ch.id = character_id and ch.user_id = auth.uid())
  or exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
);

drop policy if exists "Remove character links" on public.campaign_characters;
create policy "Remove character links" on public.campaign_characters for delete using (
  exists (select 1 from public.characters ch where ch.id = character_id and ch.user_id = auth.uid())
  or exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
);

-- ── campaign_invites: join codes a GM hands out ──
create table if not exists public.campaign_invites (
  code        text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.campaign_invites enable row level security;

-- Anyone signed in can look a code up (that's how a player joins).
drop policy if exists "Look up invite codes" on public.campaign_invites;
create policy "Look up invite codes" on public.campaign_invites for select using (auth.uid() is not null);

drop policy if exists "GMs create invites" on public.campaign_invites;
create policy "GMs create invites" on public.campaign_invites for insert with check (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
);

drop policy if exists "GMs delete invites" on public.campaign_invites;
create policy "GMs delete invites" on public.campaign_invites for delete using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
);

-- ── Joining: a player may add THEMSELVES to a campaign as a player (invite flow) ──
drop policy if exists "Users can join as player" on public.campaign_members;
create policy "Users can join as player" on public.campaign_members for insert with check (
  user_id = auth.uid() and role = 'player'
);

-- ── Characters: owners always see their own; members see ones linked to their campaign ──
drop policy if exists "Owners can view own characters" on public.characters;
create policy "Owners can view own characters" on public.characters for select using (auth.uid() = user_id);

drop policy if exists "Members can view linked characters" on public.characters;
create policy "Members can view linked characters" on public.characters for select using (
  exists (
    select 1 from public.campaign_characters cc
    where cc.character_id = characters.id
      and (
        exists (select 1 from public.campaign_members m where m.campaign_id = cc.campaign_id and m.user_id = auth.uid())
        or exists (select 1 from public.campaigns c where c.id = cc.campaign_id and c.gm_id = auth.uid())
      )
  )
);
