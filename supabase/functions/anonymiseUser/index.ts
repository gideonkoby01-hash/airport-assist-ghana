import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Admin-only: honour a request to delete a person's data. Personal details on their bookings, ratings and
// requests are blanked, their files and notifications are deleted and their login is removed. Money records stay
// (they are accounting records) but no longer identify the person.
serve('anonymiseUser', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const userId = String(body.user_id || '').trim();
  if (!userId) throw new HttpError(400, 'user_id is required');
  if (userId === caller.id) throw new HttpError(400, 'You cannot delete your own account here.');
  if (body.confirm !== true) throw new HttpError(400, 'Confirmation is required: this cannot be undone.');

  const { data: files, error } = await admin.rpc('anonymise_user_data', { p_user_id: userId });
  if (error) throw error;
  const paths = ((files ?? []) as { path: string }[]).map((f) => f.path);
  if (paths.length) {
    const { error: removeError } = await admin.storage.from('private-files').remove(paths);
    if (removeError) throw removeError;
  }

  // Deleting the login removes the profile with it. The last-admin rule still protects against deleting the final admin.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError && !/not found/i.test(deleteError.message)) throw new HttpError(409, 'Personal data was cleared, but the login could not be removed. Try again.');
  return json({ ok: true, files_removed: paths.length });
});
