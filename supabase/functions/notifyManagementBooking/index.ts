import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { notifyNewBooking } from '../_shared/notify.ts';

// Re-sends the new-booking alerts and confirmation email for a booking (idempotent: nobody is alerted
// or emailed twice). createBooking already does this on creation; this is for staff to retry.
serve('notifyManagementBooking', async (req) => {
  const admin = adminClient();
  await requireCaller(req, admin, ['management', 'admin']);
  const { booking_id: bookingId } = await readBody(req) as Record<string, string>;
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  const result = await notifyNewBooking(admin, bookingId);
  if (!result.ok && result.error === 'Booking not found') throw new HttpError(404, 'Booking not found');
  return json(result);
});
