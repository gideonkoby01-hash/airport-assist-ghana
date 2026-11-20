import React from "react";
import { Pencil, Plane } from "lucide-react";

/** "2026-11-25" as "Wed 25 Nov 2026". Ghana is on GMT, so the date is read as UTC. */
function longDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return date || "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A barcode drawn from the booking reference: the same reference always gives the same bars. Decoration only. */
function Barcode({ text }) {
  const bars = [];
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0);
    bars.push(1 + (c % 3), 1 + ((c >> 2) % 2), 2 + ((c >> 1) % 2), 1);
  }
  return (
    <div className="flex h-10 items-stretch gap-[2px]" aria-hidden="true">
      {bars.map((w, i) => (
        <span key={i} className={i % 2 === 0 ? "bg-foreground" : "bg-transparent"} style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

function Field({ label, value, sub = "", step = undefined, onChange = undefined }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        {onChange && step !== undefined && (
          <button type="button" onClick={() => onChange(step)} aria-label={`Change ${label.toLowerCase()}`} className="text-primary hover:text-accent">
            <Pencil className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <dd className="mt-0.5 font-semibold text-foreground break-words">{value || "—"}</dd>
      {sub && <dd className="text-xs text-muted-foreground break-words">{sub}</dd>}
    </div>
  );
}

/**
 * The booking as a boarding pass. On the review step each detail has a pencil to change it; once the booking is made
 * the same pass carries the reference, and a plane takes off from the runway above it.
 */
export default function BoardingPass({
  confirmed = false, direction, service, airline = "", flightNumber, date, time, travellers, contact, email,
  perPassenger = "", total, reference = "", onChange = undefined,
}) {
  const arriving = direction !== "departure";
  const airport = (
    <div className={arriving ? "text-right" : ""}>
      <p className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.12em] text-[#f6c73a] leading-none">ACC</p>
      <p className="mt-1.5 text-xs text-white/70 whitespace-nowrap">Accra, Kotoka</p>
    </div>
  );
  const what = (
    <div className={`min-w-0 ${arriving ? "" : "text-right"}`}>
      <p className="text-xs text-white/70">{arriving ? "Arriving" : "Departing"}</p>
      <p className="serif text-lg sm:text-xl leading-tight mt-0.5">{service || "Your service"}</p>
    </div>
  );

  return (
    <div className="relative">
      {confirmed && (
        <div className="relative h-14 overflow-hidden" aria-hidden="true">
          <span className="absolute inset-x-6 bottom-1 border-t-2 border-dashed border-foreground/20" />
          <span className="takeoff absolute bottom-1.5 left-6 text-primary">
            <Plane className="w-8 h-8 rotate-45" fill="currentColor" />
          </span>
        </div>
      )}
      <article className={`overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_30px_60px_-34px_hsl(var(--foreground)/0.6)] ${confirmed ? "pass-stamp" : ""}`}>
        <header className="bg-[#0b1d36] px-6 pt-5 pb-6 text-white">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Airport Assist Ghana</span>
            <span>{confirmed ? "Booking confirmed" : "Check your details"}</span>
          </div>
          <div className="mt-5 flex items-end gap-4">
            {arriving ? what : airport}
            <div className="flex flex-1 items-center gap-2 pb-5 text-[#f6c73a]" aria-hidden="true">
              <span className="flex-1 border-t border-dashed border-white/35" />
              <Plane className="w-5 h-5 rotate-45 shrink-0" fill="currentColor" />
              <span className="flex-1 border-t border-dashed border-white/35" />
            </div>
            {arriving ? airport : what}
          </div>
        </header>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 px-6 pt-5 pb-4">
          <Field label="Flight" value={flightNumber} sub={airline} step={1} onChange={confirmed ? undefined : onChange} />
          <Field label="Date" value={longDate(date)} step={1} onChange={confirmed ? undefined : onChange} />
          <Field label="Time" value={time} step={1} onChange={confirmed ? undefined : onChange} />
          <Field label={travellers.length === 1 ? "Traveller" : `Travellers (${travellers.length})`} value={travellers.join(", ")} step={2} onChange={confirmed ? undefined : onChange} />
        </dl>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 px-6 pb-6">
          <Field label="Phone" value={contact} step={2} onChange={confirmed ? undefined : onChange} />
          <Field label="Email" value={email} step={2} onChange={confirmed ? undefined : onChange} />
        </dl>

        <div className="ticket-tear" aria-hidden="true" />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 bg-secondary/40 px-6 py-5">
          {confirmed ? (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Booking reference</p>
              <p className="font-mono text-2xl font-bold tracking-wider text-primary">{reference}</p>
              <div className="mt-2"><Barcode text={reference} /></div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">Per passenger</p>
              <p className="font-semibold tabular text-foreground">{perPassenger}</p>
            </div>
          )}
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Total, paid at the airport</p>
            <p className="text-3xl font-bold tabular text-foreground">{total}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
