-- Customer CRM: one record per customer, built from bookings, with tags, notes, follow-ups and marketing consent.
-- Visible to admin and management only. Bookings are linked to a customer automatically.

-- Digits only, with Ghana numbers brought to one form: 024 123 4567, +233 24 123 4567 and 00233241234567 all match.
create function public.normalise_phone(p text) returns text
language sql immutable as $$
  select case
    when d.digits = '' then null
    when d.digits like '00%' then nullif(substr(d.digits, 3), '')
    when d.digits like '0%' and length(d.digits) = 10 then '233' || substr(d.digits, 2)
    else d.digits
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as digits) d
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  updated_by_id text,
  user_id text,                                  -- the website account, when they have one
  full_name text not null default '' check (char_length(full_name) <= 160),
  phone text not null default '' check (char_length(phone) <= 40),
  phone_key text,                                -- normalised phone, used to recognise the same person again
  email text not null default '' check (char_length(email) <= 200),
  nationality text not null default '' check (char_length(nationality) <= 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  marketing_consent boolean not null default false,
  erased_at timestamptz
);
create unique index customers_user_idx on public.customers (user_id) where user_id is not null;
create unique index customers_phone_idx on public.customers (phone_key) where phone_key is not null;
create index customers_name_idx on public.customers (lower(full_name));

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'call', 'whatsapp', 'email', 'meeting', 'complaint')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  follow_up_on date,
  done boolean not null default false,
  author_id text,
  author_name text
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_date desc);
create index customer_notes_followup_idx on public.customer_notes (follow_up_on) where follow_up_on is not null and not done;

alter table public.bookings add column customer_id uuid;
create index bookings_customer_idx on public.bookings (customer_id);

-- The phone key follows the phone number. Two customers cannot share one number.
create function public.customers_set_key() returns trigger language plpgsql as $$
begin
  new.phone_key := public.normalise_phone(new.phone);
  return new;
end $$;
create trigger customers_key before insert or update of phone on public.customers
  for each row execute function public.customers_set_key();

-- Who wrote a note comes from the signed-in person, never from the browser. After it is written only the
-- follow-up date and "done" can change.
create function public.customer_notes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid()::text;
    select coalesce(nullif(full_name, ''), email) into new.author_name from public.profiles where id = auth.uid();
    return new;
  end if;
  if (new.customer_id, new.kind, new.body, new.author_id, new.author_name, new.created_date)
     is distinct from (old.customer_id, old.kind, old.body, old.author_id, old.author_name, old.created_date) then
    raise exception 'notes_are_append_only' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger customer_notes_guard_trg before insert or update on public.customer_notes
  for each row execute function public.customer_notes_guard();

