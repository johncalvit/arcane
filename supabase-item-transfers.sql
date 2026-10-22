-- Giving items between characters (Loadout -> Give...). The giver's client inserts a row addressed
-- to the recipient character; the recipient's client claims it (deleting the row is the claim),
-- adds the item to their Carried list and saves. Giving to a mount or monster doesn't use this
-- table (it edits the creature directly).
--
-- * Any campaign member / GM can create a transfer in that campaign (as themselves).
-- * Only the sender, the recipient character's owner, or the campaign's GM can see or delete it.
--
-- Run once in the Supabase SQL editor (safe to re-run). Giving to a character shows an error
-- until then; everything else keeps working.

create table if not exists public.item_transfers (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  from_character_id uuid,
  from_name         text,
  to_character_id   uuid not null references public.characters (id) on delete cascade,
  item              jsonb not null,
  created_by        uuid not null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists item_transfers_to on public.item_transfers (to_character_id);

-- SECURITY DEFINER so the policy can look at characters without tripping the characters policies
-- (the same recursion trap as gm_can_edit_character).
create or replace function public.is_my_character(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.characters ch where ch.id = cid and ch.user_id = auth.uid()); $$;
grant execute on function public.is_my_character(uuid) to authenticated;

alter table public.item_transfers enable row level security;

drop policy if exists "Members send items" on public.item_transfers;
create policy "Members send items"
  on public.item_transfers for insert
  with check (
    created_by = auth.uid() and exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = item_transfers.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

drop policy if exists "See own transfers" on public.item_transfers;
create policy "See own transfers"
  on public.item_transfers for select
  using (
    created_by = auth.uid() or public.is_my_character(to_character_id)
    or exists (select 1 from public.campaigns c where c.id = item_transfers.campaign_id and c.gm_id = auth.uid())
  );

drop policy if exists "Claim or cancel transfers" on public.item_transfers;
create policy "Claim or cancel transfers"
  on public.item_transfers for delete
  using (
    created_by = auth.uid() or public.is_my_character(to_character_id)
    or exists (select 1 from public.campaigns c where c.id = item_transfers.campaign_id and c.gm_id = auth.uid())
  );

-- Data API access (required for tables created after Oct 30, 2026; harmless before).
grant select, insert, update, delete on public.item_transfers to authenticated;
grant select, insert, update, delete on public.item_transfers to service_role;
