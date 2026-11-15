import { adminClient } from '../_shared/auth.ts';
import { json, readBody, serve } from '../_shared/http.ts';
import { loadSettings } from '../_shared/config.ts';
import { requireCronSecret } from '../_shared/cron.ts';
import { purgePrivateFiles } from '../_shared/retention.ts';

// Runs once a day from the database scheduler (see MIGRATION.md). Not callable with a user login:
// it is protected by the CRON_SECRET shared with the scheduler, and deployed without JWT verification
// (supabase/config.toml) because the scheduler has no user session.
// Body: { "dry_run": true } lists what would be deleted without deleting anything.
serve('purgeIdPhotos', async (req) => {
  await requireCronSecret(req);

  const body = await readBody(req);
  const admin = adminClient();
  const settings = await loadSettings(admin);
  const retentionDays = settings.num('photo_retention_days');
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('The photo retention period must be a whole number of days (Admin > Settings).');

  const result = await purgePrivateFiles(admin, { dryRun: body.dry_run === true, retentionDays, orphanDays: settings.num('orphan_upload_days') });
  console.log('purgeIdPhotos:', JSON.stringify(result));
  return json(result, result.error ? 500 : 200);
});
