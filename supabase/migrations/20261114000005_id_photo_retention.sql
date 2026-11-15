-- Passenger ID photos are kept for a fixed period after the service date, then deleted.
-- The purgeIdPhotos Edge Function calls purgeable_private_files() daily, removes the files through the
-- Storage API (deleting rows from storage.objects would leave the file contents behind) and clears the
-- booking's photo reference.

alter table public.bookings add column passenger_photo_deleted_at timestamptz;

-- Files that should be deleted now:
--   1. the ID photo of any booking whose flight date is more than p_retention_days days ago
--   2. uploads that were never attached to a booking or a supervisor profile and are older than p_orphan_days
-- Supervisor profile photos that are still referenced are never listed.
create function public.purgeable_private_files(p_retention_days integer default 30, p_orphan_days integer default 7)
returns table (path text, reason text)
language sql stable security definer set search_path = public, storage as $$
  select b.passenger_photo_uri, 'booking_past_retention'
  from public.bookings b
  where coalesce(b.passenger_photo_uri, '') <> ''
    and b.flight_date ~ '^\d{4}-\d{2}-\d{2}$'
    and b.flight_date::date < current_date - p_retention_days
  union
  select o.name, 'orphan_upload'
  from storage.objects o
  where o.bucket_id = 'private-files'
    and o.created_at < now() - make_interval(days => p_orphan_days)
    and not exists (select 1 from public.bookings b where b.passenger_photo_uri = o.name)
    and not exists (select 1 from public.supervisor_directory sd where sd.photo_uri = o.name)
$$;

revoke execute on function public.purgeable_private_files(integer, integer) from public, anon, authenticated;
grant execute on function public.purgeable_private_files(integer, integer) to service_role;
