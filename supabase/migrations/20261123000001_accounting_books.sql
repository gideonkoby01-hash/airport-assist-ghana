-- Double-entry books for the accountant. Safe to run more than once.
--
--   * gl_accounts: the chart of accounts. The system accounts are used by the automatic entries; more can be added.
--   * gl_lines(): the journal. Every payment, refund, expense, porter and supervisor commission, payout and bank transfer
--     already recorded becomes a balanced entry, worked out when asked for, so the books always match the records.
--     Manual journal entries (adjustments, opening balances) are added on top and must balance.
--   * cash_transfers: money moved between accounts, for example cash taken to the bank or card takings settled.
--   * supervisor_commission_payouts: supervisor commission paid out.
--   * shift report review: the accountant accepts each shift report, or queries it with a note.
--   * closed_periods: a closed month cannot change: nothing can be recorded with a date inside it.
--   * Reports: journal, general ledger, trial balance, balance sheet, the accountant's home screen and the month list.
--
-- Basis: cash. Revenue is counted when it is received (a booking that is never paid is never revenue, so a write-off has
-- no entry); commission is counted when it is earned and owed to the person until it is paid.

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
create table if not exists public.gl_accounts (
  code text primary key check (code ~ '^[0-9]{3,6}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('asset', 'liability', 'equity', 'income', 'expense')),
  system boolean not null default false,
  expense_category text unique,
  active boolean not null default true,
  created_date timestamptz not null default now()
);

insert into public.gl_accounts (code, name, kind, system, expense_category) values
  ('1000', 'Cash on hand', 'asset', true, null),
  ('1010', 'Mobile money', 'asset', true, null),
  ('1020', 'Card takings to be settled', 'asset', true, null),
  ('1030', 'Bank', 'asset', true, null),
  ('1100', 'Corporate accounts receivable', 'asset', true, null),
  ('2000', 'Porter commission owed', 'liability', true, null),
  ('2010', 'Supervisor commission owed', 'liability', true, null),
  ('3000', 'Owner''s capital', 'equity', true, null),
  ('3100', 'Retained earnings', 'equity', true, null),
  ('4000', 'Service revenue', 'income', true, null),
  ('4010', 'Refunds', 'income', true, null),
  ('5000', 'Porter commission', 'expense', true, null),
  ('5010', 'Supervisor commission', 'expense', true, null),
  ('6000', 'Salaries', 'expense', true, 'salaries'),
  ('6010', 'Rent', 'expense', true, 'rent'),
  ('6020', 'Utilities', 'expense', true, 'utilities'),
  ('6030', 'Transport', 'expense', true, 'transport'),
  ('6040', 'Marketing', 'expense', true, 'marketing'),
  ('6050', 'Equipment', 'expense', true, 'equipment'),
  ('6060', 'Uniforms', 'expense', true, 'uniforms'),
  ('6070', 'Licences and permits', 'expense', true, 'licences'),
  ('6080', 'Supplies', 'expense', true, 'supplies'),
  ('6090', 'Other expenses', 'expense', true, 'other')
on conflict (code) do nothing;

-- Where money of each payment method sits.
create or replace function public.gl_money_account(p_method text) returns text
language sql immutable as $$
  select case p_method
    when 'cash' then '1000' when 'mobile_money' then '1010' when 'card' then '1020'
    when 'corporate_account' then '1100' when 'bank_transfer' then '1030' else '1000' end
$$;

-- ---------------------------------------------------------------------------
-- Manual journal entries
-- ---------------------------------------------------------------------------
create table if not exists public.gl_journals (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  entry_date date not null,
  memo text not null check (char_length(btrim(memo)) between 3 and 200),
  reference text check (reference is null or char_length(reference) <= 80),
  created_by_id text,
  created_by_name text,
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz
);
create table if not exists public.gl_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.gl_journals (id) on delete restrict,
  account_code text not null references public.gl_accounts (code),
  debit numeric(12, 2) not null default 0 check (debit >= 0),
  credit numeric(12, 2) not null default 0 check (credit >= 0),
  line_memo text check (line_memo is null or char_length(line_memo) <= 120),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists gl_journal_lines_journal_idx on public.gl_journal_lines (journal_id);

-- ---------------------------------------------------------------------------
-- Money moved between accounts (cash to bank, card and mobile money settlements, corporate customers paying)
-- ---------------------------------------------------------------------------
create table if not exists public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  transfer_date date not null,
  from_account text not null references public.gl_accounts (code),
  to_account text not null references public.gl_accounts (code),
  amount numeric(12, 2) not null check (amount > 0),
  reference text check (reference is null or char_length(reference) <= 80),
  note text check (note is null or char_length(note) <= 200),
  created_by_id text,
  created_by_name text,
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  check (from_account <> to_account)
);
create index if not exists cash_transfers_date_idx on public.cash_transfers (transfer_date desc);

