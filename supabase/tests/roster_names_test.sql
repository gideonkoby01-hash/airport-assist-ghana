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

-- ---- adding people by name, and who may edit a past month ----------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e4', 'ops-rn@example.com'),
  ('00000000-0000-0000-0000-0000000000e5', 'adm-rn@example.com'),
  ('00000000-0000-0000-0000-0000000000e6', 'kwesi-rn@example.com');
update public.profiles set role = 'management', staff_role = 'operations_manager', full_name = 'Oti Operations' where email = 'ops-rn@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-rn@example.com';
update public.profiles set role = 'supervisor', full_name = 'Kwesi Pratt' where email = 'kwesi-rn@example.com';
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
insert into keep select 'mia', public.roster_add_person((select v::uuid from keep where k = 'r'), '  Mia   Addo ', 4, false);
select pg_temp.check_that('the Operations manager can add a supervisor by name, tidied up',
  (select v = 'name:mia addo' from keep where k = 'mia')
  and (select person_name = 'Mia Addo' and group_no = 4 and not lead from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = 'name:mia addo'));
select pg_temp.raises('the same name cannot be added twice', format($q$select public.roster_add_person(%L, 'mia addo', 1, false)$q$, (select v from keep where k = 'r')), 'already_on');
select pg_temp.raises('a name is needed', format($q$select public.roster_add_person(%L, ' ', 1, false)$q$, (select v from keep where k = 'r')), 'name_required');
select pg_temp.raises('and one of the four shifts', format($q$select public.roster_add_person(%L, 'Someone', 9, false)$q$, (select v from keep where k = 'r')), 'invalid_group');
select pg_temp.check_that('a supervisor account made before the roster change is already on the roster, picked up by itself',
  (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = '00000000-0000-0000-0000-0000000000e6' and person_name = 'Kwesi Pratt')));
select pg_temp.raises('so adding the same name again is refused', format($q$select public.roster_add_person(%L, 'Kwesi Pratt', 1, false)$q$, (select v from keep where k = 'r')), 'already_on');
select public.roster_rename_member((select v::uuid from keep where k = 'r'), 'name:mia addo', 'Mia Addoh');
select pg_temp.check_that('a person added by name can be renamed',
  (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'r') and person_id = 'name:mia addoh' and person_name = 'Mia Addoh')));
select pg_temp.raises('an account cannot be renamed here', format($q$select public.roster_rename_member(%L, '00000000-0000-0000-0000-0000000000e6', 'Other')$q$, (select v from keep where k = 'r')), 'not_name_only');
reset role;

