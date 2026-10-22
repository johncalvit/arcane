-- Permanent Journal: every shared Journal line is saved here so it survives reloads and is there
-- for the GM to review later (acquired items, combat results, ...).
--
-- * Any campaign member (or the GM) can read the campaign's entries and add their own.
-- * Only the campaign's GM can delete (the Journal's "clear" button).
--
-- Run once in the Supabase SQL editor (safe to re-run). Until it is run, the app keeps working;
-- the Journal just isn't saved.

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  t           bigint not null,           -- client timestamp (ms), also the sort key
  text        text not null,
  kind        text not null default '',
  image_url   text,
  created_at  timestamptz not null default now()
);

create index if not exists journal_entries_campaign_t on public.journal_entries (campaign_id, t desc);

alter table public.journal_entries enable row level security;

drop policy if exists "Members read journal" on public.journal_entries;
create policy "Members read journal"
  on public.journal_entries for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = journal_entries.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

drop policy if exists "Members add journal" on public.journal_entries;
create policy "Members add journal"
  on public.journal_entries for insert
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = journal_entries.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

drop policy if exists "GM clears journal" on public.journal_entries;
create policy "GM clears journal"
  on public.journal_entries for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = journal_entries.campaign_id and c.gm_id = auth.uid()
    )
  );

-- Data API access (required for tables created after Oct 30, 2026; harmless before).
grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update, delete on public.journal_entries to service_role;
