import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, MapPin } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";
import { bookingAddress } from "@/lib/bookingPrefill";
import Reveal from "@/components/home/Reveal";

// Fixed public pricing per passenger. The booking flow reads live ServicePackage records; prices shown here are the
// advertised rates and match the canonical PACKAGE_DEFINITIONS in src/lib/packages.js.
const PACKAGES = [
  {
    code: "full_arrival", kind: "arrival", tag: "ARR", name: "Full Arrival Service", price: 700,
    description: "Met at the airbridge and taken through the airport to your transfer.",
    inclusions: ["Meet and greet at the airbridge", "Fast-track immigration", "Baggage assistance", "Ground transfer coordination"],
    image: "/images/terminal-arrivals-hall.webp", position: "50% 45%", place: "Arrivals hall",
  },
  {
    code: "full_departure", kind: "departure", tag: "DEP", name: "Full Departure Service", price: 850,
    description: "Met at the kerb, checked in, taken through security and into the lounge.",
    inclusions: ["Curbside meet and greet", "Check-in assistance", "Fast-track security and immigration", "Premium lounge access"],
    image: "/images/terminal-departure-hall.webp", position: "50% 40%", place: "Departure hall",
  },
  {
    code: "departure_priority", kind: "departure", tag: "DEP", name: "Departure Priority Only", price: 500,
    description: "The quick route to your gate, without the lounge.",
    inclusions: ["Check-in assistance", "Fast-track security and immigration"],
    image: "/images/terminal-checkin-hall.webp", position: "50% 50%", place: "Check-in hall",
  },
  {
    code: "porter_only", kind: "porter", tag: "PTR", name: "Porter Service Only", price: 100,
    description: "A porter for your luggage, and an escort to the checkpoints.",
    inclusions: ["Luggage handling across the terminal", "Porter escort to checkpoints"],
    image: "/images/terminal-trolleys.webp", position: "50% 50%", place: "Luggage trolleys",
  },
];

const FILTERS = [["all", "All"], ["arrival", "Arrival"], ["departure", "Departure"], ["porter", "Porter"]];

export default function Packages() {
  const { bookingLink } = useHomeCta();
  const [filter, setFilter] = useState("all");
  const shown = PACKAGES.filter((p) => filter === "all" || p.kind === filter);

  return (
    <section id="prices" style={{ background: "var(--grad-soft)" }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-3 eyebrow" style={{ color: "hsl(var(--pink))" }}><span className="h-px w-8" style={{ background: "hsl(var(--pink))" }} aria-hidden="true" /> Choose your service</p>
            <h2 className="serif mt-4 text-[clamp(2.2rem,4.8vw,3.6rem)] leading-[1.05] text-foreground">
              Four services.<br /><span className="serif-i" style={{ color: "hsl(var(--violet))" }}>One Airport Assist standard.</span>
            </h2>
          </div>
          <p className="lg:col-span-5 text-[1.02rem] leading-relaxed text-muted-foreground">
            Fixed prices per passenger. What you see is what you pay, with no extras added at the desk. Pick a service to see what is included and book it online.
          </p>
        </Reveal>

        <div className="mt-9 flex flex-wrap gap-2" role="group" aria-label="Filter services">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`press px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${filter === key ? "bg-[hsl(var(--violet))] text-white border-transparent" : "bg-card text-foreground border-border hover:border-accent"}`}>
              {label}
            </button>
          ))}
        </div>

        <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {shown.map((p, i) => (
            <Reveal as="li" key={p.code} delay={i * 80} className="list-none">
              <article className="lift group h-full flex flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_10px_30px_-22px_hsl(var(--foreground)/0.5)]">
                <div className="relative h-40 overflow-hidden">
                  <img src={p.image} alt="" loading="lazy" width="960" height="480" style={{ objectPosition: p.position }}
                    className={`w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-[0.68rem] font-bold tracking-widest text-[hsl(var(--site-dark))]">{p.tag}</span>
                  <p className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[0.78rem] text-white"><MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {p.place}</p>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-foreground leading-snug">{p.name}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{p.description}</p>
                  <ul className="mt-4 space-y-1.5 text-[0.85rem] text-foreground">
                    {p.inclusions.map((inc) => (
                      <li key={inc} className="flex items-start gap-2"><Check className="w-3.5 h-3.5 mt-1 shrink-0 text-gold" aria-hidden="true" /><span>{inc}</span></li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-5 border-t border-border flex items-end justify-between gap-3">
                    <p>
                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Per passenger</span>
                      <span className="tabular text-[1.5rem] font-extrabold" style={{ color: "hsl(var(--pink))" }}>GHS {p.price}</span>
                    </p>
                    <Link to={bookingLink(bookingAddress({ package_code: p.code }))} className="press inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:underline underline-offset-4">
                      Book <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Lounge access depends on the package. Full Arrival and Full Departure include it; Departure Priority Only and Porter Service Only do not.
        </p>
      </div>
    </section>
  );
}
