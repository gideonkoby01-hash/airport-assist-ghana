import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ChevronDown, Download, Loader2 } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmAction from "@/components/ConfirmAction";
import StatCard from "@/components/StatCard";
import { formatGHS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError } from "@/lib/notify";
import { useSettings } from "@/lib/SettingsContext";

function shiftDay(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Each porter's earnings for a day (a set amount per passenger handled, from completed bookings) and a record of paying
// them. A day is settled by paying what is owed; a job completed later adds only the difference.
export default function PorterPay() {
  const rate = Number(useSettings().settings.porter_commission_per_passenger);
  const [date, setDate] = useState(todayUtc());
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState("");
  const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await api.porterPay.earnings(date));
    } catch (e) {
      setRows([]);
      setError(e.message || "Could not load porter pay.");
    }
  }, [date]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const totals = useMemo(
    () => (rows || []).reduce((t, r) => ({ earned: t.earned + Number(r.earned), paid: t.paid + Number(r.paid), balance: t.balance + Number(r.balance) }), { earned: 0, paid: 0, balance: 0 }),
    [rows]
  );

  const pay = async (r) => {
    setPaying(r.porter_key);
    try {
      await api.porterPay.pay(r.porter_key, date);
      await load();
    } catch (e) {
      notifyError(e.message || "Could not record the payment.");
      load();
    } finally {
      setPaying("");
    }
  };

  const exportDay = () => {
    downloadCsv(`porter_pay_${date}.csv`, toCsv(rows || [], [
      { key: "porter_name", label: "Porter" }, { key: "jobs", label: "Jobs" }, { key: "passengers", label: "Passengers" },
      { key: "earned", label: "Earned (GHS)" }, { key: "paid", label: "Paid (GHS)" }, { key: "balance", label: "Still to pay (GHS)" },
    ]));
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Banknote className="w-4 h-4 text-accent" aria-hidden="true" /> Porter pay</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Each porter earns {formatGHS(rate)} for every passenger they handle, paid at the end of the day. A job counts once its booking is completed.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-date" className="text-xs">Day</Label>
              <Input id="pp-date" type="date" value={date} max={todayUtc()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => setDate(shiftDay(date, -1))}>Day before</Button>
            {date < todayUtc() && <Button variant="outline" onClick={() => setDate(shiftDay(date, 1))}>Next day</Button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Earned that day" value={formatGHS(totals.earned)} icon={Banknote} accent />
        <StatCard label="Paid" value={formatGHS(totals.paid)} icon={Banknote} />
        <StatCard label="Still to pay" value={formatGHS(totals.balance)} icon={Banknote} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {rows === null ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground bg-card rounded-2xl border border-border">
          No completed porter jobs on this day. When a supervisor completes a booking with a porter on it, the porter's earnings appear here.
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-3 px-4">Porter</th>
                <th className="py-3 px-2 text-right">Jobs</th>
                <th className="py-3 px-2 text-right">Passengers</th>
                <th className="py-3 px-2 text-right">Earned</th>
                <th className="py-3 px-2 text-right">Paid</th>
                <th className="py-3 px-2 text-right">Still to pay</th>
                <th className="py-3 px-4 text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.porter_key;
                const settled = Number(r.balance) <= 0;
                return (
                  <React.Fragment key={r.porter_key}>
                    <tr className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">
                        <button type="button" onClick={() => setOpen(isOpen ? "" : r.porter_key)} aria-expanded={isOpen} className="inline-flex items-center gap-1.5 hover:underline">
                          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" /> {r.porter_name}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-right tabular">{r.jobs}</td>
                      <td className="py-3 px-2 text-right tabular">{r.passengers}</td>
                      <td className="py-3 px-2 text-right tabular font-semibold">{formatGHS(r.earned)}</td>
                      <td className="py-3 px-2 text-right tabular">{formatGHS(r.paid)}</td>
                      <td className="py-3 px-2 text-right tabular font-semibold">{formatGHS(r.balance)}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {settled ? (
                          <span className="text-xs font-medium text-emerald-700">Paid</span>
                        ) : (
                          <ConfirmAction
                            title={`Pay ${r.porter_name} ${formatGHS(r.balance)}?`}
                            description={`This records that ${r.porter_name} was paid ${formatGHS(r.balance)} for ${date}. It cannot be undone.`}
                            confirmLabel="Record payment"
                            onConfirm={() => pay(r)}
                          >
                            <Button size="sm" disabled={paying === r.porter_key}>
                              {paying === r.porter_key && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                              Mark paid
                            </Button>
                          </ConfirmAction>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-secondary/50">
                        <td colSpan={7} className="px-4 py-3">
                          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                            {(r.bookings || []).map((b) => (
                              <li key={b.reference}><span className="font-mono text-foreground">{b.reference}</span> · {b.passengers} passenger{b.passengers === 1 ? "" : "s"} · {formatGHS(b.amount)}</li>
                            ))}
                          </ul>
                          {r.last_paid_at && <p className="text-xs text-muted-foreground mt-2">Last paid {new Date(r.last_paid_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Porters are added and switched on or off by an administrator.</p>
            <Button variant="outline" size="sm" onClick={exportDay}><Download className="w-4 h-4 mr-1.5" /> Export this day</Button>
          </div>
        </div>
      )}
    </div>
  );
}
