import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appUrl, recipientsByRole, userCan } from './auth.ts';
import { bookingEmailAddress, bookingOwnerId } from './bookingAccess.ts';
import { sendTransactionalEmail } from './email.ts';

// Ghana time, the way staff read dates in alerts.
export const accraTime = (d: Date | string = new Date()) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' });

// Existing in-app alerts matching a filter, so the same event never alerts the same person twice.
export async function alertedUserIds(admin: SupabaseClient, match: Record<string, string>): Promise<Set<string>> {
  const { data } = await admin.from('notifications').select('user_id').match(match);
  return new Set((data ?? []).map((n: { user_id: string }) => n.user_id));
}

// Sends an email about a booking to the passenger: to the address they gave when booking, else the account that made it.
// `first_name` is filled in from the booking. Never throws; the result says what happened.
export async function emailBookingPassenger(
  admin: SupabaseClient, booking: Record<string, any>,
  opts: { eventKey: string; templateName: string; variables: Record<string, unknown> },
) {
  const ownerId = bookingOwnerId(booking);
  let owner: { email?: string; full_name?: string } | null = null;
  if (!String(booking.contact_email ?? '').trim() && ownerId) {
    const { data } = await admin.from('profiles').select('email,full_name').eq('id', ownerId).maybeSingle();
    owner = data;
  }
  const name = String(booking.passengers?.[0]?.name || owner?.full_name || booking.contact || '').trim();
  return await sendTransactionalEmail(admin, {
    eventKey: opts.eventKey, templateName: opts.templateName, to: bookingEmailAddress(booking, owner?.email),
    userId: ownerId, relatedEntityId: booking.id,
    variables: { first_name: name.split(/\s+/)[0] || 'there', reference: booking.reference || '', ...opts.variables },
  });
}

type Person = { id: string; email: string; role: string };

/** Of these people, the ones whose role may do the task (admin always can). Used to email only the people who can act on something. */
export async function whoCan(
  // deno-lint-ignore no-explicit-any
  admin: { rpc: (name: string, args: Record<string, unknown>) => any }, people: Person[], key: string,
): Promise<Person[]> {
  const out: Person[] = [];
  for (const p of people) if (p.email && (await userCan(admin, p, key))) out.push(p);
  return out;
}

/** The facts in the "new website booking" email to staff. */
export function newBookingEmailVariables(booking: Record<string, any>, baseUrl: string) {
  const flight = [booking.airline, booking.flight_number].filter(Boolean).join(' ');
  const count = Number(booking.num_passengers) || 0;
  return {
    reference: booking.reference || '',
    passenger_name: String(booking.passengers?.[0]?.name || booking.contact || 'A passenger').trim(),
    service: booking.package_name || booking.package_code || '—',
    flight_line: flight || 'To be confirmed',
    travel_line: [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' · ') || 'To be confirmed',
    passengers_line: `${count} passenger${count === 1 ? '' : 's'}${booking.total_bags ? ` · ${booking.total_bags} bag(s)` : ''}`,
    cta_url: `${baseUrl}/bookings/${booking.id}`,
  };
}

// A new website booking is emailed once to each person who can assign a supervisor (their role has that task; admin always does),
// as well as the in-app alert everyone in management gets. Desk sales are not emailed. Never throws.
export async function emailStaffAboutBooking(admin: SupabaseClient, booking: Record<string, any>, send: typeof sendTransactionalEmail = sendTransactionalEmail): Promise<number> {
  if (booking.booking_channel !== 'online') return 0;
  try {
    const { data } = await admin.from('profiles').select('id,email,role').in('role', ['management', 'admin']).eq('disabled', false);
    const people = await whoCan(admin, (data ?? []) as Person[], 'supervisors.assign');
    let sent = 0;
    for (const u of people) {
      const result = await send(admin, {
        eventKey: `new_booking_staff:${booking.id}:${u.id}`, templateName: 'ManagementNewBooking', to: u.email, userId: u.id,
        relatedEntityId: booking.id, variables: newBookingEmailVariables(booking, appUrl()),
      });
      if (result && (result as { ok?: boolean }).ok !== false) sent++;
    }
    return sent;
  } catch (error) {
    console.error('emailStaffAboutBooking failed:', error instanceof Error ? error.message : error);
    return 0;
  }
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

  // Management email: website bookings only, to the people who can assign a supervisor.
  const staff_emails = await emailStaffAboutBooking(admin, booking);

  // Confirmation email: online bookings only, to the address the passenger gave (or the account that made the booking).
  let passenger_email = null;
  if (booking.booking_channel === 'online') {
    const ghs = (n: unknown) => (typeof n === 'number' ? `GHS ${n.toFixed(2)}` : '—');
    passenger_email = await emailBookingPassenger(admin, booking, {
      eventKey: `booking_confirmation:${bookingId}`,
      templateName: 'BookingConfirmation',
      variables: {
        order_id: booking.reference || bookingId,
        item_name: booking.package_name || booking.package_code || '—',
        flight_line: [booking.airline, booking.flight_number].filter(Boolean).join(' ') || 'To be confirmed',
        travel_line: [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' · ') || 'To be confirmed',
        direction_line: booking.flight_type === 'arrival' ? 'Arrival' : booking.flight_type === 'departure' ? 'Departure' : '—',
        travelers_line: `${booking.num_passengers || 0} passenger(s)${booking.total_bags ? ` · ${booking.total_bags} bag(s)` : ''}`,
        total: ghs(Number(booking.total_value)),
      },
    });
  }
  return { ok: failed.length === 0 || notified > 0, recipients: users.length, notified, duplicates_skipped: duplicates, failed, passenger_email, staff_emails };
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
