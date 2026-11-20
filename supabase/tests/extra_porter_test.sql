-- Extra porters can no longer be added; one already recorded can still be taken off. Run after the migrations.
begin;
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
select pg_temp.check_that('there is no way left to add an extra porter',
  (select count(*) = 0 from pg_proc where proname = 'add_extra_porter'));
select pg_temp.check_that('quick sale has one version, with no extra-porter fee parameters',
  (select count(*) = 1 and bool_and(pronargs = 20) from pg_proc where proname = 'create_quick_sale'));

-- bookings that already carry an extra porter (recorded before this change)
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, porters)
values ('EP-4', 'full_arrival', 'Full Arrival Assist', 700, 1, 800, 800, 0, 800, 'unpaid', 'arrival', 'walk_in', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'confirmed',
        '[{"porter_id":"porter-kojo","porter_name":"Kojo","passengers_handled":1,"commission":30},{"porter_id":"porter-yaw","porter_name":"Yaw","passengers_handled":0,"commission":30,"extra":true,"fee":100}]'),
       ('EP-5', 'full_arrival', 'Full Arrival Assist', 700, 1, 800, 800, 800, 0, 'paid', 'arrival', 'walk_in', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'assigned',
        '[{"porter_id":"porter-kojo","porter_name":"Kojo","passengers_handled":1,"commission":30},{"porter_id":"porter-yaw","porter_name":"Yaw","passengers_handled":0,"commission":30,"extra":true,"fee":100}]');
select public.remove_extra_porter((select id from public.bookings where reference = 'EP-4'), 1, 'e1');
select pg_temp.check_that('an unpaid extra porter can still be removed, taking the fee off the price',
  (select total_value = 700 and original_total = 700 and outstanding_balance = 700 and jsonb_array_length(porters) = 1 from public.bookings where reference = 'EP-4'));
select pg_temp.raises('the first porter is not an extra and is not removed here',
  $q$select public.remove_extra_porter((select id from public.bookings where reference = 'EP-4'), 0, 'e1')$q$, 'not_extra');
select pg_temp.raises('a fee the customer has paid cannot be dropped without a refund',
  $q$select public.remove_extra_porter((select id from public.bookings where reference = 'EP-5'), 1, 'e1')$q$, 'refund_first');
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, porters)
values ('EP-6', 'full_arrival', 'Full Arrival Assist', 700, 1, 800, 800, 800, 0, 'paid', 'arrival', 'walk_in', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'completed',
        '[{"porter_id":"porter-kojo","porter_name":"Kojo","passengers_handled":1,"commission":30},{"porter_id":"porter-yaw","porter_name":"Yaw","passengers_handled":0,"commission":30,"extra":true,"fee":100}]');
select pg_temp.raises('a completed booking is not changed',
  $q$select public.remove_extra_porter((select id from public.bookings where reference = 'EP-6'), 1, 'e1')$q$, 'booking_closed');
rollback;
