-- Positions and permissions: the admin creates roles and decides which tasks each role may perform.
--
--   * staff_roles: the roles (General manager, Operations manager and Accounts manager come ready-made; the admin adds more).
--   * role_permissions: the tasks each role may perform. Admin can always do everything and is not listed.
--   * A staff member's role sits on top of the account type they already have: people who were Management become General managers,
--     the Accounts login becomes Accounts manager, and nothing they could do before changes until an admin changes it.
--   * Every task is checked here in the database (and in two Edge Functions), not just hidden in the menus:
--       accounts.view / accounts.record  the Accounts section: look at it / record, cancel, close
--       analytics.view                   the dashboard analytics (revenue and booking charts)
--       leaderboard.view                 the supervisor and porter leaderboard
--       customers.manage                 the Customers area
--       porter_pay.manage                Porter pay
--       commissions.view                 the Commissions list
--       payments.adjust                  refunds, write-offs and price adjustments on a booking
--       shift_reports.view               other people's shift reports
--       ratings.view                     customer ratings and reviews
--       supervisors.assign               assigning a supervisor to a booking
-- Safe to run more than once. Settings, Staff accounts, Service packages, Lounges, Discounts, Email and the porter register stay admin-only.

create or replace function public.all_permissions() returns text[]
language sql immutable as $$ select array['accounts.view', 'accounts.record', 'analytics.view', 'leaderboard.view', 'customers.manage', 'porter_pay.manage', 'commissions.view', 'payments.adjust', 'shift_reports.view', 'ratings.view', 'supervisors.assign']::text[] $$;

create table if not exists public.staff_roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  system boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text
);
create unique index if not exists staff_roles_name_idx on public.staff_roles (lower(btrim(name)));

create table if not exists public.role_permissions (
  role_key text not null references public.staff_roles (key) on update cascade on delete cascade,
  permission text not null check (permission = any (public.all_permissions())),
  primary key (role_key, permission)
);

alter table public.profiles add column if not exists staff_role text references public.staff_roles (key) on update cascade on delete restrict;

insert into public.staff_roles (key, name, description, system) values
  ('general_manager', 'General manager', 'Runs the business: everything operations and accounts can do.', true),
  ('operations_manager', 'Operations manager', 'Runs the day to day: bookings, supervisors, porters and customers. No access to the Accounts section.', true),
  ('accounts_manager', 'Accounts manager', 'Keeps the books: the Accounts section and the dashboard analytics.', true)
on conflict (key) do nothing;

-- Starting tasks, the same as each person could do before. Only added when a role has none yet, so an admin's later changes are never undone.
insert into public.role_permissions (role_key, permission)
select 'general_manager', k from unnest(public.all_permissions()) k
where not exists (select 1 from public.role_permissions where role_key = 'general_manager')
on conflict do nothing;
insert into public.role_permissions (role_key, permission)
select 'operations_manager', k from unnest(array['leaderboard.view', 'customers.manage', 'porter_pay.manage', 'commissions.view', 'payments.adjust', 'shift_reports.view', 'ratings.view', 'supervisors.assign']) k
where not exists (select 1 from public.role_permissions where role_key = 'operations_manager')
on conflict do nothing;
insert into public.role_permissions (role_key, permission)
select 'accounts_manager', k from unnest(array['accounts.view', 'accounts.record', 'analytics.view']) k
where not exists (select 1 from public.role_permissions where role_key = 'accounts_manager')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Who can do what
-- ---------------------------------------------------------------------------
-- The role a person holds: Management without a chosen role is a General manager, Accounts without one an Accounts manager.
create or replace function public.staff_role_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p.role when 'management' then coalesce(p.staff_role, 'general_manager') when 'accounts' then coalesce(p.staff_role, 'accounts_manager') end
  from public.profiles p where p.id = p_user and not p.disabled
$$;

