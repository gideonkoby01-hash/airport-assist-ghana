-- Supervisor commission on meet and assist bookings. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'sup-sc@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'mgr-sc@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'sup2-sc@example.com');
update public.profiles set role = 'supervisor', full_name = 'Sam Supervisor' where email = 'sup-sc@example.com';
update public.profiles set role = 'management', full_name = 'Mina Manager' where email = 'mgr-sc@example.com';
update public.profiles set role = 'supervisor' where email = 'sup2-sc@example.com';

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
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2')::text, true);
  set local role authenticated;
end $$;

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false)
on conflict (code) do nothing;

-- sales by the supervisor: a meet and assist and a porter-only sale, each with a porter so the shift can close
select public.create_quick_sale('00000000-0000-0000-0000-0000000000f1', 'Sam', 'SC-1', 'full_arrival', 1, null, 'Ama', '', null, null, 'cash', 'Kojo', 1, 30);
select public.create_quick_sale('00000000-0000-0000-0000-0000000000f1', 'Sam', 'SC-2', 'full_arrival', 1, null, 'Kwame', '', null, null, 'cash', 'Kojo', 1, 30);
select public.create_quick_sale('00000000-0000-0000-0000-0000000000f1', 'Sam', 'SC-3', 'porter_only', 1, null, null, '', null, null, 'cash', 'Yaw', 1, 30);
create temp table cur as
  select case when extract(hour from now() at time zone 'utc') < 6 then current_date - 1 else current_date end as period,
         case when extract(hour from now() at time zone 'utc') between 6 and 17 then 'morning' else 'night' end as shift;
grant select on cur to service_role, authenticated;

select pg_temp.check_that('before any tick the report takes nothing off for supervisor commission',
  (select (b ->> 'supervisor_commission')::numeric = 0 and (b ->> 'net_after_commission')::numeric = 1500 - 90
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000f1', (select period from cur), (select shift from cur)) as b) x));

-- marking
select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-1'), true, 50, 'f1');
select pg_temp.check_that('marking records the amount, the time and who earned it',
  (select supervisor_commission = 50 and supervisor_commission_at is not null and supervisor_commission_by = '00000000-0000-0000-0000-0000000000f1' from public.bookings where reference = 'SC-1'));
select pg_temp.raises('a porter-only sale earns no supervisor commission',
  $q$select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-3'), true, 50, 'f1')$q$, 'not_meet_assist');
select pg_temp.raises('a negative amount is refused',
  $q$select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-2'), true, -1, 'f1')$q$, 'invalid_amount');

-- the report applies it to the day's takings
select pg_temp.check_that('the shift report takes the commission off the takings',
  (select (b ->> 'supervisor_commission')::numeric = 50 and (b ->> 'supervisor_commission_count')::int = 1
      and (b ->> 'net_after_commission')::numeric = 1500 - 90 - 50
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000f1', (select period from cur), (select shift from cur)) as b) x));

-- unmarking before the report is filed
select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-1'), false, 0, 'f1');
select pg_temp.check_that('unticking puts it back',
  (select supervisor_commission = 0 and supervisor_commission_at is null from public.bookings where reference = 'SC-1'));
select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-1'), true, 50, 'f1');
select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-2'), true, 50, 'f1');

-- filing the report stores the figure and locks the ticks
select pg_temp.check_that('the filed report keeps the supervisor commission and the net',
  (select supervisor_commission = 100 and net_after_commission = 1500 - 90 - 100
   from public.create_shift_report('00000000-0000-0000-0000-0000000000f1', 'Sam', (select period from cur), (select shift from cur), 1400, '')));
select pg_temp.raises('a commission in a filed report cannot be changed',
  $q$select public.set_supervisor_commission((select id from public.bookings where reference = 'SC-1'), false, 0, 'f1')$q$, 'report_filed');

-- the other supervisor's report is untouched
select pg_temp.check_that('another supervisor is not affected',
  (select (b ->> 'supervisor_commission')::numeric = 0
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000f3', (select period from cur), (select shift from cur)) as b) x));

-- who can read the list of commissions
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.raises('a supervisor cannot read the commissions list', $q$select * from public.supervisor_commissions(null, null)$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check_that('management sees every commission with the supervisor named',
  (select count(*) = 2 and sum(amount) = 100 and bool_and(supervisor_name = 'Sam Supervisor') from public.supervisor_commissions(null, null)));
select pg_temp.check_that('a date range outside them returns none',
  (select count(*) = 0 from public.supervisor_commissions(current_date - 10, current_date - 5)));
select pg_temp.check_that('today is inside the range',
  (select count(*) = 2 from public.supervisor_commissions(current_date - 1, current_date + 1)));
rollback;
