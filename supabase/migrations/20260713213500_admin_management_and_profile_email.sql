-- Add profile emails and allow existing owners to manage admin roles.
-- Safe to run more than once.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nick, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nick', split_part(NEW.email, '@', 1)),
    NEW.email,
    'pendente'
  )
  ON CONFLICT (id) DO UPDATE
    SET
      nick = COALESCE(public.profiles.nick, EXCLUDED.nick),
      email = COALESCE(public.profiles.email, EXCLUDED.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'player')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "user_roles insert owner" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles delete owner" ON public.user_roles;

CREATE POLICY "user_roles insert owner"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "user_roles delete owner"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

COMMIT;
