-- Shift reports show sales minus porter commission, and cannot be filed while a service sold at the desk has no porter
-- on it. (Website bookings are assigned by management, so they are listed but do not hold up the report.)
alter table public.shift_reports add column net_after_commission numeric(12,2);
-- Older reports: sales less the commission recorded on them.
update public.shift_reports set net_after_commission = round(coalesce(grand_total_paid, total_revenue, 0) - coalesce(porter_total_commission, total_commission, 0), 2)
where net_after_commission is null;

-- What the ledger says one supervisor took in one shift. Returns the report as JSON; nothing is written.
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
  porter_gaps as (  -- services in this shift that have no porter on them (every service needs one)
    select count(*) filter (where booking_channel = 'walk_in') as desk, count(*) filter (where booking_channel is distinct from 'walk_in') as website
    from handled where jsonb_array_length(coalesce(porters, '[]'::jsonb)) = 0
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
    'net_after_commission', round(ma.total + po.amt - prj.comm, 2),
    'porters_missing', pg.desk,
    'porters_missing_refs', coalesce((select jsonb_agg(reference order by reference) from handled
      where booking_channel = 'walk_in' and jsonb_array_length(coalesce(porters, '[]'::jsonb)) = 0), '[]'::jsonb),
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
  from ma, po, prj, porter_gaps pg;
  return result;
end $$;

-- Files the report: totals from the ledger, cash counted by the supervisor, variance worked out here.
create or replace function public.create_shift_report(
  p_supervisor_id text, p_supervisor_name text, p_period date, p_shift text, p_cash_counted numeric, p_remarks text
) returns public.shift_reports
language plpgsql security definer set search_path = public as $$
declare built jsonb; r public.shift_reports;
begin
  if p_cash_counted is null or p_cash_counted < 0 then raise exception 'cash_count_required' using errcode = 'P0001'; end if;
  if p_period > current_date then raise exception 'future_period' using errcode = 'P0001'; end if;
  built := public.build_shift_report(p_supervisor_id, p_period, p_shift);
  -- Every service the supervisor sold at the desk needs a porter on it, so the commission can be taken off the sales.
  if (built ->> 'porters_missing')::int > 0 then raise exception 'porter_missing' using errcode = 'P0001'; end if;

  begin
    insert into public.shift_reports (
      supervisor_id, supervisor_name, shift_type, shift_date, shift_start, shift_end, reporting_period_start, reporting_period_end,
      meet_assist_entries, meet_assist_total_paid, porter_total_bookings, porter_amount_paid, porter_payment_method, porter_entries,
      porter_total_passengers, porter_total_commission, porter_count, total_commission, grand_total_paid, total_collected, total_revenue,
      total_outstanding, net_after_commission, cash_expected, cash_counted, cash_variance, booking_count, total_passengers, booking_ids,
      completed, cancellations, no_shows, remarks, system_generated, created_by_id, updated_by_id)
    values (
      p_supervisor_id, p_supervisor_name, p_shift, built ->> 'shift_date', built ->> 'shift_start', built ->> 'shift_end',
      built ->> 'reporting_period_start', built ->> 'reporting_period_end',
      built -> 'meet_assist_entries', (built ->> 'meet_assist_total_paid')::numeric, (built ->> 'porter_total_bookings')::int,
      (built ->> 'porter_amount_paid')::numeric, built ->> 'porter_payment_method', built -> 'porter_entries',
      (built ->> 'porter_total_passengers')::int, (built ->> 'porter_total_commission')::numeric, (built ->> 'porter_count')::int,
      (built ->> 'total_commission')::numeric, (built ->> 'grand_total_paid')::numeric, (built ->> 'total_collected')::numeric,
      (built ->> 'total_revenue')::numeric, 0, (built ->> 'net_after_commission')::numeric, (built ->> 'cash_expected')::numeric, p_cash_counted,
      round(p_cash_counted - (built ->> 'cash_expected')::numeric, 2), (built ->> 'booking_count')::int,
      (built ->> 'total_passengers')::int, built -> 'booking_ids', (built ->> 'completed')::int, (built ->> 'cancellations')::int,
      (built ->> 'no_shows')::int, left(coalesce(p_remarks, ''), 1000), true, p_supervisor_id, p_supervisor_id)
    returning * into r;
  exception when unique_violation then
    raise exception 'duplicate_report' using errcode = 'P0001';
  end;
  return r;
end $$;

