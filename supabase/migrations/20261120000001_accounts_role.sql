-- A new staff role, "accounts", for the person who keeps the books. They see the Accounts section and the analytics
-- dashboard (nothing else): no bookings, customers or staff screens. Like admin and management they must use two-step
-- verification. Safe to run more than once.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('passenger', 'supervisor', 'management', 'admin', 'accounts', 'pending'));
alter table public.staff_role_assignments drop constraint if exists staff_role_assignments_role_check;
alter table public.staff_role_assignments add constraint staff_role_assignments_role_check check (role in ('passenger', 'supervisor', 'management', 'admin', 'accounts'));

create or replace function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p.disabled then 'disabled'
    when p.role in ('admin', 'management', 'accounts')
         and coalesce((select value from public.app_settings where key = 'require_staff_mfa'), 'true') = 'true'
         and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then 'mfa_required'
    else p.role end
  from public.profiles p where p.id = auth.uid()
$$;

-- The finance reports and the expenses book are open to accounts as well.
create or replace function public.require_finance_role() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'management', 'accounts') then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

drop policy if exists expenses_staff_read on public.expenses;
create policy expenses_staff_read on public.expenses for select to authenticated using (public.app_role() in ('admin', 'management', 'accounts'));
drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses for insert to authenticated with check (public.app_role() in ('admin', 'management', 'accounts'));
drop policy if exists expenses_staff_update on public.expenses;
create policy expenses_staff_update on public.expenses for update to authenticated
  using (public.app_role() in ('admin', 'management', 'accounts')) with check (public.app_role() in ('admin', 'management', 'accounts'));
