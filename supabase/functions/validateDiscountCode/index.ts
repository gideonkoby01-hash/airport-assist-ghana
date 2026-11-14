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

  // Guessing is throttled: after 10 failed attempts in 15 minutes the person must wait.
  const tries = await admin.rpc('rate_limit_count', { p_key: `discount:${user.id}`, p_window_seconds: 900 });
  if ((tries.data ?? 0) >= 10) return json({ valid: false, message: 'Too many attempts. Please wait a few minutes and try again.' });
  // One message for every way a code can fail, so codes cannot be probed.
  const refuse = async (reason: string) => {
    console.log(`validateDiscountCode: ${code} refused for ${user.id}: ${reason}`);
    await admin.rpc('hit_rate_limit', { p_key: `discount:${user.id}`, p_window_seconds: 900 });
    return json({ valid: false, message: "That discount code isn't valid for your account or this booking. Check the code, or contact Airport Assist." });
  };
  if (!packageCode) return json({ valid: false, message: 'Select a service package first.' });

  const { data: pkg } = await admin.from('service_packages').select('price').eq('code', packageCode).eq('active', true).maybeSingle();
  if (!pkg) return json({ valid: false, message: 'That service package is not available.' });
  const gross = round2(Number(pkg.price) * passengers);

  // Codes are admin-private: one exact-match lookup for the code typed, never a list.
  const { data: record } = await admin.from('discount_codes').select('*').eq('code', code).maybeSingle();
  if (!record) return await refuse('does not exist');

  const { count } = await admin.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('discount_code_id', record.id).eq('user_id', user.id);
  const result = evaluateDiscount({ record, userEmail: user.email, grossTotal: gross, usedByUser: count ?? 0 });
  if (!result.ok) return await refuse(result.message);

  return json({ valid: true, message: `Code ${record.code} applied.`, ...publicDiscountView(record, result) });
});
