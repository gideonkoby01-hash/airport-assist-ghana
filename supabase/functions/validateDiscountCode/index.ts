import { adminClient, requireCaller } from '../_shared/auth.ts';
import { evaluateDiscount, normalizeCode, publicDiscountView, round2 } from '../_shared/discounts.ts';
import { json, readBody, serve } from '../_shared/http.ts';

// Passenger-facing preview. The amount is always calculated here from the stored package price.
// Every outcome is a 200 with { valid, message } so the form can show the reason; only a missing
// sign-in is a 401.
serve('validateDiscountCode', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  const body = await readBody(req) as Record<string, any>;
  const code = normalizeCode(body.discount_code);
  const packageCode = String(body.package_code || '').trim();
  const passengers = Math.max(1, Math.min(50, Number(body.num_passengers) || 1));

  if (!code) return json({ valid: false, message: 'Enter a discount code.' });
  if (!packageCode) return json({ valid: false, message: 'Select a service package first.' });

  const { data: pkg } = await admin.from('service_packages').select('price').eq('code', packageCode).eq('active', true).maybeSingle();
  if (!pkg) return json({ valid: false, message: 'That service package is not available.' });
  const gross = round2(Number(pkg.price) * passengers);

  // Codes are admin-private: one exact-match lookup for the code typed, never a list.
  const { data: record } = await admin.from('discount_codes').select('*').eq('code', code).maybeSingle();
  if (!record) return json({ valid: false, message: 'That discount code does not exist.' });

  const { count } = await admin.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('discount_code_id', record.id).eq('user_id', user.id);
  const result = evaluateDiscount({ record, userEmail: user.email, grossTotal: gross, usedByUser: count ?? 0 });
  if (!result.ok) return json({ valid: false, message: result.message });

  return json({ valid: true, message: `Code ${record.code} applied.`, ...publicDiscountView(record, result) });
});
