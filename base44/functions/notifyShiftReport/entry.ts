import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getStaffRecipients } from '../../shared/notifyHelpers.ts';

// Called by the Shift Report form right after a supervisor successfully submits
// a report. Authorization is enforced server-side: Admin or Management may
// always run it; a supervisor may run it for a report they own (they are the
// report's supervisor or its creator). Notifies every Management and Admin
// user (Admin still receives the alert when no Management users exist) with
// the supervisor's name, reporting period, shift, and submission time, plus a
// deep link to the Shift Reports screen. Duplicate alerts for the same report
// + recipient are skipped. Failures are logged and reported truthfully: if
// every creation attempt fails the call returns an error.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { shift_report_id } = body;
    if (!shift_report_id) return Response.json({ error: 'shift_report_id is required' }, { status: 400 });

    // Load and validate the shift report the event refers to.
    const report = await base44.asServiceRole.entities.ShiftReport.get(shift_report_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!report) return Response.json({ error: 'Shift report not found' }, { status: 404 });

    const isStaff = user.role === 'admin' || user.role === 'management';
    const isOwner = report.supervisor_id === user.id || report.created_by_id === user.id;
    if (!isStaff && !isOwner) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Recipients: all Management and Admin users. If none exist the alert
    // cannot be delivered -> report it instead of failing silently.
    const users = await getStaffRecipients(base44);
    if (!users.length) {
      console.error('notifyShiftReport: no Management or Admin recipients exist');
      return Response.json({ error: 'No Management or Admin recipients exist to notify' }, { status: 500 });
    }

    // Prevent duplicate notifications for the same report submission.
    const existing = await base44.asServiceRole.entities.Notification.filter({
      shift_report_id: shift_report_id,
      type: 'shift_report',
    });
    const existingUserIds = new Set(
      (Array.isArray(existing) ? existing : existing.items || []).map((n) => n.user_id)
    );

    const supervisorName = report.supervisor_name || 'Supervisor';
    const shiftLabel = report.shift_type === 'night' ? 'Night Shift' : 'Morning Shift';
    const submittedStr = report.created_date
      ? new Date(report.created_date).toLocaleString()
      : new Date().toLocaleString();
    const message = [
      `Supervisor ${supervisorName} submitted a shift report.`,
      `Reporting period: ${report.reporting_period_start || '—'}`,
      `Shift: ${shiftLabel}`,
      `Total collected: GHS ${report.grand_total_paid != null ? report.grand_total_paid : '—'}`,
      `Submitted: ${submittedStr}`,
    ].join('\n');

    const created = [];
    const failed = [];
    let duplicates = 0;
    for (const u of users) {
      if (existingUserIds.has(u.id)) {
        duplicates++;
        continue;
      }
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_id: u.id,
          title: 'Shift Report Submitted',
          message,
          read: false,
          type: 'shift_report',
          shift_report_id: shift_report_id,
          supervisor_id: report.supervisor_id || '',
          supervisor_name: supervisorName,
          link_path: u.role === 'admin' ? '/admin?tab=reports' : '/management?tab=reports',
        });
        created.push(u.id);
      } catch (e) {
        console.error(`notifyShiftReport: notification failed for user ${u.id}: ${e.message}`);
        failed.push({ user_id: u.id, error: e.message });
      }
    }

    // Truthful result: never report success when all creations failed.
    if (created.length === 0 && failed.length > 0) {
      return Response.json({ error: 'All notification creations failed', failed }, { status: 500 });
    }
    return Response.json({
      ok: true,
      recipients: users.length,
      notified: created.length,
      duplicates_skipped: duplicates,
      failed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}