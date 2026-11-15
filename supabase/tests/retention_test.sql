-- ID photo retention: which files purgeable_private_files() lists. Run after the migrations.
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'sup1@example.com');
set local role service_role;

-- bookings: service 40 days ago (past retention), 10 days ago (keep), tomorrow (keep), 40 days ago but no photo
insert into public.bookings (reference, package_code, num_passengers, total_value, flight_type, booking_channel, flight_date, passenger_photo_uri) values
  ('R-OLD',    'full_arrival', 1, 1, 'arrival', 'online', to_char(current_date - 40, 'YYYY-MM-DD'), 'u1/old.jpg'),
  ('R-RECENT', 'full_arrival', 1, 1, 'arrival', 'online', to_char(current_date - 10, 'YYYY-MM-DD'), 'u1/recent.jpg'),
  ('R-FUTURE', 'full_arrival', 1, 1, 'arrival', 'online', to_char(current_date + 1,  'YYYY-MM-DD'), 'u1/future.jpg'),
  ('R-NOPIC',  'full_arrival', 1, 1, 'arrival', 'online', to_char(current_date - 40, 'YYYY-MM-DD'), ''),
  ('R-BADDATE','full_arrival', 1, 1, 'arrival', 'online', 'tomorrow',                                'u1/baddate.jpg');
insert into public.supervisor_directory (user_id, email, photo_uri) values ('s1', 's@example.com', 's1/profile.jpg');

-- storage: every file above, plus uploads that were never attached
insert into storage.objects (bucket_id, name, created_at) values
  ('private-files', 'u1/old.jpg',      now() - interval '41 days'),
  ('private-files', 'u1/recent.jpg',   now() - interval '11 days'),
  ('private-files', 'u1/future.jpg',   now() - interval '1 day'),
  ('private-files', 'u1/baddate.jpg',  now() - interval '50 days'),
  ('private-files', 's1/profile.jpg', now() - interval '400 days'),
  ('private-files', 'u1/abandoned-old.jpg', now() - interval '8 days'),
  ('private-files', 'u1/abandoned-new.jpg', now() - interval '1 day');

do $$
declare got text;
begin
  select string_agg(path || ':' || reason, ', ' order by path) into got from public.purgeable_private_files(30, 7);
  if got is distinct from 'u1/abandoned-old.jpg:orphan_upload, u1/old.jpg:booking_past_retention' then
    raise exception 'FAIL purge list was: %', got;
  end if;
  raise notice 'ok   purge list: %', got;
end $$;

-- a different retention period changes the list
do $$
declare n int;
begin
  select count(*) into n from public.purgeable_private_files(5, 7) where reason = 'booking_past_retention';
  if n <> 2 then raise exception 'FAIL expected 2 bookings past a 5-day period, got %', n; end if;
  raise notice 'ok   retention period is respected (5 days lists 2 bookings)';
end $$;

-- only the service role may call it
reset role;
set local role authenticated;
do $$ begin
  perform * from public.purgeable_private_files();
  raise exception 'FAIL a signed-in user could list purgeable files';
exception when insufficient_privilege then raise notice 'ok   not callable by signed-in users'; end $$;
rollback;
