-- The super admin: a protected owner account. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner-sa@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2-sa@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin3-sa@example.com'),
  ('00000000-0000-0000-0000-0000000000a4', 'sup-sa@example.com'),
  ('00000000-0000-0000-0000-0000000000a5', 'mgmt-sa@example.com');
update public.profiles set role = 'admin', full_name = 'Owner' where email = 'owner-sa@example.com';
update public.profiles set role = 'admin', full_name = 'Admin Two' where email = 'admin2-sa@example.com';
update public.profiles set role = 'admin', full_name = 'Admin Three' where email = 'admin3-sa@example.com';
update public.profiles set role = 'supervisor' where email = 'sup-sa@example.com';
update public.profiles set role = 'management' where email = 'mgmt-sa@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like expected || '%' or sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error: % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.as_dba() returns void language plpgsql as $$
begin
  -- the Supabase SQL Editor: nobody is signed in to the website
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---- before there is a super admin nothing changes -----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
update public.profiles set role = 'admin' where email = 'sup-sa@example.com';
update public.profiles set role = 'supervisor' where email = 'sup-sa@example.com';
select pg_temp.check_that('with no super admin set, any admin can still make and remove admins', (select role = 'supervisor' from public.profiles where email = 'sup-sa@example.com'));
select pg_temp.raises('and an admin cannot set the super admin by editing the flag', $q$update public.profiles set is_super_admin = true where email = 'admin2-sa@example.com'$q$, 'super_admin_protected');
select pg_temp.raises('or hand it over without being the super admin', $q$select public.transfer_super_admin('admin2-sa@example.com')$q$, '42501');
reset role;
select pg_temp.as_dba();

-- ---- whoever owns the database sets it (the Supabase SQL Editor) -------------------------------------------------------------
select pg_temp.raises('only an active admin can be the super admin', $q$select public.transfer_super_admin('sup-sa@example.com')$q$, 'not_an_active_admin');
select public.transfer_super_admin('Owner-SA@example.com');
select pg_temp.check_that('the owner is now the super admin, and only one is', (select count(*) = 1 and bool_and(email = 'owner-sa@example.com') from public.profiles where is_super_admin));
select pg_temp.raises('there can be only one super admin', $q$update public.profiles set is_super_admin = true where email = 'admin2-sa@example.com'$q$, 'super_admin_protected');

-- ---- the super admin account is fixed, whoever asks, even the database owner ----------------------------------------------------
select pg_temp.raises('it cannot be demoted', $q$update public.profiles set role = 'management' where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
select pg_temp.raises('or disabled', $q$update public.profiles set disabled = true where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
select pg_temp.raises('or deleted (which is what erasing the login does)', $q$delete from public.profiles where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
select pg_temp.raises('or have the mark taken off', $q$update public.profiles set is_super_admin = false where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
update public.profiles set full_name = 'The Owner' where email = 'owner-sa@example.com';
select pg_temp.check_that('but its name can be changed', (select full_name = 'The Owner' from public.profiles where email = 'owner-sa@example.com'));

-- ---- other admins -------------------------------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.raises('another admin cannot make someone an admin', $q$update public.profiles set role = 'admin' where email = 'sup-sa@example.com'$q$, 'super_admin_only');
select pg_temp.raises('or take admin away from an admin', $q$update public.profiles set role = 'management' where email = 'admin3-sa@example.com'$q$, 'super_admin_only');
select pg_temp.raises('or demote the super admin', $q$update public.profiles set role = 'management' where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
update public.profiles set role = 'management' where email = 'sup-sa@example.com';
update public.profiles set role = 'supervisor' where email = 'mgmt-sa@example.com';
select pg_temp.check_that('other admins still manage everyone else''s role', (select role = 'management' from public.profiles where email = 'sup-sa@example.com') and (select role = 'supervisor' from public.profiles where email = 'mgmt-sa@example.com'));
update public.profiles set disabled = true where email = 'admin3-sa@example.com';
update public.profiles set disabled = false where email = 'admin3-sa@example.com';
select pg_temp.check_that('and can disable and enable another admin', (select not disabled from public.profiles where email = 'admin3-sa@example.com'));
select pg_temp.raises('but cannot hand the super admin over', $q$select public.transfer_super_admin('admin2-sa@example.com')$q$, '42501');
reset role;

-- ---- the super admin ---------------------------------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.profiles set role = 'admin' where email = 'sup-sa@example.com';
update public.profiles set role = 'management' where email = 'sup-sa@example.com';
update public.profiles set role = 'management' where email = 'admin3-sa@example.com';
select pg_temp.check_that('the super admin can make and remove admins', (select role = 'management' from public.profiles where email = 'admin3-sa@example.com'));
select pg_temp.raises('and still cannot demote themselves', $q$update public.profiles set role = 'management' where email = 'owner-sa@example.com'$q$, 'super_admin_protected');
select public.transfer_super_admin('admin2-sa@example.com');
reset role;
select pg_temp.check_that('the super admin can hand it to another admin', (select count(*) = 1 and bool_and(email = 'admin2-sa@example.com') from public.profiles where is_super_admin));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.raises('and the new super admin is protected', $q$update public.profiles set disabled = true where email = 'admin2-sa@example.com'$q$, 'super_admin_protected');
reset role;
update public.profiles set disabled = true where email = 'owner-sa@example.com';
select pg_temp.check_that('while the earlier owner is an ordinary admin again', (select disabled from public.profiles where email = 'owner-sa@example.com'));

rollback;
