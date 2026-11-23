-- Admin can add more services (packages), not only edit the four that came with the system.
--
--   * kind: what a service is. "meet_assist" (the default) works like Full Arrival, Full Departure and Departure Priority:
--     a porter is optional and the supervisor earns the meet and assist commission. "porter" works like Porter Service Only:
--     a porter is always needed for each passenger and there is no supervisor commission.
--   * description: an optional one-line summary shown on the home page and booking page.
--   * The list of four fixed service codes is lifted from services, bookings and ratings. A code is 2 to 40 lower-case letters,
--     digits or underscores, and can never be changed once a service exists (bookings point at it).
--   * A meet and assist service runs in one direction (arrival or departure); only a porter service can work in both directions.
--   * Rules that were tied to the name "porter_only" now follow the service's kind, and the shift report groups a service
--     by its direction and lounge setting instead of by its code. For the four existing services nothing changes.
-- Safe to run more than once.

alter table public.service_packages add column if not exists kind text not null default 'meet_assist';
alter table public.service_packages add column if not exists description text;
alter table public.service_packages drop constraint if exists service_packages_kind_check;
alter table public.service_packages add constraint service_packages_kind_check check (kind in ('meet_assist', 'porter'));
alter table public.service_packages drop constraint if exists service_packages_description_check;
alter table public.service_packages add constraint service_packages_description_check check (description is null or char_length(description) <= 200);
update public.service_packages set kind = 'porter' where code = 'porter_only' and kind <> 'porter';

-- Lift the fixed list of four codes (whatever the constraints are called).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.service_packages'::regclass, 'public.bookings'::regclass, 'public.booking_ratings'::regclass)
      and pg_get_constraintdef(c.oid) like '%full_arrival%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.service_packages drop constraint if exists service_packages_code_format;
alter table public.service_packages add constraint service_packages_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$');
alter table public.bookings drop constraint if exists bookings_package_code_format;
alter table public.bookings add constraint bookings_package_code_format check (package_code ~ '^[a-z][a-z0-9_]{1,39}$');
alter table public.booking_ratings drop constraint if exists booking_ratings_package_code_format;
alter table public.booking_ratings add constraint booking_ratings_package_code_format check (package_code is null or package_code ~ '^[a-z][a-z0-9_]{1,39}$');
alter table public.service_packages drop constraint if exists service_packages_kind_direction;
alter table public.service_packages add constraint service_packages_kind_direction check (kind = 'porter' or flight_type is distinct from 'both');

-- A service's code is what bookings point at, so it never changes.
create or replace function public.service_package_code_fixed() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code then raise exception 'service_code_is_fixed' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists service_packages_code_fixed on public.service_packages;
create trigger service_packages_code_fixed before update on public.service_packages
  for each row execute function public.service_package_code_fixed();

-- Porter Service Only is always a porter-type service, however it was inserted.
create or replace function public.service_package_normalize() returns trigger
language plpgsql as $$
begin
  if new.code = 'porter_only' then new.kind := 'porter'; end if;
  return new;
end $$;
drop trigger if exists service_packages_normalize on public.service_packages;
create trigger service_packages_normalize before insert or update on public.service_packages
  for each row execute function public.service_package_normalize();

-- Is this a porter-type service? A code with no service record falls back to the original rule.
create or replace function public.is_porter_service(p_code text) returns boolean
language sql stable as $$
  select coalesce((select s.kind = 'porter' from public.service_packages s where s.code = p_code), p_code = 'porter_only')
$$;

-- How the shift report groups a service: Arrival, Full Departure (departure with the lounge) or Departure Only.
create or replace function public.report_service_type(p_code text) returns text
language sql stable as $$
  select case
    when s.code is null then case p_code when 'full_arrival' then 'arrival' when 'full_departure' then 'full_departure' else 'departure_only' end
    when s.flight_type = 'arrival' then 'arrival'
    when s.flight_type = 'departure' and coalesce(s.includes_lounge, false) then 'full_departure'
    else 'departure_only'
  end
  from (select 1) one left join public.service_packages s on s.code = p_code
