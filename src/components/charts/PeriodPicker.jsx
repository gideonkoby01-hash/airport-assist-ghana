import React, { useState } from "react";
import { Check, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_PRESETS, daysInclusive } from "@/lib/finance";
import { todayUtc } from "@/lib/bookingFormRules";

/**
 * The date range for everything below it: presets first (today, 7, 30, 90 days, this month...), a custom range behind them.
 * `value` is { preset, from, to }.
 */
export default function PeriodPicker({ value, onPreset, onCustom, max = 800 }) {
  const [custom, setCustom] = useState(value.preset === "custom");
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const today = todayUtc();
  const bad = !from || !to || to < from || daysInclusive(from, to) > max;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Date range">
        {PERIOD_PRESETS.map((p) => {
          const on = value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setCustom(false); onPreset(p.key); }}
              className={`press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card text-foreground border-border hover:border-accent"}`}
            >
              {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}{p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom || value.preset === "custom"}
          onClick={() => setCustom((c) => !c)}
          className={`press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${value.preset === "custom" ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card text-foreground border-border hover:border-accent"}`}
        >
          <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> Custom
        </button>
      </div>
      {custom && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="pp-from" className="text-xs">From</Label><Input id="pp-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pp-to" className="text-xs">To</Label><Input id="pp-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          <Button size="sm" disabled={bad} onClick={() => onCustom(from, to)}>Apply</Button>
          {bad && from && to && <p className="text-xs text-destructive pb-2">Choose a range of up to {max} days that ends after it starts.</p>}
        </div>
      )}
    </div>
  );
}
