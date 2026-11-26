-- Initial armor Noise values (Game Config > Armor Pieces > Noise).
--
-- Run in the Supabase SQL editor (test project first). Safe to re-run. It edits the saved config of every campaign
-- (public.game_configs). Afterwards open the app as the Core Rules owner, check Armor Pieces, and Publish Core Rules.
--
-- How Noise is used: a worn piece adds its Noise to your Speed, and the sum is multiplied by your Target Size. That
-- figure is what a listening watcher compares against when you sneak (hearing hiding = 400 / Noise, longer-range when
-- you move faster). Unarmored a human is about Speed 15, so a piece's Noise is on the same scale as Speed:
-- a full suit of 6 pieces at Noise 5 each adds 30, tripling the sound you make.
--
-- Values are per piece, for the "<Material> (Generic)" pieces (they fit any body slot). Suggested:
--   Leather/Hide 0        silent                       Iron Chainmail 5    chain rattles
--   Reinforced Leather 1  creaks a little              Steel Chainmail 5
--   Padded 1              soft                         Iron Plate 5        plates scrape
--   Bronze Scale 4        scales clink                 Steel Plate 6
--   Bronze Plate 4                                      Tempered Steel Plate 6
--   Iron Scale 4
-- A piece that already has a Noise above 0 (the Scale Hauberk's 15, or anything you set) is left alone, and so are
-- named pieces such as helmets and the Thieves' Boots. Already-owned pieces keep the Noise they were bought with.

with noise(material, val) as (values
  ('Leather/Hide',         0),
  ('Reinforced Leather',   1),
  ('Padded',               1),
  ('Bronze Scale',         4),
  ('Bronze Plate',         4),
  ('Iron Scale',           4),
  ('Iron Chainmail',       5),
  ('Iron Plate',           5),
  ('Steel Chainmail',      5),
  ('Steel Plate',          6),
  ('Tempered Steel Plate', 6)
)
update public.game_configs g
set config = jsonb_set(
      g.config,
      '{armorPieces}',
      (select jsonb_agg(
         case
           when e.p->>'name' like '% (Generic)'
            and coalesce((e.p->>'noise')::numeric, 0) = 0
            and n.val is not null                         then e.p || jsonb_build_object('noise', n.val)
           else e.p
         end
         order by e.ord)
       from jsonb_array_elements(g.config->'armorPieces') with ordinality as e(p, ord)
       left join noise n on n.material = e.p->>'material')
    )
where jsonb_typeof(g.config->'armorPieces') = 'array'
  and jsonb_array_length(g.config->'armorPieces') > 0;

-- Check the result.
select p->>'name' as piece, p->>'material' as material, p->>'noise' as noise
from public.game_configs g, jsonb_array_elements(g.config->'armorPieces') p
order by (p->>'noise')::numeric desc nulls last, 1
limit 60;
