// Run: deno test supabase/functions/_shared/settingsRegistry_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { PUBLIC_DEFAULTS } from '../../../src/lib/publicSettings.js';
import { SECRETS, SETTINGS, SETTING_BY_KEY, resolveSettings, validateSecret, validateSetting, validateTogether } from './settingsRegistry.ts';

const def = (k: string) => SETTING_BY_KEY.get(k)!;
const check = (k: string, v: unknown) => validateSetting(def(k), v);

Deno.test('every setting has a unique key and a valid default of its own kind', () => {
  assertEquals(new Set(SETTINGS.map((s) => s.key)).size, SETTINGS.length);
  for (const s of SETTINGS) {
    if (s.key === 'email_from') continue; // empty means "not set yet"
    const r = validateSetting(s, s.default);
    assertEquals(r.ok, true, `${s.key} default ${JSON.stringify(s.default)}: ${r.ok ? '' : r.error}`);
  }
});

Deno.test('the website fallbacks match the registry defaults for every public setting', () => {
  const publicKeys = SETTINGS.filter((s) => s.public).map((s) => s.key).sort();
  assertEquals(Object.keys(PUBLIC_DEFAULTS).sort(), publicKeys);
  for (const k of publicKeys) assertEquals((PUBLIC_DEFAULTS as Record<string, string>)[k], def(k).default, k);
});

Deno.test('numbers: kind, range and tidy storage', () => {
  assertEquals(check('min_lead_hours', ' 4 '), { ok: true, value: '4' });
  assertEquals(check('min_lead_hours', '4.50'), { ok: true, value: '4.5' });
  assertEquals(check('min_lead_hours', 'abc').ok, false);
  assertEquals(check('min_lead_hours', '-1').ok, false);
  assertEquals(check('min_lead_hours', '100').ok, false);
  assertEquals(check('photo_retention_days', '0').ok, false);
  assertEquals(check('photo_retention_days', '400').ok, false);
});

Deno.test('switches, times, emails and text', () => {
  assertEquals(check('online_bookings_enabled', 'false'), { ok: true, value: 'false' });
  assertEquals(check('online_bookings_enabled', 'yes').ok, false);
  assertEquals(check('shift_morning_start', '07:30'), { ok: true, value: '07:30' });
  assertEquals(check('shift_morning_start', '7:30').ok, false);
  assertEquals(check('shift_morning_start', '24:00').ok, false);
  assertEquals(check('contact_email', 'desk@example.com').ok, true);
  assertEquals(check('contact_email', 'not an email').ok, false);
  assertEquals(check('company_name', '').ok, false);
  assertEquals(check('company_name', 'x'.repeat(81)).ok, false);
});

Deno.test('sender address: empty, plain, or with a name; nothing else', () => {
  assertEquals(check('email_from', '').ok, true);
  assertEquals(check('email_from', 'noreply@mail.example.com').ok, true);
  assertEquals(check('email_from', 'Airport Assist Ghana <noreply@mail.example.com>').ok, true);
  assertEquals(check('email_from', 'Airport <>').ok, false);
  assertEquals(check('email_from', 'two@a.com three@b.com').ok, false);
});

Deno.test('settings that depend on each other', () => {
  assertEquals(validateTogether({ shift_morning_start: '06:00', shift_night_start: '18:00' }), null);
  assertEquals(validateTogether({ shift_morning_start: '18:00', shift_night_start: '06:00' })?.includes('after'), true);
  assertEquals(validateTogether({ shift_morning_start: '06:00', shift_night_start: '06:00' })?.includes('after'), true);
});

Deno.test('keys: shape and prefix are checked, and the message says where to get the right one', () => {
  const resend = SECRETS.find((s) => s.name === 'RESEND_API_KEY')!;
  assertEquals(validateSecret(resend, 're_abcdefghijklmnop').ok, true);
  const wrong = validateSecret(resend, 'sk_abcdefghijklmnop');
  assertEquals(wrong.ok, false);
  assertEquals(!wrong.ok && wrong.error.includes('Resend > API Keys'), true);
  assertEquals(validateSecret(resend, 're_ short').ok, false);
  assertEquals(validateSecret(resend, 're_has a space inside').ok, false);
  assertEquals(validateSecret(SECRETS[1], 'whsec_' + 'a'.repeat(20)).ok, true);
});

