import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getStaffRecipients } from '../../shared/notifyHelpers.ts';
import { sendTransactionalEmail, logSkippedEmail } from '../../shared/emailDelivery.ts';
import { bookingOwnerId } from '../../shared/bookingAccess.ts';

// Called by the "New Booking Management Notify" workflow whenever a Booking is
// created, and manually by Admin/Management. Authorization is enforced
// server-side: Admin or Management may always run it; the booking's creator may
// run it for their own booking (this is how the workflow invokes it, with the
// creator's auth); a request with no app-user token is accepted only for a
// booking created within the last 10 minutes (a fresh platform-triggered
// creation event). Notifies every Management and Admin user (Admin still
// receives the alert when no Management users exist). Duplicate alerts for the
// same booking + recipient are skipped. Failures are logged and reported
// truthfully: if every creation attempt fails the call returns an error.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));

    const body = await req.json().catch(() => ({}));
    const { booking_id } = body;
    if (!booking_id) return Response.json({ error: 'booking_id is required' }, { status: 400 });

    // Load and validate the booking the event refers to.
    const booking = await base44.asServiceRole.entities.Booking.get(booking_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    // Server-side authorization.
    let authMode = null;
    if (user && (user.role === 'admin' || user.role === 'management')) {
      authMode = 'staff';
    } else if (user && bookingOwnerId(booking) && bookingOwnerId(booking) === user.id) {
      authMode = 'creator';
    } else if (!user) {
      const ageMs = booking.created_date ? Date.now() - new Date(booking.created_date).getTime() : -1;
      if (ageMs >= 0 && ageMs <= 10 * 60 * 1000) authMode = 'fresh_event';
    }
    if (!authMode) return Response.json({ error: 'Forbidden' }, { status: user ? 403 : 401 });

    // Recipients: all Management and Admin users. If none exist the alert
    // cannot be delivered -> report it instead of failing silently.
    const users = await getStaffRecipients(base44);
    if (!users.length) {
      console.error('notifyManagementBooking: no Management or Admin recipients exist');
      return Response.json({ error: 'No Management or Admin recipients exist to notify' }, { status: 500 });
    }

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

    const created = [];
    const failed = [];
    let duplicates = 0;
    for (const u of users) {
      if (existingUserIds.has(u.id)) {
        duplicates++;
        continue;
      }
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
        created.push(u.id);
      } catch (e) {
        console.error(`notifyManagementBooking: notification failed for user ${u.id}: ${e.message}`);
        failed.push({ user_id: u.id, error: e.message });
      }
    }

    // Passenger booking confirmation email (online bookings only, addressed
    // to the registered account that made the booking). Best effort: a mail
    // failure is logged and reported but never fails this notification flow.
    let passenger_email = null;
    if (booking.booking_channel === 'online' && bookingOwnerId(booking)) {
      try {
        const creator = await base44.asServiceRole.entities.User.get(bookingOwnerId(booking))
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        const contactName =
          (booking.passengers && booking.passengers[0] && booking.passengers[0].name) ||
          booking.contact || (creator && creator.full_name) || '';
        const firstName = contactName.trim().split(/\s+/)[0] || 'there';
        const ghs = (n) => (typeof n === 'number' ? 'GHS ' + n.toFixed(2) : '—');
        const dir =
          booking.flight_type === 'arrival' ? 'Arrival'
          : booking.flight_type === 'departure' ? 'Departure' : '—';
        if (creator && creator.email) {
          passenger_email = await sendTransactionalEmail(base44, {
            eventKey: 'booking_confirmation:' + booking_id,
            templateName: 'BookingConfirmation',
            to: creator.email,
            userId: creator.id,
            relatedEntityId: booking_id,
            variables: {
              first_name: firstName,
              order_id: booking.reference || booking_id,
              item_name: booking.package_name || booking.package_code || '—',
              flight_line: [booking.airline, booking.flight_number].filter(Boolean).join(' ') || 'To be confirmed',
              travel_line: [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' · ') || 'To be confirmed',
              direction_line: dir,
              travelers_line:
                (booking.num_passengers || 0) + ' passenger(s)' +
                (booking.total_bags ? ' · ' + booking.total_bags + ' bag(s)' : ''),
              total: ghs(booking.total_value),
              cta_url: 'https://airportassistghana.base44.app/passenger?tab=bookings',
            },
          });
        } else {
          console.warn('notifyManagementBooking: no valid recipient for booking confirmation ' + booking_id);
          await logSkippedEmail(
            base44,
            'booking_confirmation:' + booking_id,
            'BookingConfirmation',
            bookingOwnerId(booking),
            booking_id,
            'No registered account or email for the booking creator'
          );
          passenger_email = { status: 'skipped', reason: 'no_valid_recipient', sent: false };
        }
      } catch (e) {
        console.error('notifyManagementBooking: booking confirmation email failed: ' + e.message);
        passenger_email = { status: 'failed', reason: 'error', message: e.message, sent: false };
      }
    }

    // Truthful result: never report success when all creations failed.
    if (created.length === 0 && failed.length > 0) {
      return Response.json({ error: 'All notification creations failed', failed, passenger_email }, { status: 500 });
    }
    return Response.json({
      ok: true,
      auth_mode: authMode,
      recipients: users.length,
      notified: created.length,
      duplicates_skipped: duplicates,
      failed,
      passenger_email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}