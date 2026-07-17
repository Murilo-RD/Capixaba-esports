-- Restore user roles after accidental deletion.
-- Every app user/profile receives the player role. Bootstrap admin emails receive owner.

BEGIN;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'player'::public.app_role
FROM public.profiles p
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'player'::public.app_role
FROM public.app_auth_users au
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'owner'::public.app_role
FROM public.profiles p
WHERE lower(p.email) IN ('murilo.dhu@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'owner'::public.app_role
FROM public.app_auth_users au
WHERE lower(au.email) IN ('murilo.dhu@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

COMMIT;