-- a month that is over
set local role service_role;
insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor)
values ('porter', (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 month')::date, array[2, 1, 0, 3], null);
insert into keep select 'old', id::text from public.shift_rosters where kind = 'porter' and month < date_trunc('month', current_date)::date;
insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values ((select v::uuid from keep where k = 'old'), 'name:old porter', 'Old Porter', 1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select pg_temp.raises('the Operations manager cannot change a past month', format($q$select public.roster_add_person(%L, 'Late Name', 1, false)$q$, (select v from keep where k = 'old')), 'month_past');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select public.roster_add_person((select v::uuid from keep where k = 'old'), 'Corrected Porter', 2, false);
select public.roster_set_member((select v::uuid from keep where k = 'old'), 'name:old porter', 3, null);
select public.roster_remove_member((select v::uuid from keep where k = 'old'), 'name:corrected porter');
select pg_temp.check_that('an admin can correct the people of a past month',
  (select count(*) = 1 and bool_and(group_no = 3) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'old')));
select pg_temp.raises('but not reshuffle it', format($q$select public.roster_shuffle(%L, null)$q$, (select v from keep where k = 'old')), 'month_past');
select pg_temp.raises('or restart its pattern', format($q$select public.roster_set_cycle(%L, 1, null)$q$, (select v from keep where k = 'old')), 'month_past');
select pg_temp.raises('or delete it', format($q$select public.roster_delete(%L)$q$, (select v from keep where k = 'old')), 'month_past');
reset role;

-- ---- the order names were put in is kept; a porter's first name does not match another porter ------------------------------
set local role service_role;
insert into public.porters (full_name, phone_number, active) values ('Amu Davis', '', true), ('Zed Last', '', true), ('Abe First', '', true);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'por', public.roster_generate('porter', current_date, 1, null);
select public.roster_add_person((select v::uuid from keep where k = 'por'), 'Amu', 2, false);
select pg_temp.check_that('a person added later goes to the end of the order',
  (select position = (select max(position) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por')) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_id = 'name:amu'));
select public.roster_remove_member((select v::uuid from keep where k = 'por'), (select person_id from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_name = 'Amu Davis'));
insert into keep select 'porcount', public.roster_add_missing((select v::uuid from keep where k = 'por'))::text;
select pg_temp.check_that('a porter called Amu Davis is added, not swapped for the porter called Amu',
  (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_name = 'Amu Davis' and person_id not like 'name:%'))
  and (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_id = 'name:amu')));
select public.roster_set_member((select v::uuid from keep where k = 'por'), 'name:amu', 4, null);
select public.roster_remove_member((select v::uuid from keep where k = 'por'), (select person_id from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_name = 'Zed Last'));
insert into keep select 'porcount2', public.roster_add_missing((select v::uuid from keep where k = 'por'))::text;
select pg_temp.check_that('someone taken off and added again goes to the end',
  (select position = (select max(position) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por')) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') and person_name = 'Zed Last'));
insert into keep select 'pornext', public.roster_generate('porter', (date_trunc('month', current_date) + interval '1 month')::date, null, null);
select pg_temp.check_that('the next month keeps the order',
  (select string_agg(person_name, ',' order by position) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por'))
  = (select string_agg(person_name, ',' order by position) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'pornext')));
reset role;

-- ---- creating logins for supervisors on the roster by name -------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e7', 'yaw-rn@example.com'),
  ('00000000-0000-0000-0000-0000000000e8', 'notsup-rn@example.com');
update public.profiles set role = 'management', full_name = 'Not Supervisor' where email = 'notsup-rn@example.com';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'sup-next', public.roster_generate('supervisor', (date_trunc('month', current_date) + interval '1 month')::date, null, null);
reset role;
-- the login is made after both months have the name
update public.profiles set role = 'supervisor', full_name = 'Kwabena Asare' where email = 'yaw-rn@example.com';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select pg_temp.raises('the Operations manager cannot link an account', $q$select public.roster_link_account('name:yaw', '00000000-0000-0000-0000-0000000000e7')$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select pg_temp.raises('only a supervisor account can be linked', $q$select public.roster_link_account('name:yaw', '00000000-0000-0000-0000-0000000000e8')$q$, 'not_supervisor');
select pg_temp.raises('only a name-only person can be replaced', $q$select public.roster_link_account('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e7')$q$, 'not_name_only');
insert into keep select 'linked', public.roster_link_account('name:yaw', '00000000-0000-0000-0000-0000000000e7')::text;
select pg_temp.check_that('the name is replaced by the account in every month it was on, with the same shift and order',
  (select v::int >= 2 from keep where k = 'linked')
  and not exists (select 1 from public.shift_roster_members where person_id = 'name:yaw')
  and (select count(*) = 2 and bool_and(group_no = 3) and bool_and(person_name = 'Kwabena Asare') from public.shift_roster_members where person_id = '00000000-0000-0000-0000-0000000000e7'));
reset role;

-- ---- anyone added is picked up by the roster ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into keep select 'pick', public.roster_generate('porter', (date_trunc('month', current_date) + interval '2 months')::date, null, null);
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'fresh-sup-rn@example.com');
set local role service_role;
insert into public.porters (full_name, phone_number, active) values ('Fresh Porter', '0240001111', true), ('Gone Porter', '0240002222', false);
update public.profiles set role = 'supervisor', full_name = 'Fresh Supervisor' where email = 'fresh-sup-rn@example.com';
reset role;
select pg_temp.check_that('a new porter is on this month and the later ones, but a porter who is not active is not',
  (select count(*) = (select count(*) from public.shift_rosters where kind = 'porter' and month >= date_trunc('month', current_date)::date) and count(*) >= 3 from public.shift_roster_members where person_name = 'Fresh Porter' and roster_id in (select id from public.shift_rosters where kind = 'porter' and month >= date_trunc('month', current_date)::date))
  and not exists (select 1 from public.shift_roster_members where person_name = 'Gone Porter'));
select pg_temp.check_that('a new supervisor is on the supervisor rosters',
  (select exists (select 1 from public.shift_roster_members m join public.shift_rosters r on r.id = m.roster_id where r.kind = 'supervisor' and m.person_id = '00000000-0000-0000-0000-0000000000e9' and m.person_name = 'Fresh Supervisor')));
select pg_temp.check_that('and goes to the smallest shift',
  (select group_no = (select g from generate_series(1, 4) g order by (select count(*) from public.shift_roster_members x where x.roster_id = m.roster_id and x.group_no = g and x.person_id <> m.person_id), g limit 1)
   from public.shift_roster_members m join public.shift_rosters r on r.id = m.roster_id where r.kind = 'supervisor' and m.person_id = '00000000-0000-0000-0000-0000000000e9' limit 1));
set local role service_role;
update public.porters set full_name = 'Fresh Porter Renamed' where full_name = 'Fresh Porter';
update public.porters set active = true where full_name = 'Gone Porter';
reset role;
select pg_temp.check_that('a new name follows to the rosters, and a porter who becomes active is picked up',
  (select count(*) = (select count(*) from public.shift_rosters where kind = 'porter' and month >= date_trunc('month', current_date)::date) from public.shift_roster_members where person_name = 'Fresh Porter Renamed')
  and (select count(*) >= 1 from public.shift_roster_members where person_name = 'Gone Porter'));
-- a month that is over is left alone
set local role service_role;
update public.shift_rosters set month = (date_trunc('month', current_date) - interval '2 months')::date, anchor_date = (date_trunc('month', current_date) - interval '2 months')::date where id = (select v::uuid from keep where k = 'old');
reset role;
insert into public.porters (full_name, phone_number, active) values ('After Old Porter', '0240003333', true);
select pg_temp.check_that('past months are not changed by new people', not exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'old') and person_name = 'After Old Porter'));

rollback;
