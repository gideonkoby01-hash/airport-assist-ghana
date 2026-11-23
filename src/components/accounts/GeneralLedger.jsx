import React, { useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";
import { KIND_LABELS, KINDS, SOURCE_LABELS } from "@/lib/books";
import { Amt, LoadState, Panel, fmtDate, useChart, useLoad } from "./shared";

// One account at a time: its opening balance, every entry in the period and the balance after each.
export default function GeneralLedger({ from, to, initialCode = "1000" }) {
  const chart = useChart();
  const [code, setCode] = useState(initialCode);
  const { data, loading, error } = useLoad(() => api.books.accountLedger(code, from, to), [code, from, to]);
  const account = (chart.data || []).find((a) => a.code === code);
  const rows = data || [];
  const closing = rows.length ? rows[rows.length - 1].balance : 0;
  const moves = rows.filter((r) => r.source !== "opening");

  const exportCsv = () => downloadCsv(`ledger_${code}_${from}_to_${to}.csv`, toCsv(rows, [
    { key: "entry_date", label: "Date" }, { key: "source", label: "Type", value: (r) => (r.source === "opening" ? "Opening balance" : SOURCE_LABELS[r.source] || r.source) },
    { key: "reference", label: "Reference" }, { key: "memo", label: "Description" }, { key: "debit", label: "Debit (GHS)" }, { key: "credit", label: "Credit (GHS)" }, { key: "balance", label: "Balance (GHS)" },
  ]));

  return (
    <Panel
      title="General ledger"
      note="Pick an account to see everything that went through it. Assets and expenses grow with debits; liabilities, equity and income grow with credits."
      actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export</Button>}
    >
      <div className="max-w-md mb-4">
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger aria-label="Account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => {
              const list = (chart.data || []).filter((a) => a.kind === k);
              return list.length ? (
                <React.Fragment key={k}>
                  <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{KIND_LABELS[k]}</div>
                  {list.map((a) => (<SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>))}
                </React.Fragment>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4 text-sm">
          <p><span className="text-muted-foreground">Opening</span> <strong className="tabular">{Number(rows[0]?.balance || 0).toFixed(2)}</strong></p>
          <p><span className="text-muted-foreground">Debits</span> <strong className="tabular">{moves.reduce((t, r) => t + Number(r.debit || 0), 0).toFixed(2)}</strong></p>
          <p><span className="text-muted-foreground">Credits</span> <strong className="tabular">{moves.reduce((t, r) => t + Number(r.credit || 0), 0).toFixed(2)}</strong></p>
          <p><span className="text-muted-foreground">Closing</span> <strong className="tabular">{Number(closing || 0).toFixed(2)}</strong>{account ? <span className="text-muted-foreground"> · {account.name}</span> : null}</p>
        </div>
        {moves.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nothing went through this account in the period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Entry</th>
                <th className="py-2 pr-3 text-right font-medium">Debit</th><th className="py-2 pr-3 text-right font-medium">Credit</th><th className="py-2 text-right font-medium">Balance</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 align-top ${r.source === "opening" ? "bg-secondary/40" : ""}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.source === "opening" ? fmtDate(from) : fmtDate(r.entry_date)}</td>
                    <td className="py-2 pr-3">
                      <span className="block">{r.source === "opening" ? "Opening balance" : SOURCE_LABELS[r.source] || r.source}{r.reference ? <span className="font-mono text-xs text-muted-foreground"> · {r.reference}</span> : null}</span>
                      {r.source !== "opening" && <span className="block text-xs text-muted-foreground">{r.memo}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right"><Amt value={r.debit} /></td>
                    <td className="py-2 pr-3 text-right"><Amt value={r.credit} /></td>
                    <td className={`py-2 text-right tabular font-medium ${Number(r.balance) < 0 ? "text-destructive" : ""}`}>{Number(r.balance || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}
