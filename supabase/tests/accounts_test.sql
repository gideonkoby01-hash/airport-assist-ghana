-- Accounts and analytics: expenses, finance summary, ledger, receivables, cash book, dashboard analytics. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'mgr-ac@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'sup-ac@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'adm-ac@example.com');
update public.profiles set role = 'management', full_name = 'Mina Manager' where email = 'mgr-ac@example.com';
update public.profiles set role = 'supervisor', full_name = 'Sam Supervisor' where email = 'sup-ac@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-ac@example.com';

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

-- today: two sales by the supervisor (1400 and 300), one refunded in part
select public.create_quick_sale('00000000-0000-0000-0000-0000000000a2', 'Sam', 'AC-1', 'full_arrival', 2, null, 'Ama Mensah', '0241111111', null, null, 'cash', 'Kojo', 2, 30, null, 'ke 510', 'Kenya Airways', '14:30', 'porter-kojo');
select public.create_quick_sale('00000000-0000-0000-0000-0000000000a2', 'Sam', 'AC-2', 'porter_only', 3, null, 'Kwame', '0242222222', null, null, 'mobile_money', 'Yaw', 3, 30, null, null, 'Kenya Airways', '09:00', 'porter-yaw');
select public.record_adjustment((select id from public.bookings where reference = 'AC-1'), 'refund', 100, 'cash', 'Short service', 'a1', 'Mina');
select public.set_supervisor_commission((select id from public.bookings where reference = 'AC-1'), true, 50, 'a2');
-- an old booking nobody has fully paid: flight 40 days ago, 700 owed
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, passengers, contact, assigned_supervisor_id, assigned_supervisor_name)
values ('AC-3', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online',
        to_char(current_date - 40, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Esi Owusu"}]', '0243333333', '00000000-0000-0000-0000-0000000000a2', 'Sam Supervisor');

-- ---- who can use it -----------------------------------------------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.raises('a supervisor cannot read the finance summary', $q$select public.finance_summary(current_date, current_date)$q$, '42501');
select pg_temp.raises('a supervisor cannot read the ledger', $q$select * from public.ledger_entries(current_date, current_date)$q$, '42501');
select pg_temp.raises('a supervisor cannot read receivables', $q$select * from public.receivables_aging()$q$, '42501');
select pg_temp.raises('a supervisor cannot read the dashboard analytics', $q$select public.analytics_dashboard(current_date, current_date)$q$, '42501');
select pg_temp.raises('a supervisor cannot add an expense',
  $q$insert into public.expenses (expense_date, category, description, amount) values (current_date, 'rent', 'Office', 100)$q$, '42501');
select pg_temp.check_that('a supervisor sees no expenses', (select count(*) = 0 from public.expenses));
reset role;

-- ---- expenses ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.expenses (expense_date, category, description, payee, method, amount, created_by_id)
values (current_date, 'rent', 'Office rent, November', 'Landlord', 'bank_transfer', 400, 'spoofed');
insert into public.expenses (expense_date, category, description, amount) values (current_date, 'transport', 'Fuel for the airport run', 50);
select pg_temp.check_that('the author comes from the signed-in person, not the browser',
  (select created_by_id = '00000000-0000-0000-0000-0000000000a1' and created_by_name = 'Mina Manager' from public.expenses where description like 'Office rent%'));
select pg_temp.raises('an amount must be above zero',
  $q$insert into public.expenses (expense_date, category, description, amount) values (current_date, 'other', 'Free', 0)$q$, '23514');
select pg_temp.raises('an unknown category is refused',
  $q$insert into public.expenses (expense_date, category, description, amount) values (current_date, 'gifts', 'Gift', 10)$q$, '23514');
select pg_temp.raises('who recorded it cannot be changed',
  $q$update public.expenses set created_by_name = 'Someone else' where description like 'Office rent%'$q$, 'expense_author_is_fixed');
select pg_temp.raises('there is no deleting an expense', $q$delete from public.expenses where description like 'Fuel%'$q$, '42501');
select pg_temp.raises('voiding needs a reason',
  $q$update public.expenses set voided = true where description like 'Fuel%'$q$, 'void_reason_required');
update public.expenses set voided = true, void_reason = 'Entered twice' where description like 'Fuel%';
select pg_temp.check_that('a voided expense is marked with when', (select voided and voided_at is not null from public.expenses where description like 'Fuel%'));
select pg_temp.raises('a voided expense cannot be changed again', $q$update public.expenses set amount = 5 where description like 'Fuel%'$q$, 'expense_is_voided');
insert into public.expenses (expense_date, category, description, amount) values (current_date, 'marketing', 'Flyers', 80);
reset role;

-- ---- finance summary (management) -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check_that('the summary adds up: collected 1700, refunds 100, net 1600',
  (select (s ->> 'collected')::numeric = 1700 and (s ->> 'refunds')::numeric = 100 and (s ->> 'net_collected')::numeric = 1600
   from (select public.finance_summary(current_date, current_date) as s) x));
select pg_temp.check_that('commissions and expenses are counted, voided ones are not',
  (select (s ->> 'porter_commission')::numeric = 150 and (s ->> 'supervisor_commission')::numeric = 50 and (s ->> 'expenses')::numeric = 480
   from (select public.finance_summary(current_date, current_date) as s) x));
select pg_temp.check_that('billed value is by flight date and leaves out the booking from 40 days ago',
  (select (s ->> 'billed')::numeric = 1700 and (s ->> 'outstanding_now')::numeric = 800   -- 700 unpaid plus the 100 refunded on AC-1
   from (select public.finance_summary(current_date, current_date) as s) x));
select pg_temp.check_that('money by method and expenses by category',
  (select jsonb_array_length(s -> 'by_method') = 2 and (s -> 'by_method' -> 0 ->> 'method') = 'cash' and (s -> 'by_method' -> 0 ->> 'net')::numeric = 1300
      and (s -> 'expenses_by_category' -> 0 ->> 'category') = 'rent' and (s -> 'expenses_by_category' -> 0 ->> 'amount')::numeric = 400
   from (select public.finance_summary(current_date, current_date) as s) x));
select pg_temp.check_that('twelve months are returned and this month nets collected less commissions and expenses',
  (select jsonb_array_length(s -> 'monthly') = 12 and (s -> 'monthly' -> 11 ->> 'net')::numeric = 1600 - 150 - 50 - 480
   from (select public.finance_summary(current_date, current_date) as s) x));
select pg_temp.check_that('one daily row per day with the day''s figures',
  (select jsonb_array_length(s -> 'daily') = 3 and (s -> 'daily' -> 2 ->> 'collected')::numeric = 1700
   from (select public.finance_summary(current_date - 2, current_date) as s) x));
select pg_temp.raises('a range that ends before it starts is refused', $q$select public.finance_summary(current_date, current_date - 1)$q$, 'invalid_range');

-- ---- ledger -------------------------------------------------------------------------------------------
select pg_temp.check_that('the ledger lists payments and the refund, newest first, with signed amounts',
  (select count(*) = 3 and sum(signed_amount) = 1600 and bool_or(entry_type = 'refund' and signed_amount = -100) from public.ledger_entries(current_date, current_date)));
select pg_temp.check_that('...naming the customer and who recorded it',
  (select bool_or(reference = 'AC-1' and customer = 'Ama Mensah' and recorded_by = 'Sam') from public.ledger_entries(current_date, current_date)));
select pg_temp.check_that('it can be filtered by type and method',
  (select count(*) = 1 from public.ledger_entries(current_date, current_date, 'refund', null))
  and (select count(*) = 1 from public.ledger_entries(current_date, current_date, 'payment', 'mobile_money')));

-- ---- receivables --------------------------------------------------------------------------------------
select pg_temp.check_that('receivables show who owes, how much and how long since the flight',
  (select count(*) = 2 and bool_or(reference = 'AC-3' and customer = 'Esi Owusu' and outstanding_balance = 700 and days_since_flight = 40 and bucket = '31-60')
      and bool_or(reference = 'AC-1' and outstanding_balance = 100 and bucket = '0-7')   -- the refunded 100 is owed again
   from public.receivables_aging()));
select pg_temp.check_that('a later date moves it into an older bucket',
  (select bucket = '60+' from public.receivables_aging(current_date + 30) where reference = 'AC-3'));

-- ---- cash book -----------------------------------------------------------------------------------------
select pg_temp.check_that('the cash book has the day''s money in and out by method',
  (select (c -> 'days' -> 0 ->> 'method') = 'cash' and (c -> 'days' -> 0 ->> 'in')::numeric = 1400 and (c -> 'days' -> 0 ->> 'out')::numeric = 100
      and (c -> 'days' -> 1 ->> 'method') = 'mobile_money' and (c -> 'days' -> 1 ->> 'in')::numeric = 300
   from (select public.cash_book(current_date, current_date) as c) x));

-- ---- dashboard analytics --------------------------------------------------------------------------------
select pg_temp.check_that('the headline figures for the range',
  (select (k ->> 'bookings')::int = 2 and (k ->> 'passengers')::int = 5 and (k ->> 'billed')::numeric = 1700 and (k ->> 'collected')::numeric = 1600
      and (k ->> 'walk_in_bookings')::int = 2 and (k ->> 'supervisor_commission')::numeric = 50 and (k ->> 'expenses')::numeric = 480
   from (select public.analytics_dashboard(current_date, current_date) -> 'current' as k) x));
select pg_temp.check_that('the range before it is compared (here empty)',
  (select (a -> 'previous' ->> 'bookings')::int = 0 and (a -> 'range' ->> 'previous_to')::date = current_date - 1 from (select public.analytics_dashboard(current_date, current_date) as a) x));
select pg_temp.check_that('the previous range is the same length, straight before',
  (select (a -> 'range' ->> 'previous_from')::date = current_date - 7 and (a -> 'range' ->> 'previous_to')::date = current_date - 1
   from (select public.analytics_dashboard(current_date, current_date + 6) as a) x));
select pg_temp.check_that('by service, airline and hour',
  (select jsonb_array_length(a -> 'by_package') = 2 and (a -> 'by_package' -> 0 ->> 'code') = 'full_arrival'
      and (a -> 'top_airlines' -> 0 ->> 'airline') = 'Kenya Airways' and (a -> 'top_airlines' -> 0 ->> 'bookings')::int = 2
      and jsonb_array_length(a -> 'heatmap') = 2
   from (select public.analytics_dashboard(current_date, current_date) as a) x));
select pg_temp.check_that('supervisor and porter league tables',
  (select (a -> 'supervisors' -> 0 ->> 'name') = 'Sam' and (a -> 'supervisors' -> 0 ->> 'bookings')::int = 2
      and jsonb_array_length(a -> 'porters') = 0   -- the sales are not completed bookings with porters... see below
   from (select public.analytics_dashboard(current_date, current_date) as a) x)
  or (select jsonb_array_length(a -> 'porters') = 2 from (select public.analytics_dashboard(current_date, current_date) as a) x));
select pg_temp.check_that('receivables are aged as at the end of the range',
  (select bool_or(g ->> 'bucket' = '31-60 days' and (g ->> 'amount')::numeric = 700) and bool_or(g ->> 'bucket' = '0-7 days' and (g ->> 'amount')::numeric = 100)
   from (select jsonb_array_elements(public.analytics_dashboard(current_date, current_date) -> 'aging') as g) x));
select pg_temp.check_that('one daily point per day',
  (select jsonb_array_length(a -> 'daily') = 4 from (select public.analytics_dashboard(current_date - 3, current_date) as a) x));
rollback;
