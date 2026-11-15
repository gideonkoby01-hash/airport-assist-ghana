-- Customer CRM: linking bookings to customers, the list with totals and segments, access rules, notes, erasure.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'admin-crm@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'manager-crm@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'sup-crm@example.com'),
  ('00000000-0000-0000-0000-0000000000f4', 'pax-crm@example.com');
update public.profiles set role = 'admin', full_name = 'Admin A' where email = 'admin-crm@example.com';
update public.profiles set role = 'management', full_name = 'Manager M' where email = 'manager-crm@example.com';
update public.profiles set role = 'supervisor' where email = 'sup-crm@example.com';
update public.profiles set full_name = 'Akua Mensah' where email = 'pax-crm@example.com';

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

-- phone numbers
select pg_temp.check_that('local, +233 and 00233 forms match',
  public.normalise_phone('024 123 4567') = '233241234567'
  and public.normalise_phone('+233 24 123 4567') = '233241234567'
  and public.normalise_phone('00233241234567') = '233241234567');
select pg_temp.check_that('foreign numbers keep their digits', public.normalise_phone('+44 7700 900123') = '447700900123');
select pg_temp.check_that('blank gives null', public.normalise_phone('  ') is null and public.normalise_phone(null) is null);

-- linking (service role, as the booking functions run)
set local role service_role;
insert into public.bookings (reference, package_code, num_passengers, total_value, outstanding_balance, amount_collected, flight_type,
    booking_channel, flight_date, contact, passengers, status, passenger_user_id)
values
  ('C-1', 'full_arrival', 1, 100, 0, 100, 'arrival', 'walk_in', to_char(current_date - 10, 'YYYY-MM-DD'), '024 111 2222', '[{"name":"Kofi Boateng"}]', 'completed', null),
  ('C-2', 'full_arrival', 2, 200, 50, 150, 'arrival', 'walk_in', to_char(current_date + 2, 'YYYY-MM-DD'), '+233 24 111 2222', '[{"name":"Kofi B."}]', 'assigned', null),
  ('C-3', 'full_arrival', 1, 80, 80, 0, 'arrival', 'walk_in', to_char(current_date, 'YYYY-MM-DD'), '', '[{"name":"Walk-in"}]', 'completed', null),
  ('C-4', 'full_arrival', 1, 90, 90, 0, 'arrival', 'online', to_char(current_date + 5, 'YYYY-MM-DD'), '0551234567', '[{"name":"Someone Else"}]', 'confirmed', '00000000-0000-0000-0000-0000000000f4'),
  ('C-5', 'full_arrival', 1, 60, 0, 0, 'arrival', 'walk_in', to_char(current_date - 300, 'YYYY-MM-DD'), '020 999 8888', '[{"name":"Old Customer"}]', 'cancelled', null);
select pg_temp.check_that('two bookings with the same number share one customer',
  (select count(distinct customer_id) = 1 from public.bookings where reference in ('C-1', 'C-2') and customer_id is not null));
select pg_temp.check_that('the first name seen is kept', (select full_name = 'Kofi Boateng' from public.customers where phone_key = '233241112222'));
select pg_temp.check_that('an anonymous desk sale gets no customer', (select customer_id is null from public.bookings where reference = 'C-3'));
select pg_temp.check_that('an account holder is named from their profile, not the passenger', (select c.full_name = 'Akua Mensah' and c.email = 'pax-crm@example.com' from public.bookings b join public.customers c on c.id = b.customer_id where b.reference = 'C-4'));
select pg_temp.check_that('their phone is stored for matching', (select phone_key = '233551234567' from public.customers where user_id = '00000000-0000-0000-0000-0000000000f4'));
-- a later walk-in with the account holder's number joins the account's record
insert into public.bookings (reference, package_code, num_passengers, total_value, outstanding_balance, flight_type, booking_channel, flight_date, contact, passengers, status)
values ('C-6', 'full_arrival', 1, 70, 70, 'arrival', 'walk_in', to_char(current_date + 1, 'YYYY-MM-DD'), '055 123 4567', '[{"name":"Akua"}]', 'confirmed');
select pg_temp.check_that('a desk booking with the same number joins the account holder',
  (select b6.customer_id = b4.customer_id from public.bookings b6, public.bookings b4 where b6.reference = 'C-6' and b4.reference = 'C-4'));