$$;

-- The functions that had the name "porter_only" written into them, now following the service's kind.

create or replace function public.create_quick_sale(
  p_user_id text, p_user_name text, p_reference text, p_package_code text, p_count integer, p_direction text,
  p_name text, p_phone text, p_override_amount numeric, p_override_reason text, p_method text,
  p_porter_name text, p_porter_passengers integer, p_commission_per_passenger numeric, p_idempotency_key text default null,
  p_flight_number text default null, p_airline text default null, p_flight_time text default null, p_porter_id text default null,
  p_more_porters jsonb default '[]'::jsonb, p_porters_waived integer default 0
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare waived integer := coalesce(p_porters_waived, 0); more jsonb := coalesce(p_more_porters, '[]'::jsonb); credited integer := 0; x jsonb; pkg public.service_packages; gross numeric; total numeric; flight text; b public.bookings; porters jsonb := '[]'::jsonb;
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

  -- Only a meet and assist can go without a porter, and a passenger cannot both have one and need none.
  if waived < 0 or waived > p_count or (waived > 0 and public.is_porter_service(pkg.code)) then raise exception 'invalid_porters_waived' using errcode = 'P0001'; end if;

  flight := case pkg.flight_type when 'arrival' then 'arrival' when 'departure' then 'departure'
                 else case when p_direction = 'departure' then 'departure' else 'arrival' end end;
  if coalesce(trim(p_porter_name), '') <> '' then
    -- A porter cannot be credited with more passengers than were sold.
    if p_porter_passengers is null or p_porter_passengers < 1 or p_porter_passengers > p_count then raise exception 'invalid_porter_passengers' using errcode = 'P0001'; end if;
    porters := jsonb_build_array(jsonb_build_object('porter_id', nullif(btrim(coalesce(p_porter_id, '')), ''), 'porter_name', trim(p_porter_name),
                                                    'passengers_handled', p_porter_passengers,
                                                    'commission', p_commission_per_passenger * p_porter_passengers));
    credited := p_porter_passengers;
  end if;
  -- One porter handles one passenger: each further porter takes one passenger and earns the commission rate once.
  if jsonb_typeof(more) <> 'array' then raise exception 'invalid_porters' using errcode = 'P0001'; end if;
  for x in select * from jsonb_array_elements(more) loop
    if coalesce(trim(x ->> 'porter_name'), '') = '' then raise exception 'invalid_porters' using errcode = 'P0001'; end if;
    credited := credited + 1;
    if credited + waived > p_count then raise exception 'invalid_porter_passengers' using errcode = 'P0001'; end if;
    porters := porters || jsonb_build_array(jsonb_build_object('porter_id', nullif(btrim(coalesce(x ->> 'porter_id', '')), ''), 'porter_name', trim(x ->> 'porter_name'),
                                                               'passengers_handled', 1, 'commission', p_commission_per_passenger));
  end loop;

  if credited + waived > p_count then raise exception 'invalid_porter_passengers' using errcode = 'P0001'; end if;

  insert into public.bookings (
    reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value,
    discount_amount, discount_value, discount_type, status_reason, flight_type, airline, flight_number, flight_date, scheduled_flight_time, contact,
    passengers, porters, status, payment_status, amount_collected, outstanding_balance, booking_channel,
    assigned_supervisor_id, assigned_supervisor_name, is_quick_sale, updated_by_id, idempotency_key, porters_waived)
  values (
    p_reference, pkg.code, pkg.name, pkg.price, p_count, gross, total,
    gross - total, gross - total, case when total < gross then 'fixed' end,
    case when total < gross then 'Desk price adjustment: ' || trim(p_override_reason) end,
    flight, fair, fno, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), ftime, coalesce(trim(p_phone), ''),
    jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), 'Walk-in'), 'contact', coalesce(trim(p_phone), ''),
                                         'nationality', '', 'total_bags', 0, 'special_requests', '')),
    porters, 'completed', 'unpaid', 0, total, 'walk_in', p_user_id, p_user_name, true, p_user_id, p_idempotency_key, waived)
  returning * into b;

  return public.record_payment(b.id, total, p_method, p_user_id, p_user_name);
