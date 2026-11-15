-- Audit findings F2-F6, F11-F13: booking lifecycle and money rules, audit log, account governance,
-- abuse limits, file-path ownership and data-protection helpers.

-- ---------------------------------------------------------------------------
-- Settings (read only through SQL functions; no client policy)
-- ---------------------------------------------------------------------------
create table public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
-- Admin and management must have passed two-step verification in the current session to use their powers.
-- Break-glass if you are locked out: update public.app_settings set value = 'false' where key = 'require_staff_mfa';
insert into public.app_settings (key, value) values ('require_staff_mfa', 'true');

-- ---------------------------------------------------------------------------
-- Profiles: disable flag, last-admin guard, effective role
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column disabled boolean not null default false,
  add column disabled_at timestamptz,
  add column updated_by_id text;

-- The role RLS sees. A disabled account has no role. Admin and management only count as such once the session
-- has passed the second factor (aal2); before that they can sign in and reach the security page, nothing else.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p.disabled then 'disabled'
    when p.role in ('admin', 'management')
         and coalesce((select value from public.app_settings where key = 'require_staff_mfa'), 'true') = 'true'
         and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then 'mfa_required'
    else p.role end
  from public.profiles p where p.id = auth.uid()
$$;

-- Whether staff must use two-step verification (read by the Edge Functions).
create function public.staff_mfa_required() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select value from public.app_settings where key = 'require_staff_mfa'), 'true') = 'true' $$;

create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare other_admin boolean;
begin
  if old.role = 'admin' and not old.disabled then
    select exists (select 1 from public.profiles where role = 'admin' and not disabled and id <> old.id) into other_admin;
    if not other_admin and (tg_op = 'DELETE' or new.role <> 'admin' or new.disabled) then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.disabled and not old.disabled then new.disabled_at = now(); end if;
  if not new.disabled and old.disabled then new.disabled_at = null; end if;
  return new;
end $$;
create trigger profiles_guard before update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Audit log: insert-only history of who changed what
-- ---------------------------------------------------------------------------
alter table public.discount_codes add column updated_by_id text;
alter table public.shift_reports add column updated_by_id text;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id text,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, at);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.app_role() = 'admin');
create policy audit_log_booking_read on public.audit_log for select to authenticated
  using (table_name = 'bookings' and public.app_role() = 'management');

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare old_j jsonb; new_j jsonb; rec jsonb; actor text; actor_role text; rid text;
begin
  if tg_op = 'DELETE' then old_j := to_jsonb(old); rec := old_j;
  elsif tg_op = 'INSERT' then new_j := to_jsonb(new); rec := new_j;
  else
    old_j := to_jsonb(old); new_j := to_jsonb(new); rec := new_j;
    -- timestamp-only touches are not changes
    if (old_j - 'updated_date') = (new_j - 'updated_date') then return new; end if;
  end if;
  -- Browser writes carry the user; Edge Functions use the service role and stamp updated_by_id.
  actor := coalesce(auth.uid()::text, rec ->> 'updated_by_id', rec ->> 'recorded_by_id');
  select role into actor_role from public.profiles where id::text = actor;
  rid := rec ->> 'id';
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, before, after)
  values (actor, actor_role, tg_op, tg_table_name, rid, old_j, new_j);
  return coalesce(new, old);
end $$;

create function public.audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
revoke update, delete, truncate on public.audit_log from authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['bookings', 'payments', 'profiles', 'service_packages', 'discount_codes', 'shift_reports',
                           'staff_role_assignments', 'account_requests', 'lounges', 'porters', 'supervisor_directory', 'reporting_baselines']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Bookings: lifecycle, money rules, idempotency, file ownership
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column written_off numeric(12,2) not null default 0,
  add column status_reason text,
  add column updated_by_id text,
  add column idempotency_key text;

create unique index bookings_idempotency_idx
  on public.bookings (coalesce(passenger_user_id, assigned_supervisor_id), idempotency_key)
  where idempotency_key is not null;

alter table public.bookings add constraint bookings_photo_owner_chk
  check (coalesce(passenger_photo_uri, '') = '' or passenger_photo_uri like coalesce(passenger_user_id, assigned_supervisor_id) || '/%');
alter table public.supervisor_directory add constraint supervisor_directory_photo_owner_chk
  check (coalesce(photo_uri, '') = '' or photo_uri like user_id || '/%');

alter table public.discount_redemptions add column released_at timestamptz;

-- Allowed status changes. Terminal states (completed, cancelled, no_show) never reopen except through
-- admin_set_booking_status, which requires a reason and is audited.
create function public.bookings_status_guard() returns trigger
language plpgsql as $$
declare allowed text[];
begin
  if new.status is not distinct from old.status then return new; end if;
  if coalesce(current_setting('app.status_override', true), '') = 'on' then return new; end if;
  allowed := case old.status
    when 'confirmed' then array['assigned', 'cancelled', 'no_show']
    when 'assigned' then array['in_progress', 'completed', 'cancelled', 'no_show']
    when 'in_progress' then array['completed', 'cancelled', 'no_show']
    else array[]::text[] end;
  if not (new.status = any (allowed)) then
    raise exception 'invalid_status_transition: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'completed' and new.outstanding_balance > 0 then
    raise exception 'balance_outstanding' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' then new.outstanding_balance := 0; end if;
  return new;
