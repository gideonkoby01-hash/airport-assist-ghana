-- Porter logins: a porter signs in with their phone number and a password and sees only their own shifts, jobs and earnings.
--
-- Porters are not accounts of the sign-in service. They have a row here instead, and the password is checked by the "porterLogin"
-- function, which hands back a signed session. Nothing in this table or in the three functions below can be reached from the website
-- directly: only the backend (the service role) can read or call them, and every call is for one porter id the backend has already
-- checked. A porter's session can never read another porter's work.
-- Safe to run more than once.

create table if not exists public.porter_logins (
  porter_id uuid primary key references public.porters (id) on delete cascade,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  phone text not null check (phone ~ '^\+[0-9]{9,15}$'),       -- +233241234567, the number they type to sign in
  password_hash text not null,                                  -- salted PBKDF2, never the password itself
  must_change_password boolean not null default true,           -- true until they choose their own after the first sign-in
  disabled boolean not null default false,
  token_version integer not null default 1,                     -- raised to end every session this porter has open
  last_login_at timestamptz,
  created_by_name text
);
create unique index if not exists porter_logins_phone_key on public.porter_logins (phone);

alter table public.porter_logins enable row level security;
revoke all on public.porter_logins from anon, authenticated;
grant all on public.porter_logins to service_role;
drop trigger if exists porter_logins_touch on public.porter_logins;
create trigger porter_logins_touch before update on public.porter_logins for each row execute function public.touch_updated_date();
-- The audit trail keeps who/when but never the password hash.
drop trigger if exists audit_porter_logins on public.porter_logins;
create trigger audit_porter_logins after insert or update or delete on public.porter_logins for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- What the porter dashboard shows
-- ---------------------------------------------------------------------------
create or replace function public.porter_dashboard(p_porter uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me record;
  today date := (now() at time zone 'Africa/Accra')::date;
  key_name text;
  result jsonb;
begin
  select id, btrim(full_name) as full_name, phone_number, active into me from public.porters where id = p_porter;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  key_name := lower(me.full_name);

  select jsonb_build_object(
    'porter', jsonb_build_object('id', me.id, 'name', me.full_name, 'phone', me.phone_number, 'active', me.active),
    'today', today,

    -- the porter rosters this month and next that this porter is on (the website works out each day from the pattern)
    'rosters', coalesce((
      select jsonb_agg(jsonb_build_object('month', r.month, 'anchor_date', r.anchor_date, 'phases', r.phases, 'group_no', m.group_no) order by r.month)
      from public.shift_rosters r
      join public.shift_roster_members m on m.roster_id = r.id
      where r.kind = 'porter'
        and r.month between date_trunc('month', today)::date and (date_trunc('month', today) + interval '1 month')::date
        and (m.person_id = me.id::text or (m.person_id like 'name:%' and lower(btrim(m.person_name)) = key_name))
    ), '[]'::jsonb),

    -- jobs from 3 days ago to 30 days ahead, only the porter's own entry on each booking, and no passenger contact details
    'jobs', coalesce((
      select jsonb_agg(j order by j ->> 'flight_date', j ->> 'scheduled_flight_time', j ->> 'reference')
      from (
        select jsonb_build_object(
          'reference', b.reference, 'flight_type', b.flight_type, 'airline', b.airline, 'flight_number', b.flight_number,
          'flight_date', b.flight_date, 'scheduled_flight_time', b.scheduled_flight_time, 'package_name', b.package_name,
          'status', b.status, 'lounge_used', b.lounge_used,
          'lead_passenger', nullif(btrim(b.passengers -> 0 ->> 'name'), ''), 'num_passengers', b.num_passengers,
          'total_bags', b.total_bags, 'special_requests', nullif(btrim(b.special_requests), ''),
          'supervisor_name', b.assigned_supervisor_name,
          'supervisor_phone', (select d.phone from public.supervisor_directory d where d.user_id = b.assigned_supervisor_id and d.active limit 1),
          'passengers_handled', coalesce((e ->> 'passengers_handled')::integer, 0),
          'commission', coalesce((e ->> 'commission')::numeric, 0),
          'done_at', nullif(e ->> 'done_at', '')
        ) as j
        from public.bookings b
        cross join lateral jsonb_array_elements(b.porters) e
        where b.status in ('confirmed', 'assigned', 'in_progress', 'completed')
          and b.flight_date between to_char(today - 3, 'YYYY-MM-DD') and to_char(today + 30, 'YYYY-MM-DD')
          and (e ->> 'porter_id' = me.id::text or (coalesce(e ->> 'porter_id', '') = '' and lower(btrim(e ->> 'porter_name')) = key_name))
      ) q
    ), '[]'::jsonb),

    -- what was earned (completed jobs only, the same rule the office uses) and what has been paid, day by day for 90 days
    'earnings', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'jobs', d.jobs, 'passengers', d.pax, 'earned', d.earned, 'paid', d.paid) order by d.day desc)
      from (
        select coalesce(w.day, g.day) as day, coalesce(w.jobs, 0) as jobs, coalesce(w.pax, 0) as pax,
               round(coalesce(w.earned, 0), 2) as earned, round(coalesce(g.paid, 0), 2) as paid
        from (
          select b.flight_date::date as day, count(*)::integer as jobs, sum(coalesce((e ->> 'passengers_handled')::integer, 0))::integer as pax,
                 sum(coalesce((e ->> 'commission')::numeric, 0)) as earned
          from public.bookings b cross join lateral jsonb_array_elements(b.porters) e
          where b.status = 'completed' and b.flight_date >= to_char(today - 90, 'YYYY-MM-DD')
            and (e ->> 'porter_id' = me.id::text or (coalesce(e ->> 'porter_id', '') = '' and lower(btrim(e ->> 'porter_name')) = key_name))
          group by 1
        ) w
        full join (
          select p.pay_date as day, sum(p.amount) as paid from public.porter_payouts p
          where p.pay_date >= today - 90 and p.porter_key in (me.id::text, key_name) group by 1
        ) g on g.day = w.day
      ) d
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- A porter marks their own job done
-- ---------------------------------------------------------------------------
-- Sets "done_at" on the porter's own entry of the booking. It does not complete the booking (a supervisor does that) and it does not
-- change what is paid. A job can be marked done on its day or after, not before, and not on a cancelled or no-show booking.
create or replace function public.porter_mark_done(p_porter uuid, p_reference text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me record;
  b public.bookings;
  today date := (now() at time zone 'Africa/Accra')::date;
  key_name text;
  mine boolean;
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  existing text;
begin
  select id, btrim(full_name) as full_name into me from public.porters where id = p_porter and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  key_name := lower(me.full_name);

  select * into b from public.bookings where reference = btrim(p_reference) for update;
  if not found then raise exception 'not_yours' using errcode = 'P0001'; end if;
  select exists (
    select 1 from jsonb_array_elements(b.porters) e
    where e ->> 'porter_id' = me.id::text or (coalesce(e ->> 'porter_id', '') = '' and lower(btrim(e ->> 'porter_name')) = key_name)
  ) into mine;
  if not mine then raise exception 'not_yours' using errcode = 'P0001'; end if;
  if b.status in ('cancelled', 'no_show') then raise exception 'closed' using errcode = 'P0001'; end if;
  if b.flight_date is null or b.flight_date::date > today then raise exception 'too_early' using errcode = 'P0001'; end if;

  select e ->> 'done_at' into existing from jsonb_array_elements(b.porters) e
  where e ->> 'porter_id' = me.id::text or (coalesce(e ->> 'porter_id', '') = '' and lower(btrim(e ->> 'porter_name')) = key_name) limit 1;
  if coalesce(existing, '') <> '' then return jsonb_build_object('reference', b.reference, 'done_at', existing, 'already', true); end if;

  update public.bookings set porters = (
    select jsonb_agg(case when e ->> 'porter_id' = me.id::text or (coalesce(e ->> 'porter_id', '') = '' and lower(btrim(e ->> 'porter_name')) = key_name)
                          then e || jsonb_build_object('done_at', stamp) else e end order by n)
    from jsonb_array_elements(b.porters) with ordinality as t(e, n)
  ) where id = b.id;
  return jsonb_build_object('reference', b.reference, 'done_at', stamp, 'already', false);
end $$;

-- Only the backend calls these; the website cannot.
revoke all on function public.porter_dashboard(uuid) from public, anon, authenticated;
revoke all on function public.porter_mark_done(uuid, text) from public, anon, authenticated;
grant execute on function public.porter_dashboard(uuid) to service_role;
grant execute on function public.porter_mark_done(uuid, text) to service_role;
