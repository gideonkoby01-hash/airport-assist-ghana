import { adminClient } from '../_shared/auth.ts';
import { requireCronSecret } from '../_shared/cron.ts';
import { retryDelivery } from '../_shared/email.ts';
import { json, serve } from '../_shared/http.ts';

const MAX_ATTEMPTS = 3;
const WAIT_MINUTES = 10;

// Every 15 minutes: send again any email that failed at least 10 minutes ago, up to 3 attempts in all.
// After that it stays "failed" and shows in Admin > Email for a person to deal with.
serve('retryFailedEmails', async (req) => {
  await requireCronSecret(req);
  const admin = adminClient();
  const before = new Date(Date.now() - WAIT_MINUTES * 60_000).toISOString();
  const { data: rows, error } = await admin.from('email_deliveries').select('id')
    .eq('status', 'failed').not('to_email', 'is', null).lt('attempts', MAX_ATTEMPTS).lt('last_attempt_at', before).limit(50);
  if (error) throw error;

  const tally: Record<string, number> = {};
  for (const row of rows ?? []) {
    const result = await retryDelivery(admin, row.id);
    const key = result?.status ?? 'skipped';
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log('retryFailedEmails:', JSON.stringify(tally));
  return json({ ok: true, considered: rows?.length ?? 0, results: tally });
});
