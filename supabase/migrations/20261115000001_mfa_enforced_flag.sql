-- Lets the signed-in website ask whether two-step verification is enforced for staff, so the emergency switch
-- (app_settings.require_staff_mfa = 'false') also lifts the "set up an authenticator app" screen.
-- It reveals only that one yes/no value, and only to signed-in users.
create function public.staff_mfa_enforced() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select value from public.app_settings where key = 'require_staff_mfa'), 'true') = 'true' $$;

revoke execute on function public.staff_mfa_enforced() from public, anon;
grant execute on function public.staff_mfa_enforced() to authenticated, service_role;
