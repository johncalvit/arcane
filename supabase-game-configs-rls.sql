-- game_configs RLS: campaign members can read the shared config,
-- only the campaign's GM can create/update/delete it.
--
-- Prompted by a live playtest incident: the client had no permission
-- gate on "GM Config Mode" at all, so a non-GM member was able to open
-- it and edit shared config (fixed client-side in index.html), but
-- without a matching DB policy a determined non-GM could still write
-- straight to this table via the Supabase API, bypassing the UI
-- entirely. This closes that gap at the database level, which is the
-- only place it can actually be enforced.
--
-- Run this once in the Supabase SQL editor for this project.

alter table public.game_configs enable row level security;

create policy "Members read config"
  on public.game_configs for select
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = game_configs.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

create policy "GM inserts config"
  on public.game_configs for insert
  with check (
    exists (
      select 1 from public.campaigns
      where id = game_configs.campaign_id and gm_id = auth.uid()
    )
  );

create policy "GM updates config"
  on public.game_configs for update
  using (
    exists (
      select 1 from public.campaigns
      where id = game_configs.campaign_id and gm_id = auth.uid()
    )
  );

create policy "GM deletes config"
  on public.game_configs for delete
  using (
    exists (
      select 1 from public.campaigns
      where id = game_configs.campaign_id and gm_id = auth.uid()
    )
  );
