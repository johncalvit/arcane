-- ============================================================
-- Arcane RPG — Stage 3: Character background / notes field
-- Paste into Supabase SQL Editor and run.
-- ============================================================

-- Plain free-text field on characters -- covers both real player characters
-- and monster templates (is_template=true rows), since both live in this
-- same table. Deliberately NOT part of the Documents system (no Markdown,
-- no headings, no sharing) -- per the design discussion, this one is just a
-- text field, expand later only if there's real demand for more.
alter table public.characters
  add column if not exists notes text not null default '';
