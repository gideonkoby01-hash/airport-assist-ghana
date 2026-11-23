import React, { useState } from "react";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/csv";
import { KIND_LABELS, KINDS, TRIAL_BALANCE_CSV, balanceColumns, trialTotals } from "@/lib/books";
import { Amt, LoadState, Panel, fmtDate, useLoad } from "./shared";

// Every account with its balance: the proof that the books add up. Click an account to open its ledger.
export default function TrialBalance({ from, to, onOpenAccount }) {
  const { data, loading, error } = useLoad(() => api.books.trialBalance(from, to), [from, to]);
  const [showEmpty, setShowEmpty] = useState(false);
  const rows = (data || []).filter((r) => showEmpty || Number(r.opening) || Number(r.debit) || Number(r.credit) || Number(r.closing));
  const t = trialTotals(data);

  const exportCsv = () => downloadCsv(`trial_balance_${from}_to_${to}.csv`, toCsv(data || [], TRIAL_BALANCE_CSV));

  return (
    <Panel
      title="Trial balance"
      note={`Balances at ${fmtDate(to)}, with the movement since ${fmtDate(from)}. The two closing columns must be equal.`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show empty accounts</label>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.length}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export</Button>
        </div>
      }
    >
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        <p className={`flex items-center gap-2 text-sm mb-4 ${t.balanced ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
          {t.balanced ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
          {t.balanced ? "The books balance." : "The books do not balance. Tell the developer: this should never happen."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2 pr-3 text-right font-medium">Opening</th>
              <th className="py-2 pr-3 text-right font-medium">Debits</th>
              <th className="py-2 pr-3 text-right font-medium">Credits</th>
              <th className="py-2 pr-3 text-right font-medium border-l border-border pl-3">Debit balance</th>
              <th className="py-2 text-right font-medium">Credit balance</th>
            </tr></thead>
            {KINDS.map((k) => {
              const list = rows.filter((r) => r.kind === k);
              if (!list.length) return null;
              return (
                <tbody key={k}>
                  <tr><th colSpan={6} className="pt-4 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABELS[k]}</th></tr>
                  {list.map((r) => {
                    const c = balanceColumns(r);
                    return (
                      <tr key={r.code} className="border-b border-border/60">
                        <td className="py-1.5 pr-3">
                          <button type="button" className="text-left hover:underline underline-offset-2" onClick={() => onOpenAccount?.(r.code)}>
                            <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                          </button>
                        </td>
                        <td className="py-1.5 pr-3 text-right"><Amt value={r.opening} /></td>
                        <td className="py-1.5 pr-3 text-right"><Amt value={r.debit} /></td>
                        <td className="py-1.5 pr-3 text-right"><Amt value={r.credit} /></td>
                        <td className="py-1.5 pr-3 text-right border-l border-border pl-3"><Amt value={c.dr} strong /></td>
                        <td className="py-1.5 text-right"><Amt value={c.cr} strong /></td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            <tfoot><tr className="border-t-2 border-foreground/30 font-semibold">
              <td className="pt-2 pr-3">Totals</td><td />
              <td className="pt-2 pr-3 text-right tabular">{t.debit.toFixed(2)}</td>
              <td className="pt-2 pr-3 text-right tabular">{t.credit.toFixed(2)}</td>
              <td className="pt-2 pr-3 text-right tabular border-l border-border pl-3">{t.closingDebit.toFixed(2)}</td>
              <td className="pt-2 text-right tabular">{t.closingCredit.toFixed(2)}</td>
            </tr></tfoot>
          </table>
        </div>
      </LoadState>
    </Panel>
  );
}
