import { adminClient, requireCaller } from '../_shared/auth.ts';
import { loadSettings } from '../_shared/config.ts';
import { STAFF_ROLES } from '../_shared/bookingAccess.ts';
import { evaluateDiscount, normalizeCode, round2 } from '../_shared/discounts.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { notifyNewBooking } from '../_shared/notify.ts';
import { makeReference } from '../_shared/reference.ts';
import { checkFlight, isPhone } from '../_shared/validation.ts';

// One message for every way a code can fail, so nobody can probe which codes exist or what state they are in.
const DISCOUNT_INVALID = "That discount code isn't valid for your account or this booking. Check the code, or contact Airport Assist.";

// Creates a booking server-side. Package price, booking total and discount are all recomputed here:
// a tampered browser payload cannot change the amount.
serve('createBooking', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);
  if (user.role === 'pending') throw new HttpError(403, 'Your account is awaiting approval.');

  const body = await readBody(req) as Record<string, any>;
  const channel = body.channel === 'walk_in' ? 'walk_in' : 'online';
  const isStaff = STAFF_ROLES.includes(user.role);
  if (channel === 'walk_in' && !isStaff) throw new HttpError(403, 'Only staff can create walk-in bookings.');
  const settings = await loadSettings(admin);
  // The admin can pause online booking (Admin > Settings). Staff at the desk are never blocked.
  if (channel === 'online' && !isStaff && !settings.bool('online_bookings_enabled')) throw new HttpError(503, settings.str('online_bookings_message'));

  // The same submission arriving twice (a retry after a timeout) returns the first booking instead of making a second.
  const idempotencyKey = typeof body.idempotency_key === 'string' && body.idempotency_key.length >= 8 && body.idempotency_key.length <= 100
    ? body.idempotency_key : null;
  const ownerColumn = channel === 'online' ? 'passenger_user_id' : 'assigned_supervisor_id';
  const existingBooking = async () => {
    if (!idempotencyKey) return null;
    const { data } = await admin.from('bookings').select('*').eq(ownerColumn, user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
    return data;
  };
  const repeat = await existingBooking();
  if (repeat) return json({ booking: repeat, duplicate: true });

  // Online bookings record consent to the privacy notice (what is collected, why, and that ID photos are kept for 30 days).
  if (channel === 'online' && body.consent !== true) throw new HttpError(400, 'Please confirm that you have read the privacy notice.');

  // Passengers: at most 10 new bookings an hour. Staff taking walk-ins are not limited.
  if (!isStaff) {
    const hits = await admin.rpc('hit_rate_limit', { p_key: `booking:${user.id}`, p_window_seconds: 3600 });
    if (hits.error) throw hits.error;
    if (hits.data > settings.num('booking_limit_per_hour')) throw new HttpError(429, 'You have made a lot of bookings in the last hour. Please try again later, or contact the Airport Assist desk.');
  }

  const packageCode = String(body.package_code || '').trim();
  if (!packageCode) throw new HttpError(400, 'Please select a service package.');
  const { data: pkg } = await admin.from('service_packages').select('*').eq('code', packageCode).eq('active', true).maybeSingle();
  if (!pkg) throw new HttpError(400, 'That service package is not available.');

  const passengersIn: any[] = Array.isArray(body.passengers) ? body.passengers : [];
  if (passengersIn.length < 1 || passengersIn.length > 50) throw new HttpError(400, 'Add between 1 and 50 passengers.');
  const passengers = passengersIn.map((p) => ({
    name: String(p?.name || '').trim(),
    contact: String(p?.contact || '').trim(),
    nationality: String(p?.nationality || '').trim(),
    total_bags: Number(p?.total_bags || 0),
    special_requests: String(p?.special_requests || '').trim(),
  }));
  if (passengers.some((p) => !p.name)) throw new HttpError(400, 'Every passenger needs a name.');

  const flightNumber = String(body.flight_number || '').trim();
  const flightDate = String(body.flight_date || '').trim();
  const flightTime = String(body.scheduled_flight_time || '').trim();
  const contact = String(body.contact || '').trim();
  if (!flightNumber) throw new HttpError(400, 'Flight number is required.');
  if (!flightDate) throw new HttpError(400, 'Flight date is required.');
  if (!flightTime) throw new HttpError(400, 'Scheduled flight time is required.');
  if (!contact) throw new HttpError(400, 'A contact number is required.');
  if (!isPhone(contact)) throw new HttpError(400, 'Enter a valid contact phone number, including the country code if it is not a Ghana number.');
  const flightProblem = checkFlight(flightDate, flightTime, { now: Date.now(), minLeadHours: settings.num('min_lead_hours'), maxAdvanceDays: settings.num('max_advance_days'), isStaff });
  if (flightProblem) throw new HttpError(400, flightProblem);
  if (passengers.some((p) => !Number.isFinite(p.total_bags) || p.total_bags < 0 || p.total_bags > 50)) throw new HttpError(400, 'Bags per passenger must be between 0 and 50.');

  // Photos live in the uploader's own folder; a booking may not point at anyone else's file.
  const photoUri = String(body.passenger_photo_uri || '').trim().slice(0, 500);
  if (photoUri && !photoUri.startsWith(`${user.id}/`)) throw new HttpError(400, 'That photo could not be used. Please upload it again.');

  const gross = round2(Number(pkg.price) * passengers.length);

  // ---- Discount: revalidate everything at submission time ----
  let discountRecord: Record<string, any> | null = null;
  let discountAmounts: { gross_total: number; discount_amount: number; final_total: number } | null = null;
  let claimed = false;

  const release = async () => {
    if (claimed && discountRecord && discountAmounts) {
      await admin.rpc('release_discount', { p_code: discountRecord.code, p_amount: discountAmounts.discount_amount });
      claimed = false;
    }
  };

  const countUses = async (codeId: string) => {
    const { count } = await admin.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('discount_code_id', codeId).eq('user_id', user.id);
    return count ?? 0;
  };

  if (body.discount_code) {
    // Guessing is throttled: after 10 failed attempts in 15 minutes the person must wait.
    const windowSeconds = settings.num('discount_attempt_window_minutes') * 60;
    const tries = await admin.rpc('rate_limit_count', { p_key: `discount:${user.id}`, p_window_seconds: windowSeconds });
    if ((tries.data ?? 0) >= settings.num('discount_attempt_limit')) throw new HttpError(429, 'Too many discount code attempts. Please wait a few minutes and try again.');
    const fail = async () => { await admin.rpc('hit_rate_limit', { p_key: `discount:${user.id}`, p_window_seconds: windowSeconds }); throw new HttpError(400, DISCOUNT_INVALID); };

    const { data: record } = await admin.from('discount_codes').select('*').eq('code', normalizeCode(body.discount_code)).maybeSingle();
    if (!record) return await fail();
    const result = evaluateDiscount({ record, userEmail: user.email, grossTotal: gross, usedByUser: await countUses(record.id) });
    if (!result.ok) {
      console.log(`createBooking: discount ${record.code} refused for ${user.id}: ${result.message}`);
      return await fail();
    }

    // Atomic claim in one SQL statement: only succeeds while the code still has uses left.
    const { data: claim, error: claimError } = await admin.rpc('claim_discount', {
      p_code: record.code, p_amount: result.discount_amount, p_token: crypto.randomUUID(),
    });
    if (claimError) throw claimError;
    if (!claim?.id) throw new HttpError(409, 'This discount code was just used by another booking. Please try again or remove the code.');
    claimed = true;
    discountRecord = record;
    discountAmounts = result;

    // Re-check the per-customer limit after the claim.
    const perCustomer = Number(record.max_uses_per_customer) || 0;
    if (perCustomer > 0 && (await countUses(record.id)) >= perCustomer) {
      await release();
      throw new HttpError(400, DISCOUNT_INVALID);
    }
  }

  const finalTotal = discountAmounts ? discountAmounts.final_total : gross;

  const payload: Record<string, unknown> = {
    reference: makeReference(),
    package_code: pkg.code,
    package_name: pkg.name,
    price_per_passenger: Number(pkg.price),
    num_passengers: passengers.length,
    original_total: gross,
    total_value: finalTotal,
    flight_type: body.flight_type === 'departure' ? 'departure' : 'arrival',
    airline: String(body.airline || '').trim(),
    flight_number: flightNumber,
    flight_date: flightDate,
    scheduled_flight_time: flightTime,
    contact,
    nationality: String(body.nationality || '').trim(),
    total_bags: Math.max(0, Math.trunc(Number(body.total_bags || 0))),
    special_requests: String(body.special_requests || '').trim(),
    lounge_used: pkg.includes_lounge ? String(body.lounge_used || '').trim() : '',
    passengers,
    porters: [],
    status: channel === 'walk_in' ? 'assigned' : 'confirmed',
    payment_status: 'unpaid',
    amount_collected: 0,
    outstanding_balance: finalTotal,
    booking_channel: channel,
    passenger_user_id: channel === 'online' ? user.id : null,
    passenger_photo_uri: photoUri,
    idempotency_key: idempotencyKey,
    consent_at: channel === 'online' ? new Date().toISOString() : null,
    updated_by_id: user.id,
    discount_amount: 0,
    discount_value: 0,
  };

  if (channel === 'walk_in') {
    payload.assigned_supervisor_id = user.id;
    payload.assigned_supervisor_name = user.full_name || user.email || 'Supervisor';
  }

  if (discountRecord && discountAmounts) {
    Object.assign(payload, {
      discount_code_id: discountRecord.id,
      discount_code: discountRecord.code,
      discount_type: discountRecord.discount_type,
      discount_value: Number(discountRecord.discount_value) || 0,
      discount_amount: discountAmounts.discount_amount,
      discount_recipient_type: discountRecord.recipient_type || null,
      discount_recipient_name: discountRecord.recipient_name || '',
      discount_redeemed_at: new Date().toISOString(),
    });
  }

  // Service role on purpose: row-level security does not let browsers create or edit bookings,
  // so this server-priced payload is the only way in. A reference clash (very unlikely) retries.
  let booking: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 5 && !booking; attempt++) {
    const { data, error } = await admin.from('bookings').insert(payload).select().single();
    if (!error) { booking = data; break; }
    if (error.code !== '23505') { await release(); throw error; }
    if (error.message?.includes('bookings_idempotency_idx')) {
      // Two identical submissions raced: keep the first, give this one's discount back.
      await release();
      const first = await existingBooking();
      if (first) return json({ booking: first, duplicate: true });
    }
    payload.reference = makeReference();
  }
  if (!booking) { await release(); throw new HttpError(500, 'Could not create the booking. Please try again.'); }

  if (discountRecord && discountAmounts) {
    // History row. The booking is already saved and priced, so a failure here is logged, not fatal.
    const { error } = await admin.from('discount_redemptions').insert({
      discount_code_id: discountRecord.id, code: discountRecord.code, booking_id: booking.id, booking_reference: booking.reference,
      user_id: user.id, user_email: user.email, recipient_type: discountRecord.recipient_type || null,
      recipient_name: discountRecord.recipient_name || '', discount_type: discountRecord.discount_type,
      discount_value: Number(discountRecord.discount_value) || 0, discount_amount: discountAmounts.discount_amount,
      gross_total: discountAmounts.gross_total, net_total: discountAmounts.final_total, redeemed_at: new Date().toISOString(),
    });
    if (error) console.error('createBooking: redemption history failed:', error.message);
  }

  // Alert management and email the passenger. Never fails the booking.
  try {
    await notifyNewBooking(admin, booking.id);
  } catch (e) {
    console.error('createBooking: notifications failed:', e instanceof Error ? e.message : e);
  }

  return json({ booking });
});
