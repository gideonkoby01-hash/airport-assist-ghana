import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getSecret, loadSettings } from './config.ts';
import { normalizePhone } from './phone.ts';

// Text messages to passengers through Hubtel. Mirrors the email sender: every message is claimed in sms_deliveries first (so the
// same event is never texted twice), a failure is reported and never thrown (so the booking that triggered it still succeeds), and the
// phone number and text are erased from the log once Hubtel accepts the message.

export type SmsResult = { status: 'sent' | 'duplicate' | 'skipped' | 'failed'; sent: boolean; reason?: string; message?: string };

const HUBTEL_URL = 'https://smsc.hubtel.com/v1/messages/send';

/** A phone number as Hubtel wants it: digits with the country code and no plus (233241234567), or null. */
export function smsNumber(text: unknown): string | null {
  const e164 = normalizePhone(text);
  return e164 ? e164.slice(1) : null;
}

export const senderProblem = (sender: string): string | null =>
  !sender ? 'Enter the sender name first (Admin > Settings > Text messages).' : /^[A-Za-z0-9]{1,11}$/.test(sender) ? null : 'The sender name must be up to 11 letters or numbers, with no spaces.';

export interface HubtelReply { ok: boolean; messageId?: string; message: string }

/** Reads Hubtel's answer to a send. Field names are matched without regard to capital letters, because the replies are not consistent. */
export function parseHubtelReply(httpStatus: number, bodyText: string): HubtelReply {
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object') body = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]));
  } catch { /* not JSON */ }
  const said = String(body.message ?? body.description ?? '').trim() || bodyText.trim().slice(0, 160);
  if (httpStatus === 401 || httpStatus === 403) return { ok: false, message: 'Hubtel did not accept the client ID and secret. Check them in Admin > Settings > Text messages.' };
  if (httpStatus === 402 || /insufficient|balance|credit/i.test(said)) return { ok: false, message: 'Hubtel says the account has too little credit. Top it up and try again.' };
  const code = body.status;
  const accepted = httpStatus >= 200 && httpStatus < 300 && (code === undefined || code === 0 || code === '0');
  if (accepted) return { ok: true, message: 'Accepted by Hubtel', messageId: body.messageid ? String(body.messageid) : undefined };
  return { ok: false, message: `Hubtel did not send the text (${httpStatus}${code !== undefined ? `, status ${code}` : ''})${said ? `: ${said}` : '.'}`.slice(0, 300) };
}

/** One send through Hubtel. Tries the POST form; if the server does not know it, the same address's quick-send form. */
export async function sendViaHubtel(
  creds: { clientId: string; clientSecret: string; from: string },
  msg: { to: string; content: string; reference?: string },
  fetchFn: typeof fetch = fetch,
): Promise<HubtelReply> {
  let res = await fetchFn(HUBTEL_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: creds.from, To: msg.to, Content: msg.content, RegisteredDelivery: true, ...(msg.reference ? { ClientReference: msg.reference.slice(0, 50) } : {}) }),
  });
  if (res.status === 404 || res.status === 405) {
    const q = new URLSearchParams({ clientid: creds.clientId, clientsecret: creds.clientSecret, from: creds.from, to: msg.to, content: msg.content });
    res = await fetchFn(`${HUBTEL_URL}?${q}`);
  }
  return parseHubtelReply(res.status, await res.text());
}

/**
 * Sends one text. `to` is whatever was typed on the booking. Does nothing (and logs nothing) while text messages are switched off,
 * unless `test` is set (the Settings page's test button). Never throws.
 */
