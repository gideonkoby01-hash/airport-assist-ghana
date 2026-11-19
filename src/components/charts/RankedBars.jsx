import React from "react";
import { cn } from "@/lib/utils";
import { SERIES } from "./theme";

/**
 * Ranked horizontal bars, the honest way to show a split or a league table: one bar per row on a shared baseline,
 * largest first, the value at the tip. `items`: [{ label, value, display?, sub?, colour? }]. Bars are one hue unless an item
 * brings its own colour (a payment method keeps its colour wherever it appears).
 */
export default function RankedBars({ items, empty = "Nothing in this period.", colour = SERIES[0], className = "" }) {
  const rows = (items || []).filter((i) => Number(i.value) > 0 || i.display);
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>;
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground truncate" title={r.label}>{r.label}</span>
            <span className="font-semibold text-foreground tabular shrink-0">{r.display ?? r.value}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-secondary overflow-hidden" role="presentation">
            <div className="h-full rounded-r" style={{ width: `${Math.max(2, ((Number(r.value) || 0) / max) * 100)}%`, background: r.colour || colour, borderRadius: "0 4px 4px 0" }} />
          </div>
          {r.sub && <p className="text-xs text-muted-foreground mt-0.5">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
