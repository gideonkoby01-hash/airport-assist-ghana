-- Row-level security, translated from the `rls` blocks in base44/entities/*.jsonc
-- (including the admin-only Booking/Payment writes added in the lock-down).
--
-- Browsers can only do what is allowed here. Everything privileged (creating a priced booking,
-- recording a payment, approving staff) goes through Edge Functions using the service role,
-- which bypasses RLS on purpose.

alter table public.profiles               enable row level security;
alter table public.service_packages       enable row level security;
alter table public.lounges                enable row level security;
alter table public.porters                enable row level security;
alter table public.supervisor_directory   enable row level security;
alter table public.bookings               enable row level security;
alter table public.payments               enable row level security;
alter table public.discount_codes         enable row level security;
alter table public.discount_redemptions   enable row level security;
alter table public.booking_ratings        enable row level security;
alter table public.shift_reports          enable row level security;
alter table public.reporting_baselines    enable row level security;
alter table public.account_requests       enable row level security;
alter table public.staff_role_assignments enable row level security;
alter table public.notifications          enable row level security;
alter table public.email_deliveries       enable row level security;

-- profiles (the app "User"): role changes are admin-only, so a user can never promote themselves.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() in ('admin', 'management'));
create policy profiles_admin_write on public.profiles for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.app_role() = 'admin');
-- No insert policy: profiles are created by the signup trigger only.

-- Public reference data: anyone may read, only admins write.
create policy service_packages_read  on public.service_packages for select to anon, authenticated using (true);
create policy service_packages_write on public.service_packages for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy lounges_read  on public.lounges for select to anon, authenticated using (true);
create policy lounges_write on public.lounges for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- porters: admin and supervisors read, admin writes
create policy porters_read on public.porters for select to authenticated
  using (public.app_role() in ('admin', 'supervisor'));
create policy porters_write on public.porters for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- supervisor_directory: a supervisor reads and edits their own row, management reads all, admin all
create policy supervisor_directory_read on public.supervisor_directory for select to authenticated
  using (user_id = auth.uid()::text or public.app_role() in ('admin', 'management'));
create policy supervisor_directory_insert on public.supervisor_directory for insert to authenticated
  with check (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy supervisor_directory_update on public.supervisor_directory for update to authenticated
  using (user_id = auth.uid()::text or public.app_role() = 'admin')
  with check (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy supervisor_directory_delete on public.supervisor_directory for delete to authenticated
  using (public.app_role() = 'admin');

-- bookings: readable by the passenger, the assigned supervisor, management and admin.
-- Writes are admin-only; the app writes through Edge Functions (service role).
create policy bookings_read on public.bookings for select to authenticated
  using (
    created_by_id = auth.uid()::text
    or passenger_user_id = auth.uid()::text
    or assigned_supervisor_id = auth.uid()::text
    or public.app_role() in ('management', 'admin')
  );
create policy bookings_admin_write on public.bookings for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- payments: a ledger. Read by admin, management and the staff member who recorded it. Admin-only writes.
create policy payments_read on public.payments for select to authenticated
  using (public.app_role() in ('admin', 'management') or recorded_by_id = auth.uid()::text);
create policy payments_admin_write on public.payments for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- discount codes: admin only (passengers validate through the validateDiscountCode function)
create policy discount_codes_admin on public.discount_codes for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy discount_redemptions_read on public.discount_redemptions for select to authenticated
  using (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy discount_redemptions_admin_write on public.discount_redemptions for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- booking ratings: read by the passenger, management and admin; written by the submitBookingRating function
create policy booking_ratings_read on public.booking_ratings for select to authenticated
  using (passenger_user_id = auth.uid()::text or public.app_role() in ('management', 'admin'));
create policy booking_ratings_admin_write on public.booking_ratings for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- shift reports: supervisors, management and admin create; the author or an admin edits
create policy shift_reports_read on public.shift_reports for select to authenticated
  using (created_by_id = auth.uid()::text or public.app_role() in ('management', 'admin'));
create policy shift_reports_insert on public.shift_reports for insert to authenticated
  with check (public.app_role() in ('supervisor', 'management', 'admin') and created_by_id = auth.uid()::text);
create policy shift_reports_update on public.shift_reports for update to authenticated
  using (created_by_id = auth.uid()::text or public.app_role() = 'admin')
  with check (created_by_id = auth.uid()::text or public.app_role() = 'admin');
create policy shift_reports_delete on public.shift_reports for delete to authenticated
  using (public.app_role() = 'admin');

-- reporting baselines: admin and management read, admin writes (via function)
create policy reporting_baselines_read on public.reporting_baselines for select to authenticated
  using (public.app_role() in ('admin', 'management'));
create policy reporting_baselines_admin_write on public.reporting_baselines for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- staff access requests: the requester reads their own, admin does everything
create policy account_requests_read on public.account_requests for select to authenticated
  using (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy account_requests_admin_write on public.account_requests for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- pending staff role invites: admin only
create policy staff_role_assignments_admin on public.staff_role_assignments for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- notifications: the owner reads, marks read and deletes their own; creation is server-side
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid()::text or public.app_role() = 'admin');
create policy notifications_admin_insert on public.notifications for insert to authenticated
  with check (public.app_role() = 'admin');

-- email delivery log: admin only
create policy email_deliveries_admin on public.email_deliveries for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Notification owners may flip `read` only, not rewrite content.
create function public.notifications_only_read_changes() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.user_id is distinct from old.user_id
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.link_path is distinct from old.link_path) then
    raise exception 'notifications: only the read flag can be changed';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.notifications_only_read_changes();

-- Table privileges: RLS is the gate. anon may only read the public catalogue.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.service_packages, public.lounges to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
