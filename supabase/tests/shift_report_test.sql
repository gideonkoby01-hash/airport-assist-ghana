-- Quick sales and system-built shift reports. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'sup2@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'sup3@example.com'),
  ('00000000-0000-0000-0000-0000000000c4', 'sup4@example.com');
update public.profiles set role = 'supervisor' where email like 'sup%@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm like expected || '%' or sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error: % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true),
  ('full_departure', 'Full Departure Assist', 850, 'departure', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false)
on conflict (code) do nothing;

-- ---- quick sales ----------------------------------------------------------------------------------
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-1', 'full_arrival', 2, null, 'Kofi', '+233200000001', null, null, 'cash', 'Kojo', 2, 30);
select pg_temp.check_that('a quick sale is a completed, fully paid booking owned by the supervisor',
  (select status = 'completed' and payment_status = 'paid' and total_value = 1400 and amount_collected = 1400 and outstanding_balance = 0
          and is_quick_sale and assigned_supervisor_id = '00000000-0000-0000-0000-0000000000c1' and booking_channel = 'walk_in'
   from public.bookings where reference = 'QS-1'));
select pg_temp.check_that('...with a ledger row', (select count(*) = 1 and bool_and(amount = 1400 and entry_type = 'payment') from public.payments where booking_reference = 'QS-1'));

select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-2', 'full_departure', 1, null, null, null, 800, 'Regular customer', 'mobile_money', 'Kojo', 1, 30);
select pg_temp.check_that('a lower desk price keeps the original and records the reason',
  (select total_value = 800 and original_total = 850 and discount_amount = 50 and status_reason = 'Desk price adjustment: Regular customer' from public.bookings where reference = 'QS-2'));
select pg_temp.raises('a price above the package price is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-X', 'full_departure', 1, null, null, null, 900, 'x', 'cash', null, null, 30)$q$, 'invalid_amount');
select pg_temp.raises('a lower price needs a reason',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-X', 'full_departure', 1, null, null, null, 800, '', 'cash', null, null, 30)$q$, 'reason_required');
select pg_temp.raises('an unknown package is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-X', 'nope', 1, null, null, null, null, null, 'cash', null, null, 30)$q$, 'package_unavailable');

select public.create_quick_sale('00000000-0000-0000-0000-0000000000c1', 'Ama', 'QS-3', 'porter_only', 3, 'departure', null, null, null, null, 'cash', 'Yaw', 3, 30);
select pg_temp.check_that('a porter sale carries the porter and server-side commission',
  (select porters -> 0 ->> 'porter_name' = 'Yaw' and (porters -> 0 ->> 'commission')::numeric = 90 and flight_type = 'departure' from public.bookings where reference = 'QS-3'));

