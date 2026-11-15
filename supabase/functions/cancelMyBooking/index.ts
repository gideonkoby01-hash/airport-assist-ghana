import { adminClient, recipientsByRole, requireCaller } from '../_shared/auth.ts';
import { bookingOwnerId } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// A passenger cancels their own booking before it starts, as long as nothing has been collected yet. Once money has
// been taken, a refund is a decision for management, so the passenger is told to contact the desk.
// Cancelling frees any discount used (done by the database) and alerts management and the assigned supervisor.
serve('cancelMyBooking', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  const { booking_id: bookingId } = await readBody(req) as Record<string, string>;
  if (!bookingId) throw new HttpError(400, 'booking_id is required');

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking || bookingOwnerId(booking) !== user.id) throw new HttpError(404, 'Booking not found');
  if (!['confirmed', 'assigned'].includes(booking.status)) throw new HttpError(409, 'This booking has already started or finished, so it can no longer be cancelled here.');
  if (Number(booking.amount_collected) > 0) throw new HttpError(409, 'A payment has already been taken for this booking. Please contact the Airport Assist desk to cancel and arrange a refund.');

  const previous = booking.status;
  const { data: updated, error } = await admin.from('bookings')
    .update({ status: 'cancelled', status_reason: 'Cancelled by the passenger', updated_by_id: user.id })
    .eq('id', bookingId).eq('status', previous).select().single();
  if (error) throw error;

  // Tell the people who would otherwise turn up for it. Best effort: the cancellation is already saved.
  const who = booking.passengers?.[0]?.name || booking.contact || 'the passenger';
  const message = [`Booking ${booking.reference} was cancelled by ${who}.`, `Service: ${booking.package_name || booking.package_code}`,
    `Date/Time: ${[booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ') || '—'}`].join('\n');
  const recipients = new Set((await recipientsByRole(admin, ['management', 'admin'])).map((u) => u.id));
  if (booking.assigned_supervisor_id) recipients.add(booking.assigned_supervisor_id);
  for (const id of recipients) {
    const { error: notifyError } = await admin.from('notifications').insert({
      user_id: id, booking_id: bookingId, booking_reference: booking.reference, title: 'Booking cancelled by passenger', message,
      read: false, type: 'status_change', previous_status: previous, new_status: 'cancelled', link_path: `/bookings/${bookingId}`,
    });
    if (notifyError) console.error(`cancelMyBooking: alert failed for ${id}: ${notifyError.message}`);
  }
  return json({ ok: true, booking: updated });
});
