import { adminClient, clientIp } from '../_shared/auth.ts';
import { loadSettings, PUBLIC_SITE_CLOSED } from '../_shared/config.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const BUCKET = 'private-files';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// A passenger without an account uploads their ID photo straight to private storage. This hands out one single-use upload
// link for a new file under guest/ (the website then sends the photo to it), limited per network address. The file is only
// reachable through the booking it is attached to, and unattached uploads are deleted automatically after a few days.
serve('createGuestPhotoUpload', async (req) => {
  const admin = adminClient();
  if (!(await loadSettings(admin)).bool('public_site_enabled')) throw new HttpError(503, PUBLIC_SITE_CLOSED);
  const body = await readBody(req) as Record<string, unknown>;
  const ext = TYPES[String(body.content_type ?? '').toLowerCase()];
  if (!ext) throw new HttpError(400, 'Photo must be a JPG, PNG, or WEBP image.');

  const hits = await admin.rpc('hit_rate_limit', { p_key: `guest_photo:${clientIp(req)}`, p_window_seconds: 3600 });
  if (hits.error) throw hits.error;
  if (Number(hits.data) > 20) throw new HttpError(429, 'Too many photo uploads. Please try again in a while.');

  const path = `guest/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, 'The photo could not be uploaded. Please try again, or book without a photo.');
  return json({ path, token: data.token });
});
