import React from "react";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/packages";
import { downloadCsv, toCsv } from "@/lib/csv";
import { balanceSheetRows } from "@/lib/books";
import { LoadState, Panel, fmtDate, useLoad } from "./shared";

function Section({ title, items, total, extra = null }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h4>
      <dl className="text-sm">
        {(items || []).map((i) => (
          <div key={i.code} className="flex justify-between gap-3 py-1.5 border-b border-border/60">
            <dt><span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.name}</dt>
            <dd className={`tabular ${Number(i.amount) < 0 ? "text-destructive" : ""}`}>{formatGHS(i.amount)}</dd>
          </div>
        ))}
        {extra}
        {!items?.length && !extra && <p className="py-1.5 text-muted-foreground">None</p>}
        <div className="flex justify-between gap-3 pt-2 font-semibold"><dt>Total {title.toLowerCase()}</dt><dd className="tabular">{formatGHS(total)}</dd></div>
      </dl>
    </div>
  );
}

// What the business owns and owes on the last day of the selected dates.
export default function BalanceSheet({ to }) {
  const { data: bs, loading, error } = useLoad(() => api.books.balanceSheet(to), [to]);
  const balanced = bs && Math.abs(Number(bs.total_assets) - Number(bs.total_liabilities) - Number(bs.total_equity)) < 0.005;
  const exportCsv = () => downloadCsv(`balance_sheet_${to}.csv`, toCsv(balanceSheetRows(bs), [
    { key: "section", label: "Section" }, { key: "code", label: "Account" }, { key: "name", label: "Name" }, { key: "amount", label: "Amount (GHS)" },
  ]));
  return (
    <Panel
      title={`Balance sheet at ${fmtDate(to)}`}
      note="Assets equal what is owed plus the owner's stake. Profit not yet moved into retained earnings is shown as profit to date."
      actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!bs}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export</Button>}
    >
      <LoadState loading={loading} error={error} hasData={Boolean(bs)}>
        {bs && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Section title="Assets" items={bs.assets} total={bs.total_assets} />
              <div className="space-y-6">
                <Section title="Liabilities" items={bs.liabilities} total={bs.total_liabilities} />
                <Section title="Equity" items={bs.equity} total={bs.total_equity} extra={
                  <div className="flex justify-between gap-3 py-1.5 border-b border-border/60">
                    <dt>Profit to date</dt><dd className={`tabular ${Number(bs.profit_to_date) < 0 ? "text-destructive" : ""}`}>{formatGHS(bs.profit_to_date)}</dd>
                  </div>
                } />
              </div>
            </div>
            <p className={`flex flex-wrap items-center gap-2 text-sm border-t border-border pt-3 ${balanced ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
              {balanced ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
              Assets {formatGHS(bs.total_assets)} = liabilities {formatGHS(bs.total_liabilities)} + equity {formatGHS(bs.total_equity)}
            </p>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}
