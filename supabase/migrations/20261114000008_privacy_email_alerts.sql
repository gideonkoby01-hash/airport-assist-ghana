-- Audit findings F7-F9: consent record, email delivery tracking and retry, unassigned-booking escalation.

-- Consent to the privacy notice, recorded with the booking (online bookings only; the desk handles walk-ins).
alter table public.bookings add column consent_at timestamptz;

-- Escalation of bookings nobody has picked up.
alter table public.bookings add column unassigned_alerted_at timestamptz;

-- Email delivery tracking. While a send is failed or queued the recipient and variables are kept so it can be
-- retried; they are erased as soon as the email is accepted, so successful sends hold no personal data.
alter table public.email_deliveries
  add column to_email text,
  add column variables jsonb,
  add column provider_id text,
  add column attempts integer not null default 1,
  add column last_attempt_at timestamptz not null default now();
create index email_deliveries_provider_idx on public.email_deliveries (provider_id) where provider_id is not null;

-- Provider feedback (from the Resend webhook) adds three outcomes.
alter table public.email_deliveries drop constraint email_deliveries_status_check;
alter table public.email_deliveries add constraint email_deliveries_status_check
  check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped'));

-- One claim per event while it is queued, sent or delivered (a bounce or a failure may be tried again).
drop index public.email_deliveries_event_claim_idx;
create unique index email_deliveries_event_claim_idx on public.email_deliveries (event_key)
  where status in ('queued', 'sent', 'delivered');
