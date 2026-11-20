import { adminClient, requireCaller } from '../_shared/auth.ts';
import { canOperateBooking, round2 } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { emailBookingPassenger } from '../_shared/notify.ts';

const METHODS = ['cash', 'mobile_money', 'card', 'corporate_account'];
const METHOD_LABELS: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile money', card: 'Card', corporate_account: 'Corporate account' };
const ghs = (n: unknown) => `GHS ${Number(n).toFixed(2)}`;

// Records one payment. The money moves inside the database (record_payment): one statement checks the
// balance and updates it, so two staff members or a double tap can never overpay or lose a payment,
// and every payment leaves an immutable row in the payments ledger.
serve('recordPayment', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  const amount = round2(body.amount);
  const method = String(body.method || '');
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than zero.');
  if (!METHODS.includes(method)) throw new HttpError(400, 'Choose a valid payment method.');

  const { data: booking } = await admin.from('bookings').select('id,assigned_supervisor_id').eq('id', bookingId).maybeSingle();
  if (!booking || !canOperateBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  const { data, error } = await admin.rpc('record_payment', {
    p_booking_id: bookingId, p_amount: amount, p_method: method, p_user_id: user.id, p_user_name: user.full_name || user.email || '',
  });
  if (error) {
    if (error.message === 'booking_closed') throw new HttpError(409, 'This booking is cancelled or marked no-show, so payments can no longer be recorded.');
    if (error.message === 'overpayment') throw new HttpError(400, 'That is more than the outstanding balance. Refresh and check the balance.');
    if (error.message === 'booking_not_found') throw new HttpError(404, 'Booking not found');
    throw error;
  }
  // The passenger has no account to look at, so the receipt is emailed.
  if (data?.booking_channel === 'online') {
    try {
      await emailBookingPassenger(admin, data, {
        eventKey: `payment:${bookingId}:${data.amount_collected}`, templateName: 'PaymentUpdate',
        variables: {
          headline: 'We have received your payment.', message: 'Thank you. This is your receipt for the payment taken at the airport.',
          amount_line: ghs(amount), method_line: METHOD_LABELS[method] || method, balance_line: ghs(data.outstanding_balance),
        },
      });
    } catch (e) {
      console.error('recordPayment: receipt email failed:', e instanceof Error ? e.message : e);
    }
  }
  return json({ ok: true, booking: data });
});
