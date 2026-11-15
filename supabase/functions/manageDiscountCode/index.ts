import { adminClient, requireCaller } from '../_shared/auth.ts';
import { normalizeCode } from '../_shared/discounts.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `AAG-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}

const cleanList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v || '').trim().toLowerCase()).filter((v) => v.includes('@')).slice(0, 200) : [];

const cleanDomain = (value: unknown): string =>
  String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

// Validates and normalises admin input. Throws a 400 with a readable message.
function buildData(body: Record<string, any>, isCreate: boolean) {
  const code = normalizeCode(body.code);
  const recipientType = body.recipient_type === 'corporation' ? 'corporation' : 'individual';
  const recipientName = String(body.recipient_name || '').trim();
  const discountType = body.discount_type === 'fixed' ? 'fixed' : 'percentage';
  const discountValue = Number(body.discount_value);
  const startDate = String(body.start_date || '').trim();
  const expiryDate = String(body.expiry_date || '').trim();
  const maxUses = Number(body.max_uses);
  const maxPerCustomer = Number(body.max_uses_per_customer);
  const eligibleEmail = String(body.eligible_email || body.contact_email || '').trim().toLowerCase();
  const eligibleDomain = cleanDomain(body.eligible_domain);
  const eligibleEmails = cleanList(body.eligible_emails);

  if (isCreate && !code) throw new HttpError(400, 'Enter a code, or generate one automatically.');
  if (code && !/^[A-Z0-9][A-Z0-9 . _-]{2,39}$/.test(code)) throw new HttpError(400, 'Codes may contain letters, numbers, spaces, dashes and underscores (3-40 characters).');
  if (!recipientName) throw new HttpError(400, 'Enter the individual or corporation name.');
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new HttpError(400, 'Enter a discount value greater than zero.');
  if (discountType === 'percentage' && discountValue > 100) throw new HttpError(400, 'A percentage discount cannot exceed 100%.');
  if (!DATE_RE.test(startDate) || !DATE_RE.test(expiryDate)) throw new HttpError(400, 'Enter a valid start date and expiry date.');
  if (expiryDate < startDate) throw new HttpError(400, 'The expiry date cannot be before the start date.');
  if (!Number.isFinite(maxUses) || maxUses < 0) throw new HttpError(400, 'Maximum total uses must be zero or more.');
  if (!Number.isFinite(maxPerCustomer) || maxPerCustomer < 0) throw new HttpError(400, 'Maximum uses per customer must be zero or more.');
  if (recipientType === 'individual') {
    if (!eligibleEmail) throw new HttpError(400, 'An individual code needs the customer’s account email for eligibility.');
    if (!eligibleEmail.includes('@')) throw new HttpError(400, 'Enter a valid customer email address.');
  } else if (!eligibleDomain && eligibleEmails.length === 0) {
    throw new HttpError(400, 'A corporate code needs an approved email domain or at least one approved member email.');
  }

  return {
    code, recipient_type: recipientType, recipient_name: recipientName,
    contact_name: String(body.contact_name || '').trim(),
    contact_email: String(body.contact_email || '').trim().toLowerCase(),
    contact_phone: String(body.contact_phone || '').trim(),
    description: String(body.description || '').trim(),
    discount_type: discountType, discount_value: discountValue, start_date: startDate, expiry_date: expiryDate,
    max_uses: Math.floor(maxUses), max_uses_per_customer: Math.floor(maxPerCustomer),
    eligible_email: recipientType === 'individual' ? eligibleEmail : '',
    eligible_domain: recipientType === 'corporation' ? eligibleDomain : '',
    eligible_emails: recipientType === 'corporation' ? eligibleEmails : [],
  };
}

const CLASH = 'That code already exists. Codes are case-insensitive.';

serve('manageDiscountCode', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);
  const body = await readBody(req) as Record<string, any>;
  const action = String(body.action || '');

  if (action === 'generate') {
    for (let i = 0; i < 12; i++) {
      const candidate = randomCode();
      const { data } = await admin.from('discount_codes').select('id').eq('code', candidate).limit(1);
      if (!data?.length) return json({ code: candidate });
    }
    throw new HttpError(500, 'Could not generate a unique code. Please try again.');
  }

  if (action === 'create') {
    const data = buildData(body, true);
    const { data: record, error } = await admin.from('discount_codes')
      .insert({ ...data, active: body.active !== false, redemption_count: 0, total_discount_granted: 0, last_claim_token: '', updated_by_id: caller.id })
      .select().single();
    if (error?.code === '23505') throw new HttpError(409, CLASH);
    if (error) throw error;
    return json({ record });
  }

  if (action === 'update' || action === 'toggle' || action === 'delete') {
    const id = String(body.id || '');
    if (!id) throw new HttpError(400, 'id is required');
    const { data: current } = await admin.from('discount_codes').select('*').eq('id', id).maybeSingle();
    if (!current) throw new HttpError(404, 'Discount code not found');

    if (action === 'toggle') {
      const { data: record, error } = await admin.from('discount_codes').update({ active: current.active === false, updated_by_id: caller.id }).eq('id', id).select().single();
      if (error) throw error;
      return json({ record });
    }

    if (action === 'delete') {
      const { count } = await admin.from('discount_redemptions').select('id', { count: 'exact', head: true }).eq('discount_code_id', id);
      if ((Number(current.redemption_count) || 0) > 0 || (count ?? 0) > 0) {
        throw new HttpError(409, 'This code has been redeemed and cannot be deleted. Deactivate it instead.');
      }
      const { error } = await admin.from('discount_codes').delete().eq('id', id);
      if (error) throw error;
      return json({ deleted: true });
    }

    const data = buildData({ ...current, ...body }, false);
    if (data.code !== current.code && (Number(current.redemption_count) || 0) > 0) {
      throw new HttpError(409, 'The code value cannot be changed after it has been redeemed.');
    }
    const { data: record, error } = await admin.from('discount_codes')
      .update({ ...data, active: typeof body.active === 'boolean' ? body.active : current.active !== false, updated_by_id: caller.id })
      .eq('id', id).select().single();
    if (error?.code === '23505') throw new HttpError(409, 'Another code already uses that value.');
    if (error) throw error;
    return json({ record });
  }

  throw new HttpError(400, 'Unknown action');
});
