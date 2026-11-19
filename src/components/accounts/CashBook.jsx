import React, { useMemo } from "react";
import { Download } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/packages";
import { downloadCsv, toCsv } from "@/lib/csv";
import { LoadState, Panel, fmtDate, methodLabel, useLoad } from "./shared";

const METHODS = ["cash", "mobile_money", "card", "corporate_account"];
const n = (x) => Number(x) || 0;

export default function CashBook({ from, to }) {
  const { data, loading, error } = useLoad(() => api.finance.cashBook(from, to), [from, to]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of data?.days || []) {
      const d = map.get(e.date) || { date: e.date };
      d[e.method] = { in: n(e.in), out: n(e.out) };
      map.set(e.date, d);
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data]);
  const totals = useMemo(() => {
    const t = Object.fromEntries(METHODS.map((m) => [m, { in: 0, out: 0 }]));
    for (const d of byDay) for (const m of METHODS) if (d[m]) { t[m].in += d[m].in; t[m].out += d[m].out; }
    return t;
  }, [byDay]);
  const shifts = data?.shifts || [];
  const variance = shifts.reduce((s, x) => s + n(x.variance), 0);

  const exportDays = () => downloadCsv(`cash_book_${from}_to_${to}.csv`, toCsv(byDay.map((d) => ({ date: d.date, ...Object.fromEntries(METHODS.flatMap((m) => [[`${m}_in`, d[m]?.in || 0], [`${m}_out`, d[m]?.out || 0]])) })),
    [{ key: "date", label: "Date" }, ...METHODS.flatMap((m) => [{ key: `${m}_in`, label: `${methodLabel(m)} in (GHS)` }, { key: `${m}_out`, label: `${methodLabel(m)} refunds (GHS)` }])]));

  return (
    <div className="space-y-5">
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        <Panel title="Cash book" note="Money in and refunds out, by day and payment method. Newest day first." actions={<Button variant="outline" size="sm" onClick={exportDays} disabled={!byDay.length}><Download className="w-4 h-4 mr-1.5" /> Export</Button>}>
          {byDay.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No money was recorded in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium" rowSpan={2}>Day</th>
                    {METHODS.map((m) => (<th key={m} colSpan={2} className="py-1 px-2 text-center font-medium border-l border-border">{methodLabel(m)}</th>))}
                    <th className="py-2 pl-3 text-right font-medium border-l border-border" rowSpan={2}>Net</th>
                  </tr>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    {METHODS.map((m) => (<React.Fragment key={m}><th className="py-1 px-2 text-right font-normal border-l border-border">In</th><th className="py-1 px-2 text-right font-normal">Out</th></React.Fragment>))}
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((d) => {
                    const net = METHODS.reduce((s, m) => s + (d[m]?.in || 0) - (d[m]?.out || 0), 0);
                    return (
                      <tr key={d.date} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(d.date)}</td>
                        {METHODS.map((m) => (<React.Fragment key={m}><td className="py-2 px-2 text-right tabular border-l border-border">{d[m]?.in ? formatGHS(d[m].in) : "—"}</td><td className="py-2 px-2 text-right tabular text-destructive">{d[m]?.out ? formatGHS(d[m].out) : "—"}</td></React.Fragment>))}
                        <td className="py-2 pl-3 text-right tabular font-semibold border-l border-border">{formatGHS(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="pt-2 pr-3">Total</td>
                    {METHODS.map((m) => (<React.Fragment key={m}><td className="pt-2 px-2 text-right tabular border-l border-border">{formatGHS(totals[m].in)}</td><td className="pt-2 px-2 text-right tabular text-destructive">{formatGHS(totals[m].out)}</td></React.Fragment>))}
                    <td className="pt-2 pl-3 text-right tabular border-l border-border">{formatGHS(METHODS.reduce((s, m) => s + totals[m].in - totals[m].out, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Cash counted against cash expected" note="From each submitted shift report: what the system expected in cash, what the supervisor counted, and the difference." className="mt-5">
          {shifts.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No shift reports were submitted in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Shift</th><th className="py-2 pr-3 font-medium">Supervisor</th><th className="py-2 pr-3 text-right font-medium">Sales</th>
                  <th className="py-2 pr-3 text-right font-medium">Cash expected</th><th className="py-2 pr-3 text-right font-medium">Cash counted</th><th className="py-2 text-right font-medium">Difference</th>
                </tr></thead>
                <tbody>
                  {shifts.map((s, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(s.date)}</td><td className="py-2 pr-3 capitalize">{s.shift}</td><td className="py-2 pr-3">{s.supervisor || "—"}</td>
                      <td className="py-2 pr-3 text-right tabular">{formatGHS(s.sales)}</td><td className="py-2 pr-3 text-right tabular">{formatGHS(s.cash_expected)}</td><td className="py-2 pr-3 text-right tabular">{formatGHS(s.cash_counted)}</td>
                      <td className={`py-2 text-right tabular font-semibold ${n(s.variance) < 0 ? "text-destructive" : n(s.variance) > 0 ? "text-amber-700" : "text-emerald-700"}`}>{n(s.variance) === 0 ? "Matches" : `${n(s.variance) > 0 ? "Over " : "Short "}${formatGHS(Math.abs(n(s.variance)))}`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-border"><td colSpan={6} className="pt-2 text-right font-semibold">Net difference</td><td className={`pt-2 text-right tabular font-bold ${variance < 0 ? "text-destructive" : ""}`}>{variance === 0 ? "Matches" : `${variance > 0 ? "Over " : "Short "}${formatGHS(Math.abs(variance))}`}</td></tr></tfoot>
              </table>
            </div>
          )}
        </Panel>
      </LoadState>
    </div>
  );
}
