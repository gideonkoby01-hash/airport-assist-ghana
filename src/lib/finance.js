// Helpers for the Accounts section and the dashboard analytics: date ranges, change figures and the profit and loss statement.

/** @param {string} iso YYYY-MM-DD @param {number} days */
export function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days from `a` to `b`, counting both ends. */
export function daysInclusive(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

export const PERIOD_PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "ytd", label: "This year" },
];

/** The date range for a preset, ending today (UTC dates, as the database uses). */
export function rangeForPreset(key, today) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (key) {
    case "today": return { from: today, to: today };
    case "7d": return { from: shiftDays(today, -6), to: today };
    case "30d": return { from: shiftDays(today, -29), to: today };
    case "90d": return { from: shiftDays(today, -89), to: today };
    case "mtd": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      return { from: first, to: last };
    }
    case "ytd": return { from: `${y}-01-01`, to: today };
    default: return { from: shiftDays(today, -29), to: today };
  }
}

/** Change from `previous` to `current` as a fraction (0.12 = up 12%). null when there is nothing to compare with. */
export function change(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : null;
  return (c - p) / Math.abs(p);
}

/** "+12%", "-4%", "new" (there was nothing before), or "no change". */
export function changeLabel(fraction) {
  if (fraction === null || fraction === undefined) return "new";
  if (Math.abs(fraction) < 0.005) return "no change";
  const pct = Math.round(fraction * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** 1,284 / 12.9K / 4.2M: short numbers for tight places such as axis ticks. */
export function compact(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e4) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString("en-GB");
}
function trim(x) {
  return (Math.round(x * 10) / 10).toString();
}

/** A share of a whole as a whole-number percent, "0%" when the whole is empty. */
export function share(part, whole) {
  const w = Number(whole) || 0;
  return w === 0 ? "0%" : `${Math.round(((Number(part) || 0) / w) * 100)}%`;
}

export const EXPENSE_CATEGORIES = [
  ["salaries", "Salaries and wages"],
  ["rent", "Rent"],
  ["utilities", "Utilities (power, water, internet, phone)"],
  ["transport", "Transport and fuel"],
  ["marketing", "Marketing and advertising"],
  ["equipment", "Equipment and repairs"],
  ["uniforms", "Uniforms"],
  ["licences", "Licences and fees"],
  ["supplies", "Supplies"],
  ["other", "Other"],
];
export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES);

export const EXPENSE_METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["card", "Card"],
  ["bank_transfer", "Bank transfer"],
  ["corporate_account", "Corporate account"],
];

const n = (x) => Number(x) || 0;

/**
 * The profit and loss statement for a finance summary, on a cash basis: money received less refunds, less what the
 * business paid out or owes out (porter and supervisor commissions, expenses). Every line is a plain number.
 */
export function profitAndLoss(summary) {
  const s = summary || {};
  const income = [
    { label: "Payments received", amount: n(s.collected) },
    { label: "Refunds given", amount: -n(s.refunds) },
  ];
  const netIncome = n(s.collected) - n(s.refunds);
  const costs = [
    { label: "Porter commissions", amount: n(s.porter_commission) },
    { label: "Supervisor commissions", amount: n(s.supervisor_commission) },
  ];
  const expenseLines = (s.expenses_by_category || []).map((c) => ({ category: c.category, amount: n(c.amount) }));
  const commissions = n(s.porter_commission) + n(s.supervisor_commission);
  const operating = n(s.expenses);
  const grossProfit = netIncome - commissions;
  const netProfit = grossProfit - operating;
  return {
    income, netIncome, costs, commissions, grossProfit, expenseLines, operating, netProfit,
    margin: netIncome > 0 ? netProfit / netIncome : null,
  };
}

/** Totals for the aged receivables list, by bucket. */
export function agingTotals(rows) {
  const order = ["not_due", "0-7", "8-30", "31-60", "60+"];
  const totals = Object.fromEntries(order.map((k) => [k, { count: 0, amount: 0 }]));
  for (const r of rows || []) {
    const t = totals[r.bucket] || (totals[r.bucket] = { count: 0, amount: 0 });
    t.count += 1;
    t.amount += n(r.outstanding_balance);
  }
  return { order, totals, count: (rows || []).length, amount: Object.values(totals).reduce((a, t) => a + t.amount, 0) };
}

/**
 * Money received split the way the till is counted: cash, and POS (mobile money plus card). Pay-on-account is kept apart.
 * `byMethod` is the list from the finance summary or analytics: [{ method, collected?, refunds?, net }]. `field` picks the amount:
 * "net" (default, after refunds) or "collected" (before refunds).
 */
export function receivedByChannel(byMethod, field = "net") {
  const net = (m) => (byMethod || []).filter((x) => x.method === m).reduce((t, x) => t + (Number(x[field]) || 0), 0);
  const cash = net("cash");
  const mobile = net("mobile_money");
  const card = net("card");
  const account = net("corporate_account");
  const pos = mobile + card;
  return { cash, pos, mobile, card, account, total: cash + pos + account };
}
