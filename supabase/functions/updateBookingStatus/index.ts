import { adminClient, recipientsByRole, requireCaller } from '../_shared/auth.ts';
import { bookingOwnerId, canOperateBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { accraTime } from '../_shared/notify.ts';

const ALLOWED = ['confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show'];
const NOTIFIABLE = ['in_progress', 'completed', 'cancelled', 'no_show'];
const LABELS: Record<string, string> = {
  confirmed: 'Confirmed', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};

// Staff change a booking's service status. Management/admin may change any booking; a supervisor only
// one assigned to them. The status is saved first; service-relevant changes then alert every
// management/admin user and the booking's own passenger (once per transition and recipient).
serve('updateBookingStatus', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const { booking_id: bookingId, new_status: newStatus } = await readBody(req) as Record<string, string>;
  if (!bookingId) throw new HttpError(400, 'booking_id is required');
  if (!ALLOWED.includes(newStatus)) throw new HttpError(400, 'Invalid status');

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  // Same answer for "missing" and "not yours": never reveal which bookings exist.
  if (!booking || !canOperateBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  const previous = booking.status;
  if (newStatus === previous) return json({ ok: true, changed: false, previous_status: previous, new_status: newStatus, notified: 0 });

  const { data: updated, error: updateError } = await admin.from('bookings').update({ status: newStatus, updated_by_id: user.id }).eq('id', bookingId).select().single();
  if (updateError) {
    // The database enforces the lifecycle rules; turn its refusals into plain advice.
    if (updateError.message.startsWith('invalid_status_transition')) {
      throw new HttpError(409, `A ${LABELS[previous] ?? previous} booking cannot be changed to ${LABELS[newStatus]}. Ask an admin if it was marked wrongly.`);
    }
    if (updateError.message.startsWith('balance_outstanding')) {
      throw new HttpError(409, 'This booking still has an unpaid balance. Record the payment first, or ask management to write the balance off.');
    }
    throw updateError;
  }

  if (!NOTIFIABLE.includes(newStatus)) {
    return json({ ok: true, changed: true, previous_status: previous, new_status: newStatus, notified: 0, notifications: 'skipped_not_notifiable_transition', booking: updated });
  }

  let supervisorName = user.full_name || '';
  if (!supervisorName) {
    const { data: sd } = await admin.from('supervisor_directory').select('full_name').eq('user_id', user.id).limit(1).maybeSingle();
    supervisorName = sd?.full_name || '';
  }
  if (!supervisorName) supervisorName = user.email || 'Supervisor';

  const serviceType = booking.package_name || booking.package_code || '—';
  const passengerName = booking.passengers?.[0]?.name || booking.contact || '—';
  const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
  const flight = `${booking.airline || ''} ${booking.flight_number || ''}`.trim();
  const staffMessage = [
    `Booking ${booking.reference || '—'} status updated from ${LABELS[previous] || previous} to ${LABELS[newStatus]} by Supervisor ${supervisorName}.`,
    `Passenger: ${passengerName}`, `Service: ${serviceType}`, `Updated: ${accraTime()}`,
  ].join('\n');
  const passengerMessage = [
    `Your booking ${booking.reference || '—'} has been marked as ${LABELS[newStatus]}.`,
    `Service: ${serviceType}`, `Flight: ${flight || '—'}`, `Date/Time: ${flightInfo || '—'}`,
  ].join('\n');

  // Recipients: every management/admin user, plus the booking's own passenger (never anyone else's).
  const staff = await recipientsByRole(admin, ['management', 'admin']);
  const recipients: { id: string; kind: 'staff' | 'passenger' }[] = staff.map((u) => ({ id: u.id, kind: 'staff' }));
  const ownerId = bookingOwnerId(booking);
  if (ownerId && !recipients.some((r) => r.id === ownerId)) {
    const { data: owner } = await admin.from('profiles').select('id,role').eq('id', ownerId).maybeSingle();
    if (owner && owner.role === 'passenger') recipients.push({ id: owner.id, kind: 'passenger' });
  }

  const { data: existing } = await admin.from('notifications').select('user_id')
    .match({ booking_id: bookingId, type: 'status_change', previous_status: previous, new_status: newStatus });
  const alreadyAlerted = new Set((existing ?? []).map((n: { user_id: string }) => n.user_id));

  const created: string[] = [];
  const failed: { user_id: string; error: string }[] = [];
  let duplicates = 0;
  for (const r of recipients) {
    if (alreadyAlerted.has(r.id)) { duplicates++; continue; }
    const { error } = await admin.from('notifications').insert({
      user_id: r.id, booking_id: bookingId, booking_reference: booking.reference || '',
      title: r.kind === 'passenger' ? 'Booking Status Update' : 'Booking Status Updated',
      message: r.kind === 'passenger' ? passengerMessage : staffMessage, read: false, type: 'status_change',
      previous_status: previous, new_status: newStatus, supervisor_name: supervisorName, supervisor_id: user.id, service_type: serviceType,
    });
    if (error) { console.error(`updateBookingStatus: alert failed for ${r.id}: ${error.message}`); failed.push({ user_id: r.id, error: error.message }); }
    else created.push(r.id);
  }

  // Truthful result: the status did change, but say so if no alert could be created.
  if (created.length === 0 && failed.length > 0 && duplicates === 0) {
    return json({ error: 'Booking status updated but all notification creations failed', failed, previous_status: previous, new_status: newStatus }, 500);
  }
  return json({
    ok: true, changed: true, previous_status: previous, new_status: newStatus,
    recipients: recipients.length, notified: created.length, duplicates_skipped: duplicates, failed, booking: updated,
  });
});
