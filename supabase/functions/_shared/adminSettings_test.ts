// Run: deno test --allow-env supabase/functions/_shared/adminSettings_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { buildOverview, clearSecret, resetSetting, saveSecret, saveSettings } from './adminSettings.ts';
import { clearConfigCache } from './config.ts';
import { decryptSecret } from './crypto.ts';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const actor = { id: 'admin-1', role: 'admin' };

// A small in-memory stand-in for the three tables the page touches.
function fakeAdmin() {
  const t: Record<string, Record<string, any>[]> = { app_settings: [], app_secrets: [], audit_log: [] };
  const pk = (table: string) => (table === 'app_secrets' ? 'name' : 'key');
  return {
    t,
    rpc: (name: string) => Promise.resolve({ data: name === 'staff_mfa_required' ? true : null }),
    from: (table: string) => ({
      select: (_cols?: string) => {
        const rows = t[table];
        const result: any = Promise.resolve({ data: rows, error: null });
        result.eq = (col: string, val: unknown) => ({ maybeSingle: () => Promise.resolve({ data: rows.find((r) => r[col] === val) ?? null }) });
        return result;
      },
      upsert: (input: Record<string, any> | Record<string, any>[]) => {
        for (const row of Array.isArray(input) ? input : [input]) {
          const i = t[table].findIndex((r) => r[pk(table)] === row[pk(table)]);
          if (i >= 0) t[table][i] = { ...t[table][i], ...row }; else t[table].push({ ...row });
        }
        return Promise.resolve({ error: null });
      },
      insert: (row: Record<string, any>) => { t[table].push({ ...row }); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: (col: string, val: unknown) => { t[table] = t[table].filter((r) => r[col] !== val); return Promise.resolve({ error: null }); } }),
    }),
  };
}

Deno.test('saving settings: stored as text, public ones flagged, the actor recorded', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  const r = await saveSettings(a as never, 'admin-1', { min_lead_hours: ' 4 ', contact_email: 'desk@example.com', online_bookings_enabled: 'false' });
  assertEquals(r.ok, true);
  const rows = Object.fromEntries(a.t.app_settings.map((x) => [x.key, x]));
  assertEquals(rows.min_lead_hours.value, '4');
  assertEquals(rows.min_lead_hours.is_public, false);
  assertEquals(rows.contact_email.is_public, true);
  assertEquals(rows.online_bookings_enabled.value, 'false');
  assertEquals(rows.min_lead_hours.updated_by_id, 'admin-1');
});

Deno.test('saving settings is all or nothing, and unknown settings are refused', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  const bad = await saveSettings(a as never, 'admin-1', { min_lead_hours: '4', max_advance_days: '5' });
  assertEquals(bad.ok, false);
  assertEquals(a.t.app_settings.length, 0);
  assertEquals((await saveSettings(a as never, 'admin-1', { not_a_setting: '1' })).ok, false);
  assertEquals((await saveSettings(a as never, 'admin-1', { SETTINGS_ENCRYPTION_KEY: 'x' })).ok, false);
  assertEquals((await saveSettings(a as never, 'admin-1', {})).ok, false);
});

Deno.test('settings that depend on each other are checked against the saved values too', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  assertEquals((await saveSettings(a as never, 'admin-1', { shift_morning_start: '07:00', shift_night_start: '19:00' })).ok, true);
  clearConfigCache();
  const r = await saveSettings(a as never, 'admin-1', { shift_morning_start: '20:00' }); // night is 19:00
  assertEquals(r.ok, false);
  assertEquals(a.t.app_settings.find((x) => x.key === 'shift_morning_start')?.value, '07:00');
});

Deno.test('reset removes the saved value', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  await saveSettings(a as never, 'admin-1', { min_lead_hours: '4' });
  assertEquals((await resetSetting(a as never, 'min_lead_hours')).ok, true);
  assertEquals(a.t.app_settings.length, 0);
  assertEquals((await resetSetting(a as never, 'nope')).ok, false);
});

Deno.test('a key is saved encrypted, audited without its value, and cleared on request', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  const secret = 're_live_abcdef123456';
  assertEquals((await saveSecret(a as never, actor, 'RESEND_API_KEY', secret, key)).ok, true);
  const row = a.t.app_secrets[0];
  assertEquals(row.name, 'RESEND_API_KEY');
  assertEquals(row.last4, '3456');
  assertEquals(JSON.stringify(a.t).includes(secret), false); // the key appears nowhere, in the table or the audit log
  assertEquals(await decryptSecret(row.ciphertext, key), secret);
  assertEquals(a.t.audit_log[0], { actor_id: 'admin-1', actor_role: 'admin', action: 'SECRET_SET', table_name: 'app_secrets', record_id: 'RESEND_API_KEY', after: { last4: '3456' } });
  assertEquals((await clearSecret(a as never, actor, 'RESEND_API_KEY')).ok, true);
  assertEquals(a.t.app_secrets.length, 0);
  assertEquals(a.t.audit_log[1].action, 'SECRET_CLEARED');
});

