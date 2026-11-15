// Run: deno test supabase/functions/_shared/crypto_test.ts
import { assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import { decryptSecret, encryptionKeyProblem, encryptSecret, last4 } from './crypto.ts';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const otherKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

Deno.test('a secret survives a round trip and is not stored readable', async () => {
  const stored = await encryptSecret('re_live_abcdef123456', key);
  assertEquals(stored.startsWith('v1.'), true);
  assertEquals(stored.includes('re_live'), false);
  assertEquals(await decryptSecret(stored, key), 're_live_abcdef123456');
});

Deno.test('the same secret encrypts differently each time', async () => {
  assertNotEquals(await encryptSecret('same', key), await encryptSecret('same', key));
});

Deno.test('the wrong key, or a tampered value, is refused', async () => {
  const stored = await encryptSecret('secret-value', key);
  await assertRejects(() => decryptSecret(stored, otherKey));
  const [v, iv, sealed] = stored.split('.');
  const flipped = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assertRejects(() => decryptSecret(`${v}.${iv}.${flipped}`, key));
  await assertRejects(() => decryptSecret('garbage', key));
});

Deno.test('key problems are explained', () => {
  assertEquals(encryptionKeyProblem(key), null);
  assertEquals(encryptionKeyProblem(undefined)?.includes('not set'), true);
  assertEquals(encryptionKeyProblem('abc')?.includes('32'), true);
  assertEquals(encryptionKeyProblem('%%%not base64%%%')?.includes('base64'), true);
});

Deno.test('only a hint of a key is ever shown', () => {
  assertEquals(last4('re_live_abcdef123456'), '3456');
  assertEquals(last4('short'), '');
});
