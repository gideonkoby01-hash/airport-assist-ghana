-- Text messages to passengers (Hubtel): a log of each message, so the same event is never texted twice and failures can be seen.
-- The phone number and the text are kept only while a send is unfinished; they are erased once Hubtel accepts the message.
-- Safe to run more than once.

create table if not exists public.sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  event_key text not null,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  details text,
  provider_id text,
  related_entity_id text,
  to_phone text,
  body text,
  attempts integer not null default 1,
  last_attempt_at timestamptz
);
-- One live message per event: a second attempt for the same event finds the first and does nothing.
create unique index if not exists sms_deliveries_event_claim_idx on public.sms_deliveries (event_key) where status in ('queued', 'sent');
create index if not exists sms_deliveries_related_idx on public.sms_deliveries (related_entity_id);

alter table public.sms_deliveries enable row level security;
revoke all on public.sms_deliveries from anon, authenticated;
grant all on public.sms_deliveries to service_role;
-- Admin and management can see how texts went (without the phone number or the text).
grant select (id, created_date, event_key, status, details, provider_id, related_entity_id, last_attempt_at) on public.sms_deliveries to authenticated;
drop policy if exists sms_deliveries_read on public.sms_deliveries;
create policy sms_deliveries_read on public.sms_deliveries for select to authenticated using (public.app_role() in ('admin', 'management'));
drop trigger if exists sms_deliveries_touch on public.sms_deliveries;
create trigger sms_deliveries_touch before update on public.sms_deliveries for each row execute function public.touch_updated_date();
