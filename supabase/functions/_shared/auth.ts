import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'passenger' | 'supervisor' | 'management' | 'admin' | 'pending';
  disabled?: boolean;
}

// Roles that must have passed two-step verification in the current session.
const MFA_ROLES: Profile['role'][] = ['admin', 'management'];

// The assurance level ("aal1" password only, "aal2" second factor passed) from an already-verified access token.
export function tokenAal(token: string): string {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))?.aal ?? '');
  } catch {
    return '';
  }
}

// Bypasses row-level security. Use only after the caller has been authorised in code.
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The signed-in caller and their profile (role comes from the database, never from the token).
export async function requireCaller(req: Request, admin: SupabaseClient, roles?: Profile['role'][]): Promise<Profile> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Unauthorized');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Unauthorized');
  const { data: profile } = await admin.from('profiles').select('id,email,full_name,role,disabled').eq('id', data.user.id).maybeSingle();
  if (!profile) throw new HttpError(401, 'Unauthorized');
  if (profile.disabled) throw new HttpError(403, 'This account is disabled. Please contact the Airport Assist office.');
  if (MFA_ROLES.includes(profile.role) && tokenAal(token) !== 'aal2') {
    const { data: required } = await admin.rpc('staff_mfa_required');
    if (required !== false) throw new HttpError(403, 'Two-step verification is required. Set it up under Account security, then sign in again.');
  }
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, 'Forbidden');
  return profile as Profile;
}

export async function recipientsByRole(admin: SupabaseClient, roles: Profile['role'][]): Promise<Profile[]> {
  const { data, error } = await admin.from('profiles').select('id,email,full_name,role').in('role', roles);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
}

// Where emailed links should open. APP_URL when it is set; otherwise the website the admin is using right now
// (the Origin header of a signed-in admin's browser). Never fall back to localhost for a real browser request.
export function requestAppUrl(req: Request): string {
  const configured = Deno.env.get('APP_URL');
  if (configured) return configured.replace(/\/+$/, '');
  const origin = req.headers.get('origin') ?? '';
  return /^https:\/\/[^/\s]+$/.test(origin) ? origin : appUrl();
}
