import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, requestAppUrl, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { INVITABLE_ROLES, planInvite, type InvitableRole } from '../_shared/invitePlan.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin invites someone as Supervisor or Management, or sends a returning person a new link.
//  - New person: Supabase emails an invitation. The link opens /reset-password, where they choose their own password.
//  - Invited but not yet accepted: the invitation is sent again.
//  - Already activated: a password-reset email is sent (only when a resend is asked for).
// The role is decided here, by the admin, and never by the invited person. Admin cannot be granted through this form.
serve('inviteStaff', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '') as InvitableRole;
  const resend = body.resend === true;
  if (!EMAIL_REGEX.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!INVITABLE_ROLES.includes(role)) throw new HttpError(400, 'Choose Supervisor or Management.');

  const redirectTo = `${requestAppUrl(req)}/reset-password`;

  const { data: profile } = await admin.from('profiles').select('id,role').ilike('email', email).maybeSingle();
  let activated = false;
  if (profile) {
    const { data: authUser, error } = await admin.auth.admin.getUserById(profile.id);
    if (error) throw error;
    activated = Boolean(authUser.user?.email_confirmed_at || authUser.user?.last_sign_in_at);
  }

  const plan = planInvite({ profile, activated, role, resend });
  if (plan.action === 'refuse') throw new HttpError(409, plan.reason);

  const setRole = async () => {
    const { error } = await admin.from('profiles').update({ role, updated_by_id: caller.id }).eq('id', profile!.id);
    if (error) throw error;
  };

  if (plan.action === 'apply_role') {
    await setRole();
    return json({ ok: true, state: 'role_applied' });
  }

  if (plan.action === 'send_reset') {
    if (plan.setRole) await setRole();
    // The same call the "Forgot password" page makes, so the person gets the normal recovery email and link.
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, state: 'reset_sent' });
  }

  if (plan.action === 'invite_new') {
    // Stored first: the signup trigger gives the new profile this role the moment the invitation creates the account.
    const { error: assignError } = await admin.from('staff_role_assignments').upsert({ email, role }, { onConflict: 'email' });
    if (assignError) throw assignError;
  } else if (plan.setRole) {
    await setRole();
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) throw new HttpError(400, inviteError.message);
  return json({ ok: true, state: plan.action === 'invite_new' ? 'invited' : 'invite_resent' });
});
