import { adminClient, requireCaller } from '../_shared/auth.ts';
import { retryDelivery } from '../_shared/email.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Admin-only: send a failed email again now (the scheduler also retries automatically, up to three attempts).
serve('retryEmail', async (req) => {
  const admin = adminClient();
  await requireCaller(req, admin, ['admin']);
  const { delivery_id: id } = await readBody(req) as Record<string, string>;
  if (!id) throw new HttpError(400, 'delivery_id is required');
  const result = await retryDelivery(admin, id);
  if (!result) throw new HttpError(409, 'That email cannot be retried. It may already have been sent, or its recipient details were cleared.');
  return json({ ok: result.sent, result });
});
