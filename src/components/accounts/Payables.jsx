import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGHS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import KpiTile from "@/components/charts/KpiTile";
import { LoadState, Panel, fmtDate, methodLabel, useLoad } from "./shared";

const n = (x) => Number(x) || 0;
const PAY_METHODS = [["cash", "Cash (including kept from takings)"], ["mobile_money", "Mobile money"], ["bank_transfer", "Bank transfer"]];

function PayRow({ s, onPaid }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: String(n(s.owed)), method: "cash", date: todayUtc(), note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pay = async (e) => {
    e.preventDefault();
    setError("");
    const amount = Math.round(Number(f.amount) * 100) / 100;
    if (!(amount > 0)) return setError("Enter an amount above zero.");
    if (amount > n(s.owed)) return setError(`That is more than the ${formatGHS(s.owed)} owed.`);
    setBusy(true);
    try {
      await api.books.paySupervisor({ supervisorId: s.supervisor_id, amount, method: f.method, date: f.date, note: f.note.trim() });
      setOpen(false);
      onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{s.supervisor_name}</p>
          <p className="text-xs text-muted-foreground tabular">Earned {formatGHS(s.earned)} · paid {formatGHS(s.paid)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`tabular font-semibold ${n(s.owed) > 0 ? "" : "text-muted-foreground"}`}>{n(s.owed) > 0 ? `${formatGHS(s.owed)} owed` : "Paid up"}</span>
          {n(s.owed) > 0 && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Record payment</Button>}
        </div>
      </div>
      {open && (
        <form onSubmit={pay} noValidate className="grid sm:grid-cols-12 gap-2 mt-3 items-end">
          <Input aria-label="Amount paid (GHS)" className="sm:col-span-2 tabular" type="number" min={0} step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <div className="sm:col-span-4">
            <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
              <SelectTrigger aria-label="Paid by"><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <Input aria-label="Date paid" className="sm:col-span-2" type="date" max={todayUtc()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Input aria-label="Note (optional)" placeholder="Note (optional)" className="sm:col-span-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <div className="sm:col-span-2 flex gap-1.5">
            <Button type="submit" size="sm" className="flex-1" disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Back</Button>
          </div>
          {error && <p role="alert" className="sm:col-span-12 text-sm text-destructive">{error}</p>}
        </form>
      )}
    </li>
  );
}

// What the business owes its own people: porters (earned on completed bookings, paid daily) and supervisors (commission).
export default function Payables({ from, to }) {
  const { user } = useAuth();
  const canAct = user?.role === "admin" || user?.role === "management";
  const { data, loading, error } = useLoad(() => api.finance.summary(from, to), [from, to]);
  const owedList = useLoad(() => api.books.supervisorsOwed(), []);
  const payouts = useLoad(() => api.books.supervisorPayouts(from, to), [from, to]);
  const owed = data ? Math.max(0, n(data.porter_commission) - n(data.porter_paid)) : 0;
  const refresh = () => { owedList.reload(); payouts.reload(); };
  const supervisors = (owedList.data || []).filter((s) => n(s.earned) > 0 || n(s.paid) > 0);
  return (
    <div className="space-y-5">
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile accent label="Porters: still to pay" value={formatGHS(owed)} sub="Earned less paid, in this period" />
            <KpiTile label="Porters: earned" value={formatGHS(data.porter_commission)} sub="On completed bookings" />
            <KpiTile label="Porters: paid out" value={formatGHS(data.porter_paid)} sub="Recorded payouts" />
            <KpiTile label="Supervisors: commission" value={formatGHS(data.supervisor_commission)} sub="Earned in this period" />
          </div>
        )}
      </LoadState>

      <Panel title="Supervisor commission" note="Each meet and assist earns the supervisor their commission automatically. Record it here when it is paid, including commission a supervisor kept from the cash they took (choose cash).">
        <LoadState loading={owedList.loading} error={owedList.error} hasData={Boolean(owedList.data)}>
          {supervisors.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No supervisor has earned commission yet.</p> : (
            <ul className="divide-y divide-border">{supervisors.map((s) => <PayRow key={`${s.supervisor_id}:${s.owed}`} s={s} onPaid={refresh} />)}</ul>
          )}
        </LoadState>
        {(payouts.data || []).length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Paid in the selected dates</h4>
            <ul className="text-sm space-y-1">
              {payouts.data.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2"><span>{fmtDate(p.pay_date)} · {p.supervisor_name} · {methodLabel(p.method)}{p.note ? ` · ${p.note}` : ""}</span><span className="tabular font-medium">{formatGHS(p.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {canAct && <Panel title="Porters" note="Porters are paid at the end of each day from the Pay porters screen, and each payout is recorded once.">
        <ul className="grid sm:grid-cols-2 gap-3 text-sm">
          <li><Link to="?tab=porter-pay" className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 hover:border-accent"><span><span className="block font-medium">Pay porters</span><span className="block text-xs text-muted-foreground">See each porter's day and record the payout.</span></span><ArrowUpRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></Link></li>
          <li><Link to="?tab=commissions" className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 hover:border-accent"><span><span className="block font-medium">Supervisor commissions by day</span><span className="block text-xs text-muted-foreground">Who earned what, booking by booking.</span></span><ArrowUpRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></Link></li>
        </ul>
        <p className="text-xs text-muted-foreground mt-4">"Still to pay" compares what porters earned on completed flights in the period with the payouts recorded in the same dates, so it can differ by a day at the edges.</p>
      </Panel>}
    </div>
  );
}
