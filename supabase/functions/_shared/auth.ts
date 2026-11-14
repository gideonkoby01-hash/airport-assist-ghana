import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'passenger' | 'supervisor' | 'management' | 'admin' | 'pending';
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
  const { data: profile } = await admin.from('profiles').select('id,email,full_name,role').eq('id', data.user.id).maybeSingle();
  if (!profile) throw new HttpError(401, 'Unauthorized');
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
