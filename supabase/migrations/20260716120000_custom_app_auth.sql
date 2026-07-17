-- Replace Supabase Auth users with an app-owned auth table.
-- The app still sends a Supabase-compatible JWT so existing auth.uid() RLS works.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing tables were created with foreign keys to auth.users. Custom app users
-- do not exist in auth.users, so remove those FK constraints while preserving data.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT
      quote_ident(n.nspname) AS schema_name,
      quote_ident(c.relname) AS table_name,
      quote_ident(con.conname) AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s.%s DROP CONSTRAINT IF EXISTS %s',
      constraint_record.schema_name,
      constraint_record.table_name,
      constraint_record.constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.app_auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nick TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_auth_users_email_lower_idx
  ON public.app_auth_users (lower(email));

REVOKE ALL ON public.app_auth_users FROM anon, authenticated;
GRANT ALL ON public.app_auth_users TO service_role;

CREATE OR REPLACE FUNCTION public.app_register(
  _email TEXT,
  _password TEXT,
  _nick TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  nick TEXT,
  status public.application_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT := lower(trim(_email));
  trimmed_nick TEXT := trim(_nick);
  created_user public.app_auth_users%ROWTYPE;
BEGIN
  IF normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  IF length(coalesce(_password, '')) < 6 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT';
  END IF;

  IF length(trimmed_nick) < 2 THEN
    RAISE EXCEPTION 'NICK_TOO_SHORT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.app_auth_users au WHERE lower(au.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'EMAIL_EXISTS';
  END IF;

  INSERT INTO public.app_auth_users (email, password_hash, nick)
  VALUES (normalized_email, crypt(_password, gen_salt('bf')), trimmed_nick)
  RETURNING * INTO created_user;

  INSERT INTO public.profiles (id, nick, email, status)
  VALUES (created_user.id, created_user.nick, created_user.email, 'pendente')
  ON CONFLICT (id) DO UPDATE
    SET
      nick = EXCLUDED.nick,
      email = EXCLUDED.email,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (created_user.id, 'player')
  ON CONFLICT DO NOTHING;

  RETURN QUERY
    SELECT created_user.id, created_user.email, created_user.nick, 'pendente'::public.application_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_login(
  _email TEXT,
  _password TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  nick TEXT,
  status public.application_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_user public.app_auth_users%ROWTYPE;
BEGIN
  SELECT *
  INTO matched_user
  FROM public.app_auth_users au
  WHERE lower(au.email) = lower(trim(_email))
    AND au.password_hash = crypt(_password, au.password_hash)
  LIMIT 1;

  IF matched_user.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  RETURN QUERY
    SELECT
      matched_user.id,
      matched_user.email,
      coalesce(p.nick, matched_user.nick),
      coalesce(p.status, 'pendente'::public.application_status)
    FROM public.app_auth_users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.id = matched_user.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_change_password(
  _user_id UUID,
  _password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF length(coalesce(_password, '')) < 6 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT';
  END IF;

  UPDATE public.app_auth_users
  SET password_hash = crypt(_password, gen_salt('bf')), updated_at = now()
  WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_disable_user(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  DELETE FROM public.app_auth_users WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_delete_user(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  DELETE FROM public.app_auth_users WHERE id = _user_id;
  DELETE FROM public.applications WHERE user_id = _user_id;
  DELETE FROM public.weekly_reports WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_register(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_change_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_disable_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_user(UUID) TO authenticated;

COMMIT;
