-- Airport Assist Ghana: core schema, translated from the former Base44 entity definitions.
--
-- Conventions kept from Base44 so the frontend and ported functions change as little as possible:
--   * every table has id, created_date, updated_date and created_by_id
--   * field names are unchanged (snake_case)
--   * user and record references are text, because the app stores '' for "none"
--   * dates the app treats as strings stay text; created_date/updated_date are timestamptz

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: the app-level "User" (role lives here, never in client-editable metadata)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  role         text not null default 'passenger'
               check (role in ('passenger', 'supervisor', 'management', 'admin', 'pending')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

-- The caller's role, readable inside RLS policies without recursing into profiles' own policies.
create function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

-- Keeps updated_date current.
create function public.touch_updated_date() returns trigger
language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_date();

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  code text not null unique check (code in ('full_arrival', 'full_departure', 'departure_priority', 'porter_only')),
  name text not null,
  price numeric(12,2) not null,
  flight_type text check (flight_type in ('arrival', 'departure', 'both')),
  includes_lounge boolean,
  inclusions text,
  exclusions text,
  active boolean not null default true
);

create table public.lounges (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  name text not null,
  location text,
  active boolean not null default true
);

create table public.porters (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  full_name text not null,
  phone_number text not null,
  active boolean not null default true
);

create table public.supervisor_directory (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  user_id text not null,
  full_name text,
  email text not null,
  active boolean not null default true,
  phone text,
  whatsapp_number text,
  languages text,
  bio text,
  photo_uri text
);
create index supervisor_directory_user_idx on public.supervisor_directory (user_id);

-- ---------------------------------------------------------------------------
-- Bookings and money
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  reference text not null,
  package_code text not null check (package_code in ('full_arrival', 'full_departure', 'departure_priority', 'porter_only')),
  package_name text,
  price_per_passenger numeric(12,2),
  num_passengers integer not null,
  original_total numeric(12,2),
  total_value numeric(12,2) not null,
  discount_code_id text,
  discount_code text,
  discount_type text check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2),
  discount_amount numeric(12,2),
  discount_recipient_type text check (discount_recipient_type in ('individual', 'corporation')),
  discount_recipient_name text,
  discount_redeemed_at text,
  flight_type text not null check (flight_type in ('arrival', 'departure')),
  airline text,
  flight_number text,
  flight_date text,
  scheduled_flight_time text,
  contact text,
  nationality text,
  total_bags integer,
  special_requests text,
  lounge_used text,
  passenger_photo_uri text,
  passengers jsonb not null default '[]'::jsonb,
  porters jsonb not null default '[]'::jsonb,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show')),
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'partially_paid', 'unpaid')),
  amount_collected numeric(12,2) not null default 0,
  outstanding_balance numeric(12,2) not null default 0,
  payment_method text check (payment_method in ('cash', 'mobile_money', 'card', 'corporate_account')),
  assigned_supervisor_id text,
  assigned_supervisor_name text,
  booking_channel text not null check (booking_channel in ('online', 'walk_in')),
  passenger_user_id text
);
create unique index bookings_reference_idx on public.bookings (reference);
create index bookings_passenger_idx on public.bookings (passenger_user_id);
create index bookings_supervisor_idx on public.bookings (assigned_supervisor_id);
create index bookings_created_idx on public.bookings (created_date desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  booking_id text not null,
  booking_reference text,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'mobile_money', 'card', 'corporate_account')),
  balance_after numeric(12,2),
  recorded_by_id text not null,
  recorded_by_name text,
  recorded_at text
);
create index payments_booking_idx on public.payments (booking_id);

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  code text not null unique,
  recipient_type text not null check (recipient_type in ('individual', 'corporation')),
  recipient_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null,
  start_date text not null,
  expiry_date text not null,
  max_uses integer not null,
  max_uses_per_customer integer,
  eligible_email text,
  eligible_domain text,
  eligible_emails jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  redemption_count integer not null default 0,
  total_discount_granted numeric(12,2) not null default 0,
  last_claim_token text
);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  discount_code_id text not null,
  code text not null,
  booking_id text not null,
  booking_reference text,
  user_id text,
  user_email text,
  recipient_type text check (recipient_type in ('individual', 'corporation')),
  recipient_name text,
  discount_type text check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2),
  discount_amount numeric(12,2) not null,
  gross_total numeric(12,2) not null,
  net_total numeric(12,2) not null,
  redeemed_at text
);
create index discount_redemptions_code_idx on public.discount_redemptions (discount_code_id);

