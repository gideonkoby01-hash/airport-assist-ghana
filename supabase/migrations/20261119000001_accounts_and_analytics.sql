-- Accounts (finance and accounting) and dashboard analytics. Admin and management only.
--   * expenses: what the business spends (rent, salaries, transport...). Never deleted: a wrong entry is voided with a reason.
--   * finance_summary / ledger_entries / receivables_aging / cash_book: the numbers behind the Accounts section.
--   * analytics_dashboard: the numbers behind the dashboard charts, for a date range and the range before it.
-- Basis: money in and out is by the day the payment was recorded (UTC); volumes and billed value are by flight date.
-- Safe to run more than once.

-- A flight date that is not a real date counts as no date instead of making a report fail.
create or replace function public.safe_date(p_text text) returns date
language plpgsql immutable as $$
begin
  return p_text::date;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  expense_date date not null,
  category text not null check (category in ('salaries', 'rent', 'utilities', 'transport', 'marketing', 'equipment', 'uniforms', 'licences', 'supplies', 'other')),
  description text not null check (char_length(btrim(description)) between 2 and 200),
  payee text check (payee is null or char_length(payee) <= 120),
  method text check (method in ('cash', 'mobile_money', 'card', 'bank_transfer', 'corporate_account')),
  reference text check (reference is null or char_length(reference) <= 80),
  amount numeric(12, 2) not null check (amount > 0),
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_by_id text,
  created_by_name text,
  updated_by_id text
);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);

-- Who recorded an expense comes from the signed-in person. Once saved, only the details can change, never who or when;
-- voiding needs a reason and is one-way.
create or replace function public.expenses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_id := auth.uid()::text;
    select coalesce(nullif(full_name, ''), email) into new.created_by_name from public.profiles where id = auth.uid();
    new.voided := false; new.void_reason := null; new.voided_at := null;
    return new;
  end if;
  if (new.created_by_id, new.created_by_name, new.created_date) is distinct from (old.created_by_id, old.created_by_name, old.created_date) then
    raise exception 'expense_author_is_fixed' using errcode = 'P0001';
  end if;
  if old.voided then raise exception 'expense_is_voided' using errcode = 'P0001'; end if;
  if new.voided then
    if length(btrim(coalesce(new.void_reason, ''))) < 3 then raise exception 'void_reason_required' using errcode = 'P0001'; end if;
    new.voided_at := now();
  end if;
  new.updated_by_id := auth.uid()::text;
  return new;
end $$;
drop trigger if exists expenses_guard_trg on public.expenses;
create trigger expenses_guard_trg before insert or update on public.expenses for each row execute function public.expenses_guard();

alter table public.expenses enable row level security;
drop policy if exists expenses_staff_read on public.expenses;
create policy expenses_staff_read on public.expenses for select to authenticated using (public.app_role() in ('admin', 'management'));
drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses for insert to authenticated with check (public.app_role() in ('admin', 'management'));
drop policy if exists expenses_staff_update on public.expenses;
create policy expenses_staff_update on public.expenses for update to authenticated
  using (public.app_role() in ('admin', 'management')) with check (public.app_role() in ('admin', 'management'));
drop policy if exists disabled_accounts_blocked on public.expenses;
create policy disabled_accounts_blocked on public.expenses as restrictive for all to authenticated using (public.app_role() is distinct from 'disabled');
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_date();
drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit_row();
revoke all on public.expenses from anon;
revoke delete, truncate on public.expenses from authenticated;
grant select, insert, update on public.expenses to authenticated;
grant all on public.expenses to service_role;

