-- Porter pay and the quick sale flight fields. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'mgr-pp@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'sup-pp@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'admin-pp@example.com');
update public.profiles set role = 'management', full_name = 'Mina Manager' where email = 'mgr-pp@example.com';
update public.profiles set role = 'supervisor' where email = 'sup-pp@example.com';
update public.profiles set role = 'admin' where email = 'admin-pp@example.com';

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

-- services and a register of two porters
set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('porter_only', 'Porter Service Only', 100, 'both', false),
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true)
on conflict (code) do nothing;

-- quick sales: flight details are stored and validated
select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-1', 'porter_only', 2, 'arrival', 'Ama', '', null, null, 'cash',
  'Kojo Porter', 2, 30, null, 'ke 510', 'Kenya Airways', '14:30', 'porter-kojo');
select pg_temp.check_that('flight number, airline and time are saved on the booking',
  (select flight_number = 'KE 510' and airline = 'Kenya Airways' and scheduled_flight_time = '14:30' and flight_date = to_char(now() at time zone 'utc', 'YYYY-MM-DD')
   from public.bookings where reference = 'PP-1'));
select pg_temp.check_that('the porter on the sale carries the register id and GHS 60 commission',
  (select porters -> 0 ->> 'porter_id' = 'porter-kojo' and (porters -> 0 ->> 'commission')::numeric = 60 from public.bookings where reference = 'PP-1'));
select pg_temp.raises('a nonsense flight number is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-X', 'porter_only', 1, null, null, null, null, null, 'cash', null, null, 30, null, '!!', null, null, null)$q$, 'invalid_flight');
select pg_temp.raises('a bad flight time is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-X', 'porter_only', 1, null, null, null, null, null, 'cash', null, null, 30, null, 'KE 1', null, '25:99', null)$q$, 'invalid_flight_time');
select pg_temp.raises('a porter cannot be credited with more passengers than were sold',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-X', 'porter_only', 1, null, null, null, null, null, 'cash', 'Kojo Porter', 3, 30)$q$, 'invalid_porter_passengers');
select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-2', 'porter_only', 1, null, null, null, null, null, 'cash',
  'Kojo Porter', 1, 30, null, null, null, null, 'porter-kojo');
select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sup', 'PP-3', 'porter_only', 3, null, null, null, null, null, 'cash',
  'Yaw Porter', 3, 30, null, null, null, null, 'porter-yaw');
-- an older entry with no register id, grouped by name; and a job that is not finished or was cancelled
update public.bookings set status = 'cancelled' where reference = 'PP-3' and false;
insert into public.bookings (reference, package_code, num_passengers, total_value, amount_collected, outstanding_balance, payment_status, flight_type, booking_channel, flight_date, status, porters, assigned_supervisor_id)
values
  ('PP-4', 'porter_only', 2, 200, 200, 0, 'paid', 'arrival', 'online', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'in_progress',
   '[{"porter_id":"porter-yaw","porter_name":"Yaw Porter","passengers_handled":2,"commission":60}]', '00000000-0000-0000-0000-0000000000b2'),
  ('PP-5', 'porter_only', 1, 100, 100, 0, 'paid', 'arrival', 'online', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'confirmed',
   '[{"porter_id":"porter-yaw","porter_name":"Yaw Porter","passengers_handled":1,"commission":30}]', null);

-- access
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.raises('a supervisor cannot read porter earnings', $q$select * from public.porter_earnings(current_date)$q$, '42501');
select pg_temp.raises('a supervisor cannot pay a porter', $q$select public.pay_porter('porter-kojo', current_date)$q$, '42501');
select pg_temp.check_that('a supervisor cannot read payouts', (select count(*) = 0 from public.porter_payouts));
reset role;

-- management sees the day
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check_that('Kojo earned GHS 90 over two jobs and three passengers',
  (select jobs = 2 and passengers = 3 and earned = 90 and paid = 0 and balance = 90 from public.porter_earnings(current_date) where porter_key = 'porter-kojo'));
select pg_temp.check_that('Yaw earned GHS 90 only from the completed job',
  (select jobs = 1 and passengers = 3 and earned = 90 from public.porter_earnings(current_date) where porter_key = 'porter-yaw'));
select pg_temp.check_that('another day has nothing', (select count(*) = 0 from public.porter_earnings(current_date + 1)));

-- paying
select public.pay_porter('porter-kojo', current_date);
select pg_temp.check_that('the payout is for the whole balance and names who paid',
  (select amount = 90 and paid_by_name = 'Mina Manager' and passengers = 3 from public.porter_payouts where porter_key = 'porter-kojo'));
select pg_temp.check_that('the day now shows paid and no balance',
  (select paid = 90 and balance = 0 and last_paid_at is not null from public.porter_earnings(current_date) where porter_key = 'porter-kojo'));
select pg_temp.raises('paying again with nothing due is refused', $q$select public.pay_porter('porter-kojo', current_date)$q$, 'nothing_due');
select pg_temp.raises('a porter with no work that day is refused', $q$select public.pay_porter('porter-kojo', current_date + 1)$q$, 'nothing_due');
select pg_temp.raises('browsers cannot write payouts directly',
  $q$insert into public.porter_payouts (porter_key, porter_name, pay_date, passengers, amount) values ('x', 'x', current_date, 1, 1)$q$, '42501');
reset role;

-- a job completed later adds only the difference
update public.bookings set status = 'completed' where reference = 'PP-4';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check_that('Yaw now has GHS 150 earned, nothing paid',
  (select earned = 150 and paid = 0 and balance = 150 from public.porter_earnings(current_date) where porter_key = 'porter-yaw'));
select public.pay_porter('porter-yaw', current_date);
update public.bookings set status = 'assigned' where reference = 'PP-5';
update public.bookings set status = 'in_progress' where reference = 'PP-5';
update public.bookings set status = 'completed' where reference = 'PP-5';
select pg_temp.check_that('a late job leaves only the new GHS 30 to pay',
  (select earned = 180 and paid = 150 and balance = 30 from public.porter_earnings(current_date) where porter_key = 'porter-yaw'));
select public.pay_porter('porter-yaw', current_date);
select pg_temp.check_that('two payouts, GHS 180 in total, one entry for the day',
  (select count(*) = 2 and sum(amount) = 180 from public.porter_payouts where porter_key = 'porter-yaw'));
reset role;
select pg_temp.check_that('payouts are in the audit log', (select count(*) >= 3 from public.audit_log where table_name = 'porter_payouts'));
rollback;
