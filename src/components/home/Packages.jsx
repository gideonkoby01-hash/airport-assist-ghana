import React from "react";
import { Link } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";
import Reveal from "@/components/home/Reveal";

// Fixed public pricing per passenger. The booking flow reads live ServicePackage records; prices shown here are the
// advertised rates and match the canonical PACKAGE_DEFINITIONS in src/lib/packages.js.
const PACKAGES = [
  {
    code: "full_arrival",
    name: "Full Arrival Service",
    price: 700,
    description: "Met at the airbridge and taken through the airport to your transfer.",
    inclusions: ["Meet and greet at the airbridge", "Fast-track immigration", "Baggage assistance", "Ground transfer coordination"],
    lounge: true,
  },
  {
    code: "full_departure",
    name: "Full Departure Service",
    price: 850,
    description: "Met at the kerb, checked in, taken through security and into the lounge.",
    inclusions: ["Curbside meet and greet", "Check-in assistance", "Fast-track security and immigration", "Premium lounge access"],
    lounge: true,
  },
  {
    code: "departure_priority",
    name: "Departure Priority Only",
    price: 500,
    description: "The quick route to your gate, without the lounge.",
    inclusions: ["Check-in assistance", "Fast-track security and immigration"],
    lounge: false,
  },
  {
    code: "porter_only",
    name: "Porter Service Only",
    price: 100,
    description: "A porter for your luggage, and an escort to the checkpoints.",
    inclusions: ["Luggage handling across the terminal", "Porter escort to checkpoints"],
    lounge: false,
  },
];

export default function Packages() {
  const { bookDest } = useHomeCta();
  return (
    <section id="prices" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
      <Reveal className="grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground lg:col-span-6">Fixed prices, per passenger.</h2>
        <p className="lg:col-span-6 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[34rem]">
          What you see is what you pay. There are no extras added at the desk, and you can book any of these online.
        </p>
      </Reveal>

      {/* Each package is a boarding pass: the service on top, the price stub below the tear line. */}
      <ul className="mt-12 grid md:grid-cols-2 gap-6">
        {PACKAGES.map((p, i) => (
          <Reveal as="li" key={p.code} delay={(i % 2) * 90} className="list-none">
            <article className="ticket lift h-full flex flex-col rounded-[14px] border border-border bg-card">
              <div className="p-6 sm:p-7 flex-1">
                <h3 className="display text-[1.9rem] text-foreground">{p.name}</h3>
                <p className="mt-2 text-muted-foreground leading-snug">{p.description}</p>
                <ul className="mt-5 space-y-2 text-[0.95rem] text-foreground">
                  {p.inclusions.map((inc) => (
                    <li key={inc} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 mt-1 shrink-0 text-gold" aria-hidden="true" />
                      <span>{inc}</span>
                    </li>
                  ))}
                  {!p.lounge && (
                    <li className="flex items-start gap-2.5 text-muted-foreground">
                      <Minus className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" />
                      <span>Lounge access is not included</span>
                    </li>
                  )}
                </ul>
              </div>
              <div className="ticket-tear" aria-hidden="true" />
              <div className="p-6 sm:p-7 pt-5 flex items-center justify-between gap-4">
                <p className="tabular display text-[2.6rem] text-foreground">
                  <span className="text-base font-semibold text-muted-foreground mr-1.5 align-middle" style={{ fontStretch: "100%" }}>GHS</span>
                  {p.price}
                  <span className="block text-sm font-normal text-muted-foreground mt-1" style={{ fontStretch: "100%", letterSpacing: 0 }}>per passenger</span>
                </p>
                <Link to={bookDest} className="press px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold">
                  Book this
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        Lounge access depends on the package. Full Arrival and Full Departure include it; Departure Priority Only and Porter Service Only do not.
      </p>
    </section>
  );
}
