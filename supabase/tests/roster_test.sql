-- Monthly shift rosters: who may make and change them, how people are spread over the four shifts, how a month carries on from the last,
-- and that past months cannot be changed. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'gm-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'ops-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'acc-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d4', 'sup1-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d5', 'sup2-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d6', 'sup3-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d7', 'sup4-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d8', 'sup5-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000d9', 'sup6-ro@example.com'),
  ('00000000-0000-0000-0000-0000000000da', 'adm-ro@example.com');
update public.profiles set role = 'management', full_name = 'Gina General' where email = 'gm-ro@example.com';
update public.profiles set role = 'management', staff_role = 'operations_manager', full_name = 'Oti Operations' where email = 'ops-ro@example.com';
update public.profiles set role = 'accounts', full_name = 'Akos Accountant' where email = 'acc-ro@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Doreen' where email = 'sup1-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Emmanuella' where email = 'sup2-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Ankrah' where email = 'sup3-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Mavis' where email = 'sup4-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Betty' where email = 'sup5-ro@example.com';
update public.profiles set role = 'supervisor', full_name = 'Faustina' where email = 'sup6-ro@example.com';

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

set local role service_role;
insert into public.porters (full_name, phone_number, active)
select 'Porter ' || lpad(i::text, 2, '0'), '024000' || lpad(i::text, 4, '0'), true from generate_series(1, 10) i;
insert into public.porters (full_name, phone_number, active) values ('Retired Rita', '0240009999', false);
reset role;