-- Can this person do this task? Used by the Edge Functions, which act for a person with the service role.
create or replace function public.user_can(p_user uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin' and not p.disabled)
      or exists (select 1 from public.role_permissions rp where rp.role_key = public.staff_role_of(p_user) and rp.permission = p_key)
$$;
revoke all on function public.user_can(uuid, text) from public, anon, authenticated;
grant execute on function public.user_can(uuid, text) to service_role;

-- Can the signed-in person do this task right now (and, for staff who need it, have they passed two-step verification)?
create or replace function public.has_permission(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() in ('admin', 'management', 'accounts') and public.user_can(auth.uid(), p_key)
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.require_permission(p_key text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(p_key) then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke all on function public.require_permission(text) from public, anon;
grant execute on function public.require_permission(text) to authenticated;

-- What the signed-in person's screens should offer: their role and its tasks. The database still checks every action.
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role', p.role,
    'staff_role', k.key,
    'staff_role_name', case when p.role = 'admin' then 'Admin' else k.name end,
    'permissions', case when p.role = 'admin' then to_jsonb(public.all_permissions())
                        else coalesce((select jsonb_agg(rp.permission order by rp.permission) from public.role_permissions rp where rp.role_key = k.key), '[]'::jsonb) end)
  from public.profiles p left join public.staff_roles k on k.key = public.staff_role_of(p.id)
  where p.id = auth.uid() and not p.disabled
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: create roles, choose their tasks, give a role to a person
-- ---------------------------------------------------------------------------
alter table public.staff_roles enable row level security;
alter table public.role_permissions enable row level security;
do $$
declare t text;
begin
  foreach t in array array['staff_roles', 'role_permissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() = ''admin'')', t || '_admin_read', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke all on function public.require_admin() from public, anon;
grant execute on function public.require_admin() to authenticated;

-- Checks a list of tasks and adds what a task needs: recording in the Accounts needs looking at them.
create or replace function public.clean_permissions(p_permissions text[]) returns text[]
language plpgsql immutable as $$
declare p text[] := coalesce(p_permissions, '{}'::text[]); bad text;
begin
  select x into bad from unnest(p) x where x <> all (public.all_permissions()) limit 1;
  if bad is not null then raise exception 'unknown_permission' using errcode = 'P0001'; end if;
  if 'accounts.record' = any (p) and not ('accounts.view' = any (p)) then p := array_append(p, 'accounts.view'); end if;
  return (select coalesce(array_agg(distinct x order by x), '{}'::text[]) from unnest(p) x);
end $$;

create or replace function public.create_staff_role(p_name text, p_description text, p_permissions text[]) returns text
language plpgsql security definer set search_path = public as $$
declare base text; k text; n int := 1; perms text[];
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_roles where lower(btrim(name)) = lower(btrim(p_name))) then raise exception 'name_taken' using errcode = 'P0001'; end if;
  perms := public.clean_permissions(p_permissions);
  base := trim(both '_' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g'));
  if base = '' or base !~ '^[a-z]' then base := 'role_' || base; end if;
  base := trim(both '_' from left(base, 36));
  k := base;
  while exists (select 1 from public.staff_roles where key = k) loop n := n + 1; k := base || '_' || n; end loop;
  insert into public.staff_roles (key, name, description, created_by_id) values (k, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), auth.uid()::text);
  insert into public.role_permissions (role_key, permission) select k, x from unnest(perms) x;
  return k;
end $$;
revoke all on function public.create_staff_role(text, text, text[]) from public, anon;
grant execute on function public.create_staff_role(text, text, text[]) to authenticated;

create or replace function public.update_staff_role(p_key text, p_name text, p_description text, p_permissions text[]) returns void
language plpgsql security definer set search_path = public as $$
declare perms text[];
begin
  perform public.require_admin();
  if not exists (select 1 from public.staff_roles where key = p_key) then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_roles where lower(btrim(name)) = lower(btrim(p_name)) and key <> p_key) then raise exception 'name_taken' using errcode = 'P0001'; end if;
  perms := public.clean_permissions(p_permissions);
  update public.staff_roles set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''), updated_date = now() where key = p_key;
  delete from public.role_permissions where role_key = p_key and permission <> all (perms);
  insert into public.role_permissions (role_key, permission) select p_key, x from unnest(perms) x on conflict do nothing;
end $$;
revoke all on function public.update_staff_role(text, text, text, text[]) from public, anon;
grant execute on function public.update_staff_role(text, text, text, text[]) to authenticated;

