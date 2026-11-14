-- RLS and function tests. Run after the migrations: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Each check raises on failure. Everything runs in a transaction that is rolled back.
begin;

-- Users (the signup trigger creates their profiles). Fixed ids keep the checks readable.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'sup2@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'pax1@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'pax2@example.com');
update public.profiles set role = 'admin'      where email = 'admin@example.com';
update public.profiles set role = 'management' where email = 'manager@example.com';
update public.profiles set role = 'supervisor' where email like 'sup%@example.com';

-- Seed through the service role (bypasses RLS, like the Edge Functions do).
set local role service_role;
insert into public.bookings (id, reference, package_code, num_passengers, total_value, outstanding_balance,
    flight_type, booking_channel, passenger_user_id, assigned_supervisor_id)
values
  ('10000000-0000-0000-0000-000000000001', 'AAG-1', 'full_arrival', 1, 100, 100, 'arrival', 'online',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-000000000002', 'AAG-2', 'full_arrival', 1, 100, 100, 'arrival', 'online',
   '00000000-0000-0000-0000-0000000000d2', null);
insert into public.service_packages (code, name, price) values ('full_arrival', 'Full Arrival', 100);
insert into public.notifications (user_id, title, message) values
  ('00000000-0000-0000-0000-0000000000d1', 'hi', 'one'),
  ('00000000-0000-0000-0000-0000000000d2', 'hi', 'two');

create function pg_temp.as_user(uid text, r text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute format('set local role %I', r);
end $$;

create function pg_temp.expect_count(label text, q text, want int) returns void language plpgsql as $$
declare got int;
begin
  execute 'select count(*) from (' || q || ') x' into got;
  if got <> want then raise exception 'FAIL %: expected % rows, got %', label, want, got; end if;
  raise notice 'ok   %', label;
end $$;

create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FAIL %: statement changed % rows but should be denied', label, n; end if;
    raise notice 'ok   % (0 rows affected)', label;
  exception when insufficient_privilege or check_violation or raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok   % (%)', label, sqlerrm;
  end;
end $$;

-- Signup trigger -------------------------------------------------------------
reset role;
select pg_temp.expect_count('new users default to passenger',
  $q$select 1 from public.profiles where email = 'pax1@example.com' and role = 'passenger'$q$, 1);

-- Passenger 1 ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1', 'authenticated');
select pg_temp.expect_count('passenger sees only own booking', 'select 1 from public.bookings', 1);
select pg_temp.expect_denied('passenger cannot create a booking',
  $q$insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel)
     values ('HACK', 'full_arrival', 1, 0, 'arrival', 'online')$q$);
