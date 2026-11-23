-- Paystack online payments: recorded once, never twice, never wrongly; the books and the commission follow. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'acc-ps@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'sup-ps@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'adm-ps@example.com');
update public.profiles set role = 'accounts', full_name = 'Akos Accountant' where email = 'acc-ps@example.com';
update public.profiles set role = 'supervisor', full_name = 'Sena Supervisor' where email = 'sup-ps@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-ps@example.com';

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

create temp table calls (k text primary key, j jsonb);
grant all on calls to public;

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false)
on conflict (code) do nothing;

insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, passengers, contact)
values ('PS-1', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online', to_char(current_date, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Esi Owusu"}]', '0243333333'),
       ('PS-2', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online', to_char(current_date, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Kojo Boateng"}]', '0244444444'),
       ('PS-3', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online', to_char(current_date, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Yaa Asante"}]', '0245555555');
insert into public.payment_attempts (booking_id, booking_reference, reference, amount, currency, email) values
  ((select id from public.bookings where reference = 'PS-1'), 'PS-1', 'aag-ps1-a', 700, 'GHS', 'esi@example.com'),
  ((select id from public.bookings where reference = 'PS-2'), 'PS-2', 'aag-ps2-a', 700, 'GHS', 'kojo@example.com'),
  ((select id from public.bookings where reference = 'PS-3'), 'PS-3', 'aag-ps3-a', 700, 'GHS', 'yaa@example.com');

-- ---- a payment arrives -------------------------------------------------------------------------------
insert into calls select 'card', public.record_online_payment('aag-ps1-a', 700, 'GHS', 'card', 10.50, '111', now());
select pg_temp.check_that('a card payment is recorded and the booking is paid',
  (select j ->> 'status' = 'recorded' from calls where k = 'card')
  and (select payment_status = 'paid' and amount_collected = 700 and outstanding_balance = 0 from public.bookings where reference = 'PS-1'));
select pg_temp.check_that('the payment row says it came from Paystack, with the fee',
  (select provider = 'paystack' and provider_reference = 'aag-ps1-a' and provider_fee = 10.50 and method = 'card' and recorded_by_name = 'Paystack (online)'
   from public.payments where booking_reference = 'PS-1'));
select pg_temp.check_that('the attempt is marked successful',
  (select status = 'success' and channel = 'card' and fees = 10.50 and paystack_id = '111' from public.payment_attempts where reference = 'aag-ps1-a'));
insert into calls select 'again', public.record_online_payment('aag-ps1-a', 700, 'GHS', 'card', 10.50, '111', now());
select pg_temp.check_that('the same payment told twice is recorded once',
  (select j ->> 'status' = 'duplicate' from calls where k = 'again')
  and (select count(*) = 1 from public.payments where booking_reference = 'PS-1')
  and (select amount_collected = 700 from public.bookings where reference = 'PS-1'));
insert into calls select 'unknown', public.record_online_payment('not-ours', 5, 'GHS', 'card', 0, '1', now());
select pg_temp.check_that('an unknown reference is ignored', (select j ->> 'status' = 'unknown_reference' from calls where k = 'unknown'));
insert into calls select 'momo', public.record_online_payment('aag-ps2-a', 700, 'GHS', 'mobile_money', 7, '222', now());
select pg_temp.check_that('mobile money is recorded as mobile money',
  (select j ->> 'status' = 'recorded' from calls where k = 'momo')
  and (select method = 'mobile_money' from public.payments where booking_reference = 'PS-2'));

-- ---- a payment that should not be recorded -----------------------------------------------------------
insert into public.payment_attempts (booking_id, booking_reference, reference, amount, currency)
values ((select id from public.bookings where reference = 'PS-3'), 'PS-3', 'aag-ps3-b', 700, 'GHS');
insert into calls select 'amt', public.record_online_payment('aag-ps3-b', 500, 'GHS', 'card', 0, '333', now());
select pg_temp.check_that('a different amount is kept for review, not recorded',
  (select j ->> 'reason' = 'amount_mismatch' from calls where k = 'amt')
  and (select status = 'needs_review' from public.payment_attempts where reference = 'aag-ps3-b')
  and (select amount_collected = 0 from public.bookings where reference = 'PS-3'));
insert into calls select 'cur', public.record_online_payment('aag-ps3-a', 700, 'USD', 'card', 0, '334', now());
select pg_temp.check_that('a different currency is kept for review', (select j ->> 'reason' = 'amount_mismatch' from calls where k = 'cur'));
-- the booking was paid at the airport while the passenger was on the payment page
update public.bookings set amount_collected = 700, outstanding_balance = 0, payment_status = 'paid' where reference = 'PS-3';
insert into public.payment_attempts (booking_id, booking_reference, reference, amount, currency)
values ((select id from public.bookings where reference = 'PS-3'), 'PS-3', 'aag-ps3-c', 700, 'GHS');
insert into calls select 'twice', public.record_online_payment('aag-ps3-c', 700, 'GHS', 'card', 0, '335', now());
select pg_temp.check_that('paid twice: the second payment is kept for review, nothing is overpaid',
  (select j ->> 'reason' = 'overpayment' from calls where k = 'twice')
  and (select amount_collected = 700 from public.bookings where reference = 'PS-3')
  and not exists (select 1 from public.payments where provider_reference = 'aag-ps3-c'));
