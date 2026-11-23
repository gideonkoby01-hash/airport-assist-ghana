-- Paystack online payments (optional). A passenger can pay a booking by card or mobile money; Paystack tells the website when it
-- is paid, and the payment is recorded exactly like one taken at the airport. Run after the other migrations. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Every attempt to pay online, and how it ended
-- ---------------------------------------------------------------------------
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  booking_reference text,
  reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GHS',
  email text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'needs_review', 'resolved')),
  authorization_url text,
  channel text,
  paystack_id text,
  fees numeric(12,2),
  paid_at timestamptz,
  review_reason text,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution_note text
);
create index if not exists payment_attempts_booking_idx on public.payment_attempts (booking_id, created_date desc);
create index if not exists payment_attempts_review_idx on public.payment_attempts (status) where status = 'needs_review';

alter table public.payment_attempts enable row level security;
drop policy if exists payment_attempts_read on public.payment_attempts;
-- Finance staff can read them. Nothing writes except the server (service role bypasses RLS).
create policy payment_attempts_read on public.payment_attempts for select to authenticated
  using (public.app_role() in ('admin', 'management', 'accounts'));
revoke all on public.payment_attempts from anon, authenticated;
grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;

drop trigger if exists payment_attempts_touch on public.payment_attempts;
create trigger payment_attempts_touch before update on public.payment_attempts
  for each row execute function public.touch_updated_date();
drop trigger if exists audit_payment_attempts on public.payment_attempts;
create trigger audit_payment_attempts after insert or update or delete on public.payment_attempts
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Payments carry where they came from
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists provider text check (provider is null or provider in ('paystack')),
  add column if not exists provider_reference text,
  add column if not exists provider_fee numeric(12,2) not null default 0 check (provider_fee >= 0);
create unique index if not exists payments_provider_reference_idx on public.payments (provider_reference) where provider_reference is not null;

-- The one place that moves the money. record_payment (staff) and record_online_payment (Paystack) both use it.
create or replace function public.record_payment_internal(
  p_booking_id uuid, p_amount numeric, p_method text, p_user_id text, p_user_name text,
  p_provider text, p_provider_reference text, p_provider_fee numeric
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_method not in ('cash', 'mobile_money', 'card', 'corporate_account') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;

  update public.bookings set
    amount_collected = round(amount_collected + p_amount, 2),
    outstanding_balance = greatest(0, round(total_value - (amount_collected + p_amount) - written_off, 2)),
    payment_status = case
      when amount_collected + p_amount + written_off >= total_value then 'paid'
      when amount_collected + p_amount > 0 then 'partially_paid'
      else 'unpaid' end,
    payment_method = p_method,
    updated_by_id = p_user_id
  where id = p_booking_id
    and status not in ('cancelled', 'no_show')
    and amount_collected + p_amount + written_off <= total_value + 0.001
  returning * into b;

  if not found then
    if exists (select 1 from public.bookings where id = p_booking_id and status in ('cancelled', 'no_show')) then
      raise exception 'booking_closed' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.bookings where id = p_booking_id) then
      raise exception 'overpayment' using errcode = 'P0001';
    end if;
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  insert into public.payments (booking_id, booking_reference, amount, method, balance_after,
                               recorded_by_id, recorded_by_name, recorded_at, entry_type,
                               provider, provider_reference, provider_fee)
  values (p_booking_id::text, b.reference, p_amount, p_method, b.outstanding_balance,
          p_user_id, p_user_name, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'payment',
          p_provider, p_provider_reference, coalesce(p_provider_fee, 0));
  return b;
