-- Settings tables: who can read what, public settings, audit of changes. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'pax@example.com');
update public.profiles set role = 'admin' where email = 'admin@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.denied(label text, stmt text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute stmt; get diagnostics n = row_count;
    if n > 0 then raise exception 'FAIL %: allowed (% rows)', label, n; end if;
    raise notice 'ok   % (nothing returned or changed)', label; return;
  exception when insufficient_privilege then raise notice 'ok   % (permission denied)', label; return; end;
end $$;

set local role service_role;
insert into public.app_settings (key, value, is_public, updated_by_id) values
  ('contact_email', 'desk@example.com', true, '00000000-0000-0000-0000-0000000000a1'),
  ('min_lead_hours', '3', false, '00000000-0000-0000-0000-0000000000a1');
insert into public.app_secrets (name, ciphertext, last4, updated_by_id) values ('RESEND_API_KEY', 'v1.xx.yy', '1a2b', '00000000-0000-0000-0000-0000000000a1');

-- anyone can read the public settings, and only those
reset role;
set local role anon;
select pg_temp.check_that('visitors read the public settings only',
  (select public.get_public_settings() = '{"contact_email": "desk@example.com"}'::jsonb));
select pg_temp.denied('visitors cannot read the settings table', 'select * from public.app_settings');
select pg_temp.denied('visitors cannot read the secrets table', 'select * from public.app_secrets');
reset role;

-- signed-in users, even admins in a browser, cannot read or write either table
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
set local role authenticated;
select pg_temp.denied('an admin''s browser cannot read the secrets', 'select * from public.app_secrets');
select pg_temp.denied('an admin''s browser cannot read the settings', 'select * from public.app_settings');
select pg_temp.denied('an admin''s browser cannot write a setting', $q$update public.app_settings set value = '0' where key = 'min_lead_hours'$q$);
select pg_temp.denied('an admin''s browser cannot write a secret', $q$update public.app_secrets set last4 = 'zzzz'$q$);
select pg_temp.check_that('a signed-in user still reads the public settings', (select public.get_public_settings() ->> 'contact_email') = 'desk@example.com');
reset role;

-- a change is audited by key, with who made it
set local role service_role;
update public.app_settings set value = '4', updated_by_id = '00000000-0000-0000-0000-0000000000a1' where key = 'min_lead_hours';
select pg_temp.check_that('a settings change is in the audit log with the key and the admin',
  exists (select 1 from public.audit_log where table_name = 'app_settings' and record_id = 'min_lead_hours' and action = 'UPDATE'
          and before ->> 'value' = '3' and after ->> 'value' = '4' and actor_id = '00000000-0000-0000-0000-0000000000a1'));
select pg_temp.check_that('the secrets table is not audited by trigger (it holds ciphertext)',
  not exists (select 1 from public.audit_log where table_name = 'app_secrets'));
rollback;
