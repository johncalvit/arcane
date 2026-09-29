-- Lets any campaign member submit a bug report / feature request (the new
-- 🐛 button in the header) — stored as an ordinary GM-only campaign document
-- (see saveDocument/openBugReportModal in index.html), no new table needed.
--
-- The existing "GMs can manage campaign docs" policy on public.documents is
-- GM-only (`for all`), and there is no other policy letting anyone else
-- write to it at all — but a report has to come FROM a player, not the GM,
-- so without this, submitting one would silently fail the exact same way
-- the creature-damage RLS gap did (see supabase-fix-creature-damage-rls.sql).
--
-- Scoped narrowly: any campaign member (GM included) can INSERT a
-- 'campaign'-scope document, but only as GM-invisible-to-players
-- (visible_to_players = false) — they can't use this to post something the
-- rest of the party would see. The existing "GMs can manage campaign docs"
-- policy still covers everything else (update/delete/select, and inserting
-- player-visible docs) unchanged.
--
-- Run this once in the Supabase SQL editor for this project.

drop policy if exists "Members can submit private campaign docs" on public.documents;
create policy "Members can submit private campaign docs"
  on public.documents for insert
  with check (
    scope = 'campaign' and
    visible_to_players = false and
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = documents.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );
