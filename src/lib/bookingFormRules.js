// Checks the booking form in the browser before anything is sent, so people get the message next to the
// field that needs fixing. The server repeats every check (supabase/functions/_shared/validation.ts) and stays
// the authority; the notice period for online bookings is a setting only the server knows.
// Ghana is on GMT all year, so a flight date and time can be read as UTC.

// Same rule as the server: 7 to 15 digits, optional leading +, spaces, brackets and dashes allowed.
export function isPhone(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  return /^\+?[0-9][0-9 ()-]{5,24}$/.test(text) && digits.length >= 7 && digits.length <= 15;
}

export function isEmail(value) {
  const text = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254;
}

export function todayUtc(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function flightMs(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3)));
}

/** @returns {Record<string, string>} one message per field key; empty when the form is fine. Keys: consent, package_code, flight_number, flight_date, scheduled_flight_time, contact, contact_email, passenger_<n>_name. */
export function validateBooking({ form, passengers, channel, consented, porterService = false, now = Date.now() }) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!form.package_code) errors.package_code = 'Choose a service package.';
  if (!String(form.flight_number).trim()) errors.flight_number = 'Enter the flight number, for example KQ 510.';
  if (!form.flight_date) errors.flight_date = 'Choose the flight date.';
  else if (channel === 'online' && form.flight_date < todayUtc(now)) errors.flight_date = 'That date has already passed.';
  if (!form.scheduled_flight_time) errors.scheduled_flight_time = 'Enter the scheduled flight time (24-hour, for example 14:30).';
  else if (channel === 'online' && form.flight_date && !errors.flight_date) {
    const at = flightMs(form.flight_date, form.scheduled_flight_time);
    if (at !== null && at < now) errors.scheduled_flight_time = 'That flight time has already passed.';
  }
  if (channel === 'online') {
    const email = String(form.contact_email ?? '').trim();
    // Porter Service Only is confirmed by text message, so its email is optional (but must be valid if given).
    if (!email && !porterService) errors.contact_email = 'Enter your email address. Your booking details are sent there.';
    else if (email && !isEmail(email)) errors.contact_email = 'Enter a valid email address, for example name@example.com.';
  }
  if (!String(form.contact).trim()) errors.contact = 'Enter a phone or WhatsApp number we can reach you on.';
  else if (!isPhone(form.contact)) errors.contact = 'Enter a phone number with at least 7 digits. Add the country code if it is not a Ghana number.';
  passengers.forEach((p, i) => {
    if (!String(p.name).trim()) errors[`passenger_${i}_name`] = `Enter the name of passenger ${i + 1}.`;
  });
  // Last, because the checkbox is at the bottom of the form: the first message is the first field to fix.
  if (channel === 'online' && !consented) errors.consent = 'Please confirm that you have read the privacy notice.';
  return errors;
}