-- ---------------------------------------------------------------------------
-- Supervisor commission paid out
-- ---------------------------------------------------------------------------
create table if not exists public.supervisor_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  pay_date date not null,
  supervisor_id text not null,
  supervisor_name text,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'mobile_money', 'bank_transfer')),
  note text check (note is null or char_length(note) <= 200),
  created_by_id text,
  created_by_name text
);
create index if not exists supervisor_commission_payouts_idx on public.supervisor_commission_payouts (supervisor_id, pay_date);

-- ---------------------------------------------------------------------------
-- Closed months
-- ---------------------------------------------------------------------------
create table if not exists public.closed_periods (
  month date primary key check (extract(day from month) = 1),
  closed_at timestamptz not null default now(),
  closed_by_id text,
  closed_by_name text,
  note text
);

create or replace function public.is_period_closed(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select p_date is not null and exists (select 1 from public.closed_periods where month = date_trunc('month', p_date)::date)
$$;

-- Nothing may be recorded, changed or voided with a date inside a closed month.
create or replace function public.period_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; new_d date; old_d date;
begin
  new_d := (to_jsonb(new) ->> col)::date;
  if tg_op = 'UPDATE' then old_d := (to_jsonb(old) ->> col)::date; end if;
  if public.is_period_closed(new_d) or public.is_period_closed(old_d) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.period_guard() from public, anon, authenticated;

do $$
declare t text[];
begin
  foreach t slice 1 in array array[['expenses', 'expense_date'], ['porter_payouts', 'pay_date'], ['supervisor_commission_payouts', 'pay_date'],
                                   ['cash_transfers', 'transfer_date'], ['gl_journals', 'entry_date']] loop
    execute format('drop trigger if exists %I on public.%I', t[1] || '_period_guard', t[1]);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.period_guard(%L)', t[1] || '_period_guard', t[1], t[2]);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Shift report review
-- ---------------------------------------------------------------------------
alter table public.shift_reports add column if not exists review_status text check (review_status in ('accepted', 'queried'));
alter table public.shift_reports add column if not exists reviewed_at timestamptz;
alter table public.shift_reports add column if not exists reviewed_by_id text;
alter table public.shift_reports add column if not exists reviewed_by_name text;
alter table public.shift_reports add column if not exists review_note text;

-- ---------------------------------------------------------------------------
-- Access: the finance roles read these tables; every change goes through the functions below.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['gl_accounts', 'gl_journals', 'gl_journal_lines', 'cash_transfers', 'supervisor_commission_payouts', 'closed_periods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_finance_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() in (''admin'', ''management'', ''accounts''))', t || '_finance_read', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

-- The name of whoever is signed in, for the records they make.
create or replace function public.current_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), email) from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- The journal: every entry, worked out from the records
-- ---------------------------------------------------------------------------
create or replace function public.gl_lines(p_from date, p_to date)
returns table (entry_date date, source text, source_id text, reference text, memo text, account_code text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  -- payments received and refunds paid back
  select (p.created_date at time zone 'UTC')::date, p.entry_type, p.id::text, p.booking_reference,
         case p.entry_type when 'payment' then 'Payment received' else 'Refund paid' end || coalesce(' (' || p.method || ')', ''),
         l.account, l.debit, l.credit
  from public.payments p
  cross join lateral (values
    (case p.entry_type when 'payment' then public.gl_money_account(p.method) else '4010' end, p.amount, 0::numeric),
    (case p.entry_type when 'payment' then '4000' else public.gl_money_account(p.method) end, 0::numeric, p.amount)
  ) as l(account, debit, credit)
  where p.entry_type in ('payment', 'refund') and (p.created_date at time zone 'UTC')::date between p_from and p_to
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

-- The journal for a period, for the finance roles.
create or replace function public.gl_journal(p_from date, p_to date)
returns table (entry_date date, source text, source_id text, reference text, memo text, account_code text, account_name text, debit numeric, credit numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  return query
  select l.entry_date, l.source, l.source_id, l.reference, l.memo, l.account_code, a.name, l.debit, l.credit
  from public.gl_lines(p_from, p_to) l left join public.gl_accounts a on a.code = l.account_code
  order by l.entry_date desc, l.source, l.source_id, l.debit desc
  limit 20000;
end $$;
revoke all on function public.gl_journal(date, date) from public, anon;
grant execute on function public.gl_journal(date, date) to authenticated;

-- Balance of every account: before the period, movements in it, and at its end. Debit-side accounts (assets, expenses)
-- show debits less credits; the others credits less debits.
create or replace function public.gl_trial_balance(p_from date, p_to date)
returns table (code text, name text, kind text, opening numeric, debit numeric, credit numeric, closing numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  return query
  with before as (select l.account_code, sum(l.debit - l.credit) as net from public.gl_lines('1900-01-01', p_from - 1) l group by 1),
       period as (select l.account_code, sum(l.debit) as dr, sum(l.credit) as cr from public.gl_lines(p_from, p_to) l group by 1)
  select a.code, a.name, a.kind,
         round(case when a.kind in ('asset', 'expense') then 1 else -1 end * coalesce(b.net, 0), 2),
         round(coalesce(p.dr, 0), 2), round(coalesce(p.cr, 0), 2),
         round(case when a.kind in ('asset', 'expense') then 1 else -1 end * (coalesce(b.net, 0) + coalesce(p.dr, 0) - coalesce(p.cr, 0)), 2)
  from public.gl_accounts a
  left join before b on b.account_code = a.code
  left join period p on p.account_code = a.code
  where a.active or b.net is not null or p.dr is not null
  order by a.code;
end $$;
revoke all on function public.gl_trial_balance(date, date) from public, anon;
grant execute on function public.gl_trial_balance(date, date) to authenticated;

-- One account's entries in a period with the running balance.
create or replace function public.gl_account_ledger(p_code text, p_from date, p_to date)
returns table (entry_date date, source text, source_id text, reference text, memo text, debit numeric, credit numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare sign int; opening numeric;
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  select case when kind in ('asset', 'expense') then 1 else -1 end into sign from public.gl_accounts where code = p_code;
  if sign is null then raise exception 'account_not_found' using errcode = 'P0001'; end if;
  select coalesce(sum(l.debit - l.credit), 0) into opening from public.gl_lines('1900-01-01', p_from - 1) l where l.account_code = p_code;
  return query
  select null::date, 'opening'::text, null::text, null::text, 'Opening balance'::text, null::numeric, null::numeric, round(sign * opening, 2)
  union all
  select x.entry_date, x.source, x.source_id, x.reference, x.memo, x.debit, x.credit,
         round(sign * (opening + sum(x.debit - x.credit) over (order by x.entry_date, x.source, x.source_id rows between unbounded preceding and current row)), 2)
  from (select * from public.gl_lines(p_from, p_to) l where l.account_code = p_code order by l.entry_date, l.source, l.source_id limit 10000) x;
end $$;
revoke all on function public.gl_account_ledger(text, date, date) from public, anon;
grant execute on function public.gl_account_ledger(text, date, date) to authenticated;

-- What the business owns and owes on a date. Profit not yet moved to retained earnings is shown as "profit to date".
create or replace function public.gl_balance_sheet(p_as_of date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_finance_role();
  if p_as_of is null then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  with bal as (
    select a.code, a.name, a.kind, round(coalesce(sum(l.debit - l.credit), 0), 2) as net
    from public.gl_accounts a left join public.gl_lines('1900-01-01', p_as_of) l on l.account_code = a.code
    group by a.code, a.name, a.kind
  ),
  rows as (
    select code, name, kind, case when kind = 'asset' then net else -net end as amount from bal where kind in ('asset', 'liability', 'equity')
  ),
  profit as (select coalesce(sum(-net), 0) as amt from bal where kind in ('income', 'expense'))
  select jsonb_build_object(
    'as_of', p_as_of,
    'assets', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', amount) order by code) from rows where kind = 'asset' and amount <> 0), '[]'::jsonb),
    'liabilities', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', amount) order by code) from rows where kind = 'liability' and amount <> 0), '[]'::jsonb),
    'equity', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', amount) order by code) from rows where kind = 'equity' and amount <> 0), '[]'::jsonb),
    'profit_to_date', (select amt from profit),
    'total_assets', coalesce((select sum(amount) from rows where kind = 'asset'), 0),
    'total_liabilities', coalesce((select sum(amount) from rows where kind = 'liability'), 0),
    'total_equity', coalesce((select sum(amount) from rows where kind = 'equity'), 0) + (select amt from profit)
  ) into result;
  return result;
end $$;
revoke all on function public.gl_balance_sheet(date) from public, anon;
grant execute on function public.gl_balance_sheet(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Recording: manual journal entries, transfers, supervisor payouts, accounts
-- ---------------------------------------------------------------------------
create or replace function public.gl_post_journal(p_date date, p_memo text, p_reference text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid; x jsonb; dr numeric := 0; cr numeric := 0; n int := 0;
begin
  perform public.require_finance_role();
  if p_date is null or p_date > current_date then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  if public.is_period_closed(p_date) then raise exception 'period_closed' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 or jsonb_array_length(p_lines) > 40 then raise exception 'invalid_lines' using errcode = 'P0001'; end if;
  for x in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from public.gl_accounts where code = x ->> 'account' and active) then raise exception 'account_not_found' using errcode = 'P0001'; end if;
    if coalesce((x ->> 'debit')::numeric, 0) < 0 or coalesce((x ->> 'credit')::numeric, 0) < 0
       or (coalesce((x ->> 'debit')::numeric, 0) > 0) = (coalesce((x ->> 'credit')::numeric, 0) > 0) then
      raise exception 'invalid_lines' using errcode = 'P0001';
    end if;
    dr := dr + round(coalesce((x ->> 'debit')::numeric, 0), 2);
    cr := cr + round(coalesce((x ->> 'credit')::numeric, 0), 2);
    n := n + 1;
  end loop;
  if dr <> cr or dr = 0 then raise exception 'not_balanced' using errcode = 'P0001'; end if;
  insert into public.gl_journals (entry_date, memo, reference, created_by_id, created_by_name)
  values (p_date, btrim(p_memo), nullif(btrim(coalesce(p_reference, '')), ''), auth.uid()::text, public.current_staff_name())
  returning id into j;
  insert into public.gl_journal_lines (journal_id, account_code, debit, credit, line_memo)
  select j, el ->> 'account', round(coalesce((el ->> 'debit')::numeric, 0), 2), round(coalesce((el ->> 'credit')::numeric, 0), 2), nullif(btrim(coalesce(el ->> 'memo', '')), '')
  from jsonb_array_elements(p_lines) el;
  return j;
end $$;
revoke all on function public.gl_post_journal(date, text, text, jsonb) from public, anon;
grant execute on function public.gl_post_journal(date, text, text, jsonb) to authenticated;

create or replace function public.gl_void_journal(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void_reason_required' using errcode = 'P0001'; end if;
  update public.gl_journals set voided = true, void_reason = btrim(p_reason), voided_at = now() where id = p_id and not voided;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.gl_void_journal(uuid, text) from public, anon;
grant execute on function public.gl_void_journal(uuid, text) to authenticated;

create or replace function public.record_cash_transfer(p_date date, p_from text, p_to text, p_amount numeric, p_reference text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  perform public.require_finance_role();
  if p_date is null or p_date > current_date then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_from = p_to or (select count(*) from public.gl_accounts where code in (p_from, p_to) and kind = 'asset' and active) <> 2 then
    raise exception 'invalid_accounts' using errcode = 'P0001';
  end if;
  insert into public.cash_transfers (transfer_date, from_account, to_account, amount, reference, note, created_by_id, created_by_name)
  values (p_date, p_from, p_to, round(p_amount, 2), nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), auth.uid()::text, public.current_staff_name())
  returning id into t;
  return t;
end $$;
revoke all on function public.record_cash_transfer(date, text, text, numeric, text, text) from public, anon;
grant execute on function public.record_cash_transfer(date, text, text, numeric, text, text) to authenticated;

create or replace function public.void_cash_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void_reason_required' using errcode = 'P0001'; end if;
  update public.cash_transfers set voided = true, void_reason = btrim(p_reason), voided_at = now() where id = p_id and not voided;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.void_cash_transfer(uuid, text) from public, anon;
grant execute on function public.void_cash_transfer(uuid, text) to authenticated;

-- What each supervisor has earned in commission, been paid, and is still owed (all time).
create or replace function public.supervisor_commission_owed()
returns table (supervisor_id text, supervisor_name text, earned numeric, paid numeric, owed numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  return query
  with e as (select b.supervisor_commission_by as sid, max(b.assigned_supervisor_name) as nm, sum(b.supervisor_commission) as amt
             from public.bookings b where b.supervisor_commission > 0 and b.supervisor_commission_by is not null group by 1),
       p as (select s.supervisor_id as sid, sum(s.amount) as amt from public.supervisor_commission_payouts s group by 1)
  select coalesce(e.sid, p.sid),
         coalesce(nullif(btrim(pr.full_name), ''), e.nm, pr.email, coalesce(e.sid, p.sid)),
         round(coalesce(e.amt, 0), 2), round(coalesce(p.amt, 0), 2), round(coalesce(e.amt, 0) - coalesce(p.amt, 0), 2)
  from e full join p on p.sid = e.sid
  left join public.profiles pr on pr.id::text = coalesce(e.sid, p.sid)
  order by 5 desc, 2;
end $$;
revoke all on function public.supervisor_commission_owed() from public, anon;
grant execute on function public.supervisor_commission_owed() to authenticated;

create or replace function public.pay_supervisor_commission(p_supervisor_id text, p_amount numeric, p_method text, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; nm text; owed numeric;
begin
  perform public.require_finance_role();
  if p_date is null or p_date > current_date then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_method not in ('cash', 'mobile_money', 'bank_transfer') then raise exception 'invalid_method' using errcode = 'P0001'; end if;
  select o.supervisor_name, o.owed into nm, owed from public.supervisor_commission_owed() o where o.supervisor_id = p_supervisor_id;
  if owed is null or round(p_amount, 2) > owed then raise exception 'more_than_owed' using errcode = 'P0001'; end if;
  insert into public.supervisor_commission_payouts (pay_date, supervisor_id, supervisor_name, amount, method, note, created_by_id, created_by_name)
  values (p_date, p_supervisor_id, nm, round(p_amount, 2), p_method, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()::text, public.current_staff_name())
  returning id into t;
  return t;
end $$;
revoke all on function public.pay_supervisor_commission(text, numeric, text, date, text) from public, anon;
grant execute on function public.pay_supervisor_commission(text, numeric, text, date, text) to authenticated;

create or replace function public.gl_add_account(p_code text, p_name text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_code !~ '^[0-9]{3,6}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if p_kind not in ('asset', 'liability', 'equity', 'income', 'expense') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.gl_accounts where code = p_code) then raise exception 'code_taken' using errcode = 'P0001'; end if;
  insert into public.gl_accounts (code, name, kind) values (p_code, btrim(p_name), p_kind);
end $$;
revoke all on function public.gl_add_account(text, text, text) from public, anon;
grant execute on function public.gl_add_account(text, text, text) to authenticated;

-- Rename an account, or switch one that is not used by the automatic entries off and on.
create or replace function public.gl_update_account(p_code text, p_name text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.gl_accounts;
begin
  perform public.require_finance_role();
  select * into a from public.gl_accounts where code = p_code;
  if not found then raise exception 'account_not_found' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if a.system and not p_active then raise exception 'system_account' using errcode = 'P0001'; end if;
  update public.gl_accounts set name = btrim(p_name), active = p_active where code = p_code;
end $$;
revoke all on function public.gl_update_account(text, text, boolean) from public, anon;
grant execute on function public.gl_update_account(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Shift reports, for the accountant to check
-- ---------------------------------------------------------------------------
create or replace function public.shift_reports_for_review(p_from date, p_to date)
returns table (id uuid, period text, shift_type text, supervisor_name text, sales numeric, supervisor_commission numeric, net numeric,
               cash_expected numeric, cash_counted numeric, variance numeric, remarks text, submitted_at timestamptz,
               review_status text, reviewed_at timestamptz, reviewed_by_name text, review_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  return query
  select s.id, s.reporting_period_start, s.shift_type, s.supervisor_name, s.grand_total_paid, s.supervisor_commission, s.net_after_commission,
         s.cash_expected, s.cash_counted, s.cash_variance, s.remarks, s.created_date,
         s.review_status, s.reviewed_at, s.reviewed_by_name, s.review_note
  from public.shift_reports s
  where public.safe_date(s.reporting_period_start) between p_from and p_to
  order by s.reporting_period_start desc, s.shift_type desc, s.supervisor_name;
end $$;
revoke all on function public.shift_reports_for_review(date, date) from public, anon;
grant execute on function public.shift_reports_for_review(date, date) to authenticated;

create or replace function public.review_shift_report(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  if p_status not in ('accepted', 'queried') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_status = 'queried' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.shift_reports set review_status = p_status, reviewed_at = now(), reviewed_by_id = auth.uid()::text,
         reviewed_by_name = public.current_staff_name(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.review_shift_report(uuid, text, text) from public, anon;
grant execute on function public.review_shift_report(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Month-end close
-- ---------------------------------------------------------------------------
-- The last twelve months: closed or open, with the month's income, costs and profit.
create or replace function public.gl_periods() returns table (month date, closed boolean, closed_at timestamptz, closed_by_name text, income numeric, costs numeric, profit numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_finance_role();
  return query
  with months as (select (date_trunc('month', current_date)::date - (n * interval '1 month'))::date as m from generate_series(0, 11) n),
       l as (select date_trunc('month', x.entry_date)::date as m, a.kind, sum(x.credit - x.debit) as net
             from public.gl_lines((date_trunc('month', current_date) - interval '11 months')::date, current_date) x
             join public.gl_accounts a on a.code = x.account_code where a.kind in ('income', 'expense') group by 1, 2)
  select months.m, cp.month is not null, cp.closed_at, cp.closed_by_name,
         round(coalesce((select l.net from l where l.m = months.m and l.kind = 'income'), 0), 2),
         round(coalesce((select -l.net from l where l.m = months.m and l.kind = 'expense'), 0), 2),
         round(coalesce((select sum(l.net) from l where l.m = months.m), 0), 2)
  from months left join public.closed_periods cp on cp.month = months.m
  order by months.m desc;
end $$;
revoke all on function public.gl_periods() from public, anon;
grant execute on function public.gl_periods() to authenticated;

create or replace function public.close_period(p_month date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform public.require_finance_role();
  if p_month is null or m >= date_trunc('month', current_date)::date then raise exception 'month_not_over' using errcode = 'P0001'; end if;
  insert into public.closed_periods (month, closed_by_id, closed_by_name, note)
  values (m, auth.uid()::text, public.current_staff_name(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (month) do nothing;
end $$;
revoke all on function public.close_period(date, text) from public, anon;
grant execute on function public.close_period(date, text) to authenticated;

-- Only an admin can open a closed month again, and must say why. It is kept in the audit log.
create or replace function public.reopen_period(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, before)
  values (auth.uid()::text, 'admin', 'REOPEN', 'closed_periods', date_trunc('month', p_month)::date::text, jsonb_build_object('reason', btrim(p_reason)));
  delete from public.closed_periods where month = date_trunc('month', p_month)::date;
end $$;
revoke all on function public.reopen_period(date, text) from public, anon;
grant execute on function public.reopen_period(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The accountant's home screen: balances and what needs doing
-- ---------------------------------------------------------------------------
create or replace function public.accounts_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb; prev date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  perform public.require_finance_role();
  with bal as (select l.account_code, round(sum(l.debit - l.credit), 2) as net from public.gl_lines('1900-01-01', current_date) l group by 1)
  select jsonb_build_object(
    'cash_on_hand', coalesce((select net from bal where account_code = '1000'), 0),
    'mobile_money', coalesce((select net from bal where account_code = '1010'), 0),
    'card_to_settle', coalesce((select net from bal where account_code = '1020'), 0),
    'bank', coalesce((select net from bal where account_code = '1030'), 0),
    'corporate_receivable', coalesce((select net from bal where account_code = '1100'), 0),
    'porters_owed', coalesce((select -net from bal where account_code = '2000'), 0),
    'supervisors_owed', coalesce((select -net from bal where account_code = '2010'), 0),
    'shift_reports_to_review', (select count(*) from public.shift_reports where review_status is null),
    'shift_reports_queried', (select count(*) from public.shift_reports where review_status = 'queried'),
    'cash_shortages_unreviewed', (select count(*) from public.shift_reports where review_status is null and coalesce(cash_variance, 0) < 0),
    'customers_owe', coalesce((select sum(outstanding_balance) from public.bookings where status <> 'cancelled' and outstanding_balance > 0.004), 0),
    'customers_overdue', (select count(*) from public.bookings where status <> 'cancelled' and outstanding_balance > 0.004
                          and public.safe_date(flight_date) < current_date - 7),
    'previous_month', prev,
    'previous_month_closed', exists (select 1 from public.closed_periods where month = prev),
    'last_closed_month', (select max(month) from public.closed_periods)
  ) into result;
  return result;
end $$;
revoke all on function public.accounts_home() from public, anon;
grant execute on function public.accounts_home() to authenticated;
