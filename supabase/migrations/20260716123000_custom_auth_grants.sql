-- Extra grants for projects where RPC execution was blocked for anon users.

BEGIN;

GRANT EXECUTE ON FUNCTION public.app_register(TEXT, TEXT, TEXT) TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT) TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_change_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_disable_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_user(UUID) TO authenticated;

COMMIT;
