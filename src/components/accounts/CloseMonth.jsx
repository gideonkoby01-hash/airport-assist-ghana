import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Lock, LockOpen } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGHS } from "@/lib/packages";
import { toCsv } from "@/lib/csv";
import { downloadZip } from "@/lib/zip";
import { useAuth } from "@/lib/AuthContext";
import { notifyError } from "@/lib/notify";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import { JOURNAL_CSV, TRIAL_BALANCE_CSV, balanceSheetRows, monthRange, trialTotals } from "@/lib/books";
import { LoadState, Panel, Pill, fmtMonth, methodLabel, useLoad } from "./shared";

/** Everything an outside accountant or auditor needs for one month, as CSV files in one ZIP. */
async function buildPack(month) {
  const { from, to } = monthRange(month);
  const [journal, tb, bs, payments, expenses, transfers, shifts, payouts] = await Promise.all([
    api.books.journal(from, to), api.books.trialBalance(from, to), api.books.balanceSheet(to), api.finance.ledger(from, to),
    api.entities.Expense.filter({ expense_date: { $gte: from, $lte: to } }, { sort: "expense_date", limit: 5000 }),
    api.books.transfers(from, to), api.books.shiftReports(from, to), api.books.supervisorPayouts(from, to),
  ]);
  const t = trialTotals(tb);
  const income = tb.filter((r) => r.kind === "income").reduce((s, r) => s + Number(r.credit) - Number(r.debit), 0);
  const costs = tb.filter((r) => r.kind === "expense").reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0);
  const summary = [
    `Airport Assist Ghana: month pack for ${fmtMonth(month)} (${from} to ${to})`,
    `Made ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Amounts in Ghana cedis. Books kept on a cash basis.`,
    "",
    `Income: ${income.toFixed(2)}`,
    `Costs: ${costs.toFixed(2)}`,
    `Profit: ${(income - costs).toFixed(2)}`,
    `Trial balance: debits ${t.closingDebit.toFixed(2)}, credits ${t.closingCredit.toFixed(2)} (${t.balanced ? "balanced" : "NOT balanced"})`,
    `Balance sheet at ${to}: assets ${Number(bs.total_assets).toFixed(2)}, liabilities ${Number(bs.total_liabilities).toFixed(2)}, equity ${Number(bs.total_equity).toFixed(2)}`,
    `Shift reports: ${shifts.length} (${shifts.filter((s) => !s.review_status).length} not checked, ${shifts.filter((s) => s.review_status === "queried").length} queried)`,
    "",
    "Files: 1 journal, 2 trial balance, 3 balance sheet, 4 payments, 5 expenses, 6 transfers, 7 supervisor payouts, 8 shift reports.",
  ].join("\r\n");
  const files = [
    { name: "0_summary.txt", text: summary + "\r\n" },
    { name: "1_journal.csv", text: toCsv(journal, JOURNAL_CSV) },
    { name: "2_trial_balance.csv", text: toCsv(tb, TRIAL_BALANCE_CSV) },
    { name: "3_balance_sheet.csv", text: toCsv(balanceSheetRows(bs), [{ key: "section", label: "Section" }, { key: "code", label: "Account" }, { key: "name", label: "Name" }, { key: "amount", label: "Amount (GHS)" }]) },
    { name: "4_payments.csv", text: toCsv(payments, [
      { key: "entry_date", label: "Date" }, { key: "reference", label: "Booking" }, { key: "customer", label: "Customer" }, { key: "package_name", label: "Service" }, { key: "entry_type", label: "Type" },
      { key: "method", label: "Method", value: (r) => methodLabel(r.method) }, { key: "amount", label: "Amount (GHS)" }, { key: "recorded_by", label: "Recorded by" }, { key: "reason", label: "Reason" },
    ]) },
    { name: "5_expenses.csv", text: toCsv((expenses.items || expenses).filter((e) => !e.voided), [
      { key: "expense_date", label: "Date" }, { key: "category", label: "Category", value: (e) => EXPENSE_CATEGORY_LABELS[e.category] || e.category }, { key: "description", label: "Description" },
      { key: "payee", label: "Paid to" }, { key: "method", label: "Method", value: (e) => methodLabel(e.method) }, { key: "reference", label: "Reference" }, { key: "amount", label: "Amount (GHS)" }, { key: "created_by_name", label: "Recorded by" },
    ]) },
    { name: "6_transfers.csv", text: toCsv(transfers.filter((x) => !x.voided), [
      { key: "transfer_date", label: "Date" }, { key: "from_account", label: "From" }, { key: "to_account", label: "To" }, { key: "amount", label: "Amount (GHS)" }, { key: "reference", label: "Reference" }, { key: "note", label: "Note" }, { key: "created_by_name", label: "Recorded by" },
    ]) },
    { name: "7_supervisor_payouts.csv", text: toCsv(payouts, [
      { key: "pay_date", label: "Date" }, { key: "supervisor_name", label: "Supervisor" }, { key: "amount", label: "Amount (GHS)" }, { key: "method", label: "Method", value: (r) => methodLabel(r.method) }, { key: "note", label: "Note" }, { key: "created_by_name", label: "Recorded by" },
    ]) },
    { name: "8_shift_reports.csv", text: toCsv(shifts, [
      { key: "period", label: "Date" }, { key: "shift_type", label: "Shift" }, { key: "supervisor_name", label: "Supervisor" }, { key: "sales", label: "Sales (GHS)" }, { key: "cash_expected", label: "Cash expected (GHS)" },
      { key: "cash_counted", label: "Cash counted (GHS)" }, { key: "variance", label: "Difference (GHS)" }, { key: "review_status", label: "Review" }, { key: "review_note", label: "Review note" },
    ]) },
  ];
  downloadZip(`month_pack_${month.slice(0, 7)}.zip`, files);
}

