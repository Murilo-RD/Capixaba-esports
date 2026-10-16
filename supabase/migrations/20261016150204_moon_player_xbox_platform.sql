BEGIN;

ALTER TABLE public.moon_players
  DROP CONSTRAINT IF EXISTS moon_players_platform_check;

ALTER TABLE public.moon_players
  ADD CONSTRAINT moon_players_platform_check
  CHECK (platform IN ('steam', 'epic', 'ps4', 'xbox'));

COMMIT;
