-- Adds a per-map Day/Dark lighting flag, toggled by the GM (Maps & Notes tab)
-- and read by the new Vigilant action to decide whether its vision cone uses
-- DayVision or NightVision. Defaults to Day (false) so every existing map
-- behaves exactly as if this column didn't exist until a GM actually flips it.
--
-- Run this once in the Supabase SQL editor for this project. The app
-- already tolerates this column not existing yet (loadActiveMap queries it
-- separately and just defaults to Day on error), so there's no rush — but
-- the Day/Dark toggle button won't actually persist anything until this runs.

alter table public.maps
  add column if not exists dark boolean default false;
