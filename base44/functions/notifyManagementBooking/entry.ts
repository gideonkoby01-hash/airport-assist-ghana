import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Called by the "New Booking Management Notify" workflow whenever a Booking is created.
// Creates one persistent in-app notification for every Management user, after the
// booking has been saved. Prevents duplicates for the same booking + event.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { booking_id } = body;
    if (!booking_id) return Response.json({ error: 'booking_id is required' }, { status: 400 });

    // Load the booking that was just created.
    let booking;
    try {
      booking = await base44.asServiceRole.entities.Booking.get(booking_id);
    } catch {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Fetch all authorized Management users.
    const mgmtRes = await base44.asServiceRole.entities.User.filter({ role: 'management' });
    const users = Array.isArray(mgmtRes) ? mgmtRes : (mgmtRes.items || []);
    if (users.length === 0) return Response.json({ ok: true, notified: 0, totalManagement: 0 });

    // Prevent duplicate notifications for the same booking + new-booking event.
    const existing = await base44.asServiceRole.entities.Notification.filter({
      booking_id: booking_id,
      type: 'info',
    });
    const existingUserIds = new Set(
      (Array.isArray(existing) ? existing : existing.items || []).map((n) => n.user_id)
    );

    // Build a readable summary of the booking.
    const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
    const source = booking.booking_channel === 'walk_in' ? 'Walk-in' : 'Online';
    const serviceType = booking.package_name || booking.package_code || '';
    const passengerName =
      (booking.passengers && booking.passengers[0] && booking.passengers[0].name) || booking.contact || '—';
    const flight = ((booking.airline || '') + ' ' + (booking.flight_number || '')).trim();
    const createdStr = booking.created_date ? new Date(booking.created_date).toLocaleString() : '—';
    const message = [
      `Reference: ${booking.reference || '—'}`,
      `Passenger: ${passengerName}`,
      `Service: ${serviceType || '—'}`,
      `Direction: ${booking.flight_type || '—'}`,
      `Flight: ${flight || '—'}`,
      `Date/Time: ${flightInfo || '—'}`,
      `Passengers: ${booking.num_passengers || 0}`,
      `Source: ${source}`,
      `Created: ${createdStr}`,
    ].join('\n');

    let notified = 0;
    for (const u of users) {
      if (existingUserIds.has(u.id)) continue;
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_id: u.id,
          booking_id: booking_id,
          booking_reference: booking.reference || '',
          title: 'New Booking Created',
          message,
          read: false,
          type: 'info',
        });
        notified++;
      } catch {}
    }

    return Response.json({ ok: true, notified, totalManagement: users.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}