-- access
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select pg_temp.check_that('a passenger sees no customers', (select count(*) = 0 from public.customers));
select pg_temp.raises('a passenger cannot use the list function', $q$select * from public.crm_customers()$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select pg_temp.check_that('a supervisor sees no customers', (select count(*) = 0 from public.customers));
select pg_temp.raises('a supervisor cannot use the list function', $q$select * from public.crm_customers()$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
select pg_temp.check_that('management without the second step sees nothing', (select count(*) = 0 from public.customers));
reset role;

-- the list, as management
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check_that('management sees customers', (select count(*) >= 2 from public.customers));
select pg_temp.check_that('totals: Kofi has 2 bookings, 300 booked, 250 collected, 50 owed',
  (select bookings_count = 2 and booked_value = 300 and collected = 250 and outstanding = 50 from public.crm_customers('Kofi')));
select pg_temp.check_that('search by a local-format phone number finds him', (select count(*) = 1 from public.crm_customers('024 111')));
select pg_temp.check_that('search by email finds the account holder', (select count(*) = 1 from public.crm_customers('pax-crm@')));
select pg_temp.check_that('a customer with only a cancelled booking counts none', (select bookings_count = 0 and segment = 'new' from public.crm_customers('Old Customer')));
select pg_temp.check_that('two bookings make a returning customer', (select segment = 'returning' from public.crm_customers('Kofi')));
select pg_temp.check_that('segment filter works', (select count(*) = 2 from public.crm_customers('', 'returning')) and (select count(*) = 0 from public.crm_customers('', 'lapsed')));
select pg_temp.check_that('sorting by value puts the biggest first', (select full_name = 'Kofi Boateng' from public.crm_customers('', 'all', 'value', 1)));

-- notes and edits
insert into public.customers (full_name, phone, email) values ('Enquiry Person', '027 000 1111', '');
select pg_temp.check_that('management can add a customer by hand', (select phone_key = '233270001111' from public.customers where full_name = 'Enquiry Person'));
select pg_temp.raises('the same phone cannot be added twice', $q$insert into public.customers (full_name, phone) values ('Dup', '+233 27 000 1111')$q$, '23505');
update public.customers set tags = array['vip'], marketing_consent = true where full_name = 'Kofi Boateng';
select pg_temp.check_that('a vip tag makes a vip', (select segment = 'vip' and marketing_consent from public.crm_customers('Kofi')));
insert into public.customer_notes (customer_id, kind, body, follow_up_on, author_id, author_name)
  select id, 'call', 'Asked about a corporate rate', current_date + 3, 'someone-else', 'Forged' from public.customers where full_name = 'Kofi Boateng';
select pg_temp.check_that('the note author comes from the signed-in person, not the request',
  (select author_id = '00000000-0000-0000-0000-0000000000f2' and author_name = 'Manager M' from public.customer_notes));
update public.customer_notes set done = true;
select pg_temp.check_that('a follow-up can be marked done', (select done from public.customer_notes));
select pg_temp.raises('the text of a note cannot be rewritten', $q$update public.customer_notes set body = 'changed'$q$, 'notes_are_append_only');
select pg_temp.raises('management cannot erase a customer', $q$select public.crm_erase_customer((select id from public.customers where full_name = 'Enquiry Person'))$q$, '42501');
delete from public.customer_notes;
select pg_temp.check_that('management cannot delete notes (no rows removed)', (select count(*) = 1 from public.customer_notes));
reset role;

-- audit trail
select pg_temp.check_that('customer changes are in the audit log', (select count(*) > 0 from public.audit_log where table_name = 'customers' and actor_id = '00000000-0000-0000-0000-0000000000f2'));

-- erasure (admin)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.raises('a customer with an account is erased from Staff accounts instead',
  $q$select public.crm_erase_customer((select id from public.customers where user_id = '00000000-0000-0000-0000-0000000000f4'))$q$, 'has_account');
select public.crm_erase_customer((select id from public.customers where phone_key = '233241112222'));
select pg_temp.check_that('erased customer is blank, notes gone, no longer listed',
  (select count(*) = 0 from public.crm_customers('Kofi')) and (select count(*) = 0 from public.customer_notes));
reset role;
select pg_temp.check_that('their bookings keep the money but lose the personal details',
  (select bool_and(contact = '' and passengers -> 0 ->> 'name' = 'Deleted passenger') and sum(total_value) = 300 from public.bookings where reference in ('C-1', 'C-2')));
select public.link_customer(null, 'Kofi Again', '0241112222');
select pg_temp.check_that('the same number booking again starts a fresh record',
  (select count(*) = 1 from public.customers where full_name = 'Kofi Again' and phone_key = '233241112222'));
rollback;
