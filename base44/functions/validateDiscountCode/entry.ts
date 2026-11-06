import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  normalizeCode,
  evaluateDiscount,
  publicDiscountView,
  firstRecord,
  round2,
} from '../../shared/discounts.ts';

// Passenger-facing preview. The amount is always calculated here, from the
// stored package price, and never taken from the browser.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ valid: false, message: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.discount_code);
    const packageCode = String(body.package_code || '').trim();
    const passengers = Math.max(1, Math.min(50, Number(body.num_passengers) || 1));

    if (!code) return Response.json({ valid: false, message: 'Enter a discount code.' }, { status: 400 });
    if (!packageCode) {
      return Response.json({ valid: false, message: 'Select a service package first.' }, { status: 400 });
    }

    const pkgPage = await base44.entities.ServicePackage.filter({ code: packageCode, active: true });
    const pkg = firstRecord(pkgPage);
    if (!pkg) {
      return Response.json({ valid: false, message: 'That service package is not available.' }, { status: 400 });
    }

    const gross = round2(Number(pkg.price) * passengers);

    // Discount codes are admin-private: the passenger never lists them, this is
    // a single exact-match lookup for the code they typed.
    const found = await base44.asServiceRole.entities.DiscountCode.filter({ code });
    const record = firstRecord(found);
    if (!record) return Response.json({ valid: false, message: 'That discount code does not exist.' });

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

    if (!result.ok) return Response.json({ valid: false, message: result.message });

    return Response.json({
      valid: true,
      message: `Code ${record.code} applied.`,
      ...publicDiscountView(record, result),
    });
  } catch (error) {
    return Response.json(
      { valid: false, message: error.message || 'Could not validate that code right now.' },
      { status: 500 }
    );
  }
}