import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceColumns, balanceSheetRows, checkJournal, groupEntries, monthRange, reconcile, trialTotals } from "./books.js";

test("journal lines group into one entry per record, in order", () => {
  const entries = groupEntries([
    { source: "payment", source_id: "p1", entry_date: "2026-11-20", account_code: "1000", debit: 700, credit: 0 },
    { source: "payment", source_id: "p1", entry_date: "2026-11-20", account_code: "4000", debit: 0, credit: 700 },
    { source: "expense", source_id: "e1", entry_date: "2026-11-19", account_code: "6010", debit: 400, credit: 0 },
    { source: "expense", source_id: "e1", entry_date: "2026-11-19", account_code: "1030", debit: 0, credit: 400 },
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].source, "payment");
  assert.deepEqual([entries[0].debit, entries[0].credit], [700, 700]);
  assert.equal(entries[1].lines.length, 2);
});

test("a manual entry must balance and use one column per line", () => {
  const ok = checkJournal([{ account: "1030", debit: "5000", credit: "" }, { account: "3000", debit: "", credit: "5000" }, { account: "", debit: "", credit: "" }]);
  assert.equal(ok.error, "");
  assert.equal(ok.lines.length, 2);
  assert.deepEqual(ok.lines[1], { account: "3000", debit: 0, credit: 5000, memo: undefined });

  assert.match(checkJournal([{ account: "1030", debit: 10 }, { account: "3000", credit: 9.5 }]).error, /out by 0.50/);
  assert.match(checkJournal([{ account: "1030", debit: 10, credit: 10 }, { account: "3000", credit: 0 }]).error, /not both/);
  assert.match(checkJournal([{ account: "", debit: 10 }, { account: "3000", credit: 10 }]).error, /Choose an account/);
  assert.match(checkJournal([{ account: "1030", debit: 10 }]).error, /two lines/);
  // pennies do not drift
  assert.equal(checkJournal([{ account: "1", debit: 0.1 }, { account: "1", debit: 0.2 }, { account: "2", credit: 0.3 }]).error, "");
});

test("trial balance totals and closing columns", () => {
  const rows = [
    { code: "1000", kind: "asset", debit: 1400, credit: 1100, closing: 300 },
    { code: "2000", kind: "liability", debit: 0, credit: 90, closing: 90 },
    { code: "4000", kind: "income", debit: 0, credit: 1400, closing: 1400 },
    { code: "5000", kind: "expense", debit: 90, credit: 0, closing: 90 },
    { code: "1030", kind: "asset", debit: 1100, credit: 0, closing: 1100 },
  ];
  const t = trialTotals(rows);
  assert.equal(t.debit, 2590);
  assert.equal(t.credit, 2590);
  assert.equal(t.closingDebit, 1490);
  assert.equal(t.closingCredit, 1490);
  assert.equal(t.balanced, true);
  assert.deepEqual(balanceColumns({ kind: "asset", closing: -50 }), { dr: 0, cr: 50 }); // an overdrawn account
  assert.deepEqual(balanceColumns({ kind: "liability", closing: 90 }), { dr: 0, cr: 90 });
});

test("month range", () => {
  assert.deepEqual(monthRange("2026-02-14"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02-01"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-12-31"), { from: "2026-12-01", to: "2026-12-31" });
});

test("reconciliation difference", () => {
  assert.equal(reconcile(5600, ""), null);
  assert.deepEqual(reconcile(5600, "5600"), { difference: 0, matched: true });
  assert.deepEqual(reconcile(5600, "5550.5"), { difference: -49.5, matched: false });
});

test("balance sheet rows for the CSV", () => {
  const rows = balanceSheetRows({
    assets: [{ code: "1000", name: "Cash", amount: 300 }], liabilities: [], equity: [{ code: "3000", name: "Capital", amount: 200 }],
    profit_to_date: 100, total_assets: 300, total_liabilities: 0, total_equity: 300,
  });
  assert.equal(rows[0].section, "Assets");
  assert.ok(rows.some((r) => r.name === "Total equity" && r.amount === 300));
  assert.ok(rows.some((r) => /Profit to date/.test(r.name) && r.amount === 100));
});
