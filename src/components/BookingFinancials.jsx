import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { formatGHS } from "@/lib/packages";
import { BarChart3, Percent, Wallet } from "lucide-react";

// Booking-value financials, kept separate from cash figures:
// Amount Collected and Total Revenue still come from submitted shift reports.
export default function BookingFinancials() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Booking
      .aggregate({
        groupBy: "status",
        sum: ["original_total", "discount_amount", "total_value"],
      })
      .then((r) => setRows(r.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const net = rows.reduce((s, r) => s + (r.sum_total_value || 0), 0);
  const discounts = rows.reduce((s, r) => s + (r.sum_discount_amount || 0), 0);
  // Legacy bookings predate original_total; gross = net + discounts is exact either way.
  const gross = net + discounts;

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-accent" /> Booking Value & Discounts
      </h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Calculating booking figures…</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-secondary p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Gross bookings (before discounts)
            </p>
            <p className="text-lg font-bold text-foreground mt-1">{formatGHS(gross)}</p>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Percent className="w-3 h-3" /> Discounts granted
            </p>
            <p className="text-lg font-bold text-rose-600 mt-1">{formatGHS(discounts)}</p>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Net bookings (after discounts)
            </p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{formatGHS(net)}</p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        Amount Collected and Total Revenue remain the money recorded in submitted supervisor shift reports. Discounts
        reduce booking value and the outstanding balance; they are never counted as payments or porter commissions.
      </p>
    </div>
  );
}