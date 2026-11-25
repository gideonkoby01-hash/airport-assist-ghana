-- Porter logins and the porter dashboard. Run after the migrations.
begin;
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

insert into public.porters (id, full_name, phone_number) values
  ('00000000-0000-0000-0000-00000000f001', 'Kofi Mensah', '0241111111'),
  ('00000000-0000-0000-0000-00000000f002', 'Ama Boateng', '0242222222');

create temp table d as select (now() at time zone 'Africa/Accra')::date as today;
grant all on d to public;

-- a booking today (Kofi + Ama), one in the future (Kofi), one far in the past, one cancelled, one finished earlier (Kofi, by name only)
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, flight_date, scheduled_flight_time, status,
                             passengers, total_bags, special_requests, assigned_supervisor_name, contact, porters)
select ref, 'full_arrival', 2, 100, 'arrival', 'walk_in', to_char(d.today + off, 'YYYY-MM-DD'), '10:30', st,
       '[{"name":"Lead Passenger"},{"name":"Second Person"}]'::jsonb, 3, 'Needs a wheelchair', 'Sup One', '0249999999', por::jsonb
from d, (values
  ('PD-TODAY', 0, 'assigned', '[{"porter_id":"00000000-0000-0000-0000-00000000f001","porter_name":"Kofi Mensah","passengers_handled":1,"commission":5},{"porter_id":"00000000-0000-0000-0000-00000000f002","porter_name":"Ama Boateng","passengers_handled":1,"commission":5}]'),
  ('PD-FUTURE', 3, 'confirmed', '[{"porter_id":"00000000-0000-0000-0000-00000000f001","porter_name":"Kofi Mensah","passengers_handled":2,"commission":10}]'),
  ('PD-OLD', -20, 'completed', '[{"porter_id":"00000000-0000-0000-0000-00000000f001","porter_name":"Kofi Mensah","passengers_handled":2,"commission":10}]'),
  ('PD-CANCELLED', 0, 'cancelled', '[{"porter_id":"00000000-0000-0000-0000-00000000f001","porter_name":"Kofi Mensah","passengers_handled":1,"commission":5}]'),
  ('PD-NAMEONLY', -10, 'completed', '[{"porter_name":"kofi mensah","passengers_handled":1,"commission":5}]'),
  ('PD-AMA', 0, 'confirmed', '[{"porter_id":"00000000-0000-0000-0000-00000000f002","porter_name":"Ama Boateng","passengers_handled":2,"commission":10}]')
) as v(ref, off, st, por);
insert into public.porter_payouts (porter_key, porter_name, pay_date, passengers, amount)
select '00000000-0000-0000-0000-00000000f001', 'Kofi Mensah', d.today - 20, 2, 4 from d;

-- a roster with Kofi in shift 2 this month and Ama (by name only) in shift 3
insert into public.shift_rosters (id, kind, month, anchor_date, phases)
select '00000000-0000-0000-0000-00000000e001', 'porter', date_trunc('month', d.today)::date, date_trunc('month', d.today)::date, array[0,1,2,3] from d;
insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000f001', 'Kofi Mensah', 2),
  ('00000000-0000-0000-0000-00000000e001', 'name:ama boateng', 'Ama Boateng', 3);

-- Logins: the table is only for the backend
insert into public.porter_logins (porter_id, phone, password_hash) values ('00000000-0000-0000-0000-00000000f001', '+233241111111', 'pbkdf2-sha256$1000$AA$AA');
select pg_temp.raises('a phone must be in full international form', $$insert into public.porter_logins (porter_id, phone, password_hash) values ('00000000-0000-0000-0000-00000000f002', '0242222222', 'x')$$, '23514');
select pg_temp.raises('two porters cannot share a phone number', $$insert into public.porter_logins (porter_id, phone, password_hash) values ('00000000-0000-0000-0000-00000000f002', '+233241111111', 'x')$$, '23505');
select pg_temp.check_that('a new login must change its password', (select must_change_password from public.porter_logins where porter_id = '00000000-0000-0000-0000-00000000f001'));

