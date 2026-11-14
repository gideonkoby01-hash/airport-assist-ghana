import { adminClient, appUrl, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const ROLES = ['passenger', 'supervisor', 'management', 'admin'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin invites someone to a staff role. If they already have an account the role applies now;
// otherwise it is stored and applied by the signup trigger when they first register or accept the invite.
serve('inviteStaff', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  if (!EMAIL_REGEX.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose a valid role.');

  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) {
    const { error } = await admin.from('profiles').update({ role, updated_by_id: caller.id }).eq('id', existing.id);
    if (error) throw error;
    return json({ ok: true, applied: true });
  }

  // Store the role first: the profile is created (and the role applied) the moment the invite is accepted.
  const { error: assignError } = await admin.from('staff_role_assignments').upsert({ email, role }, { onConflict: 'email' });
  if (assignError) throw assignError;

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl()}/reset-password` });
  if (inviteError) throw new HttpError(400, inviteError.message);

  return json({ ok: true, applied: false });
});
