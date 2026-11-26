-- Initial technique class availability + the Scout class.
--
-- Run in the Supabase SQL editor (test project first). Safe to re-run: it recomputes the class lists every time.
-- It edits the saved config of every campaign (public.game_configs) - the "classes" list on each technique and the
-- Scout entry of the technique allowance. It does NOT touch your published Core Rules (those are immutable history):
-- afterwards open the app as the Core Rules owner, check Game Config > Techniques, and Publish Core Rules.
--
-- The rules (anybody can use any weapon - the specialists just get better at it):
--   * Technique I for a weapon type (and Shield Block I) stays open to EVERY class.
--   * Everything above that (Technique II / III, Parry, Block II+, Gap Target, Heavy Blow, Lunge, Marksmen,
--     Numb, Whirlwind, Stealth Kill) is limited to the classes that specialize in that weapon / move.
--   * Monk techniques (monk-*) are left exactly as they are.
--   * A technique whose weapon type is not listed below (a custom one) is left exactly as it is.
-- Tune the lists below, or just tick classes per technique in Game Config > Techniques afterwards.

with spec(wt, classes) as (values
  -- weapon type          specialist classes (in class order: Warrior, Disciple, Caster, Monk, Scout)
  ('Axe',         array['Warrior']),
  ('Hammer',      array['Warrior','Disciple']),
  ('Club',        array['Warrior','Disciple']),
  ('Mace',        array['Warrior','Disciple']),
  ('Flail',       array['Warrior']),
  ('Knife',       array['Warrior','Caster','Scout']),
  ('Short Sword', array['Warrior','Scout']),
  ('Longsword',   array['Warrior']),
  ('Greatsword',  array['Warrior']),
  ('Rapier',      array['Warrior','Scout']),
  ('Scimitar',    array['Warrior','Scout']),
  ('Polearm',     array['Warrior']),
  ('Spear',       array['Warrior','Scout']),
  ('Lance',       array['Warrior']),
  ('Staff',       array['Warrior','Disciple','Caster','Monk']),
  ('Whip',        array['Warrior','Scout']),
  ('Net',         array['Warrior','Scout']),
  ('Shield',      array['Warrior','Disciple']),
  ('Unarmed',     array['Warrior','Monk']),
  ('Bow',         array['Warrior','Scout']),
  ('Crossbow',    array['Warrior','Scout']),
  ('Sling',       array['Warrior','Disciple','Caster','Scout']),
  ('Blowgun',     array['Caster','Scout']),
  ('Dart',        array['Caster','Scout'])
)
update public.game_configs g
set config = jsonb_set(
      jsonb_set(
        g.config,
        '{techniques}',
        (select jsonb_agg(
           case
             when e.t->>'id' like 'monk-%'                                   then e.t   -- Monk set: untouched
             when e.t->>'id' = lower(regexp_replace(coalesce(e.t->>'weaponType',''), '[^a-zA-Z0-9]+', '-', 'g')) || '-1'
               or e.t->>'id' = 'shield-block-1'                              then e.t - 'classes'   -- Technique I: everybody
             when e.t->>'id' like '%-stealth-kill'                           then e.t || '{"classes":["Scout"]}'
             when e.t->>'id' like '%-marksmen'
               or e.t->>'id' like '%-gap-target'
               or e.t->>'id' like '%-lunge'                                  then e.t || '{"classes":["Warrior","Scout"]}'
             when e.t->>'id' like '%-whirlwind'
               or e.t->>'id' like '%-heavy-blow-%'                           then e.t || '{"classes":["Warrior"]}'
             when e.t->>'id' like '%-numb'                                   then e.t || '{"classes":["Warrior","Monk"]}'
             when s.classes is not null                                      then e.t || jsonb_build_object('classes', to_jsonb(s.classes))
             else e.t
           end
           order by e.ord)
         from jsonb_array_elements(g.config->'techniques') with ordinality as e(t, ord)
         left join spec s on s.wt = e.t->>'weaponType')
      ),
      '{techniqueAllowance}',
      case when jsonb_typeof(g.config->'techniqueAllowance') = 'object'
           then g.config->'techniqueAllowance'
                || case when g.config->'techniqueAllowance' ? 'Scout' then '{}'::jsonb else '{"Scout":3}'::jsonb end
           else '{}'::jsonb   -- none saved: the app falls back to its defaults (which include Scout)
      end
    )
where jsonb_typeof(g.config->'techniques') = 'array'
  and jsonb_array_length(g.config->'techniques') > 0;

-- Check the result: one line per technique that is now class-limited.
select t->>'name' as technique, t->'classes' as classes
from public.game_configs g, jsonb_array_elements(g.config->'techniques') t
where t ? 'classes'
order by 1
limit 200;
