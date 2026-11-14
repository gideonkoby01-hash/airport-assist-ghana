-- Lifecycle, money adjustments, audit log, two-step verification, disabled accounts, last-admin guard,
-- rate limits, file ownership, anonymisation. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'pax1@example.com');
update public.profiles set role = 'admin' where email like 'admin%@example.com';
update public.profiles set role = 'management' where email = 'manager@example.com';
update public.profiles set role = 'supervisor' where email = 'sup1@example.com';

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
create function pg_temp.as_user(uid text, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', aal)::text, true);
  set local role authenticated;
end $$;

-- fixtures (service role)
set local role service_role;
insert into public.discount_codes (id, code, recipient_type, recipient_name, discount_type, discount_value, start_date, expiry_date, max_uses, redemption_count, total_discount_granted)
values ('20000000-0000-0000-0000-000000000001', 'D1', 'individual', 'T', 'fixed', 10, '2026-01-01', '2030-01-01', 5, 1, 10);
insert into public.bookings (id, reference, package_code, num_passengers, total_value, outstanding_balance, flight_type, booking_channel,
    passenger_user_id, assigned_supervisor_id, status, discount_code_id, discount_amount, original_total)
values
  ('10000000-0000-0000-0000-000000000001', 'G-1', 'full_arrival', 1, 100, 100, 'arrival', 'online', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'confirmed', null, 0, 100),
  ('10000000-0000-0000-0000-000000000002', 'G-2', 'full_arrival', 1, 90, 90, 'arrival', 'online', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'assigned', '20000000-0000-0000-0000-000000000001', 10, 100);
insert into public.discount_redemptions (discount_code_id, code, booking_id, discount_amount, gross_total, net_total)
values ('20000000-0000-0000-0000-000000000001', 'D1', '10000000-0000-0000-0000-000000000002', 10, 100, 90);

-- ---- lifecycle -------------------------------------------------------------------------------
select pg_temp.raises('confirmed cannot jump to completed',
  $q$update public.bookings set status = 'completed' where reference = 'G-1'$q$, 'invalid_status_transition');
update public.bookings set status = 'assigned' where reference = 'G-1';
update public.bookings set status = 'in_progress' where reference = 'G-1';
select pg_temp.raises('cannot complete with money owing',
  $q$update public.bookings set status = 'completed' where reference = 'G-1'$q$, 'balance_outstanding');
select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash', 'c1', 'Sup');
update public.bookings set status = 'completed' where reference = 'G-1';
select pg_temp.raises('completed is terminal', $q$update public.bookings set status = 'in_progress' where reference = 'G-1'$q$, 'invalid_status_transition');
select pg_temp.raises('completed cannot be cancelled', $q$update public.bookings set status = 'cancelled' where reference = 'G-1'$q$, 'invalid_status_transition');

-- cancelling frees the discount once and zeroes what is owed
update public.bookings set status = 'cancelled' where reference = 'G-2';
select pg_temp.check_that('cancel releases the discount',
  (select redemption_count = 0 and total_discount_granted = 0 from public.discount_codes where code = 'D1'));
select pg_temp.check_that('cancel owes nothing', (select outstanding_balance = 0 from public.bookings where reference = 'G-2'));
select pg_temp.check_that('redemption marked released', (select released_at is not null from public.discount_redemptions where booking_id = '10000000-0000-0000-0000-000000000002'));
select pg_temp.raises('no payment on a cancelled booking',
  $q$select public.record_payment('10000000-0000-0000-0000-000000000002', 5, 'cash', 'c1', 'Sup')$q$, 'booking_closed');
select pg_temp.raises('cancelled is terminal', $q$update public.bookings set status = 'assigned' where reference = 'G-2'$q$, 'invalid_status_transition');

-- admin correction needs a reason and is recorded
select pg_temp.raises('correction needs a reason',
  $q$select public.admin_set_booking_status('10000000-0000-0000-0000-000000000001', 'in_progress', ' ', 'a1')$q$, 'reason_required');
select public.admin_set_booking_status('10000000-0000-0000-0000-000000000001', 'in_progress', 'Marked complete by mistake', 'a1');
select pg_temp.check_that('correction applied with reason',
  (select status = 'in_progress' and status_reason = 'Marked complete by mistake' from public.bookings where reference = 'G-1'));
select pg_temp.raises('the override does not stay on',
  $q$update public.bookings set status = 'no_show' where reference = 'G-2'$q$, 'invalid_status_transition');

-- ---- refunds and write-offs ------------------------------------------------------------------
select public.record_adjustment('10000000-0000-0000-0000-000000000001', 'refund', 30, 'cash', 'Service shortened', 'm1', 'Mgr');
select pg_temp.check_that('refund lowers collected and reopens the balance',
  (select amount_collected = 70 and outstanding_balance = 30 and payment_status = 'partially_paid' from public.bookings where reference = 'G-1'));
select pg_temp.raises('refund needs a reason',
  $q$select public.record_adjustment('10000000-0000-0000-0000-000000000001', 'refund', 1, 'cash', '', 'm1', 'Mgr')$q$, 'reason_required');
select pg_temp.raises('cannot refund more than was collected',
  $q$select public.record_adjustment('10000000-0000-0000-0000-000000000001', 'refund', 500, 'cash', 'too much', 'm1', 'Mgr')$q$, 'adjustment_too_large');
select public.record_adjustment('10000000-0000-0000-0000-000000000001', 'write_off', 30, null, 'Passenger left without paying', 'm1', 'Mgr');
select pg_temp.check_that('write-off settles the balance without collecting money',
  (select written_off = 30 and outstanding_balance = 0 and amount_collected = 70 and payment_status = 'paid' from public.bookings where reference = 'G-1'));
select pg_temp.raises('cannot write off more than is owed',
  $q$select public.record_adjustment('10000000-0000-0000-0000-000000000001', 'write_off', 5, null, 'nothing owed', 'm1', 'Mgr')$q$, 'adjustment_too_large');
select pg_temp.check_that('ledger and bookings agree',
  (select bool_and(problem_count = 0) from public.data_integrity_check()));

-- ---- audit log -------------------------------------------------------------------------------
select pg_temp.check_that('status correction was logged with its actor',
  exists (select 1 from public.audit_log where table_name = 'bookings' and action = 'UPDATE' and actor_id = 'a1'
          and after ->> 'status_reason' = 'Marked complete by mistake'));
select pg_temp.check_that('payments are logged', exists (select 1 from public.audit_log where table_name = 'payments' and action = 'INSERT'));
select pg_temp.raises('audit rows cannot be changed', $q$update public.audit_log set action = 'x'$q$, '42501');
select pg_temp.raises('audit rows cannot be deleted', $q$delete from public.audit_log$q$, '42501');

reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check_that('admin reads the audit log', (select count(*) > 0 from public.audit_log));
update public.service_packages set price = price where false;
insert into public.lounges (name) values ('Audit lounge');
select pg_temp.check_that('a browser write by an admin is logged against the admin',
  exists (select 1 from public.audit_log where table_name = 'lounges' and actor_id = '00000000-0000-0000-0000-0000000000a1' and actor_role = 'admin'));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check_that('management reads booking history only',
  (select count(*) > 0 and bool_and(table_name = 'bookings') from public.audit_log));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check_that('a passenger reads no audit rows', (select count(*) = 0 from public.audit_log));

-- ---- two-step verification for admin and management ----------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'aal1');
select pg_temp.check_that('admin without the second factor has no admin powers', (select count(*) = 0 from public.audit_log));
select pg_temp.check_that('...but can still read their own profile', (select count(*) = 1 from public.profiles));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'aal1');
select pg_temp.check_that('management without the second factor sees no bookings', (select count(*) = 0 from public.bookings));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'aal1');
select pg_temp.check_that('supervisors are not held to the second factor', (select count(*) = 2 from public.bookings));
reset role;
set local role service_role;
update public.app_settings set value = 'false' where key = 'require_staff_mfa';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'aal1');
select pg_temp.check_that('break-glass setting lifts the requirement', (select count(*) = 2 from public.bookings));
reset role;
set local role service_role;
update public.app_settings set value = 'true' where key = 'require_staff_mfa';

