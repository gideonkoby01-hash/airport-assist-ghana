-- Passengers no longer sign in. A booking now carries the email address the passenger gave, and every message about the
-- booking (confirmation, supervisor, status, payment) goes to it. Safe to run more than once.
alter table public.bookings add column if not exists contact_email text;
create index if not exists bookings_contact_email_idx on public.bookings (lower(contact_email)) where contact_email is not null;
