// Paystack, the online payment service: the money maths, the signature check on what Paystack sends us, and the two
// calls we make to it (start a payment, ask how a payment went). Every call to the network takes an injectable `fetchFn` so
// the tests never reach Paystack.

export const PAYSTACK_API = 'https://api.paystack.co';

/** Paystack counts money in the smallest unit (pesewas): GHS 700.00 is 70000. */
export const toPesewas = (ghs: number): number => Math.round((Number(ghs) + Number.EPSILON) * 100);
export const fromPesewas = (pesewas: unknown): number => Math.round(Number(pesewas) || 0) / 100;

/** A reference nobody can guess, in the characters Paystack accepts (letters, digits, - . =). */
export function newReference(bookingReference: string, random: () => string = () => crypto.randomUUID().replace(/-/g, '')): string {
  const safe = String(bookingReference || 'booking').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return `aag-${safe}-${random().slice(0, 16)}`;
}

/** Test keys start sk_test_, live keys sk_live_. A test key moves no real money. */
export function keyMode(secret: string): 'test' | 'live' | 'unknown' {
  if (secret.startsWith('sk_test_')) return 'test';
  if (secret.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

/** How a Paystack channel is written in the payments record: mobile money stays mobile money, everything else is a card payment. */
export const channelMethod = (channel: unknown): 'mobile_money' | 'card' => (String(channel) === 'mobile_money' ? 'mobile_money' : 'card');

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Paystack signs the exact text it sends with HMAC-SHA512, keyed by your secret key, and puts it in `x-paystack-signature`. */
export async function paystackSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

export async function verifyPaystackSignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  return sameText(signature.trim().toLowerCase(), await paystackSignature(secret, body));
}

export class PaystackError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

type Fetch = typeof fetch;

async function call(secret: string, path: string, init: RequestInit, fetchFn: Fetch): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetchFn(`${PAYSTACK_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PaystackError('Paystack could not be reached. Please try again in a moment.', 503);
  }
  let body: Record<string, any> = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401) throw new PaystackError('Paystack did not accept the secret key. Check it under Admin > Settings > Online payments.', 502);
  if (!res.ok || body.status === false) throw new PaystackError(String(body.message || `Paystack answered with an error (${res.status}).`), 502);
  return body;
}

export interface InitializeInput { email: string; amount: number; reference: string; callbackUrl: string; metadata?: Record<string, unknown> }

/** Starts a payment. Returns the page the passenger is sent to. `amount` is in cedis. */
export async function initializeTransaction(secret: string, input: InitializeInput, fetchFn: Fetch = fetch): Promise<{ authorization_url: string; access_code: string; reference: string }> {
  const body = await call(secret, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email, amount: toPesewas(input.amount), currency: 'GHS', reference: input.reference,
      callback_url: input.callbackUrl, channels: ['card', 'mobile_money'], metadata: input.metadata ?? {},
    }),
  }, fetchFn);
  const data = body.data ?? {};
  if (!data.authorization_url) throw new PaystackError('Paystack did not give a payment page. Please try again.');
  return { authorization_url: String(data.authorization_url), access_code: String(data.access_code ?? ''), reference: String(data.reference ?? input.reference) };
}

export interface PaystackCharge {
  id?: number | string; status?: string; reference?: string; amount?: number; currency?: string; channel?: string; fees?: number | null; paid_at?: string | null;
}

/** Asks Paystack how a payment went. The answer from Paystack itself is the only one we trust on the return page. */
export async function verifyTransaction(secret: string, reference: string, fetchFn: Fetch = fetch): Promise<PaystackCharge> {
  const body = await call(secret, `/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }, fetchFn);
  return (body.data ?? {}) as PaystackCharge;
}

/** Checks the key works without moving money (used by the "Test the key" button). */
export async function checkKey(secret: string, fetchFn: Fetch = fetch): Promise<void> {
  await call(secret, '/bank?country=ghana&perPage=1', { method: 'GET' }, fetchFn);
}

export interface RecordResult {
  status: 'recorded' | 'duplicate' | 'needs_review' | 'unknown_reference';
  reason?: string; booking_id?: string; amount?: number; method?: string; outstanding_balance?: number; amount_collected?: number;
}

/** Records a successful Paystack charge in the books, once however many times it is reported. */
export async function recordCharge(
  admin: { rpc: (name: string, args: Record<string, unknown>) => any }, charge: PaystackCharge,
): Promise<RecordResult> {
  const { data, error } = await admin.rpc('record_online_payment', {
    p_reference: String(charge.reference ?? ''), p_amount: fromPesewas(charge.amount), p_currency: String(charge.currency ?? ''),
    p_channel: String(charge.channel ?? ''), p_fee: fromPesewas(charge.fees), p_paystack_id: String(charge.id ?? ''),
    p_paid_at: charge.paid_at ?? null,
  });
  if (error) throw error;
  return data as RecordResult;
}