-- ---------------------------------------------------------------------------
-- Guard shared by the report functions below
-- ---------------------------------------------------------------------------
create or replace function public.require_finance_role() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'management') then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke execute on function public.require_finance_role() from public, anon;
grant execute on function public.require_finance_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Finance summary: money in and out, commissions, expenses and profit for a date range, by day and by month.
-- ---------------------------------------------------------------------------
create or replace function public.finance_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'invalid_range' using errcode = 'P0001'; end if;

  with pay as (
    select (p.created_date at time zone 'UTC')::date as d, p.entry_type, p.method, p.amount
    from public.payments p
    where (p.created_date at time zone 'UTC')::date between p_from and p_to
  ),
  bk as (   -- bookings by flight date, not cancelled or no-show
    select b.*, public.safe_date(b.flight_date) as fd from public.bookings b
    where public.safe_date(b.flight_date) between p_from and p_to and b.status not in ('cancelled', 'no_show')
  ),
  porter_c as (   -- commission earned by porters on completed bookings, by flight date
    select b.fd as d, coalesce(sum((e ->> 'commission')::numeric), 0) as amt
    from bk b, jsonb_array_elements(coalesce(b.porters, '[]'::jsonb)) e
    where b.status = 'completed' group by b.fd
  ),
  sup_c as (
    select (b.supervisor_commission_at at time zone 'UTC')::date as d, sum(b.supervisor_commission) as amt
    from public.bookings b
    where b.supervisor_commission > 0 and (b.supervisor_commission_at at time zone 'UTC')::date between p_from and p_to group by 1
  ),
  exp as (
    select e.expense_date as d, e.category, e.amount from public.expenses e
    where not e.voided and e.expense_date between p_from and p_to
  ),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
  daily as (
    select days.d,
           coalesce((select sum(amount) from pay where pay.d = days.d and entry_type = 'payment'), 0) as collected,
           coalesce((select sum(amount) from pay where pay.d = days.d and entry_type = 'refund'), 0) as refunds,
           coalesce((select sum(total_value) from bk where bk.fd = days.d), 0) as billed,
           coalesce((select amt from porter_c where porter_c.d = days.d), 0) as porter_commission,
           coalesce((select amt from sup_c where sup_c.d = days.d), 0) as supervisor_commission,
           coalesce((select sum(amount) from exp where exp.d = days.d), 0) as expenses
    from days
  ),
  months as (
    select (date_trunc('month', p_to)::date - (n * interval '1 month'))::date as m from generate_series(0, 11) n
  ),
  monthly as (
    select m.m as month,
      coalesce((select sum(p.amount) from public.payments p where p.entry_type = 'payment' and (p.created_date at time zone 'UTC')::date >= m.m and (p.created_date at time zone 'UTC')::date < (m.m + interval '1 month')), 0) as collected,
      coalesce((select sum(p.amount) from public.payments p where p.entry_type = 'refund' and (p.created_date at time zone 'UTC')::date >= m.m and (p.created_date at time zone 'UTC')::date < (m.m + interval '1 month')), 0) as refunds,
      coalesce((select sum((e ->> 'commission')::numeric) from public.bookings b, jsonb_array_elements(coalesce(b.porters, '[]'::jsonb)) e
                where b.status = 'completed' and public.safe_date(b.flight_date) >= m.m and public.safe_date(b.flight_date) < (m.m + interval '1 month')), 0) as porter_commission,
      coalesce((select sum(b.supervisor_commission) from public.bookings b where b.supervisor_commission > 0
                and (b.supervisor_commission_at at time zone 'UTC')::date >= m.m and (b.supervisor_commission_at at time zone 'UTC')::date < (m.m + interval '1 month')), 0) as supervisor_commission,
      coalesce((select sum(e.amount) from public.expenses e where not e.voided and e.expense_date >= m.m and e.expense_date < (m.m + interval '1 month')), 0) as expenses
    from months m
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'collected', coalesce((select sum(amount) from pay where entry_type = 'payment'), 0),
    'refunds', coalesce((select sum(amount) from pay where entry_type = 'refund'), 0),
    'write_offs', coalesce((select sum(amount) from pay where entry_type = 'write_off'), 0),
    'net_collected', coalesce((select sum(case entry_type when 'payment' then amount when 'refund' then -amount else 0 end) from pay), 0),
    'billed', coalesce((select sum(total_value) from bk), 0),
    'gross_value', coalesce((select sum(coalesce(original_total, total_value)) from bk), 0),
    'discounts', coalesce((select sum(coalesce(discount_amount, 0)) from bk), 0),
    'outstanding_in_range', coalesce((select sum(outstanding_balance) from bk), 0),
    'outstanding_now', coalesce((select sum(outstanding_balance) from public.bookings where status not in ('cancelled')), 0),
    'porter_commission', coalesce((select sum(amt) from porter_c), 0),
    'porter_paid', coalesce((select sum(amount) from public.porter_payouts where pay_date between p_from and p_to), 0),
    'supervisor_commission', coalesce((select sum(amt) from sup_c), 0),
    'expenses', coalesce((select sum(amount) from exp), 0),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'collected', collected, 'refunds', refunds, 'net', collected - refunds, 'count', cnt) order by collected - refunds desc)
      from (select method, coalesce(sum(amount) filter (where entry_type = 'payment'), 0) as collected, coalesce(sum(amount) filter (where entry_type = 'refund'), 0) as refunds,
                   count(*) filter (where entry_type in ('payment', 'refund')) as cnt
            from pay where method is not null group by method) m), '[]'::jsonb),
    'expenses_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amt) order by amt desc)
      from (select category, sum(amount) as amt from exp group by category) c), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'collected', collected, 'refunds', refunds, 'billed', billed,
        'porter_commission', porter_commission, 'supervisor_commission', supervisor_commission, 'expenses', expenses) order by d) from daily), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'collected', collected, 'refunds', refunds, 'porter_commission', porter_commission,
        'supervisor_commission', supervisor_commission, 'expenses', expenses,
        'net', collected - refunds - porter_commission - supervisor_commission - expenses) order by month) from monthly), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.finance_summary(date, date) from public, anon;
