import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { canOperateBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { canAssignPorter, checkPorterShare, isPorterService, porterCommission } from '../_shared/porters.ts';

const MESSAGES: Record<string, [number, string]> = {
  booking_closed: [409, 'This service is already finished, so its price cannot change.'],
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

  const { data: booking } = await admin.from('bookings').select('id,porters,assigned_supervisor_id,num_passengers,status,booking_channel,package_code,porters_waived').eq('id', bookingId).maybeSingle();
  if (!booking || !canOperateBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  let changes: Record<string, unknown>;
  if (action === 'set_lounge') {
    changes = { lounge_used: String(body.lounge_used || '').trim().slice(0, 120) };
  } else if (action === 'add_porter' || action === 'remove_porter') {
    // Porter assignment decides pay. Management gives a website booking to a supervisor; that supervisor chooses the porter if
    // one is used (a walk-in is chosen at the desk by the supervisor it belongs to). Management and admin can also do it.
    if (!canAssignPorter(user, booking)) {
      throw new HttpError(403, booking.status === 'cancelled' || booking.status === 'no_show'
        ? 'This booking was cancelled, so porters cannot be changed.'
        : 'The supervisor this booking is assigned to chooses its porter.');
    }
    const porters: Record<string, unknown>[] = Array.isArray(booking.porters) ? [...booking.porters] : [];
    const settings = await loadSettings(admin);
    const waivedNow = Number(booking.porters_waived) || 0;
    // Extra porters can no longer be added, but any already recorded can still be taken off (the fee comes off the price).
    if (action === 'remove_porter' && Number.isInteger(Number(body.index)) && porters[Number(body.index)]?.extra === true) {
      const { data: updated, error } = await admin.rpc('remove_extra_porter', { p_booking_id: bookingId, p_index: Number(body.index), p_user_id: user.id });
      if (error) { const known = MESSAGES[error.message]; if (known) throw new HttpError(known[0], known[1]); throw error; }
      return json({ ok: true, booking: updated });
    }
    if (action === 'add_porter') {
      // One porter handles one passenger, so each porter added covers one passenger and earns the commission once.
      const handled = 1;
      const problem = checkPorterShare(porters, handled, Number(booking.num_passengers) - waivedNow);
      if (problem) throw new HttpError(400, problem);
      // The porter must be on the register, so their daily pay is tied to a real person.
      const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', String(body.porter_id || '')).maybeSingle();
      if (!porter || !porter.active) throw new HttpError(400, 'Choose a porter from the list. An admin can add porters under Porters.');
      if (porters.some((p) => p.porter_id === porter.id)) throw new HttpError(400, `${porter.full_name} is already on this booking. One porter handles one passenger, so choose another porter.`);
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
  } else if (action === 'set_porters_waived') {
    // A meet and assist does not always need a porter. This sets how many passengers need none; porters already added still count.
    if (!canAssignPorter(user, booking)) throw new HttpError(403, 'Porters for this booking cannot be changed.');
    if (await isPorterService(admin, booking.package_code)) throw new HttpError(400, 'This service always needs a porter for each passenger.');
    const count = Number(body.count);
    const covered = (Array.isArray(booking.porters) ? booking.porters : []).reduce((s: number, p: Record<string, unknown>) => s + (Number(p.passengers_handled) || 0), 0);
    if (!Number.isInteger(count) || count < 0 || covered + count > Number(booking.num_passengers)) {
      throw new HttpError(400, 'That is more passengers than this booking has without a porter.');
    }
    changes = { porters_waived: count };
  } else {
    throw new HttpError(400, 'Unknown action');
  }

  const { data: updated, error } = await admin.from('bookings').update({ ...changes, updated_by_id: user.id }).eq('id', bookingId).select().single();
  if (error) throw error;
  return json({ ok: true, booking: updated });
});
