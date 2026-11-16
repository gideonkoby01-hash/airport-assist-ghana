import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { canOperateBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { canAssignPorter, checkPorterShare, porterCommission } from '../_shared/porters.ts';


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

  const { data: booking } = await admin.from('bookings').select('id,porters,assigned_supervisor_id,num_passengers,status,booking_channel').eq('id', bookingId).maybeSingle();
  if (!booking || !canOperateBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  let changes: Record<string, unknown>;
  if (action === 'set_lounge') {
    changes = { lounge_used: String(body.lounge_used || '').trim().slice(0, 120) };
  } else if (action === 'add_porter' || action === 'remove_porter') {
    // Porter assignment decides pay. For a service requested on the website, management assigns the porter. For a walk-in
    // at the desk, the supervisor it is assigned to chooses the porter on the spot.
    if (!canAssignPorter(user, booking)) {
      throw new HttpError(403, booking.status === 'cancelled' || booking.status === 'no_show'
        ? 'This booking was cancelled, so porters cannot be changed.'
        : 'Porters for a website booking are assigned by management.');
    }
    const porters: Record<string, unknown>[] = Array.isArray(booking.porters) ? [...booking.porters] : [];
    if (action === 'add_porter') {
      const handled = Number(body.passengers_handled);
      const problem = checkPorterShare(porters, handled, booking.num_passengers);
      if (problem) throw new HttpError(400, problem);
      // The porter must be on the register, so their daily pay is tied to a real person.
      const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', String(body.porter_id || '')).maybeSingle();
      if (!porter || !porter.active) throw new HttpError(400, 'Choose a porter from the list. An admin can add porters under Porters.');
      porters.push({
        porter_id: porter.id,
        porter_name: porter.full_name,
        passengers_handled: handled,
        commission: porterCommission((await loadSettings(admin)).num('porter_commission_per_passenger'), handled),
      });
    } else {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= porters.length) throw new HttpError(400, 'That porter is no longer on this booking.');
      porters.splice(index, 1);
    }
    changes = { porters };
  } else {
    throw new HttpError(400, 'Unknown action');
  }

  const { data: updated, error } = await admin.from('bookings').update({ ...changes, updated_by_id: user.id }).eq('id', bookingId).select().single();
  if (error) throw error;
  return json({ ok: true, booking: updated });
});
