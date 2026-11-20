import React from "react";
import { Check, Plane } from "lucide-react";

/**
 * The booking steps as a short flight: a plane travels along the route to the step the passenger has reached.
 * Steps already passed can be tapped to go back.
 */
export default function FlightPath({ steps, current, onGo }) {
  const last = steps.length - 1;
  const stop = (i) => 100 / (steps.length * 2) + (i / last) * (100 - 100 / steps.length);
  return (
    <nav aria-label="Booking steps" className="relative pt-1 pb-1">
      <div className="relative h-8">
        <div className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-border" style={{ left: `${stop(0)}%`, right: `${100 - stop(last)}%` }} aria-hidden="true" />
        <div className="flight-trail absolute top-1/2 -translate-y-1/2 h-0.5 rounded bg-accent" style={{ left: `${stop(0)}%`, width: `${stop(current) - stop(0)}%` }} aria-hidden="true" />
        {steps.map((label, i) => (
          <span
            key={label}
            aria-hidden="true"
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-4 h-4 rounded-full border-2 ${i < current ? "bg-accent border-accent" : "bg-card border-border"}`}
            style={{ left: `${stop(i)}%` }}
          >
            {i < current && <Check className="w-2.5 h-2.5 text-accent-foreground" strokeWidth={3} />}
          </span>
        ))}
        <span className="flight-plane absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" style={{ left: `${stop(current)}%` }} aria-hidden="true">
          <Plane className="w-7 h-7 rotate-45 drop-shadow-[0_2px_2px_rgb(0_0_0/0.25)]" fill="currentColor" />
        </span>
      </div>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, i) => (
          <li key={label} className="text-center">
            <button
              type="button"
              onClick={() => (i < current ? onGo(i) : undefined)}
              disabled={i >= current}
              aria-current={i === current ? "step" : undefined}
              className={`text-xs sm:text-sm font-semibold px-1 py-1 rounded ${i === current ? "text-foreground" : i < current ? "text-primary hover:underline" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
