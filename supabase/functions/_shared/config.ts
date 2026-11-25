import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from './crypto.ts';
import { resolveSettings, SETTING_BY_KEY, type Source } from './settingsRegistry.ts';

// Settings and API keys as the functions see them: saved on the admin Settings page, else the function environment
// (how things were set before the page existed), else the registry default. Read through a short cache so a busy
// function does not hit the database on every request; a change on the page reaches every function within seconds.

const TTL_MS = 15_000;
let settingsCache: { at: number; rows: { key: string; value: string }[] } | null = null;
const secretCache = new Map<string, { at: number; value: string | undefined }>();

export const PUBLIC_SITE_CLOSED = 'The public website is closed. Please contact the Airport Assist desk.';

export function clearConfigCache() {
  settingsCache = null;
  secretCache.clear();
}

export class Settings {
  constructor(private resolved: Record<string, { value: string; source: Source }>) {}
  str(key: string): string {
    return this.resolved[key]?.value ?? SETTING_BY_KEY.get(key)?.default ?? '';
  }
  num(key: string): number {
    const n = Number(this.str(key));
    return Number.isFinite(n) ? n : Number(SETTING_BY_KEY.get(key)?.default);
  }
  bool(key: string): boolean {
    return this.str(key) === 'true';
  }
  source(key: string): Source {
    return this.resolved[key]?.source ?? 'default';
  }
  all() {
    return this.resolved;
  }
}

export async function loadSettings(admin: SupabaseClient, opts: { fresh?: boolean; env?: (name: string) => string | undefined } = {}): Promise<Settings> {
  if (opts.fresh || !settingsCache || Date.now() - settingsCache.at > TTL_MS) {
    const { data, error } = await admin.from('app_settings').select('key,value');
    if (error) {
      // A hiccup reading settings must not take bookings down: use what we last had, else defaults and the environment.
      console.error('config: could not read settings:', error.message);
      settingsCache = settingsCache ?? { at: 0, rows: [] };
    } else {
      settingsCache = { at: Date.now(), rows: (data ?? []) as { key: string; value: string }[] };
    }
  }
  return new Settings(resolveSettings(settingsCache.rows, opts.env ?? ((name) => Deno.env.get(name))));
}

// An API key: the one saved on the Settings page, else the environment variable of the same name.
export async function getSecret(admin: SupabaseClient, name: string, opts: { fresh?: boolean } = {}): Promise<string | undefined> {
  const hit = secretCache.get(name);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | undefined;
  const { data } = await admin.from('app_secrets').select('ciphertext').eq('name', name).maybeSingle();
  const key = Deno.env.get('SETTINGS_ENCRYPTION_KEY');
  if (data?.ciphertext && key) {
    try {
      value = await decryptSecret(data.ciphertext, key);
    } catch (e) {
      console.error(`config: could not decrypt ${name} (wrong SETTINGS_ENCRYPTION_KEY, or the stored value was altered): ${e instanceof Error ? e.message : e}`);
    }
  } else if (data?.ciphertext && !key) {
    console.error(`config: ${name} is saved but SETTINGS_ENCRYPTION_KEY is not set, so it cannot be read`);
  }
  value = value ?? (Deno.env.get(name) || undefined);
  secretCache.set(name, { at: Date.now(), value });
  return value;
}
