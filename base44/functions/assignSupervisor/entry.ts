import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'management' && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { booking_id, supervisor_user_id } = body;
    if (!booking_id || !supervisor_user_id) {
      return Response.json({ error: 'booking_id and supervisor_user_id are required' }, { status: 400 });
    }

    // Verify the supervisor is active in the directory.
    const dirPage = await base44.asServiceRole.entities.SupervisorDirectory.filter({
      user_id: supervisor_user_id,
      active: true,
    });
    const dirEntry = (dirPage.items || [])[0];
    if (!dirEntry) {
      return Response.json({ error: 'Supervisor not found or not active in the directory' }, { status: 400 });
    }

    // Load the booking.
    let booking;
    try {
      booking = await base44.asServiceRole.entities.Booking.get(booking_id);
    } catch (e) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isReassignment = !!booking.assigned_supervisor_id && booking.assigned_supervisor_id !== supervisor_user_id;

    // Update the booking assignment.
    const updated = await base44.asServiceRole.entities.Booking.update(booking_id, {
      assigned_supervisor_id: supervisor_user_id,
      assigned_supervisor_name: dirEntry.full_name || dirEntry.email,
      status: booking.status === 'confirmed' ? 'assigned' : booking.status,
    });

    // Create in-app notification for the supervisor.
    const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
    const message = [
      `Booking ${booking.reference} has been ${isReassignment ? 'reassigned' : 'assigned'} to you.`,
      `Service: ${booking.package_name || booking.package_code}`,
      `Flight: ${(booking.airline || '') + ' ' + (booking.flight_number || '')}`.trim(),
      `Date/Time: ${flightInfo || '—'}`,
    ].join('\n');

    await base44.asServiceRole.entities.Notification.create({
      user_id: supervisor_user_id,
      booking_id: booking_id,
      booking_reference: booking.reference,
      title: isReassignment ? 'Booking Reassigned' : 'New Booking Assignment',
      message,
      read: false,
      type: isReassignment ? 'reassignment' : 'assignment',
    });

    return Response.json({ ok: true, booking: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}