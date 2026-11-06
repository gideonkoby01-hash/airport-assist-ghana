// Shared discount rules used by every server-side discount or booking function.
// One implementation only: preview validation and final booking creation must
// never disagree, and the client's arithmetic is never trusted.

// Entity filters return either a plain array (no options) or a page object
// ({ items, next_cursor }); normalize both so lookups never silently miss.
export function asList(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return Array.isArray(result.items) ? result.items : [];
}

export function firstRecord(result) {
  return asList(result)[0] || null;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Codes are case-insensitive and space-trimmed: store and compare the normalized form.
export function normalizeCode(raw) {
  return String(raw == null ? "" : raw).replace(/\s+/g, " ").trim().toUpperCase();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// The discount applies to the WHOLE booking total and can never exceed it.
export function computeDiscount(grossTotal, discountType, discountValue) {
  const gross = round2(grossTotal);
  const value = Number(discountValue) || 0;
  let amount = discountType === "percentage" ? round2((gross * value) / 100) : round2(value);
  if (!Number.isFinite(amount) || amount < 0) amount = 0;
  if (amount > gross) amount = gross;
  amount = round2(amount);
  return { gross_total: gross, discount_amount: amount, final_total: round2(gross - amount) };
}

export function codeStatus(record) {
  if (!record) return "missing";
  if (record.active === false) return "inactive";
  const today = todayISO();
  if (record.start_date && today < String(record.start_date).slice(0, 10)) return "scheduled";
  if (record.expiry_date && today > String(record.expiry_date).slice(0, 10)) return "expired";
  const max = Number(record.max_uses) || 0;
  if (max > 0 && (Number(record.redemption_count) || 0) >= max) return "exhausted";
  return "active";
}

function normalizeEmail(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function emailDomain(email) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

// Eligibility is decided only from the authenticated account, never from a
// company name the passenger typed into a form.
function checkEligibility(record, userEmail) {
  const email = normalizeEmail(userEmail);
  if (!email) {
    return "Please verify your account email before applying a discount code.";
  }

  if (record.recipient_type === "individual") {
    const target = normalizeEmail(record.eligible_email || record.contact_email || "");
    if (!target) {
      return "This code is not configured for online redemption. Please contact Airport Assist.";
    }
    if (email !== target) {
      return "This discount code is reserved for a different customer.";
    }
    return null;
  }

  const domain = normalizeEmail(record.eligible_domain).replace(/^@/, "");
  const approved = Array.isArray(record.eligible_emails)
    ? record.eligible_emails.map((e) => normalizeEmail(e))
    : [];

  const domainAllowed = domain !== "" && emailDomain(email) === domain;
  const memberAllowed = approved.includes(email);

  if (!domainAllowed && !memberAllowed) {
    return `This corporate code is reserved for approved members of ${record.recipient_name || "the corporation"}.`;
  }
  return null;
}

// Full validation used for both the passenger preview and the final booking.
export function evaluateDiscount({ record, userEmail, grossTotal, usedByUser }) {
  if (!record) return { ok: false, message: "That discount code does not exist." };

  const status = codeStatus(record);
  if (status === "inactive") return { ok: false, message: "This discount code is not active." };
  if (status === "scheduled") {
    return { ok: false, message: `This discount code is not valid until ${record.start_date}.` };
  }
  if (status === "expired") return { ok: false, message: "This discount code has expired." };
  if (status === "exhausted") {
    return { ok: false, message: "This discount code has reached its maximum number of uses." };
  }

  const perCustomer = Number(record.max_uses_per_customer) || 0;
  if (perCustomer > 0 && (Number(usedByUser) || 0) >= perCustomer) {
    return { ok: false, message: "You have already used this discount code the maximum number of times." };
  }

  const eligibilityError = checkEligibility(record, userEmail);
  if (eligibilityError) return { ok: false, message: eligibilityError };

  const { gross_total, discount_amount, final_total } = computeDiscount(
    grossTotal,
    record.discount_type,
    record.discount_value
  );

  if (discount_amount <= 0) {
    return { ok: false, message: "This discount code has no value against the current booking total." };
  }

  return { ok: true, gross_total, discount_amount, final_total };
}

// Only the fields a passenger needs to see — never contact details or internal notes.
export function publicDiscountView(record, amounts) {
  return {
    code: record.code,
    discount_type: record.discount_type,
    discount_value: Number(record.discount_value) || 0,
    recipient_type: record.recipient_type,
    recipient_name: record.recipient_name || "",
    gross_total: amounts.gross_total,
    discount_amount: amounts.discount_amount,
    final_total: amounts.final_total,
  };
}