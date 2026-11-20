-- Management sets an actual dollar price for each service (Admin > Service Packages), shown to passengers who choose dollars.
-- It is a displayed price only: bookings, payments and reports stay in cedis. Empty means no dollar price is set for that service.
-- Safe to run more than once.
alter table public.service_packages add column if not exists price_usd numeric(12,2) check (price_usd is null or price_usd >= 0);
