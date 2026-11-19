import React, { useState } from "react";
import { RAMP } from "./theme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A grid of weekday by hour. The darker the cell, the more flights. Hovering or focusing a cell reads out its day, hour and count.
 * `cells`: [{ weekday: 0-6, hour: 0-23, bookings }].
 */
export default function Heatmap({ cells }) {
  const [focus, setFocus] = useState(null);
  const data = cells || [];
  if (!data.length) return <p className="text-sm text-muted-foreground py-6 text-center">No flight times recorded in this period.</p>;
  const hours = data.map((c) => c.hour);
  const from = Math.max(0, Math.min(...hours) - (Math.min(...hours) > 0 ? 0 : 0));
  const to = Math.min(23, Math.max(...hours));
  const cols = [];
  for (let h = from; h <= to; h++) cols.push(h);
  const lookup = new Map(data.map((c) => [`${c.weekday}-${c.hour}`, Number(c.bookings) || 0]));
  const max = Math.max(...data.map((c) => Number(c.bookings) || 0), 1);
  const shade = (n) => (n === 0 ? "hsl(var(--secondary))" : RAMP[Math.min(RAMP.length - 1, Math.ceil((n / max) * RAMP.length) - 1)]);
  const label = (d, h, n) => `${DAYS[d]} ${String(h).padStart(2, "0")}:00: ${n} flight${n === 1 ? "" : "s"}`;
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `2.2rem repeat(${cols.length}, minmax(1.15rem, 1fr))` }} role="grid" aria-label="Flights by weekday and hour">
          <span />
          {cols.map((h) => (<span key={h} className="text-[0.65rem] text-muted-foreground text-center">{h % 2 === 0 ? String(h).padStart(2, "0") : ""}</span>))}
          {DAYS.map((d, di) => (
            <React.Fragment key={d}>
              <span className="text-xs text-muted-foreground self-center">{d}</span>
              {cols.map((h) => {
                const n = lookup.get(`${di}-${h}`) || 0;
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={label(di, h, n)}
                    onMouseEnter={() => setFocus(label(di, h, n))}
                    onFocus={() => setFocus(label(di, h, n))}
                    onMouseLeave={() => setFocus(null)}
                    onBlur={() => setFocus(null)}
                    className="h-6 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ background: shade(n) }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground min-h-[1.25rem]">
        <span aria-live="polite">{focus || "Hover a square to read it."}</span>
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">Fewer {RAMP.slice(0, 6).map((c) => (<span key={c} className="inline-block w-3 h-3 rounded-[3px]" style={{ background: c }} />))} More</span>
      </div>
    </div>
  );
}
