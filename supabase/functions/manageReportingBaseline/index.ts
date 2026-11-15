import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Sets (or reads) the Booking Value & Discounts reporting baseline. Additive only: it never touches
// bookings, payments, discounts or shift reports.
serve('manageReportingBaseline', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const action = body.action || 'set';

  if (action === 'get') {
    const { data } = await admin.from('reporting_baselines').select('*').order('created_date', { ascending: false }).limit(1).maybeSingle();
    return json({ baseline: data ?? null });
  }
  if (action !== 'set') throw new HttpError(400, 'Unknown action');

  const { data: baseline, error } = await admin.from('reporting_baselines').insert({
    baseline_at: new Date().toISOString(), set_by_id: user.id, set_by_name: user.full_name || user.email, set_by_email: user.email,
    note: typeof body.note === 'string' ? body.note.slice(0, 300) : '',
  }).select().single();
  if (error) throw error;
  return json({ baseline });
});
