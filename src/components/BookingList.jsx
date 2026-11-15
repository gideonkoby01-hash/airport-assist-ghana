import React from "react";
import { Link } from "react-router-dom";
import { BookingStatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { PACKAGE_LABELS, formatGHS } from "@/lib/packages";
import { isOverdue } from "@/lib/bookingRules";
import { todayUtc } from "@/lib/bookingFormRules";
import { Plane, Calendar, Users } from "lucide-react";

export default function BookingList({ bookings, loading, emptyMessage = "No bookings yet.", hasMore = false, loadingMore = false, onLoadMore = undefined }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading bookings…
      </div>
    );
  }
  if (!bookings.length) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{emptyMessage}</div>;
  }
  const today = todayUtc();
  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <Link
          key={b.id}
          to={`/bookings/${b.id}`}
          className="block bg-card rounded-xl border border-border p-4 hover:border-accent hover:shadow-sm transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-primary">{b.reference}</span>
                <BookingStatusBadge status={b.status} />
                <PaymentBadge status={b.payment_status} />
              </div>
              <p className="text-sm text-foreground mt-1 font-medium">{PACKAGE_LABELS[b.package_code] || b.package_name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Plane className="w-3 h-3" /> {b.flight_type === "arrival" ? "Arrival" : "Departure"} · {b.airline || "—"} {b.flight_number}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {b.flight_date} {b.scheduled_flight_time}
                  {isOverdue(b, today) && (
                    <span className="ml-1 rounded bg-amber-100 text-amber-900 px-1.5 py-0.5 font-medium">Date passed, still open</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {b.num_passengers}
                </span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-lg font-bold text-foreground">{formatGHS(b.total_value)}</p>
              {Number(b.discount_amount || 0) > 0 && (
                <p className="text-xs text-emerald-700">
                  {b.discount_code}: −{formatGHS(b.discount_amount)}
                </p>
              )}
              <p className="text-xs text-muted-foreground capitalize">{b.booking_channel?.replace("_", " ")}</p>
              {b.assigned_supervisor_name && (
                <p className="text-xs text-muted-foreground mt-0.5">Sup: {b.assigned_supervisor_name}</p>
              )}
            </div>
          </div>
        </Link>
      ))}
      {hasMore && onLoadMore && (
        <div className="text-center pt-2">
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="text-sm text-primary font-medium hover:underline disabled:opacity-60">
            {loadingMore ? "Loading…" : "Load older bookings"}
          </button>
        </div>
      )}
    </div>
  );
}