import { adminClient, requireCaller } from '../_shared/auth.ts';
import { canOperateBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Matches PORTER_COMMISSION_PER_PASSENGER in src/lib/packages.js.
const PORTER_COMMISSION_PER_PASSENGER = 30;

// Operational edits staff make from the booking page: the lounge used and the porter list.
// Commission is calculated here so a browser cannot choose its own payout. Pricing, discount,
// payment and status fields are never touched.
serve('updateBookingOperations', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  const action = String(body.action || '');
  if (!bookingId) throw new HttpError(400, 'booking_id is required');

  const { data: booking } = await admin.from('bookings').select('id,porters,assigned_supervisor_id').eq('id', bookingId).maybeSingle();
  if (!booking || !canOperateBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  let changes: Record<string, unknown>;
  if (action === 'set_lounge') {
    changes = { lounge_used: String(body.lounge_used || '').trim().slice(0, 120) };
  } else if (action === 'add_porter' || action === 'remove_porter') {
    // Porter assignment and commission is a management decision.
    if (user.role !== 'management' && user.role !== 'admin') throw new HttpError(403, 'Forbidden');
    const porters: Record<string, unknown>[] = Array.isArray(booking.porters) ? [...booking.porters] : [];
    if (action === 'add_porter') {
      const name = String(body.porter_name || '').trim().slice(0, 120);
      const handled = Number(body.passengers_handled);
      if (!name) throw new HttpError(400, "Enter the porter's name.");
      if (!Number.isInteger(handled) || handled < 1 || handled > 50) throw new HttpError(400, 'Passengers handled must be a whole number from 1 to 50.');
      porters.push({ porter_name: name, passengers_handled: handled, commission: PORTER_COMMISSION_PER_PASSENGER * handled });
    } else {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= porters.length) throw new HttpError(400, 'That porter is no longer on this booking.');
      porters.splice(index, 1);
    }
    changes = { porters };
  } else {
    throw new HttpError(400, 'Unknown action');
  }

  const { data: updated, error } = await admin.from('bookings').update(changes).eq('id', bookingId).select().single();
  if (error) throw error;
  return json({ ok: true, booking: updated });
});