end $$;
create trigger bookings_status_guard before update of status on public.bookings
  for each row execute function public.bookings_status_guard();

-- Cancelling gives the discount back, once.
create function public.bookings_release_discount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and coalesce(new.discount_code_id, '') <> '' then
    if exists (select 1 from public.discount_redemptions where booking_id = new.id::text and released_at is null) then
      update public.discount_codes set
        redemption_count = greatest(0, redemption_count - 1),
        total_discount_granted = greatest(0, round(total_discount_granted - coalesce(new.discount_amount, 0), 2))
      where id::text = new.discount_code_id;
      update public.discount_redemptions set released_at = now() where booking_id = new.id::text and released_at is null;
    end if;
  end if;
  return new;
end $$;
create trigger bookings_release_discount after update of status on public.bookings
  for each row execute function public.bookings_release_discount();

-- ---------------------------------------------------------------------------
-- Money: ledger entry types, payments only on open bookings, refunds and write-offs
-- ---------------------------------------------------------------------------
alter table public.payments
  add column entry_type text not null default 'payment' check (entry_type in ('payment', 'refund', 'write_off')),
  add column reason text;
alter table public.payments alter column method drop not null;
alter table public.payments add constraint payments_method_by_type_chk
  check ((entry_type = 'write_off') = (method is null));

create or replace function public.record_payment(
  p_booking_id uuid, p_amount numeric, p_method text, p_user_id text, p_user_name text
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
                               recorded_by_id, recorded_by_name, recorded_at, entry_type)
  values (p_booking_id::text, b.reference, p_amount, p_method, b.outstanding_balance,
          p_user_id, p_user_name, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'payment');
  return b;
end $$;

-- Refunds and write-offs: management/admin only (checked by the Edge Function), always with a reason.
create function public.record_adjustment(
  p_booking_id uuid, p_type text, p_amount numeric, p_method text, p_reason text, p_user_id text, p_user_name text
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if p_type not in ('refund', 'write_off') then raise exception 'invalid_type' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  if p_type = 'refund' then
    if p_method not in ('cash', 'mobile_money', 'card', 'corporate_account') then
      raise exception 'invalid_method' using errcode = 'P0001';
    end if;
    update public.bookings set
      amount_collected = round(amount_collected - p_amount, 2),
      outstanding_balance = case when status = 'cancelled' then 0
                                 else greatest(0, round(total_value - (amount_collected - p_amount) - written_off, 2)) end,
      payment_status = case
        when amount_collected - p_amount + written_off >= total_value then 'paid'
        when amount_collected - p_amount > 0 then 'partially_paid'
        else 'unpaid' end,
      updated_by_id = p_user_id
    where id = p_booking_id and amount_collected - p_amount >= 0
    returning * into b;
  else
    update public.bookings set
      written_off = round(written_off + p_amount, 2),
      outstanding_balance = round(outstanding_balance - p_amount, 2),
      payment_status = case when outstanding_balance - p_amount <= 0.001 then 'paid' else payment_status end,
      updated_by_id = p_user_id
    where id = p_booking_id and status <> 'cancelled' and p_amount <= outstanding_balance + 0.001
    returning * into b;
  end if;

  if not found then
    if not exists (select 1 from public.bookings where id = p_booking_id) then
      raise exception 'booking_not_found' using errcode = 'P0001';
    end if;
    raise exception 'adjustment_too_large' using errcode = 'P0001';
  end if;

  insert into public.payments (booking_id, booking_reference, amount, method, balance_after,
                               recorded_by_id, recorded_by_name, recorded_at, entry_type, reason)
  values (p_booking_id::text, b.reference, p_amount, case when p_type = 'refund' then p_method end, b.outstanding_balance,
          p_user_id, p_user_name, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), p_type, trim(p_reason));
  return b;
end $$;

-- Admin correction of a closed booking's status: needs a reason, bypasses the transition rules, is audited.
create function public.admin_set_booking_status(p_booking_id uuid, p_status text, p_reason text, p_user_id text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  perform set_config('app.status_override', 'on', true);
  update public.bookings set status = p_status, status_reason = trim(p_reason), updated_by_id = p_user_id
  where id = p_booking_id returning * into b;
  perform set_config('app.status_override', 'off', true);
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  return b;
end $$;

-- ---------------------------------------------------------------------------
-- Abuse limits: fixed-window counters
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Counts one hit and returns how many hits the current window now holds.
create function public.hit_rate_limit(p_key text, p_window_seconds integer) returns integer
language plpgsql security definer set search_path = public as $$
declare w timestamptz; c integer;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from public.rate_limits where window_start < now() - interval '2 days';
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  return c;
end $$;

-- Hits so far in the current window, without counting a new one.
create function public.rate_limit_count(p_key text, p_window_seconds integer) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select count from public.rate_limits
                   where key = p_key and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)), 0)