select pg_temp.expect_denied('passenger cannot discount own booking',
  $q$update public.bookings set total_value = 1 where id = '10000000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_denied('passenger cannot self-promote to admin',
  $q$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1'$q$);
select pg_temp.expect_count('passenger role unchanged',
  $q$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000d1' and role = 'passenger'$q$, 1);
select pg_temp.expect_count('passenger sees only own profile', 'select 1 from public.profiles', 1);
select pg_temp.expect_count('passenger sees own notification only', 'select 1 from public.notifications', 1);
select pg_temp.expect_denied('passenger cannot rewrite notification text',
  $q$update public.notifications set message = 'phish' where user_id = '00000000-0000-0000-0000-0000000000d1'$q$);
update public.notifications set read = true where user_id = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect_count('passenger can mark own notification read',
  $q$select 1 from public.notifications where read$q$, 1);
select pg_temp.expect_denied('passenger cannot read discount codes', 'select * from public.discount_codes');
select pg_temp.expect_denied('passenger cannot call record_payment',
  $q$select public.record_payment('10000000-0000-0000-0000-000000000001', 5, 'cash', 'x', 'x')$q$);

-- Anonymous visitors -----------------------------------------------------------
reset role;
select pg_temp.as_user('', 'anon');
select pg_temp.expect_count('anon can read the package catalogue', 'select 1 from public.service_packages', 1);
select pg_temp.expect_denied('anon cannot read bookings', 'select 1 from public.bookings');

-- Supervisors ------------------------------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
select pg_temp.expect_count('assigned supervisor sees their booking only', 'select 1 from public.bookings', 1);
select pg_temp.expect_denied('supervisor cannot edit booking totals directly',
  $q$update public.bookings set total_value = 1 where id = '10000000-0000-0000-0000-000000000001'$q$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'authenticated');
select pg_temp.expect_count('other supervisor sees no bookings', 'select 1 from public.bookings', 0);

-- Management and admin ---------------------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
select pg_temp.expect_count('management sees all bookings', 'select 1 from public.bookings', 2);
select pg_temp.expect_denied('management cannot edit bookings directly',
  $q$update public.bookings set total_value = 1 where id = '10000000-0000-0000-0000-000000000001'$q$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
select pg_temp.expect_count('admin sees all bookings', 'select 1 from public.bookings', 2);
update public.profiles set role = 'management' where id = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.expect_count('admin can change a role',
  $q$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000d2' and role = 'management'$q$, 1);
update public.profiles set role = 'passenger' where id = '00000000-0000-0000-0000-0000000000d2';

-- record_payment: atomic, no overpayment, ledger row per payment ------------------
reset role;
set local role service_role;
select public.record_payment('10000000-0000-0000-0000-000000000001', 40, 'cash', 'u', 'U');
select pg_temp.expect_count('partial payment recorded',
  $q$select 1 from public.bookings where id = '10000000-0000-0000-0000-000000000001'
     and amount_collected = 40 and outstanding_balance = 60 and payment_status = 'partially_paid'$q$, 1);
do $$ begin
  perform public.record_payment('10000000-0000-0000-0000-000000000001', 70, 'cash', 'u', 'U');
  raise exception 'FAIL overpayment was accepted';
exception when raise_exception then
  if sqlerrm <> 'overpayment' then raise; end if;
  raise notice 'ok   overpayment rejected';
end $$;
select public.record_payment('10000000-0000-0000-0000-000000000001', 60, 'card', 'u', 'U');
select pg_temp.expect_count('fully paid',
  $q$select 1 from public.bookings where id = '10000000-0000-0000-0000-000000000001'
     and amount_collected = 100 and outstanding_balance = 0 and payment_status = 'paid'$q$, 1);
select pg_temp.expect_count('two ledger rows', 'select 1 from public.payments', 2);
do $$ begin
  perform public.record_payment('10000000-0000-0000-0000-000000000001', 0.01, 'cash', 'u', 'U');
  raise exception 'FAIL payment on a settled booking was accepted';
exception when raise_exception then
  if sqlerrm <> 'overpayment' then raise; end if;
  raise notice 'ok   payment on settled booking rejected';
end $$;

-- discount claim is capped by max_uses --------------------------------------------
insert into public.discount_codes (code, recipient_type, recipient_name, discount_type, discount_value,
                                   start_date, expiry_date, max_uses)
values ('SAVE10', 'individual', 'T', 'fixed', 10, '2026-01-01', '2030-01-01', 1);
select pg_temp.expect_count('first claim succeeds',
  $q$select 1 from public.claim_discount('SAVE10', 10, 'tok1') where code is not null$q$, 1);
select pg_temp.expect_count('second claim is refused (max_uses = 1)',
  $q$select 1 from public.claim_discount('SAVE10', 10, 'tok2') where code is not null$q$, 0);
select public.release_discount('SAVE10', 10);
select pg_temp.expect_count('release frees the code',
  $q$select 1 from public.discount_codes where code = 'SAVE10' and redemption_count = 0 and total_discount_granted = 0$q$, 1);

-- email duplicate guard -------------------------------------------------------------
insert into public.email_deliveries (event_key, template_name, status) values ('e1', 'T', 'queued');
do $$ begin
  insert into public.email_deliveries (event_key, template_name, status) values ('e1', 'T', 'queued');
  raise exception 'FAIL duplicate email claim allowed';
exception when unique_violation then raise notice 'ok   duplicate email claim rejected'; end $$;
insert into public.email_deliveries (event_key, template_name, status) values ('e2', 'T', 'failed');
insert into public.email_deliveries (event_key, template_name, status) values ('e2', 'T', 'queued');
select pg_temp.expect_count('failed attempt can be retried', $q$select 1 from public.email_deliveries where event_key='e2'$q$, 2);

-- staff invite applied at signup --------------------------------------------------------
insert into public.staff_role_assignments (email, role) values ('invited@example.com', 'supervisor');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'Invited@Example.com');
select pg_temp.expect_count('invite applied case-insensitively',
  $q$select 1 from public.profiles where lower(email) = 'invited@example.com' and role = 'supervisor'$q$, 1);
select pg_temp.expect_count('invite consumed', $q$select 1 from public.staff_role_assignments$q$, 0);

rollback;
