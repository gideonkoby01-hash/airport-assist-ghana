import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Luggage, MapPin, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";
import { bookingAddress } from "@/lib/bookingPrefill";
import Reveal from "@/components/home/Reveal";
import { CurrencyToggle, useMoney, useServiceList } from "@/lib/currency";
import { inclusionList } from "@/lib/bookingDraft";
import { isPorterService } from "@/lib/services";

// Fixed public pricing per passenger. The booking flow reads live ServicePackage records; prices shown here are the
// advertised rates and match the canonical PACKAGE_DEFINITIONS in src/lib/packages.js.
const PACKAGES = [
  {
    code: "full_arrival", kind: "arrival", tag: "ARR", name: "Full Arrival Service", price: 700,
    description: "Met at the airbridge and taken through the airport to your transfer.",
    inclusions: ["Meet and greet at the air-bridge", "Fast-track escort through security and immigration", "Luggage assistance", "Customs clearance support", "Ground transfer coordination"],
    image: "/images/card-akwaaba.webp", position: "50% 50%", place: "Arrivals welcome",
  },
  {
    code: "full_departure", kind: "departure", tag: "DEP", name: "Full Departure Service", price: 850,
    description: "Met at the kerb, checked in, taken through security and into the lounge.",
    inclusions: ["Curbside meet and greet", "Check-in assistance", "Fast-track escort through immigration and screening", "Lounge access"],
    image: "/images/card-lounge-welcome.webp", position: "50% 40%", place: "Executive lounge",
  },
  {
    code: "departure_priority", kind: "departure", tag: "DEP", name: "Departure Priority Only", price: 500,
    description: "The quick route to your gate, without the lounge.",
    inclusions: ["Curbside meet and greet", "Check-in assistance", "Fast-track escort through immigration and screening"],
    image: "/images/card-lounge-greeting.webp", position: "50% 50%", place: "Private greeting",
  },
  {
    code: "porter_only", kind: "porter", tag: "PTR", name: "Porter Service Only", price: 100,
    description: "A porter for your luggage, and an escort to the checkpoints.",
    inclusions: ["Luggage handling across the terminal", "Porter escort to checkpoints"],
    image: "/images/card-porter-trolley.webp", position: "50% 50%", place: "Porter at check-in",
  },
];

const FILTERS = [["all", "All"], ["arrival", "Arrival"], ["departure", "Departure"], ["porter", "Porter"]];

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const countWord = (n) => WORDS[n] || String(n);

const TAGS = { arrival: "ARR", departure: "DEP", porter: "PTR" };
const ICONS = { arrival: PlaneLanding, departure: PlaneTakeoff, porter: Luggage };

// The cards follow the services that are switched on (so a service an admin adds appears here, and one they switch off goes).
// The four original services keep their photo and wording, with the price from the service list; a new service is built from
// what the admin entered, with a plain branded header in place of a photo. Before the list loads, the four original cards show.
function buildCards(live) {
  if (!live.length) return PACKAGES;
  const fixed = PACKAGES.filter((c) => live.some((p) => p.code === c.code)).map((c) => ({ ...c, price: Number(live.find((p) => p.code === c.code).price) || c.price }));
  const added = live
    .filter((p) => !PACKAGES.some((c) => c.code === p.code))
    .sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")))
    .map((p) => {
      const kind = isPorterService(p) ? "porter" : p.flight_type === "departure" ? "departure" : "arrival";
      const items = inclusionList(p.inclusions);
      return {
        code: p.code, kind, tag: TAGS[kind], name: p.name, price: Number(p.price) || 0, lounge: Boolean(p.includes_lounge),
        description: p.description || (kind === "porter" ? "A porter to help with your luggage." : kind === "departure" ? "Help with your departure at Kotoka." : "Help with your arrival at Kotoka."),
        inclusions: items, image: null, place: null,
      };
    });
  return [...fixed, ...added];
}

export default function Packages() {
  const { formatFor } = useMoney();
  const { bookingLink } = useHomeCta();
  const [filter, setFilter] = useState("all");
  const { packages: live } = useServiceList();
  const cards = useMemo(() => buildCards(live), [live]);
  const shown = cards.filter((p) => filter === "all" || p.kind === filter);
  // Services an admin adds say on their own card what they include; if any include the lounge, the note below says so.
  const addedWithLounge = cards.filter((c) => !PACKAGES.some((o) => o.code === c.code) && c.lounge);

  return (
    <section id="prices" style={{ background: "var(--grad-soft)" }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-3 eyebrow" style={{ color: "hsl(var(--pink))" }}><span className="h-px w-8" style={{ background: "hsl(var(--pink))" }} aria-hidden="true" /> Choose your service</p>
            <h2 className="serif mt-4 text-[clamp(2.2rem,4.8vw,3.6rem)] leading-[1.05] text-foreground">
              {countWord(cards.length)} services.<br /><span className="serif-i" style={{ color: "hsl(var(--violet))" }}>One Airport Assist standard.</span>
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
          <CurrencyToggle className="ml-auto" />
        </div>

        <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {shown.map((p, i) => (
            <Reveal as="li" key={p.code} delay={i * 80} className="list-none">
              <article className="lift group h-full flex flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_10px_30px_-22px_hsl(var(--foreground)/0.5)]">
                <div className="relative h-40 overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" width="960" height="480" style={{ objectPosition: p.position }}
                      className={`w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]`} />
                  ) : (
                    <div className="w-full h-full grid place-items-center bg-[hsl(var(--site-dark))]" style={{ backgroundImage: "var(--grad-brand)" }} aria-hidden="true">
                      {React.createElement(ICONS[p.kind] || PlaneLanding, { className: "w-14 h-14 text-white/85", strokeWidth: 1.4 })}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-[0.68rem] font-bold tracking-widest text-[hsl(var(--site-dark))]">{p.tag}</span>
                  {p.place && <p className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[0.78rem] text-white"><MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {p.place}</p>}
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
                      <span className="tabular text-[1.5rem] font-extrabold" style={{ color: "hsl(var(--pink))" }}>{formatFor(p.code)(p.price)}</span>
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
          {addedWithLounge.length > 0 && ` ${addedWithLounge.map((c) => c.name).join(" and ")} ${addedWithLounge.length === 1 ? "includes" : "include"} it too.`}
        </p>
      </div>
    </section>
  );
}
