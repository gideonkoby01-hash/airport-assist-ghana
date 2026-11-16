import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { round2 } from '../_shared/bookingAccess.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { makeReference } from '../_shared/reference.ts';
import { isPhone } from '../_shared/validation.ts';

const METHODS = ['cash', 'mobile_money', 'card', 'corporate_account'];

const MESSAGES: Record<string, string> = {
  package_unavailable: 'That service is not available.',
  invalid_count: 'Enter between 1 and 50 passengers.',
  invalid_amount: 'The price cannot be more than the package price, or zero.',
  reason_required: 'A lower price needs a reason (a few words). It is kept on the record.',
  invalid_method: 'Choose how the passenger paid.',
  invalid_flight: 'Enter the flight number as letters and numbers, for example KQ 510.',
  invalid_flight_time: 'Enter the flight time as hours and minutes, for example 14:30.',
  invalid_porter_passengers: 'A porter cannot be credited with more passengers than were sold.',
};

// A walk-in sale at the desk: a minimal booking plus its payment, created together so every sale has a
// reference, a time, an owner and an audit entry. The price comes from the package; it can be lowered
// with a reason, never raised.
serve('createQuickSale', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['supervisor', 'management', 'admin']);

  const body = await readBody(req) as Record<string, any>;
  const method = String(body.method || '');
  const phone = String(body.phone || '').trim();
  if (!METHODS.includes(method)) throw new HttpError(400, MESSAGES.invalid_method);
  if (phone && !isPhone(phone)) throw new HttpError(400, 'Enter a valid phone number, or leave it empty.');
  const override = body.override_amount === undefined || body.override_amount === null || body.override_amount === '' ? null : round2(body.override_amount);
  if (override !== null && !(override > 0)) throw new HttpError(400, MESSAGES.invalid_amount);

  // The same submission arriving twice (double tap, retry after a timeout) returns the first sale, not a second.
  const key = typeof body.idempotency_key === 'string' && body.idempotency_key.length >= 8 && body.idempotency_key.length <= 100 ? body.idempotency_key : null;
  const first = async () => {
    if (!key) return null;
    const { data } = await admin.from('bookings').select('*').eq('assigned_supervisor_id', user.id).eq('idempotency_key', key).maybeSingle();
    return data;
  };
  const repeat = await first();
  if (repeat) return json({ ok: true, booking: repeat, duplicate: true });

  // A porter comes from the register, so every payout is tied to a real person.
  let porterId = '';
  let porterName = '';
  if (body.porter_id) {
    const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', String(body.porter_id)).maybeSingle();
    if (!porter || !porter.active) throw new HttpError(400, 'That porter is not on the active list. Ask an admin to add them under Porters.');
    porterId = porter.id;
    porterName = porter.full_name;
  }
  const commission = (await loadSettings(admin)).num('porter_commission_per_passenger');
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin.rpc('create_quick_sale', {
      p_user_id: user.id, p_user_name: user.full_name || user.email || '', p_reference: makeReference(),
      p_package_code: String(body.package_code || ''), p_count: Math.trunc(Number(body.count)), p_direction: String(body.direction || ''),
      p_name: String(body.name || '').trim().slice(0, 120), p_phone: phone,
      p_override_amount: override, p_override_reason: String(body.override_reason || '').trim().slice(0, 200), p_method: method,
      p_porter_name: porterName, p_porter_passengers: Math.trunc(Number(body.porter_passengers)) || null,
      p_commission_per_passenger: commission, p_idempotency_key: key,
      p_flight_number: String(body.flight_number || '').trim().slice(0, 12), p_airline: String(body.airline || '').trim().slice(0, 60),
      p_flight_time: String(body.flight_time || '').trim(), p_porter_id: porterId,
    });
    if (!error) return json({ ok: true, booking: data });
    if (error.code === '23505') {
      if (error.message?.includes('bookings_idempotency_idx')) {
        const again = await first();
        if (again) return json({ ok: true, booking: again, duplicate: true });
      }
      continue; // reference clash: try another
    }
    if (MESSAGES[error.message]) throw new HttpError(400, MESSAGES[error.message]);
    throw error;
  }
  throw new HttpError(500, 'Could not save the sale. Please try again.');
});