-- ---- who may do it ------------------------------------------------------------------------------------
select pg_temp.check_that('the Operations manager has the roster task', (select exists (select 1 from public.role_permissions where role_key = 'operations_manager' and permission = 'rosters.manage')));
select pg_temp.check_that('the General manager has the roster task', (select exists (select 1 from public.role_permissions where role_key = 'general_manager' and permission = 'rosters.manage')));
select pg_temp.check_that('the Accounts manager does not', (select not exists (select 1 from public.role_permissions where role_key = 'accounts_manager' and permission = 'rosters.manage')));

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.raises('the accountant cannot make a roster', $q$select public.roster_generate('supervisor', current_date, 3, null)$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.raises('a supervisor cannot make a roster', $q$select public.roster_generate('supervisor', current_date, 3, null)$q$, '42501');
reset role;

-- ---- the first roster ----------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.raises('the first roster needs the shift on the morning of the 1st', $q$select public.roster_generate('supervisor', current_date, null, null)$q$, 'start_required');
select pg_temp.raises('there are four shifts', $q$select public.roster_generate('supervisor', current_date, 5, null)$q$, 'start_required');
select pg_temp.raises('a roster is for supervisors or porters', $q$select public.roster_generate('cleaner', current_date, 3, null)$q$, 'invalid_kind');
select pg_temp.raises('a past month cannot be made', $q$select public.roster_generate('supervisor', (date_trunc('month', current_date) - interval '1 month')::date, 3, null)$q$, 'month_past');
insert into keep select 'sup', public.roster_generate('supervisor', current_date, 3, (date_trunc('month', current_date) + interval '3 days')::date);
insert into keep select 'por', public.roster_generate('porter', current_date, 1, null);

select pg_temp.check_that('the pattern is stored from the 1st, with shift three on the morning',
  (select anchor_date = date_trunc('month', current_date)::date and phases = array[2, 1, 0, 3] and month = date_trunc('month', current_date)::date
   from public.shift_rosters where id = (select v::uuid from keep where k = 'sup')));
select pg_temp.check_that('the head supervisor mark starts on the day given', (select head_anchor = (date_trunc('month', current_date) + interval '3 days')::date from public.shift_rosters where id = (select v::uuid from keep where k = 'sup')));
select pg_temp.check_that('porters have no head supervisor mark', (select head_anchor is null from public.shift_rosters where id = (select v::uuid from keep where k = 'por')));
select pg_temp.check_that('all six supervisors are on, spread evenly over the four shifts',
  (select sum(c) = 6 and max(c) - min(c) <= 1 from (select group_no, count(*) c from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup') group by group_no) x)
  and (select count(distinct group_no) = 4 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup')));
select pg_temp.check_that('all ten active porters are on, and the retired one is not',
  (select count(*) = 10 and bool_and(person_name like 'Porter %') from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por')));
select pg_temp.raises('there is one roster for each kind and month', $q$select public.roster_generate('porter', current_date, 1, null)$q$, 'already_exists');

-- ---- moving people and reshuffling ------------------------------------------------------------------------
select public.roster_set_member((select v::uuid from keep where k = 'sup'), '00000000-0000-0000-0000-0000000000d6', 4, true);
select pg_temp.check_that('a person can be moved to another shift and marked',
  (select group_no = 4 and lead from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup') and person_id = '00000000-0000-0000-0000-0000000000d6'));
select pg_temp.raises('there is no fifth shift', $q$select public.roster_set_member((select v::uuid from keep where k = 'sup'), '00000000-0000-0000-0000-0000000000d6', 5, null)$q$, 'invalid_group');
select pg_temp.raises('someone not on the roster cannot be moved', $q$select public.roster_set_member((select v::uuid from keep where k = 'sup'), 'nobody', 1, null)$q$, 'not_found');
select public.roster_set_member((select v::uuid from keep where k = 'sup'), '00000000-0000-0000-0000-0000000000d4', 2, true);
select public.roster_shuffle((select v::uuid from keep where k = 'sup'), 'seed-one');
insert into keep select 'shuffle1', string_agg(person_id || ':' || group_no, ',' order by person_id) from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup');
select pg_temp.check_that('a shuffle keeps the shifts even',
  (select max(c) - min(c) <= 1 from (select count(*) c from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup') group by group_no) x));
select pg_temp.check_that('a shuffle puts the marked people in different shifts',
  (select count(distinct group_no) = 2 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup') and lead));
select public.roster_shuffle((select v::uuid from keep where k = 'sup'), 'seed-one');
select pg_temp.check_that('the same seed gives the same shuffle',
  (select string_agg(person_id || ':' || group_no, ',' order by person_id) = (select v from keep where k = 'shuffle1') from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup')));
select public.roster_shuffle((select v::uuid from keep where k = 'por'), null);
select pg_temp.check_that('a shuffle of porters spreads 10 people as 3, 3, 2, 2',
  (select array_agg(c::int order by c desc) = array[3, 3, 2, 2] from (select count(*) c from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'por') group by group_no) x));

-- someone leaves, someone joins
select public.roster_remove_member((select v::uuid from keep where k = 'sup'), '00000000-0000-0000-0000-0000000000d9');
select pg_temp.check_that('a person can be taken off', (select count(*) = 5 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup')));
insert into keep select 'added', public.roster_add_missing((select v::uuid from keep where k = 'sup'))::text;
select pg_temp.check_that('adding the missing people puts the person back in the smallest shift',
  (select v = '1' from keep where k = 'added')
  and (select count(*) = 6 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup')));
reset role;

-- ---- the next month carries on -------------------------------------------------------------------------------
set local role service_role;
update public.profiles set disabled = true where email = 'sup5-ro@example.com';
update public.profiles set full_name = 'Doreen Renamed' where email = 'sup1-ro@example.com';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into keep select 'sup2', public.roster_generate('supervisor', (date_trunc('month', current_date) + interval '1 month')::date, null, null);
select pg_temp.check_that('the next month keeps the same pattern and head supervisor mark',
  (select a.anchor_date = b.anchor_date and a.phases = b.phases and a.head_anchor = b.head_anchor and b.month = (a.month + interval '1 month')::date
   from public.shift_rosters a, public.shift_rosters b where a.id = (select v::uuid from keep where k = 'sup') and b.id = (select v::uuid from keep where k = 'sup2')));
select pg_temp.check_that('it keeps the people in their shifts, with their marks, and drops someone who left',
  (select count(*) = 5 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup2'))
  and not exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup2') and person_id = '00000000-0000-0000-0000-0000000000d8')
  and (select count(*) = 5 from public.shift_roster_members a join public.shift_roster_members b on a.person_id = b.person_id and a.group_no = b.group_no and a.lead = b.lead
       where a.roster_id = (select v::uuid from keep where k = 'sup') and b.roster_id = (select v::uuid from keep where k = 'sup2')));
select pg_temp.check_that('a new name is used', (select exists (select 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup2') and person_name = 'Doreen Renamed')));
select pg_temp.raises('the earlier month cannot have its start changed once a later one exists', format($q$select public.roster_set_cycle(%L, 2, null)$q$, (select v from keep where k = 'sup')), 'later_exists');
select pg_temp.raises('nor be deleted', format($q$select public.roster_delete(%L)$q$, (select v from keep where k = 'sup')), 'later_exists');
select public.roster_set_cycle((select v::uuid from keep where k = 'sup2'), 2, null);
select pg_temp.check_that('the latest month can start with another shift on the morning', (select phases = array[1, 0, 3, 2] and anchor_date = month from public.shift_rosters where id = (select v::uuid from keep where k = 'sup2')));
select public.roster_delete((select v::uuid from keep where k = 'sup2'));
select pg_temp.check_that('the latest month can be deleted', (select count(*) = 1 from public.shift_rosters where kind = 'supervisor'));
reset role;

-- ---- past months are fixed -------------------------------------------------------------------------------------
set local role service_role;
insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor)
values ('porter', (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 month')::date, array[2, 1, 0, 3], null);
insert into keep select 'past', id::text from public.shift_rosters where kind = 'porter' and month < date_trunc('month', current_date)::date;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.raises('a past month cannot be shuffled', format($q$select public.roster_shuffle(%L, null)$q$, (select v from keep where k = 'past')), 'month_past');
select pg_temp.raises('nor deleted', format($q$select public.roster_delete(%L)$q$, (select v from keep where k = 'past')), 'month_past');
select pg_temp.raises('nor given another start', format($q$select public.roster_set_cycle(%L, 1, null)$q$, (select v from keep where k = 'past')), 'month_past');

-- ---- who can read, and nobody writes directly ---------------------------------------------------------------------
select pg_temp.check_that('a manager can read the rosters', (select count(*) >= 3 from public.shift_rosters));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.check_that('a supervisor can read the roster and its people', (select count(*) >= 2 from public.shift_rosters) and (select count(*) >= 5 from public.shift_roster_members));
select pg_temp.raises('but cannot write to it directly', $q$update public.shift_roster_members set group_no = 1$q$, '42501');
select pg_temp.raises('or reshuffle it', $q$select public.roster_shuffle((select id from public.shift_rosters limit 1), null)$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.check_that('the accountant does not see rosters', (select count(*) = 0 from public.shift_rosters));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000da');
select public.roster_set_member((select v::uuid from keep where k = 'sup'), '00000000-0000-0000-0000-0000000000d6', 1, false);
select pg_temp.check_that('an admin can always do it', (select group_no = 1 from public.shift_roster_members where roster_id = (select v::uuid from keep where k = 'sup') and person_id = '00000000-0000-0000-0000-0000000000d6'));
select pg_temp.check_that('changes are audited', (select count(*) >= 1 from public.audit_log where table_name = 'shift_roster_members'));
reset role;

-- ---- an admin can take the task away from a role -----------------------------------------------------------------
set local role service_role;
delete from public.role_permissions where role_key = 'operations_manager' and permission = 'rosters.manage';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.raises('without the task the Operations manager cannot change a roster', format($q$select public.roster_shuffle(%L, null)$q$, (select v from keep where k = 'sup')), '42501');
reset role;

rollback;
