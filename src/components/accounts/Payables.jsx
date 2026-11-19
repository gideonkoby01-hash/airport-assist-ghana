import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { formatGHS } from "@/lib/packages";
import KpiTile from "@/components/charts/KpiTile";
import { LoadState, Panel, useLoad } from "./shared";

const n = (x) => Number(x) || 0;

// What the business owes its own people: porters (earned on completed bookings, paid daily) and supervisors (commission).
export default function Payables({ from, to }) {
  const { user } = useAuth();
  const canAct = user?.role === "admin" || user?.role === "management";
  const { data, loading, error } = useLoad(() => api.finance.summary(from, to), [from, to]);
  const owed = data ? Math.max(0, n(data.porter_commission) - n(data.porter_paid)) : 0;
  return (
    <LoadState loading={loading} error={error} hasData={Boolean(data)}>
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile accent label="Porters: still to pay" value={formatGHS(owed)} sub="Earned less paid, in this period" />
            <KpiTile label="Porters: earned" value={formatGHS(data.porter_commission)} sub="On completed bookings" />
            <KpiTile label="Porters: paid out" value={formatGHS(data.porter_paid)} sub="Recorded payouts" />
            <KpiTile label="Supervisors: commission" value={formatGHS(data.supervisor_commission)} sub="Marked on bookings" />
          </div>
          {canAct && <Panel title="Where to act" note="Porters are paid at the end of each day, and each payout is recorded once. Supervisor commission is taken off their takings in the shift report.">
            <ul className="grid sm:grid-cols-2 gap-3 text-sm">
              <li><Link to="?tab=porter-pay" className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 hover:border-accent"><span><span className="block font-medium">Pay porters</span><span className="block text-xs text-muted-foreground">See each porter's day and record the payout.</span></span><ArrowUpRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></Link></li>
              <li><Link to="?tab=commissions" className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 hover:border-accent"><span><span className="block font-medium">Supervisor commissions</span><span className="block text-xs text-muted-foreground">Who earned what, by day.</span></span><ArrowUpRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></Link></li>
            </ul>
            <p className="text-xs text-muted-foreground mt-4">"Still to pay" compares what porters earned on completed flights in the period with the payouts recorded in the same dates, so it can differ by a day at the edges.</p>
          </Panel>}
        </div>
      )}
    </LoadState>
  );
}
