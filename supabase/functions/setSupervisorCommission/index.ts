import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const MESSAGES: Record<string, [number, string]> = {
  booking_not_found: [404, 'Booking not found.'],
  not_meet_assist: [400, 'Porter Service Only is not a meet and assist, so it earns no supervisor commission.'],
  booking_closed: [409, 'This booking was cancelled, so it earns no commission.'],
  no_supervisor: [409, 'Assign a supervisor to this booking first.'],
  report_filed: [409, 'This commission is already in a submitted shift report and can no longer be changed.'],
  invalid_amount: [400, 'The commission amount is not valid.'],
};

// A supervisor marks (or unmarks) the commission on a meet and assist booking assigned to them. The amount comes from the
// setting, never from the browser. Management and admin can correct it too. It is taken off the takings in the shift report.
serve('setSupervisorCommission', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, unknown>;
  const bookingId = String(body.booking_id || '').trim();
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  const paid = body.paid !== false;

  const { data: booking } = await admin.from('bookings').select('id,assigned_supervisor_id').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  if (user.role === 'supervisor' && booking.assigned_supervisor_id !== user.id) {
    throw new HttpError(403, 'You can only mark commission on bookings assigned to you.');
  }

  const amount = (await loadSettings(admin)).num('supervisor_commission_per_signup');
  const { data, error } = await admin.rpc('set_supervisor_commission', { p_booking_id: bookingId, p_paid: paid, p_amount: amount, p_user_id: user.id });
  if (error) {
    const known = MESSAGES[error.message];
    if (known) throw new HttpError(known[0], known[1]);
    throw error;
  }
  return json({ ok: true, booking: data });
});
