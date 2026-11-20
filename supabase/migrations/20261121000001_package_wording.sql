-- The service package wording shown to passengers, and no "not included" lists. Only the text and the lounge switch change;
-- prices, names and whether a package is on sale are left exactly as they are. Safe to run more than once.
update public.service_packages set
  inclusions = 'Meet and greet at the air-bridge, Fast-track escort through security and immigration, Luggage assistance, Customs clearance support, Ground transfer coordination.',
  exclusions = '', includes_lounge = false
where code = 'full_arrival';
update public.service_packages set
  inclusions = 'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening, Lounge access.',
  exclusions = '', includes_lounge = true
where code = 'full_departure';
update public.service_packages set
  inclusions = 'Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening.',
  exclusions = '', includes_lounge = false
where code = 'departure_priority';
update public.service_packages set exclusions = '' where code = 'porter_only';
