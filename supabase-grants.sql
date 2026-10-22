-- Supabase change (Oct 30, 2026): new tables in "public" are no longer exposed to the Data API
-- automatically - each needs an explicit GRANT. Existing tables keep their grants, so nothing breaks
-- today; this file matters for a NEW project, a preview branch, or a "supabase db reset" that rebuilds
-- the schema from the SQL files, and as a safety net.
--
-- Arcane only talks to its tables as a signed-in user (RLS decides what each user can touch), so
-- "authenticated" gets full table privileges and "service_role" too; "anon" gets nothing.
-- Safe to re-run; tables that don't exist yet are skipped.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'campaigns', 'campaign_members', 'campaign_characters', 'campaign_invites',
    'characters', 'maps', 'map_tokens', 'session_creatures', 'game_configs',
    'documents', 'campaign_books', 'campaign_pages',
    'core_rules', 'core_rules_owners', 'journal_entries', 'item_transfers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end $$;
