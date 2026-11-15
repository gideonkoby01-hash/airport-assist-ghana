// Run: deno test supabase/functions/_shared/validation_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { checkFlight, isPhone, parseFlightTime } from './validation.ts';
import { tokenAal } from './auth.ts';
import { corsFor, handle, HttpError, json } from './http.ts';

const now = Date.UTC(2026, 10, 14, 12, 0); // 14 Nov 2026 12:00 in Accra
const online = { now, minLeadHours: 2, isStaff: false };

Deno.test('flight dates must be real', () => {
  assertEquals(parseFlightTime('2026-12-01', '14:30'), Date.UTC(2026, 11, 1, 14, 30));
  assertEquals(parseFlightTime('2026-02-31', '10:00'), null);
  assertEquals(parseFlightTime('tomorrow', '10:00'), null);
  assertEquals(parseFlightTime('2026-12-01', '25:00'), null);
  assertEquals(parseFlightTime('2026-12-01', '9:00'), null);
});

Deno.test('online bookings: past, too soon, fine, too far ahead', () => {
  assertEquals(checkFlight('2026-11-13', '10:00', online)?.includes('already passed'), true);
  assertEquals(checkFlight('2026-11-14', '13:00', online)?.includes('2 hours'), true);
  assertEquals(checkFlight('2026-11-14', '14:30', online), null);
  assertEquals(checkFlight('2028-01-01', '10:00', online)?.includes('366 days'), true);
  assertEquals(checkFlight('2027-02-14', '10:00', { ...online, maxAdvanceDays: 30 })?.includes('30 days'), true);
  assertEquals(checkFlight('2026-12-01', '10:00', { ...online, maxAdvanceDays: 30 }), null);
});

Deno.test('staff may book imminent or just-gone flights but not old ones', () => {
  const staff = { ...online, isStaff: true };
  assertEquals(checkFlight('2026-11-14', '12:30', staff), null);
  assertEquals(checkFlight('2026-11-14', '09:00', staff), null);
  assertEquals(checkFlight('2026-11-10', '09:00', staff)?.includes('past'), true);
});

Deno.test('phone numbers', () => {
  assertEquals(isPhone('+233 20 123 4567'), true);
  assertEquals(isPhone('0201234567'), true);
  assertEquals(isPhone('12345'), false);
  assertEquals(isPhone('call me maybe'), false);
});

Deno.test('assurance level is read from the token', () => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  assertEquals(tokenAal(`h.${b64({ aal: 'aal2' })}.s`), 'aal2');
  assertEquals(tokenAal(`h.${b64({ aal: 'aal1' })}.s`), 'aal1');
  assertEquals(tokenAal(`h.${b64({})}.s`), '');
  assertEquals(tokenAal('garbage'), '');
});

Deno.test('CORS: only the configured site is echoed back', () => {
  Deno.env.set('APP_URL', 'https://site.example/');
  Deno.env.set('ALLOWED_ORIGINS', 'https://preview.example');
  assertEquals(corsFor('https://preview.example')['Access-Control-Allow-Origin'], 'https://preview.example');
  assertEquals(corsFor('https://evil.example')['Access-Control-Allow-Origin'], 'https://site.example');
  Deno.env.delete('APP_URL');
  Deno.env.delete('ALLOWED_ORIGINS');
  assertEquals(corsFor('https://anything')['Access-Control-Allow-Origin'], '*');
});

Deno.test('errors: HttpError passes through, anything else is hidden behind a request id', async () => {
  const known = await handle('t', () => Promise.reject(new HttpError(409, 'Nope')))(new Request('http://x', { method: 'POST' }));
  assertEquals(known.status, 409);
  assertEquals((await known.json()).error, 'Nope');

  const unknown = await handle('t', () => Promise.reject(new Error('db password is hunter2')))(new Request('http://x', { method: 'POST' }));
  const body = await unknown.json();
  assertEquals(unknown.status, 500);
  assertEquals(JSON.stringify(body).includes('hunter2'), false);
  assertEquals(typeof body.request_id, 'string');
  assertEquals(unknown.headers.get('x-request-id'), body.request_id);

  const big = await handle('t', () => Promise.resolve(json({ ok: true })))(new Request('http://x', { method: 'POST', headers: { 'content-length': '999999' }, body: 'x' }));
  assertEquals(big.status, 413);
});
