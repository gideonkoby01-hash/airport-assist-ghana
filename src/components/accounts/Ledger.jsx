import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGHS } from "@/lib/packages";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useAuth } from "@/lib/AuthContext";
import { LoadState, Panel, fmtDate, methodLabel, useLoad } from "./shared";
import ReviewPayments from "./ReviewPayments";

const TYPE_LABELS = { payment: "Payment", refund: "Refund", write_off: "Write-off" };
const SHOWN = 200;

export default function Ledger({ from, to }) {
  const { user } = useAuth();
  const canOpen = user?.role === "admin" || user?.role === "management"; // the accounts role cannot open bookings
  const [type, setType] = useState("all");
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(SHOWN);
  const { data, loading, error } = useLoad(() => api.finance.ledger(from, to, type === "all" ? null : type, method === "all" ? null : method), [from, to, type, method]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter((r) => !q || [r.reference, r.customer, r.recorded_by, r.package_name, r.reason].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [data, search]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ in: t.in + (r.entry_type === "payment" ? Number(r.amount) : 0), out: t.out + (r.entry_type === "refund" ? Number(r.amount) : 0), off: t.off + (r.entry_type === "write_off" ? Number(r.amount) : 0) }), { in: 0, out: 0, off: 0 }), [rows]);

  const exportCsv = () => downloadCsv(`ledger_${from}_to_${to}.csv`, toCsv(rows, [
    { key: "entry_date", label: "Date" }, { key: "reference", label: "Booking" }, { key: "customer", label: "Customer" }, { key: "package_name", label: "Service" },
    { key: "entry_type", label: "Type" }, { key: "method", label: "Method", value: (r) => methodLabel(r.method) }, { key: "amount", label: "Amount (GHS)" },
    { key: "signed_amount", label: "Effect on cash (GHS)" }, { key: "recorded_by", label: "Recorded by" }, { key: "reason", label: "Reason" },
  ]));

  return (
    <div className="space-y-5">
    <ReviewPayments />
    <Panel
      title="Ledger"
      note="Every payment, refund and write-off, newest first. Entries cannot be edited or deleted; a mistake is corrected by a new entry."
      actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4 mr-1.5" /> Export</Button>}
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search the ledger" className="pl-9" placeholder="Reference, customer, person or reason" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(SHOWN); }} />
        </div>
        <Select value={type} onValueChange={(v) => { setType(v); setLimit(SHOWN); }}>
          <SelectTrigger className="w-40" aria-label="Type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="payment">Payments</SelectItem><SelectItem value="refund">Refunds</SelectItem><SelectItem value="write_off">Write-offs</SelectItem></SelectContent>
        </Select>
        <Select value={method} onValueChange={(v) => { setMethod(v); setLimit(SHOWN); }}>
          <SelectTrigger className="w-44" aria-label="Method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="mobile_money">Mobile money</SelectItem>
            <SelectItem value="card">Card</SelectItem><SelectItem value="corporate_account">Corporate account</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-3">
          <span>In: <strong className="tabular">{formatGHS(totals.in)}</strong></span>
          <span>Refunded: <strong className="tabular">{formatGHS(totals.out)}</strong></span>
          <span>Net: <strong className="tabular">{formatGHS(totals.in - totals.out)}</strong></span>
          {totals.off > 0 && <span>Written off: <strong className="tabular">{formatGHS(totals.off)}</strong></span>}
          <span className="text-muted-foreground">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No entries match.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Booking</th><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Method</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 font-medium">Recorded by</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.entry_date)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{canOpen ? <Link to={`/bookings/${r.booking_id}`} className="underline underline-offset-2">{r.reference}</Link> : r.reference}</td>
                    <td className="py-2 pr-3">{r.customer}<span className="block text-xs text-muted-foreground">{r.package_name}</span></td>
                    <td className="py-2 pr-3">{TYPE_LABELS[r.entry_type] || r.entry_type}{r.reason && <span className="block text-xs text-muted-foreground">{r.reason}</span>}</td>
                    <td className="py-2 pr-3">{methodLabel(r.method)}</td>
                    <td className={`py-2 pr-3 text-right tabular font-medium ${r.entry_type === "refund" ? "text-destructive" : ""}`}>{r.entry_type === "refund" ? "−" : ""}{formatGHS(r.amount)}</td>
                    <td className="py-2">{r.recorded_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && <div className="pt-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimit((l) => l + SHOWN)}>Show {Math.min(SHOWN, rows.length - limit)} more</Button></div>}
          </div>
        )}
      </LoadState>
    </Panel>
    </div>
  );
}