$$;

-- ---------------------------------------------------------------------------
-- Data protection helpers (service role only)
-- ---------------------------------------------------------------------------
-- Blanks a person's personal data but keeps money records. Returns the stored files the caller must delete.
create function public.anonymise_user_data(p_user_id text) returns table (path text)
language plpgsql security definer set search_path = public as $$
declare paths text[];
begin
  select coalesce(array_agg(x), '{}') into paths from (
    select passenger_photo_uri as x from public.bookings
      where passenger_user_id = p_user_id and coalesce(passenger_photo_uri, '') <> ''
    union
    select photo_uri from public.supervisor_directory where user_id = p_user_id and coalesce(photo_uri, '') <> ''
  ) s;

  update public.bookings b set
    contact = '', nationality = '', special_requests = '',
    passengers = coalesce((select jsonb_agg(jsonb_build_object(
        'name', 'Deleted passenger', 'contact', '', 'nationality', '',
        'total_bags', coalesce((e ->> 'total_bags')::numeric, 0), 'special_requests', '')) from jsonb_array_elements(b.passengers) e), '[]'::jsonb),
    passenger_photo_uri = '', passenger_photo_deleted_at = now()
  where b.passenger_user_id = p_user_id;
  update public.booking_ratings set passenger_name = '', feedback = '' where passenger_user_id = p_user_id;
  update public.discount_redemptions set user_email = '' where user_id = p_user_id;
  update public.account_requests set full_name = '', email = 'deleted' where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.supervisor_directory where user_id = p_user_id;
  return query select unnest(paths);
end $$;

-- Looks for broken links and figures that disagree. Zero rows with a non-zero count is a problem worth looking at.
create function public.data_integrity_check() returns table (check_name text, problem_count bigint)
language sql stable security definer set search_path = public as $$
  select 'payments pointing at a missing booking', count(*) from public.payments p
    where not exists (select 1 from public.bookings b where b.id::text = p.booking_id)
  union all
  select 'ratings pointing at a missing booking', count(*) from public.booking_ratings r
    where not exists (select 1 from public.bookings b where b.id::text = r.booking_id)
  union all
  select 'discount redemptions pointing at a missing booking', count(*) from public.discount_redemptions d
    where not exists (select 1 from public.bookings b where b.id::text = d.booking_id)
  union all
  select 'bookings whose collected amount differs from the ledger', count(*) from public.bookings b
    where b.amount_collected <> coalesce((select sum(case p.entry_type when 'payment' then p.amount when 'refund' then -p.amount else 0 end)
                                          from public.payments p where p.booking_id = b.id::text), 0)
  union all
  select 'open bookings whose balance does not add up', count(*) from public.bookings b
    where b.status <> 'cancelled'
      and b.outstanding_balance <> greatest(0, round(b.total_value - b.amount_collected - b.written_off, 2))
$$;

revoke execute on function public.record_adjustment(uuid, text, numeric, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_booking_status(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_count(text, integer) from public, anon, authenticated;
revoke execute on function public.anonymise_user_data(text) from public, anon, authenticated;
revoke execute on function public.data_integrity_check() from public, anon, authenticated;
revoke execute on function public.staff_mfa_required() from public, anon, authenticated;
grant execute on function public.record_adjustment(uuid, text, numeric, text, text, text, text) to service_role;
grant execute on function public.admin_set_booking_status(uuid, text, text, text) to service_role;
grant execute on function public.hit_rate_limit(text, integer) to service_role;
grant execute on function public.rate_limit_count(text, integer) to service_role;
grant execute on function public.anonymise_user_data(text) to service_role;
grant execute on function public.data_integrity_check() to service_role;
grant execute on function public.staff_mfa_required() to service_role;

grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
grant all on public.app_settings, public.rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- Disabled accounts see nothing. A RESTRICTIVE policy is ANDed with every existing policy, so it also
-- covers the "own rows" rules that do not look at the role. (profiles stays readable so the app can tell
-- the person their account is disabled.)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['service_packages', 'lounges', 'porters', 'supervisor_directory', 'bookings', 'payments',
                           'discount_codes', 'discount_redemptions', 'booking_ratings', 'shift_reports', 'reporting_baselines',
                           'account_requests', 'staff_role_assignments', 'notifications', 'email_deliveries', 'audit_log']
  loop
    execute format('create policy disabled_accounts_blocked on public.%I as restrictive for all to authenticated using (public.app_role() is distinct from ''disabled'')', t);
  end loop;
end $$;

create policy disabled_accounts_blocked on storage.objects as restrictive for all to authenticated
  using (public.app_role() is distinct from 'disabled');