// Closing a month: check it, export the pack, then lock it so nothing dated in it can be added, changed or cancelled.
export default function CloseMonth({ onGo }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, loading, error, reload } = useLoad(() => api.books.periods(), []);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = selected || (data || []).find((p) => !p.closed && p.month.slice(0, 7) < thisMonth)?.month || null;
  const checks = useLoad(async () => {
    if (!month) return null;
    const { from, to } = monthRange(month);
    const [shifts, tb] = await Promise.all([api.books.shiftReports(from, to), api.books.trialBalance(from, to)]);
    return { unchecked: shifts.filter((s) => !s.review_status).length, queried: shifts.filter((s) => s.review_status === "queried").length, balanced: trialTotals(tb).balanced };
  }, [month]);
  const period = (data || []).find((p) => p.month === month);

  const run = async (what, fn) => {
    setBusy(what);
    try {
      await fn();
    } catch (err) {
      notifyError(err.message || "That did not work. Try again.");
    } finally {
      setBusy("");
    }
  };
  const close = () => run("close", async () => { await api.books.closePeriod(month, note.trim() || null); setNote(""); reload(); });
  const reopen = () => run("reopen", async () => { await api.books.reopenPeriod(month, note.trim()); setNote(""); reload(); });

  return (
    <div className="space-y-5">
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {month && period && (
          <Panel title={`${fmtMonth(month)}${period.closed ? ": closed" : ""}`} note={period.closed ? `Closed by ${period.closed_by_name || "—"} on ${new Date(period.closed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Nothing dated in this month can be added, changed or cancelled.` : "Work down the list, download the pack for the records, then close the month."}>
            <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
              <div className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">Income</span><span className="block font-semibold tabular">{formatGHS(period.income)}</span></div>
              <div className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">Costs</span><span className="block font-semibold tabular">{formatGHS(period.costs)}</span></div>
              <div className="rounded-xl border border-border p-3"><span className="block text-xs text-muted-foreground">Profit</span><span className={`block font-semibold tabular ${Number(period.profit) < 0 ? "text-destructive" : ""}`}>{formatGHS(period.profit)}</span></div>
            </div>
            {!period.closed && (
              <ul className="space-y-2 text-sm mb-4">
                {checks.data ? (
                  <>
                    <Check ok={checks.data.unchecked === 0} text={checks.data.unchecked === 0 ? "Every shift report has been checked" : `${checks.data.unchecked} shift report${checks.data.unchecked === 1 ? "" : "s"} not yet checked`} action={checks.data.unchecked ? () => onGo("shifts") : null} />
                    <Check ok={checks.data.queried === 0} text={checks.data.queried === 0 ? "No shift report is still queried" : `${checks.data.queried} shift report${checks.data.queried === 1 ? " is" : "s are"} still queried`} action={checks.data.queried ? () => onGo("shifts") : null} />
                    <Check ok={checks.data.balanced} text={checks.data.balanced ? "The trial balance balances" : "The trial balance does not balance"} action={() => onGo("trial")} />
                    <Check ok={null} text="Bank, mobile money and cash agree with their statements" action={() => onGo("banking")} />
                    <Check ok={null} text="Every expense and porter payout for the month is recorded" action={() => onGo("expenses")} />
                  </>
                ) : <li className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking the month…</li>}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => run("pack", () => buildPack(month))} disabled={busy === "pack"}>
                {busy === "pack" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />} Download month pack
              </Button>
              {!period.closed && month.slice(0, 7) < thisMonth && (
                <>
                  <Input aria-label="Note for the record (optional)" className="w-full sm:w-64" placeholder="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={close} disabled={busy === "close"}>{busy === "close" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lock className="w-4 h-4 mr-1.5" aria-hidden="true" />} Close {fmtMonth(month)}</Button>
                </>
              )}
              {period.closed && isAdmin && (
                <>
                  <Input aria-label="Why reopen it" className="w-full sm:w-64" placeholder="Why reopen it?" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button variant="outline" onClick={reopen} disabled={busy === "reopen" || note.trim().length < 3}><LockOpen className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reopen</Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">The pack is a ZIP of CSV files that open in Excel: summary, journal, trial balance, balance sheet, payments, expenses, transfers, supervisor payouts and shift reports.{period.closed && !isAdmin ? " Only an admin can reopen a closed month." : ""}</p>
          </Panel>
        )}

        <Panel title="Months" note="The last twelve months. Choose one to check it, download its pack or close it. The current month can be closed once it is over.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Month</th><th className="py-2 pr-3 text-right font-medium">Income</th><th className="py-2 pr-3 text-right font-medium">Costs</th><th className="py-2 pr-3 text-right font-medium">Profit</th><th className="py-2 font-medium">State</th>
              </tr></thead>
              <tbody>
                {(data || []).map((p) => (
                  <tr key={p.month} className={`border-b border-border/60 ${p.month === month ? "bg-accent/5" : ""}`}>
                    <td className="py-2 pr-3"><button type="button" className="font-medium hover:underline underline-offset-2" aria-current={p.month === month ? "true" : undefined} onClick={() => { setSelected(p.month); setNote(""); }}>{fmtMonth(p.month)}</button></td>
                    <td className="py-2 pr-3 text-right tabular">{formatGHS(p.income)}</td>
                    <td className="py-2 pr-3 text-right tabular">{formatGHS(p.costs)}</td>
                    <td className={`py-2 pr-3 text-right tabular font-medium ${Number(p.profit) < 0 ? "text-destructive" : ""}`}>{formatGHS(p.profit)}</td>
                    <td className="py-2">{p.closed ? <Pill tone="good"><Lock className="w-3 h-3" aria-hidden="true" /> Closed</Pill> : p.month.slice(0, 7) === thisMonth ? <Pill>Current month</Pill> : <Pill tone="warn">Open</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </LoadState>
    </div>
  );
}

function Check({ ok, text, action }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Done" />
        : ok === false ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-label="Needs attention" />
          : <span className="w-4 h-4 rounded-full border-2 border-border shrink-0" aria-label="Check by hand" />}
      <span className="flex-1">{text}</span>
      {action && <Button size="sm" variant="ghost" className="h-7" onClick={action}>Open</Button>}
    </li>
  );
}
