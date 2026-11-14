import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { clearConfigCache, loadSettings } from './config.ts';
import { encryptionKeyProblem, encryptSecret, last4 } from './crypto.ts';
import { GROUPS, SECRETS, SECRET_BY_NAME, SETTINGS, SETTING_BY_KEY, validateSecret, validateSetting, validateTogether } from './settingsRegistry.ts';

// The logic behind the admin Settings page, kept apart from the HTTP handler so it can be tested.

// Keys that live somewhere other than this page, and why. Shown on the page so nobody hunts for them.
export const OTHER_KEYS = [
  { name: 'Supabase service key', where: 'Added to the functions automatically by Supabase.', note: 'Never enter this anywhere. It can read and change all data.' },
  { name: 'Google sign-in (client ID and secret)', where: 'Supabase dashboard > Authentication > Providers > Google.', note: 'The sign-in service itself needs it, so it cannot be kept here.' },
  { name: 'Sign-up and password-reset emails (SMTP)', where: 'Supabase dashboard > Authentication > Emails > SMTP settings.', note: 'Use the same Resend key as the password. These emails are sent by the sign-in service, not by the functions.' },
  { name: 'Website connection (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)', where: 'Cloudflare Pages > Settings > Environment variables.', note: 'Public by design. A change needs a new website deploy.' },
  { name: 'Scheduler secret (CRON_SECRET)', where: '`supabase secrets set CRON_SECRET=...` and the Supabase Vault entry named cron_secret.', note: 'Both must match; change them together.' },
  { name: 'Settings encryption key (SETTINGS_ENCRYPTION_KEY)', where: '`supabase secrets set SETTINGS_ENCRYPTION_KEY=...`', note: 'Encrypts the keys saved on this page. Changing it makes saved keys unreadable until they are entered again.' },
  { name: 'Website address (APP_URL) and allowed sites (ALLOWED_ORIGINS)', where: '`supabase secrets set APP_URL=...`', note: 'Controls which website may call the functions. A wrong value would lock everyone out of this page too, so it is not editable here.' },
];

export interface Overview {
  groups: typeof GROUPS;
  settings: Array<(typeof SETTINGS)[number] & { value: string; source: string }>;
  secrets: Array<{ name: string; label: string; help: string; where: string; prefix: string; group: string; configured: boolean; source: 'saved' | 'environment' | 'none'; last4: string; updated_date: string | null }>;
  system: { encryption_ready: boolean; encryption_problem: string | null; app_url: string; allowed_origins: string; staff_mfa_required: boolean; cron_secret_set: boolean };
  other_keys: typeof OTHER_KEYS;
}

export async function buildOverview(admin: SupabaseClient, env: (n: string) => string | undefined): Promise<Overview> {
  const settings = await loadSettings(admin, { fresh: true, env });
  const { data: rows } = await admin.from('app_secrets').select('name,last4,updated_date');
  const saved = new Map((rows ?? []).map((r: { name: string; last4: string; updated_date: string }) => [r.name, r]));
  const { data: mfa } = await admin.rpc('staff_mfa_required');
  const problem = encryptionKeyProblem(env('SETTINGS_ENCRYPTION_KEY'));

  return {
    groups: GROUPS,
    settings: SETTINGS.map((def) => ({ ...def, value: settings.str(def.key), source: settings.source(def.key) })),
    secrets: SECRETS.map((def) => {
      const s = saved.get(def.name);
      const fromEnv = env(def.name);
      return {
        ...def,
        configured: Boolean(s || fromEnv),
        source: s ? 'saved' : fromEnv ? 'environment' : 'none',
        last4: s ? s.last4 : fromEnv ? last4(fromEnv) : '',
        updated_date: s ? s.updated_date : null,
      };
    }),
    system: {
      encryption_ready: problem === null,
      encryption_problem: problem,
      app_url: env('APP_URL') ?? '',
      allowed_origins: env('ALLOWED_ORIGINS') ?? '',
      staff_mfa_required: mfa !== false,
      cron_secret_set: Boolean(env('CRON_SECRET')),
    },
    other_keys: OTHER_KEYS,
  };
}

