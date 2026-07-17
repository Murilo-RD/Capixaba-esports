-- Promote the requested first admin account when it already exists.
-- Safe to run before or after the user registers.

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'owner'::public.app_role
FROM public.profiles p
WHERE lower(p.email) = 'murilo.dhu@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'owner'::public.app_role
FROM public.app_auth_users au
WHERE lower(au.email) = 'murilo.dhu@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
