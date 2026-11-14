import { adminClient, recipientsByRole, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { accraTime, alertedUserIds } from '../_shared/notify.ts';

// Called right after a supervisor submits a shift report. Alerts every management and admin user once.
// Admin/management may run it for any report; a supervisor only for a report they own.
serve('notifyShiftReport', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const { shift_report_id: reportId } = await readBody(req) as Record<string, string>;
  if (!reportId) throw new HttpError(400, 'shift_report_id is required');

  const { data: report } = await admin.from('shift_reports').select('*').eq('id', reportId).maybeSingle();
  if (!report) throw new HttpError(404, 'Shift report not found');
  const isStaff = user.role === 'admin' || user.role === 'management';
  if (!isStaff && report.supervisor_id !== user.id && report.created_by_id !== user.id) throw new HttpError(403, 'Forbidden');

  const users = await recipientsByRole(admin, ['management', 'admin']);
  if (!users.length) throw new HttpError(500, 'No Management or Admin recipients exist to notify');
  const already = await alertedUserIds(admin, { shift_report_id: reportId, type: 'shift_report' });

  const supervisorName = report.supervisor_name || 'Supervisor';
  const message = [
    `Supervisor ${supervisorName} submitted a shift report.`,
    `Reporting period: ${report.reporting_period_start || '—'}`,
    `Shift: ${report.shift_type === 'night' ? 'Night Shift' : 'Morning Shift'}`,
    `Total collected: GHS ${report.grand_total_paid != null ? report.grand_total_paid : '—'}`,
    `Submitted: ${accraTime(report.created_date)}`,
  ].join('\n');

  let notified = 0;
  let duplicates = 0;
  const failed: { user_id: string; error: string }[] = [];
  for (const u of users) {
    if (already.has(u.id)) { duplicates++; continue; }
    const { error } = await admin.from('notifications').insert({
      user_id: u.id, title: 'Shift Report Submitted', message, read: false, type: 'shift_report', shift_report_id: reportId,
      supervisor_id: report.supervisor_id || '', supervisor_name: supervisorName,
      link_path: u.role === 'admin' ? '/admin?tab=reports' : '/management?tab=reports',
    });
    if (error) { console.error(`notifyShiftReport: alert failed for ${u.id}: ${error.message}`); failed.push({ user_id: u.id, error: error.message }); }
    else notified++;
  }

  if (notified === 0 && failed.length > 0) return json({ error: 'All notification creations failed', failed }, 500);
  return json({ ok: true, recipients: users.length, notified, duplicates_skipped: duplicates, failed });
});
