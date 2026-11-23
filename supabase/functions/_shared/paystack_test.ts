import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  channelMethod, checkKey, fromPesewas, initializeTransaction, keyMode, newReference, paystackSignature, PaystackError, recordCharge, toPesewas,
  verifyPaystackSignature, verifyTransaction,
} from './paystack.ts';

Deno.test('cedis and pesewas convert without rounding mistakes', () => {
  assertEquals(toPesewas(700), 70000);
  assertEquals(toPesewas(19.99), 1999);
  assertEquals(toPesewas(0.1 + 0.2), 30);
  assertEquals(toPesewas(1.005), 101);
  assertEquals(fromPesewas(70000), 700);
  assertEquals(fromPesewas(1050), 10.5);
  assertEquals(fromPesewas(null), 0);
  assertEquals(fromPesewas(undefined), 0);
});

Deno.test('a reference has only characters Paystack accepts and is not guessable', () => {
  const a = newReference('AAG-1234 / x');
  const b = newReference('AAG-1234 / x');
  assertEquals(/^aag-[a-z0-9]+-[a-f0-9]{16}$/.test(a), true);
  assertEquals(a === b, false);
  assertEquals(newReference('A', () => 'f'.repeat(32)), 'aag-a-' + 'f'.repeat(16));
});

Deno.test('the key mode is read from the key', () => {
  assertEquals(keyMode('sk_test_abc'), 'test');
  assertEquals(keyMode('sk_live_abc'), 'live');
  assertEquals(keyMode('pk_live_abc'), 'unknown');
});

Deno.test('mobile money is its own method and everything else is a card payment', () => {
  assertEquals(channelMethod('mobile_money'), 'mobile_money');
  assertEquals(channelMethod('card'), 'card');
  assertEquals(channelMethod('bank'), 'card');
  assertEquals(channelMethod(undefined), 'card');
});

Deno.test('the signature is HMAC-SHA512 of the exact body (known answer)', async () => {
  // HMAC-SHA512("key", "The quick brown fox jumps over the lazy dog") from the published test vectors
  const known = 'b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a';
  assertEquals(await paystackSignature('key', 'The quick brown fox jumps over the lazy dog'), known);
});

Deno.test('only a correctly signed body is accepted', async () => {
  const body = '{"event":"charge.success","data":{"reference":"aag-1"}}';
  const good = await paystackSignature('sk_test_secret', body);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body, good), true);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body, good.toUpperCase()), true);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body + ' ', good), false);
  assertEquals(await verifyPaystackSignature('sk_test_other', body, good), false);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body, null), false);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body, ''), false);
  assertEquals(await verifyPaystackSignature('sk_test_secret', body, good.slice(0, -2)), false);
});

function fakeFetch(status: number, payload: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return ((url: string, init: RequestInit) => {
    seen.url = url; seen.init = init;
    return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }));
  }) as unknown as typeof fetch;
}

Deno.test('starting a payment sends pesewas, cedis currency, the callback and the secret key', async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const res = await initializeTransaction('sk_test_x', { email: 'a@b.com', amount: 700, reference: 'aag-1', callbackUrl: 'https://site/pay/return', metadata: { booking: 'B' } },
    fakeFetch(200, { status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc', reference: 'aag-1' } }, seen));
  assertEquals(res.authorization_url, 'https://checkout.paystack.com/abc');
  assertEquals(seen.url, 'https://api.paystack.co/transaction/initialize');
  assertEquals((seen.init!.headers as Record<string, string>).Authorization, 'Bearer sk_test_x');
  const sent = JSON.parse(String(seen.init!.body));
  assertEquals([sent.amount, sent.currency, sent.reference, sent.callback_url, sent.email], [70000, 'GHS', 'aag-1', 'https://site/pay/return', 'a@b.com']);
  assertEquals(sent.channels, ['card', 'mobile_money']);
});

Deno.test('Paystack problems become clear errors', async () => {
  const start = (f: typeof fetch) => initializeTransaction('sk_test_x', { email: 'a@b.com', amount: 5, reference: 'r', callbackUrl: 'https://s' }, f);
  const bad = await assertRejects(() => start(fakeFetch(401, { status: false, message: 'Invalid key' })), PaystackError);
  assertEquals(bad.message.includes('secret key'), true);
  const refused = await assertRejects(() => start(fakeFetch(400, { status: false, message: 'Duplicate Transaction Reference' })), PaystackError);
  assertEquals(refused.message, 'Duplicate Transaction Reference');
  await assertRejects(() => start(fakeFetch(200, { status: true, data: {} })), PaystackError, 'payment page');
  const down = await assertRejects(() => start((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch), PaystackError);
  assertEquals(down.status, 503);
});

Deno.test('asking about a payment returns what Paystack says, and the reference is escaped', async () => {
  const seen: { url?: string } = {};
  const charge = await verifyTransaction('sk_test_x', 'aag-1/../x', fakeFetch(200, { status: true, data: { status: 'success', amount: 70000, currency: 'GHS', channel: 'card' } }, seen));
  assertEquals(charge.status, 'success');
  assertEquals(seen.url, 'https://api.paystack.co/transaction/verify/aag-1%2F..%2Fx');
});

Deno.test('the key check calls a read-only endpoint', async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  await checkKey('sk_test_x', fakeFetch(200, { status: true, data: [] }, seen));
  assertEquals(seen.init!.method, 'GET');
  await assertRejects(() => checkKey('sk_test_x', fakeFetch(401, { status: false, message: 'Invalid key' })), PaystackError);
});

Deno.test('a charge is handed to the database in cedis with its fee', async () => {
  let args: Record<string, unknown> = {};
  const admin = { rpc: (name: string, a: Record<string, unknown>) => { args = { name, ...a }; return Promise.resolve({ data: { status: 'recorded' }, error: null }); } };
  const res = await recordCharge(admin, { id: 99, reference: 'aag-1', amount: 70000, currency: 'GHS', channel: 'mobile_money', fees: 1050, paid_at: '2026-11-23T10:00:00.000Z' });
  assertEquals(res.status, 'recorded');
  assertEquals(args, { name: 'record_online_payment', p_reference: 'aag-1', p_amount: 700, p_currency: 'GHS', p_channel: 'mobile_money', p_fee: 10.5, p_paystack_id: '99', p_paid_at: '2026-11-23T10:00:00.000Z' });
  const failing = { rpc: () => Promise.resolve({ data: null, error: new Error('db down') }) };
  await assertRejects(() => recordCharge(failing, { reference: 'x' }), Error, 'db down');
});
