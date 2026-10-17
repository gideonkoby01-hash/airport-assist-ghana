import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Called by a supervisor (via the booking actions panel) to change a booking's
// service status. The new status is persisted FIRST; only when the status
// actually changed does it create one in-app notification for every authorized
// Management user, carrying the previous/new status, service type and the
// supervisor's name. Duplicate alerts for the same booking + previous -> new
// transition are skipped. Existing new-booking and assignment notifications are
// untouched (this function only handles status changes).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['supervisor', 'management', 'admin'].includes(user.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { booking_id, new_status } = body;
    if (!booking_id) return Response.json({ error: 'booking_id is required' }, { status: 400 });
    const allowed = ['confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (!allowed.includes(new_status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

    // Load the booking (user-scoped -> respects Booking read RLS).
    let booking;
    try {
      booking = await base44.entities.Booking.get(booking_id);
    } catch {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const previous_status = booking.status;
    // No change -> no notification.
    if (new_status === previous_status) {
      return Response.json({ ok: true, changed: false, previous_status, new_status });
    }

    // Persist the new status first (user-scoped -> respects Booking update RLS).
    let updated;
    try {
      updated = await base44.entities.Booking.update(booking_id, { status: new_status });
    } catch (e) {
      return Response.json({ error: (e && e.message) || 'Failed to update booking' }, { status: 400 });
    }

    // Resolve the supervisor's display name.
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
    const updatedStr = new Date().toLocaleString();
    const message = [
      `Booking ${booking.reference || '—'} status updated from ${labels[previous_status] || previous_status} to ${labels[new_status] || new_status} by Supervisor ${supervisorName}.`,
      `Passenger: ${passengerName}`,
      `Service: ${serviceType}`,
      `Updated: ${updatedStr}`,
    ].join('\n');

    // Fetch all authorized Management users.
    const mgmtRes = await base44.asServiceRole.entities.User.filter({ role: 'management' });
    const users = Array.isArray(mgmtRes) ? mgmtRes : (mgmtRes.items || []);
    let notified = 0;
    if (users.length > 0) {
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

      for (const u of users) {
        if (existingUserIds.has(u.id)) continue;
        try {
          await base44.asServiceRole.entities.Notification.create({
            user_id: u.id,
            booking_id: booking_id,
            booking_reference: booking.reference || '',
            title: 'Booking Status Updated',
            message,
            read: false,
            type: 'status_change',
            previous_status,
            new_status,
            supervisor_name: supervisorName,
            supervisor_id: user.id,
            service_type: serviceType,
          });
          notified++;
        } catch {}
      }
    }

    return Response.json({ ok: true, changed: true, previous_status, new_status, notified, booking: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}