-- the same submission twice makes one sale
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c2', 'Kojo', 'QS-D1', 'porter_only', 1, null, null, null, null, null, 'cash', null, null, 30, 'same-key-123');
select pg_temp.raises('a repeated submission is refused by the database',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c2', 'Kojo', 'QS-D2', 'porter_only', 1, null, null, null, null, null, 'cash', null, null, 30, 'same-key-123')$q$, '23505');
delete from public.payments where booking_reference = 'QS-D1';
delete from public.bookings where reference = 'QS-D1';

-- another supervisor's sale must not appear in this one's report
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c2', 'Kojo', 'QS-4', 'full_arrival', 1, null, null, null, null, null, 'card', null, null, 30);
-- a refund by management is not part of the supervisor's takings
select public.record_adjustment((select id from public.bookings where reference = 'QS-1'), 'refund', 100, 'cash', 'Short service', 'm1', 'Mgr');

-- ---- the report ------------------------------------------------------------------------------------
-- The fixtures were just created, so the shift that contains "now" is the one to report on.
create temp table cur as
  select case when extract(hour from now() at time zone 'utc') < 6 then current_date - 1 else current_date end as period,
         case when extract(hour from now() at time zone 'utc') between 6 and 17 then 'morning' else 'night' end as shift;
grant select on cur to service_role, authenticated;

select pg_temp.check_that('the report is built from the ledger',
  (select (b ->> 'grand_total_paid')::numeric = 2500        -- 1400 + 800 + 3 x 100 porter
      and (b ->> 'meet_assist_total_paid')::numeric = 2200
      and (b ->> 'porter_amount_paid')::numeric = 300 and (b ->> 'porter_total_bookings')::int = 1
      and (b ->> 'cash_expected')::numeric = 1700           -- 1400 + 300 cash; the 800 was mobile money
      and (b ->> 'booking_count')::int = 3 and (b ->> 'total_passengers')::int = 6
      and (b ->> 'completed')::int = 3
      and (b ->> 'porter_payment_method') = 'cash'
      and b -> 'meet_assist_entries' @> '[{"service_type":"arrival","amount_paid":1400,"payment_method":"cash"}]'
      and b -> 'meet_assist_entries' @> '[{"service_type":"full_departure","amount_paid":800,"payment_method":"momo"}]'
      and b -> 'porter_entries' @> '[{"porter_name":"Yaw","passengers_handled":3,"commission":90}]'
      and (b ->> 'porter_total_commission')::numeric = 180      -- Yaw 3 + Kojo 3 passengers at GHS 30
      and (b ->> 'net_after_commission')::numeric = 2320        -- 2500 sales less GHS 180 commission
      and (b ->> 'porters_missing')::int = 0
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000c1', (select period from cur), (select shift from cur)) as b) x));
select pg_temp.check_that('the other supervisor''s sale and the manager''s refund are not in it',
  (select jsonb_array_length(b -> 'meet_assist_entries') = 2
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000c1', (select period from cur), (select shift from cur)) as b) x));
select pg_temp.check_that('the other supervisor has their own report',
  (select (b ->> 'grand_total_paid')::numeric = 700
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000c2', (select period from cur), (select shift from cur)) as b) x));

-- shift boundaries (a supervisor with no other sales, so the numbers do not depend on the clock)
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c3', 'Esi', 'QS-5', 'full_arrival', 1, null, null, null, null, null, 'cash', null, null, 30);
update public.payments set created_date = (current_date + time '05:00') at time zone 'UTC' where booking_reference = 'QS-5';
select pg_temp.check_that('a 05:00 payment is in the night shift that began the evening before',
  (select (public.build_shift_report('00000000-0000-0000-0000-0000000000c3', current_date - 1, 'night') ->> 'grand_total_paid')::numeric = 700));
select pg_temp.check_that('...and not in that day''s morning shift',
  (select (public.build_shift_report('00000000-0000-0000-0000-0000000000c3', current_date, 'morning') ->> 'grand_total_paid')::numeric = 0));
update public.payments set created_date = (current_date + time '06:00') at time zone 'UTC' where booking_reference = 'QS-5';
select pg_temp.check_that('06:00 starts the morning shift',
  (select (public.build_shift_report('00000000-0000-0000-0000-0000000000c3', current_date, 'morning') ->> 'grand_total_paid')::numeric = 700));
update public.payments set created_date = (current_date + time '18:00') at time zone 'UTC' where booking_reference = 'QS-5';
select pg_temp.check_that('18:00 starts the night shift',
  (select (public.build_shift_report('00000000-0000-0000-0000-0000000000c3', current_date, 'night') ->> 'grand_total_paid')::numeric = 700
      and (public.build_shift_report('00000000-0000-0000-0000-0000000000c3', current_date, 'morning') ->> 'grand_total_paid')::numeric = 0));
select pg_temp.check_that('shift windows are what the settings say',
  (select start_ts = (current_date - 2 + time '18:00') at time zone 'UTC' and end_ts = (current_date - 1 + time '06:00') at time zone 'UTC'
   from public.shift_window(current_date - 2, 'night')));

select public.create_shift_report('00000000-0000-0000-0000-0000000000c1', 'Ama', (select period from cur), (select shift from cur), 1690, 'Short GHS 10 in the till');
select pg_temp.check_that('the report is stored with the variance worked out by the system',
  (select system_generated and grand_total_paid = 2500 and cash_expected = 1700 and cash_counted = 1690 and cash_variance = -10
          and remarks = 'Short GHS 10 in the till' and supervisor_name = 'Ama' from public.shift_reports where supervisor_id = '00000000-0000-0000-0000-0000000000c1'));
select pg_temp.check_that('the filed report keeps sales less commission',
  (select net_after_commission = 2320 from public.shift_reports where supervisor_id = '00000000-0000-0000-0000-0000000000c1'));
select pg_temp.raises('the same shift cannot be filed twice',
  $q$select public.create_shift_report('00000000-0000-0000-0000-0000000000c1', 'Ama', (select period from cur), (select shift from cur), 1500, '')$q$, 'duplicate_report');
select pg_temp.raises('the cash count is required',
  $q$select public.create_shift_report('00000000-0000-0000-0000-0000000000c2', 'Kojo', current_date - 1, 'morning', null, '')$q$, 'cash_count_required');
select pg_temp.raises('a future shift cannot be filed',
  $q$select public.create_shift_report('00000000-0000-0000-0000-0000000000c2', 'Kojo', current_date + 1, 'morning', 0, '')$q$, 'future_period');
-- every service sold at the desk must have a porter on it before the shift can be closed
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c4', 'Efua', 'QS-6', 'full_arrival', 2, null, null, null, null, null, 'cash', null, null, 30);
select pg_temp.check_that('a sale with no porter is counted as missing, whatever the service',
  (select (b ->> 'porters_missing')::int = 1 and (b ->> 'porters_missing_refs') = '["QS-6"]' and (b ->> 'net_after_commission')::numeric = 1400
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000c4', (select period from cur), (select shift from cur)) as b) x));
select pg_temp.raises('the shift cannot be filed while a service has no porter',
  $q$select public.create_shift_report('00000000-0000-0000-0000-0000000000c4', 'Efua', (select period from cur), (select shift from cur), 1400, '')$q$, 'porter_missing');
update public.bookings set porters = '[{"porter_name":"Yaw","passengers_handled":2,"commission":60}]'::jsonb where reference = 'QS-6';
select pg_temp.check_that('once a porter is assigned the shift closes with the commission taken off',
  (select net_after_commission = 1340 and total_commission = 60 and grand_total_paid = 1400
   from public.create_shift_report('00000000-0000-0000-0000-0000000000c4', 'Efua', (select period from cur), (select shift from cur), 1400, '')));
select pg_temp.check_that('a shift with no sales can still be filed as a nil return',
  (select grand_total_paid = 0 from public.create_shift_report('00000000-0000-0000-0000-0000000000c2', 'Kojo', current_date - 5, 'morning', 0, 'Quiet')));

-- ---- locked from the browser ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select pg_temp.raises('a supervisor cannot file a report directly',
  $q$insert into public.shift_reports (supervisor_id, shift_type, reporting_period_start, created_by_id)
     values ('00000000-0000-0000-0000-0000000000c1', 'morning', '2026-01-01', '00000000-0000-0000-0000-0000000000c1')$q$, '42501');
do $$
declare n int;
begin
  update public.shift_reports set grand_total_paid = 1 where supervisor_id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FAIL a supervisor edited a submitted report'; end if;
  raise notice 'ok   a submitted report cannot be edited (0 rows)';
end $$;
select pg_temp.check_that('a supervisor can still read their own report', (select count(*) = 1 from public.shift_reports));
rollback;
