import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Admin-only: turn a person's access off (someone who left) or back on. A disabled account sees no data at
// once, and the sign-in service refuses new logins and token refreshes. History is kept.
serve('disableUser', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const userId = String(body.user_id || '').trim();
  const disable = body.disabled !== false;
  if (!userId) throw new HttpError(400, 'user_id is required');
  if (userId === caller.id) throw new HttpError(400, 'You cannot disable your own account.');
  // The super admin account cannot be disabled by anyone. (The column exists once the super admin update has been applied.)
  const { data: target } = await admin.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle();
  if (target?.is_super_admin) throw new HttpError(403, 'That is the super admin account. It cannot be disabled.');

  const { error } = await admin.from('profiles').update({ disabled: disable, updated_by_id: caller.id }).eq('id', userId);
  if (error) {
    if (error.message.includes('super_admin_protected')) throw new HttpError(403, 'That is the super admin account. It cannot be disabled.');
    if (error.message.includes('last_admin')) throw new HttpError(409, 'That is the only active admin. Make someone else an admin first.');
    throw error;
  }
  // 100 years is how the sign-in service expresses "banned"; "none" lifts it.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: disable ? '876000h' : 'none' });
  if (banError) throw banError;
  return json({ ok: true, disabled: disable });
});