end $$;

create or replace function public.build_shift_report(p_supervisor_id text, p_period date, p_shift text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w_start timestamptz; w_end timestamptz; result jsonb;
begin
  if p_shift not in ('morning', 'night') then raise exception 'invalid_shift' using errcode = 'P0001'; end if;
  select start_ts, end_ts into w_start, w_end from public.shift_window(p_period, p_shift);

  with pay as (
    select p.amount, p.method, b.id as booking_id, b.package_code, b.num_passengers
    from public.payments p join public.bookings b on b.id::text = p.booking_id
    where p.recorded_by_id = p_supervisor_id and p.entry_type = 'payment'
      and p.created_date >= w_start and p.created_date < w_end
  ),
  first_pay as (  -- a booking belongs to the shift in which this supervisor took its first payment
    select distinct on (p.booking_id) p.booking_id, p.recorded_by_id, p.created_date
    from public.payments p where p.entry_type = 'payment' order by p.booking_id, p.created_date
  ),
  handled as (
    select b.* from public.bookings b join first_pay f on f.booking_id = b.id::text
    where f.recorded_by_id = p_supervisor_id and f.created_date >= w_start and f.created_date < w_end
  ),
  ma as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'service_type', public.report_service_type(package_code),
             'amount_paid', amount,
             'payment_method', case method when 'mobile_money' then 'momo' when 'card' then 'pos' when 'corporate_account' then 'account' else 'cash' end)
           order by booking_id), '[]'::jsonb) as entries,
           coalesce(sum(amount), 0) as total
    from pay where not public.is_porter_service(package_code)
  ),
  po as (
    select count(distinct booking_id) as n, coalesce(sum(amount), 0) as amt,
           case mode() within group (order by method) when 'mobile_money' then 'momo' when 'card' then 'pos' when 'corporate_account' then 'account' when 'cash' then 'cash' end as m
    from pay where public.is_porter_service(package_code)
  ),
  pr as (
    select e ->> 'porter_name' as name, sum((e ->> 'passengers_handled')::int) as pax, sum((e ->> 'commission')::numeric) as comm
    from handled h, jsonb_array_elements(h.porters) e group by 1
  ),
  prj as (
    select coalesce(jsonb_agg(jsonb_build_object('porter_id', '', 'porter_name', name, 'porter_phone', '', 'passengers_handled', pax, 'commission', comm) order by name), '[]'::jsonb) as entries,
           coalesce(sum(pax), 0) as pax, coalesce(sum(comm), 0) as comm
    from pr
  ),
  porter_gaps as (  -- services in this shift without a porter for every passenger (one porter handles one passenger; a meet and assist may need none)
    select count(*) filter (where booking_channel = 'walk_in') as desk, count(*) filter (where booking_channel is distinct from 'walk_in') as website
    from handled where coalesce((select sum(coalesce((e ->> 'passengers_handled')::int, 0)) from jsonb_array_elements(coalesce(porters, '[]'::jsonb)) e), 0) < num_passengers - coalesce(porters_waived, 0)
  ),
  sc as (  -- commission this supervisor marked during the shift: taken off the day's takings like the porters' commission
    select coalesce(sum(b.supervisor_commission), 0) as amt, count(*) as n
    from public.bookings b
    where b.supervisor_commission_by = p_supervisor_id and b.supervisor_commission > 0
      and b.supervisor_commission_at >= w_start and b.supervisor_commission_at < w_end
  ),
  moves as (  -- status changes this supervisor made in the window
    select after ->> 'status' as status from public.audit_log
    where table_name = 'bookings' and actor_id = p_supervisor_id and at >= w_start and at < w_end
      and ((action = 'UPDATE' and before ->> 'status' is distinct from after ->> 'status') or action = 'INSERT')
  )
  select jsonb_build_object(
    'supervisor_id', p_supervisor_id,
    'shift_type', p_shift,
    'shift_date', p_period::text,
    'reporting_period_start', p_period::text,
    'reporting_period_end', (w_end at time zone 'UTC')::date::text,
    'shift_start', to_char(w_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
    'shift_end', to_char(w_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
    'meet_assist_entries', ma.entries,
    'meet_assist_total_paid', ma.total,
    'porter_total_bookings', po.n,
    'porter_amount_paid', po.amt,
    'porter_payment_method', po.m,
    'porter_entries', prj.entries,
    'porter_total_passengers', prj.pax,
    'porter_total_commission', prj.comm,
    'porter_count', (select count(*) from pr),
    'total_commission', prj.comm,
    'grand_total_paid', ma.total + po.amt,
    'total_collected', ma.total + po.amt,
    'total_revenue', ma.total + po.amt,
    'supervisor_commission', sc.amt,
    'supervisor_commission_count', sc.n,
    'net_after_commission', round(ma.total + po.amt - prj.comm - sc.amt, 2),
    'porters_missing', pg.desk,
    'porters_missing_refs', coalesce((select jsonb_agg(reference order by reference) from handled
      where booking_channel = 'walk_in' and coalesce((select sum(coalesce((e ->> 'passengers_handled')::int, 0)) from jsonb_array_elements(coalesce(porters, '[]'::jsonb)) e), 0) < num_passengers - coalesce(porters_waived, 0)), '[]'::jsonb),
    'porters_awaiting_management', pg.website,
    'total_outstanding', 0,
    'cash_expected', coalesce((select sum(amount) from pay where method = 'cash'), 0),
    'booking_count', (select count(*) from handled),
    'total_passengers', coalesce((select sum(num_passengers) from handled), 0),
    'booking_ids', coalesce((select jsonb_agg(id) from handled), '[]'::jsonb),
    'completed', (select count(*) from moves where status = 'completed'),
    'cancellations', (select count(*) from moves where status = 'cancelled'),
    'no_shows', (select count(*) from moves where status = 'no_show')
  ) into result
  from ma, po, prj, porter_gaps pg, sc;
  return result;
end $$;

create or replace function public.set_supervisor_commission(p_booking_id uuid, p_paid boolean, p_amount numeric, p_user_id text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  if public.is_porter_service(b.package_code) then raise exception 'not_meet_assist' using errcode = 'P0001'; end if;
  if b.status in ('cancelled', 'no_show') then raise exception 'booking_closed' using errcode = 'P0001'; end if;
  if b.assigned_supervisor_id is null then raise exception 'no_supervisor' using errcode = 'P0001'; end if;
  if b.supervisor_commission_locked then raise exception 'report_filed' using errcode = 'P0001'; end if;

  if p_paid then
    if p_amount is null or p_amount < 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
    update public.bookings set supervisor_commission = round(p_amount, 2), supervisor_commission_at = now(),
           supervisor_commission_by = b.assigned_supervisor_id, updated_by_id = p_user_id
    where id = p_booking_id returning * into b;
  else
    update public.bookings set supervisor_commission = 0, supervisor_commission_at = null, supervisor_commission_by = null, updated_by_id = p_user_id
    where id = p_booking_id returning * into b;
  end if;
  return b;
end $$;

create or replace function public.apply_supervisor_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bookings; who text; rate numeric;
begin
  if new.entry_type is distinct from 'payment' then return new; end if;
  select * into b from public.bookings where id::text = new.booking_id for update;
  if not found or public.is_porter_service(b.package_code) or b.status in ('cancelled', 'no_show')
     or b.supervisor_commission > 0 or b.supervisor_commission_locked then return new; end if;
  who := coalesce(b.assigned_supervisor_id,
                  (select p.id::text from public.profiles p where p.id::text = new.recorded_by_id and p.role = 'supervisor'));
  if who is null then return new; end if;
  select coalesce((select nullif(value, '')::numeric from public.app_settings where key = 'supervisor_commission_per_signup'), 50) into rate;
  if rate is null or rate <= 0 then return new; end if;
  update public.bookings set supervisor_commission = round(rate, 2), supervisor_commission_at = new.created_date, supervisor_commission_by = who
  where id = b.id;
  return new;
end $$;
