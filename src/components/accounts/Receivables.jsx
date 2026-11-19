import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGHS } from "@/lib/packages";
import { agingTotals } from "@/lib/finance";
import { downloadCsv, toCsv } from "@/lib/csv";
import { todayUtc } from "@/lib/bookingFormRules";
import { LoadState, Panel, fmtDate, useLoad } from "./shared";

const BUCKETS = { not_due: "Flight not yet taken", "0-7": "0 to 7 days ago", "8-30": "8 to 30 days ago", "31-60": "31 to 60 days ago", "60+": "Over 60 days ago" };

export default function Receivables() {
  const today = todayUtc();
  const { data, loading, error } = useLoad(() => api.finance.receivables(today), [today]);
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const totals = useMemo(() => agingTotals(data), [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter((r) => (bucket === "all" || r.bucket === bucket) && (!q || [r.reference, r.customer, r.phone, r.supervisor].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [data, bucket, search]);

  const exportCsv = () => downloadCsv(`receivables_${today}.csv`, toCsv(rows, [
    { key: "reference", label: "Booking" }, { key: "customer", label: "Customer" }, { key: "phone", label: "Phone" }, { key: "package_name", label: "Service" }, { key: "flight_date", label: "Flight date" },
    { key: "status", label: "Status" }, { key: "total_value", label: "Total (GHS)" }, { key: "amount_collected", label: "Collected (GHS)" }, { key: "outstanding_balance", label: "Owed (GHS)" },
    { key: "days_since_flight", label: "Days since flight" }, { key: "bucket", label: "Age", value: (r) => BUCKETS[r.bucket] || r.bucket }, { key: "supervisor", label: "Supervisor" },
  ]));

  return (
    <Panel title="Receivables" note="Every booking with money still owed, as at today, by how long since the flight. Record a payment from the booking." actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4 mr-1.5" /> Export</Button>}>
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          {[["all", "All owed", totals.amount, totals.count], ...totals.order.map((k) => [k, BUCKETS[k], totals.totals[k].amount, totals.totals[k].count])].map(([key, label, amount, count]) => (
            <button key={key} type="button" aria-pressed={bucket === key} onClick={() => setBucket(key)}
              className={`text-left rounded-xl border p-3 transition-colors ${bucket === key ? "border-accent ring-2 ring-accent/30 bg-accent/5" : "border-border hover:border-accent/50"}`}>
              <span className="block text-xs text-muted-foreground">{label}</span>
              <span className="block text-base font-semibold tabular mt-1">{formatGHS(amount)}</span>
              <span className="block text-xs text-muted-foreground">{count} booking{count === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-3 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search receivables" className="pl-9" placeholder="Reference, customer, phone or supervisor" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">{(data || []).length === 0 ? "Nobody owes anything. Every booking is paid up." : "Nothing matches."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Booking</th><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Flight</th><th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Paid</th><th className="py-2 pr-3 text-right font-medium">Owed</th><th className="py-2 font-medium">Age</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.booking_id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-xs"><Link to={`/bookings/${r.booking_id}`} className="underline underline-offset-2">{r.reference}</Link></td>
                    <td className="py-2 pr-3">{r.customer}<span className="block text-xs text-muted-foreground">{r.phone || ""}{r.supervisor ? ` · ${r.supervisor}` : ""}</span></td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.flight_date)}<span className="block text-xs text-muted-foreground capitalize">{String(r.status).replace("_", " ")}</span></td>
                    <td className="py-2 pr-3 text-right tabular">{formatGHS(r.total_value)}</td>
                    <td className="py-2 pr-3 text-right tabular">{formatGHS(r.amount_collected)}</td>
                    <td className="py-2 pr-3 text-right tabular font-semibold">{formatGHS(r.outstanding_balance)}</td>
                    <td className="py-2 whitespace-nowrap text-xs">{r.bucket === "not_due" ? "Not yet flown" : `${r.days_since_flight} days`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-border"><td colSpan={5} className="pt-2 font-semibold text-right">Total owed</td><td className="pt-2 pr-3 text-right tabular font-bold">{formatGHS(rows.reduce((t, r) => t + Number(r.outstanding_balance), 0))}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}
