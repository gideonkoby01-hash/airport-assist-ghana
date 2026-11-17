-- Extra porters can no longer be added. This takes away the way to add them (the add function, and the extra-porter
-- parameters of Quick sale, which goes back to the version before extra porters). remove_extra_porter stays, so an extra
-- porter already recorded can still be taken off a booking and its fee given back.
-- Safe to run more than once.
drop function if exists public.add_extra_porter(uuid, jsonb, numeric, text);
drop function if exists public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text, jsonb, numeric);

create or replace function public.create_quick_sale(
  p_user_id text, p_user_name text, p_reference text, p_package_code text, p_count integer, p_direction text,
  p_name text, p_phone text, p_override_amount numeric, p_override_reason text, p_method text,
  p_porter_name text, p_porter_passengers integer, p_commission_per_passenger numeric, p_idempotency_key text default null,
  p_flight_number text default null, p_airline text default null, p_flight_time text default null, p_porter_id text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare pkg public.service_packages; gross numeric; total numeric; flight text; b public.bookings; porters jsonb := '[]'::jsonb;
  fno text := nullif(upper(btrim(coalesce(p_flight_number, ''))), '');
  fair text := nullif(btrim(coalesce(p_airline, '')), '');
  ftime text := nullif(btrim(coalesce(p_flight_time, '')), '');
begin
  select * into pkg from public.service_packages where code = p_package_code and active;
  if not found then raise exception 'package_unavailable' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'invalid_count' using errcode = 'P0001'; end if;
  if fno is not null and fno !~ '^[A-Z0-9][A-Z0-9 -]{1,9}$' then raise exception 'invalid_flight' using errcode = 'P0001'; end if;
  if ftime is not null and ftime !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_flight_time' using errcode = 'P0001'; end if;
  if char_length(coalesce(fair, '')) > 60 then raise exception 'invalid_flight' using errcode = 'P0001'; end if;

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

  insert into public.bookings (
    reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value,
    discount_amount, discount_value, discount_type, status_reason, flight_type, airline, flight_number, flight_date, scheduled_flight_time, contact,
    passengers, porters, status, payment_status, amount_collected, outstanding_balance, booking_channel,
    assigned_supervisor_id, assigned_supervisor_name, is_quick_sale, updated_by_id, idempotency_key)
  values (
    p_reference, pkg.code, pkg.name, pkg.price, p_count, gross, total,
    gross - total, gross - total, case when total < gross then 'fixed' end,
    case when total < gross then 'Desk price adjustment: ' || trim(p_override_reason) end,
    flight, fair, fno, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), ftime, coalesce(trim(p_phone), ''),
    jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), 'Walk-in'), 'contact', coalesce(trim(p_phone), ''),
                                         'nationality', '', 'total_bags', 0, 'special_requests', '')),
    porters, 'completed', 'unpaid', 0, total, 'walk_in', p_user_id, p_user_name, true, p_user_id, p_idempotency_key)
  returning * into b;

  return public.record_payment(b.id, total, p_method, p_user_id, p_user_name);
end $$;

revoke execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text, text, text, text, text) to service_role;
