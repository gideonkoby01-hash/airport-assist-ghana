import { adminClient } from '../_shared/auth.ts';
import { getSecret } from '../_shared/config.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { verifyPaystackSignature, type PaystackCharge } from '../_shared/paystack.ts';
import { settleCharge } from '../_shared/paystackFlow.ts';

// Paystack tells us when a payment succeeds. Deployed without sign-in verification (supabase/config.toml): the
// signature on the body, made with the secret key, is the proof it came from Paystack. Anything that is not a
// signed "charge.success" is acknowledged and ignored. A failure on our side answers 500 so Paystack tries again.
serve('paystackWebhook', async (req) => {
  const admin = adminClient();
  const secret = await getSecret(admin, 'PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('The Paystack secret key is not set (Admin > Settings > Online payments).');
  const body = await req.text();
  if (!(await verifyPaystackSignature(secret, body, req.headers.get('x-paystack-signature')))) throw new HttpError(401, 'Invalid signature');

  let event: { event?: string; data?: PaystackCharge };
  try { event = JSON.parse(body); } catch { return json({ ok: true, ignored: true }); }
  if (event.event !== 'charge.success' || !event.data?.reference || event.data.status !== 'success') return json({ ok: true, ignored: true });

  const result = await settleCharge(admin, event.data);
  return json({ ok: true, status: result.status });
});
