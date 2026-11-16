-- 1. Quick sale records the flight (number, airline, scheduled time) and a registered porter.
-- 2. Porter pay: what each porter earned on a day (GHS 30 per passenger handled, from completed bookings) and a
--    record of what was paid to them, so each day is settled once and a late job adds only the difference.

-- ---------------------------------------------------------------------------
-- Quick sale with flight details and a porter from the register
-- ---------------------------------------------------------------------------
drop function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text);

create function public.create_quick_sale(
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

-- ---------------------------------------------------------------------------
-- Porter pay
-- ---------------------------------------------------------------------------
create table public.porter_payouts (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  porter_key text not null,          -- the porter's id from the register, or their lower-cased name for older entries
  porter_name text not null,
  pay_date date not null,            -- the day the work was done
  passengers integer not null check (passengers >= 0),
  amount numeric(12,2) not null check (amount > 0),
  paid_by_id text,
  paid_by_name text
);
create index porter_payouts_day_idx on public.porter_payouts (pay_date, porter_key);

alter table public.porter_payouts enable row level security;
create policy porter_payouts_staff_read on public.porter_payouts for select to authenticated
  using (public.app_role() in ('admin', 'management'));
create policy disabled_accounts_blocked on public.porter_payouts as restrictive for all to authenticated
  using (public.app_role() is distinct from 'disabled');
create trigger porter_payouts_touch before update on public.porter_payouts for each row execute function public.touch_updated_date();
create trigger audit_porter_payouts after insert or update or delete on public.porter_payouts for each row execute function public.audit_row();
revoke all on public.porter_payouts from anon;
revoke insert, update, delete, truncate on public.porter_payouts from authenticated;
grant select on public.porter_payouts to authenticated;
grant all on public.porter_payouts to service_role;

-- What each porter earned on a day, and what has been paid. A job counts once its booking is completed; cancelled and
-- no-show bookings earn nothing. The commission stored on the booking at assignment time is used, so changing the rate
-- later never rewrites what was already earned.
create function public.porter_earnings(p_date date) returns table (
  porter_key text, porter_name text, jobs integer, passengers integer, earned numeric, paid numeric, balance numeric,
  last_paid_at timestamptz, bookings jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'management') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with work as (
    select coalesce(nullif(e ->> 'porter_id', ''), lower(btrim(e ->> 'porter_name'))) as k,
           btrim(e ->> 'porter_name') as nm,
           b.reference as ref,
           coalesce((e ->> 'passengers_handled')::integer, 0) as pax,
           coalesce((e ->> 'commission')::numeric, 0) as pay
    from public.bookings b, jsonb_array_elements(b.porters) e
    where b.flight_date = to_char(p_date, 'YYYY-MM-DD') and b.status = 'completed'
      and coalesce(btrim(e ->> 'porter_name'), '') <> ''
  ), earned as (
    select w.k, max(w.nm) as nm, count(*)::integer as jobs, sum(w.pax)::integer as pax, sum(w.pay) as pay,
           jsonb_agg(jsonb_build_object('reference', w.ref, 'passengers', w.pax, 'amount', w.pay) order by w.ref) as refs
    from work w group by w.k
  ), given as (
    select p.porter_key as k, sum(p.amount) as paid, max(p.created_date) as last_at
    from public.porter_payouts p where p.pay_date = p_date group by p.porter_key
  )
  select e.k, e.nm, e.jobs, e.pax, round(e.pay, 2), round(coalesce(g.paid, 0), 2), round(e.pay - coalesce(g.paid, 0), 2), g.last_at, e.refs
  from earned e left join given g on g.k = e.k
  order by e.nm;
end $$;

-- Pays a porter what is still owed for a day. Two people pressing the button together cannot pay twice.
create function public.pay_porter(p_porter_key text, p_date date) returns public.porter_payouts
language plpgsql security definer set search_path = public as $$
declare r record; row public.porter_payouts; payer text;
begin
  if public.app_role() not in ('admin', 'management') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('porter_pay:' || p_porter_key || ':' || p_date::text));
  select * into r from public.porter_earnings(p_date) e where e.porter_key = p_porter_key;
  if not found or r.balance <= 0 then raise exception 'nothing_due' using errcode = 'P0001'; end if;
  select coalesce(nullif(full_name, ''), email) into payer from public.profiles where id = auth.uid();
  insert into public.porter_payouts (porter_key, porter_name, pay_date, passengers, amount, paid_by_id, paid_by_name)
  values (r.porter_key, r.porter_name, p_date, r.passengers, r.balance, auth.uid()::text, payer)
  returning * into row;
  return row;
end $$;

revoke all on function public.porter_earnings(date) from public, anon;
revoke all on function public.pay_porter(text, date) from public, anon;
grant execute on function public.porter_earnings(date) to authenticated;
grant execute on function public.pay_porter(text, date) to authenticated;
