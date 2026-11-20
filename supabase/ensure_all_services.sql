-- All four services on the booking page, with the wording passengers see and no "not included" lists.
-- A service that is missing is added at the standard price; one that already exists keeps its name and price, and only its
-- wording and lounge switch are updated, and it is switched on so passengers can book it. Safe to run more than once.
insert into public.service_packages (code, name, price, flight_type, includes_lounge, inclusions, exclusions, active) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', false,
   'Meet and greet at the air-bridge, Fast-track escort through security and immigration, Luggage assistance, Customs clearance support, Ground transfer coordination.', '', true),
  ('full_departure', 'Full Departure Assist', 850, 'departure', true,
   'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening, Lounge access.', '', true),
  ('departure_priority', 'Departure Priority Only', 500, 'departure', false,
   'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening.', '', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false,
   'Luggage handling and porter escort across the terminal.', '', true)
on conflict (code) do update set
  inclusions = excluded.inclusions,
  exclusions = '',
  includes_lounge = excluded.includes_lounge,
  flight_type = excluded.flight_type,
  active = true;
