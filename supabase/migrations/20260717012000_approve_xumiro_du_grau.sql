-- Approve the requested player/candidate.

BEGIN;

UPDATE public.profiles
SET status = 'aprovado'::public.application_status,
    meeting_at = NULL
WHERE lower(nick) = lower('Xumiro Du Grau')
   OR id IN (
      SELECT au.id
      FROM public.app_auth_users au
      WHERE lower(au.nick) = lower('Xumiro Du Grau')
   );

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'player'::public.app_role
FROM public.profiles p
WHERE lower(p.nick) = lower('Xumiro Du Grau')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'player'::public.app_role
FROM public.app_auth_users au
WHERE lower(au.nick) = lower('Xumiro Du Grau')
ON CONFLICT (user_id, role) DO NOTHING;

COMMIT;
