import { adminClient } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { purgePrivateFiles } from '../_shared/retention.ts';

// Constant-time comparison so the secret cannot be guessed from response timing.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

// Runs once a day from the database scheduler (see MIGRATION.md). Not callable with a user login:
// it is protected by the CRON_SECRET shared with the scheduler, and deployed without JWT verification
// (supabase/config.toml) because the scheduler has no user session.
// Body: { "dry_run": true } lists what would be deleted without deleting anything.
serve('purgeIdPhotos', async (req) => {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) throw new Error('CRON_SECRET is not configured');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!(await sameSecret(given, expected))) throw new HttpError(401, 'Unauthorized');

  const body = await readBody(req);
  const retentionDays = Number(Deno.env.get('PHOTO_RETENTION_DAYS') ?? 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('PHOTO_RETENTION_DAYS must be a whole number of days');

  const result = await purgePrivateFiles(adminClient(), { dryRun: body.dry_run === true, retentionDays });
  console.log('purgeIdPhotos:', JSON.stringify(result));
  return json(result, result.error ? 500 : 200);
});
