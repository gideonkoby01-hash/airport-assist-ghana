import { adminClient, clientIp, requestAppUrl } from '../_shared/auth.ts';
import { bookingEmailAddress, round2 } from '../_shared/bookingAccess.ts';
import { getSecret, loadSettings } from '../_shared/config.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { initializeTransaction, newReference, PaystackError } from '../_shared/paystack.ts';

const REUSE_MINUTES = 30;

// Says what is owed on a booking (action "quote") or starts an online payment for a booking and hands back the Paystack page to send the passenger to. Anyone holding the booking's
// id and reference (the confirmation screen and the confirmation email) can pay; they cannot choose the amount, which is always
// what is still owed on the booking in the database.
serve('paystackInitialize', async (req) => {
  const admin = adminClient();
  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id ?? '').trim();
  const reference = String(body.reference ?? '').trim().toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !reference) throw new HttpError(400, 'Open the payment link from your booking confirmation.');

  const quote = body.action === 'quote';
  const settings = await loadSettings(admin);
  const secret = settings.str('paystack_enabled') === 'true' ? await getSecret(admin, 'PAYSTACK_SECRET_KEY') : undefined;
  if (!secret) {
    if (quote) return json({ payable: false, reason: 'unavailable' });
    throw new HttpError(403, 'Online payment is not available. You can pay at the airport.');
  }

  const ip = await admin.rpc('hit_rate_limit', { p_key: `${quote ? 'pay_quote' : 'pay_ip'}:${clientIp(req)}`, p_window_seconds: 3600 });
  if (ip.error) throw ip.error;
  if (Number(ip.data) > (quote ? 120 : 30)) throw new HttpError(429, 'Too many payment attempts. Please try again in a while.');

  const { data: booking } = await admin.from('bookings')
    .select('id,reference,status,outstanding_balance,contact_email,passenger_user_id,created_by_id,package_name').eq('id', bookingId).maybeSingle();
  // The same answer whether the booking is missing or the reference is wrong, so ids cannot be probed.
  if (!booking || String(booking.reference).toUpperCase() !== reference) throw new HttpError(404, 'We could not find that booking. Check the link in your confirmation email.');
  const amount = round2(booking.outstanding_balance);
  if (booking.status === 'cancelled' || booking.status === 'no_show') {
    if (quote) return json({ payable: false, reason: 'cancelled', reference: booking.reference });
    throw new HttpError(409, 'This booking is cancelled, so it cannot be paid.');
  }
  if (!(amount > 0)) {
    if (quote) return json({ payable: false, reason: 'paid', reference: booking.reference });
    throw new HttpError(409, 'This booking is already paid in full. Thank you.');
  }
  // "quote" asks only what is owed, so the screen can show it before anything is started.
  if (quote) return json({ payable: true, amount, reference: booking.reference, package_name: booking.package_name ?? '' });

  const perBooking = await admin.rpc('hit_rate_limit', { p_key: `pay_booking:${booking.id}`, p_window_seconds: 3600 });
  if (Number(perBooking.data) > 12) throw new HttpError(429, 'Too many payment attempts for this booking. Please try again in a while.');

  // A page opened a moment ago for the same amount is still good: reuse it so one tap twice does not make two payments.
  const since = new Date(Date.now() - REUSE_MINUTES * 60_000).toISOString();
  const { data: open } = await admin.from('payment_attempts').select('reference,authorization_url,amount')
    .eq('booking_id', booking.id).eq('status', 'pending').gte('created_date', since).not('authorization_url', 'is', null)
    .order('created_date', { ascending: false }).limit(1);
  if (open?.[0] && round2(open[0].amount) === amount) return json({ authorization_url: open[0].authorization_url, reference: open[0].reference, reused: true });

  let owner: { email?: string } | null = null;
  const ownerId = booking.passenger_user_id || booking.created_by_id;
  if (!String(booking.contact_email ?? '').trim() && ownerId) {
    owner = (await admin.from('profiles').select('email').eq('id', ownerId).maybeSingle()).data;
  }
  const email = bookingEmailAddress(booking, owner?.email);
  if (!email) throw new HttpError(409, 'We have no email address for this booking, so it cannot be paid online. You can pay at the airport.');

  // Written before Paystack is asked, so a report of the payment that arrives at once already finds it.
  const paystackReference = newReference(booking.reference);
  const { error: insertError } = await admin.from('payment_attempts').insert({
    booking_id: booking.id, booking_reference: booking.reference, reference: paystackReference, amount, currency: 'GHS', email,
  });
  if (insertError) throw insertError;

  try {
    const started = await initializeTransaction(secret, {
      email, amount, reference: paystackReference, callbackUrl: `${requestAppUrl(req)}/pay/return`,
      metadata: { booking_reference: booking.reference, package: booking.package_name ?? '' },
    });
    await admin.from('payment_attempts').update({ authorization_url: started.authorization_url }).eq('reference', paystackReference);
    return json({ authorization_url: started.authorization_url, reference: paystackReference });
  } catch (e) {
    await admin.rpc('fail_payment_attempt', { p_reference: paystackReference });
    if (e instanceof PaystackError) {
      console.error('paystackInitialize:', e.message);
      throw new HttpError(e.status, 'Online payment is not available right now. Please try again in a moment, or pay at the airport.');
    }
    throw e;
  }
});
