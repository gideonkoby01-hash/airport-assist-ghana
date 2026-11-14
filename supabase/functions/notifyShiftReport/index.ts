import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { notifyShiftReportSubmitted } from '../_shared/notify.ts';

// Re-sends the "shift report submitted" alert (safe to repeat: nobody is alerted twice).
// submitShiftReport already does this on submission; this is for staff to retry.
serve('notifyShiftReport', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const { shift_report_id: reportId } = await readBody(req) as Record<string, string>;
  if (!reportId) throw new HttpError(400, 'shift_report_id is required');

  const { data: report } = await admin.from('shift_reports').select('*').eq('id', reportId).maybeSingle();
  if (!report) throw new HttpError(404, 'Shift report not found');
  const isStaff = user.role === 'admin' || user.role === 'management';
  if (!isStaff && report.supervisor_id !== user.id && report.created_by_id !== user.id) throw new HttpError(403, 'Forbidden');

  const result = await notifyShiftReportSubmitted(admin, report);
  if (!result.ok) throw new HttpError(500, result.error ?? 'All notification creations failed');
  return json(result);
});
