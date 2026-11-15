-- Audit finding F1: every sale is a booking with a ledger payment, and shift reports are built by the system
-- from that ledger. Supervisors add only the cash they counted and a remark; submitted reports are locked.

-- Shift hours (Ghana time, GMT all year). Change with:
--   update public.app_settings set value = '07:00' where key = 'shift_morning_start';
insert into public.app_settings (key, value) values ('shift_morning_start', '06:00'), ('shift_night_start', '18:00');

alter table public.bookings add column is_quick_sale boolean not null default false;

alter table public.shift_reports
  add column cash_expected numeric(12,2),
  add column cash_counted numeric(12,2),
  add column cash_variance numeric(12,2),
  add column system_generated boolean not null default false;
alter table public.shift_reports drop constraint shift_reports_porter_payment_method_check;
alter table public.shift_reports add constraint shift_reports_porter_payment_method_check
  check (porter_payment_method in ('pos', 'cash', 'momo', 'account'));
create unique index shift_reports_one_per_shift_idx on public.shift_reports (supervisor_id, reporting_period_start, shift_type);

-- Browsers can no longer create or edit reports. Admin can still delete one (so it can be filed again); that is audited.
drop policy shift_reports_insert on public.shift_reports;
drop policy shift_reports_update on public.shift_reports;

-- ---------------------------------------------------------------------------
-- Shift window: morning runs morning_start to night_start on the shift date; night runs night_start to next morning_start.
-- ---------------------------------------------------------------------------
create function public.shift_window(p_period date, p_shift text)
returns table (start_ts timestamptz, end_ts timestamptz)
language sql stable security definer set search_path = public as $$
  with s as (
    select (select value from public.app_settings where key = 'shift_morning_start')::time as m,
           (select value from public.app_settings where key = 'shift_night_start')::time as n)
  select case p_shift when 'morning' then (p_period + s.m) at time zone 'UTC' else (p_period + s.n) at time zone 'UTC' end,
         case p_shift when 'morning' then (p_period + s.n) at time zone 'UTC' else (p_period + 1 + s.m) at time zone 'UTC' end
  from s
$$;

-- What the ledger says one supervisor took in one shift. Returns the report as JSON; nothing is written.
create function public.build_shift_report(p_supervisor_id text, p_period date, p_shift text) returns jsonb
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
             'service_type', case package_code when 'full_arrival' then 'arrival' when 'full_departure' then 'full_departure' else 'departure_only' end,
             'amount_paid', amount,
             'payment_method', case method when 'mobile_money' then 'momo' when 'card' then 'pos' when 'corporate_account' then 'account' else 'cash' end)
           order by booking_id), '[]'::jsonb) as entries,
           coalesce(sum(amount), 0) as total
    from pay where package_code <> 'porter_only'
  ),
  po as (
    select count(distinct booking_id) as n, coalesce(sum(amount), 0) as amt,
           case mode() within group (order by method) when 'mobile_money' then 'momo' when 'card' then 'pos' when 'corporate_account' then 'account' when 'cash' then 'cash' end as m
    from pay where package_code = 'porter_only'
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
    'total_outstanding', 0,
    'cash_expected', coalesce((select sum(amount) from pay where method = 'cash'), 0),
    'booking_count', (select count(*) from handled),
    'total_passengers', coalesce((select sum(num_passengers) from handled), 0),
    'booking_ids', coalesce((select jsonb_agg(id) from handled), '[]'::jsonb),
    'completed', (select count(*) from moves where status = 'completed'),
    'cancellations', (select count(*) from moves where status = 'cancelled'),
    'no_shows', (select count(*) from moves where status = 'no_show')
  ) into result
  from ma, po, prj;
  return result;
end $$;

