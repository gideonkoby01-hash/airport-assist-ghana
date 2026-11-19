import React from "react";
import { Download, ExternalLink } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/packages";
import { EXPENSE_CATEGORY_LABELS, profitAndLoss } from "@/lib/finance";
import { downloadCsv, toCsv } from "@/lib/csv";
import { LoadState, Panel, fmtDate, fmtMonth, useLoad } from "./shared";

const n = (x) => Number(x) || 0;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function Line({ label, amount, bold = false, indent = false, minus = false }) {
  return (
    <tr className={`border-b border-border last:border-0 ${bold ? "font-semibold" : ""}`}>
      <td className={`py-2 pr-3 ${indent ? "pl-5 text-muted-foreground" : ""}`}>{label}</td>
      <td className="py-2 text-right tabular">{minus && n(amount) !== 0 ? "−" : ""}{formatGHS(Math.abs(n(amount)))}</td>
    </tr>
  );
}

export default function ProfitLoss({ from, to }) {
  const { data, loading, error } = useLoad(() => api.finance.summary(from, to), [from, to]);
  const pl = data ? profitAndLoss(data) : null;

  const lines = () => {
    if (!pl) return [];
    return [
      ["Income", ""],
      ["Payments received", data.collected], ["Less refunds given", -n(data.refunds)], ["Net income", pl.netIncome],
      ["Commissions", ""], ["Porter commissions", -n(data.porter_commission)], ["Supervisor commissions", -n(data.supervisor_commission)], ["Gross profit (after commissions)", pl.grossProfit],
      ["Expenses", ""], ...pl.expenseLines.map((e) => [EXPENSE_CATEGORY_LABELS[e.category] || e.category, -e.amount]), ["Total expenses", -pl.operating],
      ["Net profit", pl.netProfit],
    ];
  };

  const exportCsv = () => downloadCsv(`profit_and_loss_${from}_to_${to}.csv`, toCsv(lines().map(([label, amount]) => ({ label, amount })), [{ key: "label", label: "Line" }, { key: "amount", label: "Amount (GHS)" }]));

  // The statement as its own tab, ready to print or save as PDF for the accountant.
  const openStatement = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = lines().map(([label, amount]) => (amount === "" ? `<tr><td colspan="2" class="h">${esc(label)}</td></tr>` : `<tr class="${["Net income", "Gross profit (after commissions)", "Total expenses", "Net profit"].includes(label) ? "t" : ""}"><td>${esc(label)}</td><td class="r">${n(amount) < 0 ? "−" : ""}${esc(formatGHS(Math.abs(n(amount))))}</td></tr>`)).join("");
    win.document.open();
    win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profit and loss ${esc(from)} to ${esc(to)}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#0b213c;margin:32px;max-width:640px}h1{font-size:20px;margin:0 0 4px}p{color:#5a697c;font-size:13px;margin:0 0 18px}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:7px 0;border-bottom:1px solid #e6edf2}.h{font-weight:700;padding-top:16px;color:#0b213c}.r{text-align:right}.t td{font-weight:700;border-top:1px solid #0b213c}small{color:#5a697c;display:block;margin-top:18px}@media print{.no-print{display:none}}</style></head><body><div class="no-print" style="margin-bottom:16px"><button id="p" style="font:600 14px Arial;background:#0b213c;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer">Print or save as PDF</button></div><h1>Profit and loss statement</h1><p>Airport Assist Ghana · ${esc(fmtDate(from))} to ${esc(fmtDate(to))} · Cash basis</p><table>${rows}</table><small>Cash basis: money counts on the day it was recorded. Commissions are those earned in the period. Amounts in Ghana cedis.</small></body></html>`);
    win.document.close();
    win.document.getElementById("p")?.addEventListener("click", () => win.print());
  };

  return (
    <LoadState loading={loading} error={error} hasData={Boolean(data)}>
      {data && pl && (
        <div className="space-y-5">
          <Panel
            title="Profit and loss statement"
            note={`${fmtDate(from)} to ${fmtDate(to)}, on a cash basis: money counts on the day it was recorded.`}
            actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={openStatement}><ExternalLink className="w-4 h-4 mr-1.5" /> Open to print</Button><Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" /> Export</Button></div>}
          >
            <table className="w-full text-sm max-w-2xl">
              <tbody>
                <tr><td colSpan={2} className="pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income</td></tr>
                <Line indent label="Payments received" amount={data.collected} />
                <Line indent label="Less refunds given" amount={data.refunds} minus />
                <Line bold label="Net income" amount={pl.netIncome} />
                <tr><td colSpan={2} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commissions</td></tr>
                <Line indent label="Porter commissions" amount={data.porter_commission} minus />
                <Line indent label="Supervisor commissions" amount={data.supervisor_commission} minus />
                <Line bold label="Gross profit (after commissions)" amount={pl.grossProfit} />
                <tr><td colSpan={2} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</td></tr>
                {pl.expenseLines.length === 0 && <tr><td colSpan={2} className="py-2 pl-5 text-muted-foreground">No expenses recorded.</td></tr>}
                {pl.expenseLines.map((e) => (<Line key={e.category} indent label={EXPENSE_CATEGORY_LABELS[e.category] || e.category} amount={e.amount} minus />))}
                <Line bold label="Total expenses" amount={pl.operating} minus />
                <tr className="border-t-2 border-foreground"><td className="pt-3 text-base font-bold">Net profit</td><td className={`pt-3 text-right text-base font-bold tabular ${pl.netProfit < 0 ? "text-destructive" : ""}`}>{pl.netProfit < 0 ? "−" : ""}{formatGHS(Math.abs(pl.netProfit))}</td></tr>
                {pl.margin !== null && <tr><td className="pt-1 text-xs text-muted-foreground" colSpan={2}>That is {Math.round(pl.margin * 100)}% of net income.</td></tr>}
              </tbody>
            </table>
          </Panel>

          <Panel title="Month by month" note="The last 12 months up to the end of the selected dates.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Month</th><th className="py-2 px-2 text-right font-medium">Received</th><th className="py-2 px-2 text-right font-medium">Refunds</th><th className="py-2 px-2 text-right font-medium">Commissions</th><th className="py-2 px-2 text-right font-medium">Expenses</th><th className="py-2 pl-2 text-right font-medium">Profit</th>
                </tr></thead>
                <tbody>
                  {[...(data.monthly || [])].reverse().map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{fmtMonth(m.month)}</td><td className="py-2 px-2 text-right tabular">{formatGHS(m.collected)}</td><td className="py-2 px-2 text-right tabular">{formatGHS(m.refunds)}</td>
                      <td className="py-2 px-2 text-right tabular">{formatGHS(n(m.porter_commission) + n(m.supervisor_commission))}</td><td className="py-2 px-2 text-right tabular">{formatGHS(m.expenses)}</td>
                      <td className={`py-2 pl-2 text-right tabular font-semibold ${n(m.net) < 0 ? "text-destructive" : ""}`}>{n(m.net) < 0 ? "−" : ""}{formatGHS(Math.abs(n(m.net)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </LoadState>
  );
}
