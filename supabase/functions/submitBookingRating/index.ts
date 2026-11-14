import { adminClient, requireCaller } from '../_shared/auth.ts';
import { bookingOwnerId } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const PACKAGE_LABELS: Record<string, string> = {
  full_arrival: 'Full Arrival Assist', full_departure: 'Full Departure Assist',
  departure_priority: 'Departure Priority Only', porter_only: 'Porter Service Only',
};

// A passenger rates one of their own completed bookings. Additive only: never touches status,
// payments, discounts, assignment or reporting. The unique index on booking_id guarantees one rating
// per booking even if two submissions race.
serve('submitBookingRating', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  const overall = Number(body.overall_rating);
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 2000) : '';
  if (!bookingId) throw new HttpError(400, 'A booking is required.');
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) throw new HttpError(400, 'Choose an overall rating between 1 and 5 stars.');

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  if (bookingOwnerId(booking) !== user.id) throw new HttpError(403, 'You can only rate a booking on your own account.');
  if (booking.status !== 'completed') throw new HttpError(409, 'Only completed bookings can be rated.');

  const { data: rating, error } = await admin.from('booking_ratings').insert({
    booking_id: booking.id, booking_reference: booking.reference || '', passenger_user_id: user.id,
    passenger_name: user.full_name || booking.passengers?.[0]?.name || user.email || '',
    overall_rating: overall, feedback,
    supervisor_user_id: booking.assigned_supervisor_id || '', supervisor_name: booking.assigned_supervisor_name || '',
    package_code: booking.package_code || null, package_name: booking.package_name || PACKAGE_LABELS[booking.package_code] || '',
    service_date: booking.flight_date || '', submitted_at: new Date().toISOString(),
  }).select().single();
  if (error?.code === '23505') throw new HttpError(409, 'You have already reviewed this booking.');
  if (error) throw error;

  return json({ rating });
});
