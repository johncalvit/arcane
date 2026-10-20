-- Fixes: the GM's "Finish Combat -> Award XP" (and any other GM-side change to a
-- player's character, e.g. damage) silently did nothing for characters the GM
-- doesn't own. The characters table only has "Players can update their own
-- characters"; Supabase RLS turns any other update into "0 rows, no error", so
-- the Journal said "XP awarded" while the player's XP never changed.
--
-- This adds (alongside the owner policy - permissive policies are OR'd) a
-- policy letting a campaign's GM update characters that belong to the campaign,
-- either by home campaign_id or by a campaign_characters link.
--
-- Run once in the Supabase SQL editor.

drop policy if exists "GM updates campaign characters" on public.characters;
create policy "GM updates campaign characters"
  on public.characters for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.gm_id = auth.uid()
        and (
          c.id = characters.campaign_id
          or exists (
            select 1 from public.campaign_characters cc
            where cc.campaign_id = c.id and cc.character_id = characters.id
          )
        )
    )
  );
