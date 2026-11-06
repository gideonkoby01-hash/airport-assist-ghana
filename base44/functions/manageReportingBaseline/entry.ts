import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Establishes a new Booking Value & Discounts reporting baseline.
// Additive only: it never touches bookings, payments, discounts or shift reports.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only administrators can change the reporting baseline.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'set';

    if (action === 'get') {
      const rows = await base44.asServiceRole.entities.ReportingBaseline.list('-created_date', 1);
      return Response.json({ baseline: rows?.[0] || null });
    }

    if (action !== 'set') {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    const record = await base44.asServiceRole.entities.ReportingBaseline.create({
      baseline_at: new Date().toISOString(),
      set_by_id: user.id,
      set_by_name: user.full_name || user.email,
      set_by_email: user.email,
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : '',
    });

    return Response.json({ baseline: record });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}