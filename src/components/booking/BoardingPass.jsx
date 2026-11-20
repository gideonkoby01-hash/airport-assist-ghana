import React from "react";
import { Pencil, Plane } from "lucide-react";

/**
 * The booking as a boarding pass. On the review step each line can be changed; once the booking is made the same pass
 * shows the reference, and a plane takes off across the top.
 */
export default function BoardingPass({ confirmed = false, direction, service, flight, when, travellers, contact, email, perPassenger = "", total, reference = "", onChange = undefined }) {
  const arriving = direction !== "departure";
  const rows = [
    ["Flight", flight, 1],
    ["Date and time", when, 1],
    [`Travellers (${travellers.length})`, travellers.join(", "), 2],
    ["Contact", [contact, email].filter(Boolean).join(" · "), 2],
  ];
  return (
    <div className={`overflow-hidden rounded-3xl border border-border bg-card shadow-[0_26px_50px_-30px_hsl(var(--foreground)/0.55)] ${confirmed ? "pass-stamp" : ""}`}>
      <div className={`relative overflow-hidden bg-[#0b1d36] px-5 pt-4 text-white ${confirmed ? "pb-11" : "pb-5"}`}>
        {confirmed && (
          <>
            <span className="takeoff-trail absolute left-0 right-0 bottom-4 h-0.5 bg-gradient-to-r from-[#f6c73a] to-transparent" aria-hidden="true" />
            <span className="takeoff absolute left-0 bottom-2 text-[#f6c73a]" aria-hidden="true">
              <Plane className="w-8 h-8 rotate-45" fill="currentColor" />
            </span>
          </>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">{arriving ? "Arriving into Accra" : "Departing from Accra"}</p>
            <p className="serif text-2xl leading-tight mt-0.5">{service || "Your service"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-2xl font-bold tracking-widest text-[#f6c73a]" aria-label="Kotoka International Airport, ACC">
            {arriving ? null : "ACC"}
            <Plane className={`w-6 h-6 ${arriving ? "rotate-[135deg]" : "rotate-45"}`} fill="currentColor" aria-hidden="true" />
            {arriving ? "ACC" : null}
          </div>
        </div>
      </div>

      <dl className="divide-y divide-border text-sm">
        {rows.map(([label, value, step]) => (
          <div key={label} className="px-5 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground mt-0.5 break-words">{value || "—"}</dd>
            </div>
            {!confirmed && onChange && (
              <button type="button" onClick={() => onChange(step)} className="shrink-0 text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">
                <Pencil className="w-3 h-3" aria-hidden="true" /> Change
              </button>
            )}
          </div>
        ))}
      </dl>

      <div className="ticket-tear" aria-hidden="true" />
      <div className="px-5 py-4 flex items-end justify-between gap-4 bg-secondary/40">
        <div>
          <p className="text-xs text-muted-foreground">{confirmed ? "Booking reference" : "Per passenger"}</p>
          <p className={`font-bold tabular ${confirmed ? "font-mono text-2xl tracking-wider text-primary" : "text-base text-foreground"}`}>{confirmed ? reference : perPassenger}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total, paid at the airport</p>
          <p className="text-2xl font-bold tabular text-foreground">{total}</p>
        </div>
      </div>
    </div>
  );
}
