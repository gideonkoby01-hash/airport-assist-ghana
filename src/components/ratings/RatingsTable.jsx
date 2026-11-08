import React from "react";
import { Button } from "@/components/ui/button";
import StarRatingDisplay from "@/components/ratings/StarRatingDisplay";
import { formatDate, formatDateTime } from "@/lib/ratings";
import { Eye, MessageSquare } from "lucide-react";

export default function RatingsTable({ rows, loading, onView, hasMore, loadingMore, onLoadMore }) {
  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto mb-3" />
        Loading reviews…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
        No reviews match your filters yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden md:block bg-card rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Booking Ref</th>
              <th className="px-4 py-3 font-medium">Passenger</th>
              <th className="px-4 py-3 font-medium">Package</th>
              <th className="px-4 py-3 font-medium">Service Date</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Supervisor</th>
              <th className="px-4 py-3 font-medium">Feedback</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-primary whitespace-nowrap">
                  {r.booking_reference || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.passenger_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground">{r.package_name || "—"}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(r.service_date)}</td>
                <td className="px-4 py-3">
                  <StarRatingDisplay value={r.overall_rating} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.supervisor_name || "—"}</td>
                <td className="px-4 py-3 max-w-[220px]">
                  {r.feedback ? (
                    <p className="text-muted-foreground truncate" title={r.feedback}>
                      {r.feedback}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">No written feedback</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(r.submitted_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => onView(r)}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold text-primary">{r.booking_reference || "—"}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{r.passenger_name || "—"}</p>
              </div>
              <StarRatingDisplay value={r.overall_rating} />
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>{r.package_name || "—"} · {formatDate(r.service_date)}</p>
              <p>Supervisor: {r.supervisor_name || "—"}</p>
              <p>Submitted {formatDateTime(r.submitted_at)}</p>
            </div>
            {r.feedback ? (
              <p className="text-sm text-foreground mt-2 line-clamp-2 break-words">{r.feedback}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> No written feedback
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => onView(r)}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> View details
            </Button>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more reviews"}
          </Button>
        </div>
      )}
    </div>
  );
}