-- ---- disabled accounts ------------------------------------------------------------------------
update public.profiles set disabled = true where email = 'sup1@example.com';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check_that('a disabled supervisor sees nothing', (select count(*) = 0 from public.bookings));
reset role;
set local role service_role;
select pg_temp.check_that('disabling stamps the time', (select disabled_at is not null from public.profiles where email = 'sup1@example.com'));
update public.profiles set disabled = false where email = 'sup1@example.com';

-- ---- last admin ---------------------------------------------------------------------------------
update public.profiles set role = 'passenger' where email = 'admin2@example.com';
select pg_temp.raises('the last admin cannot be demoted', $q$update public.profiles set role = 'passenger' where email = 'admin@example.com'$q$, 'last_admin');
select pg_temp.raises('the last admin cannot be disabled', $q$update public.profiles set disabled = true where email = 'admin@example.com'$q$, 'last_admin');
select pg_temp.raises('the last admin cannot be deleted', $q$delete from public.profiles where email = 'admin@example.com'$q$, 'last_admin');
update public.profiles set role = 'admin' where email = 'admin2@example.com';
update public.profiles set role = 'passenger' where email = 'admin@example.com';
select pg_temp.check_that('with two admins one can step down', (select role = 'passenger' from public.profiles where email = 'admin@example.com'));
update public.profiles set role = 'admin' where email = 'admin@example.com';

