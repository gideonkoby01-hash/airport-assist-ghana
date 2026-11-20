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
  invalid_porters: 'Check the porters and try again.',
  invalid_porters_waived: 'Only a meet and assist can go without a porter. Porter Service Only needs a porter for each passenger.',
  invalid_porter_passengers: 'There are more porters than passengers. One porter handles one passenger.',
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

  // One porter handles one passenger: a sale of 3 passengers has 3 different porters, each earning the commission once.
  // Porters come from the register, so every payout is tied to a real person.
  const count = Math.trunc(Number(body.count));
  // A meet and assist does not always need a porter: some or all passengers can be marked as needing none.
  const waived = body.porters_waived === undefined || body.porters_waived === null || body.porters_waived === '' ? 0 : Math.trunc(Number(body.porters_waived));
  if (!Number.isInteger(waived) || waived < 0) throw new HttpError(400, MESSAGES.invalid_porters_waived);
  if (waived > 0 && String(body.package_code || '') === 'porter_only') throw new HttpError(400, MESSAGES.invalid_porters_waived);
  const ids: string[] = Array.isArray(body.porter_ids) ? body.porter_ids.map((v) => String(v)) : body.porter_id ? [String(body.porter_id)] : [];
  if (ids.some((v) => !v)) throw new HttpError(400, 'Choose a porter for each passenger, or mark the passenger as needing no porter.');
  if (Number.isInteger(count) && ids.length + waived !== count) {
    const needed = count - waived;
    throw new HttpError(400, waived > 0
      ? `This sale has ${count} passenger${count === 1 ? '' : 's'}, ${waived} needing no porter, so choose ${needed} porter${needed === 1 ? '' : 's'}.`
      : `This sale has ${count} passenger${count === 1 ? '' : 's'}, so choose ${count} porter${count === 1 ? '' : 's'}: one for each passenger.`);
  }
  if (!ids.length && waived === 0) throw new HttpError(400, 'Every service needs a porter. Choose who is handling each passenger.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each porter can handle only one passenger on a sale. Choose a different porter for each.');
  const chosen: { id: string; full_name: string }[] = [];
  for (const id of ids) {
    const { data: porter } = await admin.from('porters').select('id,full_name,active').eq('id', id).maybeSingle();
    if (!porter || !porter.active) throw new HttpError(400, 'A porter is not on the active list. Ask an admin to add them under Porters.');
    chosen.push({ id: porter.id, full_name: porter.full_name });
  }
  const porterId = chosen[0]?.id ?? null;
  const porterName = chosen[0]?.full_name ?? '';
  const morePorters = chosen.slice(1).map((p) => ({ porter_id: p.id, porter_name: p.full_name }));
  const settings = await loadSettings(admin);
  const commission = settings.num('porter_commission_per_passenger');
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin.rpc('create_quick_sale', {
      p_user_id: user.id, p_user_name: user.full_name || user.email || '', p_reference: makeReference(),
      p_package_code: String(body.package_code || ''), p_count: Math.trunc(Number(body.count)), p_direction: String(body.direction || ''),
      p_name: String(body.name || '').trim().slice(0, 120), p_phone: phone,
      p_override_amount: override, p_override_reason: String(body.override_reason || '').trim().slice(0, 200), p_method: method,
      p_porter_name: porterName, p_porter_passengers: 1,
      p_commission_per_passenger: commission, p_idempotency_key: key,
      p_flight_number: String(body.flight_number || '').trim().slice(0, 12), p_airline: String(body.airline || '').trim().slice(0, 60),
      p_flight_time: String(body.flight_time || '').trim(), p_porter_id: porterId, p_more_porters: morePorters, p_porters_waived: waived,
    });
    if (!error) {
      // The supervisor's own commission, if they ticked it: a meet and assist earns it, Porter Service Only does not.
      if (body.commission === true && data.package_code !== 'porter_only') {
        const amount = settings.num('supervisor_commission_per_signup');
        const { data: marked, error: markError } = await admin.rpc('set_supervisor_commission', { p_booking_id: data.id, p_paid: true, p_amount: amount, p_user_id: user.id });
        if (markError) return json({ ok: true, booking: data, commission_warning: 'The sale was recorded, but your commission could not be marked. Open the booking and tick it there.' });
        return json({ ok: true, booking: marked });
      }
      return json({ ok: true, booking: data });
    }
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
