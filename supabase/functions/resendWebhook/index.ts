import { adminClient } from '../_shared/auth.ts';
import { getSecret } from '../_shared/config.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { verifySvix } from '../_shared/svix.ts';

const OUTCOMES: Record<string, string> = { 'email.delivered': 'delivered', 'email.bounced': 'bounced', 'email.complained': 'complained' };

// Resend tells us what happened to each email after it was accepted: delivered, bounced or marked as spam.
// Deployed without sign-in verification (supabase/config.toml); the Svix signature is the proof it came from Resend.
serve('resendWebhook', async (req) => {
  const admin = adminClient();
  const secret = await getSecret(admin, 'RESEND_WEBHOOK_SECRET');
  if (!secret) throw new Error('The Resend webhook signing secret is not set (Admin > Settings).');
  const body = await req.text();
  if (!(await verifySvix(secret, req.headers, body))) throw new HttpError(401, 'Invalid signature');

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string; bounce?: { message?: string } } };
  const outcome = OUTCOMES[event.type ?? ''];
  const emailId = event.data?.email_id;
  if (!outcome || !emailId) return json({ ok: true, ignored: true });

  // Never move a row backwards: a "delivered" must not overwrite a "bounced" that arrived first.
  const allowedFrom = outcome === 'delivered' ? ['sent'] : ['sent', 'delivered'];
  const details = outcome === 'bounced' ? `Bounced: ${event.data?.bounce?.message ?? 'address rejected'}`.slice(0, 500) : outcome === 'complained' ? 'Recipient marked the email as spam' : 'Delivered';
  const { error } = await admin.from('email_deliveries').update({ status: outcome, details, last_attempt_at: new Date().toISOString() }).eq('provider_id', emailId).in('status', allowedFrom);
  if (error) throw error;
  return json({ ok: true, outcome });
});
