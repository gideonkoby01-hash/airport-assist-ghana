// Input rules for bookings. Ghana is on GMT all year (UTC+0, no daylight saving), so a flight date and time
// entered in Accra can be read as UTC without conversion.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseFlightTime(date: string, time: string): number | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3)));
  // Reject dates that roll over (2026-02-31 becomes March 3rd).
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

// Returns a message to show the user, or null when the flight is acceptable.
// Staff booking at the desk may enter flights that are imminent or just gone; passengers need notice.
export function checkFlight(date: string, time: string, opts: { now: number; minLeadHours: number; isStaff: boolean }): string | null {
  const at = parseFlightTime(date, time);
  if (at === null) return 'Enter the flight date and time as a real date and a 24-hour time (for example 14:30).';
  const hours = (at - opts.now) / 3_600_000;
  if (opts.isStaff) return hours < -24 ? 'That flight is more than a day in the past.' : null;
  if (hours < 0) return 'That flight time has already passed.';
  if (hours < opts.minLeadHours) {
    return `Online bookings need at least ${opts.minLeadHours} hours' notice. For a sooner flight please contact the Airport Assist desk.`;
  }
  if (hours > 24 * 366) return 'Bookings can be made up to one year ahead.';
  return null;
}

export function isPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^\+?[0-9][0-9 ()-]{5,24}$/.test(value.trim()) && digits.length >= 7 && digits.length <= 15;
}