grant execute on function public.finance_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger: every payment, refund and write-off in a date range, with the booking it belongs to.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_entries(p_from date, p_to date, p_type text default null, p_method text default null)
returns table (id uuid, entry_date date, created_date timestamptz, booking_id text, reference text, customer text, package_name text,
               entry_type text, method text, amount numeric, signed_amount numeric, recorded_by text, reason text, balance_after numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  return query
  select p.id, (p.created_date at time zone 'UTC')::date, p.created_date, p.booking_id, p.booking_reference,
         coalesce(nullif(btrim(b.passengers -> 0 ->> 'name'), ''), 'Walk-in'), b.package_name,
         p.entry_type, p.method, p.amount,
         case p.entry_type when 'payment' then p.amount when 'refund' then -p.amount else 0 end,
         p.recorded_by_name, p.reason, p.balance_after
  from public.payments p left join public.bookings b on b.id::text = p.booking_id
  where (p.created_date at time zone 'UTC')::date between p_from and p_to
    and (p_type is null or p.entry_type = p_type) and (p_method is null or p.method = p_method)
  order by p.created_date desc
  limit 10000;
end $$;
revoke all on function public.ledger_entries(date, date, text, text) from public, anon;
grant execute on function public.ledger_entries(date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Receivables: what customers still owe, grouped by how long since the flight.
-- ---------------------------------------------------------------------------
create or replace function public.receivables_aging(p_as_of date default current_date)
returns table (booking_id uuid, reference text, customer text, phone text, package_name text, flight_date text, status text,
               total_value numeric, amount_collected numeric, written_off numeric, outstanding_balance numeric,
               days_since_flight integer, bucket text, supervisor text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  return query
  select b.id, b.reference, coalesce(nullif(btrim(b.passengers -> 0 ->> 'name'), ''), 'Walk-in'), b.contact, b.package_name, b.flight_date, b.status,
         b.total_value, b.amount_collected, b.written_off, b.outstanding_balance,
         (p_as_of - public.safe_date(b.flight_date))::integer,
         case when public.safe_date(b.flight_date) is null or public.safe_date(b.flight_date) > p_as_of then 'not_due'
              when p_as_of - public.safe_date(b.flight_date) <= 7 then '0-7'
              when p_as_of - public.safe_date(b.flight_date) <= 30 then '8-30'
              when p_as_of - public.safe_date(b.flight_date) <= 60 then '31-60'
              else '60+' end,
         b.assigned_supervisor_name
  from public.bookings b
  where b.status <> 'cancelled' and b.outstanding_balance > 0.004
  order by public.safe_date(b.flight_date) nulls last, b.reference
  limit 5000;
end $$;
revoke all on function public.receivables_aging(date) from public, anon;
grant execute on function public.receivables_aging(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Cash book: money in and out by day and method, and the cash each supervisor counted against what the system expected.
-- ---------------------------------------------------------------------------
create or replace function public.cash_book(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'method', method, 'in', money_in, 'out', money_out, 'entries', cnt) order by d, method)
      from (select (p.created_date at time zone 'UTC')::date as d, p.method,
                   coalesce(sum(p.amount) filter (where p.entry_type = 'payment'), 0) as money_in,
                   coalesce(sum(p.amount) filter (where p.entry_type = 'refund'), 0) as money_out, count(*) as cnt
            from public.payments p
            where p.method is not null and (p.created_date at time zone 'UTC')::date between p_from and p_to
            group by 1, 2) x), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('date', s.reporting_period_start, 'shift', s.shift_type, 'supervisor', s.supervisor_name,
        'sales', s.grand_total_paid, 'net', s.net_after_commission, 'cash_expected', s.cash_expected, 'cash_counted', s.cash_counted, 'variance', s.cash_variance)
        order by s.reporting_period_start desc, s.shift_type)
      from public.shift_reports s
      where public.safe_date(s.reporting_period_start) between p_from and p_to), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.cash_book(date, date) from public, anon;
