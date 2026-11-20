import React, { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Download, Loader2 } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatCard from "@/components/StatCard";
import { formatGHS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useSettings } from "@/lib/SettingsContext";

const day = (iso) => String(iso || "").slice(0, 10);

// What supervisors have earned in commission on meet and assist bookings: the total paid, this month, today, and who earned it.
export default function CommissionsPanel() {
  const rate = Number(useSettings().settings.supervisor_commission_per_signup);
  const today = todayUtc();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);

  useEffect(() => {
    let live = true;
    api.commissions.list(null, null)
      .then((r) => live && setRows(r))
      .catch((e) => {
        if (!live) return;
        setRows([]);
        setError(e.message || "Could not load commissions.");
      });
    return () => {
      live = false;
    };
  }, []);

  const totals = useMemo(() => {
    const all = rows || [];
    const sum = (list) => list.reduce((n, r) => n + Number(r.amount || 0), 0);
    return {
      all: sum(all),
      count: all.length,
      month: sum(all.filter((r) => day(r.marked_at) >= `${today.slice(0, 7)}-01`)),
      today: sum(all.filter((r) => day(r.marked_at) === today)),
    };
  }, [rows, today]);

  const inRange = useMemo(() => (rows || []).filter((r) => day(r.marked_at) >= from && day(r.marked_at) <= to), [rows, from, to]);
  const bySupervisor = useMemo(() => {
    const map = new Map();
    for (const r of inRange) {
      const k = r.supervisor_id || r.supervisor_name;
      const cur = map.get(k) || { name: r.supervisor_name || "Supervisor", count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.amount || 0);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [inRange]);
  const rangeTotal = inRange.reduce((n, r) => n + Number(r.amount || 0), 0);

  const exportRange = () => {
    downloadCsv(`supervisor_commissions_${from}_to_${to}.csv`, toCsv(inRange, [
      { key: "marked_at", label: "Date", value: (r) => day(r.marked_at) }, { key: "supervisor_name", label: "Supervisor" },
      { key: "reference", label: "Booking" }, { key: "package_name", label: "Service" }, { key: "amount", label: "Commission (GHS)" },
    ]));
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><BadgeDollarSign className="w-4 h-4 text-accent" aria-hidden="true" /> Supervisor commissions</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Supervisors earn a commission of {formatGHS(rate)} for each meet-and-assist booking they record. The commission is deducted from their total earnings and reflected in the shift report.
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          <span className="font-medium text-foreground">Note:</span> Porters are not eligible for meet-and-assist commissions
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Paid in total" value={formatGHS(totals.all)} icon={BadgeDollarSign} accent />
        <StatCard label="This month" value={formatGHS(totals.month)} icon={BadgeDollarSign} />
        <StatCard label="Today" value={formatGHS(totals.today)} icon={BadgeDollarSign} />
        <StatCard label="Bookings with commission" value={totals.count} icon={BadgeDollarSign} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {rows === null ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5"><Label htmlFor="cm-from" className="text-xs">From</Label><Input id="cm-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cm-to" className="text-xs">To</Label><Input id="cm-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
            </div>
            <Button variant="outline" size="sm" onClick={exportRange} disabled={inRange.length === 0}><Download className="w-4 h-4 mr-1.5" /> Export</Button>
          </div>

          {inRange.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No commission was earned in this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Supervisor</th><th className="py-2 px-2 text-right">Bookings</th><th className="py-2 pl-2 text-right">Commission</th></tr></thead>
                  <tbody>
                    {bySupervisor.map((s) => (
                      <tr key={s.name} className="border-b border-border last:border-0"><td className="py-2 pr-3 font-medium">{s.name}</td><td className="py-2 px-2 text-right tabular">{s.count}</td><td className="py-2 pl-2 text-right tabular font-semibold">{formatGHS(s.total)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-border"><td className="pt-2 font-semibold">Total in this period</td><td className="pt-2 px-2 text-right tabular font-semibold">{inRange.length}</td><td className="pt-2 pl-2 text-right tabular font-bold">{formatGHS(rangeTotal)}</td></tr></tfoot>
                </table>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-foreground">Every booking in this period ({inRange.length})</summary>
                <ul className="mt-2 divide-y divide-border">
                  {inRange.map((r) => (
                    <li key={r.booking_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                      <span><span className="font-mono text-foreground">{r.reference}</span> · {r.package_name} · {r.supervisor_name}</span>
                      <span className="text-muted-foreground">{day(r.marked_at)} · <span className="font-semibold text-foreground tabular">{formatGHS(r.amount)}</span></span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}
