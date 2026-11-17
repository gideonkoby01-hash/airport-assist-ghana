-- Extra porters: each adds a fee to the service price and earns a flat commission. Run after the migrations.
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'sup-ep@example.com');
update public.profiles set role = 'supervisor' where email = 'sup-ep@example.com';

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

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true)
on conflict (code) do nothing;

-- ---- quick sale with extra porters --------------------------------------------------------------------
select public.create_quick_sale('00000000-0000-0000-0000-0000000000e1', 'Sup', 'EP-1', 'full_arrival', 1, null, 'Ama', '', null, null, 'cash',
  'Kojo', 1, 30, null, null, null, null, 'porter-kojo',
  '[{"porter_id":"porter-yaw","porter_name":"Yaw"},{"porter_id":"porter-esi","porter_name":"Esi"}]'::jsonb, 100);
select pg_temp.check_that('two extra porters add GHS 200 to the price and the payment',
  (select total_value = 900 and original_total = 900 and amount_collected = 900 and outstanding_balance = 0 and payment_status = 'paid'
   from public.bookings where reference = 'EP-1'));
select pg_temp.check_that('the extras are flagged, carry the fee and a flat GHS 30 commission',
  (select jsonb_array_length(porters) = 3
      and (porters -> 0 ->> 'extra') is null and (porters -> 0 ->> 'commission')::numeric = 30
      and (porters -> 1 ->> 'extra')::boolean and (porters -> 1 ->> 'fee')::numeric = 100 and (porters -> 1 ->> 'commission')::numeric = 30
      and (porters -> 2 ->> 'passengers_handled')::int = 0
   from public.bookings where reference = 'EP-1'));
select pg_temp.check_that('the ledger holds one payment for the full amount',
  (select count(*) = 1 and sum(amount) = 900 from public.payments where booking_reference = 'EP-1'));
select pg_temp.check_that('a sale with no extras is unchanged',
  (select total_value = 700 from public.create_quick_sale('00000000-0000-0000-0000-0000000000e1', 'Sup', 'EP-2', 'full_arrival', 1, null, null, null, null, null, 'cash', 'Kojo', 1, 30)));
select pg_temp.check_that('a desk price cut applies to the package only; the extra fee is still charged',
  (select total_value = 700 and original_total = 800 and discount_amount = 100 and amount_collected = 700
   from public.create_quick_sale('00000000-0000-0000-0000-0000000000e1', 'Sup', 'EP-3', 'full_arrival', 1, null, null, null, 600, 'Regular', 'cash', 'Kojo', 1, 30, null, null, null, null, null,
          '[{"porter_id":"porter-yaw","porter_name":"Yaw"}]'::jsonb, 100)));
select pg_temp.raises('an extra porter with no name is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000e1', 'Sup', 'EP-X', 'full_arrival', 1, null, null, null, null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, null, '[{"porter_id":"x"}]'::jsonb, 100)$q$, 'invalid_extra_porters');

-- ---- extra porter on an open booking -----------------------------------------------------------------------
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, porters, assigned_supervisor_id)
values ('EP-4', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'walk_in', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'confirmed',
        '[{"porter_id":"porter-kojo","porter_name":"Kojo","passengers_handled":1,"commission":30}]', '00000000-0000-0000-0000-0000000000e1'),
       ('EP-5', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 700, 0, 'paid', 'arrival', 'walk_in', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'assigned',
        '[{"porter_id":"porter-kojo","porter_name":"Kojo","passengers_handled":1,"commission":30}]', '00000000-0000-0000-0000-0000000000e1');
select public.add_extra_porter((select id from public.bookings where reference = 'EP-4'), '{"porter_id":"porter-yaw","porter_name":"Yaw","passengers_handled":0,"commission":30}'::jsonb, 100, 'e1');
select pg_temp.check_that('an extra porter on an unpaid booking raises the price and the balance by the fee',
  (select total_value = 800 and original_total = 800 and outstanding_balance = 800 and payment_status = 'unpaid' and jsonb_array_length(porters) = 2
          and (porters -> 1 ->> 'fee')::numeric = 100 from public.bookings where reference = 'EP-4'));
select public.add_extra_porter((select id from public.bookings where reference = 'EP-5'), '{"porter_id":"porter-yaw","porter_name":"Yaw","passengers_handled":0,"commission":30}'::jsonb, 100, 'e1');
select pg_temp.check_that('on a paid booking the fee becomes a balance still to collect',
  (select total_value = 800 and outstanding_balance = 100 and payment_status = 'partially_paid' from public.bookings where reference = 'EP-5'));
select pg_temp.raises('a negative fee is refused',
  $q$select public.add_extra_porter((select id from public.bookings where reference = 'EP-4'), '{"porter_name":"Z"}'::jsonb, -5, 'e1')$q$, 'invalid_amount');

-- removing: fine while the fee is unpaid; refused once paid (refund first)
select public.remove_extra_porter((select id from public.bookings where reference = 'EP-4'), 1, 'e1');
select pg_temp.check_that('removing an unpaid extra porter takes the fee off again',
  (select total_value = 700 and outstanding_balance = 700 and jsonb_array_length(porters) = 1 from public.bookings where reference = 'EP-4'));
select pg_temp.raises('the first porter is not an extra and is not removed here',
  $q$select public.remove_extra_porter((select id from public.bookings where reference = 'EP-4'), 0, 'e1')$q$, 'not_extra');
select public.record_payment((select id from public.bookings where reference = 'EP-5'), 100, 'cash', 'e1', 'Sup');
select pg_temp.raises('a fee the customer has paid cannot be dropped without a refund',
  $q$select public.remove_extra_porter((select id from public.bookings where reference = 'EP-5'), 1, 'e1')$q$, 'refund_first');

-- closed bookings cannot take an extra porter
update public.bookings set status = 'cancelled' where reference = 'EP-4';
select pg_temp.raises('a cancelled booking takes no extra porter',
  $q$select public.add_extra_porter((select id from public.bookings where reference = 'EP-4'), '{"porter_name":"Z"}'::jsonb, 100, 'e1')$q$, 'booking_closed');

-- ---- the data checks still agree ---------------------------------------------------------------------------
select pg_temp.check_that('balances still add up after fees are added and removed',
  (select coalesce(sum(problem_count), 0) = 0 from public.data_integrity_check() where check_name like 'open bookings whose balance%'));

-- ---- the shift report counts the extra fee as sales and the extra commission against them ---------------------
select pg_temp.check_that('shift report: sales include the extra fees, commission includes the extra porters',
  (select (b ->> 'grand_total_paid')::numeric = 900 + 700 + 700      -- the payments on EP-1, EP-2 and EP-3, fees included
      and (b ->> 'porter_total_commission')::numeric = 90 + 30 + 60   -- EP-1: three porters at 30; EP-2: one; EP-3: two
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000e1',
           case when extract(hour from now() at time zone 'utc') < 6 then current_date - 1 else current_date end,
           case when extract(hour from now() at time zone 'utc') between 6 and 17 then 'morning' else 'night' end) as b) x));
rollback;