update public.bookings set status = 'cancelled' where reference = 'PS-3';
insert into public.payment_attempts (booking_id, booking_reference, reference, amount, currency)
values ((select id from public.bookings where reference = 'PS-3'), 'PS-3', 'aag-ps3-d', 700, 'GHS');
insert into calls select 'closed', public.record_online_payment('aag-ps3-d', 700, 'GHS', 'card', 0, '336', now());
select pg_temp.check_that('a cancelled booking keeps the payment for review', (select j ->> 'reason' = 'booking_closed' from calls where k = 'closed'));
insert into public.payment_attempts (booking_id, booking_reference, reference, amount, currency)
values ((select id from public.bookings where reference = 'PS-3'), 'PS-3', 'aag-ps3-e', 700, 'GHS');
select public.fail_payment_attempt('aag-ps1-a');
select public.fail_payment_attempt('aag-ps3-a');
select public.fail_payment_attempt('aag-ps3-e');
select pg_temp.check_that('a payment that failed is marked failed, and only while pending',
  (select status = 'failed' from public.payment_attempts where reference = 'aag-ps3-e')
  and (select status = 'needs_review' from public.payment_attempts where reference = 'aag-ps3-a')
  and (select status = 'success' from public.payment_attempts where reference = 'aag-ps1-a'));

-- ---- staff payments are unchanged -----------------------------------------------------------------------
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, passengers, contact)
values ('PS-4', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online', to_char(current_date, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Ato Quaye"}]', '0246666666');
select public.record_payment((select id from public.bookings where reference = 'PS-4'), 200, 'cash', 'c2', 'Sena');
select pg_temp.check_that('a payment taken by staff is as before, with no provider',
  (select provider is null and provider_fee = 0 and method = 'cash' from public.payments where booking_reference = 'PS-4'));
select pg_temp.raises('an overpayment by staff is still refused',
  $q$select public.record_payment((select id from public.bookings where reference = 'PS-4'), 600, 'cash', 'c2', 'Sena')$q$, 'overpayment');

-- ---- the supervisor's commission when the payment came first -------------------------------------------------------
select pg_temp.check_that('an online payment with no supervisor yet earns no commission',
  (select supervisor_commission = 0 from public.bookings where reference = 'PS-1'));
update public.bookings set assigned_supervisor_id = '00000000-0000-0000-0000-0000000000c2', assigned_supervisor_name = 'Sena Supervisor' where reference = 'PS-1';
select pg_temp.check_that('assigning a supervisor afterwards gives them the commission',
  (select supervisor_commission = 50 and supervisor_commission_by = '00000000-0000-0000-0000-0000000000c2' from public.bookings where reference = 'PS-1'));
update public.bookings set assigned_supervisor_id = '00000000-0000-0000-0000-0000000000c3' where reference = 'PS-1';
select pg_temp.check_that('reassigning does not add it twice',
  (select supervisor_commission = 50 and supervisor_commission_by = '00000000-0000-0000-0000-0000000000c2' from public.bookings where reference = 'PS-1'));
update public.bookings set assigned_supervisor_id = '00000000-0000-0000-0000-0000000000c2' where reference = 'PS-4';
select pg_temp.check_that('a booking paid by staff keeps the old rule: no commission added on assignment',
  (select supervisor_commission = 0 from public.bookings where reference = 'PS-4'));

-- ---- the books -------------------------------------------------------------------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check_that('online payments sit in the settlement account, even mobile money',
  (select sum(debit) = 1400 from public.gl_journal(current_date, current_date) where source = 'payment' and account_code = '1020' and reference in ('PS-1', 'PS-2')));
select pg_temp.check_that('the gateway fee is an expense taken off the settlement',
  (select sum(debit) = 17.50 from public.gl_journal(current_date, current_date) where source = 'gateway_fee' and account_code = '6095')
  and (select sum(credit) = 17.50 from public.gl_journal(current_date, current_date) where source = 'gateway_fee' and account_code = '1020'));
select pg_temp.check_that('cash paid by staff still goes to cash', (select sum(debit) = 200 from public.gl_journal(current_date, current_date) where source = 'payment' and account_code = '1000'));
select pg_temp.check_that('the books still balance',
  (select sum(debit) = sum(credit) from public.gl_journal(current_date, current_date)));
select pg_temp.check_that('the settlement account holds what the gateway owes, net of fees',
  (select closing = 1400 - 17.50 from public.gl_trial_balance(current_date, current_date) where code = '1020'));

-- ---- who can see attempts ------------------------------------------------------------------------------------------------
select pg_temp.check_that('the accountant sees the attempts', (select count(*) >= 4 from public.payment_attempts));
select pg_temp.raises('a reason is needed to mark a payment as dealt with', $q$select public.resolve_payment_attempt('aag-ps3-c', '')$q$, 'note_required');
select pg_temp.raises('only a payment that needs a look can be marked', $q$select public.resolve_payment_attempt('aag-ps1-a', 'Refunded in Paystack')$q$, 'not_found');
select public.resolve_payment_attempt('aag-ps3-c', 'Refunded in the Paystack dashboard');
select pg_temp.check_that('the payment is marked as dealt with, with who and why',
  (select status = 'resolved' and resolved_by_name = 'Akos Accountant' and resolution_note = 'Refunded in the Paystack dashboard' and resolved_at is not null
   from public.payment_attempts where reference = 'aag-ps3-c'));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check_that('a supervisor sees no attempts', (select count(*) = 0 from public.payment_attempts));
select pg_temp.raises('a supervisor cannot mark a payment as dealt with', $q$select public.resolve_payment_attempt('aag-ps3-b', 'Nope nope')$q$, 'forbidden');
select pg_temp.raises('nobody writes attempts from the website', $q$update public.payment_attempts set status = 'success'$q$, '42501');
select pg_temp.raises('a supervisor cannot record an online payment', $q$select public.record_online_payment('aag-ps1-a', 1, 'GHS', 'card', 0, '1', now())$q$, '42501');
reset role;

rollback;
