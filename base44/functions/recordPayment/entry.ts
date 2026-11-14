import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { canOperateBooking, round2 } from '../../shared/bookingAccess.ts';

const METHODS = ['cash', 'mobile_money', 'card', 'corporate_account'];

// Records one payment against a booking. The amounts are changed with atomic
// increments on the server, so two staff members (or a double tap) can never
// overwrite each other's collection, and every payment leaves a Payment row.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.booking_id || '').trim();
    const amount = round2(Number(body.amount));
    const method = String(body.method || '');
    if (!bookingId) return Response.json({ error: 'booking_id is required' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Enter an amount greater than zero.' }, { status: 400 });
    }
    if (!METHODS.includes(method)) {
      return Response.json({ error: 'Choose a valid payment method.' }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!booking || !canOperateBooking(user, booking)) {
      // Same answer for "missing" and "not yours": never reveal which bookings exist.
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const total = round2(booking.total_value);
    const collectedBefore = round2(booking.amount_collected || 0);
    const outstandingBefore = round2(total - collectedBefore);
    if (amount > outstandingBefore + 0.001) {
      return Response.json(
        { error: `That is more than the outstanding balance (GHS ${outstandingBefore.toFixed(2)}).` },
        { status: 400 }
      );
    }

    // Atomic claim: only applies while the balance still covers this payment,
    // and the token tells us whether our write is the one that landed.
    const token = crypto.randomUUID();
    await base44.asServiceRole.entities.Booking.updateMany(
      { reference: booking.reference, outstanding_balance: { $gte: amount } },
      {
        $inc: { amount_collected: amount, outstanding_balance: -amount },
        $set: { payment_method: method, last_payment_token: token },
      }
    );
    let after = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!after || after.last_payment_token !== token) {
      return Response.json(
        { error: 'This booking was just updated by someone else. Refresh and check the balance, then try again.' },
        { status: 409 }
      );
    }

    // Derive the stored balance and status from the totals. Guarded on the
    // balance we just read, so a concurrent payment's own derivation wins
    // instead of being overwritten by a stale one.
    const collected = round2(after.amount_collected);
    const outstanding = round2(Math.max(0, total - collected));
    const paymentStatus = collected >= total ? 'paid' : collected > 0 ? 'partially_paid' : 'unpaid';
    await base44.asServiceRole.entities.Booking.updateMany(
      { reference: booking.reference, last_payment_token: token },
      { $set: { amount_collected: collected, outstanding_balance: outstanding, payment_status: paymentStatus } }
    );
    after = await base44.asServiceRole.entities.Booking.get(bookingId);

    await base44.asServiceRole.entities.Payment.create({
      booking_id: bookingId,
      booking_reference: booking.reference || '',
      amount,
      method,
      balance_after: outstanding,
      recorded_by_id: user.id,
      recorded_by_name: user.full_name || user.email || '',
      recorded_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, booking: after });
  } catch (error) {
    console.error('recordPayment failed: ' + (error && error.message));
    return Response.json({ error: 'Could not record the payment. Please try again.' }, { status: 500 });
  }
}
