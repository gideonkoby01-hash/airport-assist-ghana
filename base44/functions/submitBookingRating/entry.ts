import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { bookingOwnerId } from '../../shared/bookingAccess.ts';

const PACKAGE_LABELS = {
  full_arrival: 'Full Arrival Assist',
  full_departure: 'Full Departure Assist',
  departure_priority: 'Departure Priority Only',
  porter_only: 'Porter Service Only',
};

const MAX_FEEDBACK = 2000;

// Records a passenger's overall Airport Assist rating for one of their own
// completed bookings. Additive only: never touches booking status, payments,
// discounts, supervisor assignment or reporting figures.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.booking_id || '').trim();
    const overallRating = Number(body.overall_rating);
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, MAX_FEEDBACK) : '';

    if (!bookingId) return Response.json({ error: 'A booking is required.' }, { status: 400 });
    if (!Number.isInteger(overallRating) || overallRating < 1 || overallRating > 5) {
      return Response.json({ error: 'Choose an overall rating between 1 and 5 stars.' }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId).catch((e) =>
      e.status === 404 ? null : Promise.reject(e)
    );
    if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 });

    if (bookingOwnerId(booking) !== user.id) {
      return Response.json({ error: 'You can only rate a booking on your own account.' }, { status: 403 });
    }
    if (booking.status !== 'completed') {
      return Response.json({ error: 'Only completed bookings can be rated.' }, { status: 409 });
    }

    const already = await base44.asServiceRole.entities.BookingRating.count({ booking_id: bookingId });
    if ((Number(already) || 0) > 0) {
      return Response.json({ error: 'You have already reviewed this booking.' }, { status: 409 });
    }

    const record = await base44.asServiceRole.entities.BookingRating.create({
      booking_id: booking.id,
      booking_reference: booking.reference || '',
      passenger_user_id: user.id,
      passenger_name: user.full_name || booking.passengers?.[0]?.name || user.email || '',
      overall_rating: overallRating,
      feedback,
      supervisor_user_id: booking.assigned_supervisor_id || '',
      supervisor_name: booking.assigned_supervisor_name || '',
      package_code: booking.package_code || '',
      package_name: booking.package_name || PACKAGE_LABELS[booking.package_code] || '',
      service_date: booking.flight_date || '',
      submitted_at: new Date().toISOString(),
    });

    // Concurrency guard: two simultaneous submissions could both pass the
    // pre-check above. Keep the earliest record and drop the extra one.
    const after = await base44.asServiceRole.entities.BookingRating.filter(
      { booking_id: bookingId },
      { sort: 'created_date', limit: 20 }
    );
    const rows = after.items || [];
    if (rows.length > 1) {
      const keep = rows[0];
      for (const row of rows.slice(1)) {
        await base44.asServiceRole.entities.BookingRating.delete(row.id);
      }
      if (keep.id !== record.id) {
        return Response.json({ error: 'You have already reviewed this booking.' }, { status: 409 });
      }
      return Response.json({ rating: keep });
    }

    return Response.json({ rating: record });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not save your review.' }, { status: 500 });
  }
}