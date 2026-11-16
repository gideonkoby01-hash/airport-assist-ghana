import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Minus, Plane, Plus, Users } from "lucide-react";
import { PACKAGE_DEFINITIONS, formatGHS } from "@/lib/packages";
import { bookingAddress, MAX_PREFILL_PASSENGERS } from "@/lib/bookingPrefill";
import { todayUtc } from "@/lib/bookingFormRules";
import { useHomeCta } from "@/components/home/useHomeCta";
import { delayStyle } from "@/components/home/Reveal";

// A working quick quote: choose a service, a date and how many people, see the price straight away, and carry
// those choices into the real booking form. Prices come from the same package list the booking form falls back to.
export default function HeroQuote() {
  const { bookingLink } = useHomeCta();
  const [code, setCode] = useState(PACKAGE_DEFINITIONS[0].code);
  const [date, setDate] = useState("");
  const [pax, setPax] = useState(1);
  const pkg = PACKAGE_DEFINITIONS.find((p) => p.code === code);
  const total = pkg.price * pax;
  const href = useMemo(() => bookingLink(bookingAddress({ package_code: code, date, pax })), [code, date, pax, bookingLink]);

  const field = "w-full h-12 rounded-lg border border-border bg-background px-3 text-[0.97rem] text-foreground outline-none transition-colors focus:border-gold";
  const label = "flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5";

  return (
    <form
      aria-label="Quick price"
      onSubmit={(e) => e.preventDefault()}
      className="hero-rise relative z-10 mx-auto -mt-14 sm:-mt-20 w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-[0_30px_60px_-30px_hsl(var(--foreground)/0.45)]"
      style={delayStyle(900)}
    >
      <div className="grid gap-4 md:grid-cols-12 items-end">
        <div className="md:col-span-4">
          <label htmlFor="q-service" className={label}><Plane className="w-4 h-4 text-gold" aria-hidden="true" /> Service</label>
          <select id="q-service" value={code} onChange={(e) => setCode(e.target.value)} className={field}>
            {PACKAGE_DEFINITIONS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label htmlFor="q-date" className={label}><CalendarDays className="w-4 h-4 text-gold" aria-hidden="true" /> Travel date</label>
          <input id="q-date" type="date" min={todayUtc()} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        <div className="md:col-span-2">
          <span id="q-pax-label" className={label}><Users className="w-4 h-4 text-gold" aria-hidden="true" /> Travellers</span>
          <div role="group" aria-labelledby="q-pax-label" className="flex items-center h-12 rounded-lg border border-border bg-background">
            <button type="button" aria-label="One fewer traveller" disabled={pax <= 1} onClick={() => setPax((n) => Math.max(1, n - 1))} className="press w-11 h-full grid place-items-center text-foreground disabled:opacity-30">
              <Minus className="w-4 h-4" />
            </button>
            <output aria-live="polite" className="tabular flex-1 text-center font-semibold text-foreground">{pax}</output>
            <button type="button" aria-label="One more traveller" disabled={pax >= MAX_PREFILL_PASSENGERS} onClick={() => setPax((n) => Math.min(MAX_PREFILL_PASSENGERS, n + 1))} className="press w-11 h-full grid place-items-center text-foreground disabled:opacity-30">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="md:col-span-3">
          <Link to={href} className="press flex h-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            Continue to booking
          </Link>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-foreground">
          <span className="text-muted-foreground">Your price: </span>
          <span className="tabular display text-[1.7rem] align-middle">{formatGHS(total)}</span>
          <span className="text-sm text-muted-foreground ml-2">{pax} × {formatGHS(pkg.price)} per passenger</span>
        </p>
        <p className="text-sm text-muted-foreground">You pay at the airport. Nothing is taken online.</p>
      </div>
    </form>
  );
}
