-- The Supervisors directory (and so who can be assigned to a booking) now follows the supervisor accounts by itself.
-- Until now a directory entry was only made when a staff request was approved, when the supervisor filled in their own profile, or when an admin
-- pressed "Sync from Users", so a supervisor account made under Staff accounts was missing from the directory and could not be assigned bookings.
--   * An active supervisor account always has a directory entry (made if missing, active).
--   * Their name and email in the directory follow the account. An admin's Active / Inactive switch is not undone by this.
--   * If the account is disabled, or the person is no longer a supervisor, their entry becomes inactive (they can no longer be assigned).
-- The backfill below adds the entries for the supervisors who are missing today. Safe to run more than once.

create or replace function public.supervisor_directory_backfill() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.supervisor_directory (user_id, full_name, email, active)
  select p.id::text, coalesce(nullif(btrim(p.full_name), ''), ''), p.email, true
  from public.profiles p
  where p.role = 'supervisor' and not p.disabled
    and not exists (select 1 from public.supervisor_directory d where d.user_id = p.id::text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.supervisor_directory_backfill() from public, anon, authenticated;

create or replace function public.profiles_directory_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare shown text := coalesce(nullif(btrim(new.full_name), ''), '');
begin
  if new.role = 'supervisor' and not new.disabled then
    insert into public.supervisor_directory (user_id, full_name, email, active)
    select new.id::text, shown, new.email, true
    where not exists (select 1 from public.supervisor_directory d where d.user_id = new.id::text);
    update public.supervisor_directory set full_name = case when shown <> '' then shown else full_name end, email = new.email
    where user_id = new.id::text and ((shown <> '' and full_name is distinct from shown) or email is distinct from new.email);
  elsif tg_op = 'UPDATE' then
    update public.supervisor_directory set active = false where user_id = new.id::text and active;
  end if;
  return null;
end $$;
revoke all on function public.profiles_directory_sync() from public, anon, authenticated;
drop trigger if exists profiles_directory_sync on public.profiles;
create trigger profiles_directory_sync after insert or update of role, disabled, full_name, email on public.profiles
  for each row execute function public.profiles_directory_sync();

select public.supervisor_directory_backfill();
