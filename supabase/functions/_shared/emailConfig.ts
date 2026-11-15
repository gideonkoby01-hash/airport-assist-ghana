import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getSecret, loadSettings } from './config.ts';
import type { SmtpConfig } from './smtp.ts';

// How emails are sent right now, from the Settings page (or the older server settings).
export type EmailConfig =
  | { provider: 'resend'; from: string; apiKey: string }
  | { provider: 'smtp'; from: string; smtp: SmtpConfig };

// The saved SMTP server details, whether or not SMTP is the active way of sending (so the connection can be tested first).
export async function loadSmtpConfig(admin: SupabaseClient): Promise<{ smtp: SmtpConfig | null; problem: string | null }> {
  const settings = await loadSettings(admin);
  const host = settings.str('smtp_host');
  if (!host) return { smtp: null, problem: 'Enter the SMTP server and save before testing.' };
  const username = settings.str('smtp_username');
  const password = (await getSecret(admin, 'SMTP_PASSWORD')) ?? '';
  if (username && !password) return { smtp: null, problem: 'The SMTP username is set but the SMTP password has not been saved yet.' };
  return { smtp: { host, port: settings.num('smtp_port'), security: settings.str('smtp_security') as SmtpConfig['security'], username, password }, problem: null };
}

export async function loadEmailConfig(admin: SupabaseClient): Promise<{ config: EmailConfig | null; problem: string | null }> {
  const settings = await loadSettings(admin);
  const from = settings.str('email_from');
  if (settings.str('email_provider') === 'smtp') {
    const { smtp, problem } = await loadSmtpConfig(admin);
    if (!smtp || !from) return { config: null, problem: `Email is not set up: ${problem ?? 'enter the sender address'} (Admin > Settings).`.replace('before testing', '') };
    return { config: { provider: 'smtp', from, smtp }, problem: null };
  }
  const apiKey = await getSecret(admin, 'RESEND_API_KEY');
  if (!apiKey || !from) return { config: null, problem: 'Email is not set up: add the Resend API key and the sender address in Admin > Settings.' };
  return { config: { provider: 'resend', from, apiKey }, problem: null };
}
