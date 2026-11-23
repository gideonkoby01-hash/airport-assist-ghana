-- Roles and tasks: the admin creates roles and chooses what each may do; the database enforces it. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'adm-rl@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'gm-rl@example.com'),
  ('00000000-0000-0000-0000-0000000000e3', 'ops-rl@example.com'),
  ('00000000-0000-0000-0000-0000000000e4', 'acc-rl@example.com'),
  ('00000000-0000-0000-0000-0000000000e5', 'care-rl@example.com'),
  ('00000000-0000-0000-0000-0000000000e6', 'sup-rl@example.com');
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-rl@example.com';
update public.profiles set role = 'management', full_name = 'Gina General' where email = 'gm-rl@example.com';
update public.profiles set role = 'management', staff_role = 'operations_manager', full_name = 'Oti Operations' where email = 'ops-rl@example.com';
update public.profiles set role = 'accounts', full_name = 'Akos Accounts' where email = 'acc-rl@example.com';
update public.profiles set role = 'management', full_name = 'Cara Care' where email = 'care-rl@example.com';
update public.profiles set role = 'supervisor', full_name = 'Sam Supervisor' where email = 'sup-rl@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like expected || '%' or sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error: % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;
create function pg_temp.as_user(uid text, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', aal)::text, true);
  set local role authenticated;
end $$;

-- ---- the ready-made roles ---------------------------------------------------------------------------
select pg_temp.check_that('three roles come ready-made',
  (select count(*) = 3 from public.staff_roles where system and key in ('general_manager', 'operations_manager', 'accounts_manager')));
select pg_temp.check_that('the General manager can do everything',
  (select count(*) = array_length(public.all_permissions(), 1) from public.role_permissions where role_key = 'general_manager'));
select pg_temp.check_that('the Operations manager has no Accounts tasks',
  (select count(*) = 0 from public.role_permissions where role_key = 'operations_manager' and permission like 'accounts.%'));

-- ---- who can do what, from the starting tasks -------------------------------------------------------------
select pg_temp.check_that('a Management login with no chosen role is a General manager, Accounts is an Accounts manager',
  public.staff_role_of('00000000-0000-0000-0000-0000000000e2') = 'general_manager' and public.staff_role_of('00000000-0000-0000-0000-0000000000e4') = 'accounts_manager'
  and public.staff_role_of('00000000-0000-0000-0000-0000000000e3') = 'operations_manager' and public.staff_role_of('00000000-0000-0000-0000-0000000000e6') is null);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check_that('the General manager can open the Accounts section', (select count(*) >= 0 from public.gl_journal(current_date, current_date)));
select pg_temp.check_that('the General manager can open Customers', (select count(*) >= 0 from public.crm_customers()));
select pg_temp.check_that('the General manager has the dashboard analytics', (public.analytics_dashboard(current_date, current_date)) is not null);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.raises('the Operations manager cannot open the Accounts section', $q$select * from public.gl_journal(current_date, current_date)$q$, '42501');
select pg_temp.raises('the Operations manager cannot read the finance summary', $q$select public.finance_summary(current_date, current_date)$q$, '42501');
select pg_temp.raises('the Operations manager cannot record an expense',
  $q$insert into public.expenses (expense_date, category, description, amount) values (current_date, 'rent', 'Office', 10)$q$, '42501');
select pg_temp.raises('the Operations manager cannot post a journal entry',
  $q$select public.gl_post_journal(current_date, 'Sneaky', null, '[{"account":"1000","debit":5},{"account":"4000","credit":5}]')$q$, '42501');
select pg_temp.raises('the Operations manager has no dashboard analytics', $q$select public.analytics_dashboard(current_date, current_date)$q$, '42501');
select pg_temp.check_that('the Operations manager can open Customers', (select count(*) >= 0 from public.crm_customers()));
select pg_temp.check_that('the Operations manager can see the leaderboard', (public.team_leaderboard(current_date, current_date)) is not null);
select pg_temp.check_that('the Operations manager can use Porter pay', (select count(*) >= 0 from public.porter_earnings(current_date)));
select pg_temp.check_that('the Operations manager can see the Commissions list', (select count(*) >= 0 from public.supervisor_commissions(current_date, current_date)));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select pg_temp.check_that('the Accounts manager can open the Accounts section', (select count(*) >= 0 from public.gl_journal(current_date, current_date)));
select pg_temp.check_that('the Accounts manager can record in it', public.gl_post_journal(current_date, 'Opening balance', 'RL-1', '[{"account":"1030","debit":50},{"account":"3000","credit":50}]') is not null);
select pg_temp.raises('the Accounts manager cannot open Customers', $q$select * from public.crm_customers()$q$, '42501');
select pg_temp.raises('the Accounts manager cannot use Porter pay', $q$select * from public.porter_earnings(current_date)$q$, '42501');
select pg_temp.raises('the Accounts manager has no leaderboard', $q$select public.team_leaderboard(current_date, current_date)$q$, '42501');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e6');
select pg_temp.check_that('a supervisor has no tasks at all', not public.has_permission('customers.manage') and not public.has_permission('accounts.view') and not public.has_permission('ratings.view'));
select pg_temp.raises('a supervisor cannot open the Accounts section', $q$select * from public.gl_journal(current_date, current_date)$q$, '42501');
reset role;

-- two-step verification still counts: without it nothing is allowed, whatever the role
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2', 'aal1');
select pg_temp.check_that('a General manager who has not passed two-step verification has no tasks', not public.has_permission('customers.manage'));
select pg_temp.raises('and cannot open Customers', $q$select * from public.crm_customers()$q$, '42501');
reset role;

-- ---- the admin creates a role and chooses its tasks ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.raises('only an admin can create a role', $q$select public.create_staff_role('Sneaky role', null, array['customers.manage'])$q$, '42501');
select pg_temp.raises('only an admin can change the tasks of a role', $q$select public.update_staff_role('operations_manager', 'Operations manager', null, public.all_permissions())$q$, '42501');
select pg_temp.raises('only an admin can give a role to a person', $q$select public.assign_staff_role('00000000-0000-0000-0000-0000000000e3', 'general_manager')$q$, '42501');
update public.profiles set staff_role = 'general_manager' where id = '00000000-0000-0000-0000-0000000000e3';
reset role;
select pg_temp.check_that('a person cannot give themselves a bigger role by editing their own profile',
  (select staff_role = 'operations_manager' from public.profiles where id = '00000000-0000-0000-0000-0000000000e3'));

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.create_staff_role('Customer Care Lead', 'Looks after customers and their feedback.', array['customers.manage', 'ratings.view']);
select pg_temp.check_that('the role is created with a key made from its name',
  (select count(*) = 2 from public.role_permissions where role_key = 'customer_care_lead') and exists (select 1 from public.staff_roles where key = 'customer_care_lead' and not system));
select pg_temp.raises('two roles cannot share a name', $q$select public.create_staff_role('customer care lead', null, '{}')$q$, 'name_taken');
select pg_temp.raises('an unknown task is refused', $q$select public.create_staff_role('Odd role', null, array['rule.the.world'])$q$, 'unknown_permission');
select pg_temp.raises('a role needs a name', $q$select public.create_staff_role(' ', null, '{}')$q$, 'invalid_name');
select pg_temp.check_that('a name made of symbols still gets a usable key', (select public.create_staff_role('24h Desk!', null, '{}')) ~ '^[a-z][a-z0-9_]+$');
select public.assign_staff_role('00000000-0000-0000-0000-0000000000e5', 'customer_care_lead');
select pg_temp.check_that('the role is given to the person', (select staff_role = 'customer_care_lead' and role = 'management' from public.profiles where id = '00000000-0000-0000-0000-0000000000e5'));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select pg_temp.check_that('the new role can open Customers and see ratings', (select count(*) >= 0 from public.crm_customers()) and public.has_permission('ratings.view'));
select pg_temp.raises('but not the Accounts section', $q$select * from public.gl_journal(current_date, current_date)$q$, '42501');
select pg_temp.raises('or Porter pay', $q$select * from public.porter_earnings(current_date)$q$, '42501');
select pg_temp.check_that('my_access tells the screens what the person may do',
  (select (a -> 'permissions') @> '["customers.manage", "ratings.view"]'::jsonb and not (a -> 'permissions') ? 'accounts.view' and a ->> 'staff_role_name' = 'Customer Care Lead' from (select public.my_access() a) x));
reset role;

-- changing the tasks takes effect straight away
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.update_staff_role('customer_care_lead', 'Customer Care Lead', 'Customers, feedback and the books.', array['customers.manage', 'accounts.record']);
select pg_temp.check_that('recording in the Accounts brings looking at them with it',
  (select array_agg(permission order by permission) = array['accounts.record', 'accounts.view', 'customers.manage'] from public.role_permissions where role_key = 'customer_care_lead'));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select pg_temp.check_that('the person can now open the Accounts section', (select count(*) >= 0 from public.gl_journal(current_date, current_date)));
select pg_temp.check_that('the ratings task is gone', not public.has_permission('ratings.view'));
reset role;

-- ---- the Operations manager's tasks can be changed too ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.update_staff_role('operations_manager', 'Operations manager', null, array['customers.manage', 'accounts.view']);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check_that('the Operations manager can now look at the Accounts', (select count(*) >= 0 from public.gl_journal(current_date, current_date)));
select pg_temp.raises('but still cannot record in them', $q$select public.gl_post_journal(current_date, 'Nope', null, '[{"account":"1000","debit":5},{"account":"4000","credit":5}]')$q$, '42501');
select pg_temp.raises('and lost Porter pay', $q$select * from public.porter_earnings(current_date)$q$, '42501');
reset role;

-- ---- deleting roles ---------------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.raises('a ready-made role cannot be deleted', $q$select public.delete_staff_role('general_manager')$q$, 'system_role');
select pg_temp.raises('a role someone holds cannot be deleted', $q$select public.delete_staff_role('customer_care_lead')$q$, 'role_in_use');
select public.delete_staff_role('role_24h_desk');
select pg_temp.check_that('an unused role can be deleted', not exists (select 1 from public.staff_roles where key = 'role_24h_desk'));
select pg_temp.raises('a role that does not exist is reported', $q$select public.delete_staff_role('no_such_role')$q$, 'role_not_found');
select pg_temp.raises('an admin cannot be given a role', $q$select public.assign_staff_role('00000000-0000-0000-0000-0000000000e1', 'general_manager')$q$, 'user_not_found');
select public.assign_staff_role('00000000-0000-0000-0000-0000000000e6', 'accounts_manager');
select pg_temp.check_that('the Accounts manager role uses the Accounts login',
  (select role = 'accounts' and staff_role = 'accounts_manager' from public.profiles where id = '00000000-0000-0000-0000-0000000000e6'));
select pg_temp.check_that('an admin can always do everything', public.has_permission('accounts.record') and public.has_permission('customers.manage'));
reset role;

-- the people who hold roles can be listed by the admin only
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check_that('other staff cannot read the list of roles', (select count(*) = 0 from public.staff_roles));
reset role;

-- every change is in the audit log
select pg_temp.check_that('role changes are audited', (select count(*) >= 1 from public.audit_log where table_name in ('staff_roles', 'role_permissions')));

rollback;
