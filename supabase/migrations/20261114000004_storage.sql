-- Private file storage: passenger ID photos and supervisor profile photos.
--
-- One private bucket. The browser uploads into its own folder (`<user id>/<random>.<ext>`) and stores the
-- returned path on the booking or supervisor profile. Reading someone else's file is only possible where the
-- app already lets that person see the record the file belongs to (see can_read_private_file).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-files', 'private-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- SECURITY DEFINER because the checks read bookings and the supervisor directory, which a passenger cannot read directly.
create function public.can_read_private_file(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- your own uploads
    (storage.foldername(p_path))[1] = auth.uid()::text
    -- management and admin see every file
    or public.app_role() in ('management', 'admin')
    -- a supervisor sees the ID photo on a booking assigned to them
    or (public.app_role() = 'supervisor' and exists (
         select 1 from public.bookings b
         where b.assigned_supervisor_id = auth.uid()::text and b.passenger_photo_uri = p_path))
    -- a passenger sees the profile photo of the supervisor assigned to one of their bookings
    or exists (
         select 1 from public.supervisor_directory sd
         join public.bookings b on b.assigned_supervisor_id = sd.user_id
         where sd.photo_uri = p_path
           and (b.passenger_user_id = auth.uid()::text or b.created_by_id = auth.uid()::text))
$$;
grant execute on function public.can_read_private_file(text) to authenticated;

create policy private_files_read on storage.objects for select to authenticated
  using (bucket_id = 'private-files' and public.can_read_private_file(name));

-- Upload only into your own folder, and only once per path (no overwrite).
create policy private_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'private-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy private_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'private-files' and (storage.foldername(name))[1] = auth.uid()::text);
