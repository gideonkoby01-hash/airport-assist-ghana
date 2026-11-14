// Shared booking authorization and write helpers for the backend functions.
//
// Bookings are written only by backend functions (service role). Row-level
// security gives clients read access and nothing more, so a browser can never
// set its own price, discount, payment or status fields directly.

export const STAFF_ROLES = ['supervisor', 'management', 'admin'];

// The passenger account that owns a booking. Bookings created by createBooking
// carry an explicit passenger_user_id (the service role does not stamp the
// real caller as created_by_id); older bookings only have created_by_id.
export function bookingOwnerId(booking) {
  return (booking && (booking.passenger_user_id || booking.created_by_id)) || '';
}

// Management and admin may operate on any booking. A supervisor may only
// operate on a booking assigned to them (the same rule the old update RLS had).
export function canOperateBooking(user, booking) {
  if (!user || !booking) return false;
  if (user.role === 'admin' || user.role === 'management') return true;
  return user.role === 'supervisor' && booking.assigned_supervisor_id === user.id;
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