export type Outcome = { ok: true } | { ok: false; error: string };

// Saves one or more settings together (all or none). Anything not in the registry is refused.
export async function saveSettings(admin: SupabaseClient, actorId: string, changes: Record<string, unknown>): Promise<Outcome & { saved?: string[] }> {
  const entries = Object.entries(changes);
  if (entries.length === 0) return { ok: false, error: 'Nothing to save.' };

  const clean: Record<string, string> = {};
  for (const [key, raw] of entries) {
    const def = SETTING_BY_KEY.get(key);
    if (!def) return { ok: false, error: `Unknown setting: ${key}` };
    const checked = validateSetting(def, raw);
    if (!checked.ok) return checked;
    clean[key] = checked.value;
  }

  // Rules between settings are checked against what they will be after the save.
  const current = await loadSettings(admin, { fresh: true });
  const after: Record<string, string> = {};
  for (const def of SETTINGS) after[def.key] = clean[def.key] ?? current.str(def.key);
  const together = validateTogether(after);
  if (together) return { ok: false, error: together };

  const rows = Object.entries(clean).map(([key, value]) => ({
    key, value, is_public: SETTING_BY_KEY.get(key)!.public === true, updated_by_id: actorId, updated_date: new Date().toISOString(),
  }));
  const { error } = await admin.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
  clearConfigCache();
  return { ok: true, saved: Object.keys(clean) };
}

// Goes back to the environment value or the built-in default.
export async function resetSetting(admin: SupabaseClient, key: string): Promise<Outcome> {
  if (!SETTING_BY_KEY.has(key)) return { ok: false, error: `Unknown setting: ${key}` };
  const { error } = await admin.from('app_settings').delete().eq('key', key);
  if (error) throw error;
  clearConfigCache();
  return { ok: true };
}

async function logSecretEvent(admin: SupabaseClient, actorId: string, actorRole: string, action: string, name: string, hint: string) {
  const { error } = await admin.from('audit_log').insert({ actor_id: actorId, actor_role: actorRole, action, table_name: 'app_secrets', record_id: name, after: { last4: hint } });
  if (error) console.error('adminSettings: could not log the key change:', error.message);
}

// Encrypts and saves an API key. The audit entry names the key and its last four characters, never the key.
export async function saveSecret(admin: SupabaseClient, actor: { id: string; role: string }, name: string, raw: unknown, keyB64: string | undefined): Promise<Outcome> {
  const def = SECRET_BY_NAME.get(name);
  if (!def) return { ok: false, error: `Unknown key: ${name}` };
  const problem = encryptionKeyProblem(keyB64);
  if (problem) return { ok: false, error: `${problem} Set it once with: supabase secrets set SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32), then try again.` };
  const checked = validateSecret(def, raw);
  if (!checked.ok) return checked;

  const { error } = await admin.from('app_secrets').upsert(
    { name, ciphertext: await encryptSecret(checked.value, keyB64!), last4: last4(checked.value), updated_by_id: actor.id, updated_date: new Date().toISOString() },
    { onConflict: 'name' },
  );
  if (error) throw error;
  await logSecretEvent(admin, actor.id, actor.role, 'SECRET_SET', name, last4(checked.value));
  clearConfigCache();
  return { ok: true };
}

export async function clearSecret(admin: SupabaseClient, actor: { id: string; role: string }, name: string): Promise<Outcome> {
  if (!SECRET_BY_NAME.has(name)) return { ok: false, error: `Unknown key: ${name}` };
  const { error } = await admin.from('app_secrets').delete().eq('name', name);
  if (error) throw error;
  await logSecretEvent(admin, actor.id, actor.role, 'SECRET_CLEARED', name, '');
  clearConfigCache();
  return { ok: true };
}
