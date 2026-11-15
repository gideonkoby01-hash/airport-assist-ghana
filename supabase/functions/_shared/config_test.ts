// Run: deno test --allow-env supabase/functions/_shared/config_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { clearConfigCache, getSecret, loadSettings } from './config.ts';
import { encryptSecret } from './crypto.ts';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

function fakeAdmin(tables: Record<string, unknown[]>, opts: { failSettings?: boolean } = {}) {
  let settingsReads = 0;
  const admin = {
    get settingsReads() { return settingsReads; },
    from: (t: string) => ({
      select: () => {
        if (t === 'app_settings') {
          settingsReads++;
          return Promise.resolve(opts.failSettings ? { data: null, error: { message: 'down' } } : { data: tables.app_settings ?? [], error: null });
        }
        return { eq: (_c: string, name: string) => ({ maybeSingle: () => Promise.resolve({ data: (tables.app_secrets as { name: string }[] ?? []).find((r) => r.name === name) ?? null }) }) };
      },
    }),
  };
  return admin;
}

Deno.test('settings: saved beats environment beats default, and reads are cached', async () => {
  clearConfigCache();
  Deno.env.set('MIN_LEAD_HOURS', '5');
  const admin = fakeAdmin({ app_settings: [{ key: 'photo_retention_days', value: '45' }] });
  const s = await loadSettings(admin as never);
  assertEquals(s.num('photo_retention_days'), 45);
  assertEquals(s.num('min_lead_hours'), 5);
  assertEquals(s.source('min_lead_hours'), 'environment');
  assertEquals(s.num('max_advance_days'), 366);
  assertEquals(s.bool('online_bookings_enabled'), true);
  await loadSettings(admin as never);
  assertEquals(admin.settingsReads, 1);
  await loadSettings(admin as never, { fresh: true });
  assertEquals(admin.settingsReads, 2);
  Deno.env.delete('MIN_LEAD_HOURS');
});

Deno.test('settings: a database hiccup falls back to defaults instead of failing', async () => {
  clearConfigCache();
  const s = await loadSettings(fakeAdmin({}, { failSettings: true }) as never);
  assertEquals(s.num('min_lead_hours'), 2);
});

Deno.test('keys: the saved key is decrypted; without one the environment variable is used', async () => {
  clearConfigCache();
  Deno.env.set('SETTINGS_ENCRYPTION_KEY', key);
  Deno.env.set('RESEND_API_KEY', 're_from_environment_0000');
  const stored = await encryptSecret('re_saved_in_settings_1234', key);
  assertEquals(await getSecret(fakeAdmin({ app_secrets: [{ name: 'RESEND_API_KEY', ciphertext: stored }] }) as never, 'RESEND_API_KEY'), 're_saved_in_settings_1234');
  clearConfigCache();
  assertEquals(await getSecret(fakeAdmin({ app_secrets: [] }) as never, 'RESEND_API_KEY'), 're_from_environment_0000');
  clearConfigCache();
  Deno.env.delete('RESEND_API_KEY');
  assertEquals(await getSecret(fakeAdmin({ app_secrets: [] }) as never, 'RESEND_API_KEY'), undefined);
  Deno.env.delete('SETTINGS_ENCRYPTION_KEY');
});

Deno.test('keys: an unreadable saved key falls back to the environment rather than crashing', async () => {
  clearConfigCache();
  Deno.env.set('SETTINGS_ENCRYPTION_KEY', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))); // a different key
  Deno.env.set('RESEND_API_KEY', 're_from_environment_0000');
  const stored = await encryptSecret('re_saved_in_settings_1234', key);
  assertEquals(await getSecret(fakeAdmin({ app_secrets: [{ name: 'RESEND_API_KEY', ciphertext: stored }] }) as never, 'RESEND_API_KEY'), 're_from_environment_0000');
  Deno.env.delete('RESEND_API_KEY');
  Deno.env.delete('SETTINGS_ENCRYPTION_KEY');
  clearConfigCache();
});
