import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { generateTempPassword } from '../_shared/tempPassword.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['supervisor', 'management', 'accounts'];

// Admin creates a Supervisor, Management or Accounts account directly, with no email involved. The temporary password
// is returned once for the admin to hand over; the new person must replace it at first sign-in.
// The role is decided here by the admin, never by the new person. Admin accounts cannot be created this way.
serve('createStaffAccount', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.full_name ?? '').trim().slice(0, 120);
  const role = String(body.role ?? '');
  if (!EMAIL_REGEX.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!fullName) throw new HttpError(400, 'Enter the person\'s full name.');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose Supervisor, Management or Accounts.');

  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) {
    throw new HttpError(409, 'That email already has an account. Change their role in the list below, or use "Resend access email".');
  }

  // Stored first: the signup trigger gives the new profile this role the moment the account exists.
  const { error: assignError } = await admin.from('staff_role_assignments').upsert({ email, role }, { onConflict: 'email' });
  if (assignError) throw assignError;

  const password = generateTempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email: the admin vouches for the address
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    await admin.from('staff_role_assignments').delete().eq('email', email);
    throw new HttpError(400, createError?.message || 'The account could not be created.');
  }

  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true, full_name: fullName, updated_by_id: caller.id })
    .eq('id', created.user.id);
  if (flagError) {
    // Do not leave an account that never has to change its temporary password.
    await admin.auth.admin.deleteUser(created.user.id);
    throw flagError;
  }

  return json({ ok: true, email, full_name: fullName, role, temporary_password: password });
});
