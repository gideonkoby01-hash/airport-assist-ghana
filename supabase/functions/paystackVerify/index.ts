import { adminClient, clientIp } from '../_shared/auth.ts';
import { getSecret } from '../_shared/config.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { PaystackError, verifyTransaction } from '../_shared/paystack.ts';
import { settleCharge } from '../_shared/paystackFlow.ts';

// The page the passenger lands on after paying asks this what happened. It asks Paystack itself (never trusting the address
// it was opened with), and records the payment if the report from Paystack has not arrived yet; the database makes that safe
// to do twice. Answers: paid, review (money taken but a person must check), failed, or pending.
serve('paystackVerify', async (req) => {
  const admin = adminClient();
  const body = await readBody(req) as Record<string, unknown>;
  const reference = String(body.reference ?? '').trim();
  if (!/^[A-Za-z0-9._=-]{8,100}$/.test(reference)) throw new HttpError(400, 'That payment link is not valid.');

  const hits = await admin.rpc('hit_rate_limit', { p_key: `pay_verify:${clientIp(req)}`, p_window_seconds: 3600 });
  if (hits.error) throw hits.error;
  if (Number(hits.data) > 120) throw new HttpError(429, 'Too many checks. Please try again in a while.');

  const { data: attempt } = await admin.from('payment_attempts').select('status,booking_id,booking_reference,amount,review_reason').eq('reference', reference).maybeSingle();
  if (!attempt) throw new HttpError(404, 'We could not find that payment.');
  const answer = (status: string) => json({ status, booking_id: attempt.booking_id, booking_reference: attempt.booking_reference, amount: attempt.amount });

  if (attempt.status === 'success') return answer('paid');
  if (attempt.status === 'needs_review') return answer('review');
  if (attempt.status === 'failed') return answer('failed');

  const secret = await getSecret(admin, 'PAYSTACK_SECRET_KEY');
  if (!secret) throw new HttpError(503, 'Payments are not available right now.');
  let charge;
  try {
    charge = await verifyTransaction(secret, reference);
  } catch (e) {
    if (e instanceof PaystackError) return answer('pending'); // Paystack could not be asked just now: the page asks again shortly
    throw e;
  }
  if (charge.status === 'success') {
    const result = await settleCharge(admin, { ...charge, reference });
    return answer(result.status === 'needs_review' ? 'review' : 'paid');
  }
  if (charge.status === 'failed' || charge.status === 'abandoned' || charge.status === 'reversed') {
    await admin.rpc('fail_payment_attempt', { p_reference: reference });
    return answer('failed');
  }
  return answer('pending');
});
