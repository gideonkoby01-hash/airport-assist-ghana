-- Server-side building blocks used by the Edge Functions and the signup flow.

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Applies a pending staff invite (by email, case-insensitive) in the same step.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  invited_role text;
begin
  select role into invited_role from public.staff_role_assignments where lower(email) = lower(new.email) limit 1;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(invited_role, 'passenger')
  );
  if invited_role is not null then
    delete from public.staff_role_assignments where lower(email) = lower(new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic payment: one statement checks the balance and moves the money, then logs it.
-- Called only by the recordPayment Edge Function (service role). Raises if the booking is missing
-- or the amount exceeds what is still owed, so two simultaneous payments can never overpay.
-- ---------------------------------------------------------------------------
create function public.record_payment(
  p_booking_id uuid, p_amount numeric, p_method text, p_user_id text, p_user_name text
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_method not in ('cash', 'mobile_money', 'card', 'corporate_account') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;

  update public.bookings set
    amount_collected = round(amount_collected + p_amount, 2),
    outstanding_balance = greatest(0, round(total_value - (amount_collected + p_amount), 2)),
    payment_status = case
      when amount_collected + p_amount >= total_value then 'paid'
      when amount_collected + p_amount > 0 then 'partially_paid'
      else 'unpaid' end,
    payment_method = p_method
  where id = p_booking_id and amount_collected + p_amount <= total_value + 0.001
  returning * into b;

  if not found then
    if exists (select 1 from public.bookings where id = p_booking_id) then
      raise exception 'overpayment' using errcode = 'P0001';
    end if;
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  insert into public.payments (booking_id, booking_reference, amount, method, balance_after,
                               recorded_by_id, recorded_by_name, recorded_at)
  values (p_booking_id::text, b.reference, p_amount, p_method, b.outstanding_balance,
          p_user_id, p_user_name, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  return b;
end $$;

-- ---------------------------------------------------------------------------
-- Atomic discount claim and release (replaces the token-and-recheck dance in createBooking).
-- Returns the updated code row, or null when the code is no longer claimable.
-- ---------------------------------------------------------------------------
create function public.claim_discount(p_code text, p_amount numeric, p_token text)
returns public.discount_codes
language plpgsql security definer set search_path = public as $$
declare d public.discount_codes;
begin
  update public.discount_codes set
    redemption_count = redemption_count + 1,
    total_discount_granted = round(total_discount_granted + p_amount, 2),
    last_claim_token = p_token
  where code = p_code and active
    and (max_uses <= 0 or redemption_count < max_uses)
  returning * into d;
  return d;
end $$;

create function public.release_discount(p_code text, p_amount numeric)
returns void
language sql security definer set search_path = public as $$
  update public.discount_codes set
    redemption_count = greatest(0, redemption_count - 1),
    total_discount_granted = greatest(0, round(total_discount_granted - p_amount, 2))
  where code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Aggregates for the dashboards. SECURITY INVOKER, so RLS still limits the rows a caller can total.
-- Replaces base44 `entity.aggregate({ query, groupBy, sum })`.
-- ---------------------------------------------------------------------------
create function public.aggregate_bookings(
  p_statuses text[] default null, p_created_from timestamptz default null
) returns table (
  status text, count bigint, sum_original_total numeric, sum_discount_amount numeric,
  sum_total_value numeric, sum_amount_collected numeric, sum_outstanding_balance numeric
)
language sql stable security invoker as $$
  select b.status, count(*),
         sum(b.original_total), sum(b.discount_amount), sum(b.total_value),
         sum(b.amount_collected), sum(b.outstanding_balance)
  from public.bookings b
  where (p_statuses is null or b.status = any (p_statuses))
    and (p_created_from is null or b.created_date >= p_created_from)
  group by b.status
  order by count(*) desc
$$;

create function public.aggregate_ratings()
returns table (overall_rating integer, count bigint)
language sql stable security invoker as $$
  select r.overall_rating, count(*) from public.booking_ratings r group by r.overall_rating
$$;

grant execute on function public.record_payment(uuid, numeric, text, text, text) to service_role;
grant execute on function public.claim_discount(text, numeric, text) to service_role;
grant execute on function public.release_discount(text, numeric) to service_role;
revoke execute on function public.record_payment(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_discount(text, numeric, text) from public, anon, authenticated;
revoke execute on function public.release_discount(text, numeric) from public, anon, authenticated;
grant execute on function public.aggregate_bookings(text[], timestamptz) to authenticated;
grant execute on function public.aggregate_ratings() to authenticated;
grant execute on function public.app_role() to anon, authenticated;

-- Realtime: BookingDetail subscribes to booking changes (RLS applies to realtime too).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
