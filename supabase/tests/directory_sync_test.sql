-- The Supervisors directory follows the supervisor accounts. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'sup-dir1@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'sup-dir2@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'adm-dir@example.com'),
  ('00000000-0000-0000-0000-0000000000f4', 'pass-dir@example.com');
create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

update public.profiles set role = 'supervisor', full_name = 'Doreen Mensah' where email = 'sup-dir1@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-dir@example.com';
select pg_temp.check_that('a new supervisor account is in the directory, active, with their name and email',
  (select count(*) = 1 and bool_and(active and full_name = 'Doreen Mensah' and email = 'sup-dir1@example.com') from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f1'));
select pg_temp.check_that('an admin or a passenger is not', (select count(*) = 0 from public.supervisor_directory where user_id in ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4')));

update public.profiles set full_name = 'Doreen Owusu' where email = 'sup-dir1@example.com';
select pg_temp.check_that('a new name follows to the directory, without a second entry',
  (select count(*) = 1 and bool_and(full_name = 'Doreen Owusu') from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f1'));

update public.supervisor_directory set active = false where user_id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set full_name = 'Doreen Owusu-Mensah' where email = 'sup-dir1@example.com';
select pg_temp.check_that('an admin''s Inactive switch is not undone by a name change',
  (select not active and full_name = 'Doreen Owusu-Mensah' from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f1'));

-- an entry the supervisor or an approval made first is used, not copied
insert into public.supervisor_directory (user_id, full_name, email, active, phone) values ('00000000-0000-0000-0000-0000000000f2', 'Own Entry', 'sup-dir2@example.com', true, '0241234567');
update public.profiles set role = 'supervisor', full_name = 'Mavis Boateng' where email = 'sup-dir2@example.com';
select pg_temp.check_that('an entry that was already there is kept (with its phone), not duplicated',
  (select count(*) = 1 and bool_and(phone = '0241234567' and full_name = 'Mavis Boateng') from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f2'));

update public.profiles set disabled = true where email = 'sup-dir2@example.com';
select pg_temp.check_that('a disabled account can no longer be assigned: its entry becomes inactive',
  (select not active from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f2'));
update public.profiles set disabled = false, role = 'management' where email = 'sup-dir2@example.com';
select pg_temp.check_that('so does someone who is no longer a supervisor', (select not active from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f2'));

-- supervisors who were missing before this update are added by the backfill
create temp table n_added (n integer);
delete from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f1';
insert into n_added select public.supervisor_directory_backfill();
select pg_temp.check_that('the backfill adds a supervisor who has no entry, active', (select n = 1 from n_added)
  and (select count(*) = 1 and bool_and(active) from public.supervisor_directory where user_id = '00000000-0000-0000-0000-0000000000f1'));
delete from n_added;
insert into n_added select public.supervisor_directory_backfill();
select pg_temp.check_that('and adds nothing when run again', (select n = 0 from n_added));
rollback;
