import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { encryptionKeyProblem } from './crypto.ts';
import { HttpError } from './http.ts';
import { verifySession } from './porterSession.ts';

export const SESSION_ENDED = 'Your session has ended. Please sign in again.';

/** The signing key for porter sessions, or a clear error if the backend is not set up for them. */
export function sessionKey(): string {
  const key = Deno.env.get('SETTINGS_ENCRYPTION_KEY');
  const problem = encryptionKeyProblem(key);
  if (problem) {
    console.error(`porter sessions: ${problem}`);
    throw new HttpError(503, 'Porter sign-in is not set up yet. Please contact the Airport Assist office.');
  }
  return key as string;
}

export interface PorterLogin { porter_id: string; phone: string; password_hash: string; must_change_password: boolean; token_version: number }

/**
 * The porter behind a session token, checked against the database every time: the login must still exist and be switched on, the
 * porter must still be active, and the session must be from the current token version (a password reset or switching the login off
 * ends every older session straight away).
 */
export async function requirePorter(admin: SupabaseClient, token: unknown): Promise<{ login: PorterLogin; porter: { id: string; full_name: string } }> {
  const session = await verifySession(token, sessionKey());
  if (!session) throw new HttpError(401, SESSION_ENDED);
  const { data: login } = await admin.from('porter_logins').select('porter_id,phone,password_hash,must_change_password,token_version,disabled').eq('porter_id', session.p).maybeSingle();
  if (!login || login.disabled || login.token_version !== session.tv) throw new HttpError(401, SESSION_ENDED);
  const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', session.p).maybeSingle();
  if (!porter || !porter.active) throw new HttpError(401, SESSION_ENDED);
  return { login, porter };
}
