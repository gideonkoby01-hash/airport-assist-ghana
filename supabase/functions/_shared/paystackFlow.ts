import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { recipientsByRole } from './auth.ts';
import { emailBookingPassenger } from './notify.ts';
import { recordCharge, type PaystackCharge, type RecordResult } from './paystack.ts';

const ghs = (n: unknown) => `GHS ${Number(n).toFixed(2)}`;

// What staff are told when a payment arrives that cannot be put on the booking.
export const REVIEW_REASONS: Record<string, string> = {
  amount_mismatch: 'The amount or currency Paystack reports is not what was asked for.',
  overpayment: 'The booking was already paid (for example at the airport) while the passenger was paying online.',
  booking_closed: 'The booking was cancelled or marked no-show before the payment arrived.',
  booking_not_found: 'The booking no longer exists.',
};

const ALERT_TITLE = 'Online payment needs a look';

// A payment taken by Paystack that could not be recorded: the money has been taken from the passenger, so a person must
// decide (usually refund it in the Paystack dashboard). Management and admin are alerted once each.
export async function alertPaymentNeedsReview(admin: SupabaseClient, reference: string, result: RecordResult): Promise<void> {
  const bookingId = String(result.booking_id ?? '');
  const { data: booking } = bookingId ? await admin.from('bookings').select('reference').eq('id', bookingId).maybeSingle() : { data: null };
  const users = await recipientsByRole(admin, ['management', 'admin']);
  // The same payment must not alert the same person twice (the webhook is retried), so look for an alert that names this reference.
  const { data: sent } = await admin.from('notifications').select('user_id').eq('type', 'info').eq('title', ALERT_TITLE).ilike('message', `%${reference}%`);
  const already = new Set((sent ?? []).map((n: { user_id: string }) => n.user_id));
  const message = [
    `Booking ${booking?.reference ?? '—'}: ${result.amount != null ? ghs(result.amount) : 'a payment'} was taken online, but it could not be added to the booking.`,
    REVIEW_REASONS[result.reason ?? ''] ?? 'It needs checking.',
    `Paystack reference: ${reference}.`,
    'Check it in Accounts > Payments, and refund it from the Paystack dashboard if it should not stand.',
  ].join('\n');
  for (const u of users) {
    if (already.has(u.id)) continue;
    const { error } = await admin.from('notifications').insert({
      user_id: u.id, booking_id: bookingId || null, booking_reference: booking?.reference ?? '', title: ALERT_TITLE, message, read: false, type: 'info',
    });
    if (error) console.error(`paystack: alert failed for ${u.id}: ${error.message}`);
  }
}

// Records a successful charge and does what follows: the receipt email, or the alert when it could not be recorded.
// Safe to run for the same charge any number of times (the webhook and the return page both do): the database
// records it once and the follow-ups are deduplicated.
export async function settleCharge(admin: SupabaseClient, charge: PaystackCharge): Promise<RecordResult> {
  const result = await recordCharge(admin, charge);
  const reference = String(charge.reference ?? '');
  if (result.status === 'recorded') {
    try {
      const { data: booking } = await admin.from('bookings').select('*').eq('id', result.booking_id).maybeSingle();
      if (booking) {
        await emailBookingPassenger(admin, booking, {
          eventKey: `payment:${booking.id}:${booking.amount_collected}`, templateName: 'PaymentUpdate',
          variables: {
            headline: 'We have received your payment.', message: 'Thank you. This is your receipt for your online payment.',
            amount_line: ghs(result.amount), method_line: result.method === 'mobile_money' ? 'Mobile money (online)' : 'Card (online)', balance_line: ghs(booking.outstanding_balance),
          },
        });
      }
    } catch (e) {
      console.error('paystack: receipt email failed:', e instanceof Error ? e.message : e);
    }
  } else if (result.status === 'needs_review') {
    try {
      await alertPaymentNeedsReview(admin, reference, result);
    } catch (e) {
      console.error('paystack: alert failed:', e instanceof Error ? e.message : e);
    }
  } else if (result.status === 'unknown_reference') {
    console.error(`paystack: a payment arrived for a reference we did not create (${reference})`);
  }
  return result;
}
