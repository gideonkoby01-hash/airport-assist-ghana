-- Supervisors on a roster by name before they have a login: they carry over, and an account with the same name takes their place.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'gm-rn@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'ama-rn@example.com'),
  ('00000000-0000-0000-0000-0000000000e3', 'ama2-rn@example.com');
update public.profiles set role = 'management', full_name = 'Gina General' where email = 'gm-rn@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2')::text, true);
  set local role authenticated;
end $$;
create temp table keep (k text primary key, v text);
grant all on keep to public;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'r', public.roster_generate('supervisor', current_date, 3, null);
reset role;

-- names from the paper sheet, with no accounts
set local role service_role;
insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead) values
  ((select v::uuid from keep where k = 'r'), 'name:ama', 'Ama', 2, true),
  ((select v::uuid from keep where k = 'r'), 'name:yaw', 'Yaw', 3, false);
reset role;

select pg_temp.check_that('a name matches no account yet', public.roster_match_person('supervisor', 'Ama') is null);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'next', public.roster_generate('supervisor', (date_trunc('month', current_date) + interval '1 month')::date, null, null);
select pg_temp.check_that('name-only people carry over to the next month with their shift and mark',
  (select count(*) = 2 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'next') and person_id like 'name:%')
  and (select group_no = 2 and lead from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'next') and person_id = 'name:ama'));
select public.roster_delete((select v::uuid from keep where k = 'next'));
reset role;

-- an account with the same first name appears
set local role service_role;
update public.profiles set role = 'supervisor', full_name = 'Ama Boateng' where email = 'ama-rn@example.com';
reset role;
select pg_temp.check_that('the account is found from the first name', public.roster_match_person('supervisor', 'Ama') = '00000000-0000-0000-0000-0000000000e2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'added', public.roster_add_missing((select v::uuid from keep where k = 'r'))::text;
select pg_temp.check_that('adding the missing people puts the account in the place of the name, not beside it',
  (select count(*) = 2 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r'))
  and (select group_no = 2 and lead and person_name = 'Ama Boateng' from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = '00000000-0000-0000-0000-0000000000e2')
  and not exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = 'name:ama')
  and (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = 'name:yaw')));
reset role;

-- two accounts with the same first name: the name is ambiguous, so nobody is swapped in by mistake
set local role service_role;
update public.profiles set role = 'supervisor', full_name = 'Ama Owusu' where email = 'ama2-rn@example.com';
reset role;
select pg_temp.check_that('a name that fits two accounts matches none', public.roster_match_person('supervisor', 'Ama') is null);

rollback;
