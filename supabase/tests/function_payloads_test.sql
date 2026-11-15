-- Smoke test: the rows the Edge Functions write must satisfy the schema's types and constraints.
-- (The functions run as the service role, so RLS does not apply; this checks columns and CHECKs.)
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'pax@example.com');
set local role service_role;

-- createBooking: online booking with a discount
insert into public.discount_codes (code, recipient_type, recipient_name, contact_name, contact_email, contact_phone, description,
  discount_type, discount_value, start_date, expiry_date, max_uses, max_uses_per_customer, eligible_email, eligible_domain,
  eligible_emails, active, redemption_count, total_discount_granted, last_claim_token)
values ('AAG-TEST01', 'individual', 'Ama', '', 'ama@example.com', '', '', 'percentage', 10, '2026-01-01', '2030-01-01', 5, 1,
  'ama@example.com', '', '[]', true, 0, 0, '');

insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value,
  flight_type, airline, flight_number, flight_date, scheduled_flight_time, contact, nationality, total_bags, special_requests, lounge_used,
  passengers, porters, status, payment_status, amount_collected, outstanding_balance, booking_channel, passenger_user_id,
  passenger_photo_uri, discount_amount, discount_value, discount_code_id, discount_code, discount_type, discount_recipient_type,
  discount_recipient_name, discount_redeemed_at)
select 'AAG-261114-AB12', 'full_arrival', 'Full Arrival Assist', 100, 2, 200, 180, 'arrival', 'BA', 'BA78', '2026-12-01', '10:30',
  '+233200000000', 'GH', 3, '', '', '[{"name":"Ama"}]', '[]', 'confirmed', 'unpaid', 0, 180, 'online',
  '00000000-0000-0000-0000-0000000000f1', '', 20, 10, id::text, code, 'percentage', 'individual', 'Ama', now()::text
from public.discount_codes where code = 'AAG-TEST01';

-- walk-in booking: no discount, no passenger account (nulls, not empty strings, for enum-checked columns)
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, status, passenger_user_id,
  assigned_supervisor_id, assigned_supervisor_name, discount_amount, discount_value, discount_type, discount_recipient_type)
values ('AAG-261114-ZZ99', 'porter_only', 1, 50, 'departure', 'walk_in', 'assigned', null, 's1', 'Sup', 0, 0, null, null);

-- the old code wrote '' for these enum columns; the schema must reject that so the function never does
do $$ begin
  insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, discount_type)
  values ('BAD', 'porter_only', 1, 1, 'arrival', 'online', '');
  raise exception 'FAIL empty-string enum was accepted';
exception when check_violation then null; end $$;

-- duplicate booking reference is rejected (createBooking retries on 23505)
do $$ begin
  insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel)
  values ('AAG-261114-AB12', 'porter_only', 1, 1, 'arrival', 'online');
  raise exception 'FAIL duplicate reference accepted';
exception when unique_violation then null; end $$;

insert into public.discount_redemptions (discount_code_id, code, booking_id, booking_reference, user_id, user_email, recipient_type, recipient_name,
  discount_type, discount_value, discount_amount, gross_total, net_total, redeemed_at)
select dc.id::text, dc.code, b.id::text, b.reference, '00000000-0000-0000-0000-0000000000f1', 'pax@example.com', 'individual', 'Ama',
  'percentage', 10, 20, 200, 180, now()::text
from public.discount_codes dc, public.bookings b where b.reference = 'AAG-261114-AB12';

-- notifications of every type the functions create
insert into public.notifications (user_id, booking_id, booking_reference, title, message, read, type, previous_status, new_status, supervisor_name, supervisor_id, service_type, shift_report_id, account_request_id, link_path)
select 'u', null, null, 't', 'm', false, t, null, null, null, null, null, null, null, null
from unnest(array['assignment','reassignment','info','status_change','shift_report','staff_request']) t;

-- ratings: one per booking
insert into public.booking_ratings (booking_id, booking_reference, passenger_user_id, passenger_name, overall_rating, feedback,
  supervisor_user_id, supervisor_name, package_code, package_name, service_date, submitted_at)
select id::text, reference, '00000000-0000-0000-0000-0000000000f1', 'Ama', 5, 'great', '', '', 'full_arrival', 'Full Arrival Assist', '2026-12-01', now()::text
from public.bookings where reference = 'AAG-261114-AB12';
do $$ begin
  insert into public.booking_ratings (booking_id, booking_reference, passenger_user_id, overall_rating, submitted_at)
  select id::text, reference, 'x', 4, 'now' from public.bookings where reference = 'AAG-261114-AB12';
  raise exception 'FAIL second rating for a booking accepted';
exception when unique_violation then null; end $$;

-- staff request flow, directory, baseline, shift report
insert into public.account_requests (full_name, email, requested_role, status, user_id) values ('Kofi', 'k@example.com', 'supervisor', 'pending', 'x');
insert into public.supervisor_directory (user_id, full_name, email, active) values ('x', 'Kofi', 'k@example.com', true);
insert into public.reporting_baselines (baseline_at, set_by_id, set_by_name, set_by_email, note) values (now()::text, 'a', 'A', 'a@x.com', '');
insert into public.shift_reports (supervisor_id, shift_type, reporting_period_start, grand_total_paid, meet_assist_entries, porter_entries)
values ('s', 'morning', '2026-11-14', 10, '[{"service_type":"arrival","amount_paid":10,"payment_method":"cash"}]', '[]');

-- the aggregate functions the dashboards call
select 1 from public.aggregate_bookings(array['confirmed','assigned'], now() - interval '1 day');
select 1 from public.aggregate_ratings();

select 'function payload smoke test: ok' as result;
rollback;