create or replace function public.delete_staff_role(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if (select system from public.staff_roles where key = p_key) then raise exception 'system_role' using errcode = 'P0001'; end if;
  if exists (select 1 from public.profiles where staff_role = p_key) then raise exception 'role_in_use' using errcode = 'P0001'; end if;
  delete from public.staff_roles where key = p_key;
  if not found then raise exception 'role_not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.delete_staff_role(text) from public, anon;
grant execute on function public.delete_staff_role(text) to authenticated;

-- Gives a role to a person. Anyone who is not an admin can hold one; the Accounts manager keeps the Accounts login, every other role uses the Management login.
create or replace function public.assign_staff_role(p_user uuid, p_role_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.staff_roles where key = p_role_key) then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  update public.profiles set staff_role = p_role_key, role = case when p_role_key = 'accounts_manager' then 'accounts' else 'management' end, updated_by_id = auth.uid()::text
  where id = p_user and role <> 'admin' and not disabled;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.assign_staff_role(uuid, text) from public, anon;
grant execute on function public.assign_staff_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The checks that used to name a role now ask for the task
-- ---------------------------------------------------------------------------
-- Looking at the Accounts (every finance report calls this).
create or replace function public.require_finance_role() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.view');
end $$;

drop policy if exists expenses_staff_read on public.expenses;
create policy expenses_staff_read on public.expenses for select to authenticated using (public.has_permission('accounts.view'));
drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses for insert to authenticated with check (public.has_permission('accounts.record'));
drop policy if exists expenses_staff_update on public.expenses;
create policy expenses_staff_update on public.expenses for update to authenticated
  using (public.has_permission('accounts.record')) with check (public.has_permission('accounts.record'));

do $$
declare t text;
begin
  foreach t in array array['gl_accounts', 'gl_journals', 'gl_journal_lines', 'cash_transfers', 'supervisor_commission_payouts', 'closed_periods'] loop
    execute format('drop policy if exists %I on public.%I', t || '_finance_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(''accounts.view''))', t || '_finance_read', t);
  end loop;
end $$;

-- customers, porter pay, commissions, ratings, shift reports
drop policy if exists booking_ratings_read on public.booking_ratings;
create policy booking_ratings_read on public.booking_ratings for select to authenticated
  using (passenger_user_id = auth.uid()::text or public.has_permission('ratings.view'));
drop policy if exists shift_reports_read on public.shift_reports;
create policy shift_reports_read on public.shift_reports for select to authenticated
  using (created_by_id = auth.uid()::text or public.has_permission('shift_reports.view'));
drop policy if exists porter_payouts_staff_read on public.porter_payouts;
create policy porter_payouts_staff_read on public.porter_payouts for select to authenticated
  using (public.has_permission('porter_pay.manage'));

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read on public.customers for select to authenticated
  using (public.has_permission('customers.manage'));
drop policy if exists customers_staff_insert on public.customers;
create policy customers_staff_insert on public.customers for insert to authenticated
  with check (public.has_permission('customers.manage') and user_id is null and erased_at is null);
drop policy if exists customers_staff_update on public.customers;
create policy customers_staff_update on public.customers for update to authenticated
  using (public.has_permission('customers.manage') and erased_at is null)
  with check (public.has_permission('customers.manage') and erased_at is null);
drop policy if exists customer_notes_staff_read on public.customer_notes;
create policy customer_notes_staff_read on public.customer_notes for select to authenticated
  using (public.has_permission('customers.manage'));
drop policy if exists customer_notes_staff_insert on public.customer_notes;
create policy customer_notes_staff_insert on public.customer_notes for insert to authenticated
  with check (public.has_permission('customers.manage'));
drop policy if exists customer_notes_staff_update on public.customer_notes;
create policy customer_notes_staff_update on public.customer_notes for update to authenticated
  using (public.has_permission('customers.manage')) with check (public.has_permission('customers.manage'));


-- Recording, cancelling and closing in the Accounts section.

create or replace function public.gl_post_journal(p_date date, p_memo text, p_reference text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid; x jsonb; dr numeric := 0; cr numeric := 0; n int := 0;
begin
  perform public.require_permission('accounts.record');
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


create or replace function public.gl_void_journal(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.record');
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void_reason_required' using errcode = 'P0001'; end if;
  update public.gl_journals set voided = true, void_reason = btrim(p_reason), voided_at = now() where id = p_id and not voided;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;


create or replace function public.record_cash_transfer(p_date date, p_from text, p_to text, p_amount numeric, p_reference text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  perform public.require_permission('accounts.record');
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


create or replace function public.void_cash_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.record');
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void_reason_required' using errcode = 'P0001'; end if;
  update public.cash_transfers set voided = true, void_reason = btrim(p_reason), voided_at = now() where id = p_id and not voided;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;


create or replace function public.pay_supervisor_commission(p_supervisor_id text, p_amount numeric, p_method text, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; nm text; owed numeric;
begin
  perform public.require_permission('accounts.record');
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


create or replace function public.gl_add_account(p_code text, p_name text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.record');
  if p_code !~ '^[0-9]{3,6}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if p_kind not in ('asset', 'liability', 'equity', 'income', 'expense') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.gl_accounts where code = p_code) then raise exception 'code_taken' using errcode = 'P0001'; end if;
  insert into public.gl_accounts (code, name, kind) values (p_code, btrim(p_name), p_kind);
end $$;


create or replace function public.gl_update_account(p_code text, p_name text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.gl_accounts;
begin
  perform public.require_permission('accounts.record');
  select * into a from public.gl_accounts where code = p_code;
  if not found then raise exception 'account_not_found' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if a.system and not p_active then raise exception 'system_account' using errcode = 'P0001'; end if;
  update public.gl_accounts set name = btrim(p_name), active = p_active where code = p_code;
end $$;


create or replace function public.review_shift_report(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('accounts.record');
  if p_status not in ('accepted', 'queried') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_status = 'queried' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.shift_reports set review_status = p_status, reviewed_at = now(), reviewed_by_id = auth.uid()::text,
         reviewed_by_name = public.current_staff_name(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;


create or replace function public.close_period(p_month date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform public.require_permission('accounts.record');
  if p_month is null or m >= date_trunc('month', current_date)::date then raise exception 'month_not_over' using errcode = 'P0001'; end if;
  insert into public.closed_periods (month, closed_by_id, closed_by_name, note)
  values (m, auth.uid()::text, public.current_staff_name(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (month) do nothing;
end $$;


-- The dashboard analytics.

create or replace function public.analytics_dashboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len integer; prev_to date; prev_from date; result jsonb;
begin
  perform public.require_permission('analytics.view');
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


-- Customers, porter pay and commissions.

create or replace function public.crm_customers(
  p_search text default '', p_segment text default 'all', p_sort text default 'recent',
  p_limit integer default 50, p_offset integer default 0
) returns table (
  id uuid, full_name text, phone text, email text, user_id text, tags text[], marketing_consent boolean,
  bookings_count bigint, completed_count bigint, booked_value numeric, collected numeric, outstanding numeric,
  first_flight text, last_flight text, segment text, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  term text := btrim(coalesce(p_search, ''));
  digits text := ltrim(regexp_replace(term, '\D', '', 'g'), '0');
  lapsed_before text := to_char(current_date - 180, 'YYYY-MM-DD');
begin
  if not public.has_permission('customers.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with agg as (
    select c.id, c.full_name, c.phone, c.email, c.user_id, c.tags, c.marketing_consent,
      count(b.id) filter (where b.status <> 'cancelled') as bookings_count,
      count(b.id) filter (where b.status = 'completed') as completed_count,
      coalesce(sum(b.total_value) filter (where b.status not in ('cancelled', 'no_show')), 0) as booked_value,
      coalesce(sum(b.amount_collected) filter (where b.status <> 'cancelled'), 0) as collected,
      coalesce(sum(b.outstanding_balance) filter (where b.status not in ('cancelled', 'no_show')), 0) as outstanding,
      min(b.flight_date) filter (where b.status <> 'cancelled') as first_flight,
      max(b.flight_date) filter (where b.status <> 'cancelled') as last_flight,
      c.created_date
    from public.customers c
    left join public.bookings b on b.customer_id = c.id
    where c.erased_at is null
      and (term = ''
           or c.full_name ilike '%' || term || '%'
           or c.email ilike '%' || term || '%'
           or (length(digits) >= 3 and c.phone_key like '%' || digits || '%'))
    group by c.id
  ), labelled as (
    select a.*, case
        when 'vip' = any (a.tags) then 'vip'
        when a.bookings_count = 0 then 'new'
        when a.last_flight < lapsed_before then 'lapsed'
        when a.bookings_count >= 2 then 'returning'
        else 'new'
      end as segment
    from agg a
  )
  select l.id, l.full_name, l.phone, l.email, l.user_id, l.tags, l.marketing_consent,
         l.bookings_count, l.completed_count, l.booked_value, l.collected, l.outstanding,
         l.first_flight, l.last_flight, l.segment, count(*) over () as total_count
  from labelled l
  where p_segment = 'all' or l.segment = p_segment
  order by
    case when p_sort = 'value' then l.collected end desc nulls last,
    case when p_sort = 'bookings' then l.bookings_count end desc nulls last,
    case when p_sort = 'name' then lower(l.full_name) end asc,
    l.last_flight desc nulls last, l.created_date desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;


create or replace function public.porter_earnings(p_date date) returns table (
  porter_key text, porter_name text, jobs integer, passengers integer, earned numeric, paid numeric, balance numeric,
  last_paid_at timestamptz, bookings jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('porter_pay.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
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


create or replace function public.pay_porter(p_porter_key text, p_date date) returns public.porter_payouts
language plpgsql security definer set search_path = public as $$
declare r record; row public.porter_payouts; payer text;
begin
  if not public.has_permission('porter_pay.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('porter_pay:' || p_porter_key || ':' || p_date::text));
  select * into r from public.porter_earnings(p_date) e where e.porter_key = p_porter_key;
  if not found or r.balance <= 0 then raise exception 'nothing_due' using errcode = 'P0001'; end if;
  select coalesce(nullif(full_name, ''), email) into payer from public.profiles where id = auth.uid();
  insert into public.porter_payouts (porter_key, porter_name, pay_date, passengers, amount, paid_by_id, paid_by_name)
  values (r.porter_key, r.porter_name, p_date, r.passengers, r.balance, auth.uid()::text, payer)
  returning * into row;
  return row;
end $$;


create or replace function public.supervisor_commissions(p_from date, p_to date)
returns table (booking_id uuid, reference text, supervisor_id text, supervisor_name text, package_name text, amount numeric, marked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('commissions.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select b.id, b.reference, b.supervisor_commission_by, coalesce(nullif(btrim(p.full_name), ''), b.assigned_supervisor_name, p.email, b.supervisor_commission_by),
         b.package_name, b.supervisor_commission, b.supervisor_commission_at
  from public.bookings b left join public.profiles p on p.id::text = b.supervisor_commission_by
  where b.supervisor_commission > 0
    and (p_from is null or b.supervisor_commission_at >= (p_from::timestamp at time zone 'UTC'))
    and (p_to is null or b.supervisor_commission_at < ((p_to + 1)::timestamp at time zone 'UTC'))
  order by b.supervisor_commission_at desc
  limit 5000;
end $$;


-- The leaderboard of supervisors and porters, with its own task so a role can have it without the revenue analytics.
create or replace function public.team_leaderboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_permission('leaderboard.view');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  with b as (select x.*, public.safe_date(x.flight_date) as fd from public.bookings x where public.safe_date(x.flight_date) between p_from and p_to),
  live as (select * from b where status not in ('cancelled', 'no_show')),
  rated as (select r.* from public.booking_ratings r where public.safe_date(r.service_date) between p_from and p_to)
  select jsonb_build_object(
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
            where l.status = 'completed' and coalesce(btrim(e ->> 'porter_name'), '') <> '' group by btrim(e ->> 'porter_name')) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.team_leaderboard(date, date) from public, anon;
grant execute on function public.team_leaderboard(date, date) to authenticated;
