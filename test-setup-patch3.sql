-- Grim Toll test project, patch 3: reproduce production's access rules (RLS).
-- The repo's original schema/stage1 policies are recursive (campaigns <-> campaign_members) and were
-- replaced in production by helper functions + renamed policies that no .sql file records.
-- Run AFTER supabase-schema, stage1, stage2, test-setup-patch.sql and test-setup-patch2.sql.
-- Safe to re-run. Leaves policies from the other repo files (game-configs-rls, journal, core-rules,
-- item-transfers, fix-creature-damage-rls, gm-update-characters, stage2 documents) alone.

-- ── Helper functions (security definer so they don't re-trigger RLS) ──
create or replace function public.is_campaign_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaign_members where campaign_id = cid and user_id = auth.uid());
$$;

-- Production caps a user at 3 campaigns they GM (the app's personal "Home" campaign counts as one).
create or replace function public.my_gm_campaign_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.campaigns where gm_id = auth.uid();
$$;

-- ── Drop the repo's original / my earlier-guess policies on the tables production redefined ──
drop policy if exists "Campaign members can view campaigns" on public.campaigns;
drop policy if exists "GMs can insert campaigns"            on public.campaigns;
drop policy if exists "GMs can update their campaigns"      on public.campaigns;
drop policy if exists "GMs can delete their campaigns"      on public.campaigns;

drop policy if exists "Members can view campaign membership" on public.campaign_members;
drop policy if exists "GMs can manage campaign membership"   on public.campaign_members;
drop policy if exists "Users can join as player"             on public.campaign_members;

drop policy if exists "Campaign members can view characters"  on public.characters;
drop policy if exists "Players can insert their own characters" on public.characters;
drop policy if exists "Players can update their own characters" on public.characters;
drop policy if exists "Players can delete their own characters" on public.characters;
drop policy if exists "Owners can view own characters"        on public.characters;
drop policy if exists "Members can view linked characters"    on public.characters;

drop policy if exists "View character links"   on public.campaign_characters;
drop policy if exists "Add character links"    on public.campaign_characters;
drop policy if exists "Remove character links" on public.campaign_characters;

drop policy if exists "Look up invite codes" on public.campaign_invites;
drop policy if exists "GMs create invites"   on public.campaign_invites;
drop policy if exists "GMs delete invites"   on public.campaign_invites;

drop policy if exists "Members see visible tokens"       on public.map_tokens;
drop policy if exists "GM sees all tokens"               on public.map_tokens;
drop policy if exists "GM manages all tokens"            on public.map_tokens;
drop policy if exists "Players move their own token"     on public.map_tokens;
drop policy if exists "Members view creatures"           on public.session_creatures;
drop policy if exists "GM manages creatures"             on public.session_creatures;

-- ── campaigns ──
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select using (gm_id = auth.uid() or public.is_campaign_member(id));
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert with check (gm_id = auth.uid() and public.my_gm_campaign_count() < 3);
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update using (gm_id = auth.uid());
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete using (gm_id = auth.uid());

-- ── campaign_members ──
drop policy if exists cm_select on public.campaign_members;
create policy cm_select on public.campaign_members for select using (user_id = auth.uid());
drop policy if exists cm_insert_gm on public.campaign_members;
create policy cm_insert_gm on public.campaign_members for insert
  with check (campaign_id in (select id from public.campaigns where gm_id = auth.uid()));
drop policy if exists cm_insert_player on public.campaign_members;
create policy cm_insert_player on public.campaign_members for insert
  with check (user_id = auth.uid() and role = 'player');
drop policy if exists cm_self_join_insert on public.campaign_members;
create policy cm_self_join_insert on public.campaign_members for insert with check (user_id = auth.uid());
drop policy if exists cm_update_self on public.campaign_members;
create policy cm_update_self on public.campaign_members for update
  using (user_id = auth.uid() or campaign_id in (select id from public.campaigns where gm_id = auth.uid()))
  with check ((user_id = auth.uid() and role = 'player')
              or campaign_id in (select id from public.campaigns where gm_id = auth.uid()));
drop policy if exists cm_delete on public.campaign_members;
create policy cm_delete on public.campaign_members for delete
  using (user_id = auth.uid() or campaign_id in (select id from public.campaigns where gm_id = auth.uid()));

-- ── characters (GM edit policy comes from supabase-gm-update-characters.sql) ──
drop policy if exists chars_select on public.characters;
create policy chars_select on public.characters for select using (
  user_id = auth.uid()
  or campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or campaign_id in (select campaign_id from public.campaign_members where user_id = auth.uid())
  or is_template = true
);
drop policy if exists chars_insert on public.characters;
create policy chars_insert on public.characters for insert with check (user_id = auth.uid());
drop policy if exists chars_update on public.characters;
create policy chars_update on public.characters for update using (
  user_id = auth.uid() or campaign_id in (select id from public.campaigns where gm_id = auth.uid())
);
drop policy if exists chars_delete on public.characters;
create policy chars_delete on public.characters for delete using (
  user_id = auth.uid() or campaign_id in (select id from public.campaigns where gm_id = auth.uid())
);

-- ── campaign_characters (production also has a wide-open authenticated policy) ──
drop policy if exists "campaign_characters authenticated access" on public.campaign_characters;
create policy "campaign_characters authenticated access" on public.campaign_characters for all
  using (true) with check (true);
drop policy if exists cc_select on public.campaign_characters;
create policy cc_select on public.campaign_characters for select using (
  campaign_id in (select campaign_id from public.campaign_members where user_id = auth.uid())
  or character_id in (select id from public.characters where user_id = auth.uid())
);
drop policy if exists cc_insert on public.campaign_characters;
create policy cc_insert on public.campaign_characters for insert with check (
  character_id in (select id from public.characters where user_id = auth.uid())
  or campaign_id in (select id from public.campaigns where gm_id = auth.uid())
);
drop policy if exists cc_delete on public.campaign_characters;
create policy cc_delete on public.campaign_characters for delete using (
  character_id in (select id from public.characters where user_id = auth.uid())
  or campaign_id in (select id from public.campaigns where gm_id = auth.uid())
);

-- ── campaign_invites ──
drop policy if exists invites_select on public.campaign_invites;
create policy invites_select on public.campaign_invites for select using (true);
drop policy if exists invites_insert on public.campaign_invites;
create policy invites_insert on public.campaign_invites for insert
  with check (campaign_id in (select id from public.campaigns where gm_id = auth.uid()));
drop policy if exists invites_delete on public.campaign_invites;
create policy invites_delete on public.campaign_invites for delete
  using (campaign_id in (select id from public.campaigns where gm_id = auth.uid()));

-- ── map_tokens ("Members update creature tokens" comes from supabase-fix-creature-damage-rls.sql) ──
drop policy if exists tokens_select on public.map_tokens;
create policy tokens_select on public.map_tokens for select using (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or campaign_id in (select campaign_id from public.campaign_members where user_id = auth.uid())
);
drop policy if exists tokens_insert on public.map_tokens;
create policy tokens_insert on public.map_tokens for insert with check (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or (entity_type = 'item' and public.is_campaign_member(campaign_id))
);
drop policy if exists tokens_update on public.map_tokens;
create policy tokens_update on public.map_tokens for update using (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or (entity_type = 'character' and entity_id in (select id from public.characters where user_id = auth.uid()))
  or public.is_campaign_member(campaign_id)
);
drop policy if exists tokens_delete on public.map_tokens;
create policy tokens_delete on public.map_tokens for delete using (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or (entity_type = 'item' and public.is_campaign_member(campaign_id))
);

-- ── session_creatures ("Members update creatures" comes from supabase-fix-creature-damage-rls.sql) ──
drop policy if exists creatures_select on public.session_creatures;
create policy creatures_select on public.session_creatures for select using (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid())
  or campaign_id in (select campaign_id from public.campaign_members where user_id = auth.uid())
);
drop policy if exists creatures_insert on public.session_creatures;
create policy creatures_insert on public.session_creatures for insert
  with check (campaign_id in (select id from public.campaigns where gm_id = auth.uid()));
drop policy if exists creatures_update on public.session_creatures;
create policy creatures_update on public.session_creatures for update using (
  campaign_id in (select id from public.campaigns where gm_id = auth.uid()) or public.is_campaign_member(campaign_id)
);
drop policy if exists creatures_delete on public.session_creatures;
create policy creatures_delete on public.session_creatures for delete
  using (campaign_id in (select id from public.campaigns where gm_id = auth.uid()));

-- ── maps: production also lets any signed-in user read maps ──
drop policy if exists authenticated_read_maps on public.maps;
create policy authenticated_read_maps on public.maps for select using (true);

-- ── documents: members can submit private campaign docs ──
drop policy if exists "Members can submit private campaign docs" on public.documents;
create policy "Members can submit private campaign docs" on public.documents for insert with check (
  scope = 'campaign' and visible_to_players = false and exists (
    select 1 from public.campaigns c left join public.campaign_members cm on cm.campaign_id = c.id
    where c.id = documents.campaign_id and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
  )
);
