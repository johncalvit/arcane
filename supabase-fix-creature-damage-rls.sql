-- Fixes a live playtest bug: a player's attack on a GM's creature registered
-- in the Journal (a broadcast, not gated by any permission) but never
-- actually reduced the creature's Toughness. Root cause is a Row Level
-- Security gap, not application logic — traced in supabase-stage1.sql:
--
--   session_creatures: only a policy for the GM ("GM manages creatures",
--   `for all`) exists. There is no policy letting any OTHER campaign member
--   write to it at all — but this game's combat resolves an attack on
--   WHOEVER'S CLIENT LANDS THE HIT, not the GM's, so a player damaging a
--   GM's creature needs their own client to write session_creatures.damage.
--   Supabase silently rejects that write (RLS has no matching policy), the
--   player's own screen shows it anyway because the local cache updates
--   optimistically before the write even goes out (see updateEntity), but
--   nothing is actually persisted — so every other client, GM included,
--   never sees it change.
--
--   map_tokens has the same structural gap for creature TOKENS specifically
--   (as opposed to the session_creatures row itself): its own player-update
--   policy only covers a player's OWN character's token
--   (`entity_type = 'character' and entity_id in (their own characters)`),
--   so a hit-triggered condition (e.g. Bleeding) on a CREATURE's token from
--   a non-GM attacker's client would hit the exact same wall — not yet
--   reported, but the same root cause, so fixed alongside this.
--
-- Both fixes below are additive ("for update" policies scoped to campaign
-- membership) — they sit alongside the existing GM-only policies rather
-- than replacing them (Postgres OR's multiple permissive policies for the
-- same command together), so nothing the GM could already do changes; this
-- only adds what a non-GM campaign member can do.
--
-- Run this once in the Supabase SQL editor for this project.

drop policy if exists "Members update creatures" on public.session_creatures;
create policy "Members update creatures"
  on public.session_creatures for update
  using (
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = session_creatures.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );

drop policy if exists "Members update creature tokens" on public.map_tokens;
create policy "Members update creature tokens"
  on public.map_tokens for update
  using (
    entity_type = 'creature' and
    exists (
      select 1 from public.campaigns c
      left join public.campaign_members cm on cm.campaign_id = c.id
      where c.id = map_tokens.campaign_id
        and (c.gm_id = auth.uid() or cm.user_id = auth.uid())
    )
  );