export async function sendSms(
  admin: SupabaseClient,
  opts: { eventKey: string; to: unknown; text: string; relatedEntityId?: string; test?: boolean; fetchFn?: typeof fetch },
): Promise<SmsResult> {
  try {
    const settings = await loadSettings(admin);
    if (!opts.test && !settings.bool('sms_enabled')) return { status: 'skipped', sent: false, reason: 'sms_off' };
    const related = opts.relatedEntityId ?? '';
    const number = smsNumber(opts.to);
    if (!number) {
      await admin.from('sms_deliveries').insert({ event_key: opts.eventKey, status: 'skipped', details: 'No valid phone number', related_entity_id: related });
      return { status: 'skipped', sent: false, reason: 'no_valid_phone', message: 'That is not a valid phone number.' };
    }

    const { data: claim, error: claimError } = await admin.from('sms_deliveries')
      .insert({ event_key: opts.eventKey, status: 'queued', details: 'Send attempt starting', related_entity_id: related, to_phone: number, body: opts.text })
      .select('id').single();
    if (claimError) {
      if (claimError.code === '23505') return { status: 'duplicate', sent: false };
      console.error(`sms: could not claim ${opts.eventKey}: ${claimError.message}`);
      return { status: 'failed', sent: false, reason: 'error', message: claimError.message };
    }
    const settle = (patch: Record<string, unknown>) => admin.from('sms_deliveries').update({ ...patch, last_attempt_at: new Date().toISOString() }).eq('id', claim.id);

    const fail = async (message: string, reason: string): Promise<SmsResult> => {
      await settle({ status: 'failed', details: message.slice(0, 500) });
      return { status: 'failed', sent: false, reason, message };
    };
    const clientId = await getSecret(admin, 'HUBTEL_CLIENT_ID');
    const clientSecret = await getSecret(admin, 'HUBTEL_CLIENT_SECRET');
    if (!clientId || !clientSecret) return await fail('Text messages are not set up: save the Hubtel client ID and secret in Admin > Settings.', 'not_configured');
    const from = settings.str('sms_sender_id');
    const problem = senderProblem(from);
    if (problem) return await fail(problem, 'not_configured');

    let reply: HubtelReply;
    try {
      reply = await sendViaHubtel({ clientId, clientSecret, from }, { to: number, content: opts.text, reference: claim.id }, opts.fetchFn);
    } catch (e) {
      return await fail(`Could not reach Hubtel: ${e instanceof Error ? e.message : String(e)}`, 'network');
    }
    if (!reply.ok) return await fail(reply.message, 'provider_rejected');
    await settle({ status: 'sent', details: reply.message, provider_id: reply.messageId ?? null, to_phone: null, body: null });
    return { status: 'sent', sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`sms: ${opts.eventKey} failed: ${message}`);
    return { status: 'failed', sent: false, reason: 'error', message };
  }
}

/** Texts a booking's passenger on the phone number given on the booking. `build` makes the text from the business name. */
export async function smsBookingPassenger(
  admin: SupabaseClient, booking: Record<string, any>,
  opts: { eventKey: string; build: (company: string) => string },
): Promise<SmsResult> {
  const settings = await loadSettings(admin);
  if (!settings.bool('sms_enabled')) return { status: 'skipped', sent: false, reason: 'sms_off' };
  return await sendSms(admin, { eventKey: opts.eventKey, to: booking.contact, text: opts.build(settings.str('company_name') || 'Airport Assist Ghana'), relatedEntityId: booking.id });
}

// ---- The texts. Plain letters only (no accents or symbols), so each stays one standard SMS where it can. ----

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const flightWords = (b: Record<string, any>) => {
  const flight = [b.airline, b.flight_number].map(clean).filter(Boolean).join(' ');
  const when = [b.flight_date, b.scheduled_flight_time].map(clean).filter(Boolean).join(' ');
  return [flight, when && `on ${when}`].filter(Boolean).join(' ');
};

export function smsConfirmed(b: Record<string, any>, company: string, payUrl?: string): string {
  const owes = Number(b.outstanding_balance) > 0;
  const pay = !owes ? '' : payUrl ? ` Pay online: ${payUrl}` : ' Pay at the airport.';
  return `${company}: booking ${clean(b.reference)} received${flightWords(b) ? ` for ${flightWords(b)}` : ''}.${pay}`;
}

export function smsSupervisorAssigned(b: Record<string, any>, company: string, supervisorName: string, supervisorPhone: string): string {
  const name = clean(supervisorName) || 'Your supervisor';
  const phone = clean(supervisorPhone);
  return `${company}: ${name} will meet you for booking ${clean(b.reference)}${phone ? `. Call ${phone}` : ''}.`;
}

const STATUS_TEXT: Record<string, (ref: string, company: string) => string> = {
  in_progress: (ref, c) => `${c}: your service for ${ref} has started. Your supervisor is with you.`,
  completed: (ref, c) => `${c}: your service for ${ref} is complete. Thank you for travelling with us.`,
  cancelled: (ref, c) => `${c}: booking ${ref} has been cancelled. If you did not expect this, please contact our desk.`,
  no_show: (ref, c) => `${c}: we missed you for booking ${ref}, so it is now closed. Contact our desk if this is a mistake.`,
};
/** The text for a status change, or null for statuses the passenger is not told about. */
export function smsStatus(status: string, b: Record<string, any>, company: string): string | null {
  const make = STATUS_TEXT[status];
  return make ? make(clean(b.reference), company) : null;
}
