import React from "react";
import { cn } from "@/lib/utils";
import { change, changeLabel } from "@/lib/finance";
import { BAD, GOOD, NEUTRAL, SERIES } from "./theme";

// A small trend line in the de-emphasis grey with the latest point in the accent colour.
function Sparkline({ values, label }) {
  const v = (values || []).map((x) => Number(x) || 0);
  if (v.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...v);
  const min = Math.min(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 6) + 3, h - 4 - ((y - min) / span) * (h - 8)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={NEUTRAL} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={SERIES[0]} stroke="hsl(var(--card))" strokeWidth="2" />
    </svg>
  );
}

/**
 * One headline figure: a label, the value, how it compares with the period before (colour follows whether up is good),
 * and an optional trend line. `upIsGood` false for costs, refunds and money still owed.
 */
export default function KpiTile({ label, value, current = undefined, previous = undefined, upIsGood = true, sub = undefined, trend = undefined, accent = false }) {
  const frac = previous === undefined ? undefined : change(current, previous);
  const showDelta = frac !== undefined;
  const good = frac === null || frac === undefined || Math.abs(frac) < 0.005 ? null : (frac > 0) === upIsGood;
  return (
    <div className={cn("rounded-2xl border p-4 flex flex-col justify-between gap-3 min-h-[7rem]", accent ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[0.8rem] font-medium", accent ? "text-primary-foreground/75" : "text-muted-foreground")}>{label}</p>
        {trend && <span className="hidden sm:block"><Sparkline values={trend} label={`${label}: trend over the period`} /></span>}
      </div>
      <div className="min-w-0">
        <p className={cn("text-[1.15rem] sm:text-[1.45rem] leading-none font-semibold tracking-tight whitespace-nowrap", accent ? "text-accent" : "text-foreground")}>{value}</p>
        {showDelta && (
          <p className="text-xs mt-2">
            <span className="font-semibold whitespace-nowrap" style={{ color: accent ? undefined : good === null ? undefined : good ? GOOD : BAD }}>
              {frac !== null && Math.abs(frac) >= 0.005 ? (frac > 0 ? "▲ " : "▼ ") : ""}{changeLabel(frac)}
            </span>{" "}
            <span className={accent ? "text-primary-foreground/70" : "text-muted-foreground"}>vs the period before</span>
          </p>
        )}
        {sub && <p className={cn("text-xs mt-1", accent ? "text-primary-foreground/70" : "text-muted-foreground")}>{sub}</p>}
      </div>
    </div>
  );
}
