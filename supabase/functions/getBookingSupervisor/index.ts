import { adminClient, requireCaller } from '../_shared/auth.ts';
import { canViewBooking } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// The supervisor profile for ONE booking, only to someone allowed to see that booking. The caller
// names a booking, never a supervisor, so this cannot be used to browse the directory.
serve('getBookingSupervisor', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  const { booking_id: bookingId } = await readBody(req) as Record<string, string>;
  if (!bookingId) throw new HttpError(400, 'booking_id is required');

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking || !canViewBooking(user, booking)) throw new HttpError(404, 'Booking not found');

  if (!booking.assigned_supervisor_id) return json({ assigned: false, profile: null, booking_reference: booking.reference || null });

  const { data: entry } = await admin.from('supervisor_directory').select('*').eq('user_id', booking.assigned_supervisor_id).limit(1).maybeSingle();
  return json({
    assigned: true,
    profile: {
      full_name: entry?.full_name || booking.assigned_supervisor_name || 'Airport Assist Supervisor',
      title: 'Airport Assist Supervisor',
      phone: entry?.phone || '', whatsapp_number: entry?.whatsapp_number || '', email: entry?.email || '',
      languages: entry?.languages || '', bio: entry?.bio || '', photo_uri: entry?.photo_uri || '',
    },
    booking_reference: booking.reference || null,
    supervisor_user_id: booking.assigned_supervisor_id,
    profile_complete: !!entry,
  });
});
