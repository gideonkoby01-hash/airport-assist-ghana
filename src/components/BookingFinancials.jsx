import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import { formatGHS } from "@/lib/packages";
import { BarChart3, Percent, Wallet } from "lucide-react";
import ReportingBaselineControl from "@/components/ReportingBaselineControl";

// Only these statuses contribute to booking-value statistics.
// Cancelled and No-show bookings are excluded, so they drop out of the
// aggregates as soon as their status changes.
const COUNTED_STATUSES = ["confirmed", "assigned", "in_progress", "completed"];

// Booking-value financials, kept separate from cash figures:
// Amount Collected and Total Revenue still come from submitted shift reports.
export default function BookingFinancials() {
  const [baseline, setBaseline] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const page = await api.entities.ReportingBaseline.list({ sort: "-created_date", limit: 1 });
    const current = page?.items?.[0] || null;
    setBaseline(current);

    const query = { status: { $in: COUNTED_STATUSES } };
    if (current?.baseline_at) {
      query.created_date = { $gte: current.baseline_at };
    }

    const result = await api.entities.Booking.aggregate({
      query,
      groupBy: "status",
      sum: ["original_total", "discount_amount", "total_value"],
    }).catch(() => ({ rows: [] }));

    setRows(result.rows || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const discounts = rows.reduce((s, r) => s + (r.sum_discount_amount || 0), 0);
  // Gross uses the saved original booking value; legacy records without a
  // snapshot fall back to net + discount, which equals the same figure.
  const gross = rows.reduce(
    (s, r) =>
      s +
      (r.sum_original_total != null
        ? r.sum_original_total
        : (r.sum_total_value || 0) + (r.sum_discount_amount || 0)),
    0
  );
  const net = gross - discounts;

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

      <ReportingBaselineControl baseline={baseline} onReset={load} />

      <p className="text-xs text-muted-foreground mt-3">
        Counts Confirmed, Assigned, In Progress and Completed bookings only; Cancelled and No-show bookings are
        excluded. Amount Collected and Total Revenue remain the money recorded in submitted supervisor shift reports.
        Discounts reduce booking value and the outstanding balance; they are never counted as payments or porter
        commissions.
      </p>
    </div>
  );
}