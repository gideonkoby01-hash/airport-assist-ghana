-- Admin adds services: a new service can be created by an admin only, follows its kind (meet and assist or porter), and
-- the four original services behave exactly as before. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'adm-sv@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'mgr-sv@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'sup-sv@example.com');
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-sv@example.com';
update public.profiles set role = 'management', full_name = 'Mina Manager' where email = 'mgr-sv@example.com';
update public.profiles set role = 'supervisor', full_name = 'Sam Supervisor' where email = 'sup-sv@example.com';

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
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2')::text, true);
  set local role authenticated;
end $$;

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true),
  ('full_departure', 'Full Departure Assist', 850, 'departure', true),
  ('departure_priority', 'Departure Priority Only', 500, 'departure', false),
  ('porter_only', 'Porter Service Only', 100, 'both', false)
on conflict (code) do nothing;
update public.service_packages set kind = 'porter' where code = 'porter_only';
reset role;

-- ---- who may add a service -----------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.raises('a supervisor cannot add a service',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('vip_fast_track', 'VIP Fast Track', 300, 'departure', 'meet_assist')$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.raises('management cannot add a service',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('vip_fast_track', 'VIP Fast Track', 300, 'departure', 'meet_assist')$q$, '42501');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.service_packages (code, name, price, price_usd, flight_type, includes_lounge, kind, description, inclusions)
values ('vip_fast_track', 'VIP Fast Track', 300, 25, 'departure', false, 'meet_assist', 'Straight to the front of the queue.', 'Fast lane, Escort to the gate');
insert into public.service_packages (code, name, price, flight_type, kind) values ('wheelchair_assist', 'Wheelchair Assistance', 150, 'both', 'porter');
select pg_temp.check_that('an admin can add services', (select count(*) = 2 from public.service_packages where code in ('vip_fast_track', 'wheelchair_assist')));
select pg_temp.raises('a service code is lower case letters, digits and underscores',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('Bad Code', 'Bad', 10, 'arrival', 'meet_assist')$q$, '23514');
select pg_temp.raises('a code must be unique',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('vip_fast_track', 'Again', 10, 'arrival', 'meet_assist')$q$, '23505');
select pg_temp.raises('a meet and assist service has one direction',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('both_ways', 'Both ways', 10, 'both', 'meet_assist')$q$, '23514');
select pg_temp.raises('an unknown kind is refused',
  $q$insert into public.service_packages (code, name, price, flight_type, kind) values ('odd_kind', 'Odd', 10, 'arrival', 'spa')$q$, '23514');
select pg_temp.raises('a code can never be changed', $q$update public.service_packages set code = 'renamed' where code = 'vip_fast_track'$q$, 'service_code_is_fixed');
update public.service_packages set price = 320, active = true where code = 'vip_fast_track';
select pg_temp.check_that('the price and the other details can be changed', (select price = 320 from public.service_packages where code = 'vip_fast_track'));
reset role;

set local role anon;
select pg_temp.check_that('anyone can see the services that are on', (select count(*) >= 6 from public.service_packages where active));
reset role;

-- ---- rules follow the kind ---------------------------------------------------------------------------
select pg_temp.check_that('porter-type services are told apart',
  public.is_porter_service('porter_only') and public.is_porter_service('wheelchair_assist')
  and not public.is_porter_service('vip_fast_track') and not public.is_porter_service('full_arrival'));
select pg_temp.check_that('a code with no record still follows the original rule', public.is_porter_service('porter_only') and not public.is_porter_service('nothing_here'));
select pg_temp.check_that('the shift report groups services by direction and lounge',
  public.report_service_type('full_arrival') = 'arrival' and public.report_service_type('full_departure') = 'full_departure'
  and public.report_service_type('departure_priority') = 'departure_only' and public.report_service_type('vip_fast_track') = 'departure_only');

set local role service_role;
-- a new meet and assist sold at the desk: a porter is optional and the supervisor earns the commission
select public.create_quick_sale('00000000-0000-0000-0000-0000000000d3', 'Sam', 'SV-1', 'vip_fast_track', 2, null, 'Ama', '', null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, 'p1', '[]'::jsonb, 1);
select pg_temp.check_that('a new meet and assist can be sold with one passenger needing no porter',
  (select porters_waived = 1 and jsonb_array_length(porters) = 1 and total_value = 640 from public.bookings where reference = 'SV-1'));
select pg_temp.check_that('a new meet and assist earns the supervisor commission',
  (select supervisor_commission = 50 from public.bookings where reference = 'SV-1'));
-- a new porter service: always a porter for each passenger, no commission
select pg_temp.raises('a new porter service cannot skip the porter',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000d3', 'Sam', 'SV-X', 'wheelchair_assist', 1, null, 'Kwame', '', null, null, 'cash', null, 0, 30, null, null, null, null, null, '[]'::jsonb, 1)$q$, 'invalid_porters_waived');
select public.create_quick_sale('00000000-0000-0000-0000-0000000000d3', 'Sam', 'SV-2', 'wheelchair_assist', 1, null, 'Kwame', '', null, null, 'cash', 'Yaw', 1, 30);
select pg_temp.check_that('a new porter service earns no supervisor commission',
  (select supervisor_commission = 0 and jsonb_array_length(porters) = 1 from public.bookings where reference = 'SV-2'));
select pg_temp.raises('a service that is switched off cannot be sold',
  $q$update public.service_packages set active = false where code = 'vip_fast_track'; select public.create_quick_sale('00000000-0000-0000-0000-0000000000d3', 'Sam', 'SV-3', 'vip_fast_track', 1, null, 'Esi', '', null, null, 'cash', 'Kojo', 1, 30)$q$, 'package_unavailable');
update public.service_packages set active = true where code = 'vip_fast_track';

-- the shift report counts the new services and still balances
select public.create_quick_sale('00000000-0000-0000-0000-0000000000d3', 'Sam', 'SV-4', 'full_arrival', 1, null, 'Efua', '', null, null, 'cash', 'Kojo', 1, 30);
select pg_temp.check_that('the shift report lists the new meet and assist under departure only, and the porter service as a porter job',
  (select exists (select 1 from jsonb_array_elements(r -> 'meet_assist_entries') e where e ->> 'service_type' = 'departure_only')
      and exists (select 1 from jsonb_array_elements(r -> 'meet_assist_entries') e where e ->> 'service_type' = 'arrival')
      and (r ->> 'porter_total_bookings')::int >= 1
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000d3',
           case when extract(hour from now() at time zone 'utc') < 6 then current_date - 1 else current_date end,
           case when extract(hour from now() at time zone 'utc') between 6 and 17 then 'morning' else 'night' end) r) x));
reset role;

-- the original services are untouched
select pg_temp.check_that('the four original services behave as before',
  (select count(*) = 4 from public.service_packages where code in ('full_arrival', 'full_departure', 'departure_priority', 'porter_only'))
  and (select kind = 'porter' from public.service_packages where code = 'porter_only')
  and (select count(*) = 3 from public.service_packages where code in ('full_arrival', 'full_departure', 'departure_priority') and kind = 'meet_assist'));

rollback;
