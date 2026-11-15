// Run: deno test supabase/functions/_shared/svix_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { sign, verifySvix } from './svix.ts';

const secret = 'whsec_' + btoa('a-test-signing-key-0123456789');
const now = 1_800_000_000_000;
const ts = String(now / 1000);
const body = '{"type":"email.delivered","data":{"email_id":"em_1"}}';

async function headers(over: Record<string, string> = {}) {
  const sig = await sign(secret, 'msg_1', ts, body);
  return new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${sig}`, ...over });
}

Deno.test('a correctly signed webhook is accepted', async () => {
  assertEquals(await verifySvix(secret, await headers(), body, { nowMs: now }), true);
});
Deno.test('several signatures: any valid one is enough', async () => {
  const good = await sign(secret, 'msg_1', ts, body);
  assertEquals(await verifySvix(secret, await headers({ 'svix-signature': `v1,AAAA v1,${good}` }), body, { nowMs: now }), true);
});
Deno.test('a changed body, wrong secret or missing header is refused', async () => {
  assertEquals(await verifySvix(secret, await headers(), body + ' ', { nowMs: now }), false);
  assertEquals(await verifySvix('whsec_' + btoa('another-key'), await headers(), body, { nowMs: now }), false);
  const h = await headers(); h.delete('svix-signature');
  assertEquals(await verifySvix(secret, h, body, { nowMs: now }), false);
});
Deno.test('an old webhook is refused (replay)', async () => {
  assertEquals(await verifySvix(secret, await headers(), body, { nowMs: now + 10 * 60_000 }), false);
  assertEquals(await verifySvix(secret, await headers(), body, { nowMs: now + 60_000 }), true);
});
Deno.test('only version v1 signatures count', async () => {
  const good = await sign(secret, 'msg_1', ts, body);
  assertEquals(await verifySvix(secret, await headers({ 'svix-signature': `v2,${good}` }), body, { nowMs: now }), false);
});
