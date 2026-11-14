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
