import React from "react";
import { cn } from "@/lib/utils";

// A figure and what it means. The lead card (accent) is navy with a gold figure so the number that matters most
// on a screen is found first; the others stay white and quiet.
// "GHS 21,100.00": the amount carries the weight, the currency is a quiet prefix.
function Figure({ value }) {
  const m = typeof value === "string" ? value.match(/^GHS\s+(.*)$/) : null;
  if (!m) return value;
  return (
    <>
      <span className="text-[0.55em] font-medium opacity-60 mr-1.5 align-baseline">GHS</span>
      {m[1]}
    </>
  );
}

export default function StatCard({ label, value, sub = undefined, icon: Icon, accent = false }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 sm:gap-5 sm:min-h-[7.5rem]",
        accent
          ? "bg-primary border-primary text-primary-foreground col-span-2 sm:col-span-1"
          : "bg-card border-border"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-[0.8rem] sm:text-sm font-medium", accent ? "text-primary-foreground/75" : "text-muted-foreground")}>{label}</p>
        {Icon && (
          <span className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", accent ? "bg-white/10 text-accent" : "bg-secondary text-muted-foreground")}>
            <Icon className="w-4 h-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div>
        <p className={cn("tabular whitespace-nowrap text-xl sm:text-2xl leading-none font-semibold tracking-tight", accent ? "text-accent" : "text-foreground")}><Figure value={value} /></p>
        {sub && <p className={cn("text-xs mt-2", accent ? "text-primary-foreground/70" : "text-muted-foreground")}>{sub}</p>}
      </div>
    </div>
  );
}
