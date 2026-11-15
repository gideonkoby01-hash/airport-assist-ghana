-- A person can edit their own name and phone, and nothing else. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'pax-profile@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'other-profile@example.com'),
  ('00000000-0000-0000-0000-0000000000e3', 'off-profile@example.com');
update public.profiles set disabled = true where email = 'off-profile@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL %', label; end if;
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
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1')::text, true);
  set local role authenticated;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check_that('name and phone are saved',
  (select full_name = 'Ama Mensah' and phone = '+233 24 123 4567' from public.update_my_profile('  Ama Mensah ', '+233 24 123 4567')));
select pg_temp.check_that('the row really changed', (select phone = '+233 24 123 4567' from public.profiles where id = auth.uid()));
select pg_temp.check_that('a blank phone clears it', (select phone = '' from public.update_my_profile('Ama Mensah', '')));
select pg_temp.raises('a bad phone is refused', $q$select public.update_my_profile('Ama', 'call me')$q$, 'invalid_phone');
select pg_temp.raises('a very long name is refused', $q$select public.update_my_profile(repeat('x', 121), '')$q$, 'name_too_long');
-- a direct table update by a passenger matches no rows (row-level security), so nothing changes
update public.profiles set role = 'admin' where id = auth.uid();
select pg_temp.check_that('role stays passenger even after a direct update attempt', (select role = 'passenger' from public.profiles where id = auth.uid()));
select pg_temp.check_that('the other person is untouched', (select full_name = '' and phone = '' from public.profiles where email = 'other-profile@example.com'));

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.raises('a disabled account cannot edit', $q$select public.update_my_profile('x', '')$q$, 'account_unavailable');

reset role;
set local role anon;
select pg_temp.raises('signed-out callers are refused', $q$select public.update_my_profile('x', '')$q$, '42501');
rollback;