-- Finds the customer for a booking, or creates one. A booking with neither an account nor a phone number
-- (an anonymous desk sale) gets no customer: that would only fill the list with "Walk-in".
create function public.link_customer(p_user_id text, p_name text, p_contact text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  key text := public.normalise_phone(p_contact);
  uid uuid;
  prof public.profiles;
  has_user boolean := coalesce(p_user_id, '') <> '';
  key_taken boolean;
  display_name text;
begin
  if not has_user and key is null then return null; end if;

  if has_user then
    select id into cid from public.customers where user_id = p_user_id;
    begin uid := p_user_id::uuid; exception when others then uid := null; end;
    if uid is not null then select * into prof from public.profiles where id = uid; end if;
  end if;
  display_name := coalesce(nullif(btrim(prof.full_name), ''), nullif(btrim(p_name), ''), '');

  if cid is null and key is not null then
    select id into cid from public.customers where phone_key = key;
    if cid is not null and has_user then
      -- A guest record with this number becomes the account holder's record, unless it belongs to someone else.
      update public.customers set user_id = p_user_id where id = cid and user_id is null;
      if not found then cid := null; end if;
    end if;
  end if;

  select exists (select 1 from public.customers where phone_key = key and id is distinct from cid) into key_taken;

  if cid is null then
    insert into public.customers (user_id, full_name, phone, email)
    values (nullif(p_user_id, ''), display_name, case when key_taken then '' else coalesce(btrim(p_contact), '') end, coalesce(prof.email, ''))
    returning id into cid;
  else
    update public.customers set
      full_name = case when full_name = '' then display_name else full_name end,
      email = case when email = '' then coalesce(prof.email, '') else email end,
      phone = case when phone = '' and not key_taken then coalesce(btrim(p_contact), '') else phone end
    where id = cid and erased_at is null;
  end if;
  return cid;
end $$;

create function public.bookings_link_customer() returns trigger language plpgsql as $$
begin
  if new.customer_id is null then
    new.customer_id := public.link_customer(new.passenger_user_id, new.passengers -> 0 ->> 'name', new.contact);
  end if;
  return new;
end $$;
create trigger bookings_link_customer before insert on public.bookings
  for each row execute function public.bookings_link_customer();

-- Existing bookings: link them without leaving audit entries or touching their updated dates.
alter table public.bookings disable trigger user;
do $$
declare r record;
begin
  for r in select id, passenger_user_id, passengers -> 0 ->> 'name' as n, contact
           from public.bookings where customer_id is null order by created_date
  loop
    update public.bookings set customer_id = public.link_customer(r.passenger_user_id, r.n, r.contact) where id = r.id;
  end loop;
end $$;
alter table public.bookings enable trigger user;

-- The customer list with what they have booked and spent. Admin and management only.
create function public.crm_customers(
  p_search text default '', p_segment text default 'all', p_sort text default 'recent',
  p_limit integer default 50, p_offset integer default 0
) returns table (
  id uuid, full_name text, phone text, email text, user_id text, tags text[], marketing_consent boolean,
  bookings_count bigint, completed_count bigint, booked_value numeric, collected numeric, outstanding numeric,
  first_flight text, last_flight text, segment text, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  term text := btrim(coalesce(p_search, ''));
  digits text := ltrim(regexp_replace(term, '\D', '', 'g'), '0');
  lapsed_before text := to_char(current_date - 180, 'YYYY-MM-DD');
begin
  if public.app_role() not in ('admin', 'management') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with agg as (
    select c.id, c.full_name, c.phone, c.email, c.user_id, c.tags, c.marketing_consent,
      count(b.id) filter (where b.status <> 'cancelled') as bookings_count,
      count(b.id) filter (where b.status = 'completed') as completed_count,
      coalesce(sum(b.total_value) filter (where b.status not in ('cancelled', 'no_show')), 0) as booked_value,
      coalesce(sum(b.amount_collected) filter (where b.status <> 'cancelled'), 0) as collected,
      coalesce(sum(b.outstanding_balance) filter (where b.status not in ('cancelled', 'no_show')), 0) as outstanding,
      min(b.flight_date) filter (where b.status <> 'cancelled') as first_flight,
      max(b.flight_date) filter (where b.status <> 'cancelled') as last_flight,
      c.created_date
    from public.customers c
    left join public.bookings b on b.customer_id = c.id
    where c.erased_at is null
      and (term = ''
           or c.full_name ilike '%' || term || '%'
           or c.email ilike '%' || term || '%'
           or (length(digits) >= 3 and c.phone_key like '%' || digits || '%'))
    group by c.id
  ), labelled as (
    select a.*, case
        when 'vip' = any (a.tags) then 'vip'
        when a.bookings_count = 0 then 'new'
        when a.last_flight < lapsed_before then 'lapsed'
        when a.bookings_count >= 2 then 'returning'
        else 'new'
      end as segment
    from agg a
  )
  select l.id, l.full_name, l.phone, l.email, l.user_id, l.tags, l.marketing_consent,
         l.bookings_count, l.completed_count, l.booked_value, l.collected, l.outstanding,
         l.first_flight, l.last_flight, l.segment, count(*) over () as total_count
  from labelled l
  where p_segment = 'all' or l.segment = p_segment
  order by
    case when p_sort = 'value' then l.collected end desc nulls last,
    case when p_sort = 'bookings' then l.bookings_count end desc nulls last,
    case when p_sort = 'name' then lower(l.full_name) end asc,
    l.last_flight desc nulls last, l.created_date desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- Deletes a customer's personal details on request (admin only). Money records stay but no longer name them.
-- A customer with a website account is erased from Staff accounts instead, which also removes their login and files.
create function public.crm_erase_customer(p_customer_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into c from public.customers where id = p_customer_id;
  if not found then raise exception 'customer_not_found' using errcode = 'P0001'; end if;
  if c.user_id is not null then raise exception 'has_account' using errcode = 'P0001'; end if;

  update public.bookings b set
    contact = '', nationality = '', special_requests = '',
    passengers = coalesce((select jsonb_agg(jsonb_build_object(
        'name', 'Deleted passenger', 'contact', '', 'nationality', '',
        'total_bags', coalesce((e ->> 'total_bags')::numeric, 0), 'special_requests', '')) from jsonb_array_elements(b.passengers) e), '[]'::jsonb)
  where b.customer_id = p_customer_id;
  delete from public.customer_notes where customer_id = p_customer_id;
  update public.customers set full_name = '', phone = '', email = '', nationality = '', tags = '{}',
    marketing_consent = false, erased_at = now() where id = p_customer_id;
end $$;

-- A person's own erasure (Staff accounts > Erase) also blanks their customer record.
create or replace function public.anonymise_user_data(p_user_id text) returns table (path text)
language plpgsql security definer set search_path = public as $$
declare paths text[];
begin
  select coalesce(array_agg(x), '{}') into paths from (
    select passenger_photo_uri as x from public.bookings
      where passenger_user_id = p_user_id and coalesce(passenger_photo_uri, '') <> ''
    union
    select photo_uri from public.supervisor_directory where user_id = p_user_id and coalesce(photo_uri, '') <> ''
  ) s;

  update public.bookings b set
    contact = '', nationality = '', special_requests = '',
    passengers = coalesce((select jsonb_agg(jsonb_build_object(
        'name', 'Deleted passenger', 'contact', '', 'nationality', '',
        'total_bags', coalesce((e ->> 'total_bags')::numeric, 0), 'special_requests', '')) from jsonb_array_elements(b.passengers) e), '[]'::jsonb),
    passenger_photo_uri = '', passenger_photo_deleted_at = now()
  where b.passenger_user_id = p_user_id;
  update public.booking_ratings set passenger_name = '', feedback = '' where passenger_user_id = p_user_id;
  update public.discount_redemptions set user_email = '' where user_id = p_user_id;
  update public.account_requests set full_name = '', email = 'deleted' where user_id = p_user_id;
  delete from public.customer_notes where customer_id in (select id from public.customers where user_id = p_user_id);
  update public.customers set full_name = '', phone = '', email = '', nationality = '', tags = '{}',
    marketing_consent = false, erased_at = now(), user_id = null where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.supervisor_directory where user_id = p_user_id;
  return query select unnest(paths);
end $$;

-- Row-level security: admin and management only; browsers cannot create customers except through bookings
-- or the "new customer" form, and cannot delete them.
alter table public.customers enable row level security;
alter table public.customer_notes enable row level security;

create policy customers_staff_read on public.customers for select to authenticated
  using (public.app_role() in ('admin', 'management'));
create policy customers_staff_insert on public.customers for insert to authenticated
  with check (public.app_role() in ('admin', 'management') and user_id is null and erased_at is null);
create policy customers_staff_update on public.customers for update to authenticated
  using (public.app_role() in ('admin', 'management') and erased_at is null)
  with check (public.app_role() in ('admin', 'management') and erased_at is null);

create policy customer_notes_staff_read on public.customer_notes for select to authenticated
  using (public.app_role() in ('admin', 'management'));
create policy customer_notes_staff_insert on public.customer_notes for insert to authenticated
  with check (public.app_role() in ('admin', 'management'));
create policy customer_notes_staff_update on public.customer_notes for update to authenticated
  using (public.app_role() in ('admin', 'management')) with check (public.app_role() in ('admin', 'management'));
create policy customer_notes_admin_delete on public.customer_notes for delete to authenticated
  using (public.app_role() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['customers', 'customer_notes'] loop
    execute format('create policy disabled_accounts_blocked on public.%I as restrictive for all to authenticated using (public.app_role() is distinct from ''disabled'')', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_date()', t || '_touch', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

revoke all on public.customers, public.customer_notes from anon;
revoke delete, truncate on public.customers from authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update, delete on public.customer_notes to authenticated;
grant all on public.customers, public.customer_notes to service_role;

revoke all on function public.link_customer(text, text, text) from public, anon, authenticated;
revoke all on function public.crm_customers(text, text, text, integer, integer) from public, anon;
revoke all on function public.crm_erase_customer(uuid) from public, anon;
grant execute on function public.link_customer(text, text, text) to service_role;
grant execute on function public.crm_customers(text, text, text, integer, integer) to authenticated;
grant execute on function public.crm_erase_customer(uuid) to authenticated;
