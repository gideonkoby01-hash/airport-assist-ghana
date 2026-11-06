import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Returns the supervisor profile for ONE booking, and only to someone allowed
// to see that booking. Authorization comes from the user-scoped read of the
// booking (Booking RLS), so a passenger can only ever resolve a profile through
// a booking they own. There is no directory listing here, and no id-based
// supervisor lookup: the caller cannot name a supervisor, only a booking.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = body.booking_id;
    if (!bookingId) return Response.json({ error: 'booking_id is required' }, { status: 400 });

    // User-scoped read: Booking RLS decides access. 403/404 both become "not
    // found" so the endpoint never reveals whether a booking exists.
    const booking = await base44.entities.Booking.get(bookingId)
      .catch((e) => (e.status === 404 || e.status === 403 ? null : Promise.reject(e)));
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    // Defence in depth: passengers may only read their own booking, and only
    // staff roles may read bookings they are not the creator of.
    const isStaff = ['supervisor', 'management', 'admin'].includes(user.role);
    if (!isStaff && booking.created_by_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!booking.assigned_supervisor_id) {
      return Response.json({
        assigned: false,
        profile: null,
        booking_reference: booking.reference || null,
      });
    }

    // Service role is used only to read the single assigned supervisor's
    // directory record — never a list, and never another passenger's data.
    const found = await base44.asServiceRole.entities.SupervisorDirectory.filter({
      user_id: booking.assigned_supervisor_id,
    });
    const entry = (Array.isArray(found) ? found : found.items || [])[0] || null;

    const profile = {
      full_name: (entry && entry.full_name) || booking.assigned_supervisor_name || 'Airport Assist Supervisor',
      title: 'Airport Assist Supervisor',
      phone: (entry && entry.phone) || '',
      whatsapp_number: (entry && entry.whatsapp_number) || '',
      email: (entry && entry.email) || '',
      languages: (entry && entry.languages) || '',
      bio: (entry && entry.bio) || '',
      photo_uri: (entry && entry.photo_uri) || '',
    };

    return Response.json({
      assigned: true,
      profile,
      booking_reference: booking.reference || null,
      supervisor_user_id: booking.assigned_supervisor_id,
      profile_complete: !!entry,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}