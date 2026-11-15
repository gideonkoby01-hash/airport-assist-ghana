import { adminClient, appUrl, recipientsByRole } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { requireCronSecret } from '../_shared/cron.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { json, serve } from '../_shared/http.ts';

// Every 5 minutes: a booking that has had no supervisor for UNASSIGNED_ALERT_MINUTES (default 15) alerts management and
// admin once, in the app and by email. A booking is only ever escalated once.
serve('escalateUnassigned', async (req) => {
  await requireCronSecret(req);
  const admin = adminClient();
  const minutes = (await loadSettings(admin)).num('unassigned_alert_minutes');
  const before = new Date(Date.now() - minutes * 60_000).toISOString();
  const today = new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 10);

  const { data: due, error } = await admin.from('bookings').select('id,reference,package_name,package_code,airline,flight_number,flight_date,scheduled_flight_time,created_date')
    .eq('status', 'confirmed').is('assigned_supervisor_id', null).is('unassigned_alerted_at', null)
    .lt('created_date', before).gte('flight_date', today).limit(50);
  if (error) throw error;

  const staff = due?.length ? await recipientsByRole(admin, ['management', 'admin']) : [];
  let escalated = 0;
  for (const b of due ?? []) {
    // Claim it first, so two overlapping runs cannot both alert.
    const { data: claimed } = await admin.from('bookings').update({ unassigned_alerted_at: new Date().toISOString() }).eq('id', b.id).is('unassigned_alerted_at', null).select('id');
    if (!claimed?.length) continue;
    escalated++;
    const waited = Math.round((Date.now() - new Date(b.created_date).getTime()) / 60_000);
    const flightLine = [b.airline, b.flight_number].filter(Boolean).join(' ') || '—';
    const travelLine = [b.flight_date, b.scheduled_flight_time].filter(Boolean).join(' · ') || '—';
    for (const u of staff) {
      await admin.from('notifications').insert({
        user_id: u.id, booking_id: b.id, booking_reference: b.reference, type: 'info', read: false,
        title: 'Booking still unassigned',
        message: `Booking ${b.reference} has had no supervisor for ${waited} minutes.\nFlight: ${flightLine}\nDate/Time: ${travelLine}`,
        link_path: `/bookings/${b.id}`,
      });
      await sendTransactionalEmail(admin, {
        eventKey: `unassigned:${b.id}:${u.id}`, templateName: 'UnassignedBooking', to: u.email, userId: u.id, relatedEntityId: b.id,
        variables: { reference: b.reference, minutes: waited, service: b.package_name || b.package_code, flight_line: flightLine, travel_line: travelLine, cta_url: `${appUrl()}/bookings/${b.id}` },
      });
    }
  }
  console.log(`escalateUnassigned: ${escalated} booking(s) escalated`);
  return json({ ok: true, escalated });
});
