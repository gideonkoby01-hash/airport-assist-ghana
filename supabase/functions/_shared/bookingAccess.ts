// Booking authorisation shared by the Edge Functions.
//
// Bookings are written only by Edge Functions (service role). Row-level security gives browsers
// read access and nothing more, so a browser can never set its own price, discount, payment or status.
import type { Profile } from './auth.ts';

export const STAFF_ROLES = ['supervisor', 'management', 'admin'];

type BookingLike = { passenger_user_id?: string | null; created_by_id?: string | null; assigned_supervisor_id?: string | null };

// The passenger account that owns a booking.
export function bookingOwnerId(booking: BookingLike | null | undefined): string {
  return (booking && (booking.passenger_user_id || booking.created_by_id)) || '';
}

// Management and admin may operate on any booking. A supervisor only on one assigned to them.
export function canOperateBooking(user: Pick<Profile, 'id' | 'role'> | null, booking: BookingLike | null): boolean {
  if (!user || !booking) return false;
  if (user.role === 'admin' || user.role === 'management') return true;
  return user.role === 'supervisor' && booking.assigned_supervisor_id === user.id;
}

// Who may read a booking through a function (mirrors the bookings read policy).
export function canViewBooking(user: Pick<Profile, 'id' | 'role'>, booking: BookingLike): boolean {
  return canOperateBooking(user, booking) || bookingOwnerId(booking) === user.id;
}

export function round2(n: unknown): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
