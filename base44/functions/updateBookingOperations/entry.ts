import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { canOperateBooking } from '../../shared/bookingAccess.ts';

// Matches PORTER_COMMISSION_PER_PASSENGER in src/lib/packages.js.
const PORTER_COMMISSION_PER_PASSENGER = 30;

// Operational edits to a booking that staff make from the booking page: the
// lounge used and the porter list. Commission is calculated here, so a browser
// cannot choose its own payout. Pricing, discount, payment and status fields
// are never touched by this function.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.booking_id || '').trim();
    const action = String(body.action || '');
    if (!bookingId) return Response.json({ error: 'booking_id is required' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!booking || !canOperateBooking(user, booking)) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    let changes;
    if (action === 'set_lounge') {
      changes = { lounge_used: String(body.lounge_used || '').trim().slice(0, 120) };
    } else if (action === 'add_porter' || action === 'remove_porter') {
      // Porter assignment and commission is a management decision.
      if (user.role !== 'management' && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const porters = Array.isArray(booking.porters) ? [...booking.porters] : [];
      if (action === 'add_porter') {
        const name = String(body.porter_name || '').trim().slice(0, 120);
        const handled = Number(body.passengers_handled);
        if (!name) return Response.json({ error: "Enter the porter's name." }, { status: 400 });
        if (!Number.isInteger(handled) || handled < 1 || handled > 50) {
          return Response.json({ error: 'Passengers handled must be a whole number from 1 to 50.' }, { status: 400 });
        }
        porters.push({
          porter_name: name,
          passengers_handled: handled,
          commission: PORTER_COMMISSION_PER_PASSENGER * handled,
        });
      } else {
        const index = Number(body.index);
        if (!Number.isInteger(index) || index < 0 || index >= porters.length) {
          return Response.json({ error: 'That porter is no longer on this booking.' }, { status: 400 });
        }
        porters.splice(index, 1);
      }
      changes = { porters };
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.Booking.update(bookingId, changes);
    return Response.json({ ok: true, booking: updated });
  } catch (error) {
    console.error('updateBookingOperations failed: ' + (error && error.message));
    return Response.json({ error: 'Could not update the booking. Please try again.' }, { status: 500 });
  }
}
