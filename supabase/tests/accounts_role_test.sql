-- The accounts role: finance and analytics yes, bookings and customers no. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'acct-role@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'sup-role@example.com');
update public.profiles set role = 'accounts', full_name = 'Abena Accountant' where email = 'acct-role@example.com';
update public.profiles set role = 'supervisor' where email = 'sup-role@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm like expected || '%' or sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error: % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;
create function pg_temp.as_user(uid text, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', aal)::text, true);
  set local role authenticated;
end $$;

select pg_temp.check_that('the accounts role is accepted on a profile', (select role = 'accounts' from public.profiles where email = 'acct-role@example.com'));
select pg_temp.raises('an unknown role is still refused', $q$update public.profiles set role = 'auditor' where email = 'sup-role@example.com'$q$, '23514');

-- with two-step verification done
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1', 'aal2');
select pg_temp.check_that('they read the finance summary', (select (public.finance_summary(current_date, current_date) ->> 'collected') is not null));
select pg_temp.check_that('...the dashboard analytics', (select (public.analytics_dashboard(current_date, current_date) -> 'current') is not null));
select pg_temp.check_that('...the ledger and receivables', (select count(*) >= 0 from public.ledger_entries(current_date, current_date)) and (select count(*) >= 0 from public.receivables_aging()));
insert into public.expenses (expense_date, category, description, amount) values (current_date, 'rent', 'Office rent', 400);
select pg_temp.check_that('they record expenses under their own name', (select created_by_name = 'Abena Accountant' from public.expenses where description = 'Office rent'));
select pg_temp.check_that('they cannot read bookings', (select count(*) = 0 from public.bookings));
select pg_temp.check_that('they cannot read payments rows directly', (select count(*) = 0 from public.payments));
select pg_temp.check_that('they cannot read other people''s profiles', (select count(*) <= 1 from public.profiles));
select pg_temp.check_that('they cannot read customers', (select count(*) = 0 from public.customers));
do $$ begin
  begin update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1'; exception when others then null; end;
end $$;
select pg_temp.check_that('they cannot make themselves admin', (select role = 'accounts' from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'));
reset role;

-- without two-step verification the same account sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1', 'aal1');
select pg_temp.raises('without two-step verification the finance reports are refused', $q$select public.finance_summary(current_date, current_date)$q$, '42501');
select pg_temp.check_that('...and expenses are hidden', (select count(*) = 0 from public.expenses));
reset role;

-- a supervisor still has no access
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2', 'aal2');
select pg_temp.raises('a supervisor still cannot read the finance summary', $q$select public.finance_summary(current_date, current_date)$q$, '42501');
rollback;
