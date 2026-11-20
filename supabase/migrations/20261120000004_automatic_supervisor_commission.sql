-- Every meet and assist carries the supervisor commission (GHS 50 by default, from the Supervisor commission setting) automatically.
-- It is added when the booking's first payment is recorded, to the supervisor the booking is assigned to (or the supervisor who
-- recorded the payment). It is taken off the takings in the shift report, and shows in the Commissions list and the accounts.
-- Porter Service Only earns none. A booking that is cancelled or a no-show loses it, unless it is already in a submitted shift report.
-- Applies to bookings paid from now on; commissions already marked are not changed. Safe to run more than once.
create or replace function public.apply_supervisor_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bookings; who text; rate numeric;
begin
  if new.entry_type is distinct from 'payment' then return new; end if;
  select * into b from public.bookings where id::text = new.booking_id for update;
  if not found or b.package_code = 'porter_only' or b.status in ('cancelled', 'no_show')
     or b.supervisor_commission > 0 or b.supervisor_commission_locked then return new; end if;
  who := coalesce(b.assigned_supervisor_id,
                  (select p.id::text from public.profiles p where p.id::text = new.recorded_by_id and p.role = 'supervisor'));
  if who is null then return new; end if;
  select coalesce((select nullif(value, '')::numeric from public.app_settings where key = 'supervisor_commission_per_signup'), 50) into rate;
  if rate is null or rate <= 0 then return new; end if;
  update public.bookings set supervisor_commission = round(rate, 2), supervisor_commission_at = new.created_date, supervisor_commission_by = who
  where id = b.id;
  return new;
end $$;
revoke execute on function public.apply_supervisor_commission() from public, anon, authenticated;

drop trigger if exists payments_supervisor_commission on public.payments;
create trigger payments_supervisor_commission after insert on public.payments
  for each row execute function public.apply_supervisor_commission();

-- A cancelled booking or no-show earns no commission (unless it is already locked into a submitted shift report).
create or replace function public.drop_supervisor_commission_on_close() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled', 'no_show') and old.status is distinct from new.status
     and new.supervisor_commission > 0 and not new.supervisor_commission_locked then
    new.supervisor_commission := 0; new.supervisor_commission_at := null; new.supervisor_commission_by := null;
  end if;
  return new;
end $$;
revoke execute on function public.drop_supervisor_commission_on_close() from public, anon, authenticated;
drop trigger if exists bookings_drop_commission_on_close on public.bookings;
create trigger bookings_drop_commission_on_close before update of status on public.bookings
  for each row execute function public.drop_supervisor_commission_on_close();
