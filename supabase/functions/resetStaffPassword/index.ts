import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { generateTempPassword } from '../_shared/tempPassword.ts';

// Admin gives a staff member a new temporary password, with no email involved: for someone who forgot theirs or
// cannot receive email. It is shown once for the admin to hand over, and the person must replace it at next sign-in.
// Only Supervisor and Management accounts can be reset this way; an admin resets their own password from their profile.
serve('resetStaffPassword', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const userId = String(body.user_id || '').trim();
  if (!userId) throw new HttpError(400, 'user_id is required');
  if (userId === caller.id) throw new HttpError(400, 'Change your own password from My profile.');

  const { data: target } = await admin.from('profiles').select('id,email,full_name,role,disabled').eq('id', userId).maybeSingle();
  if (!target) throw new HttpError(404, 'That account was not found.');
  if (!['supervisor', 'management', 'accounts'].includes(target.role)) throw new HttpError(400, 'Only staff passwords (Supervisor, Management, Accounts) can be reset here.');
  if (target.disabled) throw new HttpError(409, 'That account is switched off. Enable it first.');

  const password = generateTempPassword();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { password });
  if (authError) throw new HttpError(400, authError.message || 'The password could not be reset.');
  const { error: flagError } = await admin.from('profiles').update({ must_change_password: true, updated_by_id: caller.id }).eq('id', userId);
  if (flagError) throw flagError;

  return json({ ok: true, email: target.email, full_name: target.full_name, temporary_password: password });
});
