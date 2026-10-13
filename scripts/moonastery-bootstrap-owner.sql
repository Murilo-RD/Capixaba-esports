-- Execute after moonastery-recreate.sql and after confirming an Auth user exists.
-- Replace the all-zero UUID with the exact User UID from Authentication > Users.
BEGIN;
DO $bootstrap$
DECLARE
  selected_user uuid := '00000000-0000-0000-0000-000000000000';
  account_email text;
BEGIN
  IF selected_user = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Replace selected_user with the exact Auth User UID';
  END IF;
  SELECT email INTO account_email FROM auth.users WHERE id = selected_user;
  IF NOT FOUND OR account_email IS NULL THEN
    RAISE EXCEPTION 'Auth user not found or without email';
  END IF;
  INSERT INTO public.moon_memberships(id,email,nick,status,role)
  VALUES(selected_user,account_email,'Owner','approved','owner')
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,status='approved',role='owner';
  INSERT INTO public.moon_players(user_id,nick)
  VALUES(selected_user,'Owner')
  ON CONFLICT(user_id) DO NOTHING;
END
$bootstrap$;
COMMIT;

SELECT id,email,nick,status,role
FROM public.moon_memberships
WHERE role='owner';
