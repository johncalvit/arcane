-- Lets a campaign's GM update characters that belong to their campaign (Award XP,
-- Grant XP, damage to a player's character, ...). Without it Supabase RLS turns
-- a GM write to someone else's character into "0 rows, no error".
--
-- IMPORTANT: an earlier version of this file put the lookups straight inside the
-- policy; that makes Postgres report "infinite recursion detected in policy for
-- relation characters" (map_tokens' own policy reads characters), which broke
-- ALL character updates. This version moves the lookups into a SECURITY DEFINER
-- function (it runs without RLS, so no recursion). Running this file replaces
-- the broken policy.
--
-- A GM may edit a character if: its home campaign_id is a campaign they GM, OR
-- it's linked to their campaign (campaign_characters), OR it has a token on one
-- of their campaigns' maps (map_tokens).
--
-- Run once in the Supabase SQL editor (safe to re-run).

drop policy if exists "GM updates campaign characters" on public.characters;

create or replace function public.gm_can_edit_character(char_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns c
    where c.gm_id = auth.uid()
      and (
        c.id = (select ch.campaign_id from public.characters ch where ch.id = char_id)
        or exists (select 1 from public.campaign_characters cc
                   where cc.campaign_id = c.id and cc.character_id = char_id)
        or exists (select 1 from public.map_tokens mt
                   where mt.campaign_id = c.id and mt.entity_type = 'character' and mt.entity_id = char_id)
      )
  );
$$;

grant execute on function public.gm_can_edit_character(uuid) to authenticated;

create policy "GM updates campaign characters"
  on public.characters for update
  using (public.gm_can_edit_character(id));
