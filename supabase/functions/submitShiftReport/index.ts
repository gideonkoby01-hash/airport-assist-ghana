import { adminClient, requireCaller } from '../_shared/auth.ts';
import { round2 } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { notifyShiftReportSubmitted } from '../_shared/notify.ts';

const MESSAGES: Record<string, [number, string]> = {
  cash_count_required: [400, 'Enter the cash you counted (0 if none).'],
  future_period: [400, 'That shift has not happened yet.'],
  duplicate_report: [409, 'A report for this shift already exists. Ask an admin if it needs to be redone.'],
  porter_missing: [409, 'A service sold in this shift has no porter on it. Assign a porter to each one, then submit the report.'],
  invalid_shift: [400, 'Choose morning or night shift.'],
};

// Files the caller's shift report. The totals come from the payments ledger, not from the browser; the person
// adds only the cash they counted and a remark. A filed report cannot be edited.
serve('submitShiftReport', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const period = String(body.period_start || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new HttpError(400, 'Choose the shift date.');
  const counted = body.cash_counted === '' || body.cash_counted == null ? null : round2(body.cash_counted);

  const { data: report, error } = await admin.rpc('create_shift_report', {
    p_supervisor_id: user.id, p_supervisor_name: user.full_name || user.email || '', p_period: period,
    p_shift: String(body.shift_type || ''), p_cash_counted: counted, p_remarks: String(body.remarks || ''),
  });
  if (error) {
    const known = MESSAGES[error.message];
    if (known) throw new HttpError(known[0], known[1]);
    throw error;
  }

  // Alert management. A failure here never undoes the filed report.
  let notify_warning: string | null = null;
  try {
    const result = await notifyShiftReportSubmitted(admin, report);
    if (!result.ok) notify_warning = 'Your report was submitted, but the staff alert could not be sent. Please inform management.';
  } catch (e) {
    console.error('submitShiftReport: alert failed:', e instanceof Error ? e.message : e);
    notify_warning = 'Your report was submitted, but the staff alert could not be sent. Please inform management.';
  }
  return json({ report, notify_warning });
});
