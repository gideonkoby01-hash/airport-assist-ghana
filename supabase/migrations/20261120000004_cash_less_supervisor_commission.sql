-- Supervisors keep their own commission (GHS 50 per meet and assist they record) out of the cash they hold. The shift report now
-- expects the cash sales less that commission, so keeping it no longer shows as a shortage. Safe to run more than once.
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
    'cash_sales', coalesce((select sum(amount) from pay where method = 'cash'), 0),
    -- The supervisor keeps their own commission out of the cash, so the cash to hand in is the cash sales less that commission.
    'cash_expected', round(coalesce((select sum(amount) from pay where method = 'cash'), 0) - sc.amt, 2),
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
