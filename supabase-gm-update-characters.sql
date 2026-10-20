-- Fixes: the GM's "Finish Combat -> Award XP" / "Grant XP" (and any other GM-side
-- change to a player's character, e.g. damage) silently did nothing for
-- characters the GM doesn't own. The characters table only has "Players can
-- update their own characters"; Supabase RLS turns any other update into
-- "0 rows, no error".
--
-- This adds (alongside the owner policy - permissive policies are OR'd) a policy
-- letting a campaign's GM update a character if ANY of these is true:
--   * the character's home campaign_id is a campaign they GM,
--   * the character is linked to their campaign (campaign_characters),
--   * the character has a token on one of their campaigns' maps (map_tokens).
-- The token rule matters: characters placed on a map before they were linked
-- have no campaign_characters row, so the link rule alone misses them.
--
-- Run once in the Supabase SQL editor (safe to re-run).

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
          or exists (
            select 1 from public.map_tokens mt
            where mt.campaign_id = c.id
              and mt.entity_type = 'character'
              and mt.entity_id = characters.id
          )
        )
    )
  );