Deno.test('a key is refused when the encryption key is missing, or the value is wrong', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  const noKey = await saveSecret(a as never, actor, 'RESEND_API_KEY', 're_live_abcdef123456', undefined);
  assertEquals(!noKey.ok && noKey.error.includes('SETTINGS_ENCRYPTION_KEY'), true);
  assertEquals((await saveSecret(a as never, actor, 'RESEND_API_KEY', 'sk_wrong_prefix_000000', key)).ok, false);
  assertEquals((await saveSecret(a as never, actor, 'MADE_UP_KEY', 're_live_abcdef123456', key)).ok, false);
  assertEquals(a.t.app_secrets.length, 0);
  assertEquals(a.t.audit_log.length, 0);
});

Deno.test('the overview describes every setting and key, and never contains a key', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  await saveSecret(a as never, actor, 'RESEND_API_KEY', 're_live_abcdef123456', key);
  const env = (n: string) => ({ RESEND_WEBHOOK_SECRET: 'whsec_from_environment_9999', MIN_LEAD_HOURS: '6', SETTINGS_ENCRYPTION_KEY: key, APP_URL: 'https://site.example' } as Record<string, string>)[n];
  const o = await buildOverview(a as never, env);
  const resend = o.secrets.find((s) => s.name === 'RESEND_API_KEY')!;
  assertEquals([resend.configured, resend.source, resend.last4], [true, 'saved', '3456']);
  const hook = o.secrets.find((s) => s.name === 'RESEND_WEBHOOK_SECRET')!;
  assertEquals([hook.configured, hook.source, hook.last4], [true, 'environment', '9999']);
  const lead = o.settings.find((s) => s.key === 'min_lead_hours')!;
  assertEquals([lead.value, lead.source], ['6', 'environment']);
  assertEquals(o.system.encryption_ready, true);
  assertEquals(o.system.app_url, 'https://site.example');
  assertEquals(o.system.cron_secret_set, false);
  const text = JSON.stringify(o);
  for (const leaked of ['re_live_abcdef123456', 'whsec_from_environment_9999', 'ciphertext', key]) assertEquals(text.includes(leaked), false, leaked);
});

Deno.test('the public website switch: only the super admin may change it, and it is public and on by default', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  const refused = await saveSettings(a as never, 'admin-2', { public_site_enabled: 'false' }, { superAdmin: false });
  assertEquals(refused.ok, false);
  assertEquals((refused as { error: string }).error, 'Only the super admin can change the public website switch.');
  assertEquals(a.t.app_settings.length, 0, 'nothing was saved');
  // other settings are not affected by who asks, and one refused setting stops the whole save (all or none)
  assertEquals((await saveSettings(a as never, 'admin-2', { min_lead_hours: '3' }, { superAdmin: false })).ok, true);
  const mixed = await saveSettings(a as never, 'admin-2', { min_lead_hours: '5', public_site_enabled: 'false' }, { superAdmin: false });
  assertEquals(mixed.ok, false);
  assertEquals(a.t.app_settings.find((r) => r.key === 'min_lead_hours')?.value, '3');
  // the super admin (or anyone while none is set) can
  const ok = await saveSettings(a as never, 'owner', { public_site_enabled: 'false' }, { superAdmin: true });
  assertEquals(ok.ok, true);
  const row = a.t.app_settings.find((r) => r.key === 'public_site_enabled');
  assertEquals([row?.value, row?.is_public], ['false', true]);
  assertEquals((await saveSettings(a as never, 'owner', { public_site_enabled: 'maybe' })).ok, false, 'a switch is on or off');
});

Deno.test('going back to the default for the public website switch is also for the super admin only', async () => {
  clearConfigCache();
  const a = fakeAdmin();
  await saveSettings(a as never, 'owner', { public_site_enabled: 'false' });
  assertEquals((await resetSetting(a as never, 'public_site_enabled', { superAdmin: false })).ok, false);
  assertEquals(a.t.app_settings.length, 1);
  assertEquals((await resetSetting(a as never, 'public_site_enabled', { superAdmin: true })).ok, true);
  assertEquals(a.t.app_settings.length, 0);
});
