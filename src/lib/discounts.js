import { formatGHS } from "@/lib/packages";

export function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function codeStatus(record) {
  if (!record) return "missing";
  if (record.active === false) return "inactive";
  const today = new Date().toISOString().slice(0, 10);
  if (record.start_date && today < record.start_date) return "scheduled";
  if (record.expiry_date && today > record.expiry_date) return "expired";
  const max = Number(record.max_uses) || 0;
  if (max > 0 && (Number(record.redemption_count) || 0) >= max) return "exhausted";
  return "active";
}

export const DISCOUNT_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
  scheduled: "Scheduled",
  expired: "Expired",
  exhausted: "Used up",
};

export const DISCOUNT_STATUS_CLASSES = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-200 text-slate-700",
  scheduled: "bg-blue-100 text-blue-800",
  expired: "bg-rose-100 text-rose-700",
  exhausted: "bg-amber-100 text-amber-800",
};

export function discountValueLabel(record) {
  if (!record) return "";
  return record.discount_type === "percentage"
    ? `${Number(record.discount_value) || 0}% off`
    : `${formatGHS(record.discount_value)} off`;
}

export function remainingUses(record) {
  const max = Number(record.max_uses) || 0;
  if (!max) return "Unlimited";
  return String(Math.max(0, max - (Number(record.redemption_count) || 0)));
}

export function eligibilitySummary(record) {
  if (!record) return "";
  if (record.recipient_type === "individual") return record.eligible_email || record.contact_email || "No email set";
  const parts = [];
  if (record.eligible_domain) parts.push(`@${record.eligible_domain}`);
  if ((record.eligible_emails || []).length) parts.push(`${record.eligible_emails.length} approved member(s)`);
  return parts.join(" · ") || "No rule set";
}