-- Files the report: totals from the ledger, cash counted by the supervisor, variance worked out here.
create function public.create_shift_report(
  p_supervisor_id text, p_supervisor_name text, p_period date, p_shift text, p_cash_counted numeric, p_remarks text
) returns public.shift_reports
language plpgsql security definer set search_path = public as $$
declare built jsonb; r public.shift_reports;
begin
  if p_cash_counted is null or p_cash_counted < 0 then raise exception 'cash_count_required' using errcode = 'P0001'; end if;
  if p_period > current_date then raise exception 'future_period' using errcode = 'P0001'; end if;
  built := public.build_shift_report(p_supervisor_id, p_period, p_shift);

  begin
    insert into public.shift_reports (
      supervisor_id, supervisor_name, shift_type, shift_date, shift_start, shift_end, reporting_period_start, reporting_period_end,
      meet_assist_entries, meet_assist_total_paid, porter_total_bookings, porter_amount_paid, porter_payment_method, porter_entries,
      porter_total_passengers, porter_total_commission, porter_count, total_commission, grand_total_paid, total_collected, total_revenue,
      total_outstanding, cash_expected, cash_counted, cash_variance, booking_count, total_passengers, booking_ids,
      completed, cancellations, no_shows, remarks, system_generated, created_by_id, updated_by_id)
    values (
      p_supervisor_id, p_supervisor_name, p_shift, built ->> 'shift_date', built ->> 'shift_start', built ->> 'shift_end',
      built ->> 'reporting_period_start', built ->> 'reporting_period_end',
      built -> 'meet_assist_entries', (built ->> 'meet_assist_total_paid')::numeric, (built ->> 'porter_total_bookings')::int,
      (built ->> 'porter_amount_paid')::numeric, built ->> 'porter_payment_method', built -> 'porter_entries',
      (built ->> 'porter_total_passengers')::int, (built ->> 'porter_total_commission')::numeric, (built ->> 'porter_count')::int,
      (built ->> 'total_commission')::numeric, (built ->> 'grand_total_paid')::numeric, (built ->> 'total_collected')::numeric,
      (built ->> 'total_revenue')::numeric, 0, (built ->> 'cash_expected')::numeric, p_cash_counted,
      round(p_cash_counted - (built ->> 'cash_expected')::numeric, 2), (built ->> 'booking_count')::int,
      (built ->> 'total_passengers')::int, built -> 'booking_ids', (built ->> 'completed')::int, (built ->> 'cancellations')::int,
      (built ->> 'no_shows')::int, left(coalesce(p_remarks, ''), 1000), true, p_supervisor_id, p_supervisor_id)
    returning * into r;
  exception when unique_violation then
    raise exception 'duplicate_report' using errcode = 'P0001';
  end;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Quick sale: a walk-in sale at the desk is a minimal booking plus its payment, created together.
-- The price comes from the package. A lower price needs a reason; a higher one is refused.
-- ---------------------------------------------------------------------------
create function public.create_quick_sale(
  p_user_id text, p_user_name text, p_reference text, p_package_code text, p_count integer, p_direction text,
  p_name text, p_phone text, p_override_amount numeric, p_override_reason text, p_method text,
  p_porter_name text, p_porter_passengers integer, p_commission_per_passenger numeric, p_idempotency_key text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare pkg public.service_packages; gross numeric; total numeric; flight text; b public.bookings; porters jsonb := '[]'::jsonb;
begin
  select * into pkg from public.service_packages where code = p_package_code and active;
  if not found then raise exception 'package_unavailable' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'invalid_count' using errcode = 'P0001'; end if;

  gross := round(pkg.price * p_count, 2);
  total := coalesce(p_override_amount, gross);
  if total <= 0 or total > gross then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if total < gross and length(trim(coalesce(p_override_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  flight := case pkg.flight_type when 'arrival' then 'arrival' when 'departure' then 'departure'
                 else case when p_direction = 'departure' then 'departure' else 'arrival' end end;
  if coalesce(trim(p_porter_name), '') <> '' then
    if p_porter_passengers is null or p_porter_passengers < 1 or p_porter_passengers > 50 then raise exception 'invalid_count' using errcode = 'P0001'; end if;
    porters := jsonb_build_array(jsonb_build_object('porter_name', trim(p_porter_name), 'passengers_handled', p_porter_passengers,
                                                    'commission', p_commission_per_passenger * p_porter_passengers));
  end if;

  insert into public.bookings (
    reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value,
    discount_amount, discount_value, discount_type, status_reason, flight_type, flight_date, contact,
    passengers, porters, status, payment_status, amount_collected, outstanding_balance, booking_channel,
    assigned_supervisor_id, assigned_supervisor_name, is_quick_sale, updated_by_id, idempotency_key)
  values (
    p_reference, pkg.code, pkg.name, pkg.price, p_count, gross, total,
    gross - total, gross - total, case when total < gross then 'fixed' end,
    case when total < gross then 'Desk price adjustment: ' || trim(p_override_reason) end,
    flight, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), coalesce(trim(p_phone), ''),
    jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), 'Walk-in'), 'contact', coalesce(trim(p_phone), ''),
                                         'nationality', '', 'total_bags', 0, 'special_requests', '')),
    porters, 'completed', 'unpaid', 0, total, 'walk_in', p_user_id, p_user_name, true, p_user_id, p_idempotency_key)
  returning * into b;

  return public.record_payment(b.id, total, p_method, p_user_id, p_user_name);
end $$;

revoke execute on function public.shift_window(date, text) from public, anon, authenticated;
revoke execute on function public.build_shift_report(text, date, text) from public, anon, authenticated;
revoke execute on function public.create_shift_report(text, text, date, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text) from public, anon, authenticated;
grant execute on function public.shift_window(date, text) to service_role;
grant execute on function public.build_shift_report(text, date, text) to service_role;
grant execute on function public.create_shift_report(text, text, date, text, numeric, text) to service_role;
grant execute on function public.create_quick_sale(text, text, text, text, integer, text, text, text, numeric, text, text, text, integer, numeric, text) to service_role;
