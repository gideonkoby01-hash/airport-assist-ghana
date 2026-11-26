// Run: deno test --allow-all supabase/functions/_shared/sms_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { parseHubtelReply, sendViaHubtel, senderProblem, smsConfirmed, smsNumber, smsStatus, smsSupervisorAssigned } from './sms.ts';
import { SETTING_BY_KEY, SECRET_BY_NAME, validateSetting, validateTogether } from './settingsRegistry.ts';

const booking = { reference: 'AAG-1234', airline: 'BA', flight_number: '078', flight_date: '2026-12-01', scheduled_flight_time: '10:30', outstanding_balance: 100 };

Deno.test('numbers are sent the way Hubtel wants them: country code, no plus', () => {
  for (const t of ['0241234567', '024 123 4567', '+233241234567', '233241234567']) assertEquals(smsNumber(t), '233241234567', t);
  assertEquals(smsNumber('+447911123456'), '447911123456');
  for (const t of ['', 'ama@example.com', 'call me', '123', null, undefined]) assertEquals(smsNumber(t), null, String(t));
});

Deno.test('sender names: up to 11 letters or numbers', () => {
  assertEquals(senderProblem('AirportAsst'), null);
  assertEquals(senderProblem(''), 'Enter the sender name first (Admin > Settings > Text messages).');
  for (const bad of ['Airport Assist', 'TwelveLetters', 'Air-port']) assertEquals(senderProblem(bad)?.startsWith('The sender name'), true, bad);
});

Deno.test('the texts say what happened, in plain letters', () => {
  const withService = { ...booking, package_name: 'Porter Service Only' };
  assertEquals(smsConfirmed(withService, 'Airport Assist Ghana'), 'Airport Assist Ghana: Porter Service Only confirmed. Ref AAG-1234, BA 078 on 2026-12-01 10:30. Pay at the airport.');
  assertEquals(smsConfirmed(withService, 'AAG', 'https://x.example/pay?r=1'), 'AAG: Porter Service Only confirmed. Ref AAG-1234, BA 078 on 2026-12-01 10:30. Pay online: https://x.example/pay?r=1');
  assertEquals(smsConfirmed({ ...withService, outstanding_balance: 0 }, 'AAG'), 'AAG: Porter Service Only confirmed. Ref AAG-1234, BA 078 on 2026-12-01 10:30.');
  assertEquals(smsConfirmed({ reference: 'R1' }, 'AAG'), 'AAG: booking confirmed. Ref R1.');
  assertEquals(smsSupervisorAssigned(booking, 'AAG', 'Doreen  Mensah', '0240000000'), 'AAG: Doreen Mensah will meet you for booking AAG-1234. Call 0240000000.');
  assertEquals(smsSupervisorAssigned(booking, 'AAG', '', ''), 'AAG: Your supervisor will meet you for booking AAG-1234.');
  assertEquals(smsStatus('in_progress', booking, 'AAG'), 'AAG: your service for AAG-1234 has started. Your supervisor is with you.');
  assertEquals(smsStatus('assigned', booking, 'AAG'), null);
  for (const s of ['in_progress', 'completed', 'cancelled', 'no_show']) assertEquals(/^[\x20-\x7e]+$/.test(smsStatus(s, booking, 'AAG')!), true, s);
});

Deno.test('Hubtel replies are understood whatever the capital letters', () => {
  assertEquals(parseHubtelReply(200, '{"rate":1,"messageId":"abc","status":0,"networkId":"62002"}'), { ok: true, message: 'Accepted by Hubtel', messageId: 'abc' });
  assertEquals(parseHubtelReply(200, '{"Status":0,"MessageId":"xyz"}'), { ok: true, message: 'Accepted by Hubtel', messageId: 'xyz' });
  assertEquals(parseHubtelReply(201, '{}').ok, true);
  assertEquals(parseHubtelReply(401, 'nope').message.includes('client ID and secret'), true);
  assertEquals(parseHubtelReply(403, '').ok, false);
  assertEquals(parseHubtelReply(402, '{}').message.includes('too little credit'), true);
  assertEquals(parseHubtelReply(400, '{"Message":"Insufficient balance"}').message.includes('too little credit'), true);
  const bad = parseHubtelReply(400, '{"status":4,"message":"Invalid sender"}');
  assertEquals([bad.ok, bad.message], [false, 'Hubtel did not send the text (400, status 4): Invalid sender']);
  assertEquals(parseHubtelReply(200, '{"status":1,"message":"Rejected"}').ok, false, 'a 200 with a non-zero status is a failure');
  assertEquals(parseHubtelReply(500, '<html>oops</html>').ok, false);
});

Deno.test('a send posts JSON with the client ID and secret as Basic auth', async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = ((url: string, init?: RequestInit) => { seen.push({ url, init }); return Promise.resolve(new Response('{"status":0,"messageId":"m1"}', { status: 200 })); }) as typeof fetch;
  const r = await sendViaHubtel({ clientId: 'id', clientSecret: 'sec', from: 'AAG' }, { to: '233241234567', content: 'Hello', reference: 'ref-1' }, fakeFetch);
  assertEquals(r.ok, true);
  assertEquals(seen.length, 1);
  assertEquals(seen[0].init?.method, 'POST');
  assertEquals((seen[0].init?.headers as Record<string, string>).Authorization, `Basic ${btoa('id:sec')}`);
  assertEquals(JSON.parse(String(seen[0].init?.body)), { From: 'AAG', To: '233241234567', Content: 'Hello', RegisteredDelivery: true, ClientReference: 'ref-1' });
});

Deno.test('if the POST address is not known, the quick-send form of it is tried', async () => {
  const seen: string[] = [];
  const fakeFetch = ((url: string, init?: RequestInit) => {
    seen.push(`${init?.method ?? 'GET'} ${url}`);
    return Promise.resolve(init?.method === 'POST' ? new Response('', { status: 404 }) : new Response('{"status":0,"messageId":"m2"}', { status: 200 }));
  }) as typeof fetch;
  const r = await sendViaHubtel({ clientId: 'id', clientSecret: 'sec', from: 'AAG' }, { to: '233241234567', content: 'Hi there' }, fakeFetch);
  assertEquals([r.ok, r.messageId], [true, 'm2']);
  assertEquals(seen.length, 2);
  assertEquals(seen[1].startsWith('GET https://smsc.hubtel.com/v1/messages/send?clientid=id&clientsecret=sec&from=AAG&to=233241234567&content=Hi+there'), true);
});

Deno.test('text message settings: off by default, a sender name is checked, and it is needed to switch on', () => {
  assertEquals(SETTING_BY_KEY.get('sms_enabled')?.default, 'false');
  const sender = SETTING_BY_KEY.get('sms_sender_id')!;
  assertEquals(validateSetting(sender, 'AirportAsst'), { ok: true, value: 'AirportAsst' });
  assertEquals(validateSetting(sender, ''), { ok: true, value: '' });
  assertEquals(validateSetting(sender, 'Airport Assist').ok, false);
  assertEquals(validateSetting(sender, 'WayTooLongName').ok, false);
  assertEquals(validateTogether({ sms_enabled: 'true', sms_sender_id: '' }), 'Enter the sender name before switching text messages on.');
  assertEquals(validateTogether({ sms_enabled: 'true', sms_sender_id: 'AAG' }), null);
  assertEquals(SECRET_BY_NAME.get('HUBTEL_CLIENT_ID')?.group, 'sms');
  assertEquals(SECRET_BY_NAME.get('HUBTEL_CLIENT_SECRET')?.group, 'sms');
});
