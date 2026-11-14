import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appUrl } from './auth.ts';
import { getSecret, loadSettings } from './config.ts';
import { EMAIL_TEMPLATES } from './emailTemplates.generated.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailResult = { status: 'sent' | 'duplicate' | 'skipped' | 'failed'; sent: boolean; reason?: string; message?: string };

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Fills {{variables}}; values are HTML-escaped so names and notes can never inject markup.
export function renderTemplate(name: string, variables: Record<string, unknown>) {
  const template = EMAIL_TEMPLATES[name];
  if (!template) throw new Error(`Unknown email template: ${name}`);
  // logo_url is available to every template: the site's own favicon.png, hosted on the production domain.
  const values: Record<string, unknown> = { logo_url: `${appUrl()}/favicon.png`, ...variables };
  const fill = (text: string) => text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => escapeHtml(values[key]));
  return { subject: fill(template.subject), html: fill(template.html) };
}

// Sends one transactional email through Resend. Safe to call twice for the same event:
// the claim row in email_deliveries (unique per event while queued/sent/delivered) makes the second call a no-op.
// A mail failure is reported, never thrown, so the booking or request that triggered it still succeeds.
// The recipient and variables stay on the row only while the send is unfinished, so it can be retried; they are
// erased when the provider accepts the email.
export async function sendTransactionalEmail(
  admin: SupabaseClient,
  opts: { eventKey: string; templateName: string; to: string | null | undefined; userId?: string; relatedEntityId?: string; variables?: Record<string, unknown> },
): Promise<EmailResult> {
  const { eventKey, templateName, to, userId = '', relatedEntityId = '', variables = {} } = opts;

  if (!to || !EMAIL_REGEX.test(to)) {
    await admin.from('email_deliveries').insert({
      event_key: eventKey, template_name: templateName, recipient_user_id: userId, status: 'skipped',
      details: 'No valid recipient email address', related_entity_id: relatedEntityId,
    });
    return { status: 'skipped', sent: false, reason: 'no_valid_recipient' };
  }

  // Claim the event. A unique violation means another attempt already queued, sent or delivered it.
  const { data: claim, error: claimError } = await admin
    .from('email_deliveries')
    .insert({
      event_key: eventKey, template_name: templateName, recipient_user_id: userId, status: 'queued',
      details: 'Send attempt starting', related_entity_id: relatedEntityId, to_email: to, variables,
    })
    .select('id')
    .single();
  if (claimError) {
    if (claimError.code === '23505') return { status: 'duplicate', sent: false };
    console.error(`email: could not claim ${eventKey}: ${claimError.message}`);
    return { status: 'failed', sent: false, reason: 'error', message: claimError.message };
  }
  return await deliver(admin, claim.id, { eventKey, templateName, to, variables });
}

// One attempt to send an already-claimed row, then record how it went.
async function deliver(
  admin: SupabaseClient, id: string,
  m: { eventKey: string; templateName: string; to: string; variables: Record<string, unknown> },
): Promise<EmailResult> {
  const settle = (patch: Record<string, unknown>) =>
    admin.from('email_deliveries').update({ ...patch, last_attempt_at: new Date().toISOString() }).eq('id', id);
  try {
    const apiKey = await getSecret(admin, 'RESEND_API_KEY');
    const from = (await loadSettings(admin)).str('email_from');
    if (!apiKey || !from) throw new Error('Email is not set up: add the Resend API key and the sender address in Admin > Settings.');
    const { subject, html } = renderTemplate(m.templateName, m.variables);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.eventKey },
      body: JSON.stringify({ from, to: [m.to], subject, html }),
    });
    if (!res.ok) {
      const detail = `Resend rejected the send (${res.status}): ${(await res.text()).slice(0, 200)}`;
      await settle({ status: 'failed', details: detail.slice(0, 500) });
      return { status: 'failed', sent: false, reason: 'provider_rejected', message: detail };
    }
    const accepted = await res.json().catch(() => ({}));
    await settle({ status: 'sent', details: 'Accepted by Resend, queued for delivery', provider_id: accepted?.id ?? null, to_email: null, variables: null });
    return { status: 'sent', sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`email: ${m.eventKey} send failed: ${message}`);
    await settle({ status: 'failed', details: message.slice(0, 500) });
    return { status: 'failed', sent: false, reason: 'error', message };
  }
}

// Tries a failed delivery again. Returns null when the row is not retryable (already retried by someone else, or its
// recipient was cleared).
export async function retryDelivery(admin: SupabaseClient, rowId: string): Promise<EmailResult | null> {
  const { data: row } = await admin.from('email_deliveries').select('id,event_key,template_name,to_email,variables,attempts,status').eq('id', rowId).maybeSingle();
  if (!row || row.status !== 'failed' || !row.to_email) return null;
  // Claim the retry: only one caller can move a failed row back to queued.
  const { data: claimed, error } = await admin
    .from('email_deliveries')
    .update({ status: 'queued', attempts: row.attempts + 1, details: 'Retry starting', last_attempt_at: new Date().toISOString() })
    .eq('id', rowId).eq('status', 'failed').select('id');
  if (error) {
    if (error.code === '23505') return { status: 'duplicate', sent: false }; // the event has since been sent another way
    throw error;
  }
  if (!claimed?.length) return null;
  return await deliver(admin, rowId, { eventKey: row.event_key, templateName: row.template_name, to: row.to_email, variables: row.variables ?? {} });
}
