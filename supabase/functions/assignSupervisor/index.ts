import { adminClient, appUrl, requireCaller } from '../_shared/auth.ts';
import { bookingOwnerId } from '../_shared/bookingAccess.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Management or admin assigns (or reassigns) a supervisor to a booking and alerts that supervisor.
serve('assignSupervisor', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['management', 'admin']);

  const { booking_id: bookingId, supervisor_user_id: supervisorId } = await readBody(req) as Record<string, string>;
  if (!bookingId || !supervisorId) throw new HttpError(400, 'booking_id and supervisor_user_id are required');

  const { data: entry } = await admin.from('supervisor_directory').select('full_name,email').eq('user_id', supervisorId).eq('active', true).limit(1).maybeSingle();
  if (!entry) throw new HttpError(400, 'Supervisor not found or not active in the directory');

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found');

  if (['completed', 'cancelled', 'no_show'].includes(booking.status)) throw new HttpError(409, 'This booking is closed, so it cannot be assigned.');

  // Assigning the supervisor who already has it is not a new event: do not alert them again.
  if (booking.assigned_supervisor_id === supervisorId) return json({ ok: true, booking, duplicate: true, notified: 0 });

  const isReassignment = !!booking.assigned_supervisor_id;
  const { data: updated, error } = await admin.from('bookings').update({
    updated_by_id: caller.id,
    assigned_supervisor_id: supervisorId,
    assigned_supervisor_name: entry.full_name || entry.email,
    status: booking.status === 'confirmed' ? 'assigned' : booking.status,
  }).eq('id', bookingId).select().single();
  if (error) throw error;

  const flightInfo = [booking.flight_date, booking.scheduled_flight_time].filter(Boolean).join(' ');
  const message = [
    `Booking ${booking.reference} has been ${isReassignment ? 'reassigned' : 'assigned'} to you.`,
    `Service: ${booking.package_name || booking.package_code}`,
    `Flight: ${`${booking.airline || ''} ${booking.flight_number || ''}`.trim()}`,
    `Date/Time: ${flightInfo || '—'}`,
  ].join('\n');

  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: supervisorId, booking_id: bookingId, booking_reference: booking.reference,
    title: isReassignment ? 'Booking Reassigned' : 'New Booking Assignment', message, read: false,
    type: isReassignment ? 'reassignment' : 'assignment',
  });
  if (notifyError) console.error('assignSupervisor: supervisor alert failed:', notifyError.message);

  // Email the supervisor (they may not have the app open at the airport) and tell the passenger who will look after them.
  // Best effort: the assignment is already saved.
  const flightLine = `${booking.airline || ''} ${booking.flight_number || ''}`.trim() || '—';
  const travelLine = flightInfo || '—';
  const stamp = updated.updated_date;
  try {
    await sendTransactionalEmail(admin, {
      eventKey: `assignment:${bookingId}:${supervisorId}:${stamp}`, templateName: 'SupervisorAssigned', to: entry.email, userId: supervisorId, relatedEntityId: bookingId,
      variables: {
        first_name: (entry.full_name || '').trim().split(/\s+/)[0] || 'there', action_word: isReassignment ? 'reassigned' : 'assigned', reference: booking.reference,
        service: booking.package_name || booking.package_code, flight_line: flightLine, travel_line: travelLine,
        passengers_line: `${booking.num_passengers || 0} passenger(s)`, cta_url: `${appUrl()}/bookings/${bookingId}`,
      },
    });
    const ownerId = bookingOwnerId(booking);
    if (booking.booking_channel === 'online' && ownerId) {
      const { data: owner } = await admin.from('profiles').select('id,email,full_name').eq('id', ownerId).maybeSingle();
      await sendTransactionalEmail(admin, {
        eventKey: `passenger_assigned:${bookingId}:${supervisorId}:${stamp}`, templateName: 'PassengerSupervisorAssigned', to: owner?.email, userId: ownerId, relatedEntityId: bookingId,
        variables: {
          first_name: (booking.passengers?.[0]?.name || owner?.full_name || '').trim().split(/\s+/)[0] || 'there', supervisor_name: entry.full_name || 'Your supervisor',
          reference: booking.reference, flight_line: flightLine, travel_line: travelLine, cta_url: `${appUrl()}/bookings/${bookingId}`,
        },
      });
    }
  } catch (e) {
    console.error('assignSupervisor: assignment emails failed:', e instanceof Error ? e.message : e);
  }

  return json({ ok: true, booking: updated });
});
