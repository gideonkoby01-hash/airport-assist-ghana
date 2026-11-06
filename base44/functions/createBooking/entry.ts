import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { normalizeCode, evaluateDiscount, firstRecord, asList, round2 } from '../../shared/discounts.ts';

const STAFF_ROLES = ['supervisor', 'management', 'admin'];

function makeReference() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '0');
  return `AAG-${ymd}-${rand}`;
}

async function releaseClaim(base44, code, token, amount) {
  try {
    await base44.asServiceRole.entities.DiscountCode.updateMany(
      { code, last_claim_token: token },
      { $inc: { redemption_count: -1, total_discount_granted: -amount } }
    );
  } catch {
    // Nothing else to do: the booking never existed, the claim is only a counter.
  }
}

// Creates a booking server-side. Package price, booking total and discount are
// all recomputed here: a tampered browser payload cannot change the amount.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role === 'pending') {
      return Response.json({ error: 'Your account is awaiting approval.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const channel = body.channel === 'walk_in' ? 'walk_in' : 'online';
    const isStaff = STAFF_ROLES.includes(user.role);
    if (channel === 'walk_in' && !isStaff) {
      return Response.json({ error: 'Only staff can create walk-in bookings.' }, { status: 403 });
    }

    const packageCode = String(body.package_code || '').trim();
    if (!packageCode) return Response.json({ error: 'Please select a service package.' }, { status: 400 });

    const pkgPage = await base44.entities.ServicePackage.filter({ code: packageCode, active: true });
    const pkg = firstRecord(pkgPage);
    if (!pkg) return Response.json({ error: 'That service package is not available.' }, { status: 400 });

    const passengersIn = Array.isArray(body.passengers) ? body.passengers : [];
    if (passengersIn.length < 1 || passengersIn.length > 50) {
      return Response.json({ error: 'Add between 1 and 50 passengers.' }, { status: 400 });
    }
    const passengers = passengersIn.map((p) => ({
      name: String((p && p.name) || '').trim(),
      contact: String((p && p.contact) || '').trim(),
      nationality: String((p && p.nationality) || '').trim(),
      total_bags: Number((p && p.total_bags) || 0),
      special_requests: String((p && p.special_requests) || '').trim(),
    }));
    if (passengers.some((p) => !p.name)) {
      return Response.json({ error: 'Every passenger needs a name.' }, { status: 400 });
    }

    const flightNumber = String(body.flight_number || '').trim();
    const flightDate = String(body.flight_date || '').trim();
    const flightTime = String(body.scheduled_flight_time || '').trim();
    const contact = String(body.contact || '').trim();
    if (!flightNumber) return Response.json({ error: 'Flight number is required.' }, { status: 400 });
    if (!flightDate) return Response.json({ error: 'Flight date is required.' }, { status: 400 });
    if (!flightTime) return Response.json({ error: 'Scheduled flight time is required.' }, { status: 400 });
    if (!contact) return Response.json({ error: 'A contact number is required.' }, { status: 400 });

    const numPassengers = passengers.length;
    const gross = round2(Number(pkg.price) * numPassengers);

    // ---- Discount: revalidate everything at submission time ----
    let discountRecord = null;
    let discountAmounts = null;
    let claimToken = null;

    if (body.discount_code) {
      const normalized = normalizeCode(body.discount_code);
      const found = await base44.asServiceRole.entities.DiscountCode.filter({ code: normalized });
      const record = firstRecord(found);
      if (!record) return Response.json({ error: 'That discount code does not exist.' }, { status: 400 });

      const used = await base44.asServiceRole.entities.DiscountRedemption.count({
        discount_code_id: record.id,
        user_id: user.id,
      });
      const result = evaluateDiscount({
        record,
        userEmail: user.email,
        grossTotal: gross,
        usedByUser: used,
      });
      if (!result.ok) return Response.json({ error: result.message }, { status: 400 });

      // Atomic claim: the conditional increment only writes while the stored
      // redemption_count still equals the value we validated, and the unique
      // token tells us whether our write is the one that landed.
      claimToken = crypto.randomUUID();
      await base44.asServiceRole.entities.DiscountCode.updateMany(
        { code: record.code, redemption_count: Number(record.redemption_count) || 0 },
        {
          $inc: { redemption_count: 1, total_discount_granted: result.discount_amount },
          $set: { last_claim_token: claimToken },
        }
      );
      const after = await base44.asServiceRole.entities.DiscountCode.get(record.id);
      if (!after || after.last_claim_token !== claimToken) {
        return Response.json(
          { error: 'This discount code was just used by another booking. Please try again or remove the code.' },
          { status: 409 }
        );
      }

      // Re-check the per-customer limit after the claim, so two simultaneous
      // submissions by the same passenger cannot both slip through.
      const perCustomer = Number(record.max_uses_per_customer) || 0;
      if (perCustomer > 0) {
        const usedAfter = await base44.asServiceRole.entities.DiscountRedemption.count({
          discount_code_id: record.id,
          user_id: user.id,
        });
        if (usedAfter >= perCustomer) {
          await releaseClaim(base44, record.code, claimToken, result.discount_amount);
          return Response.json(
            { error: 'You have already used this discount code the maximum number of times.' },
            { status: 409 }
          );
        }
      }

      discountRecord = record;
      discountAmounts = result;
    }

    const finalTotal = discountAmounts ? discountAmounts.final_total : gross;

    let reference = makeReference();
    for (let i = 0; i < 5; i += 1) {
      const existing = await base44.asServiceRole.entities.Booking.filter({ reference }, { limit: 1 });
      if (asList(existing).length === 0) break;
      reference = makeReference();
    }

    const payload = {
      reference,
      package_code: pkg.code,
      package_name: pkg.name,
      price_per_passenger: Number(pkg.price),
      num_passengers: numPassengers,
      original_total: gross,
      total_value: finalTotal,
      flight_type: body.flight_type === 'departure' ? 'departure' : 'arrival',
      airline: String(body.airline || '').trim(),
      flight_number: flightNumber,
      flight_date: flightDate,
      scheduled_flight_time: flightTime,
      contact,
      nationality: String(body.nationality || '').trim(),
      total_bags: Number(body.total_bags || 0),
      special_requests: String(body.special_requests || '').trim(),
      lounge_used: pkg.includes_lounge ? String(body.lounge_used || '').trim() : '',
      passengers,
      porters: [],
      status: channel === 'walk_in' ? 'assigned' : 'confirmed',
      payment_status: 'unpaid',
      amount_collected: 0,
      outstanding_balance: finalTotal,
      booking_channel: channel,
      passenger_photo_uri: String(body.passenger_photo_uri || '').trim().slice(0, 500),
      discount_code_id: '',
      discount_code: '',
      discount_type: '',
      discount_value: 0,
      discount_amount: 0,
      discount_recipient_type: '',
      discount_recipient_name: '',
      discount_redeemed_at: null,
    };

    if (channel === 'walk_in') {
      payload.assigned_supervisor_id = user.id;
      payload.assigned_supervisor_name = user.full_name || user.email || 'Supervisor';
    }

    if (discountRecord && discountAmounts) {
      payload.discount_code_id = discountRecord.id;
      payload.discount_code = discountRecord.code;
      payload.discount_type = discountRecord.discount_type;
      payload.discount_value = Number(discountRecord.discount_value) || 0;
      payload.discount_amount = discountAmounts.discount_amount;
      payload.discount_recipient_type = discountRecord.recipient_type || '';
      payload.discount_recipient_name = discountRecord.recipient_name || '';
      payload.discount_redeemed_at = new Date().toISOString();
    }

    let booking;
    try {
      booking = await base44.entities.Booking.create(payload);
    } catch (err) {
      if (discountRecord && claimToken) {
        await releaseClaim(base44, discountRecord.code, claimToken, discountAmounts.discount_amount);
      }
      throw err;
    }

    if (discountRecord && discountAmounts) {
      try {
        const already = await base44.asServiceRole.entities.DiscountRedemption.count({ booking_id: booking.id });
        if (!already) {
          await base44.asServiceRole.entities.DiscountRedemption.create({
            discount_code_id: discountRecord.id,
            code: discountRecord.code,
            booking_id: booking.id,
            booking_reference: booking.reference,
            user_id: user.id,
            user_email: user.email,
            recipient_type: discountRecord.recipient_type || '',
            recipient_name: discountRecord.recipient_name || '',
            discount_type: discountRecord.discount_type,
            discount_value: Number(discountRecord.discount_value) || 0,
            discount_amount: discountAmounts.discount_amount,
            gross_total: discountAmounts.gross_total,
            net_total: discountAmounts.final_total,
            redeemed_at: new Date().toISOString(),
          });
        }
      } catch {
        // The booking is already priced and saved; a missing history row must
        // not fail the passenger's confirmed booking.
      }
    }

    return Response.json({ booking });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to create booking.' }, { status: 500 });
  }
}