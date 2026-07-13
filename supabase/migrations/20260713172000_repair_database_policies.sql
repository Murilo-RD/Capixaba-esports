-- Repair core schema, RLS policies, and signup trigger.
-- Safe to run more than once; it does not delete app data.

BEGIN;

-- Required extensions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep the signup trigger function aligned with the current profiles schema.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nick, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nick', split_part(NEW.email, '@', 1)),
    'pendente'
  )
  ON CONFLICT (id) DO UPDATE
    SET nick = COALESCE(public.profiles.nick, EXCLUDED.nick);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'player')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Make sure profile columns used by the app exist.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.application_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS rocket_league_id TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS mmr_1v1 INT,
  ADD COLUMN IF NOT EXISTS rank_1v1 TEXT,
  ADD COLUMN IF NOT EXISTS mmr_2v2 INT,
  ADD COLUMN IF NOT EXISTS rank_2v2 TEXT,
  ADD COLUMN IF NOT EXISTS mmr_3v3 INT,
  ADD COLUMN IF NOT EXISTS rank_3v3 TEXT,
  ADD COLUMN IF NOT EXISTS tracker_synced_at TIMESTAMPTZ;

-- Grants needed by the browser client and server-side admin client.
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Recreate profile policies with explicit, non-overlapping intent.
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles select owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles update owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles public roster" ON public.profiles;
DROP POLICY IF EXISTS "profiles select approved auth" ON public.profiles;

CREATE POLICY "profiles select own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles insert own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles select owner"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "profiles update owner"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "profiles public roster"
  ON public.profiles FOR SELECT TO anon
  USING (status = 'aprovado');

CREATE POLICY "profiles select approved auth"
  ON public.profiles FOR SELECT TO authenticated
  USING (status = 'aprovado');

-- Owners should be able to inspect roles; users can still inspect only their own.
DROP POLICY IF EXISTS "user_roles select own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select owner" ON public.user_roles;

CREATE POLICY "user_roles select own"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_roles select owner"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Harden application update policies so users cannot move rows to another user_id.
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apps select own or owner" ON public.applications;
DROP POLICY IF EXISTS "apps insert own" ON public.applications;
DROP POLICY IF EXISTS "apps update own or owner" ON public.applications;
DROP POLICY IF EXISTS "apps delete owner" ON public.applications;

CREATE POLICY "apps select own or owner"
  ON public.applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "apps insert own"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "apps update own or owner"
  ON public.applications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "apps delete owner"
  ON public.applications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Helpful indexes for the admin panel and public roster.
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);

COMMIT;
