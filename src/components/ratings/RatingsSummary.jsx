import React from "react";
import { Star, MessageSquare, Award, AlertTriangle } from "lucide-react";
import { STAR_VALUES } from "@/lib/ratings";
import { cn } from "@/lib/utils";

// Summary cards and the 5-to-1 star distribution.
// Averages use submitted reviews only, never bookings without a review.
export default function RatingsSummary({ summary, loading }) {
  const cards = [
    { label: "Total Reviews", value: loading ? "—" : summary.total, icon: MessageSquare, accent: false },
    {
      label: "Average Rating",
      value: loading || !summary.total ? "—" : `${summary.average.toFixed(2)} / 5`,
      icon: Star,
      accent: true,
    },
    { label: "5-Star Reviews", value: loading ? "—" : summary.fiveStar, icon: Award, accent: true },
    { label: "1-Star Reviews", value: loading ? "—" : summary.oneStar, icon: AlertTriangle, accent: false },
  ];

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
              </div>
              <div className={cn("rounded-lg p-2", card.accent ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary")}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-accent" /> Rating Distribution
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Calculating review figures…</p>
        ) : summary.total === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {STAR_VALUES.map((value) => {
              const count = summary.distribution[value] || 0;
              const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div key={value} className="flex items-center gap-3">
                  <span className="w-20 text-xs font-medium text-muted-foreground shrink-0">
                    {value} Star{value === 1 ? "" : "s"}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs text-muted-foreground shrink-0">
                    {count} · {pct}%
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2">
              Averages and distribution counts include submitted reviews only. Bookings without a review are never
              counted as zero stars.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}