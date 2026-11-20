// Rules for putting porters on a booking. A porter handles one passenger and earns the fixed commission once for that job, so the number of
// passengers credited is capped by what the booking actually has.

type Entry = { passengers_handled?: unknown };

/** Returns a message to show, or null when `handled` more passengers can be credited on this booking. */
export function checkPorterShare(existing: Entry[], handled: unknown, passengersOnBooking: unknown): string | null {
  const n = Number(handled);
  if (!Number.isInteger(n) || n < 1 || n > 50) return 'Passengers handled must be a whole number from 1 to 50.';
  const total = Number(passengersOnBooking);
  if (!Number.isInteger(total) || total < 1) return null; // an unusual old record: the 1 to 50 check is all we can say
  const already = existing.reduce((s, e) => s + (Number(e.passengers_handled) || 0), 0);
  if (already + n > total) {
    const left = Math.max(0, total - already);
    return left === 0
      ? `This booking has ${total} passenger${total === 1 ? '' : 's'}, and porters already cover all of them.`
      : `Only ${left} passenger${left === 1 ? '' : 's'} on this booking ${left === 1 ? 'is' : 'are'} not yet covered by a porter.`;
  }
  return null;
}

/** The commission for a porter job: the rate in force now, times passengers handled. Stored on the booking, so later rate changes never rewrite it. */
export function porterCommission(ratePerPassenger: number, handled: number): number {
  return Math.round((ratePerPassenger * handled + Number.EPSILON) * 100) / 100;
}

type Actor = { id: string; role: string };
type BookingForPorter = { booking_channel?: string | null; assigned_supervisor_id?: string | null; status?: string | null };

/**
 * Who puts a porter on a booking. The supervisor a booking is assigned to chooses the porter, if one is used: for a website
 * booking that management has given them, and for a walk-in at the desk alike. Management and admin can also do it.
 * Nobody can change porters on a booking that was cancelled.
 */
export function canAssignPorter(user: Actor | null, booking: BookingForPorter | null): boolean {
  if (!user || !booking) return false;
  if (booking.status === 'cancelled' || booking.status === 'no_show') return false;
  if (user.role === 'admin' || user.role === 'management') return true;
  return user.role === 'supervisor' && !!booking.assigned_supervisor_id && booking.assigned_supervisor_id === user.id;
}

