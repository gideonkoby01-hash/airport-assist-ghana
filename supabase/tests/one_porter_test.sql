-- One porter handles one passenger; a meet and assist may need none. Run after the migrations.
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'sup-opp@example.com');
update public.profiles set role = 'supervisor' where email = 'sup-opp@example.com';

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

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true) on conflict (code) do nothing;

-- three passengers, three porters: each earns GHS 30 for the job
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-1', 'full_arrival', 3, null, 'Ama', '', null, null, 'cash',
  'Kojo', 1, 30, null, null, null, null, 'porter-kojo', '[{"porter_id":"porter-yaw","porter_name":"Yaw"},{"porter_id":"porter-esi","porter_name":"Esi"}]'::jsonb);
select pg_temp.check_that('three passengers have three porters, GHS 30 each, on a meet and assist',
  (select jsonb_array_length(porters) = 3 and (select sum((e ->> 'commission')::numeric) from jsonb_array_elements(porters) e) = 90
          and (select bool_and((e ->> 'passengers_handled')::int = 1) from jsonb_array_elements(porters) e) from public.bookings where reference = 'OP-1'));
select pg_temp.raises('more porters than passengers are refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-X', 'full_arrival', 2, null, null, null, null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, 'p1', '[{"porter_name":"Yaw"},{"porter_name":"Esi"}]'::jsonb)$q$, 'invalid_porter_passengers');
select pg_temp.raises('a nameless porter is refused',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-X', 'full_arrival', 2, null, null, null, null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, 'p1', '[{"porter_id":"x"}]'::jsonb)$q$, 'invalid_porters');

-- a meet and assist can go without a porter for some or all passengers
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-3', 'full_arrival', 2, null, 'Efua', '', null, null, 'cash',
  'Kojo', 1, 30, null, null, null, null, 'porter-kojo', '[]'::jsonb, 1);
select pg_temp.check_that('2 passengers, 1 porter and 1 needing none: GHS 30 only, nothing missing',
  (select jsonb_array_length(porters) = 1 and porters_waived = 1 and (porters -> 0 ->> 'commission')::numeric = 30 from public.bookings where reference = 'OP-3'));
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-4', 'full_arrival', 2, null, 'Esi', '', null, null, 'cash',
  '', 1, 30, null, null, null, null, null, '[]'::jsonb, 2);
select pg_temp.check_that('a meet and assist with no porter at all is allowed and pays no porter commission',
  (select porters = '[]'::jsonb and porters_waived = 2 from public.bookings where reference = 'OP-4'));
select pg_temp.raises('porters plus passengers needing none cannot exceed the passengers',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-X', 'full_arrival', 2, null, null, null, null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, 'p1', '[{"porter_name":"Yaw"}]'::jsonb, 1)$q$, 'invalid_porter_passengers');
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values ('porter_only', 'Porter Service Only', 100, 'arrival', false) on conflict (code) do nothing;
select pg_temp.raises('Porter Service Only always needs a porter',
  $q$select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-X', 'porter_only', 1, null, null, null, null, null, 'cash', '', 1, 30, null, null, null, null, null, '[]'::jsonb, 1)$q$, 'invalid_porters_waived');

-- the shift cannot close while a passenger has no porter
select public.create_quick_sale('00000000-0000-0000-0000-0000000000c9', 'Sam', 'OP-2', 'full_arrival', 2, null, 'Kwame', '', null, null, 'cash', 'Kojo', 1, 30, null, null, null, null, 'porter-kojo');
create temp table cur as
  select case when extract(hour from now() at time zone 'utc') < 6 then current_date - 1 else current_date end as period,
         case when extract(hour from now() at time zone 'utc') between 6 and 17 then 'morning' else 'night' end as shift;
grant select on cur to service_role;
select pg_temp.check_that('a booking of 2 passengers with 1 porter is counted as missing a porter',
  (select (b ->> 'porters_missing')::int = 1 and (b ->> 'porters_missing_refs') = '["OP-2"]'
   from (select public.build_shift_report('00000000-0000-0000-0000-0000000000c9', (select period from cur), (select shift from cur)) as b) x));
select pg_temp.raises('the shift cannot be filed',
  $q$select public.create_shift_report('00000000-0000-0000-0000-0000000000c9', 'Sam', (select period from cur), (select shift from cur), 3500, '')$q$, 'porter_missing');
update public.bookings set porters = porters || '[{"porter_name":"Yaw","passengers_handled":1,"commission":30}]'::jsonb where reference = 'OP-2';
select pg_temp.check_that('with a porter for each passenger the shift closes',
  (select net_after_commission = 6300 - 180 from public.create_shift_report('00000000-0000-0000-0000-0000000000c9', 'Sam', (select period from cur), (select shift from cur), 3500, '')));
rollback;
