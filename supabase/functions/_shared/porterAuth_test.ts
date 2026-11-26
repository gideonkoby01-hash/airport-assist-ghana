// Run: deno test --allow-all supabase/functions/_shared/porterAuth_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { normalizePhone } from './phone.ts';
import { hashPassword, passwordProblem, spendTheSameTime, verifyPassword } from './password.ts';
import { signSession, verifySession } from './porterSession.ts';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const otherKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

Deno.test('phone numbers written the usual ways all become one number', () => {
  for (const t of ['0241234567', '024 123 4567', '024-123-4567', '(024) 123 4567', '233241234567', '+233241234567', '+233 24 123 4567', '00233241234567', '241234567']) {
    assertEquals(normalizePhone(t), '+233241234567', t);
  }
  assertEquals(normalizePhone('+447911123456'), '+447911123456');
  for (const t of ['', '  ', 'ama@example.com', 'ama', '12345', '0241234567x', null, undefined]) assertEquals(normalizePhone(t), null, String(t));
});

Deno.test('a password is stored as a salted hash and only the right one matches', async () => {
  const stored = await hashPassword('Correct-Horse-9', 2000);
  assertEquals(stored.startsWith('pbkdf2-sha256$2000$'), true);
  assertEquals(stored.includes('Correct-Horse-9'), false);
  assertEquals(await verifyPassword(stored, 'Correct-Horse-9'), true);
  assertEquals(await verifyPassword(stored, 'correct-horse-9'), false);
  assertEquals(await verifyPassword(stored, ''), false);
  assertEquals(stored === (await hashPassword('Correct-Horse-9', 2000)), false, 'a new salt each time');
});

Deno.test('a broken or odd stored value never matches, and never throws', async () => {
  for (const bad of ['', 'plain', 'pbkdf2-sha256$x$a$b', 'pbkdf2-sha256$2000$$', 'md5$2000$AAAA$AAAA', 'pbkdf2-sha256$99999999$AAAA$AAAA', 'pbkdf2-sha256$2000$!!!$!!!']) {
    assertEquals(await verifyPassword(bad, 'anything'), false, bad);
  }
  assertEquals(await spendTheSameTime('whatever'), false);
});

Deno.test('what makes a password too weak', () => {
  assertEquals(passwordProblem('Short-1'), 'Use at least 10 characters.');
  assertEquals(passwordProblem('1234567890'), 'Use letters as well as numbers.');
  assertEquals(passwordProblem('0241234567', ''), 'Use letters as well as numbers.');
  assertEquals(passwordProblem('x'.repeat(201)), 'That password is too long.');
  assertEquals(passwordProblem('Tr0ub4dor&3-long', '+233241234567'), null);
  assertEquals(passwordProblem('my024-123-4567x', '+233241234567'), 'Do not use your phone number as your password.');
  assertEquals(passwordProblem('Kofi-2024-Porter', '+233241234567'), null, 'unrelated digits are fine');
});

Deno.test('a session token carries the porter, is signed, and expires', async () => {
  const now = Date.UTC(2026, 10, 25, 8, 0, 0);
  const { token, expires_at } = await signSession('porter-1', 3, key, now);
  assertEquals(expires_at, '2026-11-25T20:00:00.000Z');
  const s = await verifySession(token, key, now + 60_000);
  assertEquals([s?.p, s?.tv], ['porter-1', 3]);
  assertEquals(await verifySession(token, key, now + 12 * 3600 * 1000 + 1000), null, 'expired');
});

Deno.test('a session token cannot be forged, altered or used with another key', async () => {
  const now = Date.now();
  const { token } = await signSession('porter-1', 1, key, now);
  const [v, body, sig] = token.split('.');
  assertEquals(await verifySession(token, otherKey, now), null);
  assertEquals(await verifySession(`${v}.${body}.${sig.slice(0, -2)}AA`, key, now), null);
  // another porter's id with the first porter's signature
  const forged = btoa(JSON.stringify({ p: 'porter-2', tv: 1, iat: 1, exp: 9999999999 })).replace(/=+$/, '');
  assertEquals(await verifySession(`${v}.${forged}.${sig}`, key, now), null);
  for (const bad of ['', 'x', 'v2.a.b', 'v1..', 'v1.a', null, undefined, 42]) assertEquals(await verifySession(bad, key, now), null, String(bad));
});