Deno.test('a setting resolves to the saved value, then the environment, then the default', () => {
  const env = (n: string) => ({ MIN_LEAD_HOURS: '5', PHOTO_RETENTION_DAYS: '' } as Record<string, string>)[n];
  const r = resolveSettings([{ key: 'photo_retention_days', value: '45' }, { key: 'booking_limit_per_hour', value: '6' }], env);
  assertEquals(r.photo_retention_days, { value: '45', source: 'saved' });
  assertEquals(r.min_lead_hours, { value: '5', source: 'environment' });
  assertEquals(r.booking_limit_per_hour, { value: '6', source: 'saved' });
  assertEquals(r.max_advance_days, { value: '366', source: 'default' });
  const empty = resolveSettings([], () => '');
  assertEquals(empty.photo_retention_days, { value: '30', source: 'default' }); // an empty environment value counts as not set
});

// ---- SMTP settings ------------------------------------------------------------------------------------
Deno.test('SMTP: provider and security are choices, the port is a real port', () => {
  assertEquals(check('email_provider', 'smtp'), { ok: true, value: 'smtp' });
  assertEquals(check('email_provider', 'sendgrid').ok, false);
  assertEquals(check('smtp_security', 'starttls').ok, true);
  assertEquals(check('smtp_security', 'tls1.3').ok, false);
  assertEquals(check('smtp_port', '465'), { ok: true, value: '465' });
  assertEquals(check('smtp_port', '0').ok, false);
  assertEquals(check('smtp_port', '70000').ok, false);
});

Deno.test('SMTP: the server must be a public name, not a URL, a local machine or a private address', () => {
  for (const ok of ['smtp.gmail.com', 'smtp.office365.com', 'mail.example.co.ke', '203.0.113.9']) assertEquals(check('smtp_host', ok).ok, true, ok);
  for (const bad of ['https://smtp.example.com', 'smtp.example.com:465', 'localhost', 'mail.localhost', 'printer.local', 'db.internal', 'mailserver',
    '127.0.0.1', '10.0.0.5', '172.16.4.4', '172.31.255.1', '192.168.1.10', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', 'a b.com']) {
    assertEquals(check('smtp_host', bad).ok, false, bad);
  }
  assertEquals(check('smtp_host', '').ok, true); // may be empty until SMTP is chosen
  assertEquals(check('smtp_host', '172.32.0.1').ok, true); // just outside the private 172.16-31 range
});

Deno.test('SMTP: the username is optional (some servers need no sign-in)', () => {
  assertEquals(check('smtp_username', '').ok, true);
  assertEquals(check('smtp_username', 'mailer@example.com').ok, true);
  assertEquals(check('company_name', '').ok, false); // other settings still cannot be empty
});

Deno.test('SMTP: choosing it needs a server and a sender', () => {
  const ok = { email_provider: 'smtp', smtp_host: 'smtp.example.com', email_from: 'Name <noreply@example.com>' };
  assertEquals(validateTogether(ok), null);
  assertEquals(validateTogether({ ...ok, smtp_host: '' })?.includes('server'), true);
  assertEquals(validateTogether({ ...ok, email_from: '' })?.includes('sender'), true);
  assertEquals(validateTogether({ email_provider: 'resend', smtp_host: '', email_from: '' }), null);
});

Deno.test('SMTP password: any length from 1, spaces allowed (app passwords have them), no prefix rule', () => {
  const pw = SECRETS.find((s) => s.name === 'SMTP_PASSWORD')!;
  assertEquals(validateSecret(pw, 'abcd efgh ijkl mnop').ok, true);
  assertEquals(validateSecret(pw, 'x').ok, true);
  assertEquals(validateSecret(pw, '   ').ok, false);
  assertEquals(validateSecret(pw, 'a'.repeat(501)).ok, false);
});

Deno.test('keys and fields are shown only for the provider they belong to', () => {
  const resend = SECRETS.find((s) => s.name === 'RESEND_API_KEY')!;
  const smtp = SECRETS.find((s) => s.name === 'SMTP_PASSWORD')!;
  assertEquals([resend.showWhen?.value, smtp.showWhen?.value], ['resend', 'smtp']);
  for (const k of ['smtp_host', 'smtp_port', 'smtp_security', 'smtp_username']) assertEquals(def(k).showWhen, { key: 'email_provider', value: 'smtp' });
});
