import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { canOperateBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { canAssignPorter, canChangeExtraPorters, checkPorterShare, extraPorterEntry, porterCommission } from '../_shared/porters.ts';

const MESSAGES: Record<string, [number, string]> = {
  booking_closed: [409, 'This service is already finished, so its price cannot change. Extra porters can only be added or removed before it is completed.'],
  refund_first: [409, 'The customer has already paid for this extra porter. Refund the fee first, then remove the porter.'],
  porter_not_found: [400, 'That porter is no longer on this booking.'],
  not_extra: [400, 'That porter is not an extra porter.'],
};


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
    const settings = await loadSettings(admin);
    if (action === 'add_porter' && body.extra === true) {
      // A second or third porter for the same passengers: the fee is added to the price, the porter earns a flat commission.
      if (!canChangeExtraPorters(booking.status)) throw new HttpError(409, MESSAGES.booking_closed[1]);
      if (!porters.length) throw new HttpError(400, 'Add the first porter before an extra one.');
      const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', String(body.porter_id || '')).maybeSingle();
      if (!porter || !porter.active) throw new HttpError(400, 'Choose a porter from the list. An admin can add porters under Porters.');
      const entry = extraPorterEntry(porter, settings.num('porter_commission_per_passenger'), settings.num('extra_porter_fee'));
      const { data: updated, error } = await admin.rpc('add_extra_porter', { p_booking_id: bookingId, p_porter: entry, p_fee: entry.fee, p_user_id: user.id });
      if (error) { const known = MESSAGES[error.message]; if (known) throw new HttpError(known[0], known[1]); throw error; }
      return json({ ok: true, booking: updated });
    }
    if (action === 'remove_porter' && Number.isInteger(Number(body.index)) && porters[Number(body.index)]?.extra === true) {
      const { data: updated, error } = await admin.rpc('remove_extra_porter', { p_booking_id: bookingId, p_index: Number(body.index), p_user_id: user.id });
      if (error) { const known = MESSAGES[error.message]; if (known) throw new HttpError(known[0], known[1]); throw error; }
      return json({ ok: true, booking: updated });
    }
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
        commission: porterCommission(settings.num('porter_commission_per_passenger'), handled),
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
