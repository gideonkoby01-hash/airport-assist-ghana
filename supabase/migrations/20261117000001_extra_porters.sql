-- Some passengers need more than one porter. Each extra porter adds a fee to the service (GHS 100 by default) and earns
-- a flat commission (the porter commission rate, GHS 30 by default). The fee is added to the booking's price in the same
-- step that records the porter, so the amount to collect always matches the porters on the booking.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Adds an extra porter to a booking that is still open: the porter entry goes on, the price goes up by the fee.
-- ---------------------------------------------------------------------------
create or replace function public.add_extra_porter(p_booking_id uuid, p_porter jsonb, p_fee numeric, p_user_id text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if p_fee is null or p_fee < 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  if b.status in ('completed', 'cancelled', 'no_show') then raise exception 'booking_closed' using errcode = 'P0001'; end if;

  update public.bookings set
    porters = coalesce(porters, '[]'::jsonb) || jsonb_build_array(p_porter || jsonb_build_object('extra', true, 'fee', p_fee)),
    total_value = round(total_value + p_fee, 2),
    original_total = round(coalesce(original_total, total_value) + p_fee, 2),
    outstanding_balance = greatest(0, round(total_value + p_fee - amount_collected - written_off, 2)),
    payment_status = case
      when amount_collected + written_off >= total_value + p_fee then 'paid'
      when amount_collected > 0 then 'partially_paid'
      else payment_status end,
    updated_by_id = p_user_id
  where id = p_booking_id
  returning * into b;
  return b;
end $$;

-- Takes an extra porter off again and gives back the fee, unless the customer has already paid it: then the money has to be
-- refunded first, so the ledger never shows a customer overpaid.
create or replace function public.remove_extra_porter(p_booking_id uuid, p_index integer, p_user_id text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings; entry jsonb; fee numeric;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  if b.status in ('completed', 'cancelled', 'no_show') then raise exception 'booking_closed' using errcode = 'P0001'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(coalesce(b.porters, '[]'::jsonb)) then
    raise exception 'porter_not_found' using errcode = 'P0001';
  end if;
  entry := b.porters -> p_index;
  if coalesce((entry ->> 'extra')::boolean, false) is not true then raise exception 'not_extra' using errcode = 'P0001'; end if;
  fee := coalesce((entry ->> 'fee')::numeric, 0);
  if b.amount_collected + b.written_off > b.total_value - fee + 0.001 then raise exception 'refund_first' using errcode = 'P0001'; end if;

  update public.bookings set
    porters = (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from jsonb_array_elements(porters) with ordinality t(e, o) where o <> p_index + 1),
    total_value = round(total_value - fee, 2),
    original_total = round(coalesce(original_total, total_value) - fee, 2),
    outstanding_balance = greatest(0, round(total_value - fee - amount_collected - written_off, 2)),
    payment_status = case
      when amount_collected + written_off >= total_value - fee then 'paid'
      when amount_collected > 0 then 'partially_paid'
      else 'unpaid' end,
    updated_by_id = p_user_id
  where id = p_booking_id
  returning * into b;
  return b;
end $$;

revoke execute on function public.add_extra_porter(uuid, jsonb, numeric, text) from public, anon, authenticated;
revoke execute on function public.remove_extra_porter(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.add_extra_porter(uuid, jsonb, numeric, text) to service_role;
grant execute on function public.remove_extra_porter(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Quick sale with extra porters: each one adds the fee to what is charged and collected.
-- ---------------------------------------------------------------------------
drop function if exists public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text);

create or replace function public.create_quick_sale(
  p_user_id text, p_user_name text, p_reference text, p_package_code text, p_count integer, p_direction text,
  p_name text, p_phone text, p_override_amount numeric, p_override_reason text, p_method text,
  p_porter_name text, p_porter_passengers integer, p_commission_per_passenger numeric, p_idempotency_key text default null,
  p_flight_number text default null, p_airline text default null, p_flight_time text default null, p_porter_id text default null,
  p_extra_porters jsonb default '[]'::jsonb, p_extra_fee numeric default 0
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare pkg public.service_packages; gross numeric; total numeric; flight text; b public.bookings; porters jsonb := '[]'::jsonb;
  fno text := nullif(upper(btrim(coalesce(p_flight_number, ''))), '');
  fair text := nullif(btrim(coalesce(p_airline, '')), '');
  ftime text := nullif(btrim(coalesce(p_flight_time, '')), '');
  extras jsonb := coalesce(p_extra_porters, '[]'::jsonb);
  extra_n integer; extra_total numeric; x jsonb;
begin
  select * into pkg from public.service_packages where code = p_package_code and active;
  if not found then raise exception 'package_unavailable' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'invalid_count' using errcode = 'P0001'; end if;
  if fno is not null and fno !~ '^[A-Z0-9][A-Z0-9 -]{1,9}$' then raise exception 'invalid_flight' using errcode = 'P0001'; end if;
  if ftime is not null and ftime !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_flight_time' using errcode = 'P0001'; end if;
  if char_length(coalesce(fair, '')) > 60 then raise exception 'invalid_flight' using errcode = 'P0001'; end if;
  if jsonb_typeof(extras) <> 'array' then raise exception 'invalid_extra_porters' using errcode = 'P0001'; end if;
  extra_n := jsonb_array_length(extras);
  if extra_n > 10 or coalesce(p_extra_fee, 0) < 0 then raise exception 'invalid_extra_porters' using errcode = 'P0001'; end if;
  extra_total := round(extra_n * coalesce(p_extra_fee, 0), 2);

  gross := round(pkg.price * p_count, 2);
  total := coalesce(p_override_amount, gross);
  if total <= 0 or total > gross then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if total < gross and length(trim(coalesce(p_override_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  flight := case pkg.flight_type when 'arrival' then 'arrival' when 'departure' then 'departure'
                 else case when p_direction = 'departure' then 'departure' else 'arrival' end end;
  if coalesce(trim(p_porter_name), '') <> '' then
    -- A porter cannot be credited with more passengers than were sold.
    if p_porter_passengers is null or p_porter_passengers < 1 or p_porter_passengers > p_count then raise exception 'invalid_porter_passengers' using errcode = 'P0001'; end if;
    porters := jsonb_build_array(jsonb_build_object('porter_id', nullif(btrim(coalesce(p_porter_id, '')), ''), 'porter_name', trim(p_porter_name),
                                                    'passengers_handled', p_porter_passengers,
                                                    'commission', p_commission_per_passenger * p_porter_passengers));
  end if;
  -- Extra porters: a flat commission each, and the fee is part of the price.
  for x in select * from jsonb_array_elements(extras) loop
    if coalesce(trim(x ->> 'porter_name'), '') = '' then raise exception 'invalid_extra_porters' using errcode = 'P0001'; end if;
    porters := porters || jsonb_build_array(jsonb_build_object('porter_id', nullif(btrim(coalesce(x ->> 'porter_id', '')), ''),
                                                               'porter_name', trim(x ->> 'porter_name'), 'passengers_handled', 0,
                                                               'commission', p_commission_per_passenger, 'extra', true, 'fee', p_extra_fee));
  end loop;

  insert into public.bookings (
    reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value,
    discount_amount, discount_value, discount_type, status_reason, flight_type, airline, flight_number, flight_date, scheduled_flight_time, contact,
    passengers, porters, status, payment_status, amount_collected, outstanding_balance, booking_channel,
    assigned_supervisor_id, assigned_supervisor_name, is_quick_sale, updated_by_id, idempotency_key)
  values (
    p_reference, pkg.code, pkg.name, pkg.price, p_count, gross + extra_total, total + extra_total,
    gross - total, gross - total, case when total < gross then 'fixed' end,
    case when total < gross then 'Desk price adjustment: ' || trim(p_override_reason) end,
    flight, fair, fno, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), ftime, coalesce(trim(p_phone), ''),
    jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), 'Walk-in'), 'contact', coalesce(trim(p_phone), ''),
                                         'nationality', '', 'total_bags', 0, 'special_requests', '')),
    porters, 'completed', 'unpaid', 0, total + extra_total, 'walk_in', p_user_id, p_user_name, true, p_user_id, p_idempotency_key)
  returning * into b;

  return public.record_payment(b.id, total + extra_total, p_method, p_user_id, p_user_name);
end $$;

revoke execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text, jsonb, numeric) to service_role;
