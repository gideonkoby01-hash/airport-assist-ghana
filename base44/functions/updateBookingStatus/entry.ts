import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getStaffRecipients } from '../../shared/notifyHelpers.ts';
import { bookingOwnerId, canOperateBooking } from '../../shared/bookingAccess.ts';

// Called by staff (via the booking actions panel) to change a booking's
// service status. The new status is persisted FIRST (user-scoped -> respects
// Booking read/update RLS, unchanged). For the service-relevant transitions
// (In Progress, Completed, Cancelled, No-show) it then creates one in-app
// notification for every Management and Admin user, plus one for the booking's
// passenger creator (only about their own booking; walk-in bookings created by
// staff do not have a passenger recipient). No notification is sent when the
// status did not actually change. Duplicate alerts for the same booking +
// previous -> new transition + recipient are skipped. Failures are logged and
// reported truthfully: if every creation attempt fails the call returns an error.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['supervisor', 'management', 'admin'].includes(user.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { booking_id, new_status } = body;
    if (!booking_id) return Response.json({ error: 'booking_id is required' }, { status: 400 });
    const allowed = ['confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (!allowed.includes(new_status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

    // Load the booking (user-scoped -> respects Booking read RLS).
    const booking = await base44.entities.Booking.get(booking_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    // Authorization lives here now that browsers cannot update bookings directly:
    // management and admin always, a supervisor only for a booking assigned to them.
    if (!canOperateBooking(user, booking)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const previous_status = booking.status;
    // No change -> no update, no notification.
    if (new_status === previous_status) {
      return Response.json({ ok: true, changed: false, previous_status, new_status, notified: 0 });
    }

    // Persist the new status first.
    let updated;
    try {
      updated = await base44.asServiceRole.entities.Booking.update(booking_id, { status: new_status });
    } catch (e) {
      return Response.json({ error: (e && e.message) || 'Failed to update booking' }, { status: 400 });
    }

    // Only service-relevant transitions trigger notifications.
    if (!['in_progress', 'completed', 'cancelled', 'no_show'].includes(new_status)) {
      return Response.json({
        ok: true,
        changed: true,
        previous_status,
        new_status,
        notified: 0,
        notifications: 'skipped_not_notifiable_transition',
      });
    }

    // Resolve the acting staff member's display name.
    let supervisorName = user.full_name || '';
    if (!supervisorName) {
      try {
        const sdRes = await base44.asServiceRole.entities.SupervisorDirectory.filter({ user_id: user.id });
        const sds = Array.isArray(sdRes) ? sdRes : (sdRes.items || []);
        if (sds[0] && sds[0].full_name) supervisorName = sds[0].full_name;
      } catch {}
    }
    if (!supervisorName) supervisorName = user.email || 'Supervisor';

    const labels = {
      confirmed: 'Confirmed',
      assigned: 'Assigned',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No-show',
    };
    const serviceType = booking.package_name || booking.package_code || '—';
    const passengerName =
      (booking.passengers && booking.passengers[0] && booking.passengers[0].name) || booking.contact || '—';
    const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
    const flight = ((booking.airline || '') + ' ' + (booking.flight_number || '')).trim();
    const updatedStr = new Date().toLocaleString();
    const staffMessage = [
      `Booking ${booking.reference || '—'} status updated from ${labels[previous_status] || previous_status} to ${labels[new_status] || new_status} by Supervisor ${supervisorName}.`,
      `Passenger: ${passengerName}`,
      `Service: ${serviceType}`,
      `Updated: ${updatedStr}`,
    ].join('\n');
    const passengerMessage = [
      `Your booking ${booking.reference || '—'} has been marked as ${labels[new_status] || new_status}.`,
      `Service: ${serviceType}`,
      `Flight: ${flight || '—'}`,
      `Date/Time: ${flightInfo || '—'}`,
    ].join('\n');

    // Recipients: every Management and Admin user, plus the booking's passenger
    // creator (when the booking was created by a passenger account, so each
    // passenger only ever receives their own booking's information).
    const staff = await getStaffRecipients(base44);
    let passenger = null;
    const ownerId = bookingOwnerId(booking);
    if (ownerId) {
      const creator = await base44.asServiceRole.entities.User.get(ownerId)
        .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (creator && ['passenger', 'user'].includes(creator.role || '')) passenger = creator;
    }

    const seen = new Set();
    const recipients = [];
    for (const u of staff) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        recipients.push({ id: u.id, kind: 'staff' });
      }
    }
    if (passenger && !seen.has(passenger.id)) {
      seen.add(passenger.id);
      recipients.push({ id: passenger.id, kind: 'passenger' });
    }

    // Prevent duplicates for the same booking + previous -> new transition.
    const existing = await base44.asServiceRole.entities.Notification.filter({
      booking_id: booking_id,
      type: 'status_change',
      previous_status: previous_status,
      new_status: new_status,
    });
    const existingUserIds = new Set(
      (Array.isArray(existing) ? existing : existing.items || []).map((n) => n.user_id)
    );

    const created = [];
    const failed = [];
    let duplicates = 0;
    for (const r of recipients) {
      if (existingUserIds.has(r.id)) {
        duplicates++;
        continue;
      }
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_id: r.id,
          booking_id: booking_id,
          booking_reference: booking.reference || '',
          title: r.kind === 'passenger' ? 'Booking Status Update' : 'Booking Status Updated',
          message: r.kind === 'passenger' ? passengerMessage : staffMessage,
          read: false,
          type: 'status_change',
          previous_status,
          new_status,
          supervisor_name: supervisorName,
          supervisor_id: user.id,
          service_type: serviceType,
        });
        created.push(r.id);
      } catch (e) {
        console.error(`updateBookingStatus: notification failed for user ${r.id}: ${e.message}`);
        failed.push({ user_id: r.id, error: e.message });
      }
    }

    // Truthful result: never report success when all creations failed.
    if (created.length === 0 && failed.length > 0 && duplicates === 0) {
      return Response.json({
        error: 'Booking status updated but all notification creations failed',
        failed,
        previous_status,
        new_status,
      }, { status: 500 });
    }
    return Response.json({
      ok: true,
      changed: true,
      previous_status,
      new_status,
      recipients: recipients.length,
      notified: created.length,
      duplicates_skipped: duplicates,
      failed,
      booking: updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}