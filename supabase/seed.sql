-- Starting data for a fresh database (applied by `supabase db reset`; for production run it once in the SQL editor).
-- Prices are the ones in src/lib/packages.js. Check them against your current price list before going live;
-- admins can change prices later from Service Packages in the Admin area.
insert into public.service_packages (code, name, price, flight_type, includes_lounge, inclusions, exclusions, active) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true,
   'Meet & greet at the airbridge, Fast-track immigration, Luggage assistance, Customs clearance support, Lounge access, Ground transfer coordination.',
   'Airline ticket, Visa fees, Hotel accommodation.', true),
  ('full_departure', 'Full Departure Assist', 850, 'departure', true,
   'Curbside meet & greet, Check-in assistance, Fast-track security & immigration, Lounge access, Boarding assistance.',
   'Airline ticket, Visa fees, In-flight meals.', true),
  ('departure_priority', 'Departure Priority Only', 500, 'departure', false,
   'Fast-track security & immigration, Priority boarding.',
   'Lounge access, Check-in assistance, Ground transfer.', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false,
   'Luggage handling and porter escort across the terminal.',
   'Immigration fast-track, Lounge access, Any other service.', true)
on conflict (code) do nothing;
