-- Initial armor Dexterity / Coordination modifiers (Game Config > Armor Pieces > Dex% / Coord%).
--
-- Run in the Supabase SQL editor (test project first). Safe to re-run. It edits the saved config of every campaign
-- (public.game_configs). Afterwards open the app as the Core Rules owner, check Armor Pieces, and Publish Core Rules.
--
-- How they work: each worn piece can cut the wearer's Manual Dexterity (only on an ARM slot) and Physical Coordination
-- (torso, arms and legs, never the head) by a %. Pieces add up. Not scaled by the piece's size.
-- Values are per piece. A full suit is 2 arm pieces (Dex) and 5 non-head pieces (Coord):
--
--   Material               Dex%   Coord%   full suit: Dex / Coord
--   Leather/Hide             0       0         0 / 0
--   Reinforced Leather      -2      -1        -4 / -5
--   Padded                  -2      -1        -4 / -5
--   Iron Chainmail          -6      -2       -12 / -10
--   Steel Chainmail         -6      -2       -12 / -10
--   Bronze Scale            -8      -3       -16 / -15
--   Iron Scale              -8      -3       -16 / -15
--   Bronze Plate            -9      -3       -18 / -15
--   Iron Plate             -12      -4       -24 / -20
--   Steel Plate            -12      -4       -24 / -20
--   Tempered Steel Plate   -12      -4       -24 / -20
--
-- A generic piece (fits any slot) gets both values. A piece made for a specific slot gets only what applies there:
-- arm pieces both, torso and leg pieces Coord only, head pieces nothing. Any piece that already has a Dex or Coord
-- value (anything you set) is left alone. Already-owned pieces keep what they were bought with.

with mods(material, dex, coord) as (values
  ('Leather/Hide',          0,  0),
  ('Reinforced Leather',   -2, -1),
  ('Padded',               -2, -1),
  ('Iron Chainmail',       -6, -2),
  ('Steel Chainmail',      -6, -2),
  ('Bronze Scale',         -8, -3),
  ('Iron Scale',           -8, -3),
  ('Bronze Plate',         -9, -3),
  ('Iron Plate',          -12, -4),
  ('Steel Plate',         -12, -4),
  ('Tempered Steel Plate',-12, -4)
)
update public.game_configs g
set config = jsonb_set(
      g.config,
      '{armorPieces}',
      (select jsonb_agg(
         case
           when m.material is not null
            and coalesce((e.p->>'dexMod')::numeric, 0) = 0
            and coalesce((e.p->>'coordMod')::numeric, 0) = 0
           then e.p || jsonb_build_object(
                  'dexMod',   case when e.p->>'slot' is null or e.p->>'slot' in ('rarm','larm') then m.dex else 0 end,
                  'coordMod', case when e.p->>'slot' = 'head' then 0 else m.coord end)
           else e.p
         end
         order by e.ord)
       from jsonb_array_elements(g.config->'armorPieces') with ordinality as e(p, ord)
       left join mods m on m.material = e.p->>'material')
    )
where jsonb_typeof(g.config->'armorPieces') = 'array'
  and jsonb_array_length(g.config->'armorPieces') > 0;

-- Check the result: the pieces that now have a modifier.
select p->>'name' as piece, p->>'slot' as slot, p->>'material' as material, p->>'dexMod' as dex, p->>'coordMod' as coord
from public.game_configs g, jsonb_array_elements(g.config->'armorPieces') p
where coalesce((p->>'dexMod')::numeric, 0) <> 0 or coalesce((p->>'coordMod')::numeric, 0) <> 0
order by (p->>'coordMod')::numeric, 1
limit 60;