-- ---- rate limits ----------------------------------------------------------------------------------
select pg_temp.check_that('first hit counts one', public.hit_rate_limit('t:1', 60) = 1);
select pg_temp.check_that('second hit counts two', public.hit_rate_limit('t:1', 60) = 2);
select pg_temp.check_that('peek does not count', public.rate_limit_count('t:1', 60) = 2);
select pg_temp.check_that('keys are independent', public.hit_rate_limit('t:2', 60) = 1);

-- ---- file ownership -------------------------------------------------------------------------------
select pg_temp.raises('a booking cannot point at someone else''s file',
  $q$insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id, passenger_photo_uri)
     values ('F-1', 'porter_only', 1, 1, 'arrival', 'online', 'u1', 'u2/secret.jpg')$q$, '23514');
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id, passenger_photo_uri)
values ('F-2', 'porter_only', 1, 1, 'arrival', 'online', 'u1', 'u1/mine.jpg');
select pg_temp.raises('a supervisor profile cannot point at someone else''s file',
  $q$insert into public.supervisor_directory (user_id, email, photo_uri) values ('s1', 's@x.com', 'u1/id.jpg')$q$, '23514');

-- ---- idempotency ----------------------------------------------------------------------------------
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id, idempotency_key)
values ('I-1', 'porter_only', 1, 1, 'arrival', 'online', 'u9', 'key-1');
select pg_temp.raises('the same key twice for one passenger is refused',
  $q$insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id, idempotency_key)
     values ('I-2', 'porter_only', 1, 1, 'arrival', 'online', 'u9', 'key-1')$q$, '23505');
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id, idempotency_key)
values ('I-3', 'porter_only', 1, 1, 'arrival', 'online', 'u10', 'key-1');

-- ---- anonymisation --------------------------------------------------------------------------------
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id,
    contact, nationality, passengers, passenger_photo_uri)
values ('A-1', 'porter_only', 1, 1, 'arrival', 'online', 'u77', '+233200000001', 'GH', '[{"name":"Ama Mensah","contact":"+233","total_bags":2}]', 'u77/id.jpg');
insert into public.booking_ratings (booking_id, booking_reference, passenger_user_id, passenger_name, overall_rating, feedback, submitted_at)
values ('x', 'A-1', 'u77', 'Ama Mensah', 5, 'Lovely', 'now');
insert into public.notifications (user_id, title, message) values ('u77', 'hi', 'there');
select pg_temp.check_that('anonymise returns the files to delete', (select array_agg(path) = array['u77/id.jpg'] from public.anonymise_user_data('u77')));
select pg_temp.check_that('personal data is blanked and money kept',
  (select contact = '' and nationality = '' and passengers -> 0 ->> 'name' = 'Deleted passenger' and (passengers -> 0 ->> 'total_bags')::int = 2
          and passenger_photo_uri = '' and total_value = 1 from public.bookings where reference = 'A-1'));
select pg_temp.check_that('rating text blanked, stars kept', (select passenger_name = '' and feedback = '' and overall_rating = 5 from public.booking_ratings where passenger_user_id = 'u77'));
select pg_temp.check_that('notifications removed', (select count(*) = 0 from public.notifications where user_id = 'u77'));

rollback;
