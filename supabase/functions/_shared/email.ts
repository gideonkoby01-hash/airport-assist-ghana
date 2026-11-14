import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { EMAIL_TEMPLATES } from './emailTemplates.generated.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailResult = { status: 'sent' | 'duplicate' | 'skipped' | 'failed'; sent: boolean; reason?: string; message?: string };

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Fills {{variables}}; values are HTML-escaped so names and notes can never inject markup.
export function renderTemplate(name: string, variables: Record<string, unknown>) {
  const template = EMAIL_TEMPLATES[name];
  if (!template) throw new Error(`Unknown email template: ${name}`);
  const fill = (text: string) => text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => escapeHtml(variables[key]));
  return { subject: fill(template.subject), html: fill(template.html) };
}

// Sends one transactional email through Resend. Safe to call twice for the same event:
// the claim row in email_deliveries (unique per event while queued/sent) makes the second call a no-op.
// A mail failure is reported, never thrown, so the booking or request that triggered it still succeeds.
export async function sendTransactionalEmail(
  admin: SupabaseClient,
  opts: { eventKey: string; templateName: string; to: string | null | undefined; userId?: string; relatedEntityId?: string; variables?: Record<string, unknown> },
): Promise<EmailResult> {
  const { eventKey, templateName, to, userId = '', relatedEntityId = '', variables = {} } = opts;
  const log = (status: string, details: string) =>
    admin.from('email_deliveries').insert({
      event_key: eventKey, template_name: templateName, recipient_user_id: userId, status,
      details: details.slice(0, 500), related_entity_id: relatedEntityId,
    });

  if (!to || !EMAIL_REGEX.test(to)) {
    await log('skipped', 'No valid recipient email address');
    return { status: 'skipped', sent: false, reason: 'no_valid_recipient' };
  }

  // Claim the event. A unique violation means another attempt already queued or sent it.
  const { data: claim, error: claimError } = await admin
    .from('email_deliveries')
    .insert({ event_key: eventKey, template_name: templateName, recipient_user_id: userId, status: 'queued', details: 'Send attempt starting', related_entity_id: relatedEntityId })
    .select('id')
    .single();
  if (claimError) {
    if (claimError.code === '23505') return { status: 'duplicate', sent: false };
    console.error(`email: could not claim ${eventKey}: ${claimError.message}`);
    return { status: 'failed', sent: false, reason: 'error', message: claimError.message };
  }

  const settle = (status: string, details: string) =>
    admin.from('email_deliveries').update({ status, details: details.slice(0, 500) }).eq('id', claim.id);

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!apiKey || !from) throw new Error('RESEND_API_KEY or EMAIL_FROM is not configured');
    const { subject, html } = renderTemplate(templateName, variables);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': eventKey },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const detail = `Resend rejected the send (${res.status}): ${(await res.text()).slice(0, 200)}`;
      await settle('failed', detail);
      return { status: 'failed', sent: false, reason: 'provider_rejected', message: detail };
    }
    await settle('sent', 'Accepted by Resend, queued for delivery');
    return { status: 'sent', sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`email: ${eventKey} send failed: ${message}`);
    await settle('failed', message);
    return { status: 'failed', sent: false, reason: 'error', message };
  }
}