-- The website (signed-in or not) can read neither the logins nor the dashboard functions
set local role authenticated;
select pg_temp.raises('signed-in users cannot read logins', $$select * from public.porter_logins$$, '42501');
select pg_temp.raises('signed-in users cannot call the dashboard', $$select public.porter_dashboard('00000000-0000-0000-0000-00000000f001')$$, '42501');
select pg_temp.raises('signed-in users cannot mark done', $$select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-TODAY')$$, '42501');
reset role;
set local role anon;
select pg_temp.raises('anonymous visitors cannot read logins', $$select * from public.porter_logins$$, '42501');
select pg_temp.raises('anonymous visitors cannot call the dashboard', $$select public.porter_dashboard('00000000-0000-0000-0000-00000000f001')$$, '42501');
reset role;

-- The dashboard
set local role service_role;
create temp table kofi as select public.porter_dashboard('00000000-0000-0000-0000-00000000f001') as j;
create temp table ama as select public.porter_dashboard('00000000-0000-0000-0000-00000000f002') as j;
grant all on kofi, ama to public;
reset role;

select pg_temp.check_that('the porter is named', (select j -> 'porter' ->> 'name' from kofi) = 'Kofi Mensah');
select pg_temp.check_that('Kofi sees his job today and the one coming up, nothing cancelled or old',
  (select array_agg(x ->> 'reference' order by x ->> 'reference') from kofi, jsonb_array_elements(j -> 'jobs') x) = array['PD-FUTURE', 'PD-TODAY']);
select pg_temp.check_that('Ama sees only her own two jobs',
  (select array_agg(x ->> 'reference' order by x ->> 'reference') from ama, jsonb_array_elements(j -> 'jobs') x) = array['PD-AMA', 'PD-TODAY']);
select pg_temp.check_that('a job shows only his own pay and passengers, not Ama''s',
  (select (x ->> 'commission')::numeric = 5 and (x ->> 'passengers_handled')::int = 1 from kofi, jsonb_array_elements(j -> 'jobs') x where x ->> 'reference' = 'PD-TODAY'));
select pg_temp.check_that('the lead passenger name, bags and requests are shown',
  (select x ->> 'lead_passenger' = 'Lead Passenger' and (x ->> 'total_bags')::int = 3 and x ->> 'special_requests' = 'Needs a wheelchair' from kofi, jsonb_array_elements(j -> 'jobs') x where x ->> 'reference' = 'PD-TODAY'));
select pg_temp.check_that('no passenger phone or email leaves the database',
  not exists (select 1 from kofi, jsonb_array_elements(j -> 'jobs') x where x::text like '%0249999999%' or x ? 'contact' or x ? 'contact_email' or x ? 'passengers'));
select pg_temp.check_that('his roster shift is returned', (select (j -> 'rosters' -> 0 ->> 'group_no')::int from kofi) = 2);
select pg_temp.check_that('a porter on the roster by name only still finds her shift', (select (j -> 'rosters' -> 0 ->> 'group_no')::int from ama) = 3);
select pg_temp.check_that('earnings count completed jobs only, including older entries recorded by name',
  (select sum((x ->> 'earned')::numeric) from kofi, jsonb_array_elements(j -> 'earnings') x) = 15);
select pg_temp.check_that('what was paid is shown against the day',
  (select sum((x ->> 'paid')::numeric) from kofi, jsonb_array_elements(j -> 'earnings') x) = 4);
select pg_temp.check_that('a porter with nothing completed has no earnings', (select jsonb_array_length(j -> 'earnings') from ama) = 0);
select pg_temp.raises('an unknown porter has no dashboard', $$set local role service_role; select public.porter_dashboard('00000000-0000-0000-0000-0000000000ff')$$, 'P0002');
reset role;

-- Marking a job done
set local role service_role;
create temp table done1 as select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-TODAY') as j;
grant all on done1 to public;
reset role;
select pg_temp.check_that('marking done stamps his entry', (select j ->> 'done_at' is not null and not (j ->> 'already')::boolean from done1));
select pg_temp.check_that('only his entry is stamped; Ama''s is not',
  (select e ->> 'porter_name' || ':' || coalesce(e ->> 'done_at', '') from public.bookings b, jsonb_array_elements(b.porters) e where b.reference = 'PD-TODAY' and e ->> 'porter_name' = 'Ama Boateng') = 'Ama Boateng:');
select pg_temp.check_that('the order and the pay of the entries are untouched',
  (select (b.porters -> 0 ->> 'porter_name') = 'Kofi Mensah' and (b.porters -> 0 ->> 'commission')::numeric = 5 and jsonb_array_length(b.porters) = 2 from public.bookings b where reference = 'PD-TODAY'));
select pg_temp.check_that('the booking itself is not completed by it', (select status from public.bookings where reference = 'PD-TODAY') = 'assigned');
set local role service_role;
create temp table done2 as select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-TODAY') as j;
grant all on done2 to public;
reset role;
select pg_temp.check_that('marking twice changes nothing', (select (j ->> 'already')::boolean and j ->> 'done_at' = (select j ->> 'done_at' from done1) from done2));
set local role service_role;
create temp table kofi2 as select public.porter_dashboard('00000000-0000-0000-0000-00000000f001') as j;
grant all on kofi2 to public;
reset role;
select pg_temp.check_that('the dashboard then shows the job done', (select x ->> 'done_at' is not null from kofi2, jsonb_array_elements(j -> 'jobs') x where x ->> 'reference' = 'PD-TODAY'));

set local role service_role;
select pg_temp.raises('a porter cannot mark someone else''s job', $$select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-AMA')$$, 'P0001');
select pg_temp.raises('an unknown reference is refused', $$select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'NOPE')$$, 'P0001');
select pg_temp.raises('a job cannot be marked done before its day', $$select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-FUTURE')$$, 'P0001');
select pg_temp.raises('a cancelled booking cannot be marked done', $$select public.porter_mark_done('00000000-0000-0000-0000-00000000f001', 'PD-CANCELLED')$$, 'P0001');
reset role;
select pg_temp.check_that('the early and cancelled ones were left alone',
  (select count(*) from public.bookings b, jsonb_array_elements(b.porters) e where b.reference in ('PD-FUTURE', 'PD-CANCELLED') and e ? 'done_at') = 0);

rollback;
