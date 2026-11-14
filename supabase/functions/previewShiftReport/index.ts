import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// What the system has recorded for the caller's own shift, before they submit. Nothing is stored.
serve('previewShiftReport', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const period = String(body.period_start || '');
  const shift = String(body.shift_type || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new HttpError(400, 'Choose the shift date.');
  if (shift !== 'morning' && shift !== 'night') throw new HttpError(400, 'Choose morning or night shift.');

  const { data, error } = await admin.rpc('build_shift_report', { p_supervisor_id: user.id, p_period: period, p_shift: shift });
  if (error) throw error;
  return json({ report: data });
});
