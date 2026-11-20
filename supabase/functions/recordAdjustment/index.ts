import { adminClient, requireCaller } from '../_shared/auth.ts';
import { round2 } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { emailBookingPassenger } from '../_shared/notify.ts';

const METHODS = ['cash', 'mobile_money', 'card', 'corporate_account'];
const MESSAGES: Record<string, [number, string]> = {
  invalid_amount: [400, 'Enter an amount greater than zero.'],
  invalid_method: [400, 'Choose how the refund was paid.'],
  reason_required: [400, 'Give a reason (at least a few words). It is kept on the record.'],
  booking_not_found: [404, 'Booking not found'],
  adjustment_too_large: [409, 'That amount is more than can be refunded or written off on this booking.'],
};

// A refund (money handed back) or a write-off (a balance forgiven). Management or admin only, always with a reason.
// Both are ledger entries: nothing is edited in place.
serve('recordAdjustment', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  const type = String(body.type || '');
  const amount = round2(body.amount);
  const method = type === 'refund' ? String(body.method || '') : null;
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  if (type !== 'refund' && type !== 'write_off') throw new HttpError(400, 'Choose refund or write-off.');
  if (type === 'refund' && !METHODS.includes(method ?? '')) throw new HttpError(400, MESSAGES.invalid_method[1]);

  const { data, error } = await admin.rpc('record_adjustment', {
    p_booking_id: bookingId, p_type: type, p_amount: amount, p_method: method, p_reason: String(body.reason || ''),
    p_user_id: user.id, p_user_name: user.full_name || user.email || '',
  });
  if (error) {
    const known = MESSAGES[error.message];
    if (known) throw new HttpError(known[0], known[1]);
    throw error;
  }
  // A refund is emailed to the passenger. A write-off (a balance forgiven) is an internal record and is not.
  if (type === 'refund' && data?.booking_channel === 'online') {
    try {
      await emailBookingPassenger(admin, data, {
        eventKey: `refund:${bookingId}:${data.updated_date}`, templateName: 'PaymentUpdate',
        variables: {
          headline: 'A refund has been made.', message: 'We have refunded part of your payment. This is your record of it.',
          amount_line: `GHS ${amount.toFixed(2)}`, method_line: method ? method.replace('_', ' ') : '—', balance_line: `GHS ${Number(data.outstanding_balance).toFixed(2)}`,
        },
      });
    } catch (e) {
      console.error('recordAdjustment: refund email failed:', e instanceof Error ? e.message : e);
    }
  }
  return json({ ok: true, booking: data });
});
