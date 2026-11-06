import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { normalizeCode, asList } from '../../shared/discounts.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function randomCode() {
  let body = '';
  for (let i = 0; i < 6; i += 1) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `AAG-${body}`;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.includes('@'))
    .slice(0, 200);
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

// Validates and normalizes admin input. Returns { error } or { data }.
function buildData(body, isCreate) {
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

  if (isCreate && !code) return { error: 'Enter a code, or generate one automatically.' };
  if (code && !/^[A-Z0-9][A-Z0-9 . _-]{2,39}$/.test(code)) {
    return { error: 'Codes may contain letters, numbers, spaces, dashes and underscores (3-40 characters).' };
  }
  if (!recipientName) return { error: 'Enter the individual or corporation name.' };
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { error: 'Enter a discount value greater than zero.' };
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return { error: 'A percentage discount cannot exceed 100%.' };
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(expiryDate)) {
    return { error: 'Enter a valid start date and expiry date.' };
  }
  if (expiryDate < startDate) return { error: 'The expiry date cannot be before the start date.' };
  if (!Number.isFinite(maxUses) || maxUses < 0) return { error: 'Maximum total uses must be zero or more.' };
  if (!Number.isFinite(maxPerCustomer) || maxPerCustomer < 0) {
    return { error: 'Maximum uses per customer must be zero or more.' };
  }

  if (recipientType === 'individual') {
    if (!eligibleEmail) {
      return { error: 'An individual code needs the customer\u2019s account email for eligibility.' };
    }
    if (!eligibleEmail.includes('@')) return { error: 'Enter a valid customer email address.' };
  } else if (!eligibleDomain && eligibleEmails.length === 0) {
    return { error: 'A corporate code needs an approved email domain or at least one approved member email.' };
  }

  return {
    data: {
      code,
      recipient_type: recipientType,
      recipient_name: recipientName,
      contact_name: String(body.contact_name || '').trim(),
      contact_email: String(body.contact_email || '').trim().toLowerCase(),
      contact_phone: String(body.contact_phone || '').trim(),
      description: String(body.description || '').trim(),
      discount_type: discountType,
      discount_value: discountValue,
      start_date: startDate,
      expiry_date: expiryDate,
      max_uses: Math.floor(maxUses),
      max_uses_per_customer: Math.floor(maxPerCustomer),
      eligible_email: recipientType === 'individual' ? eligibleEmail : '',
      eligible_domain: recipientType === 'corporation' ? eligibleDomain : '',
      eligible_emails: recipientType === 'corporation' ? eligibleEmails : [],
    },
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'generate') {
      for (let i = 0; i < 12; i += 1) {
        const candidate = randomCode();
        const existing = await base44.asServiceRole.entities.DiscountCode.filter({ code: candidate });
        if (asList(existing).length === 0) return Response.json({ code: candidate });
      }
      return Response.json({ error: 'Could not generate a unique code. Please try again.' }, { status: 500 });
    }

    if (action === 'create') {
      const parsed = buildData(body, true);
      if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });

      const existing = await base44.asServiceRole.entities.DiscountCode.filter({ code: parsed.data.code });
      if (asList(existing).length > 0) {
        return Response.json({ error: 'That code already exists. Codes are case-insensitive.' }, { status: 409 });
      }

      const record = await base44.asServiceRole.entities.DiscountCode.create({
        ...parsed.data,
        active: body.active === false ? false : true,
        redemption_count: 0,
        total_discount_granted: 0,
        last_claim_token: '',
      });
      return Response.json({ record });
    }

    if (action === 'update' || action === 'toggle' || action === 'delete') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const current = await base44.asServiceRole.entities.DiscountCode.get(id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (!current) return Response.json({ error: 'Discount code not found' }, { status: 404 });

      if (action === 'toggle') {
        const next = current.active === false;
        const record = await base44.asServiceRole.entities.DiscountCode.update(id, { active: next });
        return Response.json({ record });
      }

      if (action === 'delete') {
        const used = await base44.asServiceRole.entities.DiscountRedemption.count({ discount_code_id: id });
        if ((Number(current.redemption_count) || 0) > 0 || used > 0) {
          return Response.json(
            { error: 'This code has been redeemed and cannot be deleted. Deactivate it instead.' },
            { status: 409 }
          );
        }
        await base44.asServiceRole.entities.DiscountCode.delete(id);
        return Response.json({ deleted: true });
      }

      // update
      const parsed = buildData({ ...current, ...body }, false);
      if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });

      if (parsed.data.code !== current.code && (Number(current.redemption_count) || 0) > 0) {
        return Response.json(
          { error: 'The code value cannot be changed after it has been redeemed.' },
          { status: 409 }
        );
      }

      const clash = await base44.asServiceRole.entities.DiscountCode.filter({ code: parsed.data.code });
      const other = asList(clash).find((r) => r.id !== id);
      if (other) return Response.json({ error: 'Another code already uses that value.' }, { status: 409 });

      const record = await base44.asServiceRole.entities.DiscountCode.update(id, {
        ...parsed.data,
        active: typeof body.active === 'boolean' ? body.active : current.active !== false,
      });
      return Response.json({ record });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Discount action failed.' }, { status: 500 });
  }
}