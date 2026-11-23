// Helpers for the double-entry books: labels, grouping the journal into entries, checking a manual entry balances,
// and the CSV files of the month pack. Pure functions, tested in books.test.mjs.

export const KIND_LABELS = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
export const KINDS = ["asset", "liability", "equity", "income", "expense"];

/** Where money sits. Transfers move money between these. */
export const MONEY_ACCOUNTS = ["1000", "1010", "1020", "1030", "1100"];

export const SOURCE_LABELS = {
  payment: "Payment received",
  refund: "Refund",
  expense: "Expense",
  porter_commission: "Porter commission earned",
  porter_payout: "Porter paid",
  supervisor_commission: "Supervisor commission earned",
  supervisor_payout: "Supervisor paid",
  transfer: "Transfer",
  journal: "Journal entry",
};

/** Common transfers, so the accountant picks "Cash banked" instead of two account numbers. */
export const TRANSFER_PRESETS = [
  { key: "bank_cash", label: "Cash banked", from: "1000", to: "1030" },
  { key: "momo_bank", label: "Mobile money moved to the bank", from: "1010", to: "1030" },
  { key: "card_settled", label: "Card and online takings settled into the bank", from: "1020", to: "1030" },
  { key: "corporate_paid", label: "Corporate customer paid into the bank", from: "1100", to: "1030" },
  { key: "bank_cash_out", label: "Cash drawn from the bank", from: "1030", to: "1000" },
  { key: "custom", label: "Other transfer", from: "", to: "" },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Debit-side accounts (assets, expenses) grow with debits; the others grow with credits. */
export const isDebitSide = (kind) => kind === "asset" || kind === "expense";

/**
 * The journal comes back one line per account. Group the lines of each source record into one entry, keeping the
 * order they arrived in (newest first).
 */
export function groupEntries(lines) {
  const map = new Map();
  for (const l of lines || []) {
    const key = `${l.source}:${l.source_id}`;
    if (!map.has(key)) {
      map.set(key, { key, entry_date: l.entry_date, source: l.source, source_id: l.source_id, reference: l.reference, memo: l.memo, lines: [], debit: 0, credit: 0 });
    }
    const e = map.get(key);
    e.lines.push(l);
    e.debit = round2(e.debit + Number(l.debit || 0));
    e.credit = round2(e.credit + Number(l.credit || 0));
  }
  return [...map.values()];
}

/**
 * Check the lines typed into a manual journal entry. Returns { lines, debit, credit, difference, error } where `lines`
 * is what the database wants ({ account, debit, credit, memo }) with empty rows dropped.
 */
export function checkJournal(rows) {
  const lines = [];
  for (const r of rows || []) {
    const debit = round2(r.debit);
    const credit = round2(r.credit);
    if (!r.account && !debit && !credit) continue;
    if (!r.account) return { lines, debit: 0, credit: 0, difference: 0, error: "Choose an account on every line that has an amount." };
    if (debit < 0 || credit < 0) return { lines, debit: 0, credit: 0, difference: 0, error: "Amounts cannot be negative." };
    if ((debit > 0) === (credit > 0)) return { lines, debit: 0, credit: 0, difference: 0, error: "Put each amount in either the debit or the credit column, not both." };
    lines.push({ account: r.account, debit, credit, memo: (r.memo || "").trim() || undefined });
  }
  const debit = round2(lines.reduce((t, l) => t + l.debit, 0));
  const credit = round2(lines.reduce((t, l) => t + l.credit, 0));
  const difference = round2(debit - credit);
  let error = "";
  if (lines.length < 2) error = "An entry needs at least two lines.";
  else if (difference !== 0) error = `The entry is out by ${Math.abs(difference).toFixed(2)}: debits and credits must be equal.`;
  return { lines, debit, credit, difference, error };
}

/** Totals of a trial balance and whether it balances. */
export function trialTotals(rows) {
  const debit = round2((rows || []).reduce((t, r) => t + Number(r.debit || 0), 0));
  const credit = round2((rows || []).reduce((t, r) => t + Number(r.credit || 0), 0));
  // Closing balances laid out in debit and credit columns, as a trial balance is usually read.
  let dr = 0;
  let cr = 0;
  for (const r of rows || []) {
    const signed = isDebitSide(r.kind) ? Number(r.closing || 0) : -Number(r.closing || 0); // + is a debit balance
    if (signed >= 0) dr += signed;
    else cr -= signed;
  }
  return { debit, credit, closingDebit: round2(dr), closingCredit: round2(cr), balanced: debit === credit && round2(dr) === round2(cr) };
}

/** A closing balance shown in the debit or credit column of a trial balance. */
export function balanceColumns(row) {
  const signed = isDebitSide(row.kind) ? Number(row.closing || 0) : -Number(row.closing || 0);
  return signed >= 0 ? { dr: round2(signed), cr: 0 } : { dr: 0, cr: round2(-signed) };
}

/** First and last day of the month that `iso` (YYYY-MM-DD) is in. */
export function monthRange(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const from = `${iso.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** The difference between what the books say and what the bank or wallet statement says. */
export function reconcile(bookBalance, statementBalance) {
  if (statementBalance === "" || statementBalance === null || statementBalance === undefined || Number.isNaN(Number(statementBalance))) return null;
  const diff = round2(Number(statementBalance) - Number(bookBalance || 0));
  return { difference: diff, matched: diff === 0 };
}

export const JOURNAL_CSV = [
  { key: "entry_date", label: "Date" },
  { key: "source", label: "Type", value: (r) => SOURCE_LABELS[r.source] || r.source },
  { key: "reference", label: "Reference" },
  { key: "memo", label: "Description" },
  { key: "account_code", label: "Account" },
  { key: "account_name", label: "Account name" },
  { key: "debit", label: "Debit (GHS)" },
  { key: "credit", label: "Credit (GHS)" },
];

export const TRIAL_BALANCE_CSV = [
  { key: "code", label: "Account" },
  { key: "name", label: "Name" },
  { key: "kind", label: "Type", value: (r) => KIND_LABELS[r.kind] || r.kind },
  { key: "opening", label: "Opening (GHS)" },
  { key: "debit", label: "Debits (GHS)" },
  { key: "credit", label: "Credits (GHS)" },
  { key: "closing", label: "Closing (GHS)" },
  { key: "dr", label: "Closing debit (GHS)", value: (r) => balanceColumns(r).dr },
  { key: "cr", label: "Closing credit (GHS)", value: (r) => balanceColumns(r).cr },
];

/** The balance sheet as rows for a CSV file. */
export function balanceSheetRows(bs) {
  const rows = [];
  const section = (title, items, total) => {
    rows.push({ section: title, code: "", name: "", amount: "" });
    for (const i of items || []) rows.push({ section: "", code: i.code, name: i.name, amount: i.amount });
    rows.push({ section: "", code: "", name: `Total ${title.toLowerCase()}`, amount: total });
  };
  section("Assets", bs.assets, bs.total_assets);
  section("Liabilities", bs.liabilities, bs.total_liabilities);
  const equity = [...(bs.equity || []), { code: "", name: "Profit to date (not yet moved to retained earnings)", amount: bs.profit_to_date }];
  section("Equity", equity, bs.total_equity);
  return rows;
}
