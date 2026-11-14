import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appUrl, recipientsByRole } from './auth.ts';
import { bookingOwnerId } from './bookingAccess.ts';
import { sendTransactionalEmail } from './email.ts';

// Ghana time, the way staff read dates in alerts.
export const accraTime = (d: Date | string = new Date()) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' });

// Existing in-app alerts matching a filter, so the same event never alerts the same person twice.
export async function alertedUserIds(admin: SupabaseClient, match: Record<string, string>): Promise<Set<string>> {
  const { data } = await admin.from('notifications').select('user_id').match(match);
  return new Set((data ?? []).map((n: { user_id: string }) => n.user_id));
}

// One alert per management/admin user for a newly created booking, plus the passenger's confirmation email.
// Never throws: a notification problem must not undo or fail the booking that triggered it.
export async function notifyNewBooking(admin: SupabaseClient, bookingId: string) {
  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) return { ok: false, error: 'Booking not found' };

  const users = await recipientsByRole(admin, ['management', 'admin']);
  if (!users.length) console.error('notifyNewBooking: no Management or Admin recipients exist');
  const already = await alertedUserIds(admin, { booking_id: bookingId, type: 'info' });

  const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
  const passengerName = booking.passengers?.[0]?.name || booking.contact || '—';
  const flight = `${booking.airline || ''} ${booking.flight_number || ''}`.trim();
  const message = [
    `Reference: ${booking.reference || '—'}`,
    `Passenger: ${passengerName}`,
    `Service: ${booking.package_name || booking.package_code || '—'}`,
    `Direction: ${booking.flight_type || '—'}`,
    `Flight: ${flight || '—'}`,
    `Date/Time: ${flightInfo || '—'}`,
    `Passengers: ${booking.num_passengers || 0}`,
    `Source: ${booking.booking_channel === 'walk_in' ? 'Walk-in' : 'Online'}`,
    `Created: ${booking.created_date ? accraTime(booking.created_date) : '—'}`,
  ].join('\n');

  let notified = 0;
  let duplicates = 0;
  const failed: { user_id: string; error: string }[] = [];
  for (const u of users) {
    if (already.has(u.id)) { duplicates++; continue; }
    const { error } = await admin.from('notifications').insert({
      user_id: u.id, booking_id: bookingId, booking_reference: booking.reference || '',
      title: 'New Booking Created', message, read: false, type: 'info',
    });
    if (error) { console.error(`notifyNewBooking: alert failed for ${u.id}: ${error.message}`); failed.push({ user_id: u.id, error: error.message }); }
    else notified++;
  }

  // Confirmation email: online bookings only, to the registered account that made the booking.
  let passenger_email = null;
  const ownerId = bookingOwnerId(booking);
  if (booking.booking_channel === 'online' && ownerId) {
    const { data: owner } = await admin.from('profiles').select('id,email,full_name').eq('id', ownerId).maybeSingle();
    const contactName = booking.passengers?.[0]?.name || booking.contact || owner?.full_name || '';
    const ghs = (n: unknown) => (typeof n === 'number' ? `GHS ${n.toFixed(2)}` : '—');
    passenger_email = await sendTransactionalEmail(admin, {
      eventKey: `booking_confirmation:${bookingId}`,
      templateName: 'BookingConfirmation',
      to: owner?.email,
      userId: ownerId,
      relatedEntityId: bookingId,
      variables: {
        first_name: contactName.trim().split(/\s+/)[0] || 'there',
        order_id: booking.reference || bookingId,
        item_name: booking.package_name || booking.package_code || '—',
        flight_line: [booking.airline, booking.flight_number].filter(Boolean).join(' ') || 'To be confirmed',
        travel_line: [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' · ') || 'To be confirmed',
        direction_line: booking.flight_type === 'arrival' ? 'Arrival' : booking.flight_type === 'departure' ? 'Departure' : '—',
        travelers_line: `${booking.num_passengers || 0} passenger(s)${booking.total_bags ? ` · ${booking.total_bags} bag(s)` : ''}`,
        total: ghs(Number(booking.total_value)),
        cta_url: `${appUrl()}/passenger?tab=bookings`,
      },
    });
  }
  return { ok: failed.length === 0 || notified > 0, recipients: users.length, notified, duplicates_skipped: duplicates, failed, passenger_email };
}

// Alerts every management and admin user that a shift report was submitted (once each).
export async function notifyShiftReportSubmitted(admin: SupabaseClient, report: Record<string, any>) {
  const users = await recipientsByRole(admin, ['management', 'admin']);
  if (!users.length) return { ok: false, error: 'No Management or Admin recipients exist to notify', notified: 0, duplicates_skipped: 0, failed: [] };
  const already = await alertedUserIds(admin, { shift_report_id: report.id, type: 'shift_report' });

  const supervisorName = report.supervisor_name || 'Supervisor';
  const variance = report.cash_variance == null ? '' : `\nCash variance: GHS ${Number(report.cash_variance).toFixed(2)}`;
  const message = [
    `Supervisor ${supervisorName} submitted a shift report.`,
    `Reporting period: ${report.reporting_period_start || '—'}`,
    `Shift: ${report.shift_type === 'night' ? 'Night Shift' : 'Morning Shift'}`,
    `Total collected: GHS ${report.grand_total_paid != null ? report.grand_total_paid : '—'}${variance}`,
    `Submitted: ${accraTime(report.created_date)}`,
  ].join('\n');

  let notified = 0;
  let duplicates = 0;
  const failed: { user_id: string; error: string }[] = [];
  for (const u of users) {
    if (already.has(u.id)) { duplicates++; continue; }
    const { error } = await admin.from('notifications').insert({
      user_id: u.id, title: 'Shift Report Submitted', message, read: false, type: 'shift_report', shift_report_id: report.id,
      supervisor_id: report.supervisor_id || '', supervisor_name: supervisorName,
      link_path: u.role === 'admin' ? '/admin?tab=reports' : '/management?tab=reports',
    });
    if (error) { console.error(`notifyShiftReportSubmitted: alert failed for ${u.id}: ${error.message}`); failed.push({ user_id: u.id, error: error.message }); }
    else notified++;
  }
  return { ok: notified > 0 || failed.length === 0, notified, duplicates_skipped: duplicates, failed };
}
