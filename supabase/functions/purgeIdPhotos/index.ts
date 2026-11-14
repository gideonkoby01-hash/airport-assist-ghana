import { adminClient } from '../_shared/auth.ts';
import { json, readBody, serve } from '../_shared/http.ts';
import { requireCronSecret } from '../_shared/cron.ts';
import { purgePrivateFiles } from '../_shared/retention.ts';

// Runs once a day from the database scheduler (see MIGRATION.md). Not callable with a user login:
// it is protected by the CRON_SECRET shared with the scheduler, and deployed without JWT verification
// (supabase/config.toml) because the scheduler has no user session.
// Body: { "dry_run": true } lists what would be deleted without deleting anything.
serve('purgeIdPhotos', async (req) => {
  await requireCronSecret(req);

  const body = await readBody(req);
  const retentionDays = Number(Deno.env.get('PHOTO_RETENTION_DAYS') ?? 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('PHOTO_RETENTION_DAYS must be a whole number of days');

  const result = await purgePrivateFiles(adminClient(), { dryRun: body.dry_run === true, retentionDays });
  console.log('purgeIdPhotos:', JSON.stringify(result));
  return json(result, result.error ? 500 : 200);
});
