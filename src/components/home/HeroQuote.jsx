import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, MapPin, Minus, Plane, Plus, Users } from "lucide-react";
import { PACKAGE_DEFINITIONS, formatGHS } from "@/lib/packages";
import { bookingAddress, MAX_PREFILL_PASSENGERS } from "@/lib/bookingPrefill";
import { todayUtc } from "@/lib/bookingFormRules";
import { useHomeCta } from "@/components/home/useHomeCta";
import { delayStyle } from "@/components/home/Reveal";

// A working quick quote: choose a service, a date and how many people, see the price straight away, and carry
// those choices into the real booking form. Prices come from the same package list the booking form falls back to.
export default function HeroQuote({ slide, index, total, controls }) {
  const { bookingLink } = useHomeCta();
  const [code, setCode] = useState(PACKAGE_DEFINITIONS[0].code);
  const [date, setDate] = useState("");
  const [pax, setPax] = useState(1);
  const pkg = PACKAGE_DEFINITIONS.find((p) => p.code === code);
  const total$ = pkg.price * pax;
  const href = useMemo(() => bookingLink(bookingAddress({ package_code: code, date, pax })), [code, date, pax, bookingLink]);

  const box = "rounded-[14px] border border-border bg-background px-3.5 py-2 transition-colors focus-within:border-accent";
  const cap = "flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
  const input = "w-full bg-transparent text-[1rem] font-medium text-foreground outline-none";

  return (
    <form
      aria-label="Quick price"
      onSubmit={(e) => e.preventDefault()}
      className="hero-rise relative z-10 mx-auto -mt-14 sm:-mt-24 w-[calc(100%-1.5rem)] sm:w-[calc(100%-4rem)] max-w-[88rem] overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_34px_70px_-34px_hsl(var(--foreground)/0.5)]"
      style={delayStyle(900)}
    >
      <div className="h-[3px]" style={{ background: "var(--grad-brand)" }} aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Airport Assist journey · {index + 1} of {total}</p>
          <p className="font-semibold text-foreground">{slide.title}</p>
        </div>
        <div className="flex items-center gap-3">
          {controls}
          <a href="#services" className="press hidden md:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[14px] text-[0.9rem] font-semibold text-[hsl(var(--site-dark))]" style={{ background: "var(--grad-gold)" }}>
            {slide.cta} <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="p-4 sm:p-5 grid gap-3 md:grid-cols-12">
        <label htmlFor="q-service" className={`${box} md:col-span-6 flex items-center gap-3`}>
          <span className="grid place-items-center w-10 h-10 rounded-full shrink-0 text-white" style={{ background: "var(--grad-brand)" }}><Plane className="w-4 h-4" aria-hidden="true" /></span>
          <span className="flex-1 min-w-0">
            <span className={cap}>Service</span>
            <select id="q-service" value={code} onChange={(e) => setCode(e.target.value)} className={`${input} cursor-pointer`}>
              {PACKAGE_DEFINITIONS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </span>
        </label>
        <div className={`${box} md:col-span-6 flex items-center gap-3`}>
          <MapPin className="w-4 h-4 text-gold shrink-0 ml-1" aria-hidden="true" />
          <div>
            <p className={cap}>Airport</p>
            <p className="font-medium text-foreground">Accra International Airport (ACC)</p>
          </div>
        </div>
        <label htmlFor="q-date" className={`${box} md:col-span-4`}>
          <span className={cap}><CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> Travel date</span>
          <input id="q-date" type="date" min={todayUtc()} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <div className={`${box} md:col-span-3`}>
          <span id="q-pax-label" className={cap}><Users className="w-3.5 h-3.5" aria-hidden="true" /> Travellers</span>
          <div role="group" aria-labelledby="q-pax-label" className="flex items-center justify-between">
            <button type="button" aria-label="One fewer traveller" disabled={pax <= 1} onClick={() => setPax((n) => Math.max(1, n - 1))} className="press w-8 h-8 grid place-items-center rounded-full text-foreground hover:bg-secondary disabled:opacity-30"><Minus className="w-4 h-4" /></button>
            <output aria-live="polite" className="tabular font-semibold text-foreground">{pax} {pax === 1 ? "traveller" : "travellers"}</output>
            <button type="button" aria-label="One more traveller" disabled={pax >= MAX_PREFILL_PASSENGERS} onClick={() => setPax((n) => Math.min(MAX_PREFILL_PASSENGERS, n + 1))} className="press w-8 h-8 grid place-items-center rounded-full text-foreground hover:bg-secondary disabled:opacity-30"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div className={`${box} md:col-span-2 flex flex-col justify-center`} aria-live="polite">
          <p className={cap}>Your price</p>
          <p className="tabular font-extrabold text-[1.25rem] leading-tight" style={{ color: "hsl(var(--pink))" }}>{formatGHS(total$)}</p>
        </div>
        <Link to={href} className="press md:col-span-3 flex items-center justify-center gap-2 rounded-[16px] bg-primary text-primary-foreground font-semibold min-h-[3.4rem]">
          Continue to booking <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="px-5 sm:px-6 pb-4 -mt-1 text-sm text-muted-foreground">
        {pax} × {formatGHS(pkg.price)} per passenger. You pay at the airport; nothing is taken online.
      </p>
    </form>
  );
}
