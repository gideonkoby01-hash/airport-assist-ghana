import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const STATUSES = ['confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show'];

// Admin-only: fix a booking that was moved to the wrong status, which the normal rules forbid.
// A reason is required and the change is recorded in the audit log under the admin's name.
serve('correctBookingStatus', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  const status = String(body.status || '');
  const reason = String(body.reason || '').trim();
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  if (reason.length < 3) throw new HttpError(400, 'Give a reason (at least a few words). It is kept on the record.');

  const { data, error } = await admin.rpc('admin_set_booking_status', { p_booking_id: bookingId, p_status: status, p_reason: reason, p_user_id: user.id });
  if (error) {
    if (error.message === 'booking_not_found') throw new HttpError(404, 'Booking not found');
    throw error;
  }
  return json({ ok: true, booking: data });
});