create table public.booking_ratings (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  booking_id text not null,
  booking_reference text not null,
  passenger_user_id text not null,
  passenger_name text,
  overall_rating integer not null check (overall_rating between 1 and 5),
  feedback text,
  supervisor_user_id text,
  supervisor_name text,
  package_code text check (package_code in ('full_arrival', 'full_departure', 'departure_priority', 'porter_only')),
  package_name text,
  service_date text,
  submitted_at text not null
);
create unique index booking_ratings_booking_idx on public.booking_ratings (booking_id);

-- ---------------------------------------------------------------------------
-- Staff operations
-- ---------------------------------------------------------------------------
create table public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  supervisor_id text not null,
  supervisor_name text,
  shift_type text not null check (shift_type in ('morning', 'night')),
  shift_date text,
  shift_start text,
  shift_end text,
  booking_count integer,
  total_passengers integer,
  service_breakdown text,
  total_revenue numeric(12,2),
  total_collected numeric(12,2),
  total_outstanding numeric(12,2),
  lounges_used text,
  porter_count integer,
  total_commission numeric(12,2),
  cancellations integer,
  no_shows integer,
  completed integer,
  remarks text,
  booking_ids jsonb not null default '[]'::jsonb,
  reporting_period_start text not null,
  reporting_period_end text,
  meet_assist_entries jsonb not null default '[]'::jsonb,
  porter_total_bookings integer,
  porter_amount_paid numeric(12,2),
  porter_payment_method text check (porter_payment_method in ('pos', 'cash', 'momo')),
  porter_entries jsonb not null default '[]'::jsonb,
  meet_assist_total_paid numeric(12,2),
  porter_total_passengers integer,
  porter_total_commission numeric(12,2),
  grand_total_paid numeric(12,2)
);

create table public.reporting_baselines (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  baseline_at text not null,
  set_by_id text,
  set_by_name text,
  set_by_email text,
  note text
);

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  full_name text,
  email text not null,
  requested_role text not null check (requested_role in ('supervisor', 'management')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  user_id text
);

create table public.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('passenger', 'supervisor', 'management', 'admin'))
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  user_id text not null,
  booking_id text,
  booking_reference text,
  title text not null,
  message text not null,
  read boolean not null default false,
  type text check (type in ('assignment', 'reassignment', 'info', 'status_change', 'shift_report', 'staff_request')),
  previous_status text,
  new_status text,
  supervisor_name text,
  supervisor_id text,
  service_type text,
  shift_report_id text,
  account_request_id text,
  link_path text
);
create index notifications_user_idx on public.notifications (user_id, read);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text default auth.uid()::text,
  event_key text not null,
  template_name text not null,
  recipient_user_id text,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  details text,
  related_entity_id text
);
-- Duplicate-send guard: at most one queued-or-sent row per event.
create unique index email_deliveries_event_claim_idx on public.email_deliveries (event_key)
  where status in ('queued', 'sent');

-- updated_date triggers on every table above
do $$
declare t text;
begin
  for t in select unnest(array[
    'service_packages','lounges','porters','supervisor_directory','bookings','payments','discount_codes',
    'discount_redemptions','booking_ratings','shift_reports','reporting_baselines','account_requests',
    'staff_role_assignments','notifications','email_deliveries'])
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_date()', t || '_touch', t);
  end loop;
end $$;
