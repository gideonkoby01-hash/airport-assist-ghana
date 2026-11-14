import { adminClient, requireCaller } from '../_shared/auth.ts';
import { json, serve } from '../_shared/http.ts';

// Admin-only health check: broken links between records, and booking figures that disagree with the payments
// ledger. Every count should be zero.
serve('integrityCheck', async (req) => {
  const admin = adminClient();
  await requireCaller(req, admin, ['admin']);
  const { data, error } = await admin.rpc('data_integrity_check');
  if (error) throw error;
  const checks = (data ?? []) as { check_name: string; problem_count: number }[];
  return json({ ok: checks.every((c) => Number(c.problem_count) === 0), checks });
});
