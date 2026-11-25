-- Starting data for a fresh database (applied by `supabase db reset`; for production run it once in the SQL editor).
-- Prices are the ones in src/lib/packages.js. Check them against your current price list before going live;
-- admins can change prices later from Service Packages in the Admin area.
insert into public.service_packages (code, name, price, flight_type, includes_lounge, inclusions, exclusions, active) values
  ('full_arrival', 'Full Arrival Assist', 800, 'arrival', false,
   'Meet and greet at the air-bridge, Fast-track escort through security and immigration, Luggage assistance, Customs clearance support, Ground transfer coordination.',
   '', true),
  ('full_departure', 'Full Departure Assist', 850, 'departure', true,
   'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening, Lounge access.',
   '', true),
  ('departure_priority', 'Departure Priority Only', 500, 'departure', false,
   'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening.',
   '', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false,
   'Luggage handling and porter escort across the terminal.',
   '', true)
on conflict (code) do nothing;