end $$;
revoke execute on function public.record_payment_internal(uuid, numeric, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.record_payment_internal(uuid, numeric, text, text, text, text, text, numeric) to service_role;

create or replace function public.record_payment(
  p_booking_id uuid, p_amount numeric, p_method text, p_user_id text, p_user_name text
) returns public.bookings
language sql security definer set search_path = public as $$
  select public.record_payment_internal(p_booking_id, p_amount, p_method, p_user_id, p_user_name, null, null, 0)
$$;
revoke execute on function public.record_payment(uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- A Paystack payment arrives (from the webhook, or when the passenger returns). Safe to call any number of times.
-- Returns {status}: recorded | duplicate | needs_review | unknown_reference. A payment that cannot be recorded
-- (the booking was cancelled, was paid another way meanwhile, or the amount is not what was asked for) is kept for a person to look at.
-- ---------------------------------------------------------------------------
create or replace function public.record_online_payment(
  p_reference text, p_amount numeric, p_currency text, p_channel text, p_fee numeric, p_paystack_id text, p_paid_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts; b public.bookings; m text; paid timestamptz := coalesce(p_paid_at, now());
begin
  perform pg_advisory_xact_lock(hashtext('paystack:' || p_reference));
  select * into a from public.payment_attempts where reference = p_reference for update;
  if not found then return jsonb_build_object('status', 'unknown_reference'); end if;
  if a.status = 'success' then return jsonb_build_object('status', 'duplicate', 'booking_id', a.booking_id); end if;

  if upper(coalesce(p_currency, '')) <> a.currency or abs(coalesce(p_amount, 0) - a.amount) > 0.005 then
    update public.payment_attempts set status = 'needs_review', review_reason = 'amount_mismatch', paystack_id = p_paystack_id,
           channel = p_channel, fees = p_fee, paid_at = paid where id = a.id;
    return jsonb_build_object('status', 'needs_review', 'reason', 'amount_mismatch', 'booking_id', a.booking_id, 'amount', p_amount);
  end if;

  m := case when p_channel = 'mobile_money' then 'mobile_money' else 'card' end;
  begin
    select * into b from public.record_payment_internal(a.booking_id, a.amount, m, 'paystack', 'Paystack (online)', 'paystack', p_reference, coalesce(p_fee, 0));
  exception when others then
    if sqlerrm not in ('booking_closed', 'overpayment', 'booking_not_found') then raise; end if;
    update public.payment_attempts set status = 'needs_review', review_reason = sqlerrm, paystack_id = p_paystack_id,
           channel = p_channel, fees = p_fee, paid_at = paid where id = a.id;
    return jsonb_build_object('status', 'needs_review', 'reason', sqlerrm, 'booking_id', a.booking_id, 'amount', a.amount);
  end;

  update public.payment_attempts set status = 'success', review_reason = null, paystack_id = p_paystack_id,
         channel = p_channel, fees = p_fee, paid_at = paid where id = a.id;
  return jsonb_build_object('status', 'recorded', 'booking_id', b.id, 'amount', a.amount, 'method', m,
                            'outstanding_balance', b.outstanding_balance, 'amount_collected', b.amount_collected);
end $$;
revoke execute on function public.record_online_payment(text, numeric, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_online_payment(text, numeric, text, text, numeric, text, timestamptz) to service_role;

-- A payment that failed or was abandoned (called from the verify step).
create or replace function public.fail_payment_attempt(p_reference text) returns void
language sql security definer set search_path = public as $$
  update public.payment_attempts set status = 'failed' where reference = p_reference and status = 'pending'
$$;
revoke execute on function public.fail_payment_attempt(text) from public, anon, authenticated;
grant execute on function public.fail_payment_attempt(text) to service_role;

-- Finance marks a payment that needed a look as dealt with (for example refunded in the Paystack dashboard), with a note.
create or replace function public.resolve_payment_attempt(p_reference text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.record');
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.payment_attempts set status = 'resolved', resolved_by_name = public.current_staff_name(), resolved_at = now(),
         resolution_note = btrim(p_note)
  where reference = p_reference and status = 'needs_review';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.resolve_payment_attempt(text, text) from public, anon;
grant execute on function public.resolve_payment_attempt(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The supervisor's commission when the payment came before the supervisor was assigned
-- ---------------------------------------------------------------------------
create or replace function public.apply_commission_on_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate numeric;
begin
  if new.assigned_supervisor_id is null or new.assigned_supervisor_id is not distinct from old.assigned_supervisor_id then return new; end if;
  if new.supervisor_commission > 0 or new.supervisor_commission_locked or new.status in ('cancelled', 'no_show')
     or public.is_porter_service(new.package_code) then return new; end if;
  if not exists (select 1 from public.payments p where p.booking_id = new.id::text and p.entry_type = 'payment' and p.provider is not null) then return new; end if;
  select coalesce((select nullif(value, '')::numeric from public.app_settings where key = 'supervisor_commission_per_signup'), 50) into rate;
  if rate is null or rate <= 0 then return new; end if;
  new.supervisor_commission := round(rate, 2);
  new.supervisor_commission_at := now();
  new.supervisor_commission_by := new.assigned_supervisor_id;
  return new;
end $$;
revoke execute on function public.apply_commission_on_assignment() from public, anon, authenticated;
drop trigger if exists bookings_commission_on_assignment on public.bookings;
create trigger bookings_commission_on_assignment before update of assigned_supervisor_id on public.bookings
  for each row execute function public.apply_commission_on_assignment();

-- ---------------------------------------------------------------------------
-- The books: online payments are held by the gateway until it settles to the bank
-- ---------------------------------------------------------------------------
insert into public.gl_accounts (code, name, kind, system, expense_category) values
  ('6095', 'Payment gateway fees', 'expense', true, null)
on conflict (code) do nothing;
update public.gl_accounts set name = 'Card and online takings to be settled' where code = '1020' and name = 'Card takings to be settled';

-- Where a payment's money sits: online payments go to the settlement account whatever the method, others by method.
create or replace function public.gl_payment_account(p_method text, p_provider text) returns text
language sql immutable as $$
  select case when p_provider is not null then '1020' else public.gl_money_account(p_method) end
$$;

create or replace function public.gl_lines(p_from date, p_to date)
returns table (entry_date date, source text, source_id text, reference text, memo text, account_code text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  -- payments received and refunds paid back
  select (p.created_date at time zone 'UTC')::date, p.entry_type, p.id::text, p.booking_reference,
         case p.entry_type when 'payment' then 'Payment received' else 'Refund paid' end || coalesce(' (' || p.method || ')', ''),
         l.account, l.debit, l.credit
  from public.payments p
  cross join lateral (values
    (case p.entry_type when 'payment' then public.gl_payment_account(p.method, p.provider) else '4010' end, p.amount, 0::numeric),
    (case p.entry_type when 'payment' then '4000' else public.gl_payment_account(p.method, p.provider) end, 0::numeric, p.amount)
  ) as l(account, debit, credit)
  where p.entry_type in ('payment', 'refund') and (p.created_date at time zone 'UTC')::date between p_from and p_to
  union all
  -- what the payment gateway keeps from an online payment (taken off what will be settled to the bank)
  select (p.created_date at time zone 'UTC')::date, 'gateway_fee', p.id::text, p.booking_reference,
         'Payment gateway fee (' || coalesce(p.provider, 'online') || ')', l.account, l.debit, l.credit
  from public.payments p
  cross join lateral (values ('6095', p.provider_fee, 0::numeric), ('1020', 0::numeric, p.provider_fee)) as l(account, debit, credit)
  where p.entry_type = 'payment' and p.provider is not null and p.provider_fee > 0
    and (p.created_date at time zone 'UTC')::date between p_from and p_to
  union all
  -- expenses
  select e.expense_date, 'expense', e.id::text, e.reference, e.description, l.account, l.debit, l.credit
  from public.expenses e
  cross join lateral (values
    (coalesce((select a.code from public.gl_accounts a where a.expense_category = e.category), '6090'), e.amount, 0::numeric),
    (public.gl_money_account(coalesce(e.method, 'cash')), 0::numeric, e.amount)
  ) as l(account, debit, credit)
  where not e.voided and e.expense_date between p_from and p_to
  union all
  -- porter commission earned on completed bookings, on the flight date
  select x.d, 'porter_commission', x.id, x.reference, 'Porter commission earned', l.account, l.debit, l.credit
  from (select b.id::text as id, b.reference, public.safe_date(b.flight_date) as d, sum(coalesce((e ->> 'commission')::numeric, 0)) as amt
        from public.bookings b, jsonb_array_elements(coalesce(b.porters, '[]'::jsonb)) e
        where b.status = 'completed' and public.safe_date(b.flight_date) between p_from and p_to
          and coalesce(btrim(e ->> 'porter_name'), '') <> ''
        group by b.id, b.reference, b.flight_date) x
  cross join lateral (values ('5000', x.amt, 0::numeric), ('2000', 0::numeric, x.amt)) as l(account, debit, credit)
  where x.amt > 0
  union all
  -- porters paid (in cash)
  select pp.pay_date, 'porter_payout', pp.id::text, null, 'Porter paid: ' || pp.porter_name, l.account, l.debit, l.credit
  from public.porter_payouts pp
  cross join lateral (values ('2000', pp.amount, 0::numeric), ('1000', 0::numeric, pp.amount)) as l(account, debit, credit)
  where pp.pay_date between p_from and p_to
  union all
  -- supervisor commission earned
  select (b.supervisor_commission_at at time zone 'UTC')::date, 'supervisor_commission', b.id::text, b.reference,
         'Supervisor commission: ' || coalesce(b.assigned_supervisor_name, ''), l.account, l.debit, l.credit
  from public.bookings b
  cross join lateral (values ('5010', b.supervisor_commission, 0::numeric), ('2010', 0::numeric, b.supervisor_commission)) as l(account, debit, credit)
  where b.supervisor_commission > 0 and (b.supervisor_commission_at at time zone 'UTC')::date between p_from and p_to
  union all
  -- supervisor commission paid
  select s.pay_date, 'supervisor_payout', s.id::text, null, 'Supervisor commission paid: ' || coalesce(s.supervisor_name, ''), l.account, l.debit, l.credit
  from public.supervisor_commission_payouts s
  cross join lateral (values ('2010', s.amount, 0::numeric), (public.gl_money_account(s.method), 0::numeric, s.amount)) as l(account, debit, credit)
  where s.pay_date between p_from and p_to
  union all
  -- money moved between accounts
  select t.transfer_date, 'transfer', t.id::text, t.reference, coalesce(nullif(t.note, ''), 'Transfer'), l.account, l.debit, l.credit
  from public.cash_transfers t
  cross join lateral (values (t.to_account, t.amount, 0::numeric), (t.from_account, 0::numeric, t.amount)) as l(account, debit, credit)
  where not t.voided and t.transfer_date between p_from and p_to
  union all
  -- manual journal entries
  select j.entry_date, 'journal', j.id::text, j.reference, coalesce(nullif(jl.line_memo, ''), j.memo), jl.account_code, jl.debit, jl.credit
  from public.gl_journals j join public.gl_journal_lines jl on jl.journal_id = j.id
  where not j.voided and j.entry_date between p_from and p_to
$$;
revoke all on function public.gl_lines(date, date) from public, anon, authenticated;