grant execute on function public.cash_book(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard analytics
-- ---------------------------------------------------------------------------
-- Headline figures for one date range. Used for the chosen range and for the range just before it.
create or replace function public.analytics_kpis(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select x.*, public.safe_date(x.flight_date) as fd from public.bookings x where public.safe_date(x.flight_date) between p_from and p_to),
  live as (select * from b where status not in ('cancelled', 'no_show')),
  pay as (select entry_type, amount from public.payments where (created_date at time zone 'UTC')::date between p_from and p_to)
  select jsonb_build_object(
    'bookings', (select count(*) from b),
    'live_bookings', (select count(*) from live),
    'completed', (select count(*) from b where status = 'completed'),
    'cancelled', (select count(*) from b where status = 'cancelled'),
    'no_show', (select count(*) from b where status = 'no_show'),
    'passengers', (select coalesce(sum(num_passengers), 0) from live),
    'billed', (select coalesce(sum(total_value), 0) from live),
    'gross_value', (select coalesce(sum(coalesce(original_total, total_value)), 0) from live),
    'discounts', (select coalesce(sum(coalesce(discount_amount, 0)), 0) from live),
    'collected', (select coalesce(sum(case entry_type when 'payment' then amount when 'refund' then -amount else 0 end), 0) from pay),
    'refunds', (select coalesce(sum(amount), 0) from pay where entry_type = 'refund'),
    'outstanding', (select coalesce(sum(outstanding_balance), 0) from live),
    'online_bookings', (select count(*) from live where booking_channel = 'online'),
    'walk_in_bookings', (select count(*) from live where booking_channel = 'walk_in'),
    'porter_commission', (select coalesce(sum((e ->> 'commission')::numeric), 0) from live l, jsonb_array_elements(coalesce(l.porters, '[]'::jsonb)) e where l.status = 'completed'),
    'supervisor_commission', (select coalesce(sum(supervisor_commission), 0) from public.bookings
        where supervisor_commission > 0 and (supervisor_commission_at at time zone 'UTC')::date between p_from and p_to),
    'expenses', (select coalesce(sum(amount), 0) from public.expenses where not voided and expense_date between p_from and p_to),
    'new_customers', (select count(*) from public.customers where erased_at is null and (created_date at time zone 'UTC')::date between p_from and p_to),
    'bags', (select coalesce(sum(total_bags), 0) from live)
  )
$$;
revoke all on function public.analytics_kpis(date, date) from public, anon, authenticated;

create or replace function public.analytics_dashboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len integer; prev_to date; prev_from date; result jsonb;
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  len := p_to - p_from + 1;
  prev_to := p_from - 1;
  prev_from := prev_to - len + 1;

  with b as (select x.*, public.safe_date(x.flight_date) as fd from public.bookings x where public.safe_date(x.flight_date) between p_from and p_to),
  live as (select * from b where status not in ('cancelled', 'no_show')),
  pay as (select (created_date at time zone 'UTC')::date as d, entry_type, method, amount from public.payments
          where (created_date at time zone 'UTC')::date between p_from and p_to),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
  series as (
    select days.d,
      (select count(*) from live where live.fd = days.d) as bookings,
      (select coalesce(sum(num_passengers), 0) from live where live.fd = days.d) as passengers,
      (select coalesce(sum(total_value), 0) from live where live.fd = days.d) as billed,
      (select coalesce(sum(case entry_type when 'payment' then amount when 'refund' then -amount else 0 end), 0) from pay where pay.d = days.d) as collected
    from days
  ),
  rated as (
    select r.* from public.booking_ratings r where public.safe_date(r.service_date) between p_from and p_to
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'days', len, 'previous_from', prev_from, 'previous_to', prev_to),
    'current', public.analytics_kpis(p_from, p_to),
    'previous', public.analytics_kpis(prev_from, prev_to),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'bookings', bookings, 'passengers', passengers, 'billed', billed, 'collected', collected) order by d) from series), '[]'::jsonb),
    'by_package', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'bookings', n, 'passengers', pax, 'billed', billed, 'collected', collected) order by billed desc)
      from (select package_code as code, max(package_name) as name, count(*) as n, sum(num_passengers) as pax, sum(total_value) as billed, sum(amount_collected) as collected
            from live group by package_code) x), '[]'::jsonb),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object('channel', booking_channel, 'bookings', n, 'billed', billed) order by billed desc)
      from (select booking_channel, count(*) as n, sum(total_value) as billed from live group by booking_channel) x), '[]'::jsonb),
    'by_direction', coalesce((select jsonb_agg(jsonb_build_object('direction', flight_type, 'bookings', n, 'billed', billed) order by billed desc)
      from (select flight_type, count(*) as n, sum(total_value) as billed from live group by flight_type) x), '[]'::jsonb),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'net', net, 'count', n) order by net desc)
      from (select method, sum(case entry_type when 'payment' then amount when 'refund' then -amount else 0 end) as net, count(*) as n
            from pay where method is not null group by method) x), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'bookings', n) order by n desc)
      from (select status, count(*) as n from b group by status) x), '[]'::jsonb),
    'payment_status', coalesce((select jsonb_agg(jsonb_build_object('status', payment_status, 'bookings', n, 'outstanding', owed) order by n desc)
      from (select payment_status, count(*) as n, sum(outstanding_balance) as owed from live group by payment_status) x), '[]'::jsonb),
    'top_airlines', coalesce((select jsonb_agg(jsonb_build_object('airline', airline, 'bookings', n, 'passengers', pax) order by n desc)
      from (select btrim(airline) as airline, count(*) as n, sum(num_passengers) as pax from live
            where coalesce(btrim(airline), '') <> '' group by btrim(airline) order by count(*) desc limit 10) x), '[]'::jsonb),
    'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('weekday', dow, 'bookings', n, 'billed', billed) order by dow)
      from (select extract(dow from fd)::int as dow, count(*) as n, sum(total_value) as billed from live group by 1) x), '[]'::jsonb),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('weekday', dow, 'hour', hr, 'bookings', n))
      from (select extract(dow from fd)::int as dow, substr(scheduled_flight_time, 1, 2)::int as hr, count(*) as n from live
            where scheduled_flight_time ~ '^[0-2][0-9]:[0-5][0-9]$' and substr(scheduled_flight_time, 1, 2)::int < 24 group by 1, 2) x), '[]'::jsonb),
    'lead_time', jsonb_build_object(
      'average_days', (select round(avg(greatest(0, fd - (created_date at time zone 'UTC')::date))::numeric, 1) from live where booking_channel = 'online'),
      'buckets', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'bookings', n) order by ord)
        from (select case when d <= 0 then 'Same day' when d <= 2 then '1-2 days' when d <= 7 then '3-7 days' when d <= 14 then '8-14 days' else '15+ days' end as bucket,
                     min(case when d <= 0 then 1 when d <= 2 then 2 when d <= 7 then 3 when d <= 14 then 4 else 5 end) as ord, count(*) as n
              from (select fd - (created_date at time zone 'UTC')::date as d from live where booking_channel = 'online') l group by 1) x), '[]'::jsonb)),
    'party_size', coalesce((select jsonb_agg(jsonb_build_object('size', size, 'bookings', n) order by ord)
      from (select case when num_passengers >= 5 then '5+' else num_passengers::text end as size, min(num_passengers) as ord, count(*) as n from live group by 1) x), '[]'::jsonb),
    'supervisors', coalesce((select jsonb_agg(jsonb_build_object('supervisor_id', sid, 'name', name, 'bookings', n, 'completed', done, 'billed', billed, 'collected', collected,
        'outstanding', owed, 'rating', rating, 'ratings', rcount, 'commission', commission) order by billed desc)
      from (select b2.assigned_supervisor_id as sid, coalesce(max(b2.assigned_supervisor_name), 'Unassigned') as name, count(*) as n,
                   count(*) filter (where b2.status = 'completed') as done, sum(b2.total_value) as billed, sum(b2.amount_collected) as collected,
                   sum(b2.outstanding_balance) as owed,
                   (select round(avg(r.overall_rating)::numeric, 2) from rated r where r.supervisor_user_id = b2.assigned_supervisor_id) as rating,
                   (select count(*) from rated r where r.supervisor_user_id = b2.assigned_supervisor_id) as rcount,
                   coalesce(sum(b2.supervisor_commission), 0) as commission
            from live b2 group by b2.assigned_supervisor_id) x), '[]'::jsonb),
    'porters', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'jobs', jobs, 'passengers', pax, 'commission', amt) order by amt desc)
      from (select btrim(e ->> 'porter_name') as name, count(*) as jobs, sum(coalesce((e ->> 'passengers_handled')::int, 0)) as pax, sum(coalesce((e ->> 'commission')::numeric, 0)) as amt
            from live l, jsonb_array_elements(coalesce(l.porters, '[]'::jsonb)) e
            where l.status = 'completed' and coalesce(btrim(e ->> 'porter_name'), '') <> '' group by btrim(e ->> 'porter_name')) x), '[]'::jsonb),
    'top_customers', coalesce((select jsonb_agg(jsonb_build_object('customer_id', cid, 'name', name, 'bookings', n, 'billed', billed) order by billed desc)
      from (select l.customer_id as cid, coalesce(nullif(btrim(max(c.full_name)), ''), 'Walk-in customer') as name, count(*) as n, sum(l.total_value) as billed
            from live l left join public.customers c on c.id = l.customer_id and c.erased_at is null
            where l.customer_id is not null group by l.customer_id order by sum(l.total_value) desc limit 10) x), '[]'::jsonb),
    'customers', jsonb_build_object(
      'active', (select count(distinct customer_id) from live where customer_id is not null),
      'returning', (select count(*) from (select customer_id from public.bookings where customer_id in (select customer_id from live where customer_id is not null)
                    and status not in ('cancelled', 'no_show') group by customer_id having count(*) > 1) r),
      'new', (select count(*) from public.customers where erased_at is null and (created_date at time zone 'UTC')::date between p_from and p_to)),
    'nationalities', coalesce((select jsonb_agg(jsonb_build_object('nationality', nat, 'bookings', n) order by n desc)
      from (select initcap(btrim(nationality)) as nat, count(*) as n from live where coalesce(btrim(nationality), '') <> '' group by 1 order by 2 desc limit 8) x), '[]'::jsonb),
    'lounges', coalesce((select jsonb_agg(jsonb_build_object('lounge', lounge, 'bookings', n) order by n desc)
      from (select btrim(lounge_used) as lounge, count(*) as n from live where coalesce(btrim(lounge_used), '') <> '' group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'discounts', jsonb_build_object(
      'given', (select coalesce(sum(coalesce(discount_amount, 0)), 0) from live),
      'bookings', (select count(*) from live where coalesce(discount_amount, 0) > 0),
      'by_code', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'bookings', n, 'amount', amt) order by amt desc)
        from (select discount_code as code, count(*) as n, sum(discount_amount) as amt from live where coalesce(discount_amount, 0) > 0 and coalesce(discount_code, '') <> ''
              group by 1 order by 3 desc limit 6) x), '[]'::jsonb)),
    'ratings', jsonb_build_object(
      'average', (select round(avg(overall_rating)::numeric, 2) from rated),
      'count', (select count(*) from rated),
      'distribution', coalesce((select jsonb_agg(jsonb_build_object('rating', s, 'count', (select count(*) from rated where overall_rating = s)) order by s) from generate_series(1, 5) s), '[]'::jsonb)),
    'aging', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'bookings', n, 'amount', amt) order by ord)
      from (select case when public.safe_date(flight_date) is null or public.safe_date(flight_date) > p_to then 'Not yet due'
                        when p_to - public.safe_date(flight_date) <= 7 then '0-7 days' when p_to - public.safe_date(flight_date) <= 30 then '8-30 days'
                        when p_to - public.safe_date(flight_date) <= 60 then '31-60 days' else 'Over 60 days' end as bucket,
                   min(case when public.safe_date(flight_date) is null or public.safe_date(flight_date) > p_to then 0
                        when p_to - public.safe_date(flight_date) <= 7 then 1 when p_to - public.safe_date(flight_date) <= 30 then 2
                        when p_to - public.safe_date(flight_date) <= 60 then 3 else 4 end) as ord, count(*) as n, sum(outstanding_balance) as amt
            from public.bookings where status <> 'cancelled' and outstanding_balance > 0.004 group by 1) x), '[]'::jsonb)
  ) into result from (select 1) one;
  return result;
end $$;
revoke all on function public.analytics_dashboard(date, date) from public, anon;
grant execute on function public.analytics_dashboard(date, date) to authenticated;
