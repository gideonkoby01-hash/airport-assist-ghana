import { adminClient, requireCaller } from '../_shared/auth.ts';
import { STAFF_ROLES } from '../_shared/bookingAccess.ts';
import { evaluateDiscount, normalizeCode, round2 } from '../_shared/discounts.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { notifyNewBooking } from '../_shared/notify.ts';

// AAG-YYMMDD-XXXX, with the random part from the crypto source.
function makeReference(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `AAG-${ymd}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

// Creates a booking server-side. Package price, booking total and discount are all recomputed here:
// a tampered browser payload cannot change the amount.
serve('createBooking', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);
  if (user.role === 'pending') throw new HttpError(403, 'Your account is awaiting approval.');

  const body = await readBody(req) as Record<string, any>;
  const channel = body.channel === 'walk_in' ? 'walk_in' : 'online';
  if (channel === 'walk_in' && !STAFF_ROLES.includes(user.role)) throw new HttpError(403, 'Only staff can create walk-in bookings.');

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
    const { data: record } = await admin.from('discount_codes').select('*').eq('code', normalizeCode(body.discount_code)).maybeSingle();
    if (!record) throw new HttpError(400, 'That discount code does not exist.');
    const result = evaluateDiscount({ record, userEmail: user.email, grossTotal: gross, usedByUser: await countUses(record.id) });
    if (!result.ok) throw new HttpError(400, result.message);

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
      throw new HttpError(409, 'You have already used this discount code the maximum number of times.');
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
    passenger_photo_uri: String(body.passenger_photo_uri || '').trim().slice(0, 500),
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
