-- Private file access. Run after the migrations (see run_db_tests.sh).
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'sup2@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'pax1@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'pax2@example.com');
update public.profiles set role = 'admin' where email = 'admin@example.com';
update public.profiles set role = 'supervisor' where email like 'sup%@example.com';

set local role service_role;
-- pax1 uploaded an ID photo for a booking assigned to sup1; sup1 has a profile photo
insert into storage.objects (bucket_id, name, owner) values
  ('private-files', '00000000-0000-0000-0000-0000000000d1/id.jpg', '00000000-0000-0000-0000-0000000000d1'),
  ('private-files', '00000000-0000-0000-0000-0000000000d2/id.jpg', '00000000-0000-0000-0000-0000000000d2'),
  ('private-files', '00000000-0000-0000-0000-0000000000c1/me.jpg', '00000000-0000-0000-0000-0000000000c1');
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, passenger_user_id,
  assigned_supervisor_id, passenger_photo_uri)
values ('S-1', 'full_arrival', 1, 10, 'arrival', 'online', '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1/id.jpg');
insert into public.supervisor_directory (user_id, email, photo_uri)
values ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com', '00000000-0000-0000-0000-0000000000c1/me.jpg');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  set local role authenticated;
end $$;
create function pg_temp.visible(label text, want text[]) returns void language plpgsql as $$
declare got text[];
begin
  select coalesce(array_agg(split_part(name, '/', 2) || '@' || split_part(name, '/', 1) order by name), '{}') into got from storage.objects;
  select coalesce(array_agg(replace(x, '00000000-0000-0000-0000-0000000000', '') order by x), '{}') into want from unnest(want) x;
  got := (select coalesce(array_agg(replace(x, '00000000-0000-0000-0000-0000000000', '') order by x), '{}') from unnest(got) x);
  if got <> want then raise exception 'FAIL %: expected %, got %', label, want, got; end if;
  raise notice 'ok   % %', label, got;
end $$;

reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.visible('passenger sees own file + assigned supervisor photo',
  array['id.jpg@00000000-0000-0000-0000-0000000000d1', 'me.jpg@00000000-0000-0000-0000-0000000000c1']);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.visible('other passenger sees only their own file', array['id.jpg@00000000-0000-0000-0000-0000000000d2']);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.visible('assigned supervisor sees the booking ID photo and own photo',
  array['id.jpg@00000000-0000-0000-0000-0000000000d1', 'me.jpg@00000000-0000-0000-0000-0000000000c1']);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.visible('unassigned supervisor sees nothing', array[]::text[]);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.visible('admin sees every file',
  array['id.jpg@00000000-0000-0000-0000-0000000000d1', 'id.jpg@00000000-0000-0000-0000-0000000000d2', 'me.jpg@00000000-0000-0000-0000-0000000000c1']);

-- uploads only into your own folder
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into storage.objects (bucket_id, name) values ('private-files', '00000000-0000-0000-0000-0000000000d1/new.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('private-files', '00000000-0000-0000-0000-0000000000d2/planted.jpg');
  raise exception 'FAIL upload into another user''s folder was allowed';
exception when insufficient_privilege then raise notice 'ok   cannot upload into another folder'; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('other-bucket', '00000000-0000-0000-0000-0000000000d1/x.jpg');
  raise exception 'FAIL upload into another bucket was allowed';
exception when insufficient_privilege or foreign_key_violation then raise notice 'ok   cannot upload into another bucket'; end $$;
rollback;
