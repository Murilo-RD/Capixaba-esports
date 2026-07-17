INSERT INTO public.profiles (id, email, nick, status)
SELECT au.id, au.email, au.nick, 'pendente'::public.application_status
FROM public.app_auth_users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

UPDATE public.profiles p
SET status = 'pendente'::public.application_status,
    meeting_at = NULL
WHERE p.status = 'aprovado'::public.application_status
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = 'owner'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.user_id = p.id